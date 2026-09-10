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

async function assertCanDeleteChats(userId: string) {
  const user = await currentUser();
  if (!user?.id) {
    throw new Error("No autorizado.");
  }

  if (user.id === userId && !user.ownerId) return;
  if (user.ownerId === userId && user.advisorRole === "administrador") return;

  const realUserId = user.sessionUserId ?? user.id;

  // El vinculo vale en las DOS direcciones, igual que para cambiar de cuenta:
  //
  //   - A uno lo metieron en esa cuenta como administrador.
  //   - O esa cuenta la metio uno bajo la suya, y entonces uno es el que manda
  //     ahi: es quien la vinculo.
  //
  // Faltaba la segunda, y es la del dueño de varias cuentas -el caso normal-.
  // Podia entrar en Verzay Ventas desde el menu de cuentas, ver sus chats
  // eliminados en la lista... y no poder limpiarlos: la comprobacion solo
  // miraba la direccion contraria. `switchToAccount` ya aceptaba las dos.
  const link = await db.$queryRaw<{ id: string }[]>`
    SELECT id
    FROM "linked_accounts"
    WHERE ("master_user_id" = ${userId}
           AND "linked_user_id" = ${realUserId}
           AND role = 'administrador'::"LinkedAccountRole")
       OR ("master_user_id" = ${realUserId}
           AND "linked_user_id" = ${userId})
    LIMIT 1
  `.catch(() => []);

  if (link.length > 0) return;

  throw new Error("Solo el dueño o un administrador puede eliminar chats.");
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
  const vistos = await db.chatMessage.findMany({
    where: {
      userId,
      instanceName: linea,
      OR: [
        { remoteJid: { in: formasBase } },
        { remoteJidAlt: { in: formasBase } },
        { senderPn: { in: formasBase } },
      ],
    },
    select: { remoteJid: true, remoteJidAlt: true, senderPn: true },
    distinct: ["remoteJid", "remoteJidAlt", "senderPn"],
    take: 50,
  });
  const candidates = buildWhatsAppJidCandidates(
    normalizedRemoteJid,
    vistos.flatMap((m) => [m.remoteJid, m.remoteJidAlt, m.senderPn]),
  );
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
      ...candidates.filter((candidate) => candidate !== normalizedRemoteJid),
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
    identidadesMarcadas: candidates.length,
    completadasDesdeLaBase: Math.max(0, candidates.length - formasBase.length),
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

    const data = await upsertPreference(parsed.userId, parsed.instanceName, parsed.remoteJid, {
      pinnedAt: parsed.isPinned ? new Date() : null,
    });

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

    const data = await upsertPreference(parsed.userId, parsed.instanceName, parsed.remoteJid, {
      archivedAt: parsed.archived ? new Date() : null,
      deletedAt: null,
      purgedAt: null,
    });

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
    const data = await hardDeleteLocalChat(parsed.userId, parsed.instanceName, parsed.remoteJid);

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
 * Vacia la pestana Eliminados: limpia el rastro que quede de cada contacto
 * marcado y los da por purgados, para que la lista quede en cero.
 *
 * NO se borra la marca de eliminado, y no se debe borrar nunca. La lista de
 * Chats se lee de la linea de WhatsApp, no de esta base: mientras la
 * conversacion siga viva en el telefono, esa marca es lo unico que la
 * mantiene fuera de la vista. Borrarla devuelve de golpe todas las
 * conversaciones a la lista principal, que es exactamente lo que no se
 * quiere. Por eso existe purgedAt aparte: dice "aqui ya no queda nada que
 * borrar" sin destapar nada.
 *
 * Se repite la limpieza en vez de darlos por limpios porque entre el borrado
 * y el vaciado el contacto pudo haber vuelto: si el cliente escribio, la
 * linea recreo la ficha y los mensajes.
 *
 * Va por TODAS las cuentas asociadas, no solo por la activa. La pestana
 * Eliminados junta lo de todas -las marcas se leen con ese alcance-, asi que
 * limpiar solo una dejaba el resto intacto en la base: la lista se veia vacia
 * por el apaño de pantalla y al recargar volvian los mismos chats. El aviso
 * decia 61 y se limpiaban los de una cuenta.
 *
 * Cada cuenta se comprueba por separado con `assertCanDeleteChats`. Si en
 * alguna no se manda, se salta y se sigue con las demas: se limpia lo que se
 * pueda, nunca lo que no se deba.
 */
export async function purgeDeletedChatsAction(
  input: { userId: string },
): Promise<ChatPreferenceResponse<{ purged: number }>> {
  try {
    const userId = z.string().trim().min(1).parse(input.userId);
    await assertCanDeleteChats(userId);

    const user = await currentUser();
    const asociadas = user ? await getAssociatedAccountIds(user) : [];
    const cuentas = [userId, ...asociadas.filter((id) => id !== userId)];

    await ensurePurgedAtColumn();
    let count = 0;
    let saltadas = 0;
    let sinLinea = 0;

    for (const cuenta of cuentas) {
      if (cuenta !== userId) {
        try {
          await assertCanDeleteChats(cuenta);
        } catch {
          saltadas++;
          continue;
        }
      }

      const marcados = await chatConversationPreferenceTable.findMany({
        where: { userId: cuenta, deletedAt: { not: null }, purgedAt: null },
        select: { instanceName: true, remoteJid: true },
      });

      // Las marcas ANTIGUAS -las que se guardaron sin linea- se saltan.
      //
      // Este bucle relee las marcas y vuelve a llamar al borrado con SU
      // `instanceName`. Con una marca antigua eso es la cadena vacia, o sea
      // exactamente el caso que arrasaba el historial del contacto en todas las
      // lineas de la cuenta. Y ademas se reescribia como vacia, asi que el
      // problema se perpetuaba a si mismo cada vez que alguien pulsaba «Vaciar
      // eliminados».
      //
      // Se quedan como estan, sin purgar y sin `purgedAt`, hasta que se decida
      // que hacer con ellas. No purgarlas no rompe nada: la marca sigue
      // ocultando el chat igual que hoy.
      for (const { instanceName, remoteJid } of marcados) {
        try {
          await hardDeleteLocalChat(cuenta, instanceName, remoteJid);
        } catch (error) {
          if (error instanceof SinLineaParaBorrar) {
            sinLinea++;
            continue;
          }
          throw error;
        }
      }

      const limpiados = await chatConversationPreferenceTable.updateMany({
        where: {
          userId: cuenta,
          deletedAt: { not: null },
          purgedAt: null,
          // Solo se dan por limpiadas las que de verdad se limpiaron.
          NOT: { instanceName: "" },
        },
        data: { purgedAt: new Date() },
      });
      count += limpiados.count;
    }

    invalidatePersistedInboxCache();
    revalidatePath("/chats");

    // El aviso dice lo que de verdad paso. "No quedaba nada por limpiar"
    // mientras la lista enseñaba 61 era el mensaje que despistaba: no es que no
    // quedara nada, es que estaba en cuentas que no se tocaron.
    const enCuentasAjenas =
      saltadas > 0 ? ` Quedan chats en ${saltadas} cuenta${saltadas !== 1 ? "s" : ""} donde no se puede limpiar.` : "";
    // Y se dice cuantas quedaron fuera por no saber su linea, en vez de dejarlo
    // en un numero que no cuadra y no explica por que.
    const antiguas =
      sinLinea > 0
        ? ` ${sinLinea} marca${sinLinea !== 1 ? "s" : ""} antigua${sinLinea !== 1 ? "s" : ""} sin linea no se toc${sinLinea !== 1 ? "aron" : "o"}.`
        : "";

    return {
      success: true,
      message: (count > 0
        ? `${count} chat${count !== 1 ? "s" : ""} limpiado${count !== 1 ? "s" : ""} por completo.`
        : "No quedaba nada por limpiar.") + enCuentasAjenas + antiguas,
      data: { purged: count },
    };
  } catch (error) {
    console.error("[purgeDeletedChatsAction]", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "No se pudieron limpiar los chats eliminados.",
    };
  }
}

export async function restoreChatConversationAction(
  input: z.infer<typeof baseSchema>,
): Promise<ChatPreferenceResponse<ChatConversationPreference>> {
  try {
    const parsed = baseSchema.parse(input);
    await assertAuthorized(parsed.userId);

    const data = await upsertPreference(parsed.userId, parsed.instanceName, parsed.remoteJid, {
      deletedAt: null,
      purgedAt: null,
    });

    return {
      success: true,
      message: "Chat restaurado correctamente.",
      data,
    };
  } catch (error) {
    console.error("[restoreChatConversationAction]", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "No se pudo restaurar el chat.",
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
        upsertPreference(parsed.userId, parsed.instanceName, remoteJid, {
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
