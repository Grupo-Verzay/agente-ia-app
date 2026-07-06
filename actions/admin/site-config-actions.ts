"use server";

import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { revalidatePath, revalidateTag, unstable_cache } from "next/cache";
import type { TestimonialData, StatData } from "@/actions/reseller-plan-actions";
import { DEFAULT_BILLING_TEMPLATES } from "@/actions/billing/billing-message-templates";

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
  faviconUrl: string | null;
  brandName: string | null;
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
  logoUrl: null, faviconUrl: null, brandName: null, instagram: null, facebook: null,
  videoUrl: null, ctaHeadline: null, ctaSubtitle: null,
  testimonials: null, stats: null,
  resellerWhatsappNumber: null,
  resellerLogoUrl: null,
  resellerMeetingUrl: null,
  showAssistanceIA: true,
  showAssistanceHUMANO: true,
};

const SITE_CONFIG_TAG = "site-config";

// getSiteConfig se lee en el layout raíz, en todas las páginas públicas y en
// generateMetadata → se cachea (datos casi estáticos) y se invalida al guardar.
const getSiteConfigCached = unstable_cache(
  async (): Promise<SiteConfigData> => {
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
      faviconUrl: c.faviconUrl ?? null,
      brandName: c.brandName ?? null,
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
  },
  ["site-config"],
  { revalidate: 300, tags: [SITE_CONFIG_TAG] },
);

export async function getSiteConfig(): Promise<SiteConfigData> {
  return getSiteConfigCached();
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
    revalidateTag(SITE_CONFIG_TAG);
    revalidatePath("/inicio");
    revalidatePath("/resellers");
    return { success: true, message: "Logo actualizado" };
  } catch {
    return { success: false, message: "Error al actualizar logo" };
  }
}

export async function updatePlatformFaviconUrl(faviconUrl: string): Promise<{ success: boolean; message: string }> {
  try {
    const user = await currentUser();
    if (!user || user.role !== "super_admin") {
      return { success: false, message: "Solo el Super Admin puede actualizar el favicon de plataforma" };
    }
    await db.siteConfig.upsert({
      where: { id: 1 },
      update: { faviconUrl },
      create: { id: 1, faviconUrl },
    });
    revalidateTag(SITE_CONFIG_TAG);
    revalidatePath("/inicio");
    revalidatePath("/resellers");
    return { success: true, message: "Favicon actualizado" };
  } catch {
    return { success: false, message: "Error al actualizar favicon" };
  }
}

export async function updatePlatformBrandName(brandName: string): Promise<{ success: boolean; message: string }> {
  try {
    const user = await currentUser();
    if (!user || user.role !== "super_admin") {
      return { success: false, message: "Solo el Super Admin puede actualizar el nombre de plataforma" };
    }
    await db.siteConfig.upsert({
      where: { id: 1 },
      update: { brandName },
      create: { id: 1, brandName },
    });
    revalidateTag(SITE_CONFIG_TAG);
    revalidatePath("/inicio");
    revalidatePath("/resellers");
    return { success: true, message: "Nombre de marca actualizado" };
  } catch {
    return { success: false, message: "Error al actualizar el nombre de marca" };
  }
}

/* ── Mensajes de cobro de la plataforma (Verzay) ────────────────────────── */
// Overrides editables; vacío = texto estándar por defecto (idéntico al que ven
// los resellers). Placeholders: {empresa} {fecha} {dias} {precio} {plan} {link}
export type PlatformBillingMessages = {
  msgReminder: string;
  msgDueToday: string;
  msgOverdue: string;
  msgSuspended: string;
  msgDeleted: string;
};

export async function getPlatformBillingMessages(): Promise<PlatformBillingMessages> {
  // Prellenado con el patrón por defecto de Verzay (misma fuente que los resellers).
  const defaults: PlatformBillingMessages = {
    msgReminder: DEFAULT_BILLING_TEMPLATES.msgReminder,
    msgDueToday: DEFAULT_BILLING_TEMPLATES.msgDueToday,
    msgOverdue: DEFAULT_BILLING_TEMPLATES.msgOverdue,
    msgSuspended: DEFAULT_BILLING_TEMPLATES.msgSuspended,
    msgDeleted: DEFAULT_BILLING_TEMPLATES.msgDeleted,
  };
  try {
    const c = await db.siteConfig.findUnique({ where: { id: 1 } });
    if (!c) return defaults;
    return {
      msgReminder: c.billingMsgReminder ?? defaults.msgReminder,
      msgDueToday: c.billingMsgDueToday ?? defaults.msgDueToday,
      msgOverdue: c.billingMsgOverdue ?? defaults.msgOverdue,
      msgSuspended: c.billingMsgSuspended ?? defaults.msgSuspended,
      msgDeleted: c.billingMsgDeleted ?? defaults.msgDeleted,
    };
  } catch {
    return defaults;
  }
}

export async function savePlatformBillingMessages(
  data: PlatformBillingMessages,
): Promise<{ success: boolean; message: string }> {
  try {
    const user = await currentUser();
    if (!user || (user.role !== "admin" && user.role !== "super_admin")) {
      return { success: false, message: "No autorizado" };
    }
    // null = idéntico al patrón por defecto (el cron usa el mensaje dinámico exacto).
    const overrideOrNull = (value: string | null | undefined, def: string) => {
      const v = (value ?? "").trim();
      return v && v !== def.trim() ? v : null;
    };
    const payload = {
      billingMsgReminder: overrideOrNull(data.msgReminder, DEFAULT_BILLING_TEMPLATES.msgReminder),
      billingMsgDueToday: overrideOrNull(data.msgDueToday, DEFAULT_BILLING_TEMPLATES.msgDueToday),
      billingMsgOverdue: overrideOrNull(data.msgOverdue, DEFAULT_BILLING_TEMPLATES.msgOverdue),
      billingMsgSuspended: overrideOrNull(data.msgSuspended, DEFAULT_BILLING_TEMPLATES.msgSuspended),
      billingMsgDeleted: overrideOrNull(data.msgDeleted, DEFAULT_BILLING_TEMPLATES.msgDeleted),
    };
    await db.siteConfig.upsert({
      where: { id: 1 },
      update: payload,
      create: { id: 1, ...payload },
    });
    return { success: true, message: "Mensajes de cobro guardados." };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, message: msg };
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
      faviconUrl: data.faviconUrl || null,
      brandName: data.brandName || null,
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
    revalidateTag(SITE_CONFIG_TAG);
    revalidatePath("/inicio");
    revalidatePath("/resellers");
    return { success: true, message: "Configuración guardada" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, message: msg };
  }
}
