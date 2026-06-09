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

const ITEMS_PER_KIND_LIMIT = 50;

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
      unreadConversations,
      owner,
    ] = await Promise.all([
      (db as any).task.findMany({
        where: { ownerId, status: "pending", dueDate: { lt: now } },
        orderBy: { dueDate: "asc" },
        take: ITEMS_PER_KIND_LIMIT,
      }),
      (db as any).task.count({
        where: { ownerId, status: "pending", dueDate: { lt: now } },
      }),
      db.appointment.findMany({
        where: { userId: ownerId, status: "PENDIENTE", startTime: { gte: now } },
        include: { session: { select: { pushName: true, remoteJid: true } }, service: { select: { name: true } } },
        orderBy: { startTime: "asc" },
        take: ITEMS_PER_KIND_LIMIT,
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
        take: ITEMS_PER_KIND_LIMIT,
      }),
      db.$queryRaw<{ remoteJid: string }[]>`
        SELECT "remoteJid" FROM (
          SELECT DISTINCT ON ("userId", "remoteJid") "remoteJid", "fromMe"
          FROM chat_messages
          WHERE "userId" = ${ownerId}
          ORDER BY "userId", "remoteJid", "messageTimestamp" DESC, id DESC
        ) latest
        WHERE "fromMe" = false
      `,
      db.user.findUnique({
        where: { id: ownerId },
        select: { apiKeyId: true },
      }),
    ]);

    const unreadJids = new Set(unreadConversations.map((c) => c.remoteJid));
    const unreadChats = activeChats.filter((chat) => unreadJids.has(chat.remoteJid));
    const chatCount = unreadChats.length;

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
      ...unreadChats.map((chat) => ({
        id: `chat-${chat.id}`,
        kind: "chat" as const,
        title: chat.pushName || chat.remoteJid,
        description: user.ownerId ? "Mensaje sin responder (asignado a ti)" : "Mensaje sin responder (sin asignar)",
        href: `/chats?jid=${encodeURIComponent(chat.remoteJid)}`,
        date: chat.updatedAt.toISOString(),
      })),
      ...pendingAppointments.map((appointment) => ({
        id: `appointment-${appointment.id}`,
        kind: "appointment" as const,
        title: appointment.clientName || appointment.session.pushName || appointment.session.remoteJid,
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
        items,
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
