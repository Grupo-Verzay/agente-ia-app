"use server";

import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { normalizeQuickReplyCategory } from "@/lib/quick-reply-categories";
import { getChatConversationPreferencesByUserId } from "@/actions/chat-conversation-actions";
import { getChatContactSessions } from "@/actions/session-action";
import { listTagsAction } from "@/actions/tag-actions";
import { getTeamAdvisorInfos } from "@/actions/team-actions";
import { getWorkFlowByUserIds } from "@/actions/workflow-actions";
import { getAllRRsByUserIds } from "@/actions/rr-actions";
import type { AdvisorInfo } from "@/actions/team-actions";
import type {
  ChatConversationPreferenceMap,
  ChatQuickReplyOption,
  ChatWorkflowOption,
} from "@/types/chat";
import type {
  ChatContactDescriptor,
  ChatContactSessionMap,
  SimpleTag,
} from "@/types/session";

type ChatBootstrapInput = {
  sessionUserIds?: string[];
  chatDescriptors?: ChatContactDescriptor[];
};

type ChatBootstrapData = {
  allTags: SimpleTag[];
  chatPreferences: ChatConversationPreferenceMap;
  chatSessions: ChatContactSessionMap;
  workflows: ChatWorkflowOption[];
  quickReplies: ChatQuickReplyOption[];
  advisors: AdvisorInfo[];
  clientValidationEnabled: boolean;
};

type ChatBootstrapResponse = {
  success: boolean;
  message: string;
  data?: ChatBootstrapData;
};

async function settle<T>(promise: Promise<T>): Promise<T | null> {
  try {
    return await promise;
  } catch (error) {
    console.error("[loadChatBootstrapData]", error);
    return null;
  }
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return values.filter((value, index, array): value is string =>
    Boolean(value) && array.indexOf(value) === index,
  );
}

export async function loadChatBootstrapData(
  input: ChatBootstrapInput = {},
): Promise<ChatBootstrapResponse> {
  const user = await currentUser();
  if (!user?.id) {
    return { success: false, message: "No autorizado." };
  }

  const effectiveOwnerId = user.ownerId ?? user.id;
  const sessionUserIds = uniqueStrings([
    effectiveOwnerId,
    user.id,
    ...(input.sessionUserIds ?? []),
  ]);

  const descriptors = (input.chatDescriptors ?? []).filter(
    (chat) => chat.remoteJid && chat.remoteJid !== "status@broadcast",
  );

  const [
    tagsRes,
    sessionsRes,
    preferencesRes,
    workflowsRes,
    quickRepliesRes,
    advisorsRes,
    clientValidationConfig,
  ] = await Promise.all([
    settle(listTagsAction(effectiveOwnerId)),
    descriptors.length
      ? settle(getChatContactSessions(sessionUserIds, descriptors))
      : Promise.resolve(null),
    settle(getChatConversationPreferencesByUserId(effectiveOwnerId)),
    settle(getWorkFlowByUserIds(sessionUserIds)),
    settle(getAllRRsByUserIds(sessionUserIds)),
    settle(getTeamAdvisorInfos()),
    db.externalDataToolConfig
      .findFirst({
        where: {
          userId: effectiveOwnerId,
          toolType: "client_validation",
          isEnabled: true,
        },
        select: { id: true },
      })
      .catch(() => null),
  ]);

  const allTags =
    tagsRes?.data?.map((tag) => ({
      id: tag.id,
      name: tag.name,
      slug: tag.slug,
      color: tag.color,
      order: tag.order ?? 0,
      sessionCount: tag._count?.sessionTags ?? 0,
    })) ?? [];

  const workflows = workflowsRes?.success && Array.isArray(workflowsRes.data)
    ? workflowsRes.data
    : [];

  const workflowOptions: ChatWorkflowOption[] = workflows.map((workflow) => ({
    id: workflow.id,
    name: workflow.name,
    isPro: workflow.isPro,
  }));

  const quickReplies = quickRepliesRes?.success && Array.isArray(quickRepliesRes.data)
    ? quickRepliesRes.data
    : [];

  const quickReplyOptions: ChatQuickReplyOption[] = quickReplies
    .map((quickReply) => {
      const workflow = workflows.find((item) => item.id === quickReply.workflowId);
      const message = quickReply.mensaje?.trim() ?? "";
      if (!message) return null;

      return {
        id: quickReply.id,
        name: quickReply.name ?? null,
        message,
        category: normalizeQuickReplyCategory(quickReply.category),
        workflowId: quickReply.workflowId ?? null,
        workflowName: workflow?.name ?? null,
      };
    })
    .filter((item): item is ChatQuickReplyOption => item !== null);

  const advisorsFromTeam = advisorsRes?.success ? advisorsRes.data ?? [] : [];
  const isOwner = !user.ownerId;
  const advisors =
    isOwner && user.id && user.email
      ? [
          {
            id: user.id,
            name: user.name ?? null,
            email: user.email,
            advisorRole: null as string | null,
          },
          ...advisorsFromTeam,
        ]
      : advisorsFromTeam;

  return {
    success: true,
    message: "Datos de chats cargados correctamente.",
    data: {
      allTags,
      chatPreferences: preferencesRes?.success ? preferencesRes.data ?? {} : {},
      chatSessions: sessionsRes?.success ? sessionsRes.data ?? {} : {},
      workflows: workflowOptions,
      quickReplies: quickReplyOptions,
      advisors,
      clientValidationEnabled: Boolean(clientValidationConfig),
    },
  };
}
