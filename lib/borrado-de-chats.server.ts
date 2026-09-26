import "server-only";

import { randomUUID } from "crypto";

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
  buildWhatsAppJidCandidates,
  normalizeWhatsAppConversationJid,
} from "@/lib/whatsapp-jid";
import { invalidatePersistedInboxCache } from "@/lib/chat-persistence";
import { laListaSaleDeNuestraBase } from "@/lib/lista-de-la-linea";
import {
  agruparIdentidades,
  identidadesParaMarcar,
  MARCAS_POR_SENTENCIA,
} from "@/lib/borrado-de-chats";
import type { ChatConversationPreference } from "@/types/chat";

/**
 * Las marcas de Chats y el borrado del historial de una conversacion.
 *
 * # Por que vive en `lib/*.server.ts` y no en el fichero de acciones
 *
 * `hardDeleteLocalChat` era una funcion privada de un fichero `'use server'` y
 * eso la dejaba fuera del alcance de cualquier cron: en un fichero de acciones
 * **todo lo exportado es un POST al que se llega desde el navegador con los
 * parametros que uno quiera**, y esto borra historial de clientes sin
 * preguntarle a nadie quien llama —porque quien la llama es un barrido, donde
 * no hay sesion que preguntar—. `server-only` conserva lo unico que aportaba
 * `'use server'` de verdad —que esto no se empaquete nunca hacia el navegador, y
 * que el build **se caiga en el sitio** si alguien lo importa desde un
 * componente de cliente— y quita el endpoint. Es el mismo reparto que
 * `lib/papelera-de-embudos-runner.server.ts`, que dejo escrito este movimiento
 * como «el frente aparte».
 *
 * El codigo que hay debajo **no cambia**: se movio tal cual desde
 * `actions/chat-conversation-actions.ts`, que sigue siendo quien comprueba quien
 * llama (`assertCanDeleteChats`) y quien revalida la ruta. Lo unico que se
 * quito es el `revalidatePath("/chats")` del final del borrado, que ahora lo
 * hace la accion: `revalidatePath` fuera de una peticion —que es donde corre el
 * obrero de fondo— revienta, y ademas llamarlo una vez por chat era N veces lo
 * mismo.
 */

