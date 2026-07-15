"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  bulkArchiveChatsAction,
  bulkDeleteChatsAction,
  bulkPinChatsAction,
  deleteChatConversationAction,
  restoreChatConversationAction,
  setChatArchivedAction,
  toggleChatPinAction,
} from "@/actions/chat-conversation-actions";
import { assignSessionToAdvisor } from "@/actions/advisor-assign-actions";
import { loadChatBootstrapData } from "@/actions/chat-bootstrap-actions";
import { assignTagToSessionAction } from "@/actions/tag-actions";
import { getChatContactSessions } from "@/actions/session-action";
import { sendMetaTemplate, type MetaTemplateOption } from "@/actions/channel-chat-actions";
import type { AdvisorInfo } from "@/actions/team-actions";
import { useAdvisorNotifications } from "@/hooks/chats/useAdvisorNotifications";
import { useChatsRealtime, type ChatChangedPayload } from "@/hooks/chats/useChatsRealtime";
import type {
  ChatData,
  EvolutionMessage,
  FetchChatsResult,
  FindMessagesResult,
  SendMessageResult,
} from "@/actions/chat-actions";
import { ChatMain } from "./chat-main";
import { ChatSidebar } from "./chat-sidebar";
import type { TabKey } from "./chat-sidebar.types";
import { isBadContactName } from "./chat-sidebar.utils";
import { useSidebar } from "@/components/ui/sidebar";
import { PanelRightOpen } from "lucide-react";
import { NewConversationDialog } from "./NewConversationDialog";
import { CommitmentTaskDialog } from "./CommitmentTaskDialog";
import { detectCommitment, type DetectedCommitment } from "@/lib/commitment-detection";
import {
  createClientPromiseFollowUpAction,
  predictAdvisorCommitmentAction,
} from "@/actions/conversation-intelligence-actions";
import {
  buildWhatsAppJidCandidates,
  fmtPhone,
  extractWhatsAppDigits,
  pickPreferredWhatsAppRemoteJid,
} from "@/lib/whatsapp-jid";
import { avatarSrcFor } from "@/lib/avatar";
import { idbGetChat, idbSetChat } from "./chat-idb";
import type { OutgoingMessagePayload } from "./chat-main";
import type {
  ChatConversationPreference,
  ChatConversationPreferenceMap,
  ChatQuickReplyOption,
  ChatToolActionResult,
  ChatWorkflowOption,
} from "@/types/chat";
import type {
  ChatContactDescriptor,
  ChatContactSessionMap,
  ChatContactSessionSummary,
  Session,
  SimpleTag,
} from "@/types/session";

function getLastIdTimestamp(list: EvolutionMessage[]) {
  if (!list || list.length === 0) return { id: undefined as string | undefined, ts: 0 };
  const sorted = [...list].sort((a, b) => (a.messageTimestamp ?? 0) - (b.messageTimestamp ?? 0));
  const last = sorted[sorted.length - 1];
  return { id: last?.key?.id, ts: last?.messageTimestamp ?? 0 };
}

function areListsDifferent(a: EvolutionMessage[], b: EvolutionMessage[]) {
  if (a.length !== b.length) return true;
  const la = getLastIdTimestamp(a);
  const lb = getLastIdTimestamp(b);
  return la.id !== lb.id || la.ts !== lb.ts;
}

type ApiKeyData = { url: string; key: string };
// Primera página de mensajes al abrir un chat. Bajado de 50 a 25 (alineado con
// EVOLUTION_SYNC_WINDOW_SIZE del server action) para que el primer render en
// móvil pinte la mitad de burbujas y llegue menos payload por la red móvil. El
// resto del historial se trae bajo demanda al hacer scroll hacia arriba.
const INITIAL_MESSAGE_PAGE_SIZE = 25;
// Máx. de prefetch simultáneos que tocan Evolution. Acota los picos cuando se
// hacen visibles muchas filas de golpe o al precalentar los chats de arriba.
const PREFETCH_MAX_CONCURRENT = 4;
// Cuántos chats de la parte superior (los más probables de abrir) se precalientan
// proactivamente al cargar la lista, sin esperar hover ni que se hagan visibles.
const PREFETCH_TOP_CHATS = 14;
// Backfill acotado: cuántos de los chats MÁS RECIENTES se precalientan+persisten
// UNA vez por sesión, de fondo y por la cola con límite de concurrencia. Cubre el
// grueso del uso real sin bajar el archivo histórico completo (no satura Evolution
// ni el pool). Los que queden fuera se calientan solos al abrirlos por primera vez.
const BACKFILL_CHATS = 100;
const INITIAL_CHAT_SYNC_DELAY_MS = 2000;
const SELECTED_CHAT_SYNC_DELAY_MS = 3500;
const SELECTED_CHAT_POLLING_DELAY_MS = 10000;
// Intervalo de refresco de la lista de chats. Con el tiempo real activo, el
// socket mantiene la frescura; el polling queda como FALLBACK a 60s (antes 20s)
// para reconciliar si el WebSocket se cae. Reduce mucho la carga a Evolution+BD.
const LIST_SYNC_INTERVAL_MS = 60000;
// Polling ADAPTATIVO: si el WebSocket de tiempo real está caído o no
// configurado, usamos intervalos más ágiles para que igual se sienta en vivo.
// Con el socket conectado se mantienen los intervalos relajados de arriba.
const REALTIME_OFF_MSG_INTERVAL_MS = 6000;
const REALTIME_OFF_LIST_INTERVAL_MS = 15000;

type ChatMessageInfo = {
  total?: number;
  pages?: number;
  currentPage?: number;
  nextPage?: number | null;
  instanceName?: string;
  remoteJid?: string;
  remoteJidAliases?: string[];
  apiKeyData?: ApiKeyData;
  contactName?: string;
};

type ChatMessageCacheEntry = {
  messages: EvolutionMessage[];
  info: ChatMessageInfo;
};

function getMessageCacheKey(instanceName: string | null | undefined, remoteJid: string) {
  return `${instanceName ?? ""}:${remoteJid}`;
}

function extractSentMessageId(data: unknown) {
  const rec = data as Record<string, any> | null | undefined;
  return (
    rec?.key?.id ||
    rec?.message?.key?.id ||
    rec?.data?.key?.id ||
    rec?.id ||
    null
  );
}

function buildOptimisticOutgoingMessage(
  remoteJid: string,
  payload: OutgoingMessagePayload,
  sentData?: unknown,
): EvolutionMessage {
  const now = Math.floor(Date.now() / 1000);
  const messageId = extractSentMessageId(sentData) ?? `local-${now}-${Math.random().toString(36).slice(2)}`;

  if (payload.kind === "text") {
    return {
      key: { id: messageId, fromMe: true, remoteJid },
      messageType: "conversation",
      message: { conversation: payload.text },
      messageTimestamp: now,
      status: "PENDING",
    } as EvolutionMessage;
  }

  const mediaLabel =
    payload.mediatype === "image"
      ? "🖼️ Imagen"
      : payload.mediatype === "video"
        ? "🎥 Video"
        : payload.mediatype === "audio"
          ? payload.ptt
            ? "🎙️ Nota de voz"
            : "🎧 Audio"
          : "📄 Documento";
  const mediaKey = `${payload.mediatype}Message`;
  const caption = payload.caption?.trim();

  return {
    key: { id: messageId, fromMe: true, remoteJid },
    messageType: mediaKey,
    message: {
      conversation: caption || payload.fileName || mediaLabel,
      mediaUrl: payload.mediaUrl,
      [mediaKey]: {
        caption: caption || undefined,
        fileName: payload.fileName,
        mimetype: payload.mimetype,
        mediaUrl: payload.mediaUrl,
        ptt: payload.ptt,
      },
    },
    messageTimestamp: now,
    status: "PENDING",
  } as EvolutionMessage;
}

function getMessageContentForDedupe(message: EvolutionMessage) {
  const body = (message.message || {}) as Record<string, any>;
  return String(
    body.conversation ??
    body.extendedTextMessage?.text ??
    body.imageMessage?.caption ??
    body.videoMessage?.caption ??
    body.documentMessage?.caption ??
    body.audioMessage?.caption ??
    "",
  ).trim();
}

function isLocalOptimisticMessage(message: EvolutionMessage) {
  return String(message.key?.id ?? message.id ?? "").startsWith("local-");
}

export type InstanceHealth = {
  instanceName: string;
  instanceType?: string | null;
  status: "open" | "closed" | "connecting" | "error" | "unknown";
  label: string;
  message?: string;
  chats?: number;
  contacts?: number;
  messages?: number;
  updatedAt?: string;
};

export type InstanceActionSet = {
  instanceName: string;
  instanceType?: string;
  warmMessages: (
    remoteJid: string,
    opts?: { page?: number; pageSize?: number; remoteJidAliases?: string[]; localOnly?: boolean; localFirst?: boolean },
  ) => Promise<FindMessagesResult>;
  sendText: (remoteJid: string, payload: OutgoingMessagePayload) => Promise<SendMessageResult>;
  sendWorkflow: (remoteJid: string, workflowId: string) => Promise<ChatToolActionResult>;
  sendQuickReply: (remoteJid: string, quickReplyId: number) => Promise<ChatToolActionResult>;
  refetchChats: () => Promise<FetchChatsResult>;
};

function buildChatContactDescriptors(chats: ChatData[]): ChatContactDescriptor[] {
  return chats
    .filter((chat) => chat.remoteJid && chat.remoteJid !== "status@broadcast")
    .map((chat) => ({
      remoteJid: chat.remoteJid,
      remoteJidAlt: chat.remoteJidAlt,
      senderPn: chat.senderPn,
      pushName: chat.pushName,
      aliases: chat.aliases,
    }));
}

function mapSessionToChatContactSummary(session: Session): ChatContactSessionSummary {
  return {
    id: session.id,
    userId: session.userId,
    remoteJid: session.remoteJid,
    remoteJidAlt: session.remoteJidAlt,
    customName: session.customName ?? null,
    pushName: session.pushName,
    tags: session.tags ?? [],
    leadStatus: session.leadStatus ?? null,
    assignedAdvisorId: session.assignedAdvisorId ?? null,
    status: session.status,
    agentDisabled: session.agentDisabled,
  };
}

function filterChatList(result: FetchChatsResult): FetchChatsResult {
  if (!result.success) return result;

  return {
    ...result,
    data: dedupeAndSortChats(result.data).filter(
      (chat) => chat.remoteJid && chat.remoteJid !== "status@broadcast",
    ),
  };
}

function getChatSortTimestamp(chat: ChatData) {
  return (
    chat.lastMessage?.messageTimestamp ??
    (chat.updatedAt ? Math.floor(new Date(chat.updatedAt).getTime() / 1000) : 0)
  );
}

function getChatIdentityCandidates(chat: ChatData) {
  return buildWhatsAppJidCandidates(chat.remoteJid, [
    chat.remoteJidAlt,
    chat.senderPn,
    ...(chat.aliases ?? []),
    chat.lastMessage?.key?.remoteJid,
    chat.lastMessage?.key?.remoteJidAlt,
    chat.lastMessage?.key?.senderPn,
    chat.lastMessage?.senderPn,
  ]);
}

