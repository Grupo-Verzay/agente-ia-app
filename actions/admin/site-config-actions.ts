"use server";

import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import type { TestimonialData, StatData } from "@/actions/reseller-plan-actions";

export type { TestimonialData, StatData };

export type SiteConfigData = {
  whatsappNumber: string | null;
  meetingUrl: string | null;
  sheetsUrl: string | null;
  primaryColor: string | null;
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

const EMPTY: SiteConfigData = {
  whatsappNumber: null, meetingUrl: null, sheetsUrl: null,
  primaryColor: null, headline: null, subheadline: null,
  logoUrl: null, instagram: null, facebook: null,
  videoUrl: null, ctaHeadline: null, ctaSubtitle: null,
  testimonials: null, stats: null,
};

export async function getSiteConfig(): Promise<SiteConfigData> {
  try {
    const c = await db.siteConfig.findUnique({ where: { id: 1 } });
    if (!c) return EMPTY;
    return {
      whatsappNumber: c.whatsappNumber ?? null,
      meetingUrl: c.meetingUrl ?? null,
      sheetsUrl: c.sheetsUrl ?? null,
      primaryColor: c.primaryColor ?? null,
      headline: c.headline ?? null,
      subheadline: c.subheadline ?? null,
      logoUrl: c.logoUrl ?? null,
      instagram: c.instagram ?? null,
      facebook: c.facebook ?? null,
      videoUrl: c.videoUrl ?? null,
      ctaHeadline: c.ctaHeadline ?? null,
      ctaSubtitle: c.ctaSubtitle ?? null,
      testimonials: Array.isArray(c.testimonials) ? (c.testimonials as TestimonialData[]) : null,
      stats: Array.isArray(c.stats) ? (c.stats as StatData[]) : null,
    };
  } catch {
    return EMPTY;
  }
}

export async function updateSiteConfig(data: SiteConfigData): Promise<{ success: boolean; message: string }> {
  try {
    const user = await currentUser();
    if (!user || (user.role !== "admin" && user.role !== "super_admin")) {
      return { success: false, message: "No autorizado" };
    }
    const payload = {
      whatsappNumber: data.whatsappNumber || null,
      meetingUrl: data.meetingUrl || null,
      sheetsUrl: data.sheetsUrl || null,
      primaryColor: data.primaryColor || null,
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
    await db.siteConfig.upsert({
      where: { id: 1 },
      update: payload,
      create: { id: 1, ...payload },
    });
    revalidatePath("/inicio");
    return { success: true, message: "Configuración guardada" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, message: msg };
  }
}
