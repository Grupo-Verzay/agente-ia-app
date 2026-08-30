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
      remoteJid: string;
      pinnedAt: Date | null;
      archivedAt: Date | null;
      deletedAt: Date | null;
      purgedAt: Date | null;
    }>
  >;
  upsert: (args: unknown) => Promise<{
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
    remoteJid: string;
    pinnedAt: Date | null;
    archivedAt: Date | null;
    deletedAt: Date | null;
    purgedAt?: Date | null;
  },
): ChatConversationPreference {
  return {
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
  })().catch((error) => {
    asegurarColumnaPurgedAt = null;
    throw error;
  });

  return asegurarColumnaPurgedAt;
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

  const preference = await chatConversationPreferenceTable.upsert({
    where: {
      userId_remoteJid: {
        userId,
        remoteJid: normalizedRemoteJid,
      },
    },
    update: data,
    create: {
      userId,
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

function deletedPreference(remoteJid: string): ChatConversationPreference {
  const now = new Date().toISOString();
  return {
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

async function hardDeleteLocalChat(userId: string, remoteJid: string) {
  await ensurePurgedAtColumn();
  const normalizedRemoteJid = normalizePreferenceRemoteJid(remoteJid);
  const candidates = buildWhatsAppJidCandidates(normalizedRemoteJid);
  const deletedAt = new Date();
  let deletedPreferenceRow: ChatConversationPreference | null = null;

  await db.$transaction(async (tx) => {
    await tx.chatConversationPreference.deleteMany({
      where: {
        userId,
        remoteJid: { in: candidates.filter((candidate) => candidate !== normalizedRemoteJid) },
      },
    });

    const sessions = await tx.session.findMany({
      where: {
        userId,
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

    await tx.$executeRaw`
      DELETE FROM "chat_conversations"
      WHERE "userId" = ${userId}
        AND (
          "remoteJid" IN (${Prisma.join(candidates)})
          OR "remoteJidAlt" IN (${Prisma.join(candidates)})
          OR "senderPn" IN (${Prisma.join(candidates)})
        )
    `;

    await tx.$executeRaw`
      DELETE FROM "chat_messages"
      WHERE "userId" = ${userId}
        AND (
          "remoteJid" IN (${Prisma.join(candidates)})
          OR "remoteJidAlt" IN (${Prisma.join(candidates)})
          OR "senderPn" IN (${Prisma.join(candidates)})
        )
    `;

    await purgarRastroDelContacto(tx, userId, candidates);

    const preference = await tx.chatConversationPreference.upsert({
      where: {
        userId_remoteJid: {
          userId,
          remoteJid: normalizedRemoteJid,
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
        remoteJid: normalizedRemoteJid,
        pinnedAt: null,
        archivedAt: null,
        deletedAt,
        purgedAt: deletedAt,
      },
    });
    deletedPreferenceRow = mapPreference(preference);
  });

  invalidatePersistedInboxCache();

  revalidatePath("/chats");
  return deletedPreferenceRow ?? deletedPreference(normalizedRemoteJid);
}

/**
 * Preferencias de todas las cuentas asociadas, indexadas por `cuenta::número`.
 *
 * La bandeja lee los chats de todas las cuentas asociadas; las preferencias
 * tienen que acompañar ese alcance o lo borrado desde otra cuenta reaparece y
 * vuelve a sumar en el contador de su línea. Y van con la cuenta en la clave
 * para que la marca se aplique SOLO a los chats de esa línea.
 */
export async function getChatConversationPreferencesForAssociatedAccounts(): Promise<
  ChatPreferenceResponse<ChatConversationPreferenceMap>
> {
  try {
    const user = await currentUser();
    if (!user?.id) throw new Error("No autorizado.");

    await ensurePurgedAtColumn();
    const userIds = await getAssociatedAccountIds(user);
    const preferences = await chatConversationPreferenceTable.findMany({
      where: { userId: { in: userIds } },
      select: {
        userId: true,
        remoteJid: true,
        pinnedAt: true,
        archivedAt: true,
        deletedAt: true,
        purgedAt: true,
      },
    });

    const data = preferences.reduce<ChatConversationPreferenceMap>((acc, item) => {
      if (!item.userId) return acc;
      acc[chatPreferenceKey(item.userId, item.remoteJid)] = mapPreference(item);
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

    const data = await upsertPreference(parsed.userId, parsed.remoteJid, {
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

    const data = await upsertPreference(parsed.userId, parsed.remoteJid, {
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
    const data = await hardDeleteLocalChat(parsed.userId, parsed.remoteJid);

    return {
      success: true,
      message: "Chat eliminado correctamente.",
      data,
    };
  } catch (error) {
    console.error("[deleteChatConversationAction]", error);
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
        select: { remoteJid: true },
      });

      for (const { remoteJid } of marcados) {
        await hardDeleteLocalChat(cuenta, remoteJid);
      }

      const limpiados = await chatConversationPreferenceTable.updateMany({
        where: { userId: cuenta, deletedAt: { not: null }, purgedAt: null },
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

    return {
      success: true,
      message: (count > 0
        ? `${count} chat${count !== 1 ? "s" : ""} limpiado${count !== 1 ? "s" : ""} por completo.`
        : "No quedaba nada por limpiar.") + enCuentasAjenas,
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

    const data = await upsertPreference(parsed.userId, parsed.remoteJid, {
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
        upsertPreference(parsed.userId, remoteJid, {
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
      parsed.remoteJids.map((remoteJid) => hardDeleteLocalChat(parsed.userId, remoteJid)),
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
        upsertPreference(parsed.userId, remoteJid, {
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
