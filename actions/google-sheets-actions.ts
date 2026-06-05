'use server';

import { db } from '@/lib/db';

export async function getGoogleSheetsWebhookUrl(userId: string): Promise<string | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { googleSheetsWebhookUrl: true },
  });
  return (user as any)?.googleSheetsWebhookUrl ?? null;
}

export async function saveGoogleSheetsWebhookUrl(userId: string, url: string): Promise<{ success: boolean }> {
  try {
    await db.user.update({
      where: { id: userId },
      data: { googleSheetsWebhookUrl: url.trim() || null } as any,
    });
    return { success: true };
  } catch {
    return { success: false };
  }
}

export async function syncContactToGoogleSheets(
  userId: string,
  payload: {
    phone: string;
    name: string;
    email?: string;
    empresa?: string;
    ciudad?: string;
    cargo?: string;
    notas?: string;
  },
): Promise<{ success: boolean; error?: string }> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { googleSheetsWebhookUrl: true },
  });
  const url = (user as any)?.googleSheetsWebhookUrl as string | null;
  if (!url) return { success: false, error: 'Sin webhook configurado' };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, syncedAt: new Date().toISOString() }),
    });
    if (!res.ok) return { success: false, error: `HTTP ${res.status}` };
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Error de red' };
  }
}
