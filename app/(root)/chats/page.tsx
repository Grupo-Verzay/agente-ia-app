export const dynamic = "force-dynamic";
export const revalidate = 0;

import { redirect } from "next/navigation";
import type { ApiKey, Instancia, QuickReply, Workflow } from "@prisma/client";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getApiKeyById } from "@/actions/api-action";
import {
  fetchChatsFromEvolution,
  type ChatData,
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
import { getLinkedAccountsInstances, getMasterAccountInstances } from "@/actions/linked-account-actions";
import { ChatsClient, type InstanceActionSet } from "./_components/chats-client";
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

async function settle<T>(promise: Promise<T>): Promise<T | null> {
  try {
    return await promise;
  } catch (error) {
    console.error("[ChatsPage]", error);
    return null;
  }
}

function settleValue<T>(value: T | null | undefined): T | null {
  return value ?? null;
}

export default async function ChatsPage({
  searchParams,
}: {
  searchParams?: { jid?: string; instance?: string };
}) {
  const user = await settle(currentUser());
  if (!user) redirect("/login");

  // Si el usuario es asesor (tiene ownerId), usa los recursos del dueño
  const effectiveOwnerId = user.ownerId ?? user.id;
  const ownerApiKeyId =
    effectiveOwnerId !== user.id
      ? settleValue(
          (
            await settle(
              db.user.findUnique({ where: { id: effectiveOwnerId }, select: { apiKeyId: true } }),
            )
          )?.apiKeyId,
        )
      : user.apiKeyId;

  // Fase 1: todo lo que no depende de los chats corre en paralelo
  const [resInstancias, resApikey, workflowsResponse, quickRepliesResponse0, linkedAccountsRes, masterAccountsRes] = await Promise.all([
    settle(getInstancesByUserId(effectiveOwnerId)),
    settle(getApiKeyById(ownerApiKeyId ?? "")),
    settle(getWorkFlowByUser(effectiveOwnerId)),
    settle(getAllRRs(effectiveOwnerId)),
    settle(getLinkedAccountsInstances(user.sessionUserId)),   // asesores del usuario actual
    settle(getMasterAccountInstances(user.sessionUserId)),    // cuentas dueñas a las que está vinculado
  ]);

  const ownInstancias = resInstancias && hasInstancias(resInstancias) ? resInstancias.data : [];
  const linkedAccountsData = linkedAccountsRes?.success ? linkedAccountsRes.data : [];
  const masterAccountsData = masterAccountsRes?.success ? masterAccountsRes.data : [];

  // Instancias de asesores del usuario + instancias de cuentas maestras vinculadas
  const linkedInstancias = [
    ...linkedAccountsData.flatMap((la) => la.instances),
    ...masterAccountsData.flatMap((ma) => ma.instances),
  ].filter((li) => !ownInstancias.some((oi) => oi.instanceName === li.instanceName));

  const instancias = [...ownInstancias, ...linkedInstancias];

  // UserIds de todas las cuentas cuyas sesiones debe ver el usuario actual
  const allSessionUserIds = [
    effectiveOwnerId,
    ...linkedAccountsData.map((la) => la.linkedUserId),
    ...masterAccountsData.map((ma) => ma.masterUserId),
  ].filter((id, idx, arr) => Boolean(id) && arr.indexOf(id) === idx);

  // Meta enriquecida para la UI (incluye info de cuenta vinculada)
  const instanciasMeta = [
    ...ownInstancias.map((i) => ({
      instanceName: i.instanceName,
      instanceId: i.instanceId,
      instanceType: i.instanceType,
    })),
    ...linkedAccountsData.flatMap((la) =>
      la.instances
        .filter((li) => !ownInstancias.some((oi) => oi.instanceName === li.instanceName))
        .map((li) => ({
          instanceName: li.instanceName,
          instanceId: li.instanceId,
          instanceType: li.instanceType,
          linkedUserId: la.linkedUserId,
          company: la.company || li.instanceName,
        })),
    ),
    ...masterAccountsData.flatMap((ma) =>
      ma.instances
        .filter((li) => !ownInstancias.some((oi) => oi.instanceName === li.instanceName))
        .map((li) => ({
          instanceName: li.instanceName,
          instanceId: li.instanceId,
          instanceType: li.instanceType,
          linkedUserId: ma.masterUserId,
          company: ma.company || li.instanceName,
        })),
    ),
  ];

  const requestedInstance = searchParams?.instance;
  const whatsappInstancia = requestedInstance
    ? (instancias.find((i) => i.instanceName === requestedInstance) ?? pickWhatsappOrNull(instancias))
    : pickWhatsappOrNull(instancias);
  const apiKey = resApikey && hasApikey(resApikey) ? resApikey.data : null;

  // Fase 2: fetch chats de TODAS las instancias de mensajería en paralelo
  type FetchPlan = { instancia: Instancia; isBaileys: boolean };
  const fetchPlans: FetchPlan[] = instancias
    .filter(
      (inst) =>
        inst.instanceType === "Whatsapp" ||
        inst.instanceType === "baileys" ||
        inst.instanceType == null,
    )
    .filter((inst) => inst.instanceType === "baileys" || !!apiKey)
    .map((inst) => ({ instancia: inst, isBaileys: inst.instanceType === "baileys" }));

  let chatsResult: FetchChatsResult;
  let instanceActionSets: InstanceActionSet[] = [];

  if (fetchPlans.length === 0) {
    chatsResult = {
      success: false,
      message:
        instancias.filter(
          (i) =>
            i.instanceType === "Whatsapp" ||
            i.instanceType === "baileys" ||
            i.instanceType == null,
        ).length === 0
          ? "No se encontró una instancia WhatsApp válida."
          : "No hay API Key configurada.",
    };
  } else {
    const allFetchResults = await Promise.allSettled(
      fetchPlans.map((plan) =>
        plan.isBaileys
          ? fetchChatsFromBaileys(plan.instancia.instanceName)
          : fetchChatsFromEvolution(apiKey!, plan.instancia.instanceName),
      ),
    );

    const allChats: ChatData[] = [];
    let hasAnySuccess = false;
    for (const r of allFetchResults) {
      if (r.status === "fulfilled" && r.value.success) {
        allChats.push(...r.value.data);
        hasAnySuccess = true;
      }
    }

    // Deduplicate:
    // - Groups (@g.us): by remoteJid only — same group appears in multiple instances, show once
    // - 1-on-1 chats: by (instanceName, remoteJid) — keep separate per instance
    // Sort by most recent message first so we keep the freshest entry when deduplicating
    allChats.sort((a, b) => {
      const ta = (a.lastMessage?.messageTimestamp ?? 0);
      const tb = (b.lastMessage?.messageTimestamp ?? 0);
      return tb - ta;
    });
    // Deduplicate all chats by remoteJid — same contact appearing in multiple instances
    // shows only once (the entry with the most recent message, already sorted above).
    const seenJids = new Set<string>();
    const dedupedChats = allChats.filter((chat) => {
      if (seenJids.has(chat.remoteJid)) return false;
      seenJids.add(chat.remoteJid);
      return true;
    });

    chatsResult = hasAnySuccess
      ? { success: true, message: "OK", data: dedupedChats }
      : { success: false, message: "No se pudieron cargar los chats." };

    instanceActionSets = fetchPlans.map((plan) => {
      const inst = plan.instancia;
      const isBaileysInst = plan.isBaileys;
      const instActionCtx =
        !isBaileysInst && apiKey
          ? { apiKeyData: { url: apiKey.url, key: apiKey.key }, instanceName: inst.instanceName }
          : null;
      return {
        instanceName: inst.instanceName,
        instanceType: inst.instanceType ?? undefined,
        warmMessages: isBaileysInst
          ? findMessagesFromBaileys.bind(null, inst.instanceName)
          : warmChatMessagesAction.bind(null, instActionCtx),
        sendText: isBaileysInst
          ? sendBaileysTextAction.bind(null, inst.instanceName)
          : sendManualChatPayloadAction.bind(null, instActionCtx),
        sendWorkflow: isBaileysInst
          ? sendBaileysWorkflowAction.bind(null, inst.instanceName)
          : sendManualWorkflowAction.bind(null, instActionCtx),
        sendQuickReply: isBaileysInst
          ? sendBaileysQuickReplyAction.bind(null, inst.instanceName)
          : sendManualQuickReplyAction.bind(null, instActionCtx),
        refetchChats: isBaileysInst
          ? fetchChatsFromBaileys.bind(null, inst.instanceName)
          : refetchChatsManualAction.bind(null, instActionCtx),
      } satisfies InstanceActionSet;
    });
  }

  const isBaileys = whatsappInstancia?.instanceType === "baileys";

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

  const workflows = workflowsResponse && hasWorkflows(workflowsResponse) ? workflowsResponse.data : [];
  const workflowOptions: ChatWorkflowOption[] = workflows.map((workflow) => ({
    id: workflow.id,
    name: workflow.name,
    isPro: workflow.isPro,
  }));

  const quickReplies = quickRepliesResponse0 && hasQuickReplies(quickRepliesResponse0) ? quickRepliesResponse0.data : [];
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
    settle(listTagsAction(effectiveOwnerId)),
    chatsResult.success
      ? settle(
          getChatContactSessions(
            allSessionUserIds,
            chatsResult.data.map((chat) => ({
              remoteJid: chat.remoteJid,
              remoteJidAlt: chat.remoteJidAlt,
              senderPn: chat.senderPn,
              pushName: chat.pushName,
              aliases: chat.aliases,
            })),
          ),
        )
      : Promise.resolve(null),
    settle(getChatConversationPreferencesByUserId(effectiveOwnerId)),
    settle(getTeamAdvisorInfos()),
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

  const initialChatSessions = chatSessionsRes?.success ? chatSessionsRes.data ?? {} : {};
  const initialChatPreferences =
    chatPreferencesRes?.success ? chatPreferencesRes.data ?? {} : {};
  const advisorsFromTeam = advisorsRes?.success ? advisorsRes.data ?? [] : [];
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
      instancias={instanciasMeta}
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
      instanceActionSets={instanceActionSets}
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
