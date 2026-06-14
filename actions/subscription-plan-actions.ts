"use server";

import { db } from "@/lib/db";
import { Plan } from "@prisma/client";
import { revalidatePath } from "next/cache";

export type SubscriptionPlanItem = {
  id: string;
  plan: Plan;
  assistanceType: string;
  priceUSD: number;
  credits: number;
  features: string[];
  description: string | null;
  isPopular: boolean;
  isActive: boolean;
  color: string | null;
  order: number;
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
      })) as SubscriptionPlanItem[],
    };
  } catch {
    return { success: false, data: [] as SubscriptionPlanItem[] };
  }
}

export async function getActiveSubscriptionPlans() {
  try {
    const plans = await db.subscriptionPlan.findMany({
      where: { isActive: true },
      orderBy: [{ assistanceType: "asc" }, { order: "asc" }],
    });
    return {
      success: true,
      data: plans.map((p) => ({
        ...p,
        priceUSD: Number(p.priceUSD),
      })) as SubscriptionPlanItem[],
    };
  } catch {
    return { success: false, data: [] as SubscriptionPlanItem[] };
  }
}

export async function upsertSubscriptionPlan(data: {
  plan: Plan;
  assistanceType: string;
  priceUSD: number;
  credits: number;
  features: string[];
  description?: string;
  isPopular?: boolean;
  isActive?: boolean;
  color?: string;
  order?: number;
}) {
  try {
    await db.subscriptionPlan.upsert({
      where: { plan_assistanceType: { plan: data.plan, assistanceType: data.assistanceType } },
      update: {
        priceUSD: data.priceUSD,
        credits: data.credits,
        features: data.features,
        description: data.description ?? null,
        isPopular: data.isPopular ?? false,
        isActive: data.isActive ?? true,
        color: data.color ?? null,
        order: data.order ?? 0,
      },
      create: {
        plan: data.plan,
        assistanceType: data.assistanceType,
        priceUSD: data.priceUSD,
        credits: data.credits,
        features: data.features,
        description: data.description ?? null,
        isPopular: data.isPopular ?? false,
        isActive: data.isActive ?? true,
        color: data.color ?? null,
        order: data.order ?? 0,
      },
    });
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
