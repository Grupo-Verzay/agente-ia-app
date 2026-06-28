'use server';

import { currentUser } from '@/lib/auth';
import { db } from '@/lib/db';

const DEFAULT_SUPPORT_MESSAGE =
  'Hola, necesito ayuda para conectar mis canales de mensajería en la plataforma.';

/**
 * Resuelve el WhatsApp de soporte para el usuario actual:
 * 1) el reseller de la cuenta (su notificationNumber), o
 * 2) Verzay como respaldo (VERZAY_WHATSAPP_NUMBER).
 *
 * Devuelve un enlace wa.me con un mensaje pre-llenado.
 */
export async function getSupportWhatsappUrl(
  message?: string,
): Promise<{ url: string | null; target: 'reseller' | 'verzay' | null }> {
  try {
    const user = await currentUser();
    if (!user) return { url: null, target: null };

    const accountId = user.effectiveId ?? user.id;

    // Vínculo cliente → reseller: sistema nuevo (demoResellerId) o viejo (tabla reseller).
    let resellerUserId: string | null = null;
    const account = await db.user
      .findUnique({ where: { id: accountId }, select: { demoResellerId: true } })
      .catch(() => null);
    resellerUserId = account?.demoResellerId ?? null;

    if (!resellerUserId) {
      const oldLink = await db.reseller
        .findFirst({ where: { userId: accountId }, select: { resellerid: true } })
        .catch(() => null);
      resellerUserId = oldLink?.resellerid ?? null;
    }

    let phone: string | null = null;
    let target: 'reseller' | 'verzay' | null = null;

    if (resellerUserId) {
      const resellerUser = await db.user
        .findUnique({ where: { id: resellerUserId }, select: { notificationNumber: true } })
        .catch(() => null);
      if (resellerUser?.notificationNumber) {
        phone = resellerUser.notificationNumber;
        target = 'reseller';
      }
    }

    if (!phone) {
      phone = process.env.VERZAY_WHATSAPP_NUMBER ?? null;
      target = phone ? 'verzay' : null;
    }

    if (!phone) return { url: null, target: null };

    const digits = phone.replace(/\D/g, '');
    const text = encodeURIComponent(message?.trim() || DEFAULT_SUPPORT_MESSAGE);
    return { url: `https://wa.me/${digits}?text=${text}`, target };
  } catch (error) {
    console.error('[getSupportWhatsappUrl]', error);
    return { url: null, target: null };
  }
}
