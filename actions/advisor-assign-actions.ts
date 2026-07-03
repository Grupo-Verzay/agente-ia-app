"use server";

import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";

type Result = { success: true; warning?: string } | { success: false; message: string };

type AutoAssignOptions = {
  assignedBy: string | null;
  onlyIfEnabled?: boolean;
};

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

/**
 * Pipeline de asesores: dispara (fire-and-forget) las automatizaciones
 * configuradas para el asesor recién asignado. Sólo cuando hay un asesor
 * (no en liberaciones). Espeja triggerStageAutomations de session-action.
 */
async function triggerAdvisorAutomations(sessionId: number, advisorId: string | null): Promise<void> {
  if (!advisorId) return;
  const backendUrl = (process.env.BACKEND_URL ?? "").replace(/\/$/, "");
  if (!backendUrl) return;
  const key = process.env.CRM_FOLLOW_UP_RUNNER_KEY ?? "";
  try {
    await fetch(`${backendUrl}/advisor-automations/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-internal-secret": key },
      body: JSON.stringify({ sessionId, advisorId }),
    });
  } catch (error) {
    console.error("[triggerAdvisorAutomations]", error);
  }
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

export async function autoAssignUnassignedSessionsForOwner(
  ownerId: string,
  options: AutoAssignOptions,
): Promise<{ assigned: number; skippedReason?: string }> {
  const settings = await db.$queryRaw<{
    auto_assign_enabled: boolean;
    auto_assign_max_chats: number;
  }[]>`
    SELECT auto_assign_enabled, auto_assign_max_chats
    FROM "User"
    WHERE id = ${ownerId}
    LIMIT 1
  `;
  const setting = settings[0];

  if (options.onlyIfEnabled && !setting?.auto_assign_enabled) {
    return { assigned: 0, skippedReason: "auto_assign_disabled" };
  }

  const maxChats = setting?.auto_assign_max_chats ?? 5;
  const unassigned = await db.$queryRaw<{ id: number }[]>`
    SELECT id FROM "Session"
    WHERE "userId" = ${ownerId}
      AND assigned_advisor_id IS NULL
      AND status = true
    ORDER BY "createdAt" ASC
  `;

  let assigned = 0;
  for (const session of unassigned) {
    const candidates = await db.$queryRaw<{ id: string }[]>`
      WITH members AS (
        SELECT u.id, u.advisor_available
        FROM "User" u
        WHERE u.owner_id = ${ownerId}
          AND u.advisor_role IS NOT NULL

        UNION

        SELECT u.id, u.advisor_available
        FROM "linked_accounts" la
        JOIN "User" u ON u.id = la."linked_user_id"
        WHERE la."master_user_id" = ${ownerId}
      )
      SELECT m.id, COUNT(s.id)::int AS cnt
      FROM members m
      LEFT JOIN "Session" s ON s.assigned_advisor_id = m.id AND s.status = true
      WHERE m.advisor_available = true
      GROUP BY m.id
      HAVING COUNT(s.id)::int < ${maxChats}
      ORDER BY COUNT(s.id) ASC
      LIMIT 1
    `;
    if (candidates.length === 0) {
      return {
        assigned,
        skippedReason: assigned === 0 ? "no_available_advisors" : "advisor_limit_reached",
      };
    }

    const advisorId = candidates[0].id;
    const updated = await db.$executeRaw`
      UPDATE "Session"
      SET assigned_advisor_id = ${advisorId}
      WHERE id = ${session.id}
        AND assigned_advisor_id IS NULL
    `;

    if (Number(updated) > 0) {
      await logAssignment(session.id, advisorId, options.assignedBy, "auto_assigned");
      void triggerAdvisorAutomations(session.id, advisorId);
      assigned++;
    }
  }

  return { assigned };
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
  void triggerAdvisorAutomations(sessionId, advisorId);

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
  void triggerAdvisorAutomations(sessionId, user.id);

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

  const autoAssignResult = await autoAssignUnassignedSessionsForOwner(ownerId, {
    assignedBy: user.id,
    onlyIfEnabled: false,
  });

  return { success: true, assigned: autoAssignResult.assigned };
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
  void triggerAdvisorAutomations(sessionId, targetAdvisorId);

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
