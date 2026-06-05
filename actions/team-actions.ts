"use server";

import bcrypt from "bcryptjs";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { LENGTH_PASSWORD_HASH } from "@/types/generic";
import { getUserModuleIds, setUserModules } from "@/actions/user-module-actions";
import { getAllModules } from "@/actions/module-actions";
import { autoAssignUnassignedSessionsForOwner } from "@/actions/advisor-assign-actions";

export type ModuleOption = { id: string; label: string };
export type AdvisorRow = {
  id: string;
  name: string | null;
  email: string;
  advisorRole: string | null;
  assignedCount: number;
  activeCount: number;
  advisorAvailable: boolean;
  lastActivity: string | null;
};
export type AdvisorInfo = { id: string; name: string | null; email: string; advisorRole: string | null };

type ActionResult<T = undefined> =
  | { success: true; data?: T; message?: string }
  | { success: false; message: string };

async function requireOwner() {
  const user = await currentUser();
  if (!user?.id) return null;
  if (user.ownerId && user.advisorRole !== "administrador") return null;
  return user;
}

// Verifica que un asesor pertenece al dueño usando raw SQL
async function findAdvisorRaw(advisorId: string, ownerId: string): Promise<boolean> {
  const rows = await db.$queryRaw<{ id: string }[]>`
    SELECT u.id
    FROM "User" u
    WHERE u.id = ${advisorId}
      AND (
        u.owner_id = ${ownerId}
        OR EXISTS (
          SELECT 1
          FROM "linked_accounts" la
          WHERE la."master_user_id" = ${ownerId}
            AND la."linked_user_id" = u.id
        )
      )
    LIMIT 1
  `;
  return rows.length > 0;
}

export async function getTeamAdvisors(): Promise<ActionResult<AdvisorRow[]>> {
  const owner = await requireOwner();
  if (!owner) return { success: false, message: "No autorizado." };

  const rows = await db.$queryRaw<AdvisorRow[]>`
    WITH members AS (
      SELECT
        u.id,
        u.name,
        u.email,
        u.advisor_role::text AS role,
        u.advisor_available,
        0 AS priority
      FROM "User" u
      WHERE u.owner_id = ${owner.id}

      UNION ALL

      SELECT
        u.id,
        u.name,
        u.email,
        la.role::text AS role,
        u.advisor_available,
        1 AS priority
      FROM "linked_accounts" la
      JOIN "User" u ON u.id = la."linked_user_id"
      WHERE la."master_user_id" = ${owner.id}
    ),
    dedup AS (
      SELECT DISTINCT ON (id)
        id,
        name,
        email,
        role,
        advisor_available
      FROM members
      ORDER BY id, priority DESC
    )
    SELECT
      d.id,
      d.name,
      d.email,
      d.role AS "advisorRole",
      d.advisor_available AS "advisorAvailable",
      COUNT(s.id)::int AS "assignedCount",
      COUNT(s.id) FILTER (WHERE s.status = true)::int AS "activeCount",
      MAX(s."updatedAt") AS "lastActivity"
    FROM dedup d
    LEFT JOIN "Session" s ON s.assigned_advisor_id = d.id
    GROUP BY d.id, d.name, d.email, d.role, d.advisor_available
    ORDER BY d.name ASC
  `;

  return {
    success: true,
    data: rows.map((row) => ({
      ...row,
      lastActivity: row.lastActivity ? String(row.lastActivity) : null,
    })),
  };
}

export async function updateAdvisorRole(advisorId: string, role: "agente" | "administrador"): Promise<ActionResult> {
  const owner = await requireOwner();
  if (!owner) return { success: false, message: "No autorizado." };

  const found = await findAdvisorRaw(advisorId, owner.id);
  if (!found) return { success: false, message: "Asesor no encontrado." };

  const linkedMembership = await db.$queryRaw<{ id: string }[]>`
    SELECT id
    FROM "linked_accounts"
    WHERE "master_user_id" = ${owner.id}
      AND "linked_user_id" = ${advisorId}
    LIMIT 1
  `;

  if (linkedMembership.length > 0) {
    await db.$executeRaw`
      UPDATE "linked_accounts"
      SET role = ${role}::"LinkedAccountRole"
      WHERE id = ${linkedMembership[0].id}
    `;
  } else {
    await db.$executeRaw`UPDATE "User" SET advisor_role = ${role} WHERE id = ${advisorId}`;
  }
  return { success: true, message: "Rol actualizado." };
}

export async function toggleAdvisorAvailability(advisorId: string, available: boolean): Promise<ActionResult> {
  const owner = await requireOwner();
  if (!owner) return { success: false, message: "No autorizado." };

  const found = await findAdvisorRaw(advisorId, owner.id);
  if (!found) return { success: false, message: "Asesor no encontrado." };

  await db.$executeRaw`UPDATE "User" SET advisor_available = ${available} WHERE id = ${advisorId}`;
  return { success: true };
}

