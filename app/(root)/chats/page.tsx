export const dynamic = "force-dynamic";
export const revalidate = 0;

import { redirect } from "next/navigation";
import type { ApiKey, Instancia, QuickReply, Workflow } from "@prisma/client";
import { currentUser } from "@/lib/auth";
import { getApiKeyById } from "@/actions/api-action";
import {
  fetchChatsFromEvolution,
  findMessagesByRemoteJid,
  type EvolutionMessage as EvoMsgFromAction,
  type FetchChatsResult,
} from "@/actions/chat-actions";
import {
  refetchChatsManualAction,
  sendManualChatPayloadAction,
  sendManualQuickReplyAction,
  sendManualWorkflowAction,
  warmChatMessagesAction,
} from "@/actions/chat-manual-actions";
import { getChatConversationPreferencesByUserId } from "@/actions/chat-conversation-actions";
import { getInstancesByUserId } from "@/actions/instances-actions";
import { getAllRRs } from "@/actions/rr-actions";
import { getChatContactSessions } from "@/actions/session-action";
import { listTagsAction } from "@/actions/tag-actions";
import { getWorkFlowByUser } from "@/actions/workflow-actions";
import { ChatsClient } from "./_components/chats-client";
import { normalizeWhatsAppConversationJid } from "@/lib/whatsapp-jid";
import type {
  ChatQuickReplyOption,
  ChatWorkflowOption,
} from "@/types/chat";

function pickWhatsappOrNull(arr: Instancia[]) {
  return (
    arr.find((instance) => instance.instanceType === "Whatsapp") ??
    arr.find((instance) => instance.instanceType == null) ??
    null
  );
}

function hasInstancias(
  result: { data?: Instancia[] | null },
): result is { data: Instancia[] } {
  return Array.isArray(result.data) && result.data.length > 0;
}

function hasApikey(result: { data?: ApiKey | null }): result is { data: ApiKey } {
  return Boolean(result.data);
}

function hasWorkflows(result: { data?: Workflow[] | null }): result is { data: Workflow[] } {
  return Array.isArray(result.data);
}

function hasQuickReplies(
  result: { data?: QuickReply[] | null },
): result is { data: QuickReply[] } {
  return Array.isArray(result.data);
}

