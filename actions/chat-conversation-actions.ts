"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { currentUser } from "@/lib/auth";
import { puedeBorrarEnChats } from "@/lib/mando-en-chats";
import { db } from "@/lib/db";
import { invalidatePersistedInboxCache } from "@/lib/chat-persistence";
import { chatPreferenceKey } from "@/lib/chat-preference-key";
import { getAssociatedAccountIds } from "@/lib/cuentas-asociadas";
import { unificarPorSufijoDeDispositivo } from "@/lib/sufijo-de-dispositivo-db";
// El nucleo de las marcas y el borrado del historial. Se saco a un
// `lib/*.server.ts` para que el obrero de fondo y el barrido diario puedan
// llamarlo: en un fichero `'use server'` todo lo exportado es un endpoint, y
// esto borra historial (ver la cabecera de ese fichero).
import {
  chatConversationPreferenceTable,
  deletedPreference,
  ensurePurgedAtColumn,
  hardDeleteLocalChat,
  identidadesDelContacto,
  mapPreference,
  marcarChatsComoBorrados,
  marcarEnBloque,
  normalizarLinea,
  normalizePreferenceRemoteJid,
  SinLineaParaBorrar,
} from "@/lib/borrado-de-chats.server";
import { lanzarLaPurgaDeFondo } from "@/lib/purga-de-chats.server";
import { elUniversoDelBorrado } from "@/lib/conversaciones-para-borrar.server";
import {
  comoTextoDelBorrado,
  TOPE_POR_VUELTA,
  type CuantasParaBorrar,
  type LoQueSeBorro,
} from "@/lib/borrado-de-chats";
import type {
  ChatConversationPreference,
  ChatConversationPreferenceMap,
} from "@/types/chat";


type ChatPreferenceResponse<T> = {
  success: boolean;
  message: string;
  data?: T;
};

const baseSchema = z.object({
  userId: z.string().trim().min(1),
  // La linea del chat. Opcional porque hay llamadas antiguas que no la mandan;
  // sin ella la marca se guarda como "de todas las lineas", igual que antes.
  instanceName: z.string().trim().optional(),
  remoteJid: z.string().trim().min(1),
  // Cuando escribio el contacto por ultima vez, segun la fila que se ve en
  // pantalla (en milisegundos). Solo lo manda quien levanta una marca.
  contactoEscribioEn: z.number().optional(),
  // Las identidades que la fila YA tiene en pantalla.
  //
  // Quien sabe cruzar un `@lid` con su numero es `chat_messages`... que el
  // primer borrado deja vacio. A partir del segundo, el servidor solo conoce la
  // forma con la que se pidio, asi que la marca se quedaba a medias y el chat
  // volvia con la otra. La lista SI las tiene todas -llegan en el propio chat-,
  // asi que las manda.
  //
  // Solo se usan para MARCAR. Lo que borra historial sigue yendo con las que
  // resuelve el servidor: una lista que llega de fuera no decide que filas se
  // borran.
  identidades: z.array(z.string().trim().min(1)).max(20).optional(),
});

const pinSchema = baseSchema.extend({
  isPinned: z.boolean(),
});

const archiveSchema = baseSchema.extend({
  archived: z.boolean(),
});


/**
 * La preferencia se guarda bajo la cuenta DUEÑA de la línea del chat, no bajo
 * la que se esté mirando: la bandeja enseña las líneas de todas las cuentas
 * asociadas, y si la marca cayera en la cuenta activa, al leerla bajo la dueña
 * no se aplicaría y el chat no desaparecería.
 *
 * Así que se acepta cualquiera de las cuentas asociadas —que se calculan aquí,
 * nunca con lo que mande el cliente— en vez de solo la activa.
 */
async function assertAuthorized(userId: string) {
  const user = await currentUser();
  if (!user?.id) {
    throw new Error("No autorizado.");
  }

  const allowed = await getAssociatedAccountIds(user);
  if (!allowed.includes(userId)) {
    throw new Error("No autorizado.");
  }
}

/**
 * Borrar pide lo MISMO que anclar y archivar, y una cosa mas.
 *
 * Esto llevaba su propia lista de casos —uno mismo, el administrador de la
 * cuenta, y una consulta a `linked_accounts` en las dos direcciones— y esa
 * lista no coincidia con la de `assertAuthorized`, que es la que usan anclar y
 * archivar. Resultado: el mismo chat se podia anclar y no se podia borrar. Se
 * pulsaba «Eliminar» y salia **«Solo el dueno o un administrador puede eliminar
 * chats»** en una cuenta donde se llevaba todo el dia trabajando.
 *
 * Los dos casos que se caian:
 *
 * - **El administrador de una cuenta, sobre una linea de otra cuenta asociada.**
 *   La bandeja las ensena juntas (`allSessionUserIds`), pero la condicion pedia
 *   que la linea fuera de SU cuenta exactamente, y las lineas de la cuenta
 *   hermana no lo son.
 * - **El dueno cuya fila trae `ownerId` puesto.** La primera condicion era
 *   `user.id === userId && !user.ownerId`, y al entrar por una cuenta vinculada
 *   `ownerId` viene relleno, asi que ni siendo el dueno pasaba.
 *
 * La puerta es la misma que la de anclar y archivar —las cuentas asociadas, que
 * se calculan aqui y nunca con lo que mande el cliente— y encima de eso una
 * condicion propia, porque borrar no es anclar: **un `agente` no borra.** Es el
 * mismo reparto de `canManageWorkspace`: participa, pero no manda.
 */
async function assertCanDeleteChats(userId: string) {
  const user = await currentUser();
  if (!user?.id) {
    throw new Error("No autorizado.");
  }

  await assertAuthorized(userId);

  // Quien manda dentro del equipo: el dueno y su administrador. Vive en
  // `lib/mando-en-chats.ts` porque el borrado de MENSAJES pregunta lo mismo, y
  // preguntarlo cada uno por su cuenta es lo que dejo esa otra puerta cerrada
  // para un administrador.
  if (!puedeBorrarEnChats(user)) {
    throw new Error("Solo el dueño o un administrador puede eliminar chats.");
  }
}


/**
 * La marca va bajo TODAS las identidades del contacto, no solo bajo la que se
 * pidio.
 *
 * Es la regla que ya rige el borrado, y al anclado se le habia pasado: se
 * anclaba un chat estando la fila bajo su `@lid`, se desanclaba mas tarde con
 * la fila bajo su numero —la lista lo trae por la identidad que devuelva el
 * proveedor esa vuelta, que no tiene por que ser la misma—, y el `pinnedAt` de
 * la primera seguia puesto. Desde fuera: **se desancla y vuelve a aparecer
 * anclado**, una y otra vez.
 *
 * La identidad pedida va primero, porque es la que se le devuelve a la pantalla.
 * La cache y el `revalidatePath` se tocan UNA vez al final y no por identidad.
 */
