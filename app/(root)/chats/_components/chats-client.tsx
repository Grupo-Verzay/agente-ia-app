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
import { assignTagToSessionAction } from "@/actions/tag-actions";
import { getChatContactSessions } from "@/actions/session-action";
import type { AdvisorInfo } from "@/actions/team-actions";
import { useAdvisorNotifications } from "@/hooks/chats/useAdvisorNotifications";
import type {
  ChatData,
  EvolutionMessage,
  FetchChatsResult,
  FindMessagesResult,
  SendMessageResult,
} from "@/actions/chat-actions";
import { ChatMain } from "./chat-main";
import { ChatSidebar } from "./chat-sidebar";
import { NewConversationDialog } from "./NewConversationDialog";
import { fmtPhone } from "@/lib/whatsapp-jid";
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

export type InstanceActionSet = {
  instanceName: string;
  instanceType?: string;
  warmMessages: (
    remoteJid: string,
    opts?: { page?: number; pageSize?: number; remoteJidAliases?: string[] },
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
    data: result.data.filter(
      (chat) => chat.remoteJid && chat.remoteJid !== "status@broadcast",
    ),
  };
}

interface ChatsClientProps {
  userId: string;
  instancias?: { instanceName: string; instanceId: string; instanceType?: string | null; linkedUserId?: string; company?: string }[];
  chatsResult: FetchChatsResult;
  initialChatPreferences: ChatConversationPreferenceMap;
  initialChatSessions: ChatContactSessionMap;
  initialSelectedJid: string;
  initialMessages: EvolutionMessage[];
  instanceName?: string;
  warmMessagesAction: (
    remoteJid: string,
    opts?: { page?: number; pageSize?: number; remoteJidAliases?: string[] },
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
}

export function ChatsClient({
  userId,
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
  advisors = [],
  currentAdvisorId,
  advisorRole,
  assignAdvisorAction,
  takeSessionAction,
  releaseSessionAction,
  transferSessionAction,
  instanceName,
  apiKeyData,
  instanceActionSets,
  allTags,
  workflows,
  quickReplies,
}: ChatsClientProps) {
  const normalizedInitialChatsResult = useMemo(
    () => filterChatList(initialChatsResult),
    [initialChatsResult],
  );

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
  const [messages, setMessages] = useState<EvolutionMessage[]>(initialMessages || []);
  const [info, setInfo] = useState<
    | {
        total?: number;
        pages?: number;
        currentPage?: number;
        nextPage?: number | null;
        instanceName?: string;
        remoteJid?: string;
        remoteJidAliases?: string[];
        apiKeyData?: ApiKeyData;
      }
    | undefined
  >(
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
  const [isSidebarVisible, setIsSidebarVisible] = useState(!initialSelectedJid);

  const pollingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef(false);
  const backoffRef = useRef(0);
  const messagesRef = useRef<EvolutionMessage[]>(initialMessages || []);
  const activeActionSetRef = useRef<InstanceActionSet | null>(null);
  const BASE_INTERVAL = 2000;
  const MAX_BACKOFF = 30000;

  const contacts = useMemo(() => {
    if (!currentChatsResult.success) return [];
    const all = currentChatsResult.data.filter(
      (chat) => chat.remoteJid && chat.remoteJid !== "status@broadcast",
    );
    if (advisorRole !== "agente" || !currentAdvisorId) return all;
    return all.filter((chat) => {
      const session = chatSessions[chat.remoteJid];
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
        const preference = chatPreferences[contact.remoteJid];
        return !preference?.isDeleted && !preference?.isArchived;
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
    if (!selectedJid) return undefined;
    return chatSessions[selectedJid];
  }, [chatSessions, selectedJid]);

  const currentPreference = useMemo(
    () => (selectedJid ? chatPreferences[selectedJid] : undefined),
    [chatPreferences, selectedJid],
  );

  const header = useMemo(() => {
    return {
      name:
        currentContactSession?.pushName?.trim() ||
        currentContact?.pushName ||
        selectedJid ||
        "Sin contacto",
      avatarSrc: currentContact?.profilePicUrl || "/placeholder.svg",
      status: currentContact?.lastMessage?.messageTimestamp ? "ultimo mensaje" : "-",
      isPinned: currentPreference?.isPinned ?? false,
    };
  }, [currentContact, currentContactSession, currentPreference?.isPinned, selectedJid]);

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
    if (!chatPreferences[selectedJid]?.isDeleted) return;

    setSelectedJid("");
    setMessages([]);
    setInfo(undefined);
  }, [chatPreferences, selectedJid]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Notificaciones: nuevas asignaciones para asesores + mensajes nuevos con agente inactivo
  const { pendingUnreadJids } = useAdvisorNotifications(chatSessions, currentAdvisorId, advisorRole, currentChatsResult, selectedJid);

  const toggleSidebarVisibility = useCallback(() => {
    setIsSidebarVisible((previous) => !previous);
  }, []);

  const refreshChatSessions = useCallback(
    async (chats: ChatData[]) => {
      const descriptors = buildChatContactDescriptors(chats);

      if (descriptors.length === 0) {
        setChatSessions({});
        return;
      }

      const result = await getChatContactSessions(userId, descriptors);
      if (result.success) {
        setChatSessions(result.data ?? {});
      }
    },
    [userId],
  );

  const refetchAllInstances = useCallback(async (): Promise<FetchChatsResult> => {
    if (!instanceActionSets?.length) return refetchChatsAction();
    const results = await Promise.allSettled(instanceActionSets.map((s) => s.refetchChats()));
    const allChats: ChatData[] = [];
    for (const r of results) {
      if (r.status === "fulfilled" && r.value.success) allChats.push(...r.value.data);
    }
    return { success: true, message: "OK", data: allChats };
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

        return {
          ...previous,
          [remoteJid]: mapSessionToChatContactSummary(session),
        };
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
    [chatSessions, advisorRole, currentAdvisorId, takeSessionAction, assignAdvisorAction, releaseSessionAction, transferSessionAction],
  );

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
          pageSize: 50,
          remoteJidAliases,
        });

        if (result?.success) {
          const nextMessages = result.data || [];
          if (areListsDifferent(messagesRef.current, nextMessages)) {
            setMessages(nextMessages);
            setInfo({
              total: result.total,
              pages: result.pages,
              currentPage: result.currentPage,
              nextPage: result.nextPage,
              instanceName: effectiveInstanceName,
              remoteJid,
              remoteJidAliases,
              apiKeyData: effectiveApiKeyData,
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
    [apiKeyData, instanceName, warmMessagesAction],
  );

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

      if (selectedJid !== remoteJid) setSelectedJid(remoteJid);
      setSelectedInstanceName(selectedContact?.instanceName ?? null);
      if (isSidebarVisible) setIsSidebarVisible(false);

      setInfo((currentInfo) => ({
        ...(currentInfo ?? {}),
        instanceName: effectiveInstanceName,
        remoteJid,
        remoteJidAliases,
        apiKeyData: effectiveApiKeyData,
      }));
      setLoading(true);
      setMessages([]);

      try {
        const result = await effectiveWarmMessages(remoteJid, {
          page: 1,
          pageSize: 50,
          remoteJidAliases,
        });

        if (result?.success) {
          setMessages(result.data || []);
          setInfo({
            total: result.total,
            pages: result.pages,
            currentPage: result.currentPage,
            nextPage: result.nextPage,
            instanceName: effectiveInstanceName,
            remoteJid,
            remoteJidAliases,
            apiKeyData: effectiveApiKeyData,
          });
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
      } catch {
        setMessages([]);
        setInfo((currentInfo) => ({
          ...(currentInfo ?? {}),
          instanceName: effectiveInstanceName,
          remoteJid,
          remoteJidAliases,
          apiKeyData: effectiveApiKeyData,
        }));
      } finally {
        setLoading(false);
      }
    },
    [apiKeyData, contacts, instanceActionSets, instanceName, isSidebarVisible, selectedJid, warmMessagesAction],
  );

  const handleSendAny = useCallback(
    async (payload: OutgoingMessagePayload) => {
      if (!selectedJid) {
        throw new Error("No hay un chat seleccionado para enviar el mensaje.");
      }

      const result = await (activeActionSetRef.current?.sendText ?? sendAnyAction)(selectedJid, payload);
      if (!result.success) {
        throw new Error(result.message || "No se pudo enviar el mensaje.");
      }

      await pollAndCompareMessages(selectedJid, currentContact?.aliases);
      await refreshSidebarData();
    },
    [
      currentContact?.aliases,
      pollAndCompareMessages,
      refreshSidebarData,
      selectedJid,
      sendAnyAction,
    ],
  );

  const handleSendWorkflow = useCallback(
    async (workflowId: string) => {
      if (!selectedJid) {
        throw new Error("No hay un chat seleccionado para enviar el workflow.");
      }

      const result = await (activeActionSetRef.current?.sendWorkflow ?? sendWorkflowAction)(selectedJid, workflowId);
      if (!result.success) {
        throw new Error(result.message || "No se pudo enviar el workflow.");
      }

      await pollAndCompareMessages(selectedJid, currentContact?.aliases);
      await refreshSidebarData();

      return result;
    },
    [
      currentContact?.aliases,
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

      const result = await (activeActionSetRef.current?.sendQuickReply ?? sendQuickReplyAction)(selectedJid, quickReplyId);
      if (!result.success) {
        throw new Error(result.message || "No se pudo enviar la respuesta rapida.");
      }

      await pollAndCompareMessages(selectedJid, currentContact?.aliases);
      await refreshSidebarData();

      return result;
    },
    [
      currentContact?.aliases,
      pollAndCompareMessages,
      refreshSidebarData,
      selectedJid,
      sendQuickReplyAction,
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
      setChatPreferences((prev) => {
        const next = { ...prev };
        for (const pref of result.data!) next[pref.remoteJid] = pref;
        return next;
      });
      if (remoteJids.includes(selectedJid)) {
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

      const result = await refetchAllInstances();
      if (result.success) {
        const filtered = filterChatList(result);
        setCurrentChatsResult(filtered);
        if (filtered.success) {
          await refreshChatSessions(filtered.data);
        }
      }

      timer = setTimeout(loop, 10000);
    };

    if (normalizedInitialChatsResult.success) {
      void loop();
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

      const wait = backoffRef.current > 0 ? backoffRef.current : BASE_INTERVAL;
      pollingRef.current = setTimeout(() => void tick(), wait);
    };

    if (selectedJid) {
      void tick();
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
    const name = session?.pushName?.trim() || contact?.pushName?.trim() || selectedJid;
    const phone = fmtPhone(selectedJid) || selectedJid;
    setComposeInitialContact({ jid: selectedJid, name, phone });
    setIsComposeOpen(true);
  }, [selectedJid, currentContact, currentContactSession]);

  return (
    <>
    <div data-full-bleed className="flex h-full w-full overflow-hidden">
      <div
        className={`${
          isSidebarVisible
            ? "w-full sm:w-80 md:w-96"
            : "hidden sm:w-80 md:block md:w-96"
        } h-full flex-shrink-0 transition-all duration-300 sm:border-r ${
          !isSidebarVisible ? "hidden" : ""
        }`}
      >
        <ChatSidebar
          allTags={allTags}
          chatPreferences={chatPreferences}
          chatSessions={chatSessions}
          onArchiveChat={handleArchiveChat}
          onDeleteChat={handleDeleteChat}
          onLeadStatusChange={handleLeadStatusChange}
          onRestoreChat={handleRestoreChat}
          onSelectRemoteJid={handleSelectFromSidebar}
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
              ? (remoteJid, advisorId) => handleAssignAdvisor(remoteJid, advisorId)
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
            onSessionResolved={handleSessionResolved}
            onSessionTagsChange={handleSessionTagsChange}
            quickReplies={quickReplies}
            userId={userId}
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
              <div className="flex items-center gap-3 rounded-xl border border-violet-200 bg-violet-50 dark:border-violet-800/50 dark:bg-violet-950/30 px-4 py-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-500 text-[10px] font-bold text-white">M</span>
                <div>
                  <p className="text-xs font-semibold text-violet-700 dark:text-violet-400">Pestaña Mías</p>
                  <p className="text-[11px] text-muted-foreground">Conversaciones asignadas a ti</p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 dark:border-blue-800/50 dark:bg-blue-950/30 px-4 py-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-500 text-[10px] font-bold text-white">T</span>
                <div>
                  <p className="text-xs font-semibold text-blue-700 dark:text-blue-400">Pestaña Todos</p>
                  <p className="text-[11px] text-muted-foreground">Todas las conversaciones activas</p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/30 px-4 py-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-400 text-xs font-bold text-white">▼</span>
                <div>
                  <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">Más opciones</p>
                  <p className="text-[11px] text-muted-foreground">Chats archivados y eliminados</p>
                </div>
              </div>
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
      />
    )}
    </>
  );
}
