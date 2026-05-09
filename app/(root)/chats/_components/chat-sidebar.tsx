"use client";

import React, { useCallback, useMemo, useState } from "react";
import { Inbox, Trash2 } from "lucide-react";
import type { FetchChatsResult } from "@/actions/chat-actions";
import { useLocalStorageObjectArray, MessageRecord } from "@/hooks/chats/useSeenMessages";
import type { ChatConversationPreferenceMap } from "@/types/chat";
import type { ChatContactSessionMap, SimpleTag } from "@/types/session";
import type { AdvisorInfo } from "@/actions/team-actions";

import { ChatSearchBar } from "./ChatSearchBar";
import { TagFilterPanel } from "./TagFilterPanel";
import { ChatTabBar } from "./ChatTabBar";
import { UserX } from "lucide-react";
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
import {
  epochToMs,
  formatTimeFromEpoch,
  nameFrom,
  avatarFrom,
  isGroupJid,
  lastTextFrom,
} from "./chat-sidebar.utils";
import type { SidebarContact, TabKey, TabCounts } from "./chat-sidebar.types";

type ChatSidebarProps = {
  allTags?: SimpleTag[];
  chatPreferences: ChatConversationPreferenceMap;
  chatSessions: ChatContactSessionMap;
  onArchiveChat?: (remoteJid: string, archived: boolean) => void | Promise<void>;
  onDeleteChat?: (remoteJid: string) => void | Promise<void>;
  onLeadStatusChange?: (remoteJid: string, status: import("@/types/session").LeadStatus | null) => void;
  onRestoreChat?: (remoteJid: string) => void | Promise<void>;
  onSelectRemoteJid?: (remoteJid: string) => void | Promise<void>;
  onTogglePin?: (remoteJid: string, isPinned: boolean) => void | Promise<void>;
  result: FetchChatsResult;
  selectedJid?: string;
  advisors?: AdvisorInfo[];
  advisorRole?: string | null;
  currentAdvisorId?: string;
  onAssignAdvisor?: (remoteJid: string, advisorId: string | null) => Promise<void>;
};