async function upsertPreferenceEnTodasLasIdentidades(
  userId: string,
  instanceName: string | null | undefined,
  remoteJid: string,
  data: {
    pinnedAt?: Date | null;
    archivedAt?: Date | null;
    deletedAt?: Date | null;
    purgedAt?: Date | null;
  },
  identidadesDeLaFila: string[] = [],
): Promise<ChatConversationPreference> {
  await ensurePurgedAtColumn();
  const linea = normalizarLinea(instanceName);
  const normalizedRemoteJid = normalizePreferenceRemoteJid(remoteJid);
  const identidades = await identidadesDelContacto(
    userId,
    linea,
    normalizedRemoteJid,
    identidadesDeLaFila,
  );

  let primera: ChatConversationPreference | null = null;
  for (const jid of identidades) {
    const fila = await chatConversationPreferenceTable.upsert({
      where: {
        userId_instanceName_remoteJid: {
          userId,
          instanceName: linea,
          remoteJid: normalizePreferenceRemoteJid(jid),
        },
      },
      update: data,
      create: {
        userId,
        instanceName: linea,
        remoteJid: normalizePreferenceRemoteJid(jid),
        pinnedAt: data.pinnedAt ?? null,
        archivedAt: data.archivedAt ?? null,
        deletedAt: data.deletedAt ?? null,
        purgedAt: data.purgedAt ?? null,
      },
    });
    if (!primera) primera = mapPreference(fila);
  }

  invalidatePersistedInboxCache();
  revalidatePath("/chats");

  // Sin identidades no hay nada que cruzar: se guarda bajo la pedida, como antes.
  return primera ?? (await upsertPreference(userId, instanceName, normalizedRemoteJid, data));
}

async function upsertPreference(
  userId: string,
  instanceName: string | null | undefined,
  remoteJid: string,
  data: {
    pinnedAt?: Date | null;
    archivedAt?: Date | null;
    deletedAt?: Date | null;
    purgedAt?: Date | null;
  },
): Promise<ChatConversationPreference> {
  await ensurePurgedAtColumn();
  const normalizedRemoteJid = normalizePreferenceRemoteJid(remoteJid);
  const linea = normalizarLinea(instanceName);

  const preference = await chatConversationPreferenceTable.upsert({
    where: {
      // Por LINEA: la marca de una no toca a las demas.
      userId_instanceName_remoteJid: {
        userId,
        instanceName: linea,
        remoteJid: normalizedRemoteJid,
      },
    },
    update: data,
    create: {
      userId,
      instanceName: linea,
      remoteJid: normalizedRemoteJid,
      pinnedAt: data.pinnedAt ?? null,
      archivedAt: data.archivedAt ?? null,
      deletedAt: data.deletedAt ?? null,
      purgedAt: data.purgedAt ?? null,
    },
  });

  invalidatePersistedInboxCache();

  revalidatePath("/chats");

  return mapPreference(preference);
}


/**
 * Preferencias de todas las cuentas asociadas, indexadas por `cuenta::número`.
 *
 * La bandeja lee los chats de todas las cuentas asociadas; las preferencias
 * tienen que acompañar ese alcance o lo borrado desde otra cuenta reaparece y
 * vuelve a sumar en el contador de su línea. Y van con la cuenta en la clave
 * para que la marca se aplique SOLO a los chats de esa línea.
 */
/**
 * Levanta la marca de borrado de los chats cuyo contacto escribio DESPUES de
 * borrarlos.
 *
 * La regla escrita siempre fue "un chat borrado vuelve si el cliente escribe".
 * El navegador la aplicaba mirando SOLO el ultimo mensaje de la fila
 * (`isChatDeletedByPreference`): si era del contacto y posterior a la marca, el
 * chat se veia. Pero la IA contesta en unos segundos, y entonces el ultimo
 * mensaje ya no es del contacto: la fila salia y **desaparecia en cuanto la IA
 * respondia**. Se vio en produccion con una linea Waha el 2026-09-06: el chat
 * entraba, y a los pocos segundos ya no estaba. Con cualquier linea que tenga
 * la IA activa pasa lo mismo.
 *
 * Aqui se mira la fuente completa, `chat_messages`, que guarda cada mensaje con
 * `fromMe` y con todas sus identidades: si hay UN mensaje del contacto posterior
 * a la marca, la marca sobra y se quita de la base. Tres EXISTS separados -uno
 * por columna de identidad- para que cada uno use su indice; un OR sobre las
 * tres columnas en un solo JOIN recorria la tabla entera.
 *
 * Nunca rompe la carga de preferencias: si falla, se anota y se sigue.
 *
 * ## Y si la fila NO existe, no pasa nada: el chat entra como nuevo
 *
 * Desde que el borrado de una linea Waha, Meta o Telegram borra la fila en vez
 * de marcarla (ver `hardDeleteLocalChat`), lo normal es que aqui no haya nada
 * que levantar. Eso no es un caso de error: es un `UPDATE ... FROM` sobre un
 * CTE que sale vacio, asi que no toca ninguna fila, devuelve la lista vacia y
 * no avisa de nada. Y sin fila no hay marca, asi que si el contacto vuelve a
 * escribir su conversacion aparece sola, como cualquier otra nueva. Esta
 * consulta solo tiene trabajo con las lineas de Evolution, que son las que
 * siguen guardando marca porque alli el chat sigue vivo en el telefono.
 */
/**
 * Cada cuanto se barren TODAS las marcas de una cuenta, por proceso.
 *
 * Esto corria en CADA carga de Chats, de cada asesor y de cada pestaña, y era
 * lo mas caro del arranque: 1.111 ms de los 1.317 que tardaban las siete
 * consultas juntas -las otras seis acaban por debajo de 60 ms-. Y para 314
 * filas, porque lo que cuesta no son las marcas: son los tres `EXISTS` contra
 * `chat_messages`, que es la tabla mas grande, por cada marca borrada.
 *
 * Se espacia porque **no es el camino vivo**. Cuando el contacto escribe, la
 * marca la levanta el navegador: en memoria al momento, y en la base con
 * `levantarMarcaDeBorradoAction`, chat por chat. Esto de aqui es la red de
 * seguridad para lo que aquel no vio -otra pestaña, otro asesor, un mensaje que
 * entro con la App cerrada-, y una red de seguridad no tiene que correr cada
 * vez que alguien abre la pantalla.
 *
 * Es el mismo trato que ya tenia `crearFichasQueFaltan`, por el mismo motivo.
 */
