"use server";

import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";

/**
 * Activación del "Modo Dueño por WhatsApp" por cuenta (opt-in).
 *
 * El interruptor vive en el panel autenticado: para encenderlo hay que estar
 * logueado como el titular (o un admin), lo que funciona como segundo factor
 * de la activación — sin necesidad de correo ni PIN.
 */

async function assertCanManage(targetUserId: string): Promise<void> {
  const me = await currentUser();
  if (!me) throw new Error("No autorizado.");
  const isAdminLike = me.role === "admin" || me.role === "super_admin" || me.role === "reseller";
  if (me.id !== targetUserId && !isAdminLike) {
    throw new Error("No autorizado.");
  }
}

export async function getOwnerModeStatus(userId: string): Promise<{
  success: boolean;
  enabled: boolean;
  ownerPhone?: string;
  notificationNumber?: string;
}> {
  if (!userId) return { success: false, enabled: false };
  try {
    await assertCanManage(userId);
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { ownerModeEnabled: true, ownerModePhone: true, notificationNumber: true },
    });
    return {
      success: true,
      enabled: !!user?.ownerModeEnabled,
      ownerPhone: user?.ownerModePhone ?? "",
      notificationNumber: user?.notificationNumber ?? "",
    };
  } catch {
    return { success: false, enabled: false };
  }
}

/**
 * Guarda la configuración del Modo Dueño: activar/desactivar y el número
 * dedicado del dueño (solo dígitos). Un número vacío borra el dedicado (cae al
 * número de notificación).
 */
export async function saveOwnerModeConfig(
  userId: string,
  enabled: boolean,
  ownerPhone: string,
): Promise<{ success: boolean; message: string }> {
  if (!userId) return { success: false, message: "userId requerido." };

  try {
    await assertCanManage(userId);
  } catch {
    return { success: false, message: "No autorizado." };
  }

  const digits = (ownerPhone ?? "").replace(/\D/g, "");
  if (enabled && digits && digits.length < 7) {
    return { success: false, message: "El número del dueño no es válido (mínimo 7 dígitos)." };
  }

  try {
    await db.user.update({
      where: { id: userId },
      data: { ownerModeEnabled: enabled, ownerModePhone: digits || null },
    });
    revalidatePath("/profile");
    return {
      success: true,
      message: enabled ? "Modo Dueño activado." : "Modo Dueño desactivado.",
    };
  } catch {
    return { success: false, message: "Error al guardar la configuración." };
  }
}
