"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { resolveSession } from "@/actions/advisor-assign-actions";
import { getSessionIdsWithNotesAction } from "@/actions/internal-notes-actions";
import { assignTagToSessionAction } from "@/actions/tag-actions";
import { updateLeadPushNameAction } from "@/actions/registro-action";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Inbox, Trash2, Users, UserX, Check, SquarePen, MessageCircle, PanelLeftClose } from "lucide-react";
import type { FetchChatsResult } from "@/actions/chat-actions";
import { useChatUnreadStore } from "@/stores/useChatUnreadStore";
import { useLocalStorageObjectArray, MessageRecord } from "@/hooks/chats/useSeenMessages";
import type { ChatConversationPreferenceMap } from "@/types/chat";
import type { ChatContactSessionMap, SimpleTag, ClientStatus, ServiceType } from "@/types/session";
import type { AdvisorInfo } from "@/actions/team-actions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { ChatSearchBar } from "./ChatSearchBar";
import { TagFilterPanel } from "./TagFilterPanel";
import { ChatTabBar } from "./ChatTabBar";
import { cn } from "@/lib/utils";

const PALETTE = [
  'bg-blue-500', 'bg-violet-500', 'bg-emerald-500',
  'bg-amber-500', 'bg-rose-500', 'bg-cyan-500', 'bg-fuchsia-500',
];
function colorFor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length];
}
function initials(name: string | null, email: string) {
  const src = name?.trim() || email;
  const parts = src.split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}
import { ChatContactItem } from "./ChatContactItem";
import { DeletedContactItem } from "./DeletedContactItem";
import { ChatEmptyState } from "./ChatEmptyState";
import { DeleteChatDialog } from "./DeleteChatDialog";
import { BulkActionBar } from "./BulkActionBar";
import { buildWhatsAppJidCandidates } from "@/lib/whatsapp-jid";
import {
  epochToMs,
  formatTimeFromEpoch,
  nameFrom,
  avatarFrom,
  isGroupJid,
  lastTextFrom,
  isBadContactName,
} from "./chat-sidebar.utils";
import type { SidebarContact, TabKey, TabCounts } from "./chat-sidebar.types";
import type { ChatData } from "@/actions/chat-actions";

// --- Virtualización de la lista lateral ---
// A partir de este número de contactos visibles, solo se renderizan los items
// dentro (y cerca) del viewport. Por debajo se renderiza la lista completa,
// con el mismo comportamiento de siempre.
const SIDEBAR_VIRTUALIZE_AFTER = 50;
const SIDEBAR_OVERSCAN_ITEMS = 10;
// Alturas estimadas (px). Los contactos con sesión CRM muestran una fila de
// badges (más altos); los demás son más compactos. Es solo una estimación
// para posicionar el viewport; la altura real la sigue dando el contenido.
const SIDEBAR_ITEM_HEIGHT_WITH_BADGES = 100;
const SIDEBAR_ITEM_HEIGHT_PLAIN = 68;