function getPreferenceForChat(chat: ChatData, preferences: ChatConversationPreferenceMap) {
  return getChatIdentityCandidates(chat)
    .map((candidate) => preferences[candidate])
    .find(Boolean);
}

function getPreferenceForJid(remoteJid: string, preferences: ChatConversationPreferenceMap) {
  return buildWhatsAppJidCandidates(remoteJid)
    .map((candidate) => preferences[candidate])
    .find(Boolean);
}

function getSessionForChat(chat: ChatData, sessions: ChatContactSessionMap) {
  return getChatIdentityCandidates(chat)
    .map((candidate) => sessions[candidate])
    .find(Boolean);
}

function resolveSendRemoteJid(selectedJid: string, contact?: ChatData) {
  const selected = selectedJid.trim();
  if (!selected) return selected;

  const hasLid =
    selected.toLowerCase().endsWith("@lid") ||
    contact?.remoteJid?.toLowerCase().endsWith("@lid") ||
    contact?.aliases?.some((alias) => alias.toLowerCase().endsWith("@lid"));

  if (!hasLid && !contact?.senderPn) return selected;

  return pickPreferredWhatsAppRemoteJid([
    contact?.senderPn,
    contact?.remoteJidAlt,
    ...(contact?.aliases ?? []),
    contact?.remoteJid,
    selected,
  ]) || selected;
}

function isChatDeletedByPreference(chat: ChatData, preference?: ChatConversationPreference) {
  if (!preference?.deletedAt) return false;

  const deletedAtMs = new Date(preference.deletedAt).getTime();
  const lastMessageMs = (chat.lastMessage?.messageTimestamp ?? 0) * 1000;
  const revivedByIncomingMessage =
    lastMessageMs > deletedAtMs && chat.lastMessage?.key?.fromMe === false;

  return !revivedByIncomingMessage;
}

function chatMatchesAnyJid(chat: ChatData, jids: Set<string>) {
  return getChatIdentityCandidates(chat).some((candidate) => jids.has(candidate));
}

function getChatMessageDuplicateKey(chat: ChatData) {
  const messageId = chat.lastMessage?.key?.id || chat.lastMessage?.id;
  if (!messageId) return "";

  return [
    chat.instanceName ?? "",
    messageId,
    chat.lastMessage?.key?.fromMe ? "1" : "0",
    chat.lastMessage?.messageType ?? "",
  ].join(":");
}

function dedupeAndSortChats(chats: ChatData[]) {
  const seenIdentities = new Set<string>();
  const seenMessages = new Set<string>();
  return [...chats]
    .sort((a, b) => getChatSortTimestamp(b) - getChatSortTimestamp(a))
    .filter((chat) => {
      if (!chat.remoteJid) return false;

      const identityCandidates = getChatIdentityCandidates(chat);
      const messageKey = getChatMessageDuplicateKey(chat);
      if (
        identityCandidates.some((candidate) => seenIdentities.has(candidate)) ||
        (messageKey && seenMessages.has(messageKey))
      ) {
        return false;
      }

      for (const candidate of identityCandidates) seenIdentities.add(candidate);
      if (messageKey) seenMessages.add(messageKey);
      return true;
    });
}

interface ChatsClientProps {
  userId: string;
  sessionUserIds?: string[];
  instancias?: { instanceName: string; instanceId: string; instanceType?: string | null; displayName?: string | null; linkedUserId?: string; company?: string }[];
  chatsResult: FetchChatsResult;
  initialChatPreferences: ChatConversationPreferenceMap;
  initialChatSessions: ChatContactSessionMap;
  initialSelectedJid: string;
  initialMessages: EvolutionMessage[];
  instanceName?: string;
  warmMessagesAction: (
    remoteJid: string,
    opts?: { page?: number; pageSize?: number; remoteJidAliases?: string[]; localOnly?: boolean; localFirst?: boolean },
  ) => Promise<FindMessagesResult>;
  sendAnyAction: (
    remoteJid: string,
    payload: OutgoingMessagePayload,
  ) => Promise<SendMessageResult>;
  sendWorkflowAction: (
    remoteJid: string,
    workflowId: string,
  ) => Promise<ChatToolActionResult>;
  sendQuickReplyAction: (
    remoteJid: string,
    quickReplyId: number,
  ) => Promise<ChatToolActionResult>;
  refetchChatsAction: () => Promise<FetchChatsResult>;
  apiKeyData?: ApiKeyData;
  instanceActionSets?: InstanceActionSet[];
  instanceHealth?: InstanceHealth[];
  allTags: SimpleTag[];
  workflows: ChatWorkflowOption[];
  quickReplies: ChatQuickReplyOption[];
  advisors?: AdvisorInfo[];
  currentAdvisorId?: string;
  advisorRole?: string | null;
  assignAdvisorAction?: (sessionId: number, advisorId: string | null) => Promise<{ success: boolean; message?: string; warning?: string }>;
  takeSessionAction?: (sessionId: number) => Promise<{ success: boolean; message?: string }>;
  releaseSessionAction?: (sessionId: number) => Promise<{ success: boolean; message?: string }>;
  transferSessionAction?: (sessionId: number, targetAdvisorId: string) => Promise<{ success: boolean; message?: string }>;
  clientValidationEnabled?: boolean;
}

