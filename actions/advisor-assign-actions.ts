"use server";

import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";

type Result = { success: true; warning?: string } | { success: false; message: string };

export type AssignmentLogEntry = {
  id: number;
  advisorId: string | null;
  assignedBy: string | null;
  action: string;
  createdAt: Date;
};

async function requireOwnerOrAdmin(): Promise<{ userId: string; ownerId: string } | null> {
  const user = await currentUser();
  if (!user?.id) return null;
  const { ownerId, advisorRole } = user;
  if (!ownerId || advisorRole === "administrador") {
    return { userId: user.id, ownerId: ownerId ?? user.id };
  }
  return null;
}

async function logAssignment(
  sessionId: number,
  advisorId: string | null,
  assignedBy: string | null,
  action: string,
) {
  try {
    await db.$executeRaw`
      INSERT INTO "AssignmentLog" ("sessionId", "advisorId", "assignedBy", "action", "createdAt")
      VALUES (${sessionId}, ${advisorId}, ${assignedBy}, ${action}, NOW())
    `;
  } catch (error) {
    console.error("[logAssignment]", error);
  }
}

export async function assignSessionToAdvisor(
  sessionId: number,
  advisorId: string | null,
): Promise<Result> {
  const auth = await requireOwnerOrAdmin();
  if (!auth) return { success: false, message: "No autorizado." };

  // Check limit if assigning (not releasing)
  let warning: string | undefined;
  if (advisorId) {
    const settings = await db.$queryRaw<{ max_chats: number; current_count: number }[]>`
      SELECT
        u.auto_assign_max_chats AS max_chats,
        COUNT(s.id)::int        AS current_count
      FROM "User" u
      LEFT JOIN "Session" s ON s.assigned_advisor_id = u.id AND s.status = true
      WHERE u.id = ${advisorId}
      GROUP BY u.id
    `;
    const row = settings[0];
    if (row && row.current_count >= row.max_chats) {
      warning = `Este asesor ya tiene ${row.current_count} chats activos (límite: ${row.max_chats}).`;
    }
  }

  await db.$executeRaw`
    UPDATE "Session" SET assigned_advisor_id = ${advisorId} WHERE id = ${sessionId}
  `;

  await logAssignment(sessionId, advisorId, auth.userId, advisorId ? "assigned" : "released");

  return { success: true, ...(warning ? { warning } : {}) };
}

export async function takeSession(sessionId: number): Promise<Result> {
  const user = await currentUser();
  if (!user?.id) return { success: false, message: "No autorizado." };
  const { ownerId } = user;
  if (!ownerId) return { success: false, message: "Solo asesores pueden tomar conversaciones." };

  const rows = await db.$queryRaw<{ assigned_advisor_id: string | null }[]>`
    SELECT assigned_advisor_id FROM "Session" WHERE id = ${sessionId}
  `;
  if (!rows[0]) return { success: false, message: "Sesión no encontrada." };
  if (rows[0].assigned_advisor_id && rows[0].assigned_advisor_id !== user.id) {
    return { success: false, message: "Esta conversación ya fue tomada por otro asesor." };
  }

  await db.$executeRaw`
    UPDATE "Session" SET assigned_advisor_id = ${user.id} WHERE id = ${sessionId}
  `;

  await logAssignment(sessionId, user.id, user.id, "taken");

  return { success: true };
}

export async function releaseSession(sessionId: number): Promise<Result> {
  const user = await currentUser();
  if (!user?.id) return { success: false, message: "No autorizado." };

  const rows = await db.$queryRaw<{ assigned_advisor_id: string | null }[]>`
    SELECT assigned_advisor_id FROM "Session" WHERE id = ${sessionId}
  `;
  if (!rows[0]) return { success: false, message: "Sesión no encontrada." };
  if (rows[0].assigned_advisor_id !== user.id) {
    return { success: false, message: "Solo puedes liberar tus propias conversaciones." };
  }

  await db.$executeRaw`
    UPDATE "Session" SET assigned_advisor_id = NULL WHERE id = ${sessionId}
  `;

  await logAssignment(sessionId, null, user.id, "released");

  return { success: true };
}

