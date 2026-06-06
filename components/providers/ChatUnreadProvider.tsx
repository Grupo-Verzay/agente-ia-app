"use client";

import { useChatUnreadNotifications } from "@/hooks/useChatUnreadNotifications";

export function ChatUnreadProvider() {
  useChatUnreadNotifications();
  return null;
}
