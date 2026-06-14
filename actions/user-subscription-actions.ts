"use server";

import { db } from "@/lib/db";
import { PaymentMethodType, SubscriptionStatus } from "@prisma/client";
import { currentUser } from "@/lib/auth";
import { isAdminLike } from "@/lib/rbac";
import { revalidatePath } from "next/cache";

export type UserSubscriptionWithPlan = {
  id: string;
  userId: string;
  status: SubscriptionStatus;
  paymentMethod: string | null;
  amountUSD: number;
  receiptUrl: string | null;
  wompiReference: string | null;
  transactionId: string | null;
  adminNotes: string | null;
  approvedBy: string | null;
  approvedAt: Date | null;
  rejectedAt: Date | null;
  rejectionReason: string | null;
  startDate: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  subscriptionPlan: {
    id: string;
    plan: string;
    assistanceType: string;
    priceUSD: number;
    credits: number;
  };
  user: {
    id: string;
    name: string | null;
    email: string;
  };
};

export async function createUserSubscription(data: {
  subscriptionPlanId: string;
  paymentMethod: string;
  amountUSD: number;
  receiptUrl?: string;
  wompiReference?: string;
  transactionId?: string;
}) {
  const user = await currentUser();
  if (!user) return { success: false, message: "No autorizado" };

  try {
    const status =
      data.paymentMethod === "WOMPI"
        ? SubscriptionStatus.PENDING_PAYMENT
        : SubscriptionStatus.PENDING_APPROVAL;

    const subscription = await db.userSubscription.create({
      data: {
        userId: user.id,
        subscriptionPlanId: data.subscriptionPlanId,
        status,
        paymentMethod: data.paymentMethod,
        amountUSD: data.amountUSD,
        receiptUrl: data.receiptUrl ?? null,
        wompiReference: data.wompiReference ?? null,
        transactionId: data.transactionId ?? null,
      },
    });

    revalidatePath("/planes");
    return { success: true, data: subscription };
  } catch {
    return { success: false, message: "Error al crear la suscripción" };
  }
}

export async function getMyActiveSubscription() {
  const user = await currentUser();
  if (!user) return { success: false, data: null };

  try {
    const sub = await db.userSubscription.findFirst({
      where: {
        userId: user.id,
        status: SubscriptionStatus.ACTIVE,
        expiresAt: { gt: new Date() },
      },
      include: {
        subscriptionPlan: true,
      },
      orderBy: { expiresAt: "desc" },
    });

    if (!sub) return { success: true, data: null };

    return {
      success: true,
      data: {
        ...sub,
        amountUSD: Number(sub.amountUSD),
        subscriptionPlan: {
          ...sub.subscriptionPlan,
          priceUSD: Number(sub.subscriptionPlan.priceUSD),
        },
      },
    };
  } catch {
    return { success: false, data: null };
  }
}

export async function getAllSubscriptionsAdmin(filters?: {
  status?: SubscriptionStatus;
  userId?: string;
}) {
  const user = await currentUser();
  if (!user || !isAdminLike(user.role)) return { success: false, data: [] };

  try {
    const subs = await db.userSubscription.findMany({
      where: {
        ...(filters?.status ? { status: filters.status } : {}),
        ...(filters?.userId ? { userId: filters.userId } : {}),
      },
      include: {
        subscriptionPlan: {
          select: { id: true, plan: true, assistanceType: true, priceUSD: true, credits: true },
        },
        user: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return {
      success: true,
      data: subs.map((s) => ({
        ...s,
        amountUSD: Number(s.amountUSD),
        subscriptionPlan: { ...s.subscriptionPlan, priceUSD: Number(s.subscriptionPlan.priceUSD) },
      })) as UserSubscriptionWithPlan[],
    };
  } catch {
    return { success: false, data: [] as UserSubscriptionWithPlan[] };
  }
}

export async function approveSubscription(
  subscriptionId: string,
  opts: { startDate: Date; expiresAt: Date; adminNotes?: string }
) {
  const user = await currentUser();
  if (!user || !isAdminLike(user.role)) return { success: false, message: "No autorizado" };

  try {
    const sub = await db.userSubscription.update({
      where: { id: subscriptionId },
      data: {
        status: SubscriptionStatus.ACTIVE,
        approvedBy: user.id,
        approvedAt: new Date(),
        startDate: opts.startDate,
        expiresAt: opts.expiresAt,
        adminNotes: opts.adminNotes ?? null,
      },
      include: { subscriptionPlan: true },
    });

    // Sincronizar plan en User y créditos IaCredit
    await db.user.update({
      where: { id: sub.userId },
      data: { plan: sub.subscriptionPlan.plan },
    });

    const renewalDate = new Date(opts.expiresAt);
    const existingCredit = await db.iaCredit.findUnique({ where: { userId: sub.userId } });
    if (existingCredit) {
      await db.iaCredit.update({
        where: { userId: sub.userId },
        data: { total: sub.subscriptionPlan.credits, used: 0, renewalDate },
      });
    } else {
      await db.iaCredit.create({
        data: { userId: sub.userId, total: sub.subscriptionPlan.credits, used: 0, renewalDate },
      });
    }

    revalidatePath("/planes");
    return { success: true, message: "Suscripción activada" };
  } catch {
    return { success: false, message: "Error al aprobar la suscripción" };
  }
}

export async function rejectSubscription(subscriptionId: string, reason: string) {
  const user = await currentUser();
  if (!user || !isAdminLike(user.role)) return { success: false, message: "No autorizado" };

  try {
    await db.userSubscription.update({
      where: { id: subscriptionId },
      data: {
        status: SubscriptionStatus.REJECTED,
        rejectedAt: new Date(),
        rejectionReason: reason,
        adminNotes: reason,
      },
    });
    return { success: true, message: "Suscripción rechazada" };
  } catch {
    return { success: false, message: "Error al rechazar" };
  }
}
