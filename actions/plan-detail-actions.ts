"use server";

import { db } from "@/lib/db";
import { Plan } from "@prisma/client";
import { revalidatePath } from "next/cache";

export type FeatureSection = {
  title: string;
  description: string;
  imageUrl: string;
  imageAlt: string;
  layout: "left" | "right";
  badge?: string;
};

export type GalleryImage = {
  url: string;
  caption: string;
  alt: string;
};

export type FaqItem = {
  question: string;
  answer: string;
};

export type StatItem = {
  value: string;
  label: string;
};

export type TestimonialItem = {
  name: string;
  role: string;
  company: string;
  text: string;
  avatarUrl?: string;
  rating: number;
};

export type PlanDetailData = {
  id: string;
  subscriptionPlanId: string;
  heroTitle: string | null;
  heroSubtitle: string | null;
  heroImageUrl: string | null;
  heroBadge: string | null;
  videoUrl: string | null;
  videoTitle: string | null;
  videoThumbnailUrl: string | null;
  featureSections: FeatureSection[];
  galleryImages: GalleryImage[];
  faqs: FaqItem[];
  stats: StatItem[];
  testimonials: TestimonialItem[];
  meetingUrl: string | null;
  demoUrl: string | null;
  whatsappMessage: string | null;
  ctaTitle: string | null;
  ctaSubtitle: string | null;
  ctaButtonText: string | null;
  ctaButtonUrl: string | null;
  ctaSecondaryText: string | null;
  ctaSecondaryUrl: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  ogImageUrl: string | null;
};

function parsePlanDetail(raw: Record<string, unknown>): PlanDetailData {
  return {
    id: raw.id as string,
    subscriptionPlanId: raw.subscriptionPlanId as string,
    heroTitle: (raw.heroTitle as string) ?? null,
    heroSubtitle: (raw.heroSubtitle as string) ?? null,
    heroImageUrl: (raw.heroImageUrl as string) ?? null,
    heroBadge: (raw.heroBadge as string) ?? null,
    videoUrl: (raw.videoUrl as string) ?? null,
    videoTitle: (raw.videoTitle as string) ?? null,
    videoThumbnailUrl: (raw.videoThumbnailUrl as string) ?? null,
    featureSections: (raw.featureSections as FeatureSection[]) ?? [],
    galleryImages: (raw.galleryImages as GalleryImage[]) ?? [],
    faqs: (raw.faqs as FaqItem[]) ?? [],
    stats: (raw.stats as StatItem[]) ?? [],
    testimonials: (raw.testimonials as TestimonialItem[]) ?? [],
    meetingUrl: (raw.meetingUrl as string) ?? null,
    demoUrl: (raw.demoUrl as string) ?? null,
    whatsappMessage: (raw.whatsappMessage as string) ?? null,
    ctaTitle: (raw.ctaTitle as string) ?? null,
    ctaSubtitle: (raw.ctaSubtitle as string) ?? null,
    ctaButtonText: (raw.ctaButtonText as string) ?? null,
    ctaButtonUrl: (raw.ctaButtonUrl as string) ?? null,
    ctaSecondaryText: (raw.ctaSecondaryText as string) ?? null,
    ctaSecondaryUrl: (raw.ctaSecondaryUrl as string) ?? null,
    metaTitle: (raw.metaTitle as string) ?? null,
    metaDescription: (raw.metaDescription as string) ?? null,
    ogImageUrl: (raw.ogImageUrl as string) ?? null,
  };
}

export async function getPlanDetailBySubscriptionPlanId(subscriptionPlanId: string) {
  try {
    const detail = await db.planDetail.findUnique({ where: { subscriptionPlanId } });
    if (!detail) return { success: true, data: null };
    return { success: true, data: parsePlanDetail(detail as unknown as Record<string, unknown>) };
  } catch (e) {
    console.error("[getPlanDetailBySubscriptionPlanId]", e);
    return { success: false, data: null };
  }
}

export async function getPlanDetailBySlug(planSlug: string, assistanceType = "IA") {
  try {
    const plan = await db.subscriptionPlan.findFirst({
      where: { plan: planSlug as Plan, assistanceType, isResellerPlan: false },
      include: { planDetail: true },
    });
    if (!plan) return { success: false, data: null };
    return {
      success: true,
      plan: {
        id: plan.id,
        plan: plan.plan,
        assistanceType: plan.assistanceType,
        priceUSD: Number(plan.priceUSD),
        priceQuarterly: plan.priceQuarterly != null ? Number(plan.priceQuarterly) : null,
        priceYearly: plan.priceYearly != null ? Number(plan.priceYearly) : null,
        credits: plan.credits,
        features: plan.features,
        description: plan.description,
        isPopular: plan.isPopular,
        checkoutUrlMonthly: plan.checkoutUrlMonthly,
        checkoutUrlQuarterly: plan.checkoutUrlQuarterly,
        checkoutUrlYearly: plan.checkoutUrlYearly,
      },
      data: plan.planDetail
        ? parsePlanDetail(plan.planDetail as unknown as Record<string, unknown>)
        : null,
    };
  } catch (e) {
    console.error("[getPlanDetailBySlug]", e);
    return { success: false, data: null, plan: null };
  }
}

export type UpsertPlanDetailInput = Omit<PlanDetailData, "id" | "subscriptionPlanId">;

export async function upsertPlanDetail(
  subscriptionPlanId: string,
  data: UpsertPlanDetailInput
) {
  try {
    const payload = {
      heroTitle: data.heroTitle ?? null,
      heroSubtitle: data.heroSubtitle ?? null,
      heroImageUrl: data.heroImageUrl ?? null,
      heroBadge: data.heroBadge ?? null,
      videoUrl: data.videoUrl ?? null,
      videoTitle: data.videoTitle ?? null,
      videoThumbnailUrl: data.videoThumbnailUrl ?? null,
      featureSections: data.featureSections ?? [],
      galleryImages: data.galleryImages ?? [],
      faqs: data.faqs ?? [],
      stats: data.stats ?? [],
      testimonials: data.testimonials ?? [],
      meetingUrl: data.meetingUrl ?? null,
      demoUrl: data.demoUrl ?? null,
      whatsappMessage: data.whatsappMessage ?? null,
      ctaTitle: data.ctaTitle ?? null,
      ctaSubtitle: data.ctaSubtitle ?? null,
      ctaButtonText: data.ctaButtonText ?? null,
      ctaButtonUrl: data.ctaButtonUrl ?? null,
      ctaSecondaryText: data.ctaSecondaryText ?? null,
      ctaSecondaryUrl: data.ctaSecondaryUrl ?? null,
      metaTitle: data.metaTitle ?? null,
      metaDescription: data.metaDescription ?? null,
      ogImageUrl: data.ogImageUrl ?? null,
    };

    await db.planDetail.upsert({
      where: { subscriptionPlanId },
      create: { subscriptionPlanId, ...payload },
      update: payload,
    });

    revalidatePath("/planes");
    revalidatePath("/inicio");
    return { success: true, message: "Detalle guardado" };
  } catch (e) {
    console.error("[upsertPlanDetail]", e);
    return { success: false, message: "Error al guardar el detalle" };
  }
}
