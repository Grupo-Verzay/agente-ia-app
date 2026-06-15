"use server";

import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { Plan } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { getActiveSubscriptionPlans, type SubscriptionPlanItem } from "./subscription-plan-actions";

export type ResellerPlanItem = {
  id: string;
  resellerUserId: string;
  plan: Plan;
  assistanceType: string;
  priceMonthly: number;
  priceQuarterly: number | null;
  priceYearly: number | null;
  checkoutUrlMonthly: string | null;
  checkoutUrlQuarterly: string | null;
  checkoutUrlYearly: string | null;
  credits: number;
  features: string[];
  description: string | null;
  isPopular: boolean;
  isActive: boolean;
  color: string | null;
  order: number;
};

export type ResellerProfileData = {
  slug: string | null;
  businessName: string | null;
};

function mapPlan(p: {
  id: string;
  resellerUserId: string;
  plan: Plan;
  assistanceType: string;
  priceMonthly: { toNumber: () => number };
  priceQuarterly: { toNumber: () => number } | null;
  priceYearly: { toNumber: () => number } | null;
  checkoutUrlMonthly: string | null;
  checkoutUrlQuarterly: string | null;
  checkoutUrlYearly: string | null;
  credits: number;
  features: string[];
  description: string | null;
  isPopular: boolean;
  isActive: boolean;
  color: string | null;
  order: number;
}): ResellerPlanItem {
  return {
    ...p,
    priceMonthly: Number(p.priceMonthly),
    priceQuarterly: p.priceQuarterly != null ? Number(p.priceQuarterly) : null,
    priceYearly: p.priceYearly != null ? Number(p.priceYearly) : null,
  };
}

export async function getMyResellerPlans(): Promise<{
  success: boolean;
  data: ResellerPlanItem[];
  profile: ResellerProfileData | null;
}> {
  try {
    const user = await currentUser();
    if (!user || user.role !== "reseller") {
      return { success: false, data: [], profile: null };
    }
    const plans = await db.resellerPlan.findMany({
      where: { resellerUserId: user.id },
      orderBy: [{ assistanceType: "asc" }, { order: "asc" }],
    });
    const resellerRow = await db.reseller.findFirst({
      where: { resellerid: user.id },
      select: { slug: true, businessName: true },
    });
    return {
      success: true,
      data: plans.map(mapPlan),
      profile: resellerRow
        ? { slug: resellerRow.slug, businessName: resellerRow.businessName }
        : null,
    };
  } catch (e) {
    console.error("[getMyResellerPlans]", e);
    return { success: false, data: [], profile: null };
  }
}

export async function upsertResellerPlan(data: {
  plan: Plan;
  assistanceType: string;
  priceMonthly: number;
  priceQuarterly?: number | null;
  priceYearly?: number | null;
  checkoutUrlMonthly?: string;
  checkoutUrlQuarterly?: string;
  checkoutUrlYearly?: string;
  credits: number;
  features: string[];
  description?: string;
  isPopular?: boolean;
  isActive?: boolean;
  color?: string;
  order?: number;
}) {
  try {
    const user = await currentUser();
    if (!user || user.role !== "reseller") {
      return { success: false, message: "No autorizado" };
    }
    const payload = {
      priceMonthly: data.priceMonthly,
      priceQuarterly: data.priceQuarterly ?? null,
      priceYearly: data.priceYearly ?? null,
      checkoutUrlMonthly: data.checkoutUrlMonthly ?? null,
      checkoutUrlQuarterly: data.checkoutUrlQuarterly ?? null,
      checkoutUrlYearly: data.checkoutUrlYearly ?? null,
      credits: data.credits,
      features: data.features,
      description: data.description ?? null,
      isPopular: data.isPopular ?? false,
      isActive: data.isActive ?? true,
      color: data.color ?? null,
      order: data.order ?? 0,
    };
    await db.resellerPlan.upsert({
      where: {
        resellerUserId_plan_assistanceType: {
          resellerUserId: user.id,
          plan: data.plan,
          assistanceType: data.assistanceType,
        },
      },
      update: payload,
      create: {
        resellerUserId: user.id,
        plan: data.plan,
        assistanceType: data.assistanceType,
        ...payload,
      },
    });
    revalidatePath("/panel/mis-planes");
    return { success: true, message: "Plan guardado" };
  } catch (e) {
    console.error("[upsertResellerPlan]", e);
    return { success: false, message: "Error al guardar el plan" };
  }
}

export async function toggleResellerPlanActive(id: string, isActive: boolean) {
  try {
    const user = await currentUser();
    if (!user || user.role !== "reseller") {
      return { success: false };
    }
    await db.resellerPlan.updateMany({
      where: { id, resellerUserId: user.id },
      data: { isActive },
    });
    revalidatePath("/panel/mis-planes");
    return { success: true };
  } catch {
    return { success: false };
  }
}