export async function bulkAutoAssign(): Promise<Result & { assigned?: number }> {
  const user = await currentUser();
  if (!user?.id) return { success: false, message: "No autorizado." };
  const ownerId = user.ownerId ? null : user.id;
  if (!ownerId) return { success: false, message: "Solo el dueño puede hacer asignación masiva." };

  const settings = await db.$queryRaw<{ max_chats: number }[]>`
    SELECT auto_assign_max_chats AS max_chats FROM "User" WHERE id = ${ownerId}
  `;
  const maxChats = settings[0]?.max_chats ?? 5;

  const unassigned = await db.$queryRaw<{ id: number }[]>`
    SELECT id FROM "Session"
    WHERE "userId" = ${ownerId} AND assigned_advisor_id IS NULL AND status = true
    ORDER BY "createdAt" ASC
  `;

  if (unassigned.length === 0) return { success: true, assigned: 0 };

  let assigned = 0;
  for (const session of unassigned) {
    const candidates = await db.$queryRaw<{ id: string }[]>`
      SELECT u.id, COUNT(s.id)::int AS cnt
      FROM "User" u
      LEFT JOIN "Session" s ON s.assigned_advisor_id = u.id AND s.status = true
      WHERE u.owner_id = ${ownerId}
        AND u.advisor_role IS NOT NULL
        AND u.advisor_available = true
      GROUP BY u.id
      HAVING COUNT(s.id)::int < ${maxChats}
      ORDER BY COUNT(s.id) ASC
      LIMIT 1
    `;
    if (candidates.length === 0) break;
    const advisorId = candidates[0].id;
    await db.$executeRaw`
      UPDATE "Session"
      SET assigned_advisor_id = ${advisorId}
      WHERE id = ${session.id} AND assigned_advisor_id IS NULL
    `;
    await logAssignment(session.id, advisorId, ownerId, "bulk_assigned");
    assigned++;
  }

  return { success: true, assigned };
}

export async function transferSession(
  sessionId: number,
  targetAdvisorId: string,
): Promise<Result> {
  const user = await currentUser();
  if (!user?.id) return { success: false, message: "No autorizado." };

  const rows = await db.$queryRaw<{ assigned_advisor_id: string | null }[]>`
    SELECT assigned_advisor_id FROM "Session" WHERE id = ${sessionId}
  `;
  if (!rows[0]) return { success: false, message: "Sesión no encontrada." };
  if (rows[0].assigned_advisor_id !== user.id) {
    return { success: false, message: "Solo puedes transferir tus propias conversaciones." };
  }

  await db.$executeRaw`
    UPDATE "Session" SET assigned_advisor_id = ${targetAdvisorId} WHERE id = ${sessionId}
  `;

  await logAssignment(sessionId, targetAdvisorId, user.id, "transferred");

  return { success: true };
}

export async function resolveSession(sessionId: number): Promise<{ success: boolean; message?: string }> {
  const user = await currentUser();
  if (!user?.id) return { success: false, message: "No autorizado." };

  const rows = await db.$queryRaw<{ userId: string; assignedAdvisorId: string | null }[]>`
    SELECT "userId", assigned_advisor_id AS "assignedAdvisorId"
    FROM "Session" WHERE id = ${sessionId}
  `;
  if (!rows[0]) return { success: false, message: "Sesión no encontrada." };

  const { userId: ownerId, assignedAdvisorId } = rows[0];
  const isOwner = user.id === ownerId;
  const isAssigned = user.id === assignedAdvisorId;
  if (!isOwner && !isAssigned) return { success: false, message: "No autorizado." };

  await db.$executeRaw`UPDATE "Session" SET status = false WHERE id = ${sessionId}`;
  await logAssignment(sessionId, assignedAdvisorId, user.id, "resolved");

  return { success: true, message: "Conversación resuelta." };
}

export async function getAssignmentHistory(sessionId: number): Promise<AssignmentLogEntry[]> {
  try {
    const rows = await db.$queryRaw<AssignmentLogEntry[]>`
      SELECT id, "advisorId", "assignedBy", action, "createdAt"
      FROM "AssignmentLog"
      WHERE "sessionId" = ${sessionId}
      ORDER BY "createdAt" DESC
      LIMIT 5
    `;
    return rows;
  } catch (error) {
    console.error("[getAssignmentHistory]", error);
    return [];
  }
}
