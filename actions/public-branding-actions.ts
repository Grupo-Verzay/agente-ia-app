"use server";

import { db } from "@/lib/db";
import { getSiteConfig } from "@/actions/admin/site-config-actions";

/**
 * Marca resuelta para páginas públicas (favicon en la pestaña, nombre/título,
 * logo y color de acento). Resolución: datos del propio usuario → del reseller
 * asignado → de la plataforma (SiteConfig) → valores por defecto.
 */
export type PublicBranding = {
  faviconUrl: string;
  brandName: string;
  logoUrl: string | null;
  primaryColor: string | null;
};

const DEFAULT_FAVICON = "/favicon.ico";
const DEFAULT_BRAND = "Agente IA";

async function platformFallback(): Promise<PublicBranding> {
  const siteConfig = await getSiteConfig();
  return {
    faviconUrl: siteConfig.faviconUrl?.trim() || DEFAULT_FAVICON,
    brandName: siteConfig.brandName?.trim() || DEFAULT_BRAND,
    logoUrl: siteConfig.logoUrl ?? null,
    primaryColor: siteConfig.primaryColor ?? null,
  };
}

export async function getPublicBrandingByUserId(userId: string): Promise<PublicBranding> {
  const fallback = await platformFallback();
  try {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { faviconUrl: true, brandName: true, image: true, company: true, demoResellerId: true },
    });
    if (!user) return fallback;
    // Si es cliente de un reseller usa ese reseller; si es el reseller, su propia ficha.
    const targetResellerId = user.demoResellerId ?? userId;
    const [resellerRow, resellerUser] = await Promise.all([
      db.reseller.findFirst({
        where: { resellerid: targetResellerId },
        select: { primaryColor: true, logoUrl: true, businessName: true },
      }),
      user.demoResellerId
        ? db.user.findUnique({
            where: { id: user.demoResellerId },
            select: { faviconUrl: true, brandName: true, image: true, company: true },
          })
        : Promise.resolve(null),
    ]);
    return {
      faviconUrl: user.faviconUrl?.trim() || resellerUser?.faviconUrl?.trim() || fallback.faviconUrl,
      brandName:
        user.brandName?.trim() ||
        user.company?.trim() ||
        resellerRow?.businessName?.trim() ||
        resellerUser?.brandName?.trim() ||
        resellerUser?.company?.trim() ||
        fallback.brandName,
      logoUrl: user.image || resellerRow?.logoUrl || resellerUser?.image || fallback.logoUrl,
      primaryColor: resellerRow?.primaryColor || fallback.primaryColor,
    };
  } catch {
    return fallback;
  }
}

export async function getPublicBrandingBySlug(slug: string): Promise<PublicBranding> {
  const fallback = await platformFallback();
  try {
    const resellerRow = await db.reseller.findFirst({
      where: { slug },
      select: { resellerid: true, primaryColor: true, logoUrl: true, businessName: true },
    });
    if (!resellerRow?.resellerid) return fallback;
    const resellerUser = await db.user.findUnique({
      where: { id: resellerRow.resellerid },
      select: { faviconUrl: true, brandName: true, image: true, company: true },
    });
    return {
      faviconUrl: resellerUser?.faviconUrl?.trim() || fallback.faviconUrl,
      brandName:
        resellerRow.businessName?.trim() ||
        resellerUser?.brandName?.trim() ||
        resellerUser?.company?.trim() ||
        fallback.brandName,
      logoUrl: resellerRow.logoUrl || resellerUser?.image || fallback.logoUrl,
      primaryColor: resellerRow.primaryColor || fallback.primaryColor,
    };
  } catch {
    return fallback;
  }
}