export async function updateResellerProfile(data: {
  slug: string;
  businessName: string;
}) {
  try {
    const user = await currentUser();
    if (!user || user.role !== "reseller") {
      return { success: false, message: "No autorizado" };
    }
    const slug = data.slug.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
    if (!slug) return { success: false, message: "Slug inválido" };

    const existing = await db.reseller.findFirst({ where: { resellerid: user.id } });
    if (existing) {
      await db.reseller.update({
        where: { id: existing.id },
        data: { slug, businessName: data.businessName },
      });
    } else {
      await db.reseller.create({
        data: { resellerid: user.id, slug, businessName: data.businessName },
      });
    }
    revalidatePath("/panel/mis-planes");
    return { success: true, message: "Perfil actualizado" };
  } catch (e) {
    console.error("[updateResellerProfile]", e);
    return { success: false, message: "Error al actualizar perfil (el slug puede estar en uso)" };
  }
}

/** Usado por el admin para actualizar slug/businessName de cualquier reseller */
export async function adminUpdateResellerProfile(resellerUserId: string, data: {
  slug: string;
  businessName: string;
}) {
  try {
    const user = await currentUser();
    if (!user || (user.role !== "admin" && user.role !== "super_admin")) {
      return { success: false, message: "No autorizado" };
    }
    const slug = data.slug.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
    if (!slug) return { success: false, message: "Slug inválido" };

    const existing = await db.reseller.findFirst({ where: { resellerid: resellerUserId } });
    if (existing) {
      await db.reseller.update({
        where: { id: existing.id },
        data: { slug, businessName: data.businessName },
      });
    } else {
      await db.reseller.create({
        data: { resellerid: resellerUserId, slug, businessName: data.businessName },
      });
    }
    revalidatePath("/admin/reseller");
    return { success: true, message: "Perfil actualizado" };
  } catch (e) {
    console.error("[adminUpdateResellerProfile]", e);
    return { success: false, message: "Error al actualizar perfil" };
  }
}

/**
 * Obtiene los planes de un reseller por su slug, combinando los planes del reseller
 * con los planes maestros como fallback.
 */
export async function getResellerPlansBySlug(slug: string): Promise<{
  success: boolean;
  plans: SubscriptionPlanItem[];
  businessName: string | null;
  resellerUserId: string | null;
}> {
  try {
    const resellerRow = await db.reseller.findFirst({
      where: { slug },
      select: { resellerid: true, businessName: true },
    });
    if (!resellerRow?.resellerid) {
      return { success: false, plans: [], businessName: null, resellerUserId: null };
    }

    const resellerUserId = resellerRow.resellerid;
    const [resellerPlans, masterPlansResult] = await Promise.all([
      db.resellerPlan.findMany({
        where: { resellerUserId, isActive: true },
        orderBy: [{ assistanceType: "asc" }, { order: "asc" }],
      }),
      getActiveSubscriptionPlans(),
    ]);

    const masterPlans = masterPlansResult.data;

    // Merge: reseller plan overrides master plan for matching plan+assistanceType
    const resellerMap = new Map(
      resellerPlans.map((p) => [`${p.plan}:${p.assistanceType}`, p])
    );

    const merged: SubscriptionPlanItem[] = masterPlans.map((master) => {
      const key = `${master.plan}:${master.assistanceType}`;
      const rp = resellerMap.get(key);
      if (!rp) return master;
      return {
        ...master,
        priceUSD: Number(rp.priceMonthly),
        priceQuarterly: rp.priceQuarterly != null ? Number(rp.priceQuarterly) : null,
        priceYearly: rp.priceYearly != null ? Number(rp.priceYearly) : null,
        checkoutUrlMonthly: rp.checkoutUrlMonthly ?? master.checkoutUrlMonthly,
        checkoutUrlQuarterly: rp.checkoutUrlQuarterly ?? master.checkoutUrlQuarterly,
        checkoutUrlYearly: rp.checkoutUrlYearly ?? master.checkoutUrlYearly,
        credits: rp.credits || master.credits,
        features: rp.features.length ? rp.features : master.features,
        description: rp.description ?? master.description,
        isPopular: rp.isPopular,
        color: rp.color ?? master.color,
        order: rp.order,
      };
    });

    return {
      success: true,
      plans: merged,
      businessName: resellerRow.businessName,
      resellerUserId,
    };
  } catch (e) {
    console.error("[getResellerPlansBySlug]", e);
    return { success: false, plans: [], businessName: null, resellerUserId: null };
  }
}