export async function getTeamAdvisorInfos(): Promise<ActionResult<AdvisorInfo[]>> {
  const user = await currentUser();
  if (!user?.id) return { success: false, message: "No autorizado." };
  const ownerId: string = user.id;

  const rows = await db.$queryRaw<AdvisorInfo[]>`
    WITH members AS (
      SELECT
        u.id,
        u.name,
        u.email,
        u.advisor_role::text AS role,
        0 AS priority
      FROM "User" u
      WHERE u.owner_id = ${ownerId}

      UNION ALL

      SELECT
        u.id,
        u.name,
        u.email,
        la.role::text AS role,
        1 AS priority
      FROM "linked_accounts" la
      JOIN "User" u ON u.id = la."linked_user_id"
      WHERE la."master_user_id" = ${ownerId}
    ),
    dedup AS (
      SELECT DISTINCT ON (id)
        id,
        name,
        email,
        role
      FROM members
      ORDER BY id, priority DESC
    )
    SELECT id, name, email, role AS "advisorRole"
    FROM dedup
    ORDER BY name ASC
  `;
  return { success: true, data: rows };
}

export async function createAdvisor(input: {
  name: string;
  email: string;
  password: string;
  role?: "agente" | "administrador";
}): Promise<ActionResult> {
  const owner = await requireOwner();
  if (!owner) return { success: false, message: "No autorizado." };

  const name = input.name?.trim();
  const email = input.email?.trim().toLowerCase();
  const password = input.password?.trim();

  if (!name || !email || !password)
    return { success: false, message: "Nombre, email y contraseña son obligatorios." };
  if (password.length < 6)
    return { success: false, message: "La contraseña debe tener al menos 6 caracteres." };

  const existing = await db.user.findUnique({ where: { email } });
  if (existing) return { success: false, message: "Ya existe un usuario con ese email." };

  const passwordHash = await bcrypt.hash(password, LENGTH_PASSWORD_HASH);

  const newUser = await db.user.create({
    data: { email, name, password: passwordHash },
    select: { id: true },
  });

  const role = input.role ?? "agente";
  await db.$executeRaw`UPDATE "User" SET owner_id = ${owner.id}, advisor_role = ${role} WHERE id = ${newUser.id}`;

  return { success: true, message: "Asesor creado correctamente." };
}

export async function updateAdvisorPassword(input: {
  advisorId: string;
  newPassword: string;
}): Promise<ActionResult> {
  const owner = await requireOwner();
  if (!owner) return { success: false, message: "No autorizado." };

  const newPassword = input.newPassword?.trim();
  if (!newPassword || newPassword.length < 6)
    return { success: false, message: "La contraseña debe tener al menos 6 caracteres." };

  const found = await findAdvisorRaw(input.advisorId, owner.id);
  if (!found) return { success: false, message: "Asesor no encontrado." };

  const passwordHash = await bcrypt.hash(newPassword, LENGTH_PASSWORD_HASH);
  await db.user.update({ where: { id: input.advisorId }, data: { password: passwordHash } });

  return { success: true, message: "Contraseña actualizada." };
}

export async function deleteAdvisor(advisorId: string): Promise<ActionResult> {
  const owner = await requireOwner();
  if (!owner) return { success: false, message: "No autorizado." };

  const found = await findAdvisorRaw(advisorId, owner.id);
  if (!found) return { success: false, message: "Asesor no encontrado." };

  const linkedMembership = await db.$queryRaw<{ id: string }[]>`
    SELECT id
    FROM "linked_accounts"
    WHERE "master_user_id" = ${owner.id}
      AND "linked_user_id" = ${advisorId}
    LIMIT 1
  `;

  if (linkedMembership.length > 0) {
    await db.$executeRaw`
      DELETE FROM "linked_accounts"
      WHERE id = ${linkedMembership[0].id}
    `;
    return { success: true, message: "Asesor desvinculado." };
  }

  const linkedCountRows = await db.$queryRaw<{ cnt: number }[]>`
    SELECT COUNT(*)::int AS cnt
    FROM "linked_accounts"
    WHERE "linked_user_id" = ${advisorId}
  `;
  if ((linkedCountRows[0]?.cnt ?? 0) > 0) {
    return {
      success: false,
      message: "Este asesor está vinculado a otras cuentas. Desvincúlalo primero antes de eliminarlo.",
    };
  }

  // Release any sessions assigned to this advisor
  await db.$executeRaw`UPDATE "Session" SET assigned_advisor_id = NULL WHERE assigned_advisor_id = ${advisorId}`;

  // Service has no onDelete:Cascade — clean up appointments then services manually
  const services = await db.service.findMany({ where: { userId: advisorId }, select: { id: true } });
  if (services.length > 0) {
    const serviceIds = services.map((s) => s.id);
    await db.appointment.updateMany({ where: { serviceId: { in: serviceIds } }, data: { serviceId: null } });
    await db.service.deleteMany({ where: { id: { in: serviceIds } } });
  }

  await db.user.delete({ where: { id: advisorId } });

  return { success: true, message: "Asesor eliminado." };
}