function estimateSidebarItemHeight(contact: SidebarContact) {
  return contact.chatSession
    ? SIDEBAR_ITEM_HEIGHT_WITH_BADGES
    : SIDEBAR_ITEM_HEIGHT_PLAIN;
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

function getSessionForChat(chat: ChatData, sessions: ChatContactSessionMap) {
  return getChatIdentityCandidates(chat)
    .map((candidate) => sessions[candidate])
    .find(Boolean);
}

function isChatDeletedByPreference(
  chat: ChatData,
  preference?: ChatConversationPreferenceMap[string],
) {
  if (!preference?.deletedAt) return false;

  const deletedAtMs = new Date(preference.deletedAt).getTime();
  const lastMessageMs = (chat.lastMessage?.messageTimestamp ?? 0) * 1000;
  const revivedByIncomingMessage =
    lastMessageMs > deletedAtMs && chat.lastMessage?.key?.fromMe === false;

  return !revivedByIncomingMessage;
}

type ChatSidebarProps = {
  allTags?: SimpleTag[];
  chatPreferences: ChatConversationPreferenceMap;
  chatSessions: ChatContactSessionMap;
  onArchiveChat?: (remoteJid: string, archived: boolean) => void | Promise<void>;
  onDeleteChat?: (remoteJid: string) => void | Promise<void>;
  onLeadStatusChange?: (remoteJid: string, status: import("@/types/session").LeadStatus | null) => void;
  onServiceTypeChange?: (remoteJid: string, value: import("@/types/session").ServiceType | null) => void;
  onClientStatusChange?: (remoteJid: string, value: import("@/types/session").ClientStatus | null) => void;
  clientValidationEnabled?: boolean;
  onRestoreChat?: (remoteJid: string) => void | Promise<void>;
  onSelectRemoteJid?: (remoteJid: string, instanceName?: string) => void | Promise<void>;
  onTogglePin?: (remoteJid: string, isPinned: boolean) => void | Promise<void>;
  result: FetchChatsResult;
  selectedJid?: string;
  selectedInstanceName?: string | null;
  advisors?: AdvisorInfo[];
  advisorRole?: string | null;
  currentAdvisorId?: string;
  onAssignAdvisor?: (remoteJid: string, advisorId: string | null) => Promise<void>;
  instancias?: { instanceName: string; instanceId: string; instanceType?: string | null; linkedUserId?: string; company?: string }[];
  selectedChannel?: string | null;
  channelCounts?: Record<string, number>;
  onChannelChange?: (channel: string | null) => void;
  onRefresh?: () => Promise<void>;
  isRefreshing?: boolean;
  onCompose?: () => void;
  inactiveAgentUnreadJids?: Set<string>;
  onBulkArchive?: (remoteJids: string[], archived: boolean) => Promise<void>;
  onBulkDelete?: (remoteJids: string[]) => Promise<void>;
  onBulkPin?: (remoteJids: string[], isPinned: boolean) => Promise<void>;
  onBulkAssignAdvisor?: (remoteJids: string[], advisorId: string | null) => Promise<void>;
  onBulkAddTag?: (remoteJids: string[], tagId: number) => Promise<void>;
  onCollapse?: () => void;
  tab?: TabKey;
  onTabChange?: (tab: TabKey) => void;
  unreadOnly?: boolean;
  onUnreadOnlyChange?: (unreadOnly: boolean) => void;
  onRenameSuccess?: () => void;
  onSessionRename?: (jid: string, name: string) => void;
};

export function ChatSidebar({
  allTags = [],
  chatPreferences,
  chatSessions,
  onArchiveChat,
  onDeleteChat,
  onLeadStatusChange,
  onServiceTypeChange,
  onClientStatusChange,
  clientValidationEnabled = false,
  onRestoreChat,
  onSelectRemoteJid,
  onTogglePin,
  result,
  selectedJid,
  advisors,
  advisorRole,
  currentAdvisorId,
  onAssignAdvisor,
  instancias = [],
  selectedInstanceName,
  selectedChannel,
  channelCounts,
  onChannelChange,
  onRefresh,
  isRefreshing,
  onCompose,
  inactiveAgentUnreadJids,
  onBulkArchive,
  onBulkDelete,
  onBulkPin,
  onBulkAssignAdvisor,
  onBulkAddTag,
  onCollapse,
  tab: tabProp,
  onTabChange: onTabChangeProp,
  unreadOnly: unreadOnlyProp,
  onUnreadOnlyChange,
  onRenameSuccess,
  onSessionRename,
}: ChatSidebarProps) {
  const [q, setQ] = useState("");
  const [internalTab, setInternalTab] = useState<TabKey>("all");
  const tab = tabProp ?? internalTab;
  const applyTab = useCallback(
    (newTab: TabKey) => {
      if (onTabChangeProp) onTabChangeProp(newTab);
      else setInternalTab(newTab);
    },
    [onTabChangeProp],
  );
  const [deleteTarget, setDeleteTarget] = useState<SidebarContact | null>(null);
  const [selectedTagIds, setSelectedTagIds] = useState<Set<number>>(new Set());
  const [advisorFilter, setAdvisorFilter] = useState<string | null>(null); // null=todos, 'unassigned'=sin asignar, id=asesor específico
  const [internalUnreadOnly, setInternalUnreadOnly] = useState(true);
  const unreadOnly = unreadOnlyProp ?? internalUnreadOnly;
  const setUnreadOnly = useCallback(
    (value: boolean | ((current: boolean) => boolean)) => {
      const next = typeof value === "function" ? value(unreadOnly) : value;
      if (onUnreadOnlyChange) onUnreadOnlyChange(next);
      else setInternalUnreadOnly(next);
    },
    [onUnreadOnlyChange, unreadOnly],
  );
  const [selectedJids, setSelectedJids] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [forcedUnreadJids, setForcedUnreadJids] = useState<Set<string>>(new Set());
  const [starredJidsArray, setStarredJidsArray] = useState<string[]>([]);
  const [starredOnly, setStarredOnly] = useState(false);
  const [renameTarget, setRenameTarget] = useState<SidebarContact | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [renameLoading, setRenameLoading] = useState(false);
  const [notedSessionIds, setNotedSessionIds] = useState<Set<number>>(new Set());
  const canDeleteChats = advisorRole !== "agente";
  const [notesOnly, setNotesOnly] = useState(false);
  const [clientStatusFilter, setClientStatusFilter] = useState<ClientStatus | null>(null);
  const [serviceTypeFilter, setServiceTypeFilter] = useState<ServiceType | null>(null);

  // Virtualización: contenedor scrolleable + viewport observado.
  const listScrollRef = React.useRef<HTMLDivElement>(null);
  const [listViewport, setListViewport] = useState({ scrollTop: 0, height: 0 });

  const isOwnerOrAdmin = advisorRole !== "agente";
  const showAdvisorFilter = isOwnerOrAdmin && (advisors?.length ?? 0) > 0;
  const [seenMessages, setSeenMessages] = useLocalStorageObjectArray(
    "seenMessages",
    [] as MessageRecord[],
  );

  const markMessageAsSeen = useCallback(
    (remoteJid: string, messageId: string) => {
      if (!remoteJid || !messageId) return;
      setSeenMessages((prev) => {
        const filtered = prev.filter((m) => m.userId !== remoteJid);
        return [...filtered, { userId: remoteJid, messageId } satisfies MessageRecord];
      });
      setForcedUnreadJids((prev) => {
        if (!prev.has(remoteJid)) return prev;
        const next = new Set(prev);
        next.delete(remoteJid);
        return next;
      });
    },
    [setSeenMessages],
  );

  const markMessageAsUnseen = useCallback(
    (remoteJid: string) => {
      setSeenMessages((prev) => prev.filter((m) => m.userId !== remoteJid));
      setForcedUnreadJids((prev) => new Set([...prev, remoteJid]));
    },
    [setSeenMessages],
  );

  const isMessageSeen = useCallback(
    (remoteJid: string, messageId: string) => {
      if (!messageId) return false;
      const record = seenMessages.find((m) => m.userId === remoteJid);
      return record?.messageId === messageId;
    },
    [seenMessages],
  );

  const contacts = useMemo<SidebarContact[]>(() => {
    if (!result.success) return [];

    return result.data
      .map((chat) => {
        const ts = epochToMs(chat.lastMessage?.messageTimestamp);
        const lastMsgData = lastTextFrom(chat);
        const isSelected = chat.remoteJid === selectedJid;
        const wasSeenPreviously = lastMsgData.id
          ? isMessageSeen(chat.remoteJid, lastMsgData.id)
          : false;
        const hasUnreadFromServer = (chat.unreadCount ?? 0) > 0;
        const hasLocalPending = inactiveAgentUnreadJids?.has(chat.remoteJid) ?? false;
        const isForcedUnread = forcedUnreadJids.has(chat.remoteJid);
        const isRead =
          !isForcedUnread &&
          (wasSeenPreviously || lastMsgData.fromMe || isSelected || (!hasUnreadFromServer && !hasLocalPending));
        const preference = getPreferenceForChat(chat, chatPreferences);
        const chatSession = getSessionForChat(chat, chatSessions) ?? null;

        return {
          id: chat.remoteJid,
          chatSession,
          name: (() => {
            const s = chatSession;
            const custom = s?.customName?.trim();
            if (custom && !isBadContactName(custom)) return custom;
            const push = s?.pushName?.trim();
            if (push && !isBadContactName(push)) return push;
            return nameFrom(chat);
          })(),
          avatarSrc: avatarFrom(chat),
          lastMessage: lastMsgData.text,
          lastMessageId: lastMsgData.id,
          messageType: lastMsgData.messageType,
          timestamp: formatTimeFromEpoch(chat.lastMessage?.messageTimestamp),
          ts,
          isGroup: isGroupJid(chat.remoteJid),
          isUnreadLocal: (Boolean(lastMsgData.id) || hasLocalPending) && !isRead,
          isPinned: Boolean(preference?.isPinned),
          pinnedAtMs: preference?.pinnedAt ? new Date(preference.pinnedAt).getTime() : 0,
          isArchived: Boolean(preference?.isArchived),
          isDeleted: isChatDeletedByPreference(chat, preference),
          instanceName: chat.instanceName,
          hasNotes: notedSessionIds.has(chatSession?.id ?? -1),
        } satisfies SidebarContact;
      })
      .sort((a, b) => {
        if (a.isPinned !== b.isPinned) return Number(b.isPinned) - Number(a.isPinned);
        if (a.pinnedAtMs !== b.pinnedAtMs) return b.pinnedAtMs - a.pinnedAtMs;
        return b.ts - a.ts;
      })
      .filter((() => {
        const seen = new Set<string>();
        return (c: SidebarContact) => {
          if (seen.has(c.id)) return false;
          seen.add(c.id);
          return true;
        };
      })());
  }, [chatPreferences, chatSessions, forcedUnreadJids, inactiveAgentUnreadJids, isMessageSeen, notedSessionIds, result, selectedJid]);

  const myChats = useMemo(() => {
    if (!currentAdvisorId) return [];
    return contacts
      .filter((c) => !c.isDeleted && !c.isArchived && c.chatSession?.assignedAdvisorId === currentAdvisorId)
      .sort((a, b) => b.ts - a.ts);
  }, [contacts, currentAdvisorId]);

  const advisorCounts = useMemo(() => {
    const active = contacts.filter((c) => !c.isDeleted && !c.isArchived);
    const countMap: Record<string, number> = {};
    let unassigned = 0;
    for (const c of active) {
      const aid = c.chatSession?.assignedAdvisorId;
      if (aid) {
        countMap[aid] = (countMap[aid] ?? 0) + 1;
      } else {
        unassigned++;
      }
    }
    return { countMap, unassigned };
  }, [contacts]);

  const tabCounts = useMemo<TabCounts>(() => {
    const active = contacts.filter((c) => !c.isDeleted && !c.isArchived);
    return {
      all: active.length,
      mine: myChats.length,
      dm: active.filter((c) => !c.isGroup).length,
      groups: active.filter((c) => c.isGroup).length,
      archived: contacts.filter((c) => !c.isDeleted && c.isArchived).length,
      deleted: contacts.filter((c) => c.isDeleted).length,
    };
  }, [contacts, myChats]);


  const deletedContacts = useMemo(() => {
    let list = contacts.filter((c) => c.isDeleted);
    if (q.trim()) {
      const term = q.trim().toLowerCase();
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(term) ||
          c.id.toLowerCase().includes(term) ||
          c.lastMessage.toLowerCase().includes(term),
      );
    }
    return list.slice().sort((a, b) => b.ts - a.ts);
  }, [contacts, q]);

  const starredJids = React.useMemo(() => new Set(starredJidsArray), [starredJidsArray]);

  const filterCounts = useMemo(() => {
    const active = contacts.filter((c) => !c.isDeleted && !c.isArchived);
    return {
      unread: active.filter((c) => c.isUnreadLocal).length,
      starred: active.filter((c) => starredJids.has(c.id)).length,
      notes: active.filter((c) => c.hasNotes).length,
      clientActive: active.filter((c) => c.chatSession?.clientStatus === 'ACTIVO').length,
      clientInactive: active.filter((c) => c.chatSession?.clientStatus === 'INACTIVO').length,
      ia: active.filter((c) => c.chatSession?.serviceType === 'IA').length,
      human: active.filter((c) => c.chatSession?.serviceType === 'HUMANO').length,
    };
  }, [contacts, starredJids]);

  const setUnreadCount = useChatUnreadStore((s) => s.setUnreadCount);
  useEffect(() => {
    setUnreadCount(filterCounts.unread);
  }, [filterCounts.unread, setUnreadCount]);

  // Si el filtro "No leídos" está activo pero ya no hay chats sin leer
  // (al entrar sin pendientes o tras leer todos), vuelve a "Todos".
  useEffect(() => {
    if (unreadOnly && contacts.length > 0 && filterCounts.unread === 0) {
      setUnreadOnly(false);
    }
  }, [contacts.length, unreadOnly, filterCounts.unread, setUnreadOnly]);

  const filtered = useMemo(() => {
    if (tab === "deleted") return [];

    let list = contacts.filter((c) => !c.isDeleted);

    if (tab === "archived") {
      list = list.filter((c) => c.isArchived);
    } else {
      list = list.filter((c) => !c.isArchived);
      if (tab === "dm") list = list.filter((c) => !c.isGroup);
      if (tab === "groups") list = list.filter((c) => c.isGroup);
      if (tab === "mine") list = list.filter((c) => c.chatSession?.assignedAdvisorId === currentAdvisorId);
    }

    if (q.trim()) {
      const term = q.trim().toLowerCase();
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(term) ||
          c.id.toLowerCase().includes(term) ||
          c.lastMessage.toLowerCase().includes(term) ||
          (c.chatSession?.tags ?? []).some((tag) => tag.name.toLowerCase().includes(term)),
      );
    }

    if (selectedTagIds.size > 0) {
      list = list.filter((c) =>
        (c.chatSession?.tags ?? []).some((tag) => selectedTagIds.has(tag.id)),
      );
    }

    if (advisorFilter === 'unassigned') {
      list = list.filter((c) => !c.chatSession?.assignedAdvisorId);
    } else if (advisorFilter) {
      list = list.filter((c) => c.chatSession?.assignedAdvisorId === advisorFilter);
    }

    if (unreadOnly) {
      list = list.filter((c) => c.isUnreadLocal);
    }

    if (starredOnly) {
      list = list.filter((c) => starredJids.has(c.id));
    }

    if (notesOnly) {
      list = list.filter((c) => c.hasNotes);
    }

    if (clientStatusFilter) {
      list = list.filter((c) => c.chatSession?.clientStatus === clientStatusFilter);
    }

    if (serviceTypeFilter) {
      list = list.filter((c) => c.chatSession?.serviceType === serviceTypeFilter);
    }

    return list.slice().sort((a, b) => {
      if (a.isPinned !== b.isPinned) return Number(b.isPinned) - Number(a.isPinned);
      if (a.pinnedAtMs !== b.pinnedAtMs) return b.pinnedAtMs - a.pinnedAtMs;
      return b.ts - a.ts;
    });
  }, [contacts, q, selectedTagIds, tab, advisorFilter, unreadOnly, starredOnly, notesOnly, clientStatusFilter, serviceTypeFilter, starredJids, currentAdvisorId]);

  // Ref con la lista filtrada actual, para usar dentro de efectos sin volver a
  // dispararlos en cada cambio de la lista (p. ej. polls).
  const filteredRef = React.useRef(filtered);
  React.useEffect(() => {
    filteredRef.current = filtered;
  }, [filtered]);

  const handleListScroll = useCallback(() => {
    const el = listScrollRef.current;
    if (el) setListViewport({ scrollTop: el.scrollTop, height: el.clientHeight });
  }, []);

  // Inicializa/actualiza el viewport cuando cambia el contenido o el tamaño.
  React.useEffect(() => {
    const el = listScrollRef.current;
    if (el) setListViewport({ scrollTop: el.scrollTop, height: el.clientHeight });
  }, [filtered.length, tab]);

  // Ventana de items a renderizar (virtualización por estimación de altura).
  const listVirtual = useMemo(() => {
    if (filtered.length <= SIDEBAR_VIRTUALIZE_AFTER) {
      return { beforeHeight: 0, afterHeight: 0, items: filtered };
    }

    const heights = filtered.map(estimateSidebarItemHeight);
    const offsets: number[] = [];
    let totalHeight = 0;
    for (const height of heights) {
      offsets.push(totalHeight);
      totalHeight += height;
    }

    const viewportHeight = listViewport.height || 640;
    const from = Math.max(0, listViewport.scrollTop - viewportHeight);
    const to = listViewport.scrollTop + viewportHeight * 2;

    let startIndex = offsets.findIndex((offset, index) => offset + heights[index] >= from);
    if (startIndex === -1) startIndex = 0;
    let endIndex = offsets.findIndex((offset) => offset > to);
    if (endIndex === -1) endIndex = filtered.length;

    startIndex = Math.max(0, startIndex - SIDEBAR_OVERSCAN_ITEMS);
    endIndex = Math.min(filtered.length, endIndex + SIDEBAR_OVERSCAN_ITEMS);

    return {
      beforeHeight: offsets[startIndex] ?? 0,
      afterHeight: Math.max(0, totalHeight - (offsets[endIndex] ?? totalHeight)),
      items: filtered.slice(startIndex, endIndex),
    };
  }, [filtered, listViewport.height, listViewport.scrollTop]);

  React.useEffect(() => {
    if (!selectedJid) return;

    const el = document.querySelector(`[data-chat-id="${selectedJid}"]`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "nearest" });
      return;
    }

    // Item fuera de la ventana virtualizada: desplazar el contenedor hasta su
    // posición estimada para que se renderice y quede visible.
    const list = filteredRef.current;
    const index = list.findIndex((c) => c.id === selectedJid);
    if (index < 0) return;
    const container = listScrollRef.current;
    if (!container) return;
    let offset = 0;
    for (let i = 0; i < index; i++) offset += estimateSidebarItemHeight(list[i]);
    container.scrollTo({ top: Math.max(0, offset - 100), behavior: "smooth" });
  }, [selectedJid]);

  React.useEffect(() => {
    try {
      const stored = localStorage.getItem("starredChats");
      if (stored) setStarredJidsArray(JSON.parse(stored) as string[]);
    } catch {}
  }, []);

  React.useEffect(() => {
    getSessionIdsWithNotesAction().then((ids) => setNotedSessionIds(new Set(ids)));
  }, []);

  React.useEffect(() => {
    try { localStorage.setItem("starredChats", JSON.stringify(starredJidsArray)); } catch {}
  }, [starredJidsArray]);

  const toggleStarred = useCallback((jid: string) => {
    setStarredJidsArray((prev) =>
      prev.includes(jid) ? prev.filter((id) => id !== jid) : [...prev, jid]
    );
  }, []);

  const handleTabChange = useCallback((newTab: TabKey) => {
    applyTab(newTab);
    setUnreadOnly(false);
    setStarredOnly(false);
    setNotesOnly(false);
    setClientStatusFilter(null);
    setServiceTypeFilter(null);
    setSelectedTagIds(new Set());
    void onSelectRemoteJid?.("");
  }, [applyTab, onSelectRemoteJid, setUnreadOnly]);

  const toggleTagFilter = useCallback((tagId: number) => {
    setSelectedTagIds((prev) => {
      if (prev.has(tagId)) return new Set();
      return new Set([tagId]);
    });
  }, []);

  const handleSelectJid = useCallback(
    (jid: string, lastMessageId: string, instanceName?: string) => {
      if (jid && lastMessageId) markMessageAsSeen(jid, lastMessageId);
      void onSelectRemoteJid?.(jid, instanceName);
    },
    [markMessageAsSeen, onSelectRemoteJid],
  );

  const toggleSelectJid = useCallback((jid: string) => {
    setSelectedJids((prev) => {
      const next = new Set(prev);
      if (next.has(jid)) { next.delete(jid); } else { next.add(jid); }
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedJids(new Set()), []);

  const selectAll = useCallback(() => {
    const visibleIds = (tab === "deleted" ? deletedContacts : filtered).map((c) => c.id);
    setSelectedJids((prev) => {
      if (prev.size === visibleIds.length && visibleIds.every((id) => prev.has(id))) {
        return new Set();
      }
      return new Set(visibleIds);
    });
  }, [tab, filtered, deletedContacts]);

  const selectedJidsArray = useMemo(() => Array.from(selectedJids), [selectedJids]);

  const handleBulkArchive = useCallback(async (archived: boolean) => {
    if (!onBulkArchive || selectedJidsArray.length === 0) return;
    await onBulkArchive(selectedJidsArray, archived);
    clearSelection();
  }, [onBulkArchive, selectedJidsArray, clearSelection]);

  const handleBulkDelete = useCallback(async () => {
    if (!onBulkDelete || selectedJidsArray.length === 0) return;
    await onBulkDelete(selectedJidsArray);
    setBulkDeleteOpen(false);
    clearSelection();
  }, [onBulkDelete, selectedJidsArray, clearSelection]);

  const handleBulkPin = useCallback(async (isPinned: boolean) => {
    if (!onBulkPin || selectedJidsArray.length === 0) return;
    await onBulkPin(selectedJidsArray, isPinned);
    clearSelection();
  }, [onBulkPin, selectedJidsArray, clearSelection]);

  const handleBulkMarkRead = useCallback((read: boolean) => {
    for (const jid of selectedJidsArray) {
      if (read) {
        const contact = contacts.find((c) => c.id === jid);
        markMessageAsSeen(jid, contact?.lastMessageId ?? "");
      } else {
        markMessageAsUnseen(jid);
      }
    }
    clearSelection();
  }, [selectedJidsArray, contacts, markMessageAsSeen, markMessageAsUnseen, clearSelection]);

  const handleBulkAssignAdvisor = useCallback(async (advisorId: string | null) => {
    if (!onBulkAssignAdvisor || selectedJidsArray.length === 0) return;
    await onBulkAssignAdvisor(selectedJidsArray, advisorId);
    clearSelection();
  }, [onBulkAssignAdvisor, selectedJidsArray, clearSelection]);

  const handleBulkAddTag = useCallback(async (tagId: number) => {
    if (!onBulkAddTag || selectedJidsArray.length === 0) return;
    await onBulkAddTag(selectedJidsArray, tagId);
    clearSelection();
  }, [onBulkAddTag, selectedJidsArray, clearSelection]);

  const handleRenameSubmit = useCallback(async () => {
    if (!renameTarget) return;
    const session = chatSessions[renameTarget.id];
    if (!session?.id) { toast.error("Sin sesión CRM para renombrar."); return; }
    const name = renameDraft.trim();
    if (!name) { toast.error("El nombre no puede estar vacío."); return; }
    setRenameLoading(true);
    const res = await updateLeadPushNameAction({ sessionId: session.id, pushName: name });
    setRenameLoading(false);
    if (res.success) {
      toast.success("Nombre actualizado.");
      onSessionRename?.(renameTarget.id, name);
      setRenameTarget(null);
      void onRefresh?.();
      onRenameSuccess?.();
    } else {
      toast.error(res.message ?? "Error al actualizar.");
    }
  }, [renameTarget, renameDraft, chatSessions, onRefresh, onRenameSuccess, onSessionRename]);

  const handleResolve = useCallback(async (remoteJid: string) => {
    const session = chatSessions[remoteJid];
    if (!session?.id) { toast.error("Sin sesión CRM para resolver."); return; }
    const res = await resolveSession(session.id);
    if (res.success) toast.success("Conversación resuelta.");
    else toast.error(res.message ?? "Error al resolver.");
  }, [chatSessions]);

  const handleAssignTag = useCallback(async (remoteJid: string, tagId: number) => {
    const session = chatSessions[remoteJid];
    if (!session?.id) { toast.error("Sin sesión CRM para etiquetar."); return; }
    const res = await assignTagToSessionAction({ userId: session.userId, sessionId: session.id, tagId });
    if (res.success) toast.success("Etiqueta asignada.");
    else toast.error(res.message ?? "Error al asignar etiqueta.");
  }, [chatSessions]);

  // Callbacks estables para los items (necesarios para que React.memo de
  // ChatContactItem evite re-renders en cada poll).
  const handleItemTogglePin = useCallback(
    (id: string, isPinned: boolean) => void onTogglePin?.(id, isPinned),
    [onTogglePin],
  );
  const handleItemArchive = useCallback(
    (id: string, isArchived: boolean) => void onArchiveChat?.(id, isArchived),
    [onArchiveChat],
  );
  const handleItemMarkRead = useCallback(
    (id: string) => {
      const c = contacts.find((x) => x.id === id);
      if (c?.lastMessageId) markMessageAsSeen(id, c.lastMessageId);
    },
    [contacts, markMessageAsSeen],
  );
  const handleItemRenameRequest = useCallback(
    (contact: SidebarContact) => {
      setRenameDraft(contact.name);
      setRenameTarget(contact);
    },
    [],
  );

  const emptyMessage =
    tab === "archived"
      ? "No hay chats archivados que coincidan con el filtro."
      : tab === "deleted"
        ? "No hay chats eliminados."
        : "No hay chats que coincidan con el filtro.";

  return (
    <>
      <aside className="flex h-full w-full max-w-[700px] flex-col bg-background/60 backdrop-blur supports-[backdrop-filter]:bg-background/50 xs:min-w-[200px] sm:border-r border-border">
        <div className="sticky top-0 z-10 space-y-1.5 border-b border-border bg-background/80 px-2 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/60 sm:space-y-2 sm:px-3">
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-2">
            <ChatSearchBar
              value={q}
              onChange={setQ}
              onClear={() => setQ("")}
              channels={instancias.length > 1 ? instancias : []}
              selectedChannel={selectedChannel}
              channelCounts={channelCounts}
              onChannelChange={onChannelChange}
              onRefresh={onRefresh}
              isRefreshing={isRefreshing}
            />
            {onCompose && (
              <button
                type="button"
                onClick={onCompose}
                title="Nuevo mensaje"
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-input bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground sm:h-8 sm:w-8"
              >
                <SquarePen className="h-3.5 w-3.5" />
              </button>
            )}
            {showAdvisorFilter && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    title="Filtrar por asesor"
                    className={cn(
                      'relative inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border transition-colors sm:h-8 sm:w-8',
                      advisorFilter !== null
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-input bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                    )}
                  >
                    <Users className="h-4 w-4" />
                    {advisorFilter !== null && (
                      <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-primary" />
                    )}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48 p-1">
                  <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Filtrar por asesor
                  </p>
                  <DropdownMenuItem onSelect={() => setAdvisorFilter(null)} className="flex items-center justify-between gap-2 cursor-pointer">
                    <span className="text-sm">Todos</span>
                    {advisorFilter === null && <Check className="h-3.5 w-3.5 text-primary" />}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => setAdvisorFilter(advisorFilter === 'unassigned' ? null : 'unassigned')} className="flex items-center justify-between gap-2 cursor-pointer">
                    <span className="flex items-center gap-2 text-sm">
                      <UserX className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      Sin asignar
                    </span>
                    <span className="flex items-center gap-1">
                      {advisorCounts.unassigned > 0 && <span className="text-[10px] text-muted-foreground">{advisorCounts.unassigned}</span>}
                      {advisorFilter === 'unassigned' && <Check className="h-3.5 w-3.5 text-primary" />}
                    </span>
                  </DropdownMenuItem>
                  {advisors?.map((a) => {
                    const count = advisorCounts.countMap[a.id] ?? 0;
                    const isActive = advisorFilter === a.id;
                    return (
                      <DropdownMenuItem key={a.id} onSelect={() => setAdvisorFilter(isActive ? null : a.id)} className="flex items-center justify-between gap-2 cursor-pointer">
                        <span className="flex items-center gap-2 text-sm">
                          <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', colorFor(a.id))} />
                          <span className="truncate">{a.name ?? a.email}</span>
                        </span>
                        <span className="flex items-center gap-1">
                          {count > 0 && <span className="text-[10px] text-muted-foreground">{count > 99 ? '99+' : count}</span>}
                          {isActive && <Check className="h-3.5 w-3.5 text-primary" />}
                        </span>
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {onCollapse && (
              <button
                type="button"
                onClick={onCollapse}
                title="Colapsar lista de chats"
                className="hidden md:inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-input bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground sm:h-8 sm:w-8"
              >
                <PanelLeftClose className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <ChatTabBar
            tab={tab}
            onTabChange={handleTabChange}
            tabCounts={tabCounts}
            showMine={!!currentAdvisorId}
            rightSlot={allTags.length > 0 ? (
              <TagFilterPanel
                tags={allTags}
                selectedTagIds={selectedTagIds}
                onToggleTag={toggleTagFilter}
                onClearFilter={() => setSelectedTagIds(new Set())}
              />
            ) : null}
            unreadOnly={unreadOnly}
            onToggleUnread={() => setUnreadOnly((v) => !v)}
            unreadCount={filterCounts.unread}
            starredOnly={starredOnly}
            onToggleStarred={() => setStarredOnly((v) => !v)}
            starredCount={filterCounts.starred}
            notesOnly={notesOnly}
            onToggleNotes={() => setNotesOnly((v) => !v)}
            notesCount={filterCounts.notes}
            clientStatusFilter={clientValidationEnabled ? clientStatusFilter : undefined}
            onSetClientStatus={clientValidationEnabled ? (v) => setClientStatusFilter((prev) => prev === v ? null : v) : undefined}
            clientActiveCount={filterCounts.clientActive}
            clientInactiveCount={filterCounts.clientInactive}
            serviceTypeFilter={clientValidationEnabled ? serviceTypeFilter : undefined}
            onSetServiceType={clientValidationEnabled ? (v) => setServiceTypeFilter((prev) => prev === v ? null : v) : undefined}
            iaCount={filterCounts.ia}
            humanCount={filterCounts.human}
          />

          {selectedJids.size > 0 && (
            <BulkActionBar
              count={selectedJids.size}
              totalCount={tab === "deleted" ? deletedContacts.length : filtered.length}
              onClear={clearSelection}
              onSelectAll={selectAll}
              onArchive={handleBulkArchive}
              onDelete={canDeleteChats ? () => setBulkDeleteOpen(true) : undefined}
              onMarkRead={handleBulkMarkRead}
              onPin={onBulkPin ? handleBulkPin : undefined}
              onAssignAdvisor={onBulkAssignAdvisor ? handleBulkAssignAdvisor : undefined}
              onAddTag={onBulkAddTag && allTags.length > 0 ? handleBulkAddTag : undefined}
              advisors={advisors}
              advisorRole={advisorRole}
              allTags={allTags}
            />
          )}
        </div>

        <div
          role="list"
          ref={listScrollRef}
          onScroll={handleListScroll}
          className="flex-1 overflow-y-auto p-1"
        >
          {tab === "deleted" ? (
            deletedContacts.length > 0 ? (
              <div className="flex flex-col gap-1">
                <p className="px-2 py-1 text-xs text-muted-foreground">
                  {deletedContacts.length} chat{deletedContacts.length !== 1 ? "s" : ""}{" "}
                  eliminado{deletedContacts.length !== 1 ? "s" : ""}
                </p>
                {deletedContacts.map((contact) => (
                  <DeletedContactItem
                    key={contact.id}
                    contact={contact}
                    onRestore={(id) => void onRestoreChat?.(id)}
                  />
                ))}
              </div>
            ) : (
              <ChatEmptyState Icon={Trash2} message={emptyMessage} />
            )
          ) : result.success && filtered.length > 0 ? (
            <div className="flex flex-col gap-1">
              {listVirtual.beforeHeight > 0 && (
                <div aria-hidden="true" style={{ height: listVirtual.beforeHeight }} />
              )}
              {listVirtual.items.map((contact) => (
              <ChatContactItem
                key={contact.id}
                contact={contact}
                selected={selectedJid === contact.id && (selectedInstanceName == null || contact.instanceName === selectedInstanceName)}
                onSelect={handleSelectJid}
                onTogglePin={handleItemTogglePin}
                onArchive={handleItemArchive}
                canDelete={canDeleteChats}
                onDeleteRequest={setDeleteTarget}
                onLeadStatusChange={onLeadStatusChange}
                onServiceTypeChange={onServiceTypeChange}
                onClientStatusChange={onClientStatusChange}
                clientValidationEnabled={clientValidationEnabled}
                advisors={advisors}
                advisorRole={advisorRole}
                currentAdvisorId={currentAdvisorId}
                onAssignAdvisor={onAssignAdvisor}
                showInstanceBadge={instancias.length > 1 && !selectedChannel}
                isChecked={selectedJids.size > 0 ? selectedJids.has(contact.id) : undefined}
                onToggleSelect={toggleSelectJid}
                allTags={allTags}
                onMarkRead={handleItemMarkRead}
                onMarkUnread={markMessageAsUnseen}
                onResolve={handleResolve}
                onAssignTag={handleAssignTag}
                onRenameRequest={handleItemRenameRequest}
                isStarred={starredJids.has(contact.id)}
                onToggleStar={toggleStarred}
                hasNotes={contact.hasNotes}
              />
              ))}
              {listVirtual.afterHeight > 0 && (
                <div aria-hidden="true" style={{ height: listVirtual.afterHeight }} />
              )}
            </div>
          ) : (
            <ChatEmptyState
              Icon={Inbox}
              message={result.success ? emptyMessage : result.message || "No disponible."}
            />
          )}
        </div>
      </aside>

      <DeleteChatDialog
        target={deleteTarget}
        onConfirm={(id) => void onDeleteChat?.(id)}
        onCancel={() => setDeleteTarget(null)}
      />

      <Dialog open={!!renameTarget} onOpenChange={(open) => !open && setRenameTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Cambiar nombre del contacto</DialogTitle>
          </DialogHeader>
          <Input
            value={renameDraft}
            onChange={(e) => setRenameDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void handleRenameSubmit(); }}
            placeholder="Nombre del contacto"
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameTarget(null)}>Cancelar</Button>
            <Button onClick={() => void handleRenameSubmit()} disabled={renameLoading}>
              {renameLoading ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={bulkDeleteOpen} onOpenChange={(open) => !open && setBulkDeleteOpen(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar chats</AlertDialogTitle>
            <AlertDialogDescription>
              {`Se quitaran ${selectedJids.size} chat${selectedJids.size !== 1 ? "s" : ""} de esta vista y se eliminaran sus sesiones en la app. Si los clientes vuelven a escribir, apareceran como conversaciones entrantes nuevas.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => void handleBulkDelete()}
            >
              Eliminar {selectedJids.size} chat{selectedJids.size !== 1 ? "s" : ""}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
