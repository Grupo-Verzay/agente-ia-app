"use server";

import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";

export type NotificationKind =
  | "task"
  | "appointment"
  | "connection"
  | "chat";

export type NotificationCenterItem = {
  id: string;
  kind: NotificationKind;
  title: string;
  description?: string | null;
  href: string;
  date?: string | null;
};

export type NotificationCenterData = {
  total: number;
  counts: Record<NotificationKind, number>;
  items: NotificationCenterItem[];
};

const EMPTY_COUNTS: Record<NotificationKind, number> = {
  task: 0,
  appointment: 0,
  connection: 0,
  chat: 0,
};

function parseReminderTime(value: string | null): Date | null {
  if (!value) return null;

  const direct = new Date(value);
  if (!Number.isNaN(direct.getTime())) return direct;

  const match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})$/);
  if (!match) return null;

  const [, day, month, year, hour, minute] = match;
  const parsed = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function getNotificationCenterData(): Promise<{
  success: boolean;
  data: NotificationCenterData;
  message?: string;
}> {
  const user = await currentUser();
  if (!user) {
    return { success: false, data: { total: 0, counts: EMPTY_COUNTS, items: [] }, message: "No autorizado." };
  }

  const ownerId = user.ownerId ?? user.id;
  const now = new Date();

  try {
    const [
      overdueTasks,
      taskCount,
      pendingAppointments,
      appointmentCount,
      instances,
      activeChats,
      chatCount,
      owner,
    ] = await Promise.all([
      (db as any).task.findMany({
        where: { ownerId, status: "pending", dueDate: { lt: now } },
        orderBy: { dueDate: "asc" },
        take: 5,
      }),
      (db as any).task.count({
        where: { ownerId, status: "pending", dueDate: { lt: now } },
      }),
      db.appointment.findMany({
        where: { userId: ownerId, status: "PENDIENTE", startTime: { gte: now } },
        include: { session: { select: { pushName: true, remoteJid: true } }, service: { select: { name: true } } },
        orderBy: { startTime: "asc" },
        take: 5,
      }),
      db.appointment.count({
        where: { userId: ownerId, status: "PENDIENTE", startTime: { gte: now } },
      }),
      db.instancia.findMany({
        where: { userId: ownerId },
        select: { id: true, instanceName: true, instanceType: true },
      }),
      db.session.findMany({
        where: user.ownerId
          ? { userId: ownerId, status: true, assignedAdvisorId: user.id }
          : { userId: ownerId, status: true, assignedAdvisorId: null },
        orderBy: { updatedAt: "desc" },
        take: 5,
      }),
      db.session.count({
        where: user.ownerId
          ? { userId: ownerId, status: true, assignedAdvisorId: user.id }
          : { userId: ownerId, status: true, assignedAdvisorId: null },
      }),
      db.user.findUnique({
        where: { id: ownerId },
        select: { apiKeyId: true },
      }),
    ]);

    const connectionItems: NotificationCenterItem[] = [];
    if (instances.length === 0) {
      connectionItems.push({
        id: "connection-no-instance",
        kind: "connection",
        title: "Sin instancia de WhatsApp",
        description: "Crea o conecta una instancia para enviar y recibir mensajes.",
        href: "/connection",
      });
    }
    if (!owner?.apiKeyId) {
      connectionItems.push({
        id: "connection-no-apikey",
        kind: "connection",
        title: "API Key sin configurar",
        description: "Configura una API Key para habilitar envios y automatizaciones.",
        href: "/connection",
      });
    }
    const items: NotificationCenterItem[] = [
      ...connectionItems,
      ...activeChats.map((chat) => ({
        id: `chat-${chat.id}`,
        kind: "chat" as const,
        title: chat.pushName || chat.remoteJid,
        description: user.ownerId ? "Chat activo asignado a ti" : "Chat activo sin asignar",
        href: `/chats?jid=${encodeURIComponent(chat.remoteJid)}`,
        date: chat.updatedAt.toISOString(),
      })),
      ...pendingAppointments.map((appointment) => ({
        id: `appointment-${appointment.id}`,
        kind: "appointment" as const,
        title: appointment.session.pushName ?? appointment.session.remoteJid,
        description: appointment.service?.name ? `Cita pendiente: ${appointment.service.name}` : "Cita pendiente",
        href: "/schedule",
        date: appointment.startTime.toISOString(),
      })),
      ...overdueTasks.map((task: any) => ({
        id: `task-${task.id}`,
        kind: "task" as const,
        title: task.title,
        description: task.contactName ? `Tarea vencida con ${task.contactName}` : "Tarea vencida",
        href: "/tareas",
        date: task.dueDate?.toISOString?.() ?? null,
      })),
    ];

    const counts = {
      task: taskCount,
      appointment: appointmentCount,
      connection: connectionItems.length,
      chat: chatCount,
    };

    return {
      success: true,
      data: {
        counts,
        total: Object.values(counts).reduce((sum, count) => sum + count, 0),
        items: items.slice(0, 20),
      },
    };
  } catch (error) {
    console.error("[getNotificationCenterData]", error);
    return {
      success: false,
      data: { total: 0, counts: EMPTY_COUNTS, items: [] },
      message: "Error al cargar notificaciones.",
    };
  }
}