export async function linkExistingAdvisor(
  email: string,
  role: "agente" | "administrador" = "agente",
): Promise<ActionResult> {
  const owner = await requireOwner();
  if (!owner) return { success: false, message: "No autorizado." };

  const target = await db.user.findUnique({
    where: { email: email.trim().toLowerCase() },
    select: { id: true },
  });
  if (!target) return { success: false, message: "No existe un usuario con ese email." };
  if (target.id === owner.id) return { success: false, message: "No puedes vincularte a ti mismo." };

  const existing = await db.$queryRaw<{ id: string }[]>`
    SELECT id
    FROM "linked_accounts"
    WHERE "master_user_id" = ${owner.id}
      AND "linked_user_id" = ${target.id}
    LIMIT 1
  `;
  if (existing.length > 0) {
    return { success: false, message: "Ese asesor ya está vinculado a esta cuenta." };
  }

  await db.$executeRaw`
    INSERT INTO "linked_accounts" (id, "master_user_id", "linked_user_id", role)
    VALUES (${crypto.randomUUID()}, ${owner.id}, ${target.id}, ${role}::"LinkedAccountRole")
  `;

  return { success: true, message: "Usuario vinculado como asesor correctamente." };
}

export async function getAdvisorModuleIds(advisorId: string): Promise<ActionResult<string[]>> {
  const owner = await requireOwner();
  if (!owner) return { success: false, message: "No autorizado." };

  const found = await findAdvisorRaw(advisorId, owner.id);
  if (!found) return { success: false, message: "Asesor no encontrado." };

  const res = await getUserModuleIds(advisorId);
  return { success: true, data: res.data };
}

export async function saveAdvisorModules(advisorId: string, moduleIds: string[]): Promise<ActionResult> {
  const owner = await requireOwner();
  if (!owner) return { success: false, message: "No autorizado." };

  const found = await findAdvisorRaw(advisorId, owner.id);
  if (!found) return { success: false, message: "Asesor no encontrado." };

  const saved = await setUserModules(advisorId, moduleIds);
  if (!saved.success) return { success: false, message: "Error al guardar módulos." };
  return { success: true, message: "Módulos guardados." };
}

export type AdvisorMetric = {
  id: string;
  name: string | null;
  email: string;
  totalAssigned: number;
  activeCount: number;
  closedCount: number;
  hotCount: number;
  convertedCount: number;
};

export type TeamMetrics = {
  advisors: AdvisorMetric[];
  global: {
    totalActive: number;
    newThisWeek: number;
    escalationRate: number;
    conversionRate: number;
    leadStatus: { FRIO: number; TIBIO: number; CALIENTE: number; FINALIZADO: number; DESCARTADO: number };
  };
};

