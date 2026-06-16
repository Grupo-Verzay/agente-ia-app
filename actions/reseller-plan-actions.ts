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

export type TestimonialData = { quote: string; name: string; city: string; business: string; metric: string };
export type StatData = { value: string; label: string };

export type ResellerProfileData = {
  slug: string | null;
  businessName: string | null;
  meetingUrl: string | null;
  sheetsUrl: string | null;
  whatsappNumber: string | null;
  primaryColor: string | null;
  bgColor: string | null;
  headline: string | null;
  subheadline: string | null;
  logoUrl: string | null;
  instagram: string | null;
  facebook: string | null;
  videoUrl: string | null;
  ctaHeadline: string | null;
  ctaSubtitle: string | null;
  testimonials: TestimonialData[] | null;
  stats: StatData[] | null;
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
    const [resellerRow, resellerUser] = await Promise.all([
      db.reseller.findFirst({
        where: { resellerid: user.id },
        select: { slug: true, businessName: true, sheetsUrl: true, primaryColor: true, bgColor: true, headline: true, subheadline: true, logoUrl: true, instagram: true, facebook: true, videoUrl: true, ctaHeadline: true, ctaSubtitle: true, testimonials: true, stats: true },
      }),
      db.user.findUnique({
        where: { id: user.id },
        select: { meetingUrl: true, notificationNumber: true },
      }),
    ]);
    return {
      success: true,
      data: plans.map(mapPlan),
      profile: resellerRow
        ? {
            slug: resellerRow.slug,
            businessName: resellerRow.businessName,
            meetingUrl: resellerUser?.meetingUrl ?? null,
            sheetsUrl: resellerRow.sheetsUrl ?? null,
            whatsappNumber: resellerUser?.notificationNumber ?? null,
            primaryColor: resellerRow.primaryColor ?? null,
            bgColor: resellerRow.bgColor ?? null,
            headline: resellerRow.headline ?? null,
            subheadline: resellerRow.subheadline ?? null,
            logoUrl: resellerRow.logoUrl ?? null,
            instagram: resellerRow.instagram ?? null,
            facebook: resellerRow.facebook ?? null,
            videoUrl: resellerRow.videoUrl ?? null,
            ctaHeadline: resellerRow.ctaHeadline ?? null,
            ctaSubtitle: resellerRow.ctaSubtitle ?? null,
            testimonials: Array.isArray(resellerRow.testimonials) ? (resellerRow.testimonials as TestimonialData[]) : null,
            stats: Array.isArray(resellerRow.stats) ? (resellerRow.stats as StatData[]) : null,
          }
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
  meetingUrl?: string;
  sheetsUrl?: string;
  whatsappNumber?: string;
  primaryColor?: string;
  bgColor?: string;
  headline?: string;
  subheadline?: string;
  logoUrl?: string;
  instagram?: string;
  facebook?: string;
  videoUrl?: string;
  ctaHeadline?: string;
  ctaSubtitle?: string;
  testimonials?: TestimonialData[];
  stats?: StatData[];
}) {
  try {
    const user = await currentUser();
    if (!user || user.role !== "reseller") {
      return { success: false, message: "No autorizado" };
    }
    const slug = data.slug.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
    if (!slug) return { success: false, message: "Slug inválido" };

    const resellerData = {
      slug,
      businessName: data.businessName,
      sheetsUrl: data.sheetsUrl || null,
      primaryColor: data.primaryColor || null,
      bgColor: data.bgColor || null,
      headline: data.headline || null,
      subheadline: data.subheadline || null,
      logoUrl: data.logoUrl || null,
      instagram: data.instagram || null,
      facebook: data.facebook || null,
      videoUrl: data.videoUrl || null,
      ctaHeadline: data.ctaHeadline || null,
      ctaSubtitle: data.ctaSubtitle || null,
      testimonials: data.testimonials ?? null,
      stats: data.stats ?? null,
    };

    const existing = await db.reseller.findFirst({ where: { resellerid: user.id } });
    if (existing) {
      await db.reseller.update({ where: { id: existing.id }, data: resellerData });
    } else {
      await db.reseller.create({ data: { resellerid: user.id, ...resellerData } });
    }
    const userUpdates: Record<string, string | null> = {};
    if (data.meetingUrl !== undefined) userUpdates.meetingUrl = data.meetingUrl || null;
    if (data.whatsappNumber !== undefined) userUpdates.notificationNumber = data.whatsappNumber || null;
    if (Object.keys(userUpdates).length > 0) {
      await db.user.update({ where: { id: user.id }, data: userUpdates });
    }
    revalidatePath("/panel/mis-planes");
    revalidatePath("/panel/mi-landing");
    return { success: true, message: "Perfil actualizado" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[updateResellerProfile]", msg);
    return { success: false, message: msg };
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

export async function getResellerPublicConfig(slug: string): Promise<{ sheetsUrl: string | null }> {
  try {
    const row = await db.reseller.findFirst({
      where: { slug },
      select: { sheetsUrl: true },
    });
    return { sheetsUrl: row?.sheetsUrl ?? null };
  } catch {
    return { sheetsUrl: null };
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
  whatsappNumber: string | null;
  meetingUrl: string | null;
  primaryColor: string | null;
  bgColor: string | null;
  headline: string | null;
  subheadline: string | null;
  logoUrl: string | null;
  instagram: string | null;
  facebook: string | null;
  videoUrl: string | null;
  ctaHeadline: string | null;
  ctaSubtitle: string | null;
  testimonials: TestimonialData[] | null;
  stats: StatData[] | null;
}> {
  const EMPTY_EXTRA = { primaryColor: null, bgColor: null, headline: null, subheadline: null, logoUrl: null, instagram: null, facebook: null, videoUrl: null, ctaHeadline: null, ctaSubtitle: null, testimonials: null, stats: null };
  try {
    const resellerRow = await db.reseller.findFirst({
      where: { slug },
      select: { resellerid: true, businessName: true, primaryColor: true, bgColor: true, headline: true, subheadline: true, logoUrl: true, instagram: true, facebook: true, videoUrl: true, ctaHeadline: true, ctaSubtitle: true, testimonials: true, stats: true },
    });
    if (!resellerRow?.resellerid) {
      return { success: false, plans: [], businessName: null, resellerUserId: null, whatsappNumber: null, meetingUrl: null, ...EMPTY_EXTRA };
    }

    const resellerUserId = resellerRow.resellerid;
    const [resellerPlans, masterPlansResult, resellerUser] = await Promise.all([
      db.resellerPlan.findMany({
        where: { resellerUserId, isActive: true },
        orderBy: [{ assistanceType: "asc" }, { order: "asc" }],
      }),
      getActiveSubscriptionPlans(),
      db.user.findUnique({
        where: { id: resellerUserId },
        select: { notificationNumber: true, meetingUrl: true },
      }),
    ]);

    const masterPlans = masterPlansResult.data;

    const resellerMap = new Map(
      resellerPlans.map((p) => [`${p.plan}:${p.assistanceType}`, p])
    );

    const merged: SubscriptionPlanItem[] = masterPlans.map((master) => {
      const key = `${master.plan}:${master.assistanceType}`;
      const rp = resellerMap.get(key);
      if (!rp) return { ...master, checkoutUrlMonthly: null, checkoutUrlQuarterly: null, checkoutUrlYearly: null };
      return {
        ...master,
        priceUSD: Number(rp.priceMonthly),
        priceQuarterly: rp.priceQuarterly != null ? Number(rp.priceQuarterly) : null,
        priceYearly: rp.priceYearly != null ? Number(rp.priceYearly) : null,
        checkoutUrlMonthly: rp.checkoutUrlMonthly ?? null,
        checkoutUrlQuarterly: rp.checkoutUrlQuarterly ?? null,
        checkoutUrlYearly: rp.checkoutUrlYearly ?? null,
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
      whatsappNumber: resellerUser?.notificationNumber ?? null,
      meetingUrl: resellerUser?.meetingUrl ?? null,
      primaryColor: resellerRow.primaryColor ?? null,
      bgColor: resellerRow.bgColor ?? null,
      headline: resellerRow.headline ?? null,
      subheadline: resellerRow.subheadline ?? null,
      logoUrl: resellerRow.logoUrl ?? null,
      instagram: resellerRow.instagram ?? null,
      facebook: resellerRow.facebook ?? null,
      videoUrl: resellerRow.videoUrl ?? null,
      ctaHeadline: resellerRow.ctaHeadline ?? null,
      ctaSubtitle: resellerRow.ctaSubtitle ?? null,
      testimonials: Array.isArray(resellerRow.testimonials) ? (resellerRow.testimonials as TestimonialData[]) : null,
      stats: Array.isArray(resellerRow.stats) ? (resellerRow.stats as StatData[]) : null,
    };
  } catch (e) {
    console.error("[getResellerPlansBySlug]", e);
    return { success: false, plans: [], businessName: null, resellerUserId: null, whatsappNumber: null, meetingUrl: null, ...EMPTY_EXTRA };
  }
}
