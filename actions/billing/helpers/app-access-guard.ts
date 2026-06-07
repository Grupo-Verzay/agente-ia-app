"use server";

import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { isAdmin, isAdminOrReseller } from "@/lib/rbac";
import { buildBillingServiceAccessState } from "./service-access";

export async function assertCanAccessTargetUser(targetUserId: string) {
  const actor = await currentUser();
  if (!actor) throw new Error("No autorizado.");

  const cleanTarget = String(targetUserId ?? "").trim();
  if (!cleanTarget) throw new Error("userId es requerido.");

  if (actor.id === cleanTarget) return actor;

  // Asesores pueden acceder a datos de su dueño
  if (actor.ownerId === cleanTarget) return actor;

  // Cuentas vinculadas: el actor (o su dueño) puede acceder a cuentas
  // relacionadas via linked_accounts en cualquier dirección
  try {
    const effectiveActorId = actor.ownerId ?? actor.id;
    const link = await db.$queryRaw<{ id: string }[]>`
      SELECT id FROM "linked_accounts"
      WHERE ("master_user_id" = ${effectiveActorId} AND "linked_user_id" = ${cleanTarget})
         OR ("linked_user_id" = ${effectiveActorId} AND "master_user_id" = ${cleanTarget})
      LIMIT 1
    `;
    if (link.length > 0) return actor;
  } catch {
    // Si la tabla aún no existe, continuar con los checks normales
  }

  if (!isAdminOrReseller(actor.role)) {
    throw new Error("No autorizado.");
  }

  if (actor.role === "reseller") {
    const assignment = await db.reseller.findFirst({
      where: { resellerid: actor.id, userId: cleanTarget },
      select: { id: true },
    });
    if (!assignment) throw new Error("No autorizado.");
  }

  return actor;
}

export async function assertUserCanUseApp(targetUserId: string) {
  const actor = await assertCanAccessTargetUser(targetUserId);

  // Admin y reseller pueden gestionar clientes bloqueados desde backoffice.
  if (isAdmin(actor.role) && actor.id !== targetUserId) {
    return actor;
  }

  const billing = await db.userBilling.findUnique({
    where: { userId: targetUserId },
  });
  const access = buildBillingServiceAccessState(billing);

  if (access.isLocked) {
    throw new Error("Acceso bloqueado por facturación.");
  }

  return actor;
}
