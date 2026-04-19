"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { normalizeWhatsAppConversationJid } from "@/lib/whatsapp-jid";
import type {
  ChatConversationPreference,
  ChatConversationPreferenceMap,
} from "@/types/chat";

const chatConversationPreferenceTable = (db as any).chatConversationPreference as {
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

export async function getChatConversationPreferencesByUserId(
  userId: string,
): Promise<ChatPreferenceResponse<ChatConversationPreferenceMap>> {
  try {
    const parsedUserId = z.string().trim().min(1).parse(userId);
    await assertAuthorized(parsedUserId);

    const preferences = await chatConversationPreferenceTable.findMany({
      where: { userId: parsedUserId },
    });

    const data = preferences.reduce<ChatConversationPreferenceMap>((acc, item) => {
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
    await assertAuthorized(parsed.userId);

    const data = await upsertPreference(parsed.userId, parsed.remoteJid, {
      pinnedAt: null,
      archivedAt: null,
      deletedAt: new Date(),
    });

    return {
      success: true,
      message: "Chat eliminado de tu bandeja correctamente.",
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
