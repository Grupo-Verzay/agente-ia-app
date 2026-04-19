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
