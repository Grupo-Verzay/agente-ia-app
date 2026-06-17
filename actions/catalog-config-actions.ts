'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { currentUser } from '@/lib/auth';

export type CatalogConfigData = {
  whatsappNumber: string | null;
  bannerUrl: string | null;
  primaryColor: string | null;
  headline: string | null;
  subheadline: string | null;
  instagram: string | null;
  facebook: string | null;
  tiktok: string | null;
  ctaText: string | null;
  showStock: boolean;
  showSku: boolean;
};

const EMPTY: CatalogConfigData = {
  whatsappNumber: null,
  bannerUrl: null,
  primaryColor: null,
  headline: null,
  subheadline: null,
  instagram: null,
  facebook: null,
  tiktok: null,
  ctaText: null,
  showStock: true,
  showSku: false,
};

export async function getCatalogConfig(userId: string): Promise<CatalogConfigData> {
  const config = await db.catalogConfig.findUnique({ where: { userId } });
  if (!config) return EMPTY;
  return {
    whatsappNumber: config.whatsappNumber,
    bannerUrl: config.bannerUrl,
    primaryColor: config.primaryColor,
    headline: config.headline,
    subheadline: config.subheadline,
    instagram: config.instagram,
    facebook: config.facebook,
    tiktok: config.tiktok,
    ctaText: config.ctaText,
    showStock: config.showStock,
    showSku: config.showSku,
  };
}

export async function updateCatalogConfig(data: CatalogConfigData) {
  const user = await currentUser();
  if (!user) return { success: false, message: 'No autenticado' };

  const userId = user.effectiveId as string;

  await db.catalogConfig.upsert({
    where: { userId },
    create: { userId, ...data },
    update: { ...data },
  });

  revalidatePath(`/catalogo/${userId}`);
  return { success: true, message: 'Configuración guardada' };
}
