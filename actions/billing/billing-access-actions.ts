"use server";

import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { isAdminOrReseller } from "@/lib/rbac";
import { assertBillingScope } from "./helpers/billing-helpers.server";
import { buildBillingServiceAccessState } from "./helpers/service-access";

export async function getBillingServiceAccessSnapshot(userId?: string) {
  const me = await currentUser();
  if (!me) return { success: false as const, message: "No autorizado." };

  try {
    const targetUserId = userId?.trim() || me.id;

    if (targetUserId !== me.id) {
      await assertBillingScope(me, targetUserId);
    } else if (isAdminOrReseller(me.role)) {
      // Admin/reseller consultando su propio estado: validar existencia y formato también.
      await assertBillingScope(me, targetUserId);
    }

    const billing = await db.userBilling.findUnique({
      where: { userId: targetUserId },
      include: {
        user: {
          select: { id: true, name: true, company: true, email: true },
        },
      },
    });

    const access = buildBillingServiceAccessState(billing);

    return {
      success: true as const,
      message: "Snapshot de billing calculado.",
      data: {
        ...access,
        userId: targetUserId,
        userName: billing?.user?.name ?? null,
        company: billing?.user?.company ?? null,
        email: billing?.user?.email ?? null,
      },
    };
  } catch (e: any) {
    return { success: false as const, message: e?.message ?? "Error calculando estado de acceso." };
  }
}
