"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { assertCanAccessTargetUser } from "@/actions/billing/helpers/app-access-guard";
import { soloDigitos } from "@/lib/identidad-del-dueno";
import {
  generarCodigoDeVerificacion,
  lasVerificaciones,
  MINUTOS_DEL_CODIGO,
  revocarVerificacion,
} from "@/lib/identidad-del-dueno.server";
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

/**
 * Quién puede tocar el Modo Dueño de una cuenta: la puerta de siempre
 * (`assertCanAccessTargetUser`), que solo baja. Antes bastaba con ser admin,
 * super_admin o reseller para cambiar el de CUALQUIER cuenta, incluidas las que
 * no le cuelgan.
 */
async function assertCanManage(targetUserId: string): Promise<void> {
  await assertCanAccessTargetUser(targetUserId);
}

/** Lo mismo que el panel: como mucho cinco personas. Ahora también en el servidor. */
const MAXIMO_DE_PERSONAS = 5;

export type OwnerModeStatus = {
  success: boolean;
  enabled: boolean;
  people: OwnerPerson[];
  /** Números (como están guardados) que ya pasaron el código de verificación. */
  verified: string[];
  notificationNumber?: string;
};

export async function getOwnerModeStatus(userId: string): Promise<OwnerModeStatus> {
  if (!userId) return { success: false, enabled: false, people: [], verified: [] };
  try {
    await assertCanManage(userId);
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { ownerModeEnabled: true, ownerModePhone: true, notificationNumber: true },
    });
    const verificados = await lasVerificaciones(userId).catch((e) => {
      console.warn("[owner-mode] no se pudieron leer las verificaciones", e);
      return new Map<string, Date>();
    });
    return {
      success: true,
      enabled: !!user?.ownerModeEnabled,
      people: parseOwnerPeople(user?.ownerModePhone),
      verified: Array.from(verificados.keys()),
      notificationNumber: user?.notificationNumber ?? "",
    };
  } catch {
    return { success: false, enabled: false, people: [], verified: [] };
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

  if (people.length > MAXIMO_DE_PERSONAS) {
    return { success: false, message: `Como mucho ${MAXIMO_DE_PERSONAS} personas.`, people: [] };
  }

  // Validación básica de cada persona.
  for (const p of people) {
    const digits = (p.phone ?? "").replace(/\D/g, "");
    if (digits.length < 8) {
      return { success: false, message: "Cada persona necesita un número completo, con código de país.", people: [] };
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

/**
 * Genera el código de verificación de UNA persona de la lista. Se ve una sola
 * vez en el panel; la persona lo manda por WhatsApp y su número queda
 * verificado (sin eso, el Modo Dueño solo consulta).
 */
export async function generarCodigoDelDueno(
  userId: string,
  phone: string,
): Promise<{ success: boolean; message: string; codigo?: string; minutos?: number }> {
  if (!userId) return { success: false, message: "userId requerido." };
  try {
    await assertCanManage(userId);
  } catch {
    return { success: false, message: "No autorizado." };
  }
  const user = await db.user.findUnique({ where: { id: userId }, select: { ownerModePhone: true, notificationNumber: true } });
  const personas = parseOwnerPeople(user?.ownerModePhone);
  const tel = soloDigitos(phone);
  const esDeLaLista = personas.length
    ? personas.some((p) => p.phone === tel)
    : tel === soloDigitos(user?.notificationNumber);
  if (!esDeLaLista) return { success: false, message: "Ese número no está en la lista del Modo Dueño." };
  try {
    const codigo = await generarCodigoDeVerificacion(userId, tel);
    return { success: true, message: "Código generado.", codigo, minutos: MINUTOS_DEL_CODIGO };
  } catch (error) {
    console.warn("[owner-mode] no se pudo generar el código", error);
    return { success: false, message: "No se pudo generar el código." };
  }
}

/** Quita la verificación de un número: volverá a necesitar un código para hacer cambios. */
export async function quitarVerificacionDelDueno(
  userId: string,
  phone: string,
): Promise<{ success: boolean; message: string }> {
  if (!userId) return { success: false, message: "userId requerido." };
  try {
    await assertCanManage(userId);
  } catch {
    return { success: false, message: "No autorizado." };
  }
  try {
    await revocarVerificacion(userId, phone);
    return { success: true, message: "Verificación quitada." };
  } catch (error) {
    console.warn("[owner-mode] no se pudo quitar la verificación", error);
    return { success: false, message: "No se pudo quitar la verificación." };
  }
}
