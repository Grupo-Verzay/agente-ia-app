"use server";

import { db } from "@/lib/db";
import { Plan } from "@prisma/client";
import { revalidatePath } from "next/cache";

export type SubscriptionPlanItem = {
  id: string;
  plan: Plan;
  assistanceType: string;
  isResellerPlan: boolean;
  priceUSD: number;
  priceWholesale: number | null;
  priceQuarterly: number | null;
  priceYearly: number | null;
  credits: number;
  features: string[];
  description: string | null;
  isPopular: boolean;
  isActive: boolean;
  color: string | null;
  order: number;
  checkoutUrlMonthly: string | null;
  checkoutUrlQuarterly: string | null;
  checkoutUrlYearly: string | null;
  name: string | null;
};

export async function getAllSubscriptionPlans() {
  try {
    const plans = await db.subscriptionPlan.findMany({
      orderBy: [{ assistanceType: "asc" }, { order: "asc" }],
    });
    return {
      success: true,
      data: plans.map((p) => ({
        ...p,
        priceUSD: Number(p.priceUSD),
        priceWholesale: p.priceWholesale != null ? Number(p.priceWholesale) : null,
        priceQuarterly: p.priceQuarterly != null ? Number(p.priceQuarterly) : null,
        priceYearly: p.priceYearly != null ? Number(p.priceYearly) : null,
      })) as SubscriptionPlanItem[],
    };
  } catch (e) {
    console.error("[getAllSubscriptionPlans] Error:", e);
    return { success: false, data: [] as SubscriptionPlanItem[] };
  }
}

export async function getActiveSubscriptionPlans() {
  try {
    const plans = await db.subscriptionPlan.findMany({
      where: { isActive: true, isResellerPlan: false },
      orderBy: [{ assistanceType: "asc" }, { order: "asc" }],
    });
    return {
      success: true,
      data: plans.map((p) => ({
        ...p,
        priceUSD: Number(p.priceUSD),
        priceWholesale: p.priceWholesale != null ? Number(p.priceWholesale) : null,
        priceQuarterly: p.priceQuarterly != null ? Number(p.priceQuarterly) : null,
        priceYearly: p.priceYearly != null ? Number(p.priceYearly) : null,
      })) as SubscriptionPlanItem[],
    };
  } catch {
    return { success: false, data: [] as SubscriptionPlanItem[] };
  }
}

export async function getActiveResellerAccessPlans() {
  try {
    const plans = await db.subscriptionPlan.findMany({
      where: { isActive: true, isResellerPlan: true },
      orderBy: [{ assistanceType: "asc" }, { order: "asc" }],
    });
    return {
      success: true,
      data: plans.map((p) => ({
        ...p,
        priceUSD: Number(p.priceUSD),
        priceWholesale: p.priceWholesale != null ? Number(p.priceWholesale) : null,
        priceQuarterly: p.priceQuarterly != null ? Number(p.priceQuarterly) : null,
        priceYearly: p.priceYearly != null ? Number(p.priceYearly) : null,
      })) as SubscriptionPlanItem[],
    };
  } catch {
    return { success: false, data: [] as SubscriptionPlanItem[] };
  }
}

export async function upsertSubscriptionPlan(data: {
  plan: Plan;
  assistanceType: string;
  isResellerPlan?: boolean;
  priceUSD: number;
  priceWholesale?: number | null;
  priceQuarterly?: number | null;
  priceYearly?: number | null;
  credits: number;
  features: string[];
  description?: string;
  isPopular?: boolean;
  isActive?: boolean;
  color?: string;
  order?: number;
  checkoutUrlMonthly?: string;
  checkoutUrlQuarterly?: string;
  checkoutUrlYearly?: string;
  name?: string | null;
}) {
  try {
    const isResellerPlan = data.isResellerPlan ?? false;
    const payload = {
      priceUSD: data.priceUSD,
      priceWholesale: data.priceWholesale ?? null,
      priceQuarterly: data.priceQuarterly ?? null,
      priceYearly: data.priceYearly ?? null,
      credits: data.credits,
      features: data.features,
      description: data.description ?? null,
      isPopular: data.isPopular ?? false,
      isActive: data.isActive ?? true,
      color: data.color ?? null,
      order: data.order ?? 0,
      checkoutUrlMonthly: data.checkoutUrlMonthly ?? null,
      checkoutUrlQuarterly: data.checkoutUrlQuarterly ?? null,
      checkoutUrlYearly: data.checkoutUrlYearly ?? null,
      name: data.name ?? null,
    };
    const existing = await db.subscriptionPlan.findFirst({
      where: { plan: data.plan, assistanceType: data.assistanceType, isResellerPlan },
    });
    if (existing) {
      await db.subscriptionPlan.update({ where: { id: existing.id }, data: payload });
    } else {
      await db.subscriptionPlan.create({
        data: { plan: data.plan, assistanceType: data.assistanceType, isResellerPlan, ...payload },
      });
    }
    revalidatePath("/planes");
    return { success: true, message: "Plan guardado" };
  } catch {
    return { success: false, message: "Error al guardar el plan" };
  }
}

export async function toggleSubscriptionPlanActive(id: string, isActive: boolean) {
  try {
    await db.subscriptionPlan.update({ where: { id }, data: { isActive } });
    revalidatePath("/planes");
    return { success: true };
  } catch {
    return { success: false };
  }
}