export function ChatsClient({
  userId,
  sessionUserIds,
  instancias = [],
  chatsResult: initialChatsResult,
  initialChatPreferences,
  initialChatSessions,
  initialSelectedJid,
  initialMessages,
  warmMessagesAction,
  sendAnyAction,
  sendWorkflowAction,
  sendQuickReplyAction,
  refetchChatsAction,
  advisors: initialAdvisors = [],
  currentAdvisorId,
  advisorRole,
  assignAdvisorAction,
  takeSessionAction,
  releaseSessionAction,
  transferSessionAction,
  clientValidationEnabled: initialClientValidationEnabled = false,
  instanceName,
  apiKeyData,
  instanceActionSets,
  instanceHealth = [],
  allTags: initialAllTags,
  workflows: initialWorkflows,
  quickReplies: initialQuickReplies,
}: ChatsClientProps) {
  const normalizedInitialChatsResult = useMemo(
    () => filterChatList(initialChatsResult),
    [initialChatsResult],
  );

  const disconnectedInstanceNames = useMemo(
    () =>
      instanceHealth
        .filter((health) => health.status === "closed" || health.status === "error")
        .map((health) => health.instanceName),
    [instanceHealth],
  );

  useEffect(() => {
    if (disconnectedInstanceNames.length === 0) return;
    toast.error("Instancia desconectada. Vincular WhatsApp", {
      description: disconnectedInstanceNames.join(", "),
      id: "chat-instance-disconnected",
    });
  }, [disconnectedInstanceNames]);

  const initialSelectedChat =
    normalizedInitialChatsResult.success && initialSelectedJid
      ? normalizedInitialChatsResult.data.find(
          (chat) =>
            chat.remoteJid === initialSelectedJid || chat.aliases?.includes(initialSelectedJid),
        )
      : undefined;

  const [selectedJid, setSelectedJid] = useState(initialSelectedJid || "");
  const [selectedInstanceName, setSelectedInstanceName] = useState<string | null>(null);
  const [selectedChannel, setSelectedChannel] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [composeInitialContact, setComposeInitialContact] = useState<{ jid: string; name: string; phone: string } | undefined>();
  const [currentChatsResult, setCurrentChatsResult] = useState(normalizedInitialChatsResult);
  const [chatPreferences, setChatPreferences] =
    useState<ChatConversationPreferenceMap>(initialChatPreferences);
  const [chatSessions, setChatSessions] = useState<ChatContactSessionMap>(initialChatSessions);
  const [allTags, setAllTags] = useState<SimpleTag[]>(initialAllTags);
  const [workflows, setWorkflows] = useState<ChatWorkflowOption[]>(initialWorkflows);
  const [quickReplies, setQuickReplies] =
    useState<ChatQuickReplyOption[]>(initialQuickReplies);
  const [advisors, setAdvisors] = useState<AdvisorInfo[]>(initialAdvisors);
  const [clientValidationEnabled, setClientValidationEnabled] = useState(
    initialClientValidationEnabled,
  );
  const [messages, setMessages] = useState<EvolutionMessage[]>(initialMessages || []);
  const [info, setInfo] = useState<ChatMessageInfo | undefined>(
    initialSelectedJid
      ? {
          instanceName,
          remoteJid: initialSelectedJid,
          remoteJidAliases: initialSelectedChat?.aliases,
          apiKeyData,
        }
      : undefined,
  );
  const [loading, setLoading] = useState(false);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const [isSidebarVisible, setIsSidebarVisible] = useState(!initialSelectedJid);
  const [isContactPanelOpen, setIsContactPanelOpen] = useState(false);
  const [isChatListCollapsed, setIsChatListCollapsed] = useState(false);
  const [chatListTab, setChatListTab] = useState<TabKey>("all");
  const [unreadOnly, setUnreadOnly] = useState(true);
  const [closeInfoPanelSignal, setCloseInfoPanelSignal] = useState(0);
  const [sessionRefreshSignal, setSessionRefreshSignal] = useState(0);
  const [detectedCommitment, setDetectedCommitment] = useState<DetectedCommitment | null>(null);

  const goToChatTab = useCallback((tab: TabKey, unread = false) => {
    setChatListTab(tab);
    setUnreadOnly(unread);
    setIsChatListCollapsed(false);
    setIsSidebarVisible(true);
  }, []);
  const { setOpen: setNavOpen, open: navOpen } = useSidebar();
  const prevNavOpenRef = useRef<boolean>(true);

  const pollingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef(false);
  const backoffRef = useRef(0);
  // ¿El WebSocket de tiempo real está conectado? Ajusta el polling de respaldo.
  const realtimeConnectedRef = useRef(false);
  const messagesRef = useRef<EvolutionMessage[]>(initialMessages || []);
  const activeActionSetRef = useRef<InstanceActionSet | null>(null);
  const selectedJidRef = useRef(selectedJid);
  selectedJidRef.current = selectedJid;
  const selectionRequestRef = useRef(0);
  const bootstrapRequestedRef = useRef(false);
  const messageCacheRef = useRef<Map<string, ChatMessageCacheEntry>>(new Map());
  // Escribe el caché de un chat en memoria Y en IndexedDB (persistente en el
  // navegador). Lo segundo es lo que hace que reabrir un chat visitado sea
  // instantáneo con CERO red incluso tras recargar. NO se persiste apiKeyData (la
  // clave de Evolution): se reinyecta desde el contexto al leer.
  const commitCache = useCallback((cacheKey: string, entry: ChatMessageCacheEntry) => {
    messageCacheRef.current.set(cacheKey, entry);
    const { apiKeyData: _omitApiKey, ...safeInfo } = entry.info as ChatMessageInfo & {
      apiKeyData?: unknown;
    };
    void idbSetChat(cacheKey, { messages: entry.messages, info: safeInfo });
  }, []);
  // Poll de mensajes del chat abierto. Con el tiempo real activo, el socket
  // entrega los mensajes al instante; este poll queda como FALLBACK a 20s
  // (antes 6s) y además sincroniza/persiste con Evolution periódicamente.
  const BASE_INTERVAL = 20000;
  const MAX_BACKOFF = 45000;

  const getMessageKey = useCallback((message: EvolutionMessage) => {
    return (
      message.key?.id ||
      message.id ||
      `${message.key?.remoteJid ?? ""}:${message.messageTimestamp ?? 0}:${message.messageType ?? ""}:${message.key?.fromMe ? "1" : "0"}`
    );
  }, []);

  const mergeMessages = useCallback(
    (current: EvolutionMessage[], next: EvolutionMessage[]) => {
      const map = new Map<string, EvolutionMessage>();
      for (const message of current) map.set(getMessageKey(message), message);
      for (const message of next) {
        // No pisar un mensaje ya marcado como eliminado (clientDeleted viene de
        // nuestra BD, fuente autoritativa del borrado) con una versión en vivo que
        // no lo está: tras un revoke, Evolution devuelve el mensaje vacío/como stub
        // con el MISMO key.id, y sobrescribirlo hacía "desaparecer" la burbuja con
        // su badge (aunque en BD seguía; por eso F5 lo restauraba). Se conserva la
        // versión eliminada con su contenido y su badge.
        const existingSame = map.get(getMessageKey(message));
        if (existingSame?.clientDeleted && !message.clientDeleted) {
          continue;
        }
        if (!isLocalOptimisticMessage(message)) {
          const content = getMessageContentForDedupe(message);
          const timestamp = message.messageTimestamp ?? 0;
          for (const [key, existing] of Array.from(map.entries())) {
            if (!isLocalOptimisticMessage(existing)) continue;
            if (existing.key?.fromMe !== message.key?.fromMe) continue;
            if ((existing.key?.remoteJid ?? "") !== (message.key?.remoteJid ?? "")) continue;
            // La firma del asesor se antepone en el servidor ("<firma>\n<texto>"),
            // así que el mensaje real puede terminar en el texto optimista precedido
            // de un salto de línea. Se acepta ese caso para no dejar la burbuja
            // optimista duplicada mientras se envía.
            const optimisticContent = getMessageContentForDedupe(existing);
            const contentMatches =
              optimisticContent === content ||
              (optimisticContent.length > 0 && content.endsWith(`\n${optimisticContent}`));
            if (!contentMatches) continue;
            if (Math.abs((existing.messageTimestamp ?? 0) - timestamp) > 180) continue;
            map.delete(key);
          }
        }
        map.set(getMessageKey(message), message);
      }
      return Array.from(map.values()).sort((a, b) => {
        const tsDiff = (b.messageTimestamp ?? 0) - (a.messageTimestamp ?? 0);
        if (tsDiff !== 0) return tsDiff;
        return getMessageKey(b).localeCompare(getMessageKey(a));
      });
    },
    [getMessageKey],
  );

  const contacts = useMemo(() => {
    if (!currentChatsResult.success) return [];
    const all = currentChatsResult.data.filter(
      (chat) => chat.remoteJid && chat.remoteJid !== "status@broadcast",
    );
    if (advisorRole !== "agente" || !currentAdvisorId) return all;
    return all.filter((chat) => {
      const session = getSessionForChat(chat, chatSessions);
      return !session?.assignedAdvisorId || session.assignedAdvisorId === currentAdvisorId;
    });
  }, [currentChatsResult, advisorRole, currentAdvisorId, chatSessions]);

  const sidebarResult = useMemo((): FetchChatsResult => {
    if (!currentChatsResult.success) return currentChatsResult;
    return { ...currentChatsResult, data: contacts };
  }, [currentChatsResult, contacts]);

  const channelCounts = useMemo((): Record<string, number> => {
    if (!currentChatsResult.success) return {};
    const counts: Record<string, number> = {};
    for (const chat of currentChatsResult.data) {
      if (chat.instanceName) {
        counts[chat.instanceName] = (counts[chat.instanceName] ?? 0) + 1;
      }
    }
    return counts;
  }, [currentChatsResult]);

  const filteredSidebarResult = useMemo((): FetchChatsResult => {
    if (!selectedChannel || !sidebarResult.success) return sidebarResult;
    return {
      ...sidebarResult,
      data: sidebarResult.data.filter(
        (c) => !c.instanceName || c.instanceName === selectedChannel,
      ),
    };
  }, [sidebarResult, selectedChannel]);

  const visibleContacts = useMemo(
    () =>
      contacts.filter((contact) => {
        const preference = getPreferenceForChat(contact, chatPreferences);
        return !isChatDeletedByPreference(contact, preference) && !preference?.isArchived;
      }),
    [chatPreferences, contacts],
  );

  const currentContact = useMemo(() => {
    if (!contacts.length || !selectedJid) return undefined;
    return contacts.find(
      (contact) => contact.remoteJid === selectedJid || contact.aliases?.includes(selectedJid),
    );
  }, [contacts, selectedJid]);

  const currentContactSession = useMemo(() => {
    if (currentContact) return getSessionForChat(currentContact, chatSessions);
    if (!selectedJid) return undefined;
    return buildWhatsAppJidCandidates(selectedJid)
      .map((candidate) => chatSessions[candidate])
      .find(Boolean);
  }, [chatSessions, currentContact, selectedJid]);

  const currentPreference = useMemo(
    () =>
      currentContact
        ? getPreferenceForChat(currentContact, chatPreferences)
        : selectedJid
          ? getPreferenceForJid(selectedJid, chatPreferences)
          : undefined,
    [chatPreferences, currentContact, selectedJid],
  );

  const header = useMemo(() => {
    return {
      name: (() => {
        const custom = currentContactSession?.customName?.trim();
        if (custom && !isBadContactName(custom)) return custom;
        const push = currentContactSession?.pushName?.trim();
        if (push && !isBadContactName(push)) return push;
        const contactPush = currentContact?.pushName?.trim();
        if (contactPush && !isBadContactName(contactPush)) return contactPush;
        const infoName = info?.contactName?.trim();
        if (infoName && !isBadContactName(infoName)) return infoName;
        return extractWhatsAppDigits(selectedJid) || selectedJid?.split("@")[0] || "Sin nombre";
      })(),
      avatarSrc: avatarSrcFor(currentContact?.profilePicUrl, selectedJid),
      status: currentContact?.lastMessage?.messageTimestamp ? "ultimo mensaje" : "-",
      isPinned: currentPreference?.isPinned ?? false,
    };
  }, [currentContact, currentContactSession, currentPreference?.isPinned, info?.contactName, selectedJid]);

  useEffect(() => {
    if (initialSelectedJid && !selectedJid && visibleContacts.length > 0) {
      const firstContact = visibleContacts[0];
      const first = firstContact.remoteJid;

      setSelectedJid(first);
      setInfo((currentInfo) => ({
        ...(currentInfo ?? {}),
        instanceName,
        remoteJid: first,
        remoteJidAliases: firstContact.aliases,
        apiKeyData,
      }));

      setIsSidebarVisible(false);
    }
  }, [apiKeyData, initialSelectedJid, instanceName, selectedJid, visibleContacts]);

  useEffect(() => {
    if (!selectedJid) return;
    if (!currentContact) return;
    if (!isChatDeletedByPreference(currentContact, currentPreference)) return;

    setSelectedJid("");
    setMessages([]);
    setInfo(undefined);
  }, [currentContact, currentPreference, selectedJid]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Notificaciones: nuevas asignaciones para asesores + mensajes nuevos con agente inactivo
  const { pendingUnreadJids } = useAdvisorNotifications(chatSessions, currentAdvisorId, advisorRole, currentChatsResult, selectedJid);

  const toggleSidebarVisibility = useCallback(() => {
    setIsSidebarVisible((previous) => !previous);
  }, []);

  const autoClosedNavRef = useRef(false);
  useEffect(() => {
    if (isContactPanelOpen) {
      prevNavOpenRef.current = navOpen;
      setNavOpen(false);
      autoClosedNavRef.current = true;
    } else if (autoClosedNavRef.current) {
      setNavOpen(prevNavOpenRef.current);
      autoClosedNavRef.current = false;
    }
  }, [isContactPanelOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (navOpen && isContactPanelOpen) {
      setCloseInfoPanelSignal((n) => n + 1);
    }
  }, [navOpen]);

  const prevNavOpenForChatRef = useRef<boolean | null>(null);
  useEffect(() => {
    if (selectedJid) {
      if (prevNavOpenForChatRef.current === null) {
        prevNavOpenForChatRef.current = navOpen;
        if (navOpen) setNavOpen(false);
      }
    } else {
      if (prevNavOpenForChatRef.current !== null) {
        setNavOpen(prevNavOpenForChatRef.current);
        prevNavOpenForChatRef.current = null;
      }
    }
  }, [selectedJid]); // eslint-disable-line react-hooks/exhaustive-deps

  const refreshChatSessions = useCallback(
    async (chats: ChatData[]) => {
      const descriptors = buildChatContactDescriptors(chats);

      if (descriptors.length === 0) {
        setChatSessions({});
        return;
      }

      const result = await getChatContactSessions(sessionUserIds?.length ? sessionUserIds : userId, descriptors);
      if (result.success) {
        setChatSessions((prev) => {
          const next = { ...(result.data ?? {}) };
          // Preservar customName de memoria si DB aún no lo tiene (race condition de rename)
          for (const jid of Object.keys(next)) {
            if (!next[jid].customName && prev[jid]?.customName) {
              next[jid] = { ...next[jid], customName: prev[jid].customName };
            }
          }
          return next;
        });
      }
    },
    [sessionUserIds, userId],
  );

  useEffect(() => {
    if (bootstrapRequestedRef.current || !currentChatsResult.success) return;
    bootstrapRequestedRef.current = true;

    let cancelled = false;
    const timer = window.setTimeout(() => {
      void loadChatBootstrapData({
        sessionUserIds: sessionUserIds?.length ? sessionUserIds : [userId],
        chatDescriptors: buildChatContactDescriptors(currentChatsResult.data),
      }).then((result) => {
        if (cancelled || !result.success || !result.data) return;
        const data = result.data;

        setAllTags(data.allTags);
        setWorkflows(data.workflows);
        setQuickReplies(data.quickReplies);
        setAdvisors(data.advisors);
        setClientValidationEnabled(data.clientValidationEnabled);
        setChatPreferences(data.chatPreferences);
        setChatSessions((prev) => {
          const next = { ...data.chatSessions };
          for (const jid of Object.keys(next)) {
            if (!next[jid].customName && prev[jid]?.customName) {
              next[jid] = { ...next[jid], customName: prev[jid].customName };
            }
          }
          return next;
        });
      });
    }, 100);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [currentChatsResult, sessionUserIds, userId]);

  const refetchAllInstances = useCallback(async (): Promise<FetchChatsResult> => {
    if (!instanceActionSets?.length) return refetchChatsAction();
    const results = await Promise.allSettled(instanceActionSets.map((s) => s.refetchChats()));
    const allChats: ChatData[] = [];
    for (const r of results) {
      if (r.status === "fulfilled" && r.value.success) allChats.push(...r.value.data);
    }
    return { success: true, message: "OK", data: dedupeAndSortChats(allChats) };
  }, [instanceActionSets, refetchChatsAction]);

  const refreshSidebarData = useCallback(async () => {
    const chatRefreshResult = await refetchAllInstances();
    if (!chatRefreshResult.success) return;

    const filtered = filterChatList(chatRefreshResult);
    setCurrentChatsResult(filtered);

    if (filtered.success) {
      await refreshChatSessions(filtered.data);
    }
  }, [refetchAllInstances, refreshChatSessions]);

  const applyChatPreference = useCallback((preference: ChatConversationPreference) => {
    setChatPreferences((previous) => ({
      ...previous,
      [preference.remoteJid]: preference,
    }));
  }, []);

  const handleSessionResolved = useCallback(
    (remoteJid: string, session: Session | null) => {
      setChatSessions((previous) => {
        if (!remoteJid) return previous;

        if (!session) {
          if (!(remoteJid in previous)) return previous;
          const next = { ...previous };
          delete next[remoteJid];
          return next;
        }

        const mapped = mapSessionToChatContactSummary(session);
        // Preservar customName existente en memoria si el fetch de DB trae null
        // (evita parpadeo cuando la sesión fue renombrada antes del campo customName)
        const prevCustomName = previous[remoteJid]?.customName;
        if (!mapped.customName && prevCustomName) {
          mapped.customName = prevCustomName;
        }
        return { ...previous, [remoteJid]: mapped };
      });
    },
    [],
  );

  const handleLeadStatusChange = useCallback(
    (remoteJid: string, status: import("@/types/session").LeadStatus | null) => {
      setChatSessions((previous) => {
        const current = previous[remoteJid];
        if (!current) return previous;
        return { ...previous, [remoteJid]: { ...current, leadStatus: status } };
      });
    },
    [],
  );

  const handleServiceTypeChange = useCallback(
    (remoteJid: string, value: import("@/types/session").ServiceType | null) => {
      setChatSessions((previous) => {
        const current = previous[remoteJid];
        if (!current) return previous;
        return { ...previous, [remoteJid]: { ...current, serviceType: value } };
      });
    },
    [],
  );

  const handleClientStatusChange = useCallback(
    (remoteJid: string, value: import("@/types/session").ClientStatus | null) => {
      setChatSessions((previous) => {
        const current = previous[remoteJid];
        if (!current) return previous;
        return { ...previous, [remoteJid]: { ...current, clientStatus: value } };
      });
    },
    [],
  );

  const handleAssignAdvisor = useCallback(
    async (remoteJid: string, advisorId: string | null) => {
      const sessionSummary = chatSessions[remoteJid];
      if (!sessionSummary?.id) {
        toast.error("No hay sesión CRM para asignar.");
        return;
      }

      if (advisorRole === "agente") {
        if (advisorId === null) {
          // Agente libera su propia conversación
          if (!releaseSessionAction) return;
          const res = await releaseSessionAction(sessionSummary.id);
          if (!res.success) { toast.error(res.message ?? "Error al liberar."); return; }
          setChatSessions((prev) => ({
            ...prev,
            [remoteJid]: { ...prev[remoteJid]!, assignedAdvisorId: null },
          }));
          toast.success("Conversación liberada.");
        } else if (advisorId !== currentAdvisorId) {
          // Agente transfiere a otro asesor
          if (!transferSessionAction) return;
          const res = await transferSessionAction(sessionSummary.id, advisorId);
          if (!res.success) { toast.error(res.message ?? "Error al transferir."); return; }
          setChatSessions((prev) => ({
            ...prev,
            [remoteJid]: { ...prev[remoteJid]!, assignedAdvisorId: advisorId },
          }));
          toast.success("Conversación transferida.");
        } else {
          // Agente toma conversación sin asignar
          if (!takeSessionAction) return;
          const res = await takeSessionAction(sessionSummary.id);
          if (!res.success) { toast.error(res.message ?? "Error al tomar la conversación."); return; }
          setChatSessions((prev) => ({
            ...prev,
            [remoteJid]: { ...prev[remoteJid]!, assignedAdvisorId: currentAdvisorId ?? null },
          }));
          toast.success("Conversación tomada.");
        }
      } else {
        if (!assignAdvisorAction) return;
        const res = await assignAdvisorAction(sessionSummary.id, advisorId);
        if (!res.success) { toast.error(res.message ?? "Error al asignar."); return; }
        setChatSessions((prev) => ({
          ...prev,
          [remoteJid]: { ...prev[remoteJid]!, assignedAdvisorId: advisorId },
        }));
        if (res.warning) toast.warning(res.warning);
        if (advisorId) {
          const advisorName = advisors?.find((a) => a.id === advisorId)?.name ?? "Asesor";
          toast.success(`Asignado a ${advisorName}.`);
        } else {
          toast.success("Asignación removida.");
        }
      }
    },
    [chatSessions, advisorRole, advisors, currentAdvisorId, takeSessionAction, assignAdvisorAction, releaseSessionAction, transferSessionAction],
  );

  const handleSessionRename = useCallback((jid: string, name: string) => {
    setChatSessions((prev) => {
      if (!prev[jid]) return prev;
      return { ...prev, [jid]: { ...prev[jid]!, customName: name, pushName: name } };
    });
  }, []);

  const handleSessionTagsChange = useCallback(
    (remoteJid: string, selectedIds: number[]) => {
      setChatSessions((previous) => {
        const currentSession = previous[remoteJid];
        if (!currentSession) return previous;

        return {
          ...previous,
          [remoteJid]: {
            ...currentSession,
            tags: allTags.filter((tag) => selectedIds.includes(tag.id)),
          },
        };
      });
    },
    [allTags],
  );

  const pollAndCompareMessages = useCallback(
    async (remoteJid: string, remoteJidAliases?: string[]) => {
      if (inFlightRef.current) return;
      if (typeof document !== "undefined" && document.hidden) return;

      inFlightRef.current = true;

      try {
        const activeSet = activeActionSetRef.current;
        const effectiveWarmMessages = activeSet?.warmMessages ?? warmMessagesAction;
        const effectiveInstanceName = activeSet?.instanceName ?? instanceName;
        const effectiveApiKeyData = activeSet?.instanceType === "baileys" ? undefined : apiKeyData;

        const result = await effectiveWarmMessages(remoteJid, {
          page: 1,
          pageSize: INITIAL_MESSAGE_PAGE_SIZE,
          remoteJidAliases,
        });

        if (result?.success) {
          const nextMessages = result.data || [];
          if (areListsDifferent(messagesRef.current, nextMessages)) {
            setMessages((previous) => mergeMessages(previous, nextMessages));
            setInfo((currentInfo) => {
              const loadedPage = currentInfo?.currentPage ?? 1;
              return {
                total: result.total ?? currentInfo?.total,
                pages: result.pages ?? currentInfo?.pages,
                currentPage: loadedPage,
                nextPage: loadedPage > 1 ? currentInfo?.nextPage : result.nextPage,
                instanceName: effectiveInstanceName,
                remoteJid,
                remoteJidAliases,
                apiKeyData: effectiveApiKeyData,
              };
            });
          }
          backoffRef.current = 0;
        } else {
          backoffRef.current = Math.min(
            (backoffRef.current || BASE_INTERVAL) * 2,
            MAX_BACKOFF,
          );
        }
      } catch {
        backoffRef.current = Math.min(
          (backoffRef.current || BASE_INTERVAL) * 2,
          MAX_BACKOFF,
        );
      } finally {
        inFlightRef.current = false;
      }
    },
    [apiKeyData, instanceName, mergeMessages, warmMessagesAction],
  );

  // Precalienta el historial de una conversación (página 1, solo local) y lo
  // deja en el cache en memoria SIN cambiar la selección ni la UI. Se dispara al
  // pasar el mouse/tocar un chat en la lista, de modo que al hacer click los
  // mensajes ya están listos y la apertura se siente instantánea (estilo
  // WhatsApp/Chatwoot). Es idempotente y barato: si ya hay cache, no hace nada.
  const prefetchingRef = useRef<Set<string>>(new Set());
  // Chats ya intentados en esta sesión del navegador. Acota la carga cuando el
  // prefetch se dispara al hacer VISIBLE cada fila (IntersectionObserver en
  // móvil): sin esto, hacer scroll arriba/abajo re-consultaría la BD por cada
  // chat sin historial (los que sí tienen historial ya frenan por el cache). Se
  // marca solo tras una lectura EXITOSA, así un fallo de red sí puede reintentar.
  const prefetchAttemptedRef = useRef<Set<string>>(new Set());
  // Cola con límite de concurrencia para el prefetch: al hacerse visibles muchas
  // filas a la vez (render inicial / scroll) NO disparamos decenas de fetch a
  // Evolution en paralelo, sino como máximo PREFETCH_MAX_CONCURRENT; el resto
  // espera en cola y drena al liberarse un cupo. Evita picos sobre Evolution.
  const prefetchQueueRef = useRef<Array<{ remoteJid: string; contactInstanceName?: string; cacheKey: string }>>([]);
  const prefetchQueuedRef = useRef<Set<string>>(new Set());
  const prefetchActiveRef = useRef(0);
  // Guarda para que el backfill acotado corra UNA sola vez por sesión.
  const backfillStartedRef = useRef(false);

  const resolvePrefetchTarget = useCallback(
    (remoteJid: string, contactInstanceName?: string) => {
      const selectedContact = contacts.find(
        (contact) =>
          (contactInstanceName ? contact.instanceName === contactInstanceName : true) &&
          (contact.remoteJid === remoteJid || contact.aliases?.includes(remoteJid)),
      ) ?? contacts.find(
        (contact) => contact.remoteJid === remoteJid || contact.aliases?.includes(remoteJid),
      );
      const actionSet =
        instanceActionSets?.find((s) => s.instanceName === selectedContact?.instanceName) ?? null;
      const effectiveInstanceName = selectedContact?.instanceName ?? instanceName;
      const effectiveApiKeyData = actionSet?.instanceType === "baileys" ? undefined : apiKeyData;
      const effectiveWarmMessages = actionSet?.warmMessages ?? warmMessagesAction;
      const cacheKey = getMessageCacheKey(effectiveInstanceName, remoteJid);
      return {
        selectedContact,
        effectiveInstanceName,
        effectiveApiKeyData,
        effectiveWarmMessages,
        cacheKey,
      };
    },
    [apiKeyData, contacts, instanceActionSets, instanceName, warmMessagesAction],
  );

  const prefetchChat = useCallback(
    (remoteJid: string, contactInstanceName?: string) => {
      if (!remoteJid) return;

      const isDone = (cacheKey: string) =>
        messageCacheRef.current.has(cacheKey) ||
        prefetchingRef.current.has(cacheKey) ||
        prefetchAttemptedRef.current.has(cacheKey);

      const drain = () => {
        while (prefetchActiveRef.current < PREFETCH_MAX_CONCURRENT && prefetchQueueRef.current.length) {
          const item = prefetchQueueRef.current.shift()!;
          prefetchQueuedRef.current.delete(item.cacheKey);
          runOne(item.remoteJid, item.contactInstanceName);
        }
      };

      const runOne = (rj: string, inst?: string) => {
        const t = resolvePrefetchTarget(rj, inst);
        // Otro flujo pudo completarlo mientras esperaba en cola → saltar.
        if (isDone(t.cacheKey)) return;

        prefetchingRef.current.add(t.cacheKey);
        prefetchActiveRef.current += 1;
        // localFirst: si YA hay historial local devuelve al instante (barato, sin
        // Evolution); si NO, trae de Evolution y lo persiste en 2º plano (backfill).
        // Así el chat queda listo para abrir instantáneo y la próxima sesión lo lee
        // de local. Se intenta una sola vez por sesión (prefetchAttemptedRef).
        void t
          .effectiveWarmMessages(rj, {
            page: 1,
            pageSize: INITIAL_MESSAGE_PAGE_SIZE,
            remoteJidAliases: t.selectedContact?.aliases,
            localFirst: true,
          })
          .then((result) => {
            if (!result?.success) return;
            // Lectura OK (con o sin datos) → no reintentar este chat en la sesión.
            prefetchAttemptedRef.current.add(t.cacheKey);
            // No cachear vacío: haría que el click tomara la rama "cacheada" y
            // mostrara el chat en blanco sin skeleton ni sincronización inmediata.
            if (!result.data?.length) return;
            // Otro flujo pudo haber poblado el cache mientras tanto; no lo pisamos.
            if (messageCacheRef.current.has(t.cacheKey)) return;
            commitCache(t.cacheKey, {
              messages: result.data || [],
              info: {
                total: result.total,
                pages: result.pages,
                currentPage: result.currentPage,
                nextPage: result.nextPage,
                instanceName: t.effectiveInstanceName,
                remoteJid: rj,
                remoteJidAliases: t.selectedContact?.aliases,
                apiKeyData: t.effectiveApiKeyData,
              },
            });
          })
          .catch(() => {
            // Prefetch es best-effort: si falla, el click abrirá normalmente.
          })
          .finally(() => {
            prefetchingRef.current.delete(t.cacheKey);
            prefetchActiveRef.current -= 1;
            drain();
          });
      };

      const { cacheKey } = resolvePrefetchTarget(remoteJid, contactInstanceName);
      // Ya cacheado / en vuelo / intentado / ya en cola → nada que hacer.
      if (isDone(cacheKey) || prefetchQueuedRef.current.has(cacheKey)) return;

      prefetchQueuedRef.current.add(cacheKey);
      prefetchQueueRef.current.push({ remoteJid, contactInstanceName, cacheKey });
      drain();
    },
    [resolvePrefetchTarget, commitCache],
  );

  // Warm proactivo: al cargar/actualizar la lista, precalentamos en 2º plano los
  // primeros chats (los más probables de abrir) para que el click sea instantáneo
  // sin depender de hover ni de que la fila se haga visible. La cola con límite de
  // concurrencia evita picos y prefetchChat es idempotente (no repite ya hechos).
  useEffect(() => {
    if (!contacts.length) return;
    const timer = setTimeout(() => {
      for (const contact of contacts.slice(0, PREFETCH_TOP_CHATS)) {
        prefetchChat(contact.remoteJid, contact.instanceName);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [contacts, prefetchChat]);

  // Backfill acotado (una vez por sesión): tras cargar la lista, precalienta+persiste
  // en 2º plano los BACKFILL_CHATS más recientes para que abran instantáneo desde ya.
  // Va por la MISMA cola con límite de concurrencia (máx. PREFETCH_MAX_CONCURRENT),
  // así no satura Evolution ni agota el pool de la BD. prefetchChat es idempotente:
  // los ya persistidos se leen local (barato) y no se repiten llamadas a Evolution.
  // No cancelamos el timer al cambiar la lista para que el backfill sí llegue a correr.
  useEffect(() => {
    if (backfillStartedRef.current || !contacts.length) return;
    backfillStartedRef.current = true;
    const snapshot = contacts.slice(0, BACKFILL_CHATS);
    window.setTimeout(() => {
      for (const contact of snapshot) {
        prefetchChat(contact.remoteJid, contact.instanceName);
      }
    }, 900);
  }, [contacts, prefetchChat]);

  const handleSelectFromSidebar = useCallback(
    async (remoteJid: string, contactInstanceName?: string) => {
      if (!remoteJid) {
        setSelectedJid("");
        setSelectedInstanceName(null);
        setMessages([]);
        setIsSidebarVisible(true);
        activeActionSetRef.current = null;
        return;
      }
      const selectedContact = contacts.find(
        (contact) =>
          (contactInstanceName ? contact.instanceName === contactInstanceName : true) &&
          (contact.remoteJid === remoteJid || contact.aliases?.includes(remoteJid)),
      ) ?? contacts.find(
        (contact) => contact.remoteJid === remoteJid || contact.aliases?.includes(remoteJid),
      );
      const remoteJidAliases = selectedContact?.aliases;

      const actionSet =
        instanceActionSets?.find((s) => s.instanceName === selectedContact?.instanceName) ?? null;
      activeActionSetRef.current = actionSet;

      const effectiveInstanceName = selectedContact?.instanceName ?? instanceName;
      const effectiveApiKeyData = actionSet?.instanceType === "baileys" ? undefined : apiKeyData;
      const effectiveWarmMessages = actionSet?.warmMessages ?? warmMessagesAction;
      const cacheKey = getMessageCacheKey(effectiveInstanceName, remoteJid);
      const cachedMessages = messageCacheRef.current.get(cacheKey);

      if (selectedJid !== remoteJid) setSelectedJid(remoteJid);
      setSelectedInstanceName(selectedContact?.instanceName ?? null);
      if (isSidebarVisible) setIsSidebarVisible(false);

      setInfo((currentInfo) => ({
        ...(currentInfo ?? {}),
        instanceName: effectiveInstanceName,
        remoteJid,
        remoteJidAliases,
        apiKeyData: effectiveApiKeyData,
        contactName: selectedContact?.pushName && !isBadContactName(selectedContact.pushName)
          ? selectedContact.pushName
          : undefined,
      }));
      const requestId = selectionRequestRef.current + 1;
      selectionRequestRef.current = requestId;
      if (cachedMessages) {
        setLoading(false);
        setMessages(cachedMessages.messages);
        setInfo({
          ...cachedMessages.info,
          instanceName: effectiveInstanceName,
          remoteJid,
          remoteJidAliases,
          apiKeyData: effectiveApiKeyData,
          contactName: selectedContact?.pushName && !isBadContactName(selectedContact.pushName)
            ? selectedContact.pushName
            : cachedMessages.info.contactName,
        });
      } else {
        setLoading(true);
        setMessages([]);
        // Sin copia en memoria → intentamos IndexedDB (almacenamiento del navegador,
        // CERO red). Si hay copia local la mostramos AL INSTANTE mientras el warm de
        // abajo reconcilia con el servidor. Esto es lo que hace que reabrir un chat
        // visitado sea instantáneo incluso tras recargar (como WhatsApp).
        void idbGetChat(cacheKey).then((stored) => {
          if (!stored || selectionRequestRef.current !== requestId) return;
          // El servidor ya respondió (o llegaron mensajes) → no pisamos con lo local.
          if (messagesRef.current.length > 0) return;
          const storedMessages = stored.messages as EvolutionMessage[];
          if (!storedMessages.length) return;
          const hydratedInfo = {
            ...(stored.info as ChatMessageInfo),
            instanceName: effectiveInstanceName,
            remoteJid,
            remoteJidAliases,
            apiKeyData: effectiveApiKeyData,
          };
          messageCacheRef.current.set(cacheKey, { messages: storedMessages, info: hydratedInfo });
          setMessages(storedMessages);
          setInfo(hydratedInfo);
          setLoading(false);
        });
      }

      try {
        // UNA sola llamada al servidor para abrir (modo localFirst): el servidor lee
        // el historial local y, SI está vacío, cae al fetch remoto de Evolution en la
        // MISMA llamada. Antes eran DOS server actions en fila (local vacío + remoto),
        // cada una con su latencia de red móvil y su auth → el doble de espera al
        // abrir por primera vez un chat sin historial. (Baileys/canales lo soportan
        // igual; canales siempre son locales.)
        const openResult = await effectiveWarmMessages(remoteJid, {
          page: 1,
          pageSize: INITIAL_MESSAGE_PAGE_SIZE,
          remoteJidAliases,
          localFirst: true,
        });

        if (selectionRequestRef.current !== requestId) return;

        const openMessages = openResult?.success ? (openResult.data || []) : [];
        const hasMessages = openMessages.length > 0;

        if (openResult?.success) {
          const nextInfo = {
            total: openResult.total,
            pages: openResult.pages,
            currentPage: openResult.currentPage,
            nextPage: openResult.nextPage,
            instanceName: effectiveInstanceName,
            remoteJid,
            remoteJidAliases,
            apiKeyData: effectiveApiKeyData,
          };
          setMessages(openMessages);
          setInfo(nextInfo);
          // Solo cacheamos cuando hay contenido real: un cache vacío haría que la
          // próxima apertura tome la rama "cacheada" y muestre el chat en blanco.
          if (hasMessages) {
            commitCache(cacheKey, {
              messages: openMessages,
              info: nextInfo,
            });
          }
        } else {
          setMessages([]);
          setInfo((currentInfo) => ({
            ...(currentInfo ?? {}),
            instanceName: effectiveInstanceName,
            remoteJid,
            remoteJidAliases,
            apiKeyData: effectiveApiKeyData,
          }));
        }

        setLoading(false);

        // Freshen en 2º plano SOLO si ya mostramos algo: trae mensajes llegados desde
        // la última persistencia. Si vino vacío, la llamada localFirst ya intentó el
        // remoto en la misma llamada, así que no hace falta repetirlo.
        if (hasMessages) {
          window.setTimeout(() => {
            if (selectionRequestRef.current !== requestId) return;

            void effectiveWarmMessages(remoteJid, {
              page: 1,
              pageSize: INITIAL_MESSAGE_PAGE_SIZE,
              remoteJidAliases,
            })
              .then((syncResult) => {
                if (selectionRequestRef.current !== requestId || !syncResult?.success) return;
                const merged = mergeMessages(messagesRef.current, syncResult.data || []);
                const nextInfo = {
                  total: syncResult.total,
                  pages: syncResult.pages,
                  currentPage: syncResult.currentPage,
                  nextPage: syncResult.nextPage,
                  instanceName: effectiveInstanceName,
                  remoteJid,
                  remoteJidAliases,
                  apiKeyData: effectiveApiKeyData,
                };
                setMessages(merged);
                setInfo(nextInfo);
                if (merged.length > 0) {
                  commitCache(cacheKey, {
                    messages: merged,
                    info: nextInfo,
                  });
                }
              })
              .catch(() => {
                // Keep the messages visible if the background sync fails.
              });
          }, SELECTED_CHAT_SYNC_DELAY_MS);
        }
      } catch {
        setMessages([]);
        setInfo((currentInfo) => ({
          ...(currentInfo ?? {}),
          instanceName: effectiveInstanceName,
          remoteJid,
          remoteJidAliases,
          apiKeyData: effectiveApiKeyData,
        }));
        setLoading(false);
      }
    },
    [apiKeyData, contacts, instanceActionSets, instanceName, isSidebarVisible, mergeMessages, selectedJid, warmMessagesAction, commitCache],
  );

  const handleSendAny = useCallback(
    async (payload: OutgoingMessagePayload) => {
      if (!selectedJid) {
        throw new Error("No hay un chat seleccionado para enviar el mensaje.");
      }

      const sendJid = resolveSendRemoteJid(selectedJid, currentContact);
      const cacheInstanceName = activeActionSetRef.current?.instanceName ?? currentContact?.instanceName ?? instanceName;
      const writeMessagesCache = (msgs: EvolutionMessage[]) => {
        if (!cacheInstanceName) return;
        commitCache(getMessageCacheKey(cacheInstanceName, selectedJid), {
          messages: msgs,
          info: {
            ...(info ?? {}),
            instanceName: cacheInstanceName,
            remoteJid: selectedJid,
            remoteJidAliases: currentContact?.aliases,
            apiKeyData: activeActionSetRef.current?.instanceType === "baileys" ? undefined : apiKeyData,
          },
        });
      };

      // 1) Optimista INMEDIATO (antes de subir a Evolution): la burbuja aparece ya
      //    —con su imagen / nota de voz y un relojito "pendiente"— en lugar del viejo
      //    cuadro gris "Enviando...". Lleva un id local- para reconciliarlo luego.
      const localOptimistic = buildOptimisticOutgoingMessage(selectedJid, payload);
      const localKey = getMessageKey(localOptimistic);
      setMessages((previous) => {
        const merged = mergeMessages(previous, [localOptimistic]);
        writeMessagesCache(merged);
        return merged;
      });

      let result: SendMessageResult;
      try {
        result = await (activeActionSetRef.current?.sendText ?? sendAnyAction)(sendJid, payload);
      } catch (error) {
        // Falló la subida/envío → quitar la burbuja optimista para no dejar fantasma.
        setMessages((previous) => {
          const cleaned = previous.filter((m) => getMessageKey(m) !== localKey);
          writeMessagesCache(cleaned);
          return cleaned;
        });
        throw error;
      }
      if (!result.success) {
        setMessages((previous) => {
          const cleaned = previous.filter((m) => getMessageKey(m) !== localKey);
          writeMessagesCache(cleaned);
          return cleaned;
        });
        throw new Error(result.message || "No se pudo enviar el mensaje.");
      }

      // 2) Reemplazar la optimista local por la versión con el id REAL del servidor,
      //    para que el poll/tiempo real deduplique por key (más fiable que por
      //    contenido, que en media sin caption no coincide) y no quede duplicada.
      const realOptimistic = buildOptimisticOutgoingMessage(selectedJid, payload, result.data);
      setMessages((previous) => {
        const withoutLocal = previous.filter((m) => getMessageKey(m) !== localKey);
        const merged = mergeMessages(withoutLocal, [realOptimistic]);
        writeMessagesCache(merged);
        return merged;
      });

      if (payload.kind === "text") {
        const immediateCommitment = detectCommitment(payload.text);
        setDetectedCommitment(immediateCommitment);

        // El detector local cubre frases frecuentes sin latencia. Cuando no hay
        // coincidencia, la IA interpreta expresiones naturales más variadas.
        if (!immediateCommitment) {
          const sentToJid = selectedJid;
          void predictAdvisorCommitmentAction(payload.text).then((prediction) => {
            if (prediction.commitment && sentToJid === selectedJidRef.current) {
              setDetectedCommitment(prediction.commitment);
            }
          });
        }
      }

      window.setTimeout(() => {
        void pollAndCompareMessages(selectedJid, currentContact?.aliases);
        void refreshSidebarData();
      }, 350);
      // Reconciliar la lista de TODAS las instancias es lo más pesado del envío y
      // no debe bloquear el input ni el estado "enviando": va en segundo plano.
      // El tiempo real (socket) y este refetch actualizan la barra un instante después.
    },
    [
      apiKeyData,
      currentContact,
      info,
      instanceName,
      mergeMessages,
      pollAndCompareMessages,
      refreshSidebarData,
      selectedJid,
      sendAnyAction,
      commitCache,
    ],
  );

  const handleLoadOlderMessages = useCallback(async () => {
    if (!selectedJid || loading || loadingOlderMessages) return;

    const currentPage = info?.currentPage ?? 1;
    const nextPage = info?.nextPage ?? currentPage + 1;
    const activeSet = activeActionSetRef.current;
    const effectiveWarmMessages = activeSet?.warmMessages ?? warmMessagesAction;
    const effectiveInstanceName = activeSet?.instanceName ?? instanceName;
    const effectiveApiKeyData = activeSet?.instanceType === "baileys" ? undefined : apiKeyData;
    const remoteJidAliases = currentContact?.aliases ?? info?.remoteJidAliases;

    setLoadingOlderMessages(true);
    try {
      const result = await effectiveWarmMessages(selectedJid, {
        page: nextPage,
        pageSize: INITIAL_MESSAGE_PAGE_SIZE,
        remoteJidAliases,
      });

      if (!result.success) {
        toast.error(result.message || "No se pudieron cargar mensajes anteriores.");
        return;
      }

      const nextInfo = {
        total: result.total,
        pages: result.pages,
        currentPage: result.currentPage ?? nextPage,
        nextPage: result.nextPage,
        instanceName: effectiveInstanceName,
        remoteJid: selectedJid,
        remoteJidAliases,
        apiKeyData: effectiveApiKeyData,
      };
      setMessages((previous) => {
        const merged = mergeMessages(previous, result.data || []);
        commitCache(
          getMessageCacheKey(effectiveInstanceName, selectedJid),
          { messages: merged, info: nextInfo },
        );
        return merged;
      });
      setInfo(nextInfo);
    } finally {
      setLoadingOlderMessages(false);
    }
  }, [
    apiKeyData,
    currentContact?.aliases,
    info,
    instanceName,
    loading,
    loadingOlderMessages,
    mergeMessages,
    selectedJid,
    warmMessagesAction,
    commitCache,
  ]);

  const handleSendWorkflow = useCallback(
    async (workflowId: string) => {
      if (!selectedJid) {
        throw new Error("No hay un chat seleccionado para enviar el workflow.");
      }

      const sendJid = resolveSendRemoteJid(selectedJid, currentContact);
      const result = await (activeActionSetRef.current?.sendWorkflow ?? sendWorkflowAction)(sendJid, workflowId);
      if (!result.success) {
        throw new Error(result.message || "No se pudo enviar el workflow.");
      }

      window.setTimeout(() => {
        void pollAndCompareMessages(selectedJid, currentContact?.aliases);
        void refreshSidebarData();
      }, 350);

      return result;
    },
    [
      currentContact,
      pollAndCompareMessages,
      refreshSidebarData,
      selectedJid,
      sendWorkflowAction,
    ],
  );

  const handleSendQuickReply = useCallback(
    async (quickReplyId: number) => {
      if (!selectedJid) {
        throw new Error("No hay un chat seleccionado para enviar la respuesta rapida.");
      }

      const sendJid = resolveSendRemoteJid(selectedJid, currentContact);
      const result = await (activeActionSetRef.current?.sendQuickReply ?? sendQuickReplyAction)(sendJid, quickReplyId);
      if (!result.success) {
        throw new Error(result.message || "No se pudo enviar la respuesta rapida.");
      }

      window.setTimeout(() => {
        void pollAndCompareMessages(selectedJid, currentContact?.aliases);
        void refreshSidebarData();
      }, 350);

      return result;
    },
    [
      currentContact,
      pollAndCompareMessages,
      refreshSidebarData,
      selectedJid,
      sendQuickReplyAction,
    ],
  );

  const handleSendTemplate = useCallback(
    async (template: MetaTemplateOption, params: string[]) => {
      if (!selectedJid) {
        throw new Error("No hay un chat seleccionado para enviar la plantilla.");
      }
      const instName = activeActionSetRef.current?.instanceName ?? currentContact?.instanceName;
      if (!instName) {
        throw new Error("No se encontró la instancia del chat.");
      }
      const sendJid = resolveSendRemoteJid(selectedJid, currentContact);
      const result = await sendMetaTemplate(instName, sendJid, template, params);
      if (result.success) {
        window.setTimeout(() => {
          void pollAndCompareMessages(selectedJid, currentContact?.aliases);
          void refreshSidebarData();
        }, 350);
      }
      return result;
    },
    [
      currentContact,
      pollAndCompareMessages,
      refreshSidebarData,
      selectedJid,
    ],
  );

  const handleToggleChatPin = useCallback(
    async (remoteJid: string, isPinned: boolean) => {
      const result = await toggleChatPinAction({
        userId,
        remoteJid,
        isPinned,
      });

      if (!result.success || !result.data) {
        toast.error(result.message || "No se pudo actualizar el anclado del chat.");
        return;
      }

      applyChatPreference(result.data);
      toast.success(result.message);
    },
    [applyChatPreference, userId],
  );

  const handleArchiveChat = useCallback(
    async (remoteJid: string, archived: boolean) => {
      const result = await setChatArchivedAction({
        userId,
        remoteJid,
        archived,
      });

      if (!result.success || !result.data) {
        toast.error(result.message || "No se pudo actualizar el archivo del chat.");
        return;
      }

      applyChatPreference(result.data);
      toast.success(result.message);

      if (archived && selectedJid === remoteJid) {
        setSelectedJid("");
        setMessages([]);
        setInfo(undefined);
      }
    },
    [applyChatPreference, selectedJid, userId],
  );

  const handleDeleteChat = useCallback(
    async (remoteJid: string) => {
      const result = await deleteChatConversationAction({
        userId,
        remoteJid,
      });

      if (!result.success || !result.data) {
        toast.error(result.message || "No se pudo eliminar el chat.");
        return;
      }

      const deletedCandidates = new Set(buildWhatsAppJidCandidates(remoteJid));
      setCurrentChatsResult((prev) =>
        prev.success
          ? {
              ...prev,
              data: prev.data.filter((chat) => !chatMatchesAnyJid(chat, deletedCandidates)),
            }
          : prev,
      );
      setChatSessions((prev) => {
        const next = { ...prev };
        for (const candidate of Array.from(deletedCandidates)) delete next[candidate];
        return next;
      });
      applyChatPreference(result.data);
      toast.success(result.message);

      if (selectedJid === remoteJid) {
        setSelectedJid("");
        setMessages([]);
        setInfo(undefined);
      }
    },
    [applyChatPreference, selectedJid, userId],
  );

  const handleRestoreChat = useCallback(
    async (remoteJid: string) => {
      const result = await restoreChatConversationAction({
        userId,
        remoteJid,
      });

      if (!result.success || !result.data) {
        toast.error(result.message || "No se pudo restaurar el chat.");
        return;
      }

      applyChatPreference(result.data);
      toast.success(result.message);
    },
    [applyChatPreference, userId],
  );

  const handleBulkArchive = useCallback(
    async (remoteJids: string[], archived: boolean) => {
      const result = await bulkArchiveChatsAction({ userId, remoteJids, archived });
      if (!result.success || !result.data) {
        toast.error(result.message || "No se pudieron archivar los chats.");
        return;
      }
      setChatPreferences((prev) => {
        const next = { ...prev };
        for (const pref of result.data!) next[pref.remoteJid] = pref;
        return next;
      });
      if (archived && remoteJids.includes(selectedJid)) {
        setSelectedJid("");
        setMessages([]);
        setInfo(undefined);
      }
      toast.success(result.message);
    },
    [userId, selectedJid],
  );

  const handleBulkDelete = useCallback(
    async (remoteJids: string[]) => {
      const result = await bulkDeleteChatsAction({ userId, remoteJids });
      if (!result.success || !result.data) {
        toast.error(result.message || "No se pudieron eliminar los chats.");
        return;
      }
      const deletedJids = new Set(remoteJids.flatMap((jid) => buildWhatsAppJidCandidates(jid)));
      setCurrentChatsResult((prev) =>
        prev.success
          ? {
              ...prev,
              data: prev.data.filter((chat) => !chatMatchesAnyJid(chat, deletedJids)),
            }
          : prev,
      );
      setChatSessions((prev) => {
        const next = { ...prev };
        for (const jid of Array.from(deletedJids)) delete next[jid];
        return next;
      });
      setChatPreferences((prev) => {
        const next = { ...prev };
        for (const pref of result.data!) next[pref.remoteJid] = pref;
        return next;
      });
      if (buildWhatsAppJidCandidates(selectedJid).some((candidate) => deletedJids.has(candidate))) {
        setSelectedJid("");
        setMessages([]);
        setInfo(undefined);
      }
      toast.success(result.message);
    },
    [userId, selectedJid],
  );

  const handleBulkPin = useCallback(
    async (remoteJids: string[], isPinned: boolean) => {
      const result = await bulkPinChatsAction({ userId, remoteJids, isPinned });
      if (!result.success || !result.data) {
        toast.error(result.message || "No se pudo actualizar el anclado.");
        return;
      }
      setChatPreferences((prev) => {
        const next = { ...prev };
        for (const pref of result.data!) next[pref.remoteJid] = pref;
        return next;
      });
      toast.success(result.message);
    },
    [userId],
  );

  const handleBulkAssignAdvisor = useCallback(
    async (remoteJids: string[], advisorId: string | null) => {
      const sessionIds = remoteJids
        .map((jid) => chatSessions[jid]?.id)
        .filter((id): id is number => id !== undefined);

      if (sessionIds.length === 0) {
        toast.error("Ninguno de los chats seleccionados tiene sesión CRM.");
        return;
      }

      const results = await Promise.allSettled(
        sessionIds.map((sessionId) => assignSessionToAdvisor(sessionId, advisorId)),
      );

      const failed = results.filter((r) => r.status === "rejected" || (r.status === "fulfilled" && !r.value.success)).length;

      if (failed > 0) {
        toast.error(`${failed} asignación${failed !== 1 ? "es" : ""} fallida${failed !== 1 ? "s" : ""}.`);
      }

      const ok = sessionIds.length - failed;
      if (ok > 0) {
        setChatSessions((prev) => {
          const next = { ...prev };
          for (const jid of remoteJids) {
            if (next[jid]) next[jid] = { ...next[jid]!, assignedAdvisorId: advisorId };
          }
          return next;
        });
        if (advisorId) {
          const name = advisors?.find((a) => a.id === advisorId)?.name ?? "Asesor";
          toast.success(`${ok} chat${ok !== 1 ? "s" : ""} asignado${ok !== 1 ? "s" : ""} a ${name}.`);
        } else {
          toast.success(`Asignación removida en ${ok} chat${ok !== 1 ? "s" : ""}.`);
        }
      }
    },
    [chatSessions, advisors],
  );

  const handleBulkAddTag = useCallback(
    async (remoteJids: string[], tagId: number) => {
      const sessionPairs = remoteJids
        .map((jid) => ({ jid, sessionId: chatSessions[jid]?.id }))
        .filter((p): p is { jid: string; sessionId: number } => p.sessionId !== undefined);

      if (sessionPairs.length === 0) {
        toast.error("Ninguno de los chats seleccionados tiene sesión CRM.");
        return;
      }

      const results = await Promise.allSettled(
        sessionPairs.map(({ sessionId }) =>
          assignTagToSessionAction({ userId, sessionId, tagId }),
        ),
      );

      const failed = results.filter((r) => r.status === "rejected" || (r.status === "fulfilled" && !r.value.success)).length;
      const ok = sessionPairs.length - failed;

      if (failed > 0) toast.error(`${failed} etiqueta${failed !== 1 ? "s" : ""} no se pudo${failed !== 1 ? "ieron" : ""} aplicar.`);

      if (ok > 0) {
        const tag = allTags.find((t) => t.id === tagId);
        setChatSessions((prev) => {
          const next = { ...prev };
          for (const { jid } of sessionPairs) {
            const session = next[jid];
            if (!session) continue;
            const hasTag = session.tags?.some((t) => t.id === tagId);
            if (!hasTag && tag) {
              next[jid] = { ...session, tags: [...(session.tags ?? []), tag] };
            }
          }
          return next;
        });
        toast.success(`Etiqueta aplicada a ${ok} chat${ok !== 1 ? "s" : ""}.`);
      }
    },
    [userId, chatSessions, allTags],
  );

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const loop = async () => {
      if (stopped) return;

      const listInterval = realtimeConnectedRef.current
        ? LIST_SYNC_INTERVAL_MS
        : REALTIME_OFF_LIST_INTERVAL_MS;

      // No refrescar la lista cuando la pestaña está en segundo plano:
      // evita golpear Evolution + BD + recálculo de UI sin que nadie lo vea.
      if (typeof document !== "undefined" && document.hidden) {
        timer = setTimeout(loop, listInterval);
        return;
      }

      const result = await refetchAllInstances();
      if (result.success) {
        const filtered = filterChatList(result);
        setCurrentChatsResult(filtered);
        if (filtered.success) {
          await refreshChatSessions(filtered.data);
        }
      }

      timer = setTimeout(loop, listInterval);
    };

    if (normalizedInitialChatsResult.success) {
      timer = setTimeout(() => {
        void loop();
      }, INITIAL_CHAT_SYNC_DELAY_MS);
    }

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [normalizedInitialChatsResult.success, refetchAllInstances, refreshChatSessions]);

  useEffect(() => {
    if (pollingRef.current) {
      clearTimeout(pollingRef.current);
      pollingRef.current = null;
    }

    let stopped = false;

    const tick = async () => {
      if (stopped) return;

      if (selectedJid) {
        if (messagesRef.current.length === 0 && !loading) {
          await handleSelectFromSidebar(selectedJid);
        } else {
          await pollAndCompareMessages(selectedJid, currentContact?.aliases);
        }
      }

      const base = realtimeConnectedRef.current ? BASE_INTERVAL : REALTIME_OFF_MSG_INTERVAL_MS;
      const wait = backoffRef.current > 0 ? backoffRef.current : base;
      pollingRef.current = setTimeout(() => void tick(), wait);
    };

    if (selectedJid) {
      pollingRef.current = setTimeout(() => void tick(), SELECTED_CHAT_POLLING_DELAY_MS);
    }

    const onVisibility = () => {
      if (document.hidden) {
        if (pollingRef.current) {
          clearTimeout(pollingRef.current);
          pollingRef.current = null;
        }
      } else {
        backoffRef.current = 0;
        if (!pollingRef.current) void tick();
      }
    };

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibility);
    }

    return () => {
      stopped = true;
      if (pollingRef.current) clearTimeout(pollingRef.current);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibility);
      }
    };
  }, [
    currentContact,
    handleSelectFromSidebar,
    loading,
    pollAndCompareMessages,
    selectedJid,
  ]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try { await refreshSidebarData(); } finally { setIsRefreshing(false); }
  };

  const handleChannelChange = (channel: string | null) => {
    setSelectedChannel(channel);
    setSelectedJid("");
    setSelectedInstanceName(null);
    setMessages([]);
  };

  const handleNewMessageForContact = useCallback(() => {
    if (!selectedJid) return;
    const contact = currentContact;
    const session = currentContactSession;
    const name = session?.customName?.trim() || session?.pushName?.trim() || contact?.pushName?.trim() || selectedJid;
    const phone = fmtPhone(selectedJid) || selectedJid;
    setComposeInitialContact({ jid: selectedJid, name, phone });
    setIsComposeOpen(true);
  }, [selectedJid, currentContact, currentContactSession]);

  // ─── Tiempo real (Fase 2): append directo + refetch como fallback ───
  // Si el realtime no está configurado por entorno, el hook no hace nada y todo
  // sigue con el polling de fondo. Es puramente aditivo (acelerador).
  const realtimeRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Inserta un mensaje entrante de texto en el chat abierto sin consultar a
  // Evolution. mergeMessages deduplica por key.id (los entrantes siempre traen
  // id real de WhatsApp), por lo que el siguiente poll no lo duplica.
  const appendRealtimeMessage = useCallback(
    (payload: { remoteJid: string; message: NonNullable<ChatChangedPayload["message"]> }) => {
      const m = payload.message;
      const evoMsg = {
        key: { id: m.id ?? undefined, fromMe: m.fromMe, remoteJid: payload.remoteJid },
        message: { conversation: m.content },
        messageType: m.messageType,
        messageTimestamp: m.ts,
        pushName: m.pushName ?? undefined,
      } as unknown as EvolutionMessage;
      setMessages((prev) => mergeMessages(prev, [evoMsg]));
    },
    [mergeMessages],
  );

  // Actualiza la entrada de la lista (último mensaje + no leído) y la sube,
  // sin refetch. La ordenación final la hace el sidebar por timestamp.
  const updateChatListLocal = useCallback(
    (payload: { remoteJid: string; message: NonNullable<ChatChangedPayload["message"]> }) => {
      const m = payload.message;
      setCurrentChatsResult((prev) => {
        if (!prev.success) return prev;
        const idx = prev.data.findIndex(
          (c) => c.remoteJid === payload.remoteJid || c.aliases?.includes(payload.remoteJid),
        );
        if (idx === -1) return prev;
        const chat = prev.data[idx];
        const newLastMessage = {
          ...(chat.lastMessage ?? {}),
          key: {
            ...(chat.lastMessage?.key ?? {}),
            id: m.id ?? chat.lastMessage?.key?.id,
            fromMe: m.fromMe,
            remoteJid: payload.remoteJid,
          },
          message: { conversation: m.content },
          messageType: m.messageType,
          messageTimestamp: m.ts,
          pushName: m.pushName ?? chat.lastMessage?.pushName,
        };
        const updated = {
          ...chat,
          lastMessage: newLastMessage as typeof chat.lastMessage,
          unreadCount: m.fromMe ? chat.unreadCount ?? 0 : (chat.unreadCount ?? 0) + 1,
        };
        return {
          ...prev,
          data: [updated, ...prev.data.slice(0, idx), ...prev.data.slice(idx + 1)],
        };
      });
    },
    [],
  );

  useChatsRealtime({
    enabled: normalizedInitialChatsResult.success,
    onConnectedChange: (connected) => {
      realtimeConnectedRef.current = connected;
      // Al reconectar, reactiva el poll de inmediato para reconciliar rápido.
      if (connected) backoffRef.current = 0;
    },
    onChatChanged: (payload) => {
      const jid = payload.remoteJid;
      const isOpenChat =
        jid && (jid === selectedJid || currentContact?.aliases?.includes(jid));
      const m = payload.message;
      if (m && !m.fromMe && m.content) {
        const promiseSession = chatSessions[jid] ?? Object.values(chatSessions).find(
          (session) =>
            session?.remoteJid === jid ||
            session?.remoteJidAlt === jid,
        );
        if (promiseSession?.id) {
          void createClientPromiseFollowUpAction({
            sessionId: promiseSession.id,
            text: m.content,
            assignedToId:
              promiseSession.assignedAdvisorId ?? currentAdvisorId ?? userId,
          }).then((result) => {
            if (result.created) {
              toast.success("Promesa del cliente detectada", {
                description: result.title,
              });
            }
          });
        }
      }
      const existsInList =
        currentChatsResult.success &&
        currentChatsResult.data.some(
          (c) => c.remoteJid === jid || c.aliases?.includes(jid),
        );

      // Append directo: solo texto con id y chat ya presente en la lista.
      if (m && m.content && m.id && existsInList) {
        if (isOpenChat) appendRealtimeMessage({ remoteJid: jid, message: m });
        updateChatListLocal({ remoteJid: jid, message: m });
        return; // sin golpear Evolution
      }

      // Fallback (multimedia, saliente, chat nuevo o sin id): comportamiento
      // probado de Fase 1 (refetch del chat abierto + lista con debounce).
      if (isOpenChat && selectedJid) {
        void pollAndCompareMessages(selectedJid, currentContact?.aliases);
      }
      if (realtimeRefreshTimerRef.current) {
        clearTimeout(realtimeRefreshTimerRef.current);
      }
      realtimeRefreshTimerRef.current = setTimeout(() => {
        void refreshSidebarData();
      }, 2000);
    },
  });
  useEffect(() => {
    return () => {
      if (realtimeRefreshTimerRef.current) {
        clearTimeout(realtimeRefreshTimerRef.current);
      }
    };
  }, []);

  return (
    <>
    <div data-full-bleed data-chat-view className="flex h-full w-full overflow-hidden">
      <div
        className={`${
          isChatListCollapsed
            ? "hidden"
            : isSidebarVisible
              ? "w-full sm:w-[18rem] md:w-[20rem] lg:w-[22rem] xl:w-[24rem]"
              : "hidden md:block md:w-[20rem] lg:w-[22rem] xl:w-[24rem]"
        } h-full flex-shrink-0 transition-all duration-300 sm:border-r border-border`}
      >
        <ChatSidebar
          allTags={allTags}
          chatPreferences={chatPreferences}
          chatSessions={chatSessions}
          onArchiveChat={handleArchiveChat}
          onDeleteChat={handleDeleteChat}
          onLeadStatusChange={handleLeadStatusChange}
          onServiceTypeChange={handleServiceTypeChange}
          onClientStatusChange={handleClientStatusChange}
          clientValidationEnabled={clientValidationEnabled}
          onRestoreChat={handleRestoreChat}
          onSelectRemoteJid={handleSelectFromSidebar}
          onPrefetchRemoteJid={prefetchChat}
          onTogglePin={handleToggleChatPin}
          result={filteredSidebarResult}
          selectedJid={selectedJid}
          selectedInstanceName={selectedInstanceName}
          advisors={advisors}
          advisorRole={advisorRole}
          currentAdvisorId={currentAdvisorId}
          instancias={instancias}
          selectedChannel={selectedChannel}
          channelCounts={channelCounts}
          onChannelChange={handleChannelChange}
          onRefresh={handleRefresh}
          isRefreshing={isRefreshing}
          inactiveAgentUnreadJids={pendingUnreadJids}
          onCompose={instanceActionSets && instanceActionSets.length > 0 ? () => setIsComposeOpen(true) : undefined}
          onAssignAdvisor={
            assignAdvisorAction || takeSessionAction || releaseSessionAction || transferSessionAction
              ? handleAssignAdvisor
              : undefined
          }
          onBulkArchive={handleBulkArchive}
          onBulkDelete={handleBulkDelete}
          onBulkPin={handleBulkPin}
          onBulkAssignAdvisor={
            advisorRole !== "agente" && advisors && advisors.length > 0
              ? handleBulkAssignAdvisor
              : undefined
          }
          onBulkAddTag={allTags.length > 0 ? handleBulkAddTag : undefined}
          onCollapse={() => setIsChatListCollapsed(true)}
          tab={chatListTab}
          onTabChange={setChatListTab}
          unreadOnly={unreadOnly}
          onUnreadOnlyChange={setUnreadOnly}
          onRenameSuccess={() => setSessionRefreshSignal((n) => n + 1)}
          onSessionRename={handleSessionRename}
        />
      </div>

      <div
        className={`${
          !isSidebarVisible ? "flex-1 w-full" : "hidden sm:flex sm:flex-1"
        } h-full min-w-0 transition-all duration-300`}
      >
        {selectedJid ? (
          <ChatMain
            key={selectedJid || "no-jid"}
            allTags={allTags}
            header={header}
            info={info}
            loading={loading}
            messages={messages}
            onBackToList={toggleSidebarVisibility}
            onSend={handleSendAny}
            onSendQuickReply={handleSendQuickReply}
            onSendWorkflow={handleSendWorkflow}
            instanceType={currentContact?.instanceType}
            onSendTemplate={handleSendTemplate}
            onSessionResolved={handleSessionResolved}
            onSessionTagsChange={handleSessionTagsChange}
            quickReplies={quickReplies}
            userId={userId}
            sessionUserIds={sessionUserIds?.length ? sessionUserIds : undefined}
            workflows={workflows}
            advisors={advisors}
            currentAdvisorId={currentAdvisorId}
            advisorRole={advisorRole}
            assignedAdvisorId={currentContactSession?.assignedAdvisorId ?? null}
            onAssignAdvisor={
              assignAdvisorAction || takeSessionAction || releaseSessionAction || transferSessionAction
                ? (advisorId) => handleAssignAdvisor(selectedJid, advisorId)
                : undefined
            }
            onNewMessage={instanceActionSets && instanceActionSets.length > 0 ? handleNewMessageForContact : undefined}
            onLoadOlderMessages={handleLoadOlderMessages}
            canLoadOlderMessages={Boolean(info?.nextPage)}
            loadingOlderMessages={loadingOlderMessages}
            onInfoPanelChange={setIsContactPanelOpen}
            closeInfoPanelSignal={closeInfoPanelSignal}
            onExpandChatList={isChatListCollapsed ? () => setIsChatListCollapsed(false) : undefined}
            onRefresh={refreshSidebarData}
            sessionRefreshSignal={sessionRefreshSignal}
          />
        ) : (
          <div className="hidden sm:flex h-full flex-1 flex-col items-center justify-center gap-5 select-none border-l border-border bg-muted/10 px-8">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/15 ring-8 ring-primary/5">
              <svg viewBox="0 0 24 24" fill="none" className="h-10 w-10 text-primary" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 9.75a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375m-13.5 3.01c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.184-4.183a1.14 1.14 0 0 1 .778-.332 48.294 48.294 0 0 0 5.83-.498c1.585-.233 2.708-1.626 2.708-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
              </svg>
            </div>
            <div className="text-center">
              <h2 className="text-xl font-bold text-foreground">Tus conversaciones</h2>
              <p className="mt-1.5 text-sm text-muted-foreground">Selecciona un chat de la lista para comenzar</p>
            </div>
            <div className="flex flex-col gap-2.5 w-full max-w-xs">
              <button
                type="button"
                onClick={() => goToChatTab("mine")}
                className="flex w-full items-center gap-3 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-left transition-colors hover:bg-violet-100 dark:border-violet-800/50 dark:bg-violet-950/30 dark:hover:bg-violet-900/40"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-500 text-xs font-bold text-white">M</span>
                <div>
                  <p className="text-sm font-semibold text-violet-700 dark:text-violet-400">Mías</p>
                  <p className="text-xs text-muted-foreground">Conversaciones asignadas a ti</p>
                </div>
              </button>
              <button
                type="button"
                onClick={() => goToChatTab("all")}
                className="flex w-full items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-left transition-colors hover:bg-blue-100 dark:border-blue-800/50 dark:bg-blue-950/30 dark:hover:bg-blue-900/40"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-500 text-xs font-bold text-white">T</span>
                <div>
                  <p className="text-sm font-semibold text-blue-700 dark:text-blue-400">Todos</p>
                  <p className="text-xs text-muted-foreground">Todas las conversaciones activas</p>
                </div>
              </button>
              <button
                type="button"
                onClick={() => goToChatTab("all", true)}
                className="flex w-full items-center gap-3 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-left transition-colors hover:bg-orange-100 dark:border-orange-800/50 dark:bg-orange-950/30 dark:hover:bg-orange-900/40"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-orange-500 text-xs font-bold text-white">N</span>
                <div>
                  <p className="text-sm font-semibold text-orange-700 dark:text-orange-400">No leídos</p>
                  <p className="text-xs text-muted-foreground">Conversaciones pendientes por leer</p>
                </div>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>

    {instanceActionSets && instanceActionSets.length > 0 && (
      <NewConversationDialog
        open={isComposeOpen}
        onClose={() => { setIsComposeOpen(false); setComposeInitialContact(undefined); }}
        instancias={instancias}
        instanceActionSets={instanceActionSets}
        contacts={currentChatsResult.success ? currentChatsResult.data : []}
        initialContact={composeInitialContact}
        quickReplies={quickReplies}
        workflows={workflows}
      />
    )}
    <CommitmentTaskDialog
      commitment={detectedCommitment}
      assignedToId={currentAdvisorId ?? userId}
      assignedToName={
        advisors.find((advisor) => advisor.id === (currentAdvisorId ?? userId))?.name ?? null
      }
      sessionId={currentContactSession?.id}
      contactName={
        currentContactSession?.customName?.trim() ||
        currentContactSession?.pushName?.trim() ||
        currentContact?.pushName?.trim() ||
        null
      }
      contactJid={selectedJid || null}
      onClose={() => setDetectedCommitment(null)}
    />
    </>
  );
}
