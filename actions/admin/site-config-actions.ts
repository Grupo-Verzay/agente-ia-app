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
  resellerWhatsappNumber: string | null;
  resellerLogoUrl: string | null;
  resellerMeetingUrl: string | null;
  showAssistanceIA: boolean;
  showAssistanceHUMANO: boolean;
};

const EMPTY: SiteConfigData = {
  whatsappNumber: null, meetingUrl: null, sheetsUrl: null,
  primaryColor: null, bgColor: null, headline: null, subheadline: null,
  logoUrl: null, instagram: null, facebook: null,
  videoUrl: null, ctaHeadline: null, ctaSubtitle: null,
  testimonials: null, stats: null,
  resellerWhatsappNumber: null,
  resellerLogoUrl: null,
  resellerMeetingUrl: null,
  showAssistanceIA: true,
  showAssistanceHUMANO: true,
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
      bgColor: c.bgColor ?? null,
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
      resellerWhatsappNumber: c.resellerWhatsappNumber ?? null,
      resellerLogoUrl: c.resellerLogoUrl ?? null,
      resellerMeetingUrl: c.resellerMeetingUrl ?? null,
      showAssistanceIA: c.showAssistanceIA ?? true,
      showAssistanceHUMANO: c.showAssistanceHUMANO ?? true,
    };
  } catch {
    return EMPTY;
  }
}

export async function updatePlatformLogoUrl(logoUrl: string): Promise<{ success: boolean; message: string }> {
  try {
    const user = await currentUser();
    if (!user || user.role !== "super_admin") {
      return { success: false, message: "Solo el Super Admin puede actualizar el logo de plataforma" };
    }
    await db.siteConfig.upsert({
      where: { id: 1 },
      update: { logoUrl },
      create: { id: 1, logoUrl },
    });
    revalidatePath("/inicio");
    revalidatePath("/resellers");
    return { success: true, message: "Logo actualizado" };
  } catch {
    return { success: false, message: "Error al actualizar logo" };
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
      resellerWhatsappNumber: data.resellerWhatsappNumber || null,
      resellerLogoUrl: data.resellerLogoUrl || null,
      resellerMeetingUrl: data.resellerMeetingUrl || null,
      showAssistanceIA: data.showAssistanceIA ?? true,
      showAssistanceHUMANO: data.showAssistanceHUMANO ?? true,
    };
    await db.siteConfig.upsert({
      where: { id: 1 },
      update: payload,
      create: { id: 1, ...payload },
    });
    revalidatePath("/inicio");
    revalidatePath("/resellers");
    return { success: true, message: "Configuración guardada" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, message: msg };
  }
}
