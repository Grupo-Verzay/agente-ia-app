"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { buildWhatsAppJidCandidates, normalizeWhatsAppConversationJid } from "@/lib/whatsapp-jid";
import { invalidatePersistedInboxCache } from "@/lib/chat-persistence";
import { chatPreferenceKey } from "@/lib/chat-preference-key";
import { getAssociatedAccountIds } from "@/lib/cuentas-asociadas";
import type {
  ChatConversationPreference,
  ChatConversationPreferenceMap,
} from "@/types/chat";

const chatConversationPreferenceTable = db.chatConversationPreference as unknown as {
  findMany: (args: unknown) => Promise<
    Array<{
      // Solo viene cuando se pide en el select; se necesita para indexar la
      // preferencia por la cuenta dueña de la línea.
      userId?: string;
      instanceName?: string;
      remoteJid: string;
      pinnedAt: Date | null;
      archivedAt: Date | null;
      deletedAt: Date | null;
      purgedAt: Date | null;
    }>
  >;
  upsert: (args: unknown) => Promise<{
    instanceName?: string;
    remoteJid: string;
    pinnedAt: Date | null;
    archivedAt: Date | null;
    deletedAt: Date | null;
    purgedAt: Date | null;
  }>;
  updateMany: (args: unknown) => Promise<{ count: number }>;
  deleteMany: (args: unknown) => Promise<{ count: number }>;
};

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

function normalizePreferenceRemoteJid(remoteJid: string) {
  const trimmed = remoteJid.trim();
  return normalizeWhatsAppConversationJid(trimmed) || trimmed;
}

function mapPreference(
  preference: {
    instanceName?: string | null;
    remoteJid: string;
    pinnedAt: Date | null;
    archivedAt: Date | null;
    deletedAt: Date | null;
    purgedAt?: Date | null;
  },
): ChatConversationPreference {
  return {
    instanceName: preference.instanceName ?? "",
    remoteJid: preference.remoteJid,
    pinnedAt: preference.pinnedAt?.toISOString() ?? null,
    archivedAt: preference.archivedAt?.toISOString() ?? null,
    deletedAt: preference.deletedAt?.toISOString() ?? null,
    purgedAt: preference.purgedAt?.toISOString() ?? null,
    isPinned: Boolean(preference.pinnedAt),
    isArchived: Boolean(preference.archivedAt),
    isDeleted: Boolean(preference.deletedAt),
    isPurged: Boolean(preference.purgedAt),
  };
}

/**
 * Se asegura de que exista la columna purgedAt antes de tocar la tabla.
 *
 * La App no corre migraciones al desplegar -igual que chat_messages y
 * chat_conversations, que se auto-provisionan en lib/chat-persistence.ts-, asi
 * que la columna del ultimo cambio llego al codigo pero no a la base y todas
 * las acciones de Chats se caian con "column purgedAt does not exist".
 *
 * Se crea aqui, una sola vez por proceso y de forma idempotente. Si falla se
 * olvida la promesa, para que el siguiente intento lo vuelva a probar en vez
 * de arrastrar el error para siempre.
 */
let asegurarColumnaPurgedAt: Promise<void> | null = null;

