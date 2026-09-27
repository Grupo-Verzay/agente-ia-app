"use server";

import { db } from "@/lib/db";
import { SubscriptionStatus } from "@prisma/client";
import { currentUser } from "@/lib/auth";
import { isAdminLike } from "@/lib/rbac";
import { rolQueManda } from "@/lib/cuenta-que-manda";
import { revalidatePath } from "next/cache";
import { laPersonaQueActua } from "@/lib/chat-de-equipo";
import { darElCicloPorPagado, avisarDelCambioDeCobro } from "@/lib/ciclo-pagado.server";
import { activarLaSuscripcion, SUSCRIPCION_PENDIENTE } from "@/lib/suscripcion-activa.server";

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
  status?: SubscriptionStatus | SubscriptionStatus[];
  userId?: string;
}) {
  const user = await currentUser();
  if (!user || !isAdminLike(await rolQueManda(user))) return { success: false, data: [] };

  try {
    const subs = await db.userSubscription.findMany({
      where: {
        ...(filters?.status
          ? { status: Array.isArray(filters.status) ? { in: filters.status } : filters.status }
          : {}),
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
  if (!user || !isAdminLike(await rolQueManda(user))) return { success: false, message: "No autorizado" };

  const inicio = new Date(opts.startDate);
  const vence = new Date(opts.expiresAt);
  if (Number.isNaN(inicio.getTime()) || Number.isNaN(vence.getTime())) {
    return { success: false, message: "Las fechas no son válidas." };
  }
  if (vence.getTime() <= inicio.getTime()) {
    return { success: false, message: "El vencimiento tiene que ser posterior al inicio." };
  }

  try {
    const actual = await db.userSubscription.findUnique({
      where: { id: subscriptionId },
      select: { status: true, userId: true },
    });
    if (!actual) return { success: false, message: "Suscripción no encontrada." };
    // Solo lo que espera. Volver a aprobar una activa sería regalar otro mes
    // de créditos con un doble clic.
    if (!SUSCRIPCION_PENDIENTE.includes(actual.status)) {
      return { success: false, message: "Esta suscripción ya no está pendiente." };
    }

    await activarLaSuscripcion({
      id: subscriptionId,
      inicio,
      vence,
      aprobadoPor: laPersonaQueActua(user).id,
      nota: opts.adminNotes ?? null,
    });

    // Aprobar es un ciclo pagado, igual que Wompi o «Marcar pagado»: el
    // vencimiento pasa a la fecha aprobada, el acceso vuelve y los créditos
    // se reponen con la regla de siempre —que respeta el total pactado de un
    // plan personalizado—. Antes solo escribía los créditos a mano, pisando
    // ese total, y dejaba la cuenta suspendida con su vencimiento viejo.
    const ciclo = await darElCicloPorPagado(actual.userId, { vence, crearCreditosSiFaltan: true });
    await avisarDelCambioDeCobro({
      userId: actual.userId,
      previousBillingStatus: ciclo.antes?.billingStatus ?? null,
      previousAccessStatus: ciclo.antes?.accessStatus ?? null,
      source: "subscription-approve",
    });

    revalidatePath("/planes");
    return { success: true, message: "Suscripción activada" };
  } catch (error) {
    console.error("[approveSubscription]", error);
    return { success: false, message: "Error al aprobar la suscripción" };
  }
}

export async function rejectSubscription(subscriptionId: string, reason: string) {
  const user = await currentUser();
  if (!user || !isAdminLike(await rolQueManda(user))) return { success: false, message: "No autorizado" };

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
