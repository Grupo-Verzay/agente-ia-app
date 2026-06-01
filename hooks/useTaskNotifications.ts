"use client";

import { useEffect, useRef } from "react";
import { getMyTasksAction } from "@/actions/task-actions";
import { useTaskStore } from "@/stores/useTaskStore";
import type { TaskData } from "@/lib/task-types";

const POLL_INTERVAL_MS = 60_000; // 1 minuto

function isTodayOrOverdue(isoDate: string): boolean {
  const due = new Date(isoDate);
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  return due <= endOfToday;
}

function isDueNow(isoDate: string): boolean {
  const due = new Date(isoDate);
  const now = new Date();
  const inOneMinute = new Date(now.getTime() + POLL_INTERVAL_MS);
  return due >= now && due <= inOneMinute;
}

async function requestNotificationPermission(): Promise<boolean> {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const result = await Notification.requestPermission();
  return result === "granted";
}

function fireNotification(task: TaskData) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const contact = task.contactName ? ` — ${task.contactName}` : "";
  new Notification(`📋 Tarea: ${task.title}`, {
    body: `${task.type}${contact}\n🕐 ${new Date(task.dueDate).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit", hour12: true })}`,
    icon: "/favicon.ico",
    tag: `task-${task.id}`,
  });
}

export function useTaskNotifications() {
  const setPendingCount = useTaskStore((s) => s.setPendingCount);
  const notifiedIds = useRef<Set<number>>(new Set());

  const check = async () => {
    const res = await getMyTasksAction();
    if (!res.success || !res.data) return;

    const pending = res.data.filter((t) => t.status === "pending");

    // Actualizar badge count (vencidas + hoy)
    const todayOrOverdue = pending.filter((t) => isTodayOrOverdue(t.dueDate));
    setPendingCount(todayOrOverdue.length);

    // Disparar notificaciones para tareas que vencen AHORA
    const dueSoon = pending.filter(
      (t) => isDueNow(t.dueDate) && !notifiedIds.current.has(t.id),
    );
    for (const task of dueSoon) {
      fireNotification(task);
      notifiedIds.current.add(task.id);
    }
  };

  useEffect(() => {
    void requestNotificationPermission();
    void check();
    const interval = setInterval(() => void check(), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);
}