const BARRER_MARCAS_CADA_MS = 5 * 60 * 1000;
const ultimoBarridoDeMarcas = new Map<string, number>();

async function levantarMarcasSiElContactoEscribio(userIds: string[]): Promise<void> {
  if (!userIds.length) return;
  // Por cuenta: que una tenga mucho movimiento no puede dejar a las demas sin
  // barrer, ni al reves.
  const ahora = Date.now();
  const llave = userIds.slice().sort().join("|");
  if (ahora - (ultimoBarridoDeMarcas.get(llave) ?? 0) < BARRER_MARCAS_CADA_MS) return;
  ultimoBarridoDeMarcas.set(llave, ahora);
  try {
    const revividas = await db.$queryRaw<
      Array<{ userId: string; instanceName: string; remoteJid: string }>
    >`
      WITH revividas AS (
        SELECT p."id"
        FROM "ChatConversationPreference" p
        WHERE p."userId" IN (${Prisma.join(userIds)})
          AND p."deletedAt" IS NOT NULL
          AND (
            EXISTS (
              SELECT 1 FROM "chat_messages" m
              WHERE m."userId" = p."userId" AND m."remoteJid" = p."remoteJid"
                AND m."fromMe" = FALSE AND m."messageTimestamp" > p."deletedAt"
                AND (p."instanceName" = '' OR m."instanceName" = p."instanceName")
            )
            OR EXISTS (
              SELECT 1 FROM "chat_messages" m
              WHERE m."userId" = p."userId" AND m."remoteJidAlt" = p."remoteJid"
                AND m."fromMe" = FALSE AND m."messageTimestamp" > p."deletedAt"
                AND (p."instanceName" = '' OR m."instanceName" = p."instanceName")
            )
            OR EXISTS (
              SELECT 1 FROM "chat_messages" m
              WHERE m."userId" = p."userId" AND m."senderPn" = p."remoteJid"
                AND m."fromMe" = FALSE AND m."messageTimestamp" > p."deletedAt"
                AND (p."instanceName" = '' OR m."instanceName" = p."instanceName")
            )
          )
      )
      UPDATE "ChatConversationPreference" p
      SET "deletedAt" = NULL, "purgedAt" = NULL, "updatedAt" = NOW()
      FROM revividas r
      WHERE p."id" = r."id"
      RETURNING p."userId", p."instanceName", p."remoteJid"
    `;
    if (revividas.length) {
      console.warn("[chats] marcas de borrado levantadas: el contacto escribio despues de borrarlo", {
        cuantas: revividas.length,
        chats: revividas.slice(0, 10).map((r) => `${r.instanceName || "*"}::${r.remoteJid}`),
      });
    }
  } catch (error) {
    console.error("[chats] no se pudieron levantar las marcas de borrado", error);
  }
}

/**
 * Cada cuánto se revisa que no falte ninguna ficha, por cuenta y por proceso.
 * Es una consulta acotada, pero la bandeja se abre muchas veces al día.
 */
const REVISAR_FICHAS_CADA_MS = 5 * 60 * 1000;
const DIAS_DE_FICHAS_A_REVISAR = 7;
const ultimaRevisionDeFichas = new Map<string, number>();

/**
 * Crea la ficha del CRM de las conversaciones que se quedaron sin ella.
 *
 * La ficha (`Session`) es de donde cuelga TODO lo que se ve en la cabecera del
 * chat: el número, el lápiz para renombrar, asignar asesor, etiquetas, tareas y
 * recordatorios. Sin ella la conversación se abre pelada, y desde fuera parece
 * que la App no deja hacer nada.
 *
 * Con Evolution nunca faltaba porque la App le pedía los mensajes cada pocos
 * segundos y, al guardarlos, creaba la ficha de camino
 * (`upsertSessionFromChatMessage`). Con WhatsApp Mensajería (Waha) no hay tal
 * sondeo: todo entra por el webhook del backend, que con el Robot apagado no la
 * creaba. Eso ya está arreglado allí, pero **solo para lo que llega a partir de
 * ahora**: las conversaciones que entraron antes se quedaban sin ficha para
 * siempre, a menos que el contacto volviera a escribir. Esto las completa.
 *
 * Se hace con UNA consulta, acotada a los últimos días y espaciada en el tiempo:
 * la bandeja se abre constantemente y esto no puede pesar en cada carga.
 *
 * `Session.instanceId` guarda el NOMBRE de la línea, no su id: es así en los dos
 * lados (`upsertSessionFromChatMessage` aquí, `registerSession` en el backend).
 *
 * Nunca rompe la carga de la bandeja: si falla, se anota y se sigue.
 */