async function ensurePurgedAtColumn(): Promise<void> {
  asegurarColumnaPurgedAt ??= (async () => {
    await db.$executeRawUnsafe(
      'ALTER TABLE "ChatConversationPreference" ADD COLUMN IF NOT EXISTS "purgedAt" TIMESTAMP(3)',
    );
    await db.$executeRawUnsafe(
      'CREATE INDEX IF NOT EXISTS "ChatConversationPreference_userId_purgedAt_idx" ON "ChatConversationPreference" ("userId", "purgedAt")',
    );

    // La LINEA a la que pertenece la marca.
    //
    // Sin esto la tabla guardaba `(cuenta, numero)`, asi que borrar un contacto
    // en Verzay Notificaciones lo borraba tambien en Atencion y en Ventas: una
    // sola marca para todas las lineas de la cuenta. Cada linea tiene su propio
    // QR y sus propias conversaciones, y una no manda sobre las otras.
    //
    // Se crea NOT NULL con defecto '' a proposito. Las filas que ya existen se
    // quedan con la cadena vacia, que significa "de antes, vale para todas las
    // lineas": los borrados que el usuario ya hizo siguen ocultando lo que
    // ocultaban, y solo los nuevos son por linea. Si fuera NULL, Postgres trata
    // cada NULL como distinto y el indice unico dejaria colar duplicados.
    await db.$executeRawUnsafe(
      `ALTER TABLE "ChatConversationPreference"
         ADD COLUMN IF NOT EXISTS "instanceName" TEXT NOT NULL DEFAULT ''`,
    );

    // El candado pasa a incluir la linea. Primero el nuevo, y solo si queda
    // creado se retira el viejo: si se cayera entre medias, la tabla se queda
    // con los dos y sigue siendo correcta -mas estricta, nunca menos-.
    await db.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS "ChatConversationPreference_user_instance_jid_key"
         ON "ChatConversationPreference" ("userId", "instanceName", "remoteJid")`,
    );
    // El candado viejo se busca POR SU DEFINICION, no por su nombre.
    //
    // Se intento primero por nombre y no se fue: en produccion se llamaba de
    // otra forma, asi que el `DROP ... IF EXISTS` no encontro nada y no dijo
    // nada. El resultado era que la fila nueva -misma cuenta y mismo numero,
    // distinta linea- chocaba contra el unico de antes, y borrar un chat
    // reventaba con "Unique constraint failed on the fields:
    // (userId, instanceName, remoteJid)". Ese mensaje despista: Prisma nombra
    // los campos del `@@unique` del modelo, no los del indice que de verdad se
    // violo.
    //
    // Se listan los indices UNIQUE de la tabla que van exactamente sobre
    // (userId, remoteJid) y se retiran, sea cual sea su nombre. Se salta el
    // nuevo por si acaso.
    const candadosViejos = await db.$queryRaw<{ conname: string; contype: string }[]>`
      SELECT c.conname, c.contype::text AS contype
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      WHERE t.relname = 'ChatConversationPreference'
        AND c.contype = 'u'
        AND c.conname <> 'ChatConversationPreference_user_instance_jid_key'
        AND (
          SELECT array_agg(a.attname::text ORDER BY a.attname)
          FROM unnest(c.conkey) AS k(attnum)
          JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
        ) = ARRAY['remoteJid', 'userId']
    `.catch(() => []);

    for (const { conname } of candadosViejos) {
      await db.$executeRawUnsafe(
        `ALTER TABLE "ChatConversationPreference" DROP CONSTRAINT IF EXISTS "${conname}"`,
      );
      console.info(`[chats] retirado el candado viejo de preferencias: ${conname}`);
    }

    // Un UNIQUE puede existir tambien como indice suelto, sin constraint
    // detras. Ese no sale en `pg_constraint`.
    const indicesViejos = await db.$queryRaw<{ indexname: string }[]>`
      SELECT i.relname AS indexname
      FROM pg_index x
      JOIN pg_class i ON i.oid = x.indexrelid
      JOIN pg_class t ON t.oid = x.indrelid
      WHERE t.relname = 'ChatConversationPreference'
        AND x.indisunique
        AND i.relname <> 'ChatConversationPreference_user_instance_jid_key'
        AND (
          SELECT array_agg(a.attname::text ORDER BY a.attname)
          FROM unnest(x.indkey) AS k(attnum)
          JOIN pg_attribute a ON a.attrelid = x.indrelid AND a.attnum = k.attnum
        ) = ARRAY['remoteJid', 'userId']
    `.catch(() => []);

    for (const { indexname } of indicesViejos) {
      await db.$executeRawUnsafe(`DROP INDEX IF EXISTS "${indexname}"`);
      console.info(`[chats] retirado el indice unico viejo de preferencias: ${indexname}`);
    }
  })().catch((error) => {
    asegurarColumnaPurgedAt = null;
    throw error;
  });

  return asegurarColumnaPurgedAt;
}

/**
 * La linea a la que se aplica una marca, ya normalizada.
 *
 * Cadena vacia = marca antigua, de cuando la tabla no guardaba la linea. Vale
 * para todas las lineas de la cuenta, para no cambiarle al usuario lo que ya
 * habia borrado.
 */
function normalizarLinea(instanceName?: string | null) {
  return (instanceName ?? "").trim();
}

/**
 * No se sabe de que linea es el chat, asi que no se borra nada.
 *
 * Es una clase propia y no un `Error` a secas para que quien llama pueda
 * distinguirlo de un fallo de verdad: «Vaciar eliminados» se lo salta y sigue,
 * y los dos botones de borrar lo enseñan como aviso y no como error.
 */
// NO se exporta: este fichero es `'use server'` y ahi todo lo exportado tiene
// que ser una funcion `async`. Exportar una clase compila -`npm run build` pasa
// limpio- y luego, en produccion, CADA llamada a cualquier accion del fichero
// da 500. Ya costo la primera version de Carpetas (ver CLAUDE.md). No hace
// falta exportarla: los tres que la miran viven en este mismo fichero.
class SinLineaParaBorrar extends Error {
  constructor() {
    super(
      "No se pudo saber de que linea es este chat, asi que no se borro nada. Abrelo y borralo desde la conversacion.",
    );
    this.name = "SinLineaParaBorrar";
  }
}

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

  // `ownerId` puesto = se esta actuando dentro del equipo de una cuenta. Ahi
  // borrar es del dueno y de su mano derecha; el `agente` atiende lo que le
  // asignan. Sin `ownerId` se actua como la cuenta misma, y entonces si.
  if (user.ownerId && user.ownerId !== user.id && user.advisorRole !== "administrador") {
    throw new Error("Solo el dueño o un administrador puede eliminar chats.");
  }
}

/**
 * Todas las identidades conocidas de un contacto en esa linea, la pedida
 * primero.
 *
 * `buildWhatsAppJidCandidates` con un `@lid` devuelve solo el `@lid`, a
 * proposito: sus digitos no son un telefono. Y con un numero no sabe cual es su
 * `@lid`. Quien sabe cruzarlas es `chat_messages`, que guarda cada mensaje con
 * todas.
 *
 * Es la misma consulta que ya hacia el borrado; vive aparte porque la marca de
 * anclado necesita exactamente lo mismo (ver `upsertPreferenceEnTodasLasIdentidades`).
 */
async function identidadesDelContacto(
  userId: string,
  linea: string,
  normalizedRemoteJid: string,
  extra: string[] = [],
): Promise<string[]> {
  const formasBase = buildWhatsAppJidCandidates(normalizedRemoteJid, extra);
  const vistos = await db.chatMessage
    .findMany({
      where: {
        userId,
        ...(linea ? { instanceName: linea } : {}),
        OR: [
          { remoteJid: { in: formasBase } },
          { remoteJidAlt: { in: formasBase } },
          { senderPn: { in: formasBase } },
        ],
      },
      select: { remoteJid: true, remoteJidAlt: true, senderPn: true },
      distinct: ["remoteJid", "remoteJidAlt", "senderPn"],
      take: 50,
    })
    .catch(() => [] as { remoteJid: string; remoteJidAlt: string | null; senderPn: string | null }[]);

  return buildWhatsAppJidCandidates(normalizedRemoteJid, [
    ...vistos.flatMap((m) => [m.remoteJid, m.remoteJidAlt, m.senderPn]),
    ...extra,
  ]);
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

function deletedPreference(
  remoteJid: string,
  instanceName?: string | null,
): ChatConversationPreference {
  const now = new Date().toISOString();
  return {
    instanceName: normalizarLinea(instanceName),
    remoteJid: normalizePreferenceRemoteJid(remoteJid),
    pinnedAt: null,
    archivedAt: null,
    deletedAt: now,
    purgedAt: now,
    isPinned: false,
    isArchived: false,
    isDeleted: true,
    isPurged: true,
  };
}

/**
 * Borra lo que queda de un contacto FUERA de su ficha de sesion.
 *
 * Al eliminar un chat se borra la sesion, y con ella caen en cascada citas,
 * notas, tareas, etiquetas, seguimientos del CRM y estado de flujos. Pero hay
 * tablas que no cuelgan de la sesion sino del numero, y sobrevivian al
 * borrado: los datos que la IA le habia capturado al cliente, la cola de
 * seguimientos, el historico archivado del CRM, el bloqueo antiflood y la
 * copia local de contactos y mensajes de la linea.
 *
 * Las tablas de la linea (baileys) se acotan a las instancias del propio
 * usuario: la clave de esas tablas es el nombre de instancia, no el usuario,
 * asi que sin ese filtro se estaria borrando el contacto de otra cuenta que
 * hable con el mismo numero.
 */
async function purgarRastroDelContacto(
  tx: Prisma.TransactionClient,
  userId: string,
  candidates: string[],
) {
  await tx.$executeRaw`
    DELETE FROM "external_client_data"
    WHERE "userId" = ${userId} AND "remoteJid" IN (${Prisma.join(candidates)})
  `;

  await tx.$executeRaw`
    DELETE FROM "crm_follow_ups_archive"
    WHERE "userId" = ${userId} AND "remoteJid" IN (${Prisma.join(candidates)})
  `;

  const instancias = await tx.instancia.findMany({
    where: { userId },
    select: { instanceName: true },
  });
  const nombres = instancias
    .map((i) => i.instanceName)
    .filter((nombre): nombre is string => Boolean(nombre));

  if (nombres.length === 0) return;

  await tx.$executeRaw`
    DELETE FROM "AntifloodBlock"
    WHERE "instanceName" IN (${Prisma.join(nombres)})
      AND "remoteJid" IN (${Prisma.join(candidates)})
  `;

  await tx.$executeRaw`
    DELETE FROM "seguimientos"
    WHERE "instancia" IN (${Prisma.join(nombres)})
      AND "remoteJid" IN (${Prisma.join(candidates)})
  `;

  // baileys_messages cae en cascada con su contacto, pero puede haber filas
  // sueltas de un contacto que ya no existe.
  await tx.$executeRaw`
    DELETE FROM "baileys_messages"
    WHERE "instanceName" IN (${Prisma.join(nombres)})
      AND "remoteJid" IN (${Prisma.join(candidates)})
  `;

  await tx.$executeRaw`
    DELETE FROM "baileys_contacts"
    WHERE "instanceName" IN (${Prisma.join(nombres)})
      AND "remoteJid" IN (${Prisma.join(candidates)})
  `;
}

async function hardDeleteLocalChat(
  userId: string,
  instanceName: string | null | undefined,
  remoteJid: string,
  identidadesDeLaFila: string[] = [],
) {
  await ensurePurgedAtColumn();
  const normalizedRemoteJid = normalizePreferenceRemoteJid(remoteJid);
  const deletedAt = new Date();
  const linea = normalizarLinea(instanceName);

  // SIN LINEA NO SE BORRA. Ni el historial, ni la marca.
  //
  // Esto era destruccion de datos que nadie pidio. Mas abajo, el filtro de
  // linea de los `DELETE` se arma asi:
  //
  //     const deEstaLinea = linea ? Prisma.sql`AND "instanceName" = ${linea}` : Prisma.empty;
  //
  // Con la linea vacia, `Prisma.empty` deja los `DELETE` SIN filtro, y entonces
  // borrar un chat en una linea se llevaba por delante las conversaciones, los
  // mensajes y las sesiones de ese contacto en TODAS las lineas de la cuenta.
  // Y la marca se guardaba con `instanceName = ''`, que la bandeja aplica
  // tambien a todas (ver `chatPreferenceKeys`). O sea que una sola pulsacion
  // sin linea escondia al contacto en toda la cuenta y ademas le borraba el
  // historial en todas partes.
  //
  // De ahi salieron las 1081 marcas «de todas las lineas» que hay en produccion
  // -y de ahi que 978 de ellas ya no tengan ni un mensaje en `chat_messages`:
  // no es la retencion ni es que sean de Evolution, es que este `DELETE` se los
  // llevo-.
  //
  // La regla es simple y no admite excepcion: **si no se sabe de que linea es,
  // no se toca nada**. Quien llama lo dice y avisa. Es preferible un boton que
  // se queja a un boton que borra de mas sin decirlo.
  if (!linea) {
    console.warn("[chats] borrado rechazado: no se sabe de que linea es el chat", {
      userId,
      remoteJid: normalizedRemoteJid,
      pedidoComo: remoteJid,
    });
    throw new SinLineaParaBorrar();
  }

  // Las identidades se completan con lo que guarda NUESTRA base antes de
  // borrar nada.
  //
  // `buildWhatsAppJidCandidates` con un `@lid` devuelve solo el `@lid`, a
  // proposito: sus digitos no son un telefono. Y con un numero no sabe cual
  // es su `@lid`. Asi que borrar por una forma dejaba la marca sin la otra, y
  // la lista puede traer al contacto por cualquiera de las dos. Es la misma
  // regla que ya usa la pausa de la IA (`lib/human-takeover.ts`): cuando una
  // forma se queda corta, `chat_messages` sabe completarla, porque guarda cada
  // mensaje con todas. Tiene que ir ANTES de la transaccion, que es la que
  // borra esos mensajes.
  const formasBase = buildWhatsAppJidCandidates(normalizedRemoteJid);
  // Se toma la version de main: #606 saco esta consulta a `identidadesDelContacto`
  // y ahora la comparten el anclado y el borrado. Es la misma logica que habia
  // aqui copiada, asi que no hay nada que conservar de este lado.
  //
  // Dentro, el filtro de linea sigue siendo condicional
  // (`...(linea ? { instanceName: linea } : {})`), y aqui eso NO es el problema
  // que se arreglo en esta rama: es una LECTURA, solo sirve para reunir las
  // identidades del contacto, y no borra nada. Ademas, por la guarda de arriba,
  // en el camino del borrado `linea` ya nunca puede llegar vacia. Se deja tal
  // cual porque el anclado —el otro que la usa— si acepta quedarse sin linea, y
  // ahi buscar en todas es lo que se quiere.
  const candidates = await identidadesDelContacto(userId, linea, normalizedRemoteJid);
  // Las que sabe la pantalla se suman SOLO para marcar.
  //
  // El segundo borrado del mismo contacto ya no encuentra nada en
  // `chat_messages` -se lo llevo el primero-, asi que el servidor se queda con
  // la forma que le pidieron y la marca no cubre las demas. La lista si las
  // tiene: llegan dentro del propio chat. Por eso ahora las manda.
  //
  // Y NO entran en los `DELETE` de abajo, a proposito: esos borran historial, y
  // una lista de identidades que llega de fuera no puede decidir que filas se
  // borran. Para marcar no hay ese riesgo -una marca de mas se levanta sola en
  // cuanto el contacto escribe- y es justo lo que faltaba.
  const paraMarcar = buildWhatsAppJidCandidates(normalizedRemoteJid, [
    ...candidates,
    ...identidadesDeLaFila,
  ]);
  // Cuando se sabe de que linea se esta borrando, se borra SOLO de esa. Hasta
  // ahora esto arrasaba con el contacto en todas las lineas de la cuenta: sus
  // sesiones, sus conversaciones y todos sus mensajes. Con varias lineas
  // independientes eso es destruir historial de una linea desde otra.
  //
  // Sin linea -llamadas viejas- se conserva el comportamiento de antes, para no
  // dejar a medias un borrado que el usuario pidio completo.
  const soloDeEstaLinea = { instanceName: linea };
  let deletedPreferenceRow: ChatConversationPreference | null = null;

  await db.$transaction(async (tx) => {
    // Antes aqui se BORRABAN las marcas de las demas identidades del contacto,
    // y mas abajo se escribia la nueva bajo UNA sola. Eso es lo que hacia que un
    // chat borrado volviera a aparecer: la lista puede traer a ese mismo
    // contacto bajo otra de sus formas -su numero, su `@lid`, su `senderPn`- y
    // entonces no encuentra la marca. Ahora se marcan TODAS (mas abajo), que es
    // la misma regla de siempre en este proyecto: cuando una forma se queda
    // corta, se usan todas.

    const sessions = await tx.session.findMany({
      where: {
        userId,
        // Acotada SIEMPRE, por lo mismo que el filtro de los DELETE: estas
        // sesiones se borran unas lineas mas abajo, y sin acotar se borraba la
        // ficha de CRM del contacto en todas las lineas de la cuenta.
        instanceId: linea,
        OR: [
          { remoteJid: { in: candidates } },
          { remoteJidAlt: { in: candidates } },
        ],
      },
      select: { id: true },
    });
    const sessionIds = sessions.map((session) => session.id);

    if (sessionIds.length > 0) {
      await tx.financeTransaction.updateMany({
        where: { sessionId: { in: sessionIds } },
        data: { sessionId: null },
      });
      await tx.collabNotification.updateMany({
        where: { sessionId: { in: sessionIds } },
        data: { sessionId: null },
      });
      await tx.session.deleteMany({
        where: { id: { in: sessionIds } },
      });
    }

    // `chat_conversations` y `chat_messages` guardan su `instanceName`, asi que
    // el borrado se acota a la linea de la que se pidio. Sin ese filtro, borrar
    // un chat en una linea se llevaba por delante el historial del mismo
    // contacto en TODAS las demas.
    // SIN ternario, a proposito. Esto era:
    //
    //     linea ? Prisma.sql`AND "instanceName" = ${linea}` : Prisma.empty
    //
    // y esa rama `Prisma.empty` es la que dejaba los dos `DELETE` de abajo sin
    // filtro. Arriba hay una guarda que ya impide llegar hasta aqui sin linea,
    // pero una guarda se puede quitar y un ternario invita a ello. Asi el
    // filtro no PUEDE faltar: si `linea` fuera vacia, la consulta no borraria
    // nada en vez de borrarlo todo.
    const deEstaLinea = Prisma.sql`AND "instanceName" = ${linea}`;

    await tx.$executeRaw`
      DELETE FROM "chat_conversations"
      WHERE "userId" = ${userId}
        ${deEstaLinea}
        AND (
          "remoteJid" IN (${Prisma.join(candidates)})
          OR "remoteJidAlt" IN (${Prisma.join(candidates)})
          OR "senderPn" IN (${Prisma.join(candidates)})
        )
    `;

    await tx.$executeRaw`
      DELETE FROM "chat_messages"
      WHERE "userId" = ${userId}
        ${deEstaLinea}
        AND (
          "remoteJid" IN (${Prisma.join(candidates)})
          OR "remoteJidAlt" IN (${Prisma.join(candidates)})
          OR "senderPn" IN (${Prisma.join(candidates)})
        )
    `;

    await purgarRastroDelContacto(tx, userId, candidates);

    // La marca va bajo TODAS las identidades del contacto, no solo bajo la que
    // se pidio borrar.
    //
    // El chat se borraba, desaparecia, y al rato volvia. La marca estaba
    // guardada -se veia en la base- pero la pantalla no la encontraba: la lista
    // trae al contacto por la identidad que Evolution devuelva esa vuelta, y no
    // tiene por que ser la misma con la que se borro. Un contacto abierto por su
    // `@lid` y devuelto luego por su numero se saltaba la marca entera.
    //
    // Se marca la pedida primero, para que sea la que se devuelve a la pantalla.
    const identidades = [
      normalizedRemoteJid,
      ...paraMarcar.filter((candidate) => candidate !== normalizedRemoteJid),
    ];

    for (const identidad of identidades) {
      const preference = await tx.chatConversationPreference.upsert({
        where: {
          userId_instanceName_remoteJid: {
            userId,
            instanceName: linea,
            remoteJid: identidad,
          },
        },
        update: {
          pinnedAt: null,
          archivedAt: null,
          deletedAt,
          purgedAt: deletedAt,
        },
        create: {
          userId,
          // La MISMA linea que en el `where` de arriba. Faltaba, y por eso
          // borrar reventaba: el `where` buscaba (cuenta, linea, numero) y no
          // encontraba nada, pero el `create` insertaba con la linea por defecto
          // -cadena vacia-, que es justo donde vive la marca antigua de ese
          // contacto. Chocaban.
          instanceName: linea,
          remoteJid: identidad,
          pinnedAt: null,
          archivedAt: null,
          deletedAt,
          purgedAt: deletedAt,
        },
      });
      if (identidad === normalizedRemoteJid) {
        deletedPreferenceRow = mapPreference(preference);
      }
    }
  });

  // Con QUE llave quedo guardada la marca.
  //
  // El chat se borra, desaparece, y un minuto despues vuelve. Eso solo puede
  // pasar si la pantalla no encuentra esta fila, y para saber por que hay que
  // ver las dos partes: lo que se guardo aqui y lo que busca el navegador. Esta
  // es la primera.
  console.info("[chats] marca de borrado guardada", {
    userId,
    linea: linea || "(vacia = vale para todas)",
    remoteJid: normalizedRemoteJid,
    pedidoComo: remoteJid,
    identidadesMarcadas: paraMarcar.length,
    completadasDesdeLaBase: Math.max(0, candidates.length - formasBase.length),
    completadasDesdeLaPantalla: Math.max(0, paraMarcar.length - candidates.length),
  });

  invalidatePersistedInboxCache();

  revalidatePath("/chats");
  return deletedPreferenceRow ?? deletedPreference(normalizedRemoteJid, linea);
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
 */
async function levantarMarcasSiElContactoEscribio(userIds: string[]): Promise<void> {
  if (!userIds.length) return;
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
/**
 * Quita las fichas duplicadas que nacieron con el sufijo de dispositivo.
 *
 * WhatsApp numera el aparato desde el que se escribe —`573001:39@s.whatsapp.net`—
 * y ese `:39` NO es parte del número. Una ficha guardada con él es un lead
 * duplicado del mismo contacto.
 *
 * Solo se borra la que cumple las CUATRO condiciones:
 *
 * 1. Su `remoteJid` lleva sufijo de dispositivo.
 * 2. Existe la ficha buena del mismo contacto, sin sufijo, en la misma línea.
 * 3. Nadie la ha tocado: sin asesor, sin nombre puesto a mano, sin estado de lead.
 * 4. No se ha vuelto a guardar desde que nació (`createdAt` = `updatedAt`).
 *
 * Con las cuatro no se puede llevar por delante un lead con trabajo encima: lo
 * que se borra es una copia recién creada y sin estrenar, y el original se queda.
 *
 * Nunca rompe la carga de la bandeja: si falla, se anota y se sigue.
 */
async function quitarFichasConSufijoDeDispositivo(userIds: string[]): Promise<void> {
  if (!userIds.length) return;
  try {
    const borradas = await db.$queryRaw<Array<{ remoteJid: string; instanceId: string }>>`
      DELETE FROM "Session" mala
      WHERE mala."userId" IN (${Prisma.join(userIds)})
        AND mala."remoteJid" ~ ':[0-9]+@'
        AND mala."assignedAdvisorId" IS NULL
        AND mala."customName" IS NULL
        AND mala."leadStatus" IS NULL
        AND mala."createdAt" = mala."updatedAt"
        AND EXISTS (
          SELECT 1 FROM "Session" buena
          WHERE buena."userId" = mala."userId"
            AND buena."instanceId" = mala."instanceId"
            AND buena."id" <> mala."id"
            AND buena."remoteJid" !~ ':[0-9]+@'
            AND buena."remoteJid" = regexp_replace(mala."remoteJid", ':[0-9]+@', '@')
        )
      RETURNING "remoteJid", "instanceId"
    `;
    if (borradas.length > 0) {
      console.warn("[chats] fichas duplicadas por el sufijo de dispositivo, quitadas", {
        cuantas: borradas.length,
        ejemplo: borradas.slice(0, 3),
      });
    }
  } catch (error) {
    console.warn("[chats] no se pudieron quitar las fichas con sufijo de dispositivo", {
      error: String(error),
    });
  }
}

async function crearFichasQueFaltan(userIds: string[]): Promise<void> {
  if (!userIds.length) return;
  const llave = [...userIds].sort().join(",");
  const ahora = Date.now();
  if (ahora - (ultimaRevisionDeFichas.get(llave) ?? 0) < REVISAR_FICHAS_CADA_MS) return;
  ultimaRevisionDeFichas.set(llave, ahora);

  const desde = new Date(ahora - DIAS_DE_FICHAS_A_REVISAR * 24 * 60 * 60 * 1000);

  // Primero se quitan las fichas que nacieron con el sufijo de dispositivo.
  //
  // La primera versión de esta función no lo quitaba y creó leads como
  // "573233246305:39@s.whatsapp.net". Ese ":39" es el aparato desde el que se
  // escribió, no parte del número, así que esa ficha es un duplicado del mismo
  // contacto, que ya tiene la suya bajo el número limpio.
  //
  // Se quitan SOLO las que cumplen las cuatro cosas: tienen sufijo, existe la
  // ficha buena del mismo contacto en la misma línea, nadie las ha tocado (sin
  // asesor, sin nombre puesto a mano, sin estado de lead) y no se han vuelto a
  // guardar desde que nacieron. Con eso no se puede llevar por delante un lead
  // con trabajo encima.
  await quitarFichasConSufijoDeDispositivo(userIds);

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

    await ensurePurgedAtColumn();
    const userIds = await getAssociatedAccountIds(user);
    await levantarMarcasSiElContactoEscribio(userIds);
    await crearFichasQueFaltan(userIds);
    const preferences = await chatConversationPreferenceTable.findMany({
      where: { userId: { in: userIds } },
      select: {
        userId: true,
        instanceName: true,
        remoteJid: true,
        pinnedAt: true,
        archivedAt: true,
        deletedAt: true,
        purgedAt: true,
      },
    });

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
    if (!escribioElContacto) {
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

    const results = await Promise.all(
      parsed.remoteJids.map((remoteJid) =>
        upsertPreference(parsed.userId, parsed.instanceName, remoteJid, {
          archivedAt: input.archived ? new Date() : null,
          deletedAt: null,
          purgedAt: null,
        }),
      ),
    );

    return {
      success: true,
      message: input.archived
        ? `${results.length} chat${results.length !== 1 ? "s" : ""} archivado${results.length !== 1 ? "s" : ""}.`
        : `${results.length} chat${results.length !== 1 ? "s" : ""} desarchivado${results.length !== 1 ? "s" : ""}.`,
      data: results,
    };
  } catch (error) {
    console.error("[bulkArchiveChatsAction]", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "No se pudieron archivar los chats.",
    };
  }
}

export async function bulkDeleteChatsAction(
  input: z.infer<typeof bulkBaseSchema>,
): Promise<ChatPreferenceResponse<ChatConversationPreference[]>> {
  try {
    const parsed = bulkBaseSchema.parse(input);
    await assertCanDeleteChats(parsed.userId);
    const results = await Promise.all(
      parsed.remoteJids.map((remoteJid) =>
        hardDeleteLocalChat(parsed.userId, parsed.instanceName, remoteJid),
      ),
    );

    return {
      success: true,
      message: `${results.length} chat${results.length !== 1 ? "s" : ""} eliminado${results.length !== 1 ? "s" : ""}.`,
      data: results,
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

    const results = await Promise.all(
      parsed.remoteJids.map((remoteJid) =>
        upsertPreferenceEnTodasLasIdentidades(parsed.userId, parsed.instanceName, remoteJid, {
          pinnedAt: input.isPinned ? new Date() : null,
        }),
      ),
    );

    return {
      success: true,
      message: input.isPinned
        ? `${results.length} chat${results.length !== 1 ? "s" : ""} anclado${results.length !== 1 ? "s" : ""}.`
        : `${results.length} chat${results.length !== 1 ? "s" : ""} desanclado${results.length !== 1 ? "s" : ""}.`,
      data: results,
    };
  } catch (error) {
    console.error("[bulkPinChatsAction]", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "No se pudo actualizar el anclado de los chats.",
    };
  }
}
