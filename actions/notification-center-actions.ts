"use server";

import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { getApiKeyById } from "@/actions/api-action";
import { fetchChatsFromEvolution } from "@/actions/chat-actions";
import { fetchChatsFromBaileys } from "@/actions/baileys-chat-actions";
import { isEvolutionRestInstance } from "@/lib/instance-display-name";

export type NotificationKind =
  | "task"
  | "appointment"
  | "connection"
  | "chat"
  | "mention"
  | "followup";

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
  mention: 0,
  followup: 0,
};

const ITEMS_PER_KIND_LIMIT = 50;

/** Número limpio de un JID (sin @s.whatsapp.net ni sufijo :dispositivo). */
const cleanJidNumber = (jid?: string | null) => {
  const raw = (jid ?? "").replace(/@.*/, "").split(":")[0];
  return raw || (jid ?? "");
};

/**
 * ¿Esta cuenta ve alguna línea, propia o de una cuenta vinculada?
 *
 * El aviso de "Sin instancia de WhatsApp" se levantaba mirando SOLO las líneas
 * colgadas de `ownerId`, y en un montaje con cuentas vinculadas eso no es lo que
 * el usuario tiene delante: la bandeja trabaja con las líneas de todas las
 * cuentas que ve (ver `allSessionUserIds` en la página de Chats). Una cuenta
 * maestra sin líneas propias, operando las de sus clientes, recibía el aviso
 * siendo falso.
 *
 * Y ese aviso es de los que NO se pueden apagar —describen algo roto, y
 * esconderlos dejaría la cuenta muda sin que nadie lo recuerde—, así que uno
 * falso se queda para siempre en la campanita tapando los de verdad.
 *
 * Solo se consulta cuando ya se sabe que no hay líneas propias: en el caso
 * normal no cuesta nada.
 */
