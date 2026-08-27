"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { buildWhatsAppJidCandidates, normalizeWhatsAppConversationJid } from "@/lib/whatsapp-jid";
import { invalidatePersistedInboxCache } from "@/lib/chat-persistence";
import type {
  ChatConversationPreference,
  ChatConversationPreferenceMap,
} from "@/types/chat";

const chatConversationPreferenceTable = db.chatConversationPreference as unknown as {
  findMany: (args: unknown) => Promise<
    Array<{
      remoteJid: string;
      pinnedAt: Date | null;
      archivedAt: Date | null;
      deletedAt: Date | null;
    }>
  >;
  upsert: (args: unknown) => Promise<{
    remoteJid: string;
    pinnedAt: Date | null;
    archivedAt: Date | null;
    deletedAt: Date | null;
  }>;
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
  },
): ChatConversationPreference {
  return {
    remoteJid: preference.remoteJid,
    pinnedAt: preference.pinnedAt?.toISOString() ?? null,
    archivedAt: preference.archivedAt?.toISOString() ?? null,
    deletedAt: preference.deletedAt?.toISOString() ?? null,
    isPinned: Boolean(preference.pinnedAt),
    isArchived: Boolean(preference.archivedAt),
    isDeleted: Boolean(preference.deletedAt),
  };
}

async function assertAuthorized(userId: string) {
  const user = await currentUser();
  if (!user || user.id !== userId) {
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
  const link = await db.$queryRaw<{ id: string }[]>`
    SELECT id
    FROM "linked_accounts"
    WHERE "master_user_id" = ${userId}
      AND "linked_user_id" = ${realUserId}
      AND role = 'administrador'::"LinkedAccountRole"
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
  },
): Promise<ChatConversationPreference> {
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
    isPinned: false,
    isArchived: false,
    isDeleted: true,
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
      },
      create: {
        userId,
        remoteJid: normalizedRemoteJid,
        pinnedAt: null,
        archivedAt: null,
        deletedAt,
      },
    });
    deletedPreferenceRow = mapPreference(preference);
  });

  invalidatePersistedInboxCache();

  revalidatePath("/chats");
  return deletedPreferenceRow ?? deletedPreference(normalizedRemoteJid);
}

export async function getChatConversationPreferencesByUserId(
  _userId?: string,
): Promise<ChatPreferenceResponse<ChatConversationPreferenceMap>> {
  try {
    const user = await currentUser();
    if (!user?.id) throw new Error("No autorizado.");

    const targetUserId = _userId?.trim() || user.ownerId || user.id;
    if (targetUserId !== user.id && targetUserId !== user.ownerId) {
      await assertCanDeleteChats(targetUserId);
    }

    const preferences = await chatConversationPreferenceTable.findMany({
      where: { userId: targetUserId },
    });

    const data = preferences
      .reduce<ChatConversationPreferenceMap>((acc, item) => {
        acc[item.remoteJid] = mapPreference(item);
        return acc;
      }, {});

    return {
      success: true,
      message: "Preferencias de chats obtenidas correctamente.",
      data,
    };
  } catch (error) {
    console.error("[getChatConversationPreferencesByUserId]", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "No se pudieron cargar las preferencias de chats.",
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
 * Vacia la pestana Eliminados: vuelve a limpiar cada contacto marcado como
 * borrado y quita su marca, para que la lista quede en cero.
 *
 * Se repite la limpieza en vez de solo borrar las marcas porque entre el
 * borrado y el vaciado el contacto pudo haber vuelto -si el cliente escribio,
 * la linea recreo la ficha y los mensajes-. Quitar la marca sin limpiar
 * primero devolveria esas conversaciones a la lista principal.
 *
 * Lo que la App no puede tocar es el WhatsApp del telefono: si la
 * conversacion sigue viva alli y el cliente vuelve a escribir, el contacto se
 * crea de nuevo. Para que no reaparezca hay que borrarla tambien en WhatsApp.
 */
export async function purgeDeletedChatsAction(
  input: { userId: string },
): Promise<ChatPreferenceResponse<{ purged: number }>> {
  try {
    const userId = z.string().trim().min(1).parse(input.userId);
    await assertCanDeleteChats(userId);

    const marcados = await chatConversationPreferenceTable.findMany({
      where: { userId, deletedAt: { not: null } },
      select: { remoteJid: true },
    });

    for (const { remoteJid } of marcados) {
      await hardDeleteLocalChat(userId, remoteJid);
    }

    const { count } = await chatConversationPreferenceTable.deleteMany({
      where: { userId, deletedAt: { not: null } },
    });

    invalidatePersistedInboxCache();
    revalidatePath("/chats");

    return {
      success: true,
      message: count > 0
        ? `${count} chat${count !== 1 ? "s" : ""} eliminado${count !== 1 ? "s" : ""} por completo.`
        : "No habia chats eliminados.",
      data: { purged: count },
    };
  } catch (error) {
    console.error("[purgeDeletedChatsAction]", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "No se pudieron eliminar por completo los chats.",
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
