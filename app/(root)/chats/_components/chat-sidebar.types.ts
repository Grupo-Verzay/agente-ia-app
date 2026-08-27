import type { ChatContactSessionMap } from "@/types/session";

export type SidebarContact = {
  id: string;
  chatSession: ChatContactSessionMap[string] | null;
  isArchived: boolean;
  isDeleted: boolean;
  // Eliminado y ya sin rastro: sigue oculto, pero no se lista en Eliminados.
  isPurged: boolean;
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

export type TabKey = "all" | "mine" | "dm" | "groups" | "archived" | "resolved" | "deleted";

export type TabCounts = Record<TabKey, number>;

export type TabConfig = {
  key: TabKey;
  label: string;
  color: string;
  count: number;
};
