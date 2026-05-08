"use server";

import bcrypt from "bcryptjs";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { LENGTH_PASSWORD_HASH } from "@/types/generic";

type ActionResult<T = undefined> =
  | { success: true; data?: T; message?: string }
  | { success: false; message: string };

async function requireOwner() {
  const user = await currentUser();
  if (!user?.id) return null;
  // Solo el dueño (sin ownerId propio) puede gestionar asesores
  if ((user as any).ownerId) return null;
  return user;
}

export type AdvisorRow = {
  id: string;
  name: string | null;
  email: string;
  createdAt: Date;
};

export async function getTeamAdvisors(): Promise<ActionResult<AdvisorRow[]>> {
  const owner = await requireOwner();
  if (!owner) return { success: false, message: "No autorizado." };

  const rows = await db.$queryRaw<{ id: string; name: string | null; email: string; created_at: Date }[]>`
    SELECT id, name, email, created_at
    FROM "User"
    WHERE owner_id = ${owner.id}
    ORDER BY created_at ASC
  `;

  const advisors: AdvisorRow[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    createdAt: r.created_at,
  }));

  return { success: true, data: advisors };
}

export async function createAdvisor(input: {
  name: string;
  email: string;
  password: string;
}): Promise<ActionResult> {
  const owner = await requireOwner();
  if (!owner) return { success: false, message: "No autorizado." };

  const name = input.name?.trim();
  const email = input.email?.trim().toLowerCase();
  const password = input.password?.trim();

  if (!name || !email || !password) {
    return { success: false, message: "Nombre, email y contraseña son obligatorios." };
  }
  if (password.length < 6) {
    return { success: false, message: "La contraseña debe tener al menos 6 caracteres." };
  }

  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    return { success: false, message: "Ya existe un usuario con ese email." };
  }

  const passwordHash = await bcrypt.hash(password, LENGTH_PASSWORD_HASH);

  // Crear usuario base sin el campo ownerId (por compatibilidad con el cliente Prisma)
  const newUser = await db.user.create({
    data: { email, name, password: passwordHash },
    select: { id: true },
  });

  // Establecer owner_id via SQL raw para garantizar que se guarda correctamente
  await db.$executeRaw`
    UPDATE "User" SET owner_id = ${owner.id} WHERE id = ${newUser.id}
  `;

  return { success: true, message: "Asesor creado correctamente." };
}

export async function updateAdvisorPassword(input: {
  advisorId: string;
  newPassword: string;
}): Promise<ActionResult> {
  const owner = await requireOwner();
  if (!owner) return { success: false, message: "No autorizado." };

  const newPassword = input.newPassword?.trim();
  if (!newPassword || newPassword.length < 6) {
    return { success: false, message: "La contraseña debe tener al menos 6 caracteres." };
  }

  // Verificar que el asesor pertenece a este dueño via raw SQL
  const rows = await db.$queryRaw<{ id: string }[]>`
    SELECT id FROM "User" WHERE id = ${input.advisorId} AND owner_id = ${owner.id}
  `;
  if (!rows.length) return { success: false, message: "Asesor no encontrado." };

  const passwordHash = await bcrypt.hash(newPassword, LENGTH_PASSWORD_HASH);
  await db.user.update({
    where: { id: input.advisorId },
    data: { password: passwordHash },
  });

  return { success: true, message: "Contraseña actualizada." };
}

export async function deleteAdvisor(advisorId: string): Promise<ActionResult> {
  const owner = await requireOwner();
  if (!owner) return { success: false, message: "No autorizado." };

  // Verificar que el asesor pertenece a este dueño (incluye asesores sin owner_id por migración)
  const rows = await db.$queryRaw<{ id: string }[]>`
    SELECT id FROM "User"
    WHERE id = ${advisorId}
    AND (owner_id = ${owner.id} OR owner_id IS NULL)
    AND id != ${owner.id}
  `;
  if (!rows.length) return { success: false, message: "Asesor no encontrado." };

  await db.user.delete({ where: { id: advisorId } });

  return { success: true, message: "Asesor eliminado." };
}

export async function repairAdvisorOwnership(advisorId: string): Promise<ActionResult> {
  const owner = await requireOwner();
  if (!owner) return { success: false, message: "No autorizado." };

  // Establece owner_id para un asesor que fue creado sin él (fix de migración)
  const result = await db.$executeRaw`
    UPDATE "User"
    SET owner_id = ${owner.id}
    WHERE id = ${advisorId}
    AND owner_id IS NULL
    AND id != ${owner.id}
  `;

  if (result === 0) {
    return { success: false, message: "Asesor no encontrado o ya tiene owner asignado." };
  }

  return { success: true, message: "Asesor reparado correctamente." };
}