async function crearFichasQueFaltan(userIds: string[]): Promise<void> {
  if (!userIds.length) return;
  const llave = [...userIds].sort().join(",");
  const ahora = Date.now();
  if (ahora - (ultimaRevisionDeFichas.get(llave) ?? 0) < REVISAR_FICHAS_CADA_MS) return;
  ultimaRevisionDeFichas.set(llave, ahora);

  const desde = new Date(ahora - DIAS_DE_FICHAS_A_REVISAR * 24 * 60 * 60 * 1000);

  // Primero se junta lo que el sufijo de dispositivo partió en dos.
  //
  // "573233246305:39@s.whatsapp.net" y "573233246305@s.whatsapp.net" son el
  // MISMO contacto escribiendo desde dos aparatos, así que hoy tiene dos
  // conversaciones y dos fichas: el cliente duplicado que se ve en Chats. Se
  // unifican -los mensajes de las dos quedan en la conversación que sobrevive-
  // antes de crear las fichas que faltan, para no crear la de una conversación
  // que está a punto de fundirse con otra.
  await unificarPorSufijoDeDispositivo(userIds);

  try {
    const creadas = await db.$queryRaw<Array<{ remoteJid: string; instanceName: string }>>`
      INSERT INTO "Session" (
        "userId", "remoteJid", "remoteJidAlt", "pushName", "instanceId",
        "status", "createdAt", "updatedAt"
      )
      SELECT duena."userId",
             c."canonico",
             NULLIF(c."alterno", c."canonico"),
             COALESCE(NULLIF(BTRIM(c."pushName"), ''), c."canonico"),
             c."instanceName",
             TRUE, NOW(), NOW()
      FROM (
        SELECT v."userId", v."instanceName", v."pushName", v."lastMessageTimestamp",
               -- Sin el sufijo de dispositivo: WhatsApp numera el aparato desde el
               -- que se escribe (573001:39@s.whatsapp.net) y ese ":39" NO es parte
               -- del numero. Una ficha con el sufijo es un lead duplicado del
               -- mismo contacto. El backend hace lo mismo con sinSufijoDeDispositivo.
               COALESCE(
                 (SELECT regexp_replace(j, ':[0-9]+@', '@')
                    FROM (VALUES (v."remoteJid"), (v."remoteJidAlt"), (v."senderPn")) AS t(j)
                   WHERE j LIKE '%@s.whatsapp.net' LIMIT 1),
                 regexp_replace(v."remoteJid", ':[0-9]+@', '@')
               ) AS "canonico",
               COALESCE(
                 (SELECT j FROM (VALUES (v."remoteJid"), (v."remoteJidAlt"), (v."senderPn")) AS t(j)
                   WHERE j LIKE '%@lid' LIMIT 1),
                 regexp_replace(COALESCE(v."remoteJidAlt", ''), ':[0-9]+@', '@')
               ) AS "alterno",
               ARRAY(
                 SELECT regexp_replace(j, ':[0-9]+@', '@')
                   FROM (VALUES (v."remoteJid"), (v."remoteJidAlt"), (v."senderPn")) AS t(j)
                  WHERE j IS NOT NULL AND j <> ''
               ) AS "identidades"
        FROM "chat_conversations" v
      ) c
      -- La ficha es del DUEÑO DE LA LÍNEA, nunca de quien la está mirando.
      --
      -- chat_conversations es el cache de la bandeja y se guarda bajo el userId
      -- de QUIEN MIRA: en la bandeja unificada un administrador ve las líneas de
      -- las cuentas asociadas, y esa fila queda a su nombre. Eso está bien para
      -- el cache -lo dice upsertSessionFromChatMessage, que por eso resuelve el
      -- dueño antes de tocar Session- pero aquí se insertaba con el userId de la
      -- conversación tal cual, así que CADA CUENTA QUE ABRÍA LA BANDEJA SE
      -- LLEVABA UNA COPIA DEL LEAD. Desde fuera: leads en una cuenta que no
      -- tiene ninguna línea creada, que volvían solos unos minutos después de
      -- borrarlos, porque esto se vuelve a ejecutar al abrir la bandeja.
      --
      -- Con el JOIN, una conversación cuya línea no se puede resolver no crea
      -- ficha: sin dueño no hay lead. Es preferible que falte a que aparezca en
      -- la cuenta equivocada.
      JOIN LATERAL (
        SELECT i."userId"
        FROM "Instancias" i
        WHERE i."instanceName" = c."instanceName"
        ORDER BY i.id
        LIMIT 1
      ) duena ON TRUE
      WHERE c."userId" IN (${Prisma.join(userIds)})
        AND c."lastMessageTimestamp" > ${desde}
        AND c."canonico" NOT LIKE '%@g.us'
        AND c."canonico" <> 'status@broadcast'
        AND NOT EXISTS (
          SELECT 1 FROM "Session" s
          WHERE s."userId" = duena."userId"
            AND s."instanceId" = c."instanceName"
            AND (
              regexp_replace(s."remoteJid", ':[0-9]+@', '@') = ANY (c."identidades")
              OR regexp_replace(COALESCE(s."remoteJidAlt", ''), ':[0-9]+@', '@') = ANY (c."identidades")
            )
        )
      ON CONFLICT ("userId", "instanceId", "remoteJid") DO NOTHING
      RETURNING "remoteJid", "instanceId" AS "instanceName"
    `;
    if (creadas.length > 0) {
      // Sale a proposito: si un dia vuelven a faltar fichas en masa, este numero
      // es la primera pista de que algo dejo de crearlas al recibir.
      console.warn("[chats] fichas del CRM creadas para conversaciones que no la tenian", {
        cuantas: creadas.length,
        ejemplo: creadas.slice(0, 3),
      });
    }
  } catch (error) {
    console.warn("[chats] no se pudieron completar las fichas que faltaban", {
      error: String(error),
    });
  }
}

export async function getChatConversationPreferencesForAssociatedAccounts(): Promise<
  ChatPreferenceResponse<ChatConversationPreferenceMap>
> {
  try {
    const user = await currentUser();
    if (!user?.id) throw new Error("No autorizado.");

    // Los cuatro pasos, cronometrados. `marcasDeBorrado` salia como un solo
    // numero -1.111 ms- y dentro hay cuatro cosas distintas: sin esto, decidir
    // cual adelgazar es a ojo.
    const tiempos: Record<string, number> = {};
    const medir = async <T,>(nombre: string, trabajo: () => Promise<T>): Promise<T> => {
      const t0 = Date.now();
      try {
        return await trabajo();
      } finally {
        tiempos[nombre] = Date.now() - t0;
      }
    };

    await medir("columna", () => ensurePurgedAtColumn());
    const userIds = await getAssociatedAccountIds(user);
    await medir("levantarMarcas", () => levantarMarcasSiElContactoEscribio(userIds));
    await medir("fichasQueFaltan", () => crearFichasQueFaltan(userIds));
    const preferences = await medir("leerLasMarcas", () => chatConversationPreferenceTable.findMany({
      where: { userId: { in: userIds } },
      select: {
        userId: true,
        instanceName: true,
        remoteJid: true,
        pinnedAt: true,
        archivedAt: true,
        deletedAt: true,
        purgedAt: true,
        updatedAt: true,
      },
    }));

    // Solo cuando duele. Por debajo de esto es ruido en cada carga de Chats.
    const total = Object.values(tiempos).reduce((a, b) => a + b, 0);
    if (total > 400) {
      console.warn("[chats] las marcas de borrado van caras", {
        ...tiempos,
        total,
        filas: preferences.length,
      });
    }

    const data = preferences.reduce<ChatConversationPreferenceMap>((acc, item) => {
      if (!item.userId) return acc;
      acc[chatPreferenceKey(item.userId, item.instanceName ?? '', item.remoteJid)] = mapPreference(item);
      return acc;
    }, {});

    return {
      success: true,
      message: "Preferencias de chats obtenidas correctamente.",
      data,
    };
  } catch (error) {
    console.error("[getChatConversationPreferencesForAssociatedAccounts]", error);
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "No se pudieron cargar las preferencias de chats.",
    };
  }
}