export async function getTeamMetrics(): Promise<ActionResult<TeamMetrics>> {
  const owner = await requireOwner();
  if (!owner) return { success: false, message: "No autorizado." };

  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  const [advisorRows, globalRows, leadRows, newSessionRows] = await Promise.all([
    // Per-advisor stats
    db.$queryRaw<{
      id: string; name: string | null; email: string;
      total_assigned: number; active_count: number; closed_count: number;
      hot_count: number; converted_count: number;
    }[]>`
      WITH members AS (
        SELECT
          u.id,
          u.name,
          u.email,
          0 AS priority
        FROM "User" u
        WHERE u.owner_id = ${owner.id}

        UNION ALL

        SELECT
          u.id,
          u.name,
          u.email,
          1 AS priority
        FROM "linked_accounts" la
        JOIN "User" u ON u.id = la."linked_user_id"
        WHERE la."master_user_id" = ${owner.id}
      ),
      dedup AS (
        SELECT DISTINCT ON (id)
          id,
          name,
          email
        FROM members
        ORDER BY id, priority DESC
      )
      SELECT
        d.id, d.name, d.email,
        COUNT(s.id)::int                                                   AS total_assigned,
        COUNT(s.id) FILTER (WHERE s.status = true)::int                    AS active_count,
        COUNT(s.id) FILTER (WHERE s.status = false)::int                   AS closed_count,
        COUNT(s.id) FILTER (WHERE s."leadStatus" = 'CALIENTE')::int         AS hot_count,
        COUNT(s.id) FILTER (WHERE s."leadStatus" = 'FINALIZADO')::int       AS converted_count
      FROM dedup d
      LEFT JOIN "Session" s ON s.assigned_advisor_id = d.id
      GROUP BY d.id, d.name, d.email
      ORDER BY total_assigned DESC
    `,
    // Global: active + escalation rate
    db.$queryRaw<{ total_active: number; escalated: number; total: number }[]>`
      SELECT
        COUNT(*) FILTER (WHERE status = true)::int  AS total_active,
        COUNT(*) FILTER (WHERE "agentDisabled" = true)::int AS escalated,
        COUNT(*)::int                               AS total
      FROM "Session" WHERE "userId" = ${owner.id}
    `,
    // Lead status distribution
    db.$queryRaw<{ leadStatus: string; cnt: number }[]>`
      SELECT "leadStatus", COUNT(*)::int AS cnt
      FROM "Session"
      WHERE "userId" = ${owner.id} AND "leadStatus" IS NOT NULL
      GROUP BY "leadStatus"
    `,
    // New sessions this week
    db.$queryRaw<{ cnt: number }[]>`
      SELECT COUNT(*)::int AS cnt FROM "Session"
      WHERE "userId" = ${owner.id} AND "createdAt" >= ${weekAgo}
    `,
  ]);

  const g = globalRows[0] ?? { total_active: 0, escalated: 0, total: 0 };
  const leadStatus = { FRIO: 0, TIBIO: 0, CALIENTE: 0, FINALIZADO: 0, DESCARTADO: 0 };
  for (const row of leadRows) {
    if (row.leadStatus in leadStatus)
      leadStatus[row.leadStatus as keyof typeof leadStatus] = row.cnt;
  }
  const totalClassified = Object.values(leadStatus).reduce((a, b) => a + b, 0);

  return {
    success: true,
    data: {
      advisors: advisorRows.map((r) => ({
        id: r.id,
        name: r.name,
        email: r.email,
        totalAssigned: r.total_assigned,
        activeCount: r.active_count,
        closedCount: r.closed_count,
        hotCount: r.hot_count,
        convertedCount: r.converted_count,
      })),
      global: {
        totalActive: g.total_active,
        newThisWeek: newSessionRows[0]?.cnt ?? 0,
        escalationRate: g.total > 0 ? Math.round((g.escalated / g.total) * 100) : 0,
        conversionRate: totalClassified > 0 ? Math.round((leadStatus.FINALIZADO / totalClassified) * 100) : 0,
        leadStatus,
      },
    },
  };
}

export async function getAutoAssignSettings(): Promise<
  ActionResult<{ autoAssignEnabled: boolean; autoAssignMaxChats: number }>
> {
  const owner = await requireOwner();
  if (!owner) return { success: false, message: "No autorizado." };

  const rows = await db.$queryRaw<{ autoAssignEnabled: boolean; autoAssignMaxChats: number }[]>`
    SELECT auto_assign_enabled AS "autoAssignEnabled", auto_assign_max_chats AS "autoAssignMaxChats"
    FROM "User" WHERE id = ${owner.id}
  `;
  const row = rows[0] ?? { autoAssignEnabled: false, autoAssignMaxChats: 5 };
  return { success: true, data: row };
}

export async function saveAutoAssignSettings(input: {
  enabled: boolean;
  maxChats: number;
}): Promise<ActionResult> {
  const owner = await requireOwner();
  if (!owner) return { success: false, message: "No autorizado." };

  const maxChats = Math.max(1, Math.min(input.maxChats, 500));
  await db.$executeRaw`
    UPDATE "User"
    SET auto_assign_enabled = ${input.enabled}, auto_assign_max_chats = ${maxChats}
    WHERE id = ${owner.id}
  `;

  if (input.enabled) {
    const result = await autoAssignUnassignedSessionsForOwner(owner.id, {
      assignedBy: owner.id,
      onlyIfEnabled: true,
    });

    return {
      success: true,
      message:
        result.assigned > 0
          ? `Configuracion guardada. ${result.assigned} conversacion${result.assigned === 1 ? "" : "es"} asignada${result.assigned === 1 ? "" : "s"}.`
          : "Configuracion guardada. No hay conversaciones pendientes para asignar.",
    };
  }

  return { success: true, message: "Configuración guardada." };
}

export async function getOwnerModules(): Promise<ActionResult<ModuleOption[]>> {
  const owner = await requireOwner();
  if (!owner) return { success: false, message: "No autorizado." };

  const allRes = await getAllModules();
  if (!allRes.success || !allRes.data) return { success: true, data: [] };

  const ownerIds = await getUserModuleIds(owner.id);
  const enabledIds = new Set(ownerIds.data);

  const modules = allRes.data
    .filter((m) => !m.adminOnly && (enabledIds.size === 0 || enabledIds.has(m.id)))
    .map((m) => ({ id: m.id, label: m.label }));

  return { success: true, data: modules };
}
