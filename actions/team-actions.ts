"use server";

import bcrypt from "bcryptjs";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { LENGTH_PASSWORD_HASH } from "@/types/generic";
import { getUserModuleIds, setUserModules } from "@/actions/user-module-actions";
import { getAllModules } from "@/actions/module-actions";

export type ModuleOption = { id: string; label: string };
export type AdvisorRow = {
  id: string;
  name: string | null;
  email: string;
  createdAt: Date;
  advisorRole: string | null;
  assignedCount: number;
  activeCount: number;
  advisorAvailable: boolean;
};
export type AdvisorInfo = { id: string; name: string | null; email: string; advisorRole: string | null };

type ActionResult<T = undefined> =
  | { success: true; data?: T; message?: string }
  | { success: false; message: string };

async function requireOwner() {
  const user = await currentUser();
  if (!user?.id) return null;
  if ((user as any).ownerId) return null;
  return user;
}

// Verifica que un asesor pertenece al dueño usando raw SQL
async function findAdvisorRaw(advisorId: string, ownerId: string): Promise<boolean> {
  const rows = await db.$queryRaw<{ id: string }[]>`
    SELECT id FROM "User" WHERE id = ${advisorId} AND owner_id = ${ownerId}
  `;
  return rows.length > 0;
}

export async function getTeamAdvisors(): Promise<ActionResult<AdvisorRow[]>> {
  const owner = await requireOwner();
  if (!owner) return { success: false, message: "No autorizado." };

  const rows = await db.$queryRaw<AdvisorRow[]>`
    SELECT
      u.id,
      u.name,
      u.email,
      u."createdAt",
      u.advisor_role                                            AS "advisorRole",
      u.advisor_available                                       AS "advisorAvailable",
      COUNT(s.id)::int                                         AS "assignedCount",
      COUNT(s.id) FILTER (WHERE s.status = true)::int         AS "activeCount"
    FROM "User" u
    LEFT JOIN "Session" s ON s.assigned_advisor_id = u.id
    WHERE u.owner_id = ${owner.id}
    GROUP BY u.id
    ORDER BY u."createdAt" ASC
  `;

  return { success: true, data: rows };
}

export async function updateAdvisorRole(advisorId: string, role: "agente" | "administrador"): Promise<ActionResult> {
  const owner = await requireOwner();
  if (!owner) return { success: false, message: "No autorizado." };

  const found = await findAdvisorRaw(advisorId, owner.id);
  if (!found) return { success: false, message: "Asesor no encontrado." };

  await db.$executeRaw`UPDATE "User" SET advisor_role = ${role} WHERE id = ${advisorId}`;
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
  const ownerId: string = (user as any).ownerId ?? user.id;

  const rows = await db.$queryRaw<AdvisorInfo[]>`
    SELECT id, name, email, advisor_role AS "advisorRole"
    FROM "User"
    WHERE owner_id = ${ownerId}
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

  await db.user.delete({ where: { id: advisorId } });

  return { success: true, message: "Asesor eliminado." };
}

export async function linkExistingAdvisor(email: string): Promise<ActionResult> {
  const owner = await requireOwner();
  if (!owner) return { success: false, message: "No autorizado." };

  const target = await db.user.findUnique({
    where: { email: email.trim().toLowerCase() },
    select: { id: true },
  });
  if (!target) return { success: false, message: "No existe un usuario con ese email." };
  if (target.id === owner.id) return { success: false, message: "No puedes vincularte a ti mismo." };

  await db.$executeRaw`UPDATE "User" SET owner_id = ${owner.id} WHERE id = ${target.id}`;

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
      SELECT
        u.id, u.name, u.email,
        COUNT(s.id)::int                                                   AS total_assigned,
        COUNT(s.id) FILTER (WHERE s.status = true)::int                    AS active_count,
        COUNT(s.id) FILTER (WHERE s.status = false)::int                   AS closed_count,
        COUNT(s.id) FILTER (WHERE s."leadStatus" = 'CALIENTE')::int         AS hot_count,
        COUNT(s.id) FILTER (WHERE s."leadStatus" = 'FINALIZADO')::int       AS converted_count
      FROM "User" u
      LEFT JOIN "Session" s ON s.assigned_advisor_id = u.id
      WHERE u.owner_id = ${owner.id}
      GROUP BY u.id, u.name, u.email
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
