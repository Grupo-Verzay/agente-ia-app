"use client";

import React, { useCallback, useMemo, useState } from "react";
import { Inbox, Trash2 } from "lucide-react";
import type { FetchChatsResult } from "@/actions/chat-actions";
import { useLocalStorageObjectArray, MessageRecord } from "@/hooks/chats/useSeenMessages";
import type { ChatConversationPreferenceMap } from "@/types/chat";
import type { ChatContactSessionMap, SimpleTag } from "@/types/session";

import { ChatSearchBar } from "./ChatSearchBar";
import { TagFilterPanel } from "./TagFilterPanel";
import { ChatTabBar } from "./ChatTabBar";
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
  onRestoreChat?: (remoteJid: string) => void | Promise<void>;
  onSelectRemoteJid?: (remoteJid: string) => void | Promise<void>;
  onTogglePin?: (remoteJid: string, isPinned: boolean) => void | Promise<void>;
  result: FetchChatsResult;
  selectedJid?: string;
};

export function ChatSidebar({
  allTags = [],
  chatPreferences,
  chatSessions,
  onArchiveChat,
  onDeleteChat,
  onRestoreChat,
  onSelectRemoteJid,
  onTogglePin,
  result,
  selectedJid,
}: ChatSidebarProps) {
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<TabKey>("all");
  const [deleteTarget, setDeleteTarget] = useState<SidebarContact | null>(null);
  const [selectedTagIds, setSelectedTagIds] = useState<Set<number>>(new Set());
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

    return list.slice().sort((a, b) => {
      if (a.isPinned !== b.isPinned) return Number(b.isPinned) - Number(a.isPinned);
      if (a.pinnedAtMs !== b.pinnedAtMs) return b.pinnedAtMs - a.pinnedAtMs;
      return b.ts - a.ts;
    });
  }, [contacts, q, selectedTagIds, tab]);

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