export const chatConversationPreferenceTable = db.chatConversationPreference as unknown as {
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

export function normalizePreferenceRemoteJid(remoteJid: string) {
  const trimmed = remoteJid.trim();
  return normalizeWhatsAppConversationJid(trimmed) || trimmed;
}

export function mapPreference(
  preference: {
    instanceName?: string | null;
    remoteJid: string;
    pinnedAt: Date | null;
    archivedAt: Date | null;
    deletedAt: Date | null;
    purgedAt?: Date | null;
    updatedAt?: Date | null;
  },
): ChatConversationPreference {
  return {
    instanceName: preference.instanceName ?? "",
    remoteJid: preference.remoteJid,
    pinnedAt: preference.pinnedAt?.toISOString() ?? null,
    archivedAt: preference.archivedAt?.toISOString() ?? null,
    deletedAt: preference.deletedAt?.toISOString() ?? null,
    purgedAt: preference.purgedAt?.toISOString() ?? null,
    updatedAt: preference.updatedAt?.toISOString() ?? null,
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

export async function ensurePurgedAtColumn(): Promise<void> {
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
export function normalizarLinea(instanceName?: string | null) {
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
export class SinLineaParaBorrar extends Error {
  constructor() {
    super(
      "No se pudo saber de que linea es este chat, asi que no se borro nada. Abrelo y borralo desde la conversacion.",
    );
    this.name = "SinLineaParaBorrar";
  }
}

/**
 * Todas las identidades conocidas de un contacto en esa linea, la pedida
 * primero.
 *
 * `buildWhatsAppJidCandidates` con un `@lid` devuelve solo el `@lid`, a
 * proposito: sus digitos no son un telefono. Y con un numero no sabe cual es su
 * `@lid`. Quien sabe cruzar `@lid` con numero son NUESTRAS tablas, que guardan
 * cada fila con todas las formas del contacto.
 *
 * Y se leen las TRES, no solo `chat_messages`. Ese era el fallo de fondo de los
 * chats que se borran y vuelven: `chat_messages` es la unica fuente que este
 * mismo borrado VACIA, y ademas CADUCA a los 90 dias. Una conversacion vieja
 * -junio, borrada en septiembre- ya no tiene ni un mensaje, asi que el puente
 * `@lid`<->numero se perdia: la marca (y el `DELETE`) cubrian solo la forma con
 * la que se pidio, y la lista trae al contacto por la OTRA -su `@lid` si se pidio
 * por numero, o al reves-, se saltaba la marca y reaparecia. `chat_conversations`
 * y `Session` son DURABLES -la ficha del lead no caduca y la conversacion es
 * justo lo que la bandeja lista-, asi que de ahi sale el puente aunque los
 * mensajes ya no esten. Es la misma regla de siempre en Chats: cuando una forma
 * se queda corta, se miran todas -y ahora tambien en la fuente que sobrevive-.
 *
 * Es la misma consulta que ya hacia el borrado; vive aparte porque la marca de
 * anclado necesita exactamente lo mismo (ver `upsertPreferenceEnTodasLasIdentidades`).
 */
export async function identidadesDelContacto(
  userId: string,
  linea: string,
  normalizedRemoteJid: string,
  extra: string[] = [],
): Promise<string[]> {
  const formasBase = buildWhatsAppJidCandidates(normalizedRemoteJid, extra);
  const deLaLinea = linea ? { instanceName: linea } : {};
  const orPorIdentidad = [
    { remoteJid: { in: formasBase } },
    { remoteJidAlt: { in: formasBase } },
    { senderPn: { in: formasBase } },
  ];

  // Las tres a la vez, cada una a prueba de fallos por su cuenta: que falte una
  // tabla o que una consulta reviente no puede dejar al borrado sin las
  // identidades que las demas si saben.
  const [enMensajes, enConversaciones, enSesiones] = await Promise.all([
    db.chatMessage
      .findMany({
        where: { userId, ...deLaLinea, OR: orPorIdentidad },
        select: { remoteJid: true, remoteJidAlt: true, senderPn: true },
        distinct: ["remoteJid", "remoteJidAlt", "senderPn"],
        take: 50,
      })
      .catch(() => [] as { remoteJid: string; remoteJidAlt: string | null; senderPn: string | null }[]),
    db.chatConversation
      .findMany({
        // `chat_conversations` acota por `instanceName`, igual que los mensajes.
        where: { userId, ...deLaLinea, OR: orPorIdentidad },
        select: { remoteJid: true, remoteJidAlt: true, senderPn: true },
        take: 50,
      })
      .catch(() => [] as { remoteJid: string; remoteJidAlt: string | null; senderPn: string | null }[]),
    db.session
      .findMany({
        // La ficha del CRM guarda la linea en `instanceId` (el NOMBRE de la
        // linea, no su id), y no tiene columna `senderPn`.
        where: {
          userId,
          ...(linea ? { instanceId: linea } : {}),
          OR: [
            { remoteJid: { in: formasBase } },
            { remoteJidAlt: { in: formasBase } },
          ],
        },
        select: { remoteJid: true, remoteJidAlt: true },
        take: 50,
      })
      .catch(() => [] as { remoteJid: string; remoteJidAlt: string | null }[]),
  ]);

  return buildWhatsAppJidCandidates(normalizedRemoteJid, [
    ...enMensajes.flatMap((m) => [m.remoteJid, m.remoteJidAlt, m.senderPn]),
    ...enConversaciones.flatMap((c) => [c.remoteJid, c.remoteJidAlt, c.senderPn]),
    ...enSesiones.flatMap((s) => [s.remoteJid, s.remoteJidAlt]),
    ...extra,
  ]);
}

export function deletedPreference(
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
    updatedAt: now,
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
 * Las tablas de la linea se acotan a las instancias del propio
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

}

export async function hardDeleteLocalChat(
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
  // Se pregunta ANTES de la transaccion: dentro no se hacen consultas que no
  // sean el propio borrado.
  const borradoDefinitivo = await laListaSaleDeNuestraBase(linea);

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

    /**
     * Si la lista de esta linea sale de NUESTRA base, el chat ya se fue: no
     * hace falta marca, y la fila se borra.
     *
     * Justo arriba se han borrado las sesiones, las conversaciones y los
     * mensajes de este contacto en esta linea. En una linea Waha, Meta o
     * Telegram la bandeja no tiene otra fuente, asi que sin esas filas no hay
     * nada que listar: eliminado es eliminado. Dejar una marca ahi no esconde
     * nada; solo pesa, y mucho: 1.044 de las 1.200 filas de una cuenta estaban
     * en «borrada y purgada», 399 de los 407 KB de la carga inicial.
     *
     * En una linea de Evolution NO: alli la lista la trae el telefono en cada
     * vuelta y el chat sigue existiendo en WhatsApp. Sin la marca vuelve a la
     * bandeja veinte segundos despues.
     *
     * Y si el contacto vuelve a escribir, la conversacion entra **como nueva**,
     * que es exactamente lo que dice la regla de siempre. Sin fila no hay nada
     * que levantar: `levantarMarcasSiElContactoEscribio` no encuentra nada que
     * actualizar y no falla —es un `UPDATE ... FROM` sobre un CTE vacio, que no
     * toca ninguna fila y devuelve la lista vacia—.
     */
    if (borradoDefinitivo) {
      const identidadesABorrar = [
        normalizedRemoteJid,
        ...paraMarcar.filter((candidate) => candidate !== normalizedRemoteJid),
      ];
      await tx.chatConversationPreference.deleteMany({
        where: {
          userId,
          instanceName: linea,
          remoteJid: { in: identidadesABorrar },
        },
      });
      return;
    }

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
  console.info(borradoDefinitivo ? "[chats] chat borrado sin dejar marca" : "[chats] marca de borrado guardada", {
    userId,
    // De donde sale la lista de esta linea decide si el chat se pudo borrar de
    // verdad o solo esconder. Si alguna vez un borrado «no se nota», esto dice
    // cual de los dos caminos tomo.
    laListaSaleDeNuestraBase: borradoDefinitivo,
    linea: linea || "(vacia = vale para todas)",
    remoteJid: normalizedRemoteJid,
    pedidoComo: remoteJid,
    identidadesMarcadas: paraMarcar.length,
    completadasDesdeLaBase: Math.max(0, candidates.length - formasBase.length),
    completadasDesdeLaPantalla: Math.max(0, paraMarcar.length - candidates.length),
  });

  invalidatePersistedInboxCache();

  // El `revalidatePath("/chats")` de aqui se fue a la accion, y no es un
  // detalle de estilo: este borrado corre tambien desde el obrero de fondo y
  // desde el barrido diario, donde no hay peticion de Next y `revalidatePath`
  // revienta. Y llamarlo una vez por chat era N veces lo mismo.
  return deletedPreferenceRow ?? deletedPreference(normalizedRemoteJid, linea);
}

// ─────────────────────────────────────────────────────────────────────────────
// Fase 1: la marca, en bloque
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cuantos jids entran en la consulta que reune identidades.
 *
 * No es por el tope de parametros —van por `unnest`, asi que son cuatro— sino
 * para que cada `IN` siga cabiendo en un plan por indice en vez de convertirse
 * en un recorrido de la tabla.
 */
const JIDS_POR_CONSULTA = 500;

/**
 * Las identidades de MUCHOS contactos de una linea, de dos consultas.
 *
 * `identidadesDelContacto` hace tres consultas **por chat**, y eso es
 * exactamente lo que no se puede pagar cuando se borran cientos: es «muchas
 * peticiones pequeñas son turno, no trabajo», por dentro. Aqui se leen las
 * mismas fuentes DURABLES —`chat_conversations` y `Session`— de una vez para
 * toda la seleccion, y el cruce lo hace `agruparIdentidades` en memoria.
 *
 * `chat_messages` se queda fuera a proposito: es la fuente que este mismo
 * borrado vacia y que caduca a los 90 dias, asi que lo que aporta sobre las
 * otras dos es poco y cuesta un `DISTINCT` sobre la tabla mas grande de la
 * plataforma. Y no hace falta que la fase 1 sea perfecta: la fase 2 vuelve a
 * marcar con `identidadesDelContacto` entera.
 */
async function identidadesDeEstosChats(
  userId: string,
  linea: string,
  jids: string[],
): Promise<Map<string, string[]>> {
  const filas: { remoteJid: string; remoteJidAlt?: string | null; senderPn?: string | null }[] = [];

  for (let i = 0; i < jids.length; i += JIDS_POR_CONSULTA) {
    const trozo = jids.slice(i, i + JIDS_POR_CONSULTA);
    const formas = Array.from(
      new Set(trozo.flatMap((jid) => buildWhatsAppJidCandidates(jid))),
    );
    if (formas.length === 0) continue;

    const [conversaciones, sesiones] = await Promise.all([
      db.chatConversation
        .findMany({
          where: {
            userId,
            instanceName: linea,
            OR: [
              { remoteJid: { in: formas } },
              { remoteJidAlt: { in: formas } },
              { senderPn: { in: formas } },
            ],
          },
          select: { remoteJid: true, remoteJidAlt: true, senderPn: true },
        })
        .catch(() => [] as { remoteJid: string; remoteJidAlt: string | null; senderPn: string | null }[]),
      db.session
        .findMany({
          where: {
            userId,
            instanceId: linea,
            OR: [{ remoteJid: { in: formas } }, { remoteJidAlt: { in: formas } }],
          },
          select: { remoteJid: true, remoteJidAlt: true },
        })
        .catch(() => [] as { remoteJid: string; remoteJidAlt: string | null }[]),
    ]);

    filas.push(...conversaciones, ...sesiones);
  }

  return agruparIdentidades(filas);
}

/**
 * Que columnas de la marca se tocan, y con que.
 *
 * Los valores solo pueden ser dos —`ahora` o `nada`— porque eso es lo unico que
 * escriben anclar, archivar y borrar. Se dicen asi, y no con un `Date`, para que
 * el SQL lleve `NOW()` y `NULL` literales: un `$n` sin tipo en la lista de un
 * `INSERT ... SELECT` depende de como lo resuelva Postgres, y aqui no hace falta
 * arriesgarlo.
 */
export type ValorDeLaMarca = "ahora" | "nada";
export type MarcaEnBloque = Partial<Record<ColumnaDeMarca, ValorDeLaMarca>>;

type ColumnaDeMarca = "pinnedAt" | "archivedAt" | "deletedAt" | "purgedAt";

const COLUMNAS_DE_MARCA: ColumnaDeMarca[] = ["pinnedAt", "archivedAt", "deletedAt", "purgedAt"];

function comoSql(valor: ValorDeLaMarca | undefined): Prisma.Sql {
  return valor === "ahora" ? Prisma.sql`NOW()` : Prisma.sql`NULL`;
}

/**
 * Escribe la marca de MUCHAS conversaciones de una linea, y nada mas.
 *
 * Es la **fase 1** del borrado —lo que de verdad esconde el chat de la bandeja,
 * y lo unico que la pantalla necesita para contestar— y a la vez el camino de
 * anclar y archivar en lote, que tenian el mismo defecto por la puerta de al
 * lado: `upsertPreferenceEnTodasLasIdentidades` por chat son tres consultas y N
 * upserts **cada uno**, mas un `revalidatePath` por chat.
 *
 * Aqui es un `INSERT ... ON CONFLICT` con `unnest` por cada
 * `MARCAS_POR_SENTENCIA` filas: cuatro parametros pase lo que pase, ninguna
 * transaccion interactiva y una sola invalidacion de cache al final.
 *
 * **Solo toca las columnas que se le nombran.** Anclar no puede llevarse por
 * delante el archivado, ni el borrado: por eso el `DO UPDATE SET` se arma con
 * las que vienen y no con las cuatro.
 */
export async function marcarEnBloque(
  userId: string,
  instanceName: string | null | undefined,
  remoteJids: string[],
  data: MarcaEnBloque,
  identidadesPorJid: Record<string, string[]> = {},
): Promise<{ marcas: ChatConversationPreference[]; filas: number }> {
  const linea = normalizarLinea(instanceName);
  const pedidos = Array.from(
    new Set(remoteJids.map((jid) => normalizePreferenceRemoteJid(jid)).filter(Boolean)),
  );
  if (pedidos.length === 0) return { marcas: [], filas: 0 };

  const columnas = COLUMNAS_DE_MARCA.filter((c) => data[c] !== undefined);
  if (columnas.length === 0) return { marcas: [], filas: 0 };

  await ensurePurgedAtColumn();
  const grupos = await identidadesDeEstosChats(userId, linea, pedidos);

  // Todas las identidades de todos los pedidos, sin repetir: una misma forma
  // puede salir de dos filas, y `ON CONFLICT` no puede tocar la misma fila dos
  // veces en una sentencia.
  const todas = new Set<string>();
  for (const jid of pedidos) {
    for (const identidad of identidadesParaMarcar(jid, grupos, identidadesPorJid[jid] ?? [])) {
      const normalizada = normalizePreferenceRemoteJid(identidad);
      if (normalizada) todas.add(normalizada);
    }
  }

  const set = Prisma.join(
    columnas.map(
      (c) => Prisma.sql`${Prisma.raw(`"${c}"`)} = ${comoSql(data[c])}`,
    ),
    ", ",
  );

  const lista = Array.from(todas);
  for (let i = 0; i < lista.length; i += MARCAS_POR_SENTENCIA) {
    const trozo = lista.slice(i, i + MARCAS_POR_SENTENCIA);
    const ids = trozo.map(() => randomUUID());
    await db.$executeRaw`
      INSERT INTO "ChatConversationPreference"
        ("id", "userId", "instanceName", "remoteJid",
         "pinnedAt", "archivedAt", "deletedAt", "purgedAt", "createdAt", "updatedAt")
      SELECT u.id, ${userId}, ${linea}, u.jid,
             ${comoSql(data.pinnedAt)}, ${comoSql(data.archivedAt)},
             ${comoSql(data.deletedAt)}, ${comoSql(data.purgedAt)}, NOW(), NOW()
      FROM unnest(${ids}::text[], ${trozo}::text[]) AS u(id, jid)
      ON CONFLICT ("userId", "instanceName", "remoteJid")
      DO UPDATE SET ${set}, "updatedAt" = NOW()
    `;
  }

  invalidatePersistedInboxCache();

  // A la pantalla se le devuelve la marca de la identidad PEDIDA de cada chat,
  // que es la que lleva su fila. Se relee en una sola consulta —la acaba de
  // escribir la sentencia de arriba— en vez de darla por hecha: asi lo que la
  // pantalla guarda es lo que hay en la base, incluidas las columnas que esta
  // llamada no tocaba.
  const filas = await chatConversationPreferenceTable.findMany({
    where: { userId, instanceName: linea, remoteJid: { in: pedidos } },
    select: {
      instanceName: true,
      remoteJid: true,
      pinnedAt: true,
      archivedAt: true,
      deletedAt: true,
      purgedAt: true,
      updatedAt: true,
    },
  });

  return { marcas: filas.map((fila) => mapPreference(fila)), filas: lista.length };
}

/**
 * La fase 1 del borrado: marcar, y nada mas.
 *
 * `purgedAt` queda en NULO **a proposito**: es lo que convierte esta fila en la
 * cola de la fase 2. La columna ya significa «no queda rastro que borrar» —lo
 * dice el esquema—, asi que no hay ninguna tabla nueva ni ningun significado
 * nuevo: `deletedAt` puesto y `purgedAt` vacio ES la conversacion eliminada cuyo
 * historial todavia esta ahi.
 *
 * SIN LINEA NO SE MARCA, igual que `hardDeleteLocalChat` no borra: la marca sin
 * linea vale para TODAS las de la cuenta, asi que una conversacion que no se
 * puede situar esconderia al contacto en toda la cuenta. Quien llama lo cuenta y
 * lo dice.
 */
export async function marcarChatsComoBorrados(
  userId: string,
  instanceName: string | null | undefined,
  remoteJids: string[],
  identidadesPorJid: Record<string, string[]> = {},
): Promise<{ marcas: ChatConversationPreference[]; filas: number }> {
  const linea = normalizarLinea(instanceName);
  if (!linea) {
    console.warn("[chats] borrado en bloque rechazado: no se sabe de que linea son", {
      userId,
      cuantos: remoteJids.length,
    });
    throw new SinLineaParaBorrar();
  }

  const salida = await marcarEnBloque(
    userId,
    linea,
    remoteJids,
    { pinnedAt: "nada", archivedAt: "nada", deletedAt: "ahora", purgedAt: "nada" },
    identidadesPorJid,
  );

  console.info("[chats] marcas de borrado guardadas en bloque", {
    userId,
    linea,
    conversaciones: salida.marcas.length,
    filas: salida.filas,
  });

  return salida;
}