export async function toggleChatPinAction(
  input: z.infer<typeof pinSchema>,
): Promise<ChatPreferenceResponse<ChatConversationPreference>> {
  try {
    const parsed = pinSchema.parse(input);
    await assertAuthorized(parsed.userId);

    const data = await upsertPreferenceEnTodasLasIdentidades(
      parsed.userId,
      parsed.instanceName,
      parsed.remoteJid,
      { pinnedAt: parsed.isPinned ? new Date() : null },
      parsed.identidades ?? [],
    );

    return {
      success: true,
      message: parsed.isPinned ? "Chat anclado correctamente." : "Chat desanclado correctamente.",
      data,
    };
  } catch (error) {
    console.error("[toggleChatPinAction]", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "No se pudo actualizar el anclado del chat.",
    };
  }
}

export async function setChatArchivedAction(
  input: z.infer<typeof archiveSchema>,
): Promise<ChatPreferenceResponse<ChatConversationPreference>> {
  try {
    const parsed = archiveSchema.parse(input);
    await assertAuthorized(parsed.userId);

    // Bajo TODAS las identidades, igual que anclar y borrar. Archivar se habia
    // quedado escribiendo bajo una sola: se archivaba con la fila bajo su `@lid`
    // y al desarchivarla con la fila bajo su numero quedaba la otra puesta.
    const data = await upsertPreferenceEnTodasLasIdentidades(
      parsed.userId,
      parsed.instanceName,
      parsed.remoteJid,
      {
        archivedAt: parsed.archived ? new Date() : null,
        deletedAt: null,
        purgedAt: null,
      },
      parsed.identidades ?? [],
    );

    return {
      success: true,
      message: parsed.archived ? "Chat archivado correctamente." : "Chat restaurado correctamente.",
      data,
    };
  } catch (error) {
    console.error("[setChatArchivedAction]", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "No se pudo actualizar el estado archivado del chat.",
    };
  }
}

export async function deleteChatConversationAction(
  input: z.infer<typeof baseSchema>,
): Promise<ChatPreferenceResponse<ChatConversationPreference>> {
  try {
    const parsed = baseSchema.parse(input);
    await assertCanDeleteChats(parsed.userId);
    const data = await hardDeleteLocalChat(
      parsed.userId,
      parsed.instanceName,
      parsed.remoteJid,
      parsed.identidades ?? [],
    );

    // El `revalidatePath` salio de `hardDeleteLocalChat` —desde el obrero de
    // fondo no hay peticion de Next y revienta—, asi que lo hace quien si esta
    // dentro de una: la accion.
    revalidatePath("/chats");

    return {
      success: true,
      message: "Chat eliminado correctamente.",
      data,
    };
  } catch (error) {
    console.error("[deleteChatConversationAction]", error);
    // `SinLineaParaBorrar` no es un fallo: es que no se sabe de que linea es el
    // chat y por eso NO se borro nada. Su propio mensaje ya lo explica y dice
    // que hacer, asi que se devuelve tal cual.
    return {
      success: false,
      message: error instanceof Error ? error.message : "No se pudo eliminar el chat.",
    };
  }
}

/**
 * Levanta la marca de borrado de un chat porque el contacto volvio a escribir.
 *
 * La regla -un chat borrado vuelve si el cliente escribe- se aplicaba en dos
 * sitios y ninguno bastaba solo:
 *
 * - En el navegador, en memoria. Se veia bien... hasta recargar: nadie se lo
 *   decia a la base, asi que la marca seguia ahi y el chat volvia a esconderse.
 * - En el servidor, `levantarMarcasSiElContactoEscribio`, que busca en
 *   `chat_messages` un mensaje del contacto posterior a la marca. Eso solo
 *   encuentra la fila cuando la identidad de la marca aparece TAL CUAL en una
 *   de las tres columnas del mensaje. Si el chat se borro por su `@lid` y los
 *   mensajes se guardan bajo el numero -o al reves, o bajo otra cuenta de las
 *   asociadas, o con otro nombre de linea-, esa marca no se cruza con nada y
 *   se queda puesta para siempre. Desde fuera: el contacto escribe, contestas,
 *   y el chat desaparece de la lista otra vez; vuelve un momento cada vez que
 *   le escribes y se esconde al siguiente refresco.
 *
 * Esto cierra el circulo: quien YA sabe que el contacto escribio es la
 * pantalla -tiene la fila, su ultimo mensaje y TODAS sus identidades-, asi que
 * lo dice y aqui se quita la marca de todas ellas.
 *
 * Se quita tambien la fila ANTIGUA, la que no lleva linea: la pantalla la lee
 * cuando no hay ninguna de su linea (`elegirPreferenciaDelChat`), asi que
 * dejarla con la marca puesta seguiria escondiendo el chat.
 *
 * Solo UPDATE, nunca crea filas: lo que no existe no tiene marca que levantar.
 */
/**
 * Quita la marca de borrado de un contacto: de TODAS sus identidades y de sus
 * DOS llaves -la de su linea y la antigua sin linea, que la pantalla lee de
 * respaldo-. Devuelve cuantas filas se destaparon.
 *
 * Solo UPDATE: lo que no existe no tiene marca que quitar.
 */
async function quitarMarcaDeBorrado(
  userId: string,
  instanceName: string | null | undefined,
  remoteJid: string,
  identidadesDeLaFila: string[] = [],
): Promise<number> {
  await ensurePurgedAtColumn();
  const linea = normalizarLinea(instanceName);
  const normalizedRemoteJid = normalizePreferenceRemoteJid(remoteJid);
  const identidades = (
    await identidadesDelContacto(userId, linea, normalizedRemoteJid, identidadesDeLaFila)
  ).map(normalizePreferenceRemoteJid);

  const { count } = await chatConversationPreferenceTable.updateMany({
    where: {
      userId,
      remoteJid: { in: identidades },
      ...(linea ? { instanceName: { in: [linea, ""] } } : {}),
      deletedAt: { not: null },
    },
    data: { deletedAt: null, purgedAt: null },
  });

  if (count > 0) {
    invalidatePersistedInboxCache();
    revalidatePath("/chats");
  }
  return count;
}

