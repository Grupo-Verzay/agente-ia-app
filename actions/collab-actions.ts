"use server";

import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";

export type ParticipantInfo = {
  userId: string;
  name: string | null;
  email: string | null;
  addedById: string | null;
  createdAt: string;
};

export type CollabNotificationItem = {
  id: string;
  type: "mention" | "participant_added" | string;
  actorId: string | null;
  actorName: string | null;
  sessionId: number | null;
  remoteJid: string | null;
  content: string | null;
  read: boolean;
  createdAt: string;
};

async function requireUser() {
  const user = await currentUser();
  if (!user?.id) throw new Error("No autorizado.");
  return user;
}

/** IDs de los miembros del equipo (dueño + asesores directos + linked_accounts). */
async function getTeamMemberIds(ownerId: string): Promise<Set<string>> {
  const rows = await db.$queryRaw<{ id: string }[]>`
    SELECT u.id FROM "User" u
      WHERE u.owner_id = ${ownerId} AND u.advisor_role IS NOT NULL
    UNION
    SELECT u.id FROM "linked_accounts" la
      JOIN "User" u ON u.id = la."linked_user_id"
      WHERE la."master_user_id" = ${ownerId}
    UNION
    SELECT ${ownerId} AS id
  `;
  return new Set(rows.map((r) => r.id));
}

/* ─────────────── PARTICIPANTES ─────────────── */

export async function getSessionParticipantsAction(
  sessionId: number,
): Promise<{ success: boolean; data: ParticipantInfo[]; message?: string }> {
  try {
    await requireUser();
    const rows = await (db as any).sessionParticipant.findMany({
      where: { sessionId },
      orderBy: { createdAt: "asc" },
    });

    if (rows.length === 0) return { success: true, data: [] };

    const users = await db.user.findMany({
      where: { id: { in: rows.map((r: any) => r.userId) } },
      select: { id: true, name: true, email: true },
    });
    const byId = new Map(users.map((u) => [u.id, u]));

    return {
      success: true,
      data: rows.map((r: any) => ({
        userId: r.userId,
        name: byId.get(r.userId)?.name ?? null,
        email: byId.get(r.userId)?.email ?? null,
        addedById: r.addedById ?? null,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  } catch (error) {
    console.error("[getSessionParticipantsAction]", error);
    return { success: false, data: [], message: "Error al cargar participantes." };
  }
}

export async function addSessionParticipantAction(
  sessionId: number,
  userId: string,
): Promise<{ success: boolean; message: string }> {
  try {
    const user = await requireUser();
    const ownerId = (user as any).ownerId ?? user.id;

    const session = await db.session.findUnique({
      where: { id: sessionId },
      select: { remoteJid: true },
    });
    if (!session) return { success: false, message: "Conversación no encontrada." };

    const team = await getTeamMemberIds(ownerId);
    if (!team.has(userId)) {
      return { success: false, message: "Ese asesor no pertenece a tu equipo." };
    }

    // Si ya es participante, no duplicamos ni re-notificamos.
    const existing = await (db as any).sessionParticipant.findUnique({
      where: { sessionId_userId: { sessionId, userId } },
    });
    if (existing) return { success: true, message: "Ya es participante." };

    await (db as any).sessionParticipant.create({
      data: { sessionId, userId, addedById: user.id },
    });

    // Notificar al agregado (si no es uno mismo).
    if (userId !== user.id) {
      try {
        await (db as any).collabNotification.create({
          data: {
            recipientId: userId,
            actorId: user.id,
            type: "participant_added",
            sessionId,
            remoteJid: session.remoteJid,
          },
        });
      } catch (e) {
        console.error("[addSessionParticipantAction] notif falló", e);
      }
    }

    return { success: true, message: "Participante agregado." };
  } catch (error) {
    console.error("[addSessionParticipantAction]", error);
    return { success: false, message: "Error al agregar participante." };
  }
}

export async function removeSessionParticipantAction(
  sessionId: number,
  userId: string,
): Promise<{ success: boolean; message: string }> {
  try {
    await requireUser();
    await (db as any).sessionParticipant.deleteMany({ where: { sessionId, userId } });
    return { success: true, message: "Participante removido." };
  } catch (error) {
    console.error("[removeSessionParticipantAction]", error);
    return { success: false, message: "Error al remover participante." };
  }
}

/* ─────────────── NOTIFICACIONES (campanita) ─────────────── */

export async function getCollabNotificationsAction(): Promise<{
  success: boolean;
  data: CollabNotificationItem[];
  unread: number;
}> {
  try {
    const user = await requireUser();
    const rows = await (db as any).collabNotification.findMany({
      where: { recipientId: user.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    const actorIds = Array.from(
      new Set(rows.map((r: any) => r.actorId).filter(Boolean)),
    ) as string[];
    const actors = actorIds.length
      ? await db.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, name: true },
        })
      : [];
    const actorById = new Map(actors.map((a) => [a.id, a.name]));

    let unread = 0;
    const data: CollabNotificationItem[] = rows.map((r: any) => {
      const read = Boolean(r.readAt);
      if (!read) unread++;
      return {
        id: r.id,
        type: r.type,
        actorId: r.actorId ?? null,
        actorName: r.actorId ? actorById.get(r.actorId) ?? null : null,
        sessionId: r.sessionId ?? null,
        remoteJid: r.remoteJid ?? null,
        content: r.content ?? null,
        read,
        createdAt: r.createdAt.toISOString(),
      };
    });

    return { success: true, data, unread };
  } catch (error) {
    console.error("[getCollabNotificationsAction]", error);
    return { success: false, data: [], unread: 0 };
  }
}

export async function markCollabNotificationReadAction(
  id: string,
): Promise<{ success: boolean }> {
  try {
    const user = await requireUser();
    await (db as any).collabNotification.updateMany({
      where: { id, recipientId: user.id, readAt: null },
      data: { readAt: new Date() },
    });
    return { success: true };
  } catch (error) {
    console.error("[markCollabNotificationReadAction]", error);
    return { success: false };
  }
}

export async function markAllCollabNotificationsReadAction(): Promise<{ success: boolean }> {
  try {
    const user = await requireUser();
    await (db as any).collabNotification.updateMany({
      where: { recipientId: user.id, readAt: null },
      data: { readAt: new Date() },
    });
    return { success: true };
  } catch (error) {
    console.error("[markAllCollabNotificationsReadAction]", error);
    return { success: false };
  }
}
