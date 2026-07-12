import type { ChatContactSessionMap } from "@/types/session";

export type SidebarContact = {
  id: string;
  chatSession: ChatContactSessionMap[string] | null;
  isArchived: boolean;
  isDeleted: boolean;
  isGroup: boolean;
  isPinned: boolean;
  isUnreadLocal: boolean;
  lastMessage: string;
  lastMessageId: string;
  messageType?: string;
  name: string;
  avatarSrc: string;
  pinnedAtMs: number;
  timestamp: string;
  ts: number;
  instanceName?: string;
  instanceDisplayName?: string;
  hasNotes?: boolean;
};

export type TabKey = "all" | "mine" | "dm" | "groups" | "archived" | "deleted";

export type TabCounts = Record<TabKey, number>;

export type TabConfig = {
  key: TabKey;
  label: string;
  color: string;
  count: number;
};
