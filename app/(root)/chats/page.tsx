export const dynamic = "force-dynamic";
export const revalidate = 0;

import { redirect } from "next/navigation";
import type { ApiKey, Instancia, QuickReply, Workflow } from "@prisma/client";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getApiKeyById } from "@/actions/api-action";
import {
  fetchChatsFromEvolution,
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
import {
  fetchChatsFromBaileys,
  findMessagesFromBaileys,
  sendBaileysTextAction,
  sendBaileysWorkflowAction,
  sendBaileysQuickReplyAction,
} from "@/actions/baileys-chat-actions";
import { getChatConversationPreferencesByUserId } from "@/actions/chat-conversation-actions";
import { getInstancesByUserId } from "@/actions/instances-actions";
import { getAllRRs } from "@/actions/rr-actions";
import { getChatContactSessions } from "@/actions/session-action";
import { listTagsAction } from "@/actions/tag-actions";
import { getWorkFlowByUser } from "@/actions/workflow-actions";
import { getTeamAdvisorInfos } from "@/actions/team-actions";
import { assignSessionToAdvisor, takeSession, releaseSession, transferSession } from "@/actions/advisor-assign-actions";
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
    arr.find((instance) => instance.instanceType === "baileys") ??
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
  searchParams?: { jid?: string; instance?: string };
}) {
  const user = await currentUser();
  if (!user) redirect("/login");

  // Si el usuario es asesor (tiene ownerId), usa los recursos del dueño
  const effectiveOwnerId = user.ownerId ?? user.id;
  const ownerApiKeyId =
    effectiveOwnerId !== user.id
      ? (await db.user.findUnique({ where: { id: effectiveOwnerId }, select: { apiKeyId: true } }))?.apiKeyId
      : user.apiKeyId;

  // Fase 1: todo lo que no depende de los chats corre en paralelo
  const [resInstancias, resApikey, workflowsResponse, quickRepliesResponse0] = await Promise.all([
    getInstancesByUserId(effectiveOwnerId),
    getApiKeyById(ownerApiKeyId),
    getWorkFlowByUser(effectiveOwnerId),
    getAllRRs(effectiveOwnerId),
  ]);

  const instancias = hasInstancias(resInstancias) ? resInstancias.data : [];
  const requestedInstance = searchParams?.instance;
  const whatsappInstancia = requestedInstance
    ? (instancias.find((i) => i.instanceName === requestedInstance) ?? pickWhatsappOrNull(instancias))
    : pickWhatsappOrNull(instancias);
  const apiKey = hasApikey(resApikey) ? resApikey.data : null;

  const isBaileys = whatsappInstancia?.instanceType === "baileys";

  // Fase 2: fetch chats (necesita instancia + apikey)
  const chatsResult: FetchChatsResult =
    whatsappInstancia && (isBaileys || apiKey)
      ? isBaileys
        ? await fetchChatsFromBaileys(whatsappInstancia.instanceName)
        : await fetchChatsFromEvolution(apiKey!, whatsappInstancia.instanceName)
      : {
          success: false,
          message: !whatsappInstancia
            ? "No se encontró una instancia WhatsApp válida."
            : "No hay API Key configurada.",
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

  const initialSelectedJid = initialSelectedChat?.remoteJid ?? requestedJid;

  // initialMessages se carga en el cliente via warmMessagesAction para no bloquear el render
  const initialMessages: EvoMsgFromAction[] = [];

  const workflows = hasWorkflows(workflowsResponse) ? workflowsResponse.data : [];
  const workflowOptions: ChatWorkflowOption[] = workflows.map((workflow) => ({
    id: workflow.id,
    name: workflow.name,
    isPro: workflow.isPro,
  }));

  const quickReplies = hasQuickReplies(quickRepliesResponse0) ? quickRepliesResponse0.data : [];
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

  const advisorRole: string | null = user.advisorRole;
  const currentAdvisorId: string = user.id;

  const [tagsRes, chatSessionsRes, chatPreferencesRes, advisorsRes] = await Promise.all([
    listTagsAction(effectiveOwnerId),
    chatsResult.success
      ? getChatContactSessions(
          effectiveOwnerId,
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
    getChatConversationPreferencesByUserId(effectiveOwnerId),
    getTeamAdvisorInfos(),
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
  const advisorsFromTeam = advisorsRes.success ? advisorsRes.data ?? [] : [];
  // El dueño se incluye a sí mismo para poder autoasignarse desde el badge
  const isOwner = !user.ownerId;
  const advisors = isOwner && user.id && user.email
    ? [{ id: user.id, name: user.name ?? null, email: user.email, advisorRole: null as string | null }, ...advisorsFromTeam]
    : advisorsFromTeam;
  const actionContext =
    whatsappInstancia && apiKey && !isBaileys
      ? { apiKeyData: { url: apiKey.url, key: apiKey.key }, instanceName: whatsappInstancia.instanceName }
      : null;

  const instanceNameForActions = whatsappInstancia?.instanceName ?? '';

  const warmMessagesAction = isBaileys
    ? findMessagesFromBaileys.bind(null, instanceNameForActions)
    : warmChatMessagesAction.bind(null, actionContext);

  const refetchChatsAction = isBaileys
    ? fetchChatsFromBaileys.bind(null, instanceNameForActions)
    : refetchChatsManualAction.bind(null, actionContext);

  const sendAnyAction = isBaileys
    ? sendBaileysTextAction.bind(null, instanceNameForActions)
    : sendManualChatPayloadAction.bind(null, actionContext);

  const sendWorkflowAction = isBaileys
    ? sendBaileysWorkflowAction.bind(null, instanceNameForActions)
    : sendManualWorkflowAction.bind(null, actionContext);

  const sendQuickReplyAction = isBaileys
    ? sendBaileysQuickReplyAction.bind(null, instanceNameForActions)
    : sendManualQuickReplyAction.bind(null, actionContext);
  const assignAdvisorAction = assignSessionToAdvisor;
  const takeSessionAction = takeSession;
  const releaseSessionAction = releaseSession;
  const transferSessionAction = transferSession;

  return (
    <ChatsClient
      userId={effectiveOwnerId}
      instancias={instancias}
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
      advisors={advisors}
      currentAdvisorId={currentAdvisorId}
      advisorRole={advisorRole}
      assignAdvisorAction={assignAdvisorAction}
      takeSessionAction={takeSessionAction}
      releaseSessionAction={releaseSessionAction}
      transferSessionAction={transferSessionAction}
    />
  );
}
