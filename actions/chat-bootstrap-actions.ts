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

function withCurrentUserAdvisor(
  advisors: AdvisorInfo[],
  user: { id?: string | null; name?: string | null; email?: string | null; company?: string | null; advisorRole?: string | null },
) {
  if (!user.id) return advisors;

  const currentAdvisor: AdvisorInfo = {
    id: user.id,
    name: user.company || user.name || user.email || "Yo",
    email: user.email || "",
    advisorRole: user.advisorRole ?? null,
  };

  const map = new Map<string, AdvisorInfo>();
  map.set(currentAdvisor.id, currentAdvisor);
  for (const advisor of advisors) map.set(advisor.id, advisor);
  return Array.from(map.values());
}

async function getMissingAssignedAdvisors(
  chatSessions: ChatContactSessionMap | null | undefined,
  knownAdvisors: AdvisorInfo[],
) {
  const knownIds = new Set(knownAdvisors.map((advisor) => advisor.id));
  const missingIds = Array.from(
    new Set(
      Object.values(chatSessions ?? {})
        .map((session) => session.assignedAdvisorId)
        .filter((id): id is string => {
          if (!id) return false;
          return !knownIds.has(id);
        }),
    ),
  );

  if (missingIds.length === 0) return [];

  return db.user.findMany({
    where: { id: { in: missingIds } },
    select: {
      id: true,
      name: true,
      email: true,
      advisorRole: true,
    },
  });
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

  const quickReplyOptions = quickReplies.reduce<ChatQuickReplyOption[]>((items, quickReply) => {
    const workflow = workflows.find((item) => item.id === quickReply.workflowId);
    const message = quickReply.mensaje?.trim() ?? "";
    if (!message) return items;

    items.push({
      id: quickReply.id,
      name: quickReply.name ?? null,
      message,
      category: normalizeQuickReplyCategory(quickReply.category),
      workflowId: quickReply.workflowId ?? null,
      workflowName: workflow?.name ?? null,
    });
    return items;
  }, []);

  const chatSessions = sessionsRes?.success ? sessionsRes.data ?? {} : {};
  const advisorsFromTeam = advisorsRes?.success ? advisorsRes.data ?? [] : [];
  const baseAdvisors = withCurrentUserAdvisor(advisorsFromTeam, user);
  const missingAssignedAdvisors = await getMissingAssignedAdvisors(chatSessions, baseAdvisors);
  const advisors = withCurrentUserAdvisor([...baseAdvisors, ...missingAssignedAdvisors], user);

  return {
    success: true,
    message: "Datos de chats cargados correctamente.",
    data: {
      allTags,
      chatPreferences: preferencesRes?.success ? preferencesRes.data ?? {} : {},
      chatSessions,
      workflows: workflowOptions,
      quickReplies: quickReplyOptions,
      advisors,
      clientValidationEnabled: Boolean(clientValidationConfig),
    },
  };
}
