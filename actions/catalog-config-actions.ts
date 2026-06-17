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
  slug: string | null;
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
  slug: null,
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
    slug: config.slug ?? null,
  };
}

export async function updateCatalogConfig(data: CatalogConfigData) {
  const user = await currentUser();
  if (!user) return { success: false, message: 'No autenticado' };

  const userId = user.effectiveId as string;
  const { slug, ...rest } = data;

  await db.catalogConfig.upsert({
    where: { userId },
    create: { userId, ...rest },
    update: { ...rest },
  });

  revalidatePath(`/catalogo/${userId}`);
  return { success: true, message: 'Configuración guardada' };
}

export async function updateCatalogSlug(slug: string) {
  const user = await currentUser();
  if (!user) return { success: false, message: 'No autenticado' };

  const normalized = slug.toLowerCase().trim().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  if (!normalized) return { success: false, message: 'Slug inválido' };

  const existing = await db.catalogConfig.findUnique({ where: { slug: normalized } });
  if (existing && existing.userId !== user.effectiveId) {
    return { success: false, message: 'Ese nombre ya está en uso' };
  }

  await db.catalogConfig.upsert({
    where: { userId: user.effectiveId as string },
    create: { userId: user.effectiveId as string, slug: normalized },
    update: { slug: normalized },
  });

  revalidatePath(`/c/${normalized}`);
  return { success: true, slug: normalized };
}

export async function getUserIdBySlug(slug: string): Promise<string | null> {
  const config = await db.catalogConfig.findUnique({
    where: { slug },
    select: { userId: true },
  });
  return config?.userId ?? null;
}