export async function levantarMarcaDeBorradoAction(
  input: z.infer<typeof baseSchema>,
): Promise<ChatPreferenceResponse<{ levantadas: number }>> {
  try {
    const parsed = baseSchema.parse(input);
    await assertAuthorized(parsed.userId);
    await ensurePurgedAtColumn();

    const linea = normalizarLinea(parsed.instanceName);
    const normalizedRemoteJid = normalizePreferenceRemoteJid(parsed.remoteJid);
    const identidades = (
      await identidadesDelContacto(parsed.userId, linea, normalizedRemoteJid, parsed.identidades ?? [])
    ).map(normalizePreferenceRemoteJid);

    // Cuando se borro por ultima vez. Si se borro otra vez despues de que el
    // contacto escribiera, manda el borrado nuevo: se compara con el mas
    // reciente de sus filas.
    const marcadas = await chatConversationPreferenceTable.findMany({
      where: {
        userId: parsed.userId,
        remoteJid: { in: identidades },
        ...(linea ? { instanceName: { in: [linea, ""] } } : {}),
        deletedAt: { not: null },
      },
      select: { deletedAt: true },
      orderBy: { deletedAt: "desc" },
      take: 1,
    });
    const borradoEl = marcadas[0]?.deletedAt;
    if (!borradoEl) {
      return { success: true, message: "No habia marca que levantar.", data: { levantadas: 0 } };
    }

    // Quien decide es la BASE, no la pantalla: hace falta un mensaje DEL
    // CONTACTO posterior al borrado. Lo que pone la pantalla son las
    // identidades -que es lo que el servidor no sabe cruzar solo- y el aviso de
    // que ahi hubo movimiento.
    // La prueba que trae la pantalla: la fila tiene un mensaje DEL CONTACTO
    // posterior al borrado. Viene del mismo sitio que todo lo demas -nuestra
    // bandeja-, asi que vale tanto como la consulta de abajo, y llega donde
    // esta no alcanza: `chat_messages` guarda cada mensaje bajo la identidad
    // con la que llego, y el borrado deja la tabla vacia, asi que del segundo
    // borrado en adelante puede no haber ni una fila que cruzar.
    const pruebaDeLaPantalla =
      typeof input.contactoEscribioEn === "number" &&
      Number.isFinite(input.contactoEscribioEn) &&
      input.contactoEscribioEn > borradoEl.getTime();

    const escribioElContacto = await db.chatMessage.findFirst({
      where: {
        userId: parsed.userId,
        ...(linea ? { instanceName: linea } : {}),
        fromMe: false,
        messageTimestamp: { gt: borradoEl },
        OR: [
          { remoteJid: { in: identidades } },
          { remoteJidAlt: { in: identidades } },
          { senderPn: { in: identidades } },
        ],
      },
      select: { id: true },
    });
    if (!escribioElContacto && !pruebaDeLaPantalla) {
      // Esto NO puede ser mudo: desde fuera se ve como un chat que reaparece y
      // se vuelve a esconder solo, que es lo mas dificil de diagnosticar.
      console.warn("[chats] la marca de borrado se queda: no consta que el contacto haya escrito", {
        linea: linea || "*",
        pedidoComo: parsed.remoteJid,
        borradoEl: borradoEl.toISOString(),
        identidades: identidades.length,
      });
      return { success: true, message: "El contacto no ha escrito.", data: { levantadas: 0 } };
    }

    const count = await quitarMarcaDeBorrado(
      parsed.userId,
      parsed.instanceName,
      parsed.remoteJid,
      identidades,
    );

    if (count > 0) {
      console.warn("[chats] marca de borrado levantada en la base: el contacto escribio", {
        linea: linea || "*",
        pedidoComo: parsed.remoteJid,
        borradoEl: borradoEl.toISOString(),
        filas: count,
      });
    }

    return { success: true, message: "Marca de borrado levantada.", data: { levantadas: count } };
  } catch (error) {
    console.error("[levantarMarcaDeBorradoAction]", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "No se pudo levantar la marca de borrado.",
    };
  }
}

/**
 * Escribirle a un chat eliminado lo devuelve a la lista.
 *
 * La regla es "eliminado se queda eliminado, y vuelve si hay conversacion
 * nueva". Conversacion nueva son las dos direcciones: que escriba el contacto
 * -de eso se ocupa `levantarMarcaDeBorradoAction`, que lo comprueba en la
 * base- o que le escribas tu, que es este caso y no necesita comprobar nada:
 * abrir un chat borrado y escribirle es decir que vuelve.
 *
 * No hay pestana de Eliminados ni boton de restaurar: esto es lo unico que los
 * devuelve, y por eso tiene que funcionar sin condiciones raras.
 */
export async function devolverChatAlEscribirAction(
  input: z.infer<typeof baseSchema>,
): Promise<ChatPreferenceResponse<{ levantadas: number }>> {
  try {
    const parsed = baseSchema.parse(input);
    await assertAuthorized(parsed.userId);

    const count = await quitarMarcaDeBorrado(
      parsed.userId,
      parsed.instanceName,
      parsed.remoteJid,
      parsed.identidades ?? [],
    );
    if (count > 0) {
      console.warn("[chats] chat eliminado devuelto a la lista: le escribiste", {
        linea: normalizarLinea(parsed.instanceName) || "*",
        pedidoComo: parsed.remoteJid,
        filas: count,
      });
    }

    return { success: true, message: "Chat devuelto a la lista.", data: { levantadas: count } };
  } catch (error) {
    console.error("[devolverChatAlEscribirAction]", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "No se pudo devolver el chat a la lista.",
    };
  }
}

const bulkBaseSchema = z.object({
  userId: z.string().trim().min(1),
  instanceName: z.string().trim().optional(),
  remoteJids: z.array(z.string().trim().min(1)).min(1),
});

export async function bulkArchiveChatsAction(
  input: z.infer<typeof bulkBaseSchema> & { archived: boolean },
): Promise<ChatPreferenceResponse<ChatConversationPreference[]>> {
  try {
    const parsed = bulkBaseSchema.parse(input);
    await assertAuthorized(parsed.userId);

    // En bloque y bajo TODAS las identidades, como el borrado.
    //
    // Eran dos fallos en la misma linea. `Promise.all` de un upsert por chat es
    // el mismo turno-en-vez-de-trabajo que reventaba el borrado —con mil chats,
    // mil idas y vueltas mas mil `revalidatePath`—. Y `upsertPreference` escribe
    // bajo UNA sola identidad: es justo lo que la regla de «la marca va bajo
    // TODAS las identidades» arreglo para el archivado de uno en uno
    // (`setChatArchivedAction` usa `upsertPreferenceEnTodasLasIdentidades`) y a
    // esta hermana se le habia pasado, asi que un chat archivado en lote volvia
    // por su otra identidad.
    const { marcas } = await marcarEnBloque(
      parsed.userId,
      parsed.instanceName,
      parsed.remoteJids,
      { archivedAt: input.archived ? "ahora" : "nada", deletedAt: "nada", purgedAt: "nada" },
    );

    revalidatePath("/chats");

    return {
      success: true,
      message: input.archived
        ? `${marcas.length} chat${marcas.length !== 1 ? "s" : ""} archivado${marcas.length !== 1 ? "s" : ""}.`
        : `${marcas.length} chat${marcas.length !== 1 ? "s" : ""} desarchivado${marcas.length !== 1 ? "s" : ""}.`,
      data: marcas,
    };
  } catch (error) {
    console.error("[bulkArchiveChatsAction]", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "No se pudieron archivar los chats.",
    };
  }
}

