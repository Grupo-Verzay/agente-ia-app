"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  deleteChatConversationAction,
  restoreChatConversationAction,
  setChatArchivedAction,
  toggleChatPinAction,
} from "@/actions/chat-conversation-actions";
import { getChatContactSessions } from "@/actions/session-action";
import type {
  ChatData,
  EvolutionMessage,
  FetchChatsResult,
  FindMessagesResult,
  SendMessageResult,
} from "@/actions/chat-actions";
import { ChatMain } from "./chat-main";
import { ChatSidebar } from "./chat-sidebar";
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
  allTags: SimpleTag[];
  workflows: ChatWorkflowOption[];
  quickReplies: ChatQuickReplyOption[];
}

export function ChatsClient({
  userId,
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
  instanceName,
  apiKeyData,
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
  const BASE_INTERVAL = 2000;
  const MAX_BACKOFF = 30000;

  const contacts = useMemo(() => {
    if (!currentChatsResult.success) return [];
    return currentChatsResult.data.filter(
      (chat) => chat.remoteJid && chat.remoteJid !== "status@broadcast",
    );
  }, [currentChatsResult]);

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
    if (!selectedJid && visibleContacts.length > 0) {
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

      if (!initialSelectedJid) setMessages([]);
      if (initialSelectedJid) setIsSidebarVisible(false);
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

  const refreshSidebarData = useCallback(async () => {
    const chatRefreshResult = await refetchChatsAction();
    if (!chatRefreshResult.success) return;

    const filtered = filterChatList(chatRefreshResult);
    setCurrentChatsResult(filtered);

    if (filtered.success) {
      await refreshChatSessions(filtered.data);
    }
  }, [refetchChatsAction, refreshChatSessions]);

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
        const result = await warmMessagesAction(remoteJid, {
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
              instanceName,
              remoteJid,
              remoteJidAliases,
              apiKeyData,
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
    async (remoteJid: string) => {
      const selectedContact = contacts.find(
        (contact) => contact.remoteJid === remoteJid || contact.aliases?.includes(remoteJid),
      );
      const remoteJidAliases = selectedContact?.aliases;

      if (selectedJid !== remoteJid) setSelectedJid(remoteJid);
      if (isSidebarVisible) setIsSidebarVisible(false);

      setInfo((currentInfo) => ({
        ...(currentInfo ?? {}),
        instanceName,
        remoteJid,
        remoteJidAliases,
        apiKeyData,
      }));
      setLoading(true);
      setMessages([]);

      try {
        const result = await warmMessagesAction(remoteJid, {
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
            instanceName,
            remoteJid,
            remoteJidAliases,
            apiKeyData,
          });
        } else {
          setMessages([]);
          setInfo((currentInfo) => ({
            ...(currentInfo ?? {}),
            instanceName,
            remoteJid,
            remoteJidAliases,
            apiKeyData,
          }));
        }
      } catch {
        setMessages([]);
        setInfo((currentInfo) => ({
          ...(currentInfo ?? {}),
          instanceName,
          remoteJid,
          remoteJidAliases,
          apiKeyData,
        }));
      } finally {
        setLoading(false);
      }
    },
    [apiKeyData, contacts, instanceName, isSidebarVisible, selectedJid, warmMessagesAction],
  );

  const handleSendAny = useCallback(
    async (payload: OutgoingMessagePayload) => {
      if (!selectedJid) {
        throw new Error("No hay un chat seleccionado para enviar el mensaje.");
      }

      const result = await sendAnyAction(selectedJid, payload);
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

      const result = await sendWorkflowAction(selectedJid, workflowId);
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

      const result = await sendQuickReplyAction(selectedJid, quickReplyId);
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

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const loop = async () => {
      if (stopped) return;

      const result = await refetchChatsAction();
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
  }, [normalizedInitialChatsResult.success, refetchChatsAction, refreshChatSessions]);

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

  return (
    <div className="flex h-full overflow-hidden">
      <div
        className={`${
          isSidebarVisible
            ? "w-full sm:w-80 md:w-96"
            : "hidden sm:w-80 md:block md:w-96"
        } h-full flex-shrink-0 border-r transition-all duration-300 ${
          !isSidebarVisible ? "hidden" : ""
        }`}
      >
        <ChatSidebar
          allTags={allTags}
          chatPreferences={chatPreferences}
          chatSessions={chatSessions}
          onArchiveChat={handleArchiveChat}
          onDeleteChat={handleDeleteChat}
          onRestoreChat={handleRestoreChat}
          onSelectRemoteJid={handleSelectFromSidebar}
          onTogglePin={handleToggleChatPin}
          result={currentChatsResult}
          selectedJid={selectedJid}
        />
      </div>

      <div
        className={`${
          !isSidebarVisible ? "flex-1 w-full" : "hidden sm:flex-1"
        } h-full transition-all duration-300`}
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
          />
        ) : (
          <div className="flex h-full flex-1 items-center justify-center text-gray-500">
            {isSidebarVisible ? "Selecciona un chat." : "Cargando chats..."}
          </div>
        )}
      </div>
    </div>
  );
}