export function ChatSidebar({
  allTags = [],
  chatPreferences,
  chatSessions,
  onArchiveChat,
  onDeleteChat,
  onLeadStatusChange,
  onRestoreChat,
  onSelectRemoteJid,
  onTogglePin,
  result,
  selectedJid,
  advisors,
  advisorRole,
  currentAdvisorId,
  onAssignAdvisor,
}: ChatSidebarProps) {
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<TabKey>("all");
  const [deleteTarget, setDeleteTarget] = useState<SidebarContact | null>(null);
  const [selectedTagIds, setSelectedTagIds] = useState<Set<number>>(new Set());
  const [advisorFilter, setAdvisorFilter] = useState<string | null>(null); // null=todos, 'unassigned'=sin asignar, id=asesor específico

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
        const isRead =
          wasSeenPreviously || lastMsgData.fromMe || isSelected || !hasUnreadFromServer;
        const preference = chatPreferences[chat.remoteJid];

        return {
          id: chat.remoteJid,
          chatSession: chatSessions[chat.remoteJid] ?? null,
          name: chatSessions[chat.remoteJid]?.pushName?.trim() || nameFrom(chat),
          avatarSrc: avatarFrom(chat),
          lastMessage: lastMsgData.text,
          lastMessageId: lastMsgData.id,
          messageType: lastMsgData.messageType,
          timestamp: formatTimeFromEpoch(chat.lastMessage?.messageTimestamp),
          ts,
          isGroup: isGroupJid(chat.remoteJid),
          isUnreadLocal: Boolean(lastMsgData.id) && !isRead,
          isPinned: Boolean(preference?.isPinned),
          pinnedAtMs: preference?.pinnedAt ? new Date(preference.pinnedAt).getTime() : 0,
          isArchived: Boolean(preference?.isArchived),
          isDeleted: Boolean(preference?.isDeleted),
        } satisfies SidebarContact;
      })
      .sort((a, b) => {
        if (a.isPinned !== b.isPinned) return Number(b.isPinned) - Number(a.isPinned);
        if (a.pinnedAtMs !== b.pinnedAtMs) return b.pinnedAtMs - a.pinnedAtMs;
        return b.ts - a.ts;
      });
  }, [chatPreferences, chatSessions, isMessageSeen, result, selectedJid]);

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
      dm: active.filter((c) => !c.isGroup).length,
      groups: active.filter((c) => c.isGroup).length,
      archived: contacts.filter((c) => !c.isDeleted && c.isArchived).length,
      deleted: contacts.filter((c) => c.isDeleted).length,
    };
  }, [contacts]);

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

  const filtered = useMemo(() => {
    if (tab === "deleted") return [];

    let list = contacts.filter((c) => !c.isDeleted);

    if (tab === "archived") {
      list = list.filter((c) => c.isArchived);
    } else {
      list = list.filter((c) => !c.isArchived);
      if (tab === "dm") list = list.filter((c) => !c.isGroup);
      if (tab === "groups") list = list.filter((c) => c.isGroup);
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

    return list.slice().sort((a, b) => {
      if (a.isPinned !== b.isPinned) return Number(b.isPinned) - Number(a.isPinned);
      if (a.pinnedAtMs !== b.pinnedAtMs) return b.pinnedAtMs - a.pinnedAtMs;
      return b.ts - a.ts;
    });
  }, [contacts, q, selectedTagIds, tab, advisorFilter]);

  React.useEffect(() => {
    if (selectedJid) {
      document
        .querySelector(`[data-chat-id="${selectedJid}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [selectedJid]);

  const toggleTagFilter = useCallback((tagId: number) => {
    setSelectedTagIds((prev) => {
      if (prev.has(tagId)) return new Set();
      return new Set([tagId]);
    });
  }, []);

  const handleSelectJid = useCallback(
    (jid: string, lastMessageId: string) => {
      if (jid && lastMessageId) markMessageAsSeen(jid, lastMessageId);
      void onSelectRemoteJid?.(jid);
    },
    [markMessageAsSeen, onSelectRemoteJid],
  );

  const emptyMessage =
    tab === "archived"
      ? "No hay chats archivados que coincidan con el filtro."
      : tab === "deleted"
        ? "No hay chats eliminados."
        : "No hay chats que coincidan con el filtro.";

  return (
    <>
      <aside className="flex h-full w-full max-w-[700px] flex-col border-r bg-background/60 backdrop-blur supports-[backdrop-filter]:bg-background/50 xs:min-w-[200px]">
        <div className="sticky top-0 z-10 space-y-2 border-b bg-background/80 px-3 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="flex items-center gap-2">
            <ChatSearchBar
              value={q}
              onChange={setQ}
              onClear={() => setQ("")}
            />
            {allTags.length > 0 && (
              <TagFilterPanel
                tags={allTags}
                selectedTagIds={selectedTagIds}
                onToggleTag={toggleTagFilter}
                onClearFilter={() => setSelectedTagIds(new Set())}
              />
            )}
          </div>

          {showAdvisorFilter && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
              <button
                type="button"
                onClick={() => setAdvisorFilter(null)}
                className={cn(
                  'shrink-0 h-6 rounded-full px-2 text-[10px] font-medium transition-colors',
                  advisorFilter === null
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                )}
              >
                Todos
              </button>
              <div className="relative shrink-0">
                <button
                  type="button"
                  onClick={() => setAdvisorFilter(advisorFilter === 'unassigned' ? null : 'unassigned')}
                  title={`Sin asignar (${advisorCounts.unassigned})`}
                  className={cn(
                    'inline-flex h-6 w-6 items-center justify-center rounded-full border transition-colors',
                    advisorFilter === 'unassigned'
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-dashed border-muted-foreground/50 text-muted-foreground hover:border-primary hover:text-primary'
                  )}
                >
                  <UserX className="h-3 w-3" />
                </button>
                {advisorCounts.unassigned > 0 && (
                  <span className="pointer-events-none absolute -top-1 -right-1 inline-flex h-3.5 min-w-[0.875rem] items-center justify-center rounded-full bg-amber-500 px-0.5 text-[8px] font-bold text-white leading-none">
                    {advisorCounts.unassigned > 99 ? '99+' : advisorCounts.unassigned}
                  </span>
                )}
              </div>
              {advisors?.map((a) => {
                const count = advisorCounts.countMap[a.id] ?? 0;
                return (
                  <div key={a.id} className="relative shrink-0">
                    <button
                      type="button"
                      onClick={() => setAdvisorFilter(advisorFilter === a.id ? null : a.id)}
                      title={`${a.name ?? a.email} (${count})`}
                      className={cn(
                        'inline-flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold text-white transition-opacity',
                        colorFor(a.id),
                        advisorFilter === a.id ? 'ring-2 ring-primary ring-offset-1' : 'opacity-70 hover:opacity-100'
                      )}
                    >
                      {initials(a.name, a.email)}
                    </button>
                    {count > 0 && (
                      <span className="pointer-events-none absolute -top-1 -right-1 inline-flex h-3.5 min-w-[0.875rem] items-center justify-center rounded-full bg-zinc-700 px-0.5 text-[8px] font-bold text-white leading-none dark:bg-zinc-300 dark:text-zinc-900">
                        {count > 99 ? '99+' : count}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <ChatTabBar tab={tab} onTabChange={setTab} tabCounts={tabCounts} />
        </div>

        <div role="list" className="flex-1 space-y-1 overflow-y-auto p-1">
          {tab === "deleted" ? (
            deletedContacts.length > 0 ? (
              <>
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
              </>
            ) : (
              <ChatEmptyState Icon={Trash2} message={emptyMessage} />
            )
          ) : result.success && filtered.length > 0 ? (
            filtered.map((contact) => (
              <ChatContactItem
                key={contact.id}
                contact={contact}
                selected={selectedJid === contact.id}
                onSelect={handleSelectJid}
                onTogglePin={(id, isPinned) => void onTogglePin?.(id, isPinned)}
                onArchive={(id, isArchived) => void onArchiveChat?.(id, isArchived)}
                onDeleteRequest={setDeleteTarget}
                onLeadStatusChange={onLeadStatusChange}
                advisors={advisors}
                advisorRole={advisorRole}
                currentAdvisorId={currentAdvisorId}
                onAssignAdvisor={onAssignAdvisor}
              />
            ))
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
    </>
  );
}