const bulkDeleteSchema = bulkBaseSchema.extend({
  // Las identidades que la PANTALLA conoce de cada chat, por si nuestra base ya
  // no las cruza (mensajes caducados o el segundo borrado, que vacio
  // `chat_messages`). El borrado de uno en uno ya las pasaba; a este —el que usa
  // «Eliminar por fecha» y la seleccion multiple— se le habia pasado, asi que la
  // marca cubria menos identidades y el chat volvia por la que quedo fuera.
  identidadesPorJid: z.record(z.string(), z.array(z.string().trim().min(1))).optional(),
});

/**
 * El borrado en bloque, en DOS fases.
 *
 * Antes era un `Promise.all` sobre `hardDeleteLocalChat`: una transaccion por
 * chat, todas a la vez, contra un pool de diez conexiones cuyo `maxWait` son dos
 * segundos. Pasado ese plazo Prisma se rinde con «Transaction API error: Unable
 * to start a transaction in the given time.», que es literalmente el error que se
 * veia en pantalla; y como `Promise.all` se rinde con el PRIMER rechazo, la
 * pantalla recibia «no se pudieron eliminar» y no quitaba ni una fila habiendo
 * borrado de verdad varios cientos. Medido en el banco: con mil chats se
 * borraron 398 y la lista siguio enseñandolos todos.
 *
 * Ahora:
 *
 *  - **Fase 1**, aqui y ahora: la marca, en bloque. Es lo que saca la
 *    conversacion de la bandeja, y es lo unico que la pantalla necesita.
 *  - **Fase 2**, de fondo: el historial, de a uno y en serie
 *    (`lanzarLaPurgaDeFondo`). Nadie la espera, y si un despliegue la corta, el
 *    barrido diario la retoma —la marca se queda escrita, y eso ES la cola—.
 *
 * Es el mismo reparto que el borrado de una cuenta de cliente (`deleteUser` →
 * `purgarCuentaEliminada`).
 */
export async function bulkDeleteChatsAction(
  input: z.infer<typeof bulkDeleteSchema>,
): Promise<ChatPreferenceResponse<ChatConversationPreference[]>> {
  try {
    const parsed = bulkDeleteSchema.parse(input);
    await assertCanDeleteChats(parsed.userId);

    const { marcas } = await marcarChatsComoBorrados(
      parsed.userId,
      parsed.instanceName,
      parsed.remoteJids,
      parsed.identidadesPorJid ?? {},
    );

    // UNA vez, no una por chat: revalidar la ruta N veces era N veces lo mismo.
    revalidatePath("/chats");

    lanzarLaPurgaDeFondo(
      marcas.map((marca) => ({
        userId: parsed.userId,
        instanceName: marca.instanceName,
        remoteJid: marca.remoteJid,
      })),
    );

    return {
      success: true,
      message: `${marcas.length} chat${marcas.length !== 1 ? "s" : ""} eliminado${marcas.length !== 1 ? "s" : ""}.`,
      data: marcas,
    };
  } catch (error) {
    console.error("[bulkDeleteChatsAction]", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "No se pudieron eliminar los chats.",
    };
  }
}

