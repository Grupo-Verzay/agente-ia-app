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
