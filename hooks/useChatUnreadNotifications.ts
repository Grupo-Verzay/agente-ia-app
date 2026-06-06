"use client";

import { useEffect } from "react";
import { getChatUnreadCountAction } from "@/actions/chat-unread-count-action";
import { useChatUnreadStore } from "@/stores/useChatUnreadStore";

const POLL_INTERVAL_MS = 60_000;

export function useChatUnreadNotifications() {
  const setUnreadCount = useChatUnreadStore((s) => s.setUnreadCount);

  const check = async () => {
    const count = await getChatUnreadCountAction();
    setUnreadCount(count);
  };

  useEffect(() => {
    void check();
    const interval = setInterval(() => void check(), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);
}
