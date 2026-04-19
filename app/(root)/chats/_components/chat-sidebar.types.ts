import type { LucideIcon } from "lucide-react";
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
};

export type TabKey = "all" | "dm" | "groups" | "archived" | "deleted";

export type TabCounts = Record<TabKey, number>;

export type TabConfig = {
  key: TabKey;
  label: string;
  Icon: LucideIcon | null;
  color: string;
  count: number;
};
