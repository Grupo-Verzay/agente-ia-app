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

  const rows = await db.user.findMany({
    where: { ownerId: owner.id },
    select: { id: true, name: true, email: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  return { success: true, data: rows };
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

  await db.user.create({
    data: { email, name, password: passwordHash, ownerId: owner.id },
  });

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

  const found = await db.user.findFirst({ where: { id: input.advisorId, ownerId: owner.id }, select: { id: true } });
  if (!found) return { success: false, message: "Asesor no encontrado." };

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

  const found = await db.user.findFirst({ where: { id: advisorId, ownerId: owner.id }, select: { id: true } });
  if (!found) return { success: false, message: "Asesor no encontrado." };

  await db.user.delete({ where: { id: advisorId } });

  return { success: true, message: "Asesor eliminado." };
}

export async function linkExistingAdvisor(email: string): Promise<ActionResult> {
  const owner = await requireOwner();
  if (!owner) return { success: false, message: "No autorizado." };

  const target = await db.user.findUnique({ where: { email: email.trim().toLowerCase() }, select: { id: true } });
  if (!target) return { success: false, message: "No existe un usuario con ese email." };
  if (target.id === owner.id) return { success: false, message: "No puedes vincularte a ti mismo." };

  await db.user.update({ where: { id: target.id }, data: { ownerId: owner.id } });

  return { success: true, message: "Usuario vinculado como asesor correctamente." };
}
