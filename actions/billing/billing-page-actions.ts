// app/actions/billing-page-actions.ts
"use server";

import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { isAdminOrReseller } from "@/lib/rbac";
import { ResponseFormat } from "@/types/billing";
import { serializeUserBilling } from "./helpers/billing-helpers";

export async function getClientsWithBilling(): Promise<ResponseFormat<any[]>> {
  try {
    const me = await currentUser();
    if (!me) return { success: false, message: "No autorizado." };
    if (!isAdminOrReseller(me.role)) {
      return { success: false, message: "No autorizado." };
    }

    let assignedUserIds: string[] | undefined;

    if (me.role === "reseller") {
      const assignments = await db.reseller.findMany({
        where: { resellerid: me.id },
        select: { userId: true },
      });

      assignedUserIds = assignments
        .map((assignment) => assignment.userId)
        .filter((id): id is string => Boolean(id));

      assignedUserIds = Array.from(new Set(assignedUserIds));

      if (!assignedUserIds.length) {
        return { success: true, message: "No hay usuarios asignados.", data: [] };
      }
    }

    const users = await db.user.findMany({
      orderBy: { createdAt: "desc" },
      where: {
        status: true,
        ...(assignedUserIds ? { id: { in: assignedUserIds } } : {}),
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        company: true,
        notificationNumber: true,
        plan: true,
        createdAt: true,
        status: true,
        billing: true,
      },
    });

    const safeUsers = users
      .map((u) => ({
        ...u,
        createdAt: u.createdAt ? u.createdAt.toISOString() : null,
      }))
      .map(serializeUserBilling);

    return { success: true, message: "Clientes cargados.", data: safeUsers };
  } catch (e: any) {
    console.error("[getClientsWithBilling]", e);
    return { success: false, message: e?.message ?? "Error cargando clientes con billing." };
  }
}
