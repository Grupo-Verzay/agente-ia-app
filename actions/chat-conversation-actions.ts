"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { buildWhatsAppJidCandidates, normalizeWhatsAppConversationJid } from "@/lib/whatsapp-jid";
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
