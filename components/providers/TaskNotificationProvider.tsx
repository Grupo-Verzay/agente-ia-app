"use client";

import { useTaskNotifications } from "@/hooks/useTaskNotifications";

export function TaskNotificationProvider() {
  useTaskNotifications();
  return null;
}