export default async function ChatsPage({
  searchParams,
}: {
  searchParams?: { jid?: string };
}) {
  const user = await currentUser();
  if (!user) redirect("/login");

  const [resInstancias, resApikey] = await Promise.all([
    getInstancesByUserId(user.id),
    getApiKeyById(user.apiKeyId),
  ]);

  const instancias = hasInstancias(resInstancias) ? resInstancias.data : [];
  const whatsappInstancia = pickWhatsappOrNull(instancias);
  const apiKey = hasApikey(resApikey) ? resApikey.data : null;

  const chatsResult: FetchChatsResult =
    whatsappInstancia && apiKey
      ? await fetchChatsFromEvolution(apiKey, whatsappInstancia.instanceName)
      : {
          success: false,
          message: !apiKey
            ? "No hay API Key configurada."
            : "No se encontro una instancia Whatsapp valida.",
        };

  const requestedJid = searchParams?.jid
    ? normalizeWhatsAppConversationJid(searchParams.jid) || searchParams.jid
    : "";

  const initialSelectedChat =
    chatsResult.success && requestedJid
      ? chatsResult.data.find(
          (chat) => chat.remoteJid === requestedJid || chat.aliases?.includes(requestedJid),
        )
      : undefined;

  const initialSelectedJid =
    initialSelectedChat?.remoteJid ||
    (chatsResult.success && chatsResult.data.length > 0
      ? chatsResult.data[0].remoteJid
      : requestedJid);

  let initialMessages: EvoMsgFromAction[] = [];
  if (chatsResult.success && initialSelectedJid && whatsappInstancia && apiKey) {
    const messagesResponse = await findMessagesByRemoteJid(
      { url: apiKey.url, key: apiKey.key },
      whatsappInstancia.instanceName,
      initialSelectedJid,
      {
        page: 1,
        pageSize: 50,
        remoteJidAliases: initialSelectedChat?.aliases,
      },
    );

    if (messagesResponse.success) {
      initialMessages = messagesResponse.data || [];
    }
  }

  const workflowsResponse = await getWorkFlowByUser(user.id);
  const workflows = hasWorkflows(workflowsResponse) ? workflowsResponse.data : [];
  const workflowOptions: ChatWorkflowOption[] = workflows.map((workflow) => ({
    id: workflow.id,
    name: workflow.name,
    isPro: workflow.isPro,
  }));

  const quickRepliesResponse = await getAllRRs(user.id);
  const quickReplies = hasQuickReplies(quickRepliesResponse) ? quickRepliesResponse.data : [];
  const quickReplyOptions: ChatQuickReplyOption[] = quickReplies
    .map((quickReply) => {
      const workflow = workflows.find((item) => item.id === quickReply.workflowId);
      const message = quickReply.mensaje?.trim() ?? "";
      if (!message) return null;

      return {
        id: quickReply.id,
        name: quickReply.name ?? null,
        message,
        workflowId: quickReply.workflowId ?? null,
        workflowName: workflow?.name ?? null,
      };
    })
    .filter((item): item is ChatQuickReplyOption => item !== null);

  const [tagsRes, chatSessionsRes, chatPreferencesRes] = await Promise.all([
    listTagsAction(user.id),
    chatsResult.success
      ? getChatContactSessions(
          user.id,
          chatsResult.data.map((chat) => ({
            remoteJid: chat.remoteJid,
            remoteJidAlt: chat.remoteJidAlt,
            senderPn: chat.senderPn,
            pushName: chat.pushName,
            aliases: chat.aliases,
          })),
        )
      : Promise.resolve({
          success: false as const,
          message: "No se pudieron cargar las sesiones del sidebar.",
        }),
    getChatConversationPreferencesByUserId(user.id),
  ]);

  const allTags =
    tagsRes.data?.map((tag) => ({
      id: tag.id,
      name: tag.name,
      slug: tag.slug,
      color: tag.color,
      order: tag.order ?? 0,
      sessionCount: tag._count?.sessionTags ?? 0,
    })) ?? [];

  const initialChatSessions = chatSessionsRes.success ? chatSessionsRes.data ?? {} : {};
  const initialChatPreferences =
    chatPreferencesRes.success ? chatPreferencesRes.data ?? {} : {};
  const actionContext =
    whatsappInstancia && apiKey
      ? {
          apiKeyData: {
            url: apiKey.url,
            key: apiKey.key,
          },
          instanceName: whatsappInstancia.instanceName,
        }
      : null;

  const warmMessagesAction = warmChatMessagesAction.bind(null, actionContext);
  const refetchChatsAction = refetchChatsManualAction.bind(null, actionContext);
  const sendAnyAction = sendManualChatPayloadAction.bind(null, actionContext);
  const sendWorkflowAction = sendManualWorkflowAction.bind(null, actionContext);
  const sendQuickReplyAction = sendManualQuickReplyAction.bind(null, actionContext);

  return (
    <ChatsClient
      userId={user.id}
      chatsResult={chatsResult}
      initialChatPreferences={initialChatPreferences}
      initialChatSessions={initialChatSessions}
      initialSelectedJid={initialSelectedJid}
      initialMessages={initialMessages}
      instanceName={whatsappInstancia?.instanceName}
      warmMessagesAction={warmMessagesAction}
      sendAnyAction={sendAnyAction}
      sendWorkflowAction={sendWorkflowAction}
      sendQuickReplyAction={sendQuickReplyAction}
      refetchChatsAction={refetchChatsAction}
      apiKeyData={apiKey ? { url: apiKey.url, key: apiKey.key } : undefined}
      allTags={allTags}
      workflows={workflowOptions}
      quickReplies={quickReplyOptions}
    />
  );
}
