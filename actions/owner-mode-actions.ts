"use server";

import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { parseOwnerPeople, serializeOwnerPeople, type OwnerPerson } from "@/lib/owner-contacts";

/**
 * "Modo Dueño por WhatsApp" por cuenta (opt-in).
 *
 * Ahora admite VARIAS personas (dueño, socio, administrador…), cada una con
 * nombre + número + cargo. Para no tocar la base de datos, la lista se guarda
 * como JSON en el campo existente `User.ownerModePhone` (ver lib/owner-contacts).
 *
 * El interruptor vive en el panel autenticado: para encenderlo hay que estar
 * logueado como el titular (o un admin), lo que funciona como segundo factor.
 */

async function assertCanManage(targetUserId: string): Promise<void> {
  const me = await currentUser();
  if (!me) throw new Error("No autorizado.");
  const isAdminLike = me.role === "admin" || me.role === "super_admin" || me.role === "reseller";
  if (me.id !== targetUserId && !isAdminLike) {
    throw new Error("No autorizado.");
  }
}

export type OwnerModeStatus = {
  success: boolean;
  enabled: boolean;
  people: OwnerPerson[];
  notificationNumber?: string;
};

export async function getOwnerModeStatus(userId: string): Promise<OwnerModeStatus> {
  if (!userId) return { success: false, enabled: false, people: [] };
  try {
    await assertCanManage(userId);
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { ownerModeEnabled: true, ownerModePhone: true, notificationNumber: true },
    });
    return {
      success: true,
      enabled: !!user?.ownerModeEnabled,
      people: parseOwnerPeople(user?.ownerModePhone),
      notificationNumber: user?.notificationNumber ?? "",
    };
  } catch {
    return { success: false, enabled: false, people: [] };
  }
}

/** Activa/desactiva el Modo Dueño (sin tocar la lista de personas). */
export async function setOwnerModeEnabled(
  userId: string,
  enabled: boolean,
): Promise<{ success: boolean; message: string }> {
  if (!userId) return { success: false, message: "userId requerido." };
  try {
    await assertCanManage(userId);
  } catch {
    return { success: false, message: "No autorizado." };
  }
  try {
    await db.user.update({ where: { id: userId }, data: { ownerModeEnabled: enabled } });
    revalidatePath("/profile");
    return { success: true, message: enabled ? "Modo Dueño activado." : "Modo Dueño desactivado." };
  } catch {
    return { success: false, message: "Error al guardar." };
  }
}

/** Reemplaza la lista completa de personas del Modo Dueño. */
export async function saveOwnerPeople(
  userId: string,
  people: OwnerPerson[],
): Promise<{ success: boolean; message: string; people: OwnerPerson[] }> {
  if (!userId) return { success: false, message: "userId requerido.", people: [] };
  try {
    await assertCanManage(userId);
  } catch {
    return { success: false, message: "No autorizado.", people: [] };
  }

  // Validación básica de cada persona.
  for (const p of people) {
    const digits = (p.phone ?? "").replace(/\D/g, "");
    if (digits.length < 7) {
      return { success: false, message: "Cada persona necesita un número válido (mínimo 7 dígitos).", people: [] };
    }
    if (!(p.name ?? "").trim()) {
      return { success: false, message: "Cada persona necesita un nombre.", people: [] };
    }
  }

  const serialized = serializeOwnerPeople(people);
  const saved = parseOwnerPeople(serialized);

  try {
    await db.user.update({ where: { id: userId }, data: { ownerModePhone: serialized } });
    revalidatePath("/profile");
    return { success: true, message: "Guardado.", people: saved };
  } catch {
    return { success: false, message: "Error al guardar.", people: [] };
  }
}