export async function bulkPinChatsAction(
  input: z.infer<typeof bulkBaseSchema> & { isPinned: boolean },
): Promise<ChatPreferenceResponse<ChatConversationPreference[]>> {
  try {
    const parsed = bulkBaseSchema.parse(input);
    await assertAuthorized(parsed.userId);

    // En bloque, por lo mismo que archivar y borrar: `upsertPreferenceEnTodasLasIdentidades`
    // por chat son tres consultas y N upserts CADA UNO, mas un `revalidatePath`.
    // Con una seleccion de verdad eso son miles de idas y vueltas para escribir
    // una columna. Las identidades se siguen cubriendo todas —es lo que hace
    // `marcarEnBloque`— y **solo se toca `pinnedAt`**: anclar no puede llevarse
    // por delante el archivado ni el borrado.
    const { marcas } = await marcarEnBloque(
      parsed.userId,
      parsed.instanceName,
      parsed.remoteJids,
      { pinnedAt: input.isPinned ? "ahora" : "nada" },
    );

    revalidatePath("/chats");

    return {
      success: true,
      message: input.isPinned
        ? `${marcas.length} chat${marcas.length !== 1 ? "s" : ""} anclado${marcas.length !== 1 ? "s" : ""}.`
        : `${marcas.length} chat${marcas.length !== 1 ? "s" : ""} desanclado${marcas.length !== 1 ? "s" : ""}.`,
      data: marcas,
    };
  } catch (error) {
    console.error("[bulkPinChatsAction]", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "No se pudo actualizar el anclado de los chats.",
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Limpiar la base de conversaciones: por fecha, o TODAS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Lo que la pantalla puede pedir que se borre.
 *
 * Nombra LINEAS, no cuentas: de quien es cada una lo resuelve el servidor
 * (`resolveInstanceOwner`), y si se puede borrar ahi lo decide la puerta de
 * siempre. Una lista que llega del navegador no elige en que cuenta se borra.
 *
 * Las dos fechas son opcionales, y las dos vacias significan **todas**. Eso es lo
 * que hacia falta para poder limpiar la base entera: hasta ahora el dialogo
 * contaba sobre las filas cargadas —la bandeja carga acotada— asi que no habia
 * forma de pedirlo.
 */
const criterioSchema = z.object({
  lineas: z.array(z.string().trim().min(1)).min(1).max(100),
  desde: z.string().trim().max(10).optional(),
  hasta: z.string().trim().max(10).optional(),
});

const RANGO_IMPOSIBLE = "Ese rango de fechas no existe: revisa «desde» y «hasta».";

/**
 * Cuantas conversaciones se llevaria el borrado, contadas en el SERVIDOR.
 *
 * El dialogo de «Eliminar por fecha» contaba sobre `contacts`, o sea sobre lo que
 * el navegador tenia cargado, y ese era el tope que nadie encontraba: la bandeja
 * carga acotada y lo que no se habia cargado no existia para el dialogo. Aqui el
 * universo sale de la MISMA consulta que la lista, entera, asi que el numero que
 * se promete es el que la lista enseñaria bajando hasta el final.
 */
export async function contarConversacionesParaBorrarAction(
  input: z.infer<typeof criterioSchema>,
): Promise<ChatPreferenceResponse<CuantasParaBorrar>> {
  try {
    const parsed = criterioSchema.parse(input);
    const universo = await elUniversoDelBorrado({
      lineas: parsed.lineas,
      desde: parsed.desde,
      hasta: parsed.hasta,
      puedeBorrarEn: async (userId) => {
        try {
          await assertCanDeleteChats(userId);
          return true;
        } catch {
          return false;
        }
      },
    });
    if (!universo) return { success: false, message: RANGO_IMPOSIBLE };

    return {
      success: true,
      message: "Listo.",
      data: {
        total: universo.total,
        enEstaVuelta: universo.conversaciones.length,
        quedan: universo.quedan,
        lineasFuera: universo.lineasFuera,
      },
    };
  } catch (error) {
    console.error("[contarConversacionesParaBorrarAction]", error);
    return {
      success: false,
      message:
        error instanceof Error ? error.message : "No se pudo contar cuantas conversaciones entran.",
    };
  }
}

/**
 * Limpia la base de conversaciones: un rango de fechas, o todas.
 *
 * Las dos fases de siempre. **Fase 1**, aqui: la marca de todas las que entran,
 * en bloque —es lo que las saca de la bandeja, y es lo unico que la pantalla
 * necesita para contestar—. **Fase 2**, de fondo: el historial, de a uno y en
 * serie, con el barrido diario detras por si un despliegue la corta.
 *
 * Va **a trozos** (`TOPE_POR_VUELTA`) y **dice cuantas quedan**. Sin tope, una
 * cuenta con decenas de miles de conversaciones tardaria minutos en una sola
 * peticion y volveria el corte del proxy, que es el fallo del que venimos. Con
 * el, cada pulsacion tarda lo mismo y la pantalla puede repetir con el contador
 * a la vista.
 */
export async function borrarConversacionesDeLaBandejaAction(
  input: z.infer<typeof criterioSchema>,
): Promise<ChatPreferenceResponse<LoQueSeBorro>> {
  try {
    const parsed = criterioSchema.parse(input);
    const universo = await elUniversoDelBorrado({
      lineas: parsed.lineas,
      desde: parsed.desde,
      hasta: parsed.hasta,
      puedeBorrarEn: async (userId) => {
        try {
          await assertCanDeleteChats(userId);
          return true;
        } catch {
          return false;
        }
      },
      tope: TOPE_POR_VUELTA,
    });
    if (!universo) return { success: false, message: RANGO_IMPOSIBLE };

    if (universo.conversaciones.length === 0) {
      return {
        success: true,
        message:
          universo.lineasFuera.length > 0
            ? "No hay conversaciones que eliminar en las lineas que puedes borrar."
            : "No hay conversaciones que eliminar con ese criterio.",
        data: { borradas: 0, quedan: 0, porLinea: [] },
      };
    }

    // Por (cuenta, linea): el borrado se acota SIEMPRE a una linea, y la marca de
    // una linea no toca a las demas.
    const porCuentaYLinea = new Map<
      string,
      { userId: string; instanceName: string; jids: string[]; identidades: Record<string, string[]> }
    >();
    for (const c of universo.conversaciones) {
      const clave = `${c.userId}::${c.instanceName}`;
      const grupo =
        porCuentaYLinea.get(clave) ??
        { userId: c.userId, instanceName: c.instanceName, jids: [], identidades: {} };
      grupo.jids.push(c.remoteJid);
      grupo.identidades[c.remoteJid] = c.identidades;
      porCuentaYLinea.set(clave, grupo);
    }

    const paraPurgar: { userId: string; instanceName: string; remoteJid: string }[] = [];
    const porLinea: { instanceName: string; remoteJids: string[] }[] = [];
    let borradas = 0;
    let fallaron = 0;

    // En serie por linea, no en paralelo: son pocas —una cuenta tiene un puñado—
    // y cada una escribe varias sentencias. Lanzarlas todas a la vez es el mismo
    // turno-en-vez-de-trabajo por la puerta de al lado.
    for (const grupo of Array.from(porCuentaYLinea.values())) {
      try {
        const { marcas } = await marcarChatsComoBorrados(
          grupo.userId,
          grupo.instanceName,
          grupo.jids,
          grupo.identidades,
        );
        borradas += marcas.length;
        porLinea.push({
          instanceName: grupo.instanceName,
          remoteJids: marcas.map((m) => m.remoteJid),
        });
        for (const marca of marcas) {
          paraPurgar.push({
            userId: grupo.userId,
            instanceName: marca.instanceName,
            remoteJid: marca.remoteJid,
          });
        }
      } catch (error) {
        // Una linea que falla no puede dejar sin borrar a las demas, y no es
        // muda: quedarse conversaciones sin borrar y no decirlo se ve como «el
        // boton no funciona».
        fallaron += grupo.jids.length;
        console.warn("[chats] una linea no se pudo limpiar", {
          linea: grupo.instanceName,
          cuantas: grupo.jids.length,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    revalidatePath("/chats");
    lanzarLaPurgaDeFondo(paraPurgar);

    // Las lineas que no se alcanzan se dicen aparte: no son conversaciones que
    // fallaran, son lineas en las que esta persona no puede borrar. Juntarlas en
    // el mismo numero daria un aviso que no se puede explicar señalando la
    // pantalla.
    const deLasLineas =
      universo.lineasFuera.length > 0
        ? ` ${universo.lineasFuera.length} linea${universo.lineasFuera.length !== 1 ? "s" : ""} no se puede${universo.lineasFuera.length !== 1 ? "n" : ""} limpiar desde aqui.`
        : "";

    return {
      success: borradas > 0,
      message:
        comoTextoDelBorrado({ marcadas: borradas, sinLinea: fallaron, quedan: universo.quedan }) +
        deLasLineas,
      data: { borradas, quedan: universo.quedan, porLinea },
    };
  } catch (error) {
    console.error("[borrarConversacionesDeLaBandejaAction]", error);
    return {
      success: false,
      message:
        error instanceof Error ? error.message : "No se pudieron eliminar las conversaciones.",
    };
  }
}
