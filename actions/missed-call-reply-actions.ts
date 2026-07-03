'use server';

import { db } from '@/lib/db';
import { currentUser } from '@/lib/auth';
import { sendMessageWithHistoryAction } from '@/actions/chat-history/send-message-with-history-action';

/**
 * Resuelve la cuenta (dueño) a la que pertenecen las llamadas del usuario actual.
 * Espeja getCallAccountUserId de astracalls-actions (no exportado).
 */
async function resolveCallAccountId(): Promise<string | null> {
  const me = await currentUser();
  if (!me?.id) return null;
  if (me.ownerId) return me.ownerId;
  const realId = me.sessionUserId ?? me.id;
  try {
    const rows = await db.$queryRaw<{ id: string }[]>`
      SELECT "master_user_id" as id FROM "linked_accounts"
      WHERE "linked_user_id" = ${realId} LIMIT 1
    `;
    if (rows.length && rows[0]?.id) return rows[0].id;
  } catch {
    /* tabla ausente: usar cuenta propia */
  }
  return me.effectiveId ?? me.id;
}

export interface MissedCallReplyConfig {
  enabled: boolean;
  text: string;
}

const DEFAULT_MISSED_CALL_TEXT =
  'Hola 👋 Te llamamos y no pudimos comunicarnos. Cuéntanos por aquí en qué podemos ayudarte y te atendemos enseguida.';

/** Lee la configuración de "mensaje al no contestar" de la cuenta. */
export async function getMissedCallReplyConfig(): Promise<MissedCallReplyConfig> {
  const userId = await resolveCallAccountId();
  if (!userId) return { enabled: false, text: DEFAULT_MISSED_CALL_TEXT };
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { missedCallReplyEnabled: true, missedCallReplyText: true },
  });
  return {
    enabled: Boolean(user?.missedCallReplyEnabled),
    text: user?.missedCallReplyText ?? DEFAULT_MISSED_CALL_TEXT,
  };
}

/** Guarda la configuración de "mensaje al no contestar" de la cuenta. */
export async function saveMissedCallReplyConfig(
  input: MissedCallReplyConfig,
): Promise<{ success: boolean; message?: string }> {
  try {
    const userId = await resolveCallAccountId();
    if (!userId) return { success: false, message: 'No autenticado.' };
    await db.user.update({
      where: { id: userId },
      data: {
        missedCallReplyEnabled: !!input.enabled,
        missedCallReplyText: input.text?.trim() || null,
      },
    });
    return { success: true };
  } catch (e: any) {
    return { success: false, message: e?.message ?? 'Error al guardar.' };
  }
}

/**
 * Envía (si está habilitado) el mensaje de texto configurado al contacto cuando
 * una llamada saliente NO fue contestada. Best-effort: nunca lanza. El mensaje
 * queda registrado en el chat de WhatsApp (historial).
 */
export async function sendMissedOutgoingCallReply(
  phone: string,
): Promise<{ sent: boolean; message?: string }> {
  try {
    const userId = await resolveCallAccountId();
    if (!userId) return { sent: false };

    const digits = (phone || '').replace(/\D/g, '');
    if (!digits) return { sent: false };

    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        missedCallReplyEnabled: true,
        missedCallReplyText: true,
        apiKey: { select: { url: true, key: true } },
      },
    });

    if (!user?.missedCallReplyEnabled) return { sent: false };
    const text = (user.missedCallReplyText ?? '').trim();
    if (!text) return { sent: false };

    const baseUrl = user.apiKey?.url?.trim();
    const apikey = user.apiKey?.key?.trim();
    if (!baseUrl || !apikey) return { sent: false, message: 'Sin credenciales de WhatsApp.' };

    // Instancia de WhatsApp de la cuenta.
    const inst =
      (await db.instancia.findFirst({
        where: { userId, instanceType: { in: ['Whatsapp', 'whatsapp', 'evolution', 'baileys'] } },
        select: { instanceName: true },
      })) ??
      (await db.instancia.findFirst({ where: { userId }, select: { instanceName: true } }));
    const instanceName = inst?.instanceName;
    if (!instanceName) return { sent: false, message: 'Sin instancia de WhatsApp.' };

    const normalizedBase = /^https?:\/\//i.test(baseUrl)
      ? baseUrl.replace(/\/+$/, '')
      : `https://${baseUrl.replace(/\/+$/, '')}`;

    const res = await sendMessageWithHistoryAction({
      instanceName,
      remoteJid: `${digits}@s.whatsapp.net`,
      message: text,
      url: `${normalizedBase}/message/sendText/${instanceName}`,
      apikey,
      historyType: 'notification',
    });

    return { sent: !!res?.success, message: res?.success ? undefined : res?.message };
  } catch (e: any) {
    return { sent: false, message: e?.message };
  }
}