async function tieneAlgunaInstancia(ownerId: string): Promise<boolean> {
  try {
    const filas = await db.$queryRaw<{ id: string }[]>`
      SELECT "owner_id" AS id FROM "User"
      WHERE id = ${ownerId} AND "owner_id" IS NOT NULL
      UNION
      SELECT id FROM "User" WHERE "owner_id" = ${ownerId}
      UNION
      SELECT "linked_user_id" AS id FROM "linked_accounts"
      WHERE "master_user_id" = ${ownerId}
      UNION
      SELECT "master_user_id" AS id FROM "linked_accounts"
      WHERE "linked_user_id" = ${ownerId}
    `;

    const otras = filas.map((f) => f.id).filter((id): id is string => Boolean(id) && id !== ownerId);
    if (otras.length === 0) return false;

    const cuantas = await db.instancia.count({ where: { userId: { in: otras } } });
    return cuantas > 0;
  } catch {
    // Ante la duda, no se avisa: un aviso falso que no se puede apagar molesta
    // mas que quedarse sin el, y quien de verdad no tenga linea lo va a notar
    // igual al intentar enviar.
    return true;
  }
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
  const next24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const followupWhere = {
    ownerId,
    status: "pending",
    dueDate: { lte: next24Hours },
    OR: [
      { type: "Seguimiento" },
      { title: { startsWith: "Compromiso:", mode: "insensitive" } },
      { title: { startsWith: "Promesa cliente:", mode: "insensitive" } },
    ],
  };

  try {
    const [
      overdueTasks,
      taskCount,
      followups,
      followupCount,
      pendingAppointments,
      appointmentCount,
      instances,
      owner,
    ] = await Promise.all([
      (db as any).task.findMany({
        where: {
          ownerId,
          status: "pending",
          dueDate: { lt: now },
          NOT: { OR: followupWhere.OR },
        },
        orderBy: { dueDate: "asc" },
        take: ITEMS_PER_KIND_LIMIT,
      }),
      (db as any).task.count({
        where: {
          ownerId,
          status: "pending",
          dueDate: { lt: now },
          NOT: { OR: followupWhere.OR },
        },
      }),
      (db as any).task.findMany({
        where: followupWhere,
        orderBy: { dueDate: "asc" },
        take: ITEMS_PER_KIND_LIMIT,
      }),
      (db as any).task.count({ where: followupWhere }),
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
      db.user.findUnique({
        where: { id: ownerId },
        select: { apiKeyId: true },
      }),
    ]);

    // Chats sin leer: mensajes con unreadCount > 0 en Evolution/Baileys (bajan a 0 al abrir el chat)
    let unreadChats: {
      remoteJid: string;
      pushName?: string | null;
      updatedAt?: string | null;
      lastMessage?: { key?: { id?: string | null } | null } | null;
    }[] = [];
    if (instances.length > 0 && owner?.apiKeyId) {
      // Solo instancias servibles por Evolution/Baileys. El último fallback ya NO
      // es instances[0]: si solo hay Meta/Telegram, no se llama al endpoint de
      // Evolution (daba 404 "Cannot GET /chat/findChats/<meta>"); esos chats se
      // leen del store unificado, no de aquí.
      const instance =
        instances.find((i) => i.instanceType === "Whatsapp") ??
        instances.find((i) => i.instanceType == null) ??
        instances.find((i) => i.instanceType === "baileys") ??
        instances.find((i) => isEvolutionRestInstance(i.instanceType));

      if (instance) {
        const resApikey = await getApiKeyById(owner.apiKeyId);
        const apiKey = resApikey.success && resApikey.data ? resApikey.data : null;
        if (apiKey) {
          const isBaileys = instance.instanceType === "baileys";
          const chatsResult = isBaileys
            ? await fetchChatsFromBaileys(instance.instanceName)
            : await fetchChatsFromEvolution({ url: apiKey.url, key: apiKey.key }, instance.instanceName);

          if (chatsResult.success && chatsResult.data) {
            // Solo mensajes REALMENTE sin leer (unreadCount > 0). Al abrir el chat
            // se marcan como leídos en Evolution → desaparece de la campanita; un
            // mensaje nuevo lo vuelve a mostrar. (Antes se incluían también las
            // sesiones con el agente pausado, que reaparecían aunque ya se hubieran
            // visto, porque ese estado no cambia al leer el chat.)
            unreadChats = chatsResult.data
              .filter((c) => {
                if (!c.lastMessage || c.lastMessage.key?.fromMe) return false;
                return (c.unreadCount ?? 0) > 0;
              })
              .slice(0, ITEMS_PER_KIND_LIMIT);
          }
        }
      }
    }
    const chatCount = unreadChats.length;

    // Notificaciones de colaboración (menciones / agregado como participante).
    let collabItems: NotificationCenterItem[] = [];
    try {
      const collabRows = await (db as any).collabNotification.findMany({
        where: { recipientId: user.id, readAt: null },
        orderBy: { createdAt: "desc" },
        take: ITEMS_PER_KIND_LIMIT,
      });
      const actorIds = Array.from(
        new Set(collabRows.map((r: any) => r.actorId).filter(Boolean)),
      ) as string[];
      const actors = actorIds.length
        ? await db.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } })
        : [];
      const actorName = new Map(actors.map((a) => [a.id, a.name]));
      collabItems = collabRows.map((r: any) => {
        const who = r.actorId ? actorName.get(r.actorId) || "Un asesor" : "Un asesor";
        const title =
          r.type === "mention"
            ? `${who} te mencionó en una nota`
            : `${who} te agregó a una conversación`;
        return {
          id: `collab:${r.id}`,
          kind: "mention" as const,
          title,
          description: r.content ?? null,
          href: r.remoteJid ? `/chats?jid=${encodeURIComponent(r.remoteJid)}` : "/chats",
          date: r.createdAt.toISOString(),
        };
      });
    } catch (e) {
      console.error("[notification-center] collab", e);
    }

    const connectionItems: NotificationCenterItem[] = [];
    if (instances.length === 0 && !(await tieneAlgunaInstancia(ownerId))) {
      connectionItems.push({
        id: "connection-no-instance",
        kind: "connection",
        title: "Sin instancia de WhatsApp",
        description: "Crea o conecta una instancia para enviar y recibir mensajes.",
        href: "/profile",
      });
    }
    if (!owner?.apiKeyId) {
      connectionItems.push({
        id: "connection-no-apikey",
        kind: "connection",
        title: "API Key sin configurar",
        description: "Configura una API Key para habilitar envios y automatizaciones.",
        href: "/profile",
      });
    }
    const items: NotificationCenterItem[] = [
      ...collabItems,
      ...connectionItems,
      ...unreadChats.map((chat) => ({
        // El último mensaje va dentro del identificador a propósito. La campanita
        // recuerda lo que ya se abrió; con un id fijo por contacto, haberlo
        // abierto una vez lo callaría para siempre y no se volvería a avisar de
        // sus mensajes nuevos. Cambiando el id con cada mensaje, lo visto se
        // queda visto y lo nuevo vuelve a salir.
        id: `chat-${chat.remoteJid}-${chat.lastMessage?.key?.id ?? chat.updatedAt ?? ""}`,
        kind: "chat" as const,
        title: chat.pushName || cleanJidNumber(chat.remoteJid),
        description: "Mensaje sin leer",
        href: `/chats?jid=${encodeURIComponent(chat.remoteJid)}`,
        date: chat.updatedAt ?? null,
      })),
      ...pendingAppointments.map((appointment) => ({
        id: `appointment-${appointment.id}`,
        kind: "appointment" as const,
        title: appointment.clientName || appointment.session.pushName || cleanJidNumber(appointment.session.remoteJid),
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
      ...followups.map((task: any) => ({
        id: `followup-${task.id}`,
        kind: "followup" as const,
        title: task.title,
        description: task.contactName
          ? `Seguimiento con ${task.contactName}`
          : "Seguimiento pendiente",
        href: "/tareas",
        date: task.dueDate?.toISOString?.() ?? null,
      })),
    ];

    const counts = {
      task: taskCount,
      appointment: appointmentCount,
      connection: connectionItems.length,
      chat: chatCount,
      mention: collabItems.length,
      followup: followupCount,
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
