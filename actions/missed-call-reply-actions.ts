'use server';

import { db } from '@/lib/db';
import { currentUser } from '@/lib/auth';
import { sendMessageWithHistoryAction } from '@/actions/chat-history/send-message-with-history-action';
import { sendChannelTextAction } from '@/actions/channel-chat-actions';
import { persistChatMessage } from '@/lib/chat-persistence';

/**
 * Resuelve la cuenta a la que pertenecen las llamadas del usuario actual.
 * Espeja getCallAccountUserId de astracalls-actions (no exportado): la línea de
 * llamadas se resuelve por la cuenta ACTIVA (effectiveId), NO por el
 * master_user_id de linked_accounts. Usar el master cruzaba los números de
 * cuentas co-administradas y el mensaje salía por otra línea (o no salía) y no
 * quedaba en el chat visible. Ver [[project_calls_line_astracalls]] (fix 63c2be4).
 */
async function resolveCallAccountId(): Promise<string | null> {
  const me = await currentUser();
  if (!me?.id) return null;
  return me.effectiveId ?? me.id;
}

export interface MissedCallReplyConfig {
  enabled: boolean;
  text: string;
}

const DEFAULT_MISSED_CALL_TEXT =
  'Hola 👋 Te acabamos de *llamar* y no logramos comunicarnos. ¿Prefieres que te *devolvamos la llamada más tarde*, o que *sigamos la conversación por aquí?*\n\nLo que te resulte más cómodo; *quedamos atentos* a tu respuesta 🙌';

// Anti-repetición: no reenviar el mensaje de "llamada perdida" al mismo contacto si
// ya se le envió uno hace poco. Evita spamear al cliente cuando el asesor REINTENTA
// la llamada (cada intento sin contestar disparaba otro mensaje). Ventana: 3 h.
const MISSED_CALL_REPLY_COOLDOWN_MS = 3 * 60 * 60 * 1000;

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

    // Anti-repetición (3 h): si ya se le envió ESTE mismo mensaje al contacto en la
    // ventana, no lo reenviamos aunque el asesor reintente la llamada. Se comprueba
    // por el saliente ya persistido en chat_messages (mismo texto + mismo número).
    const cooldownCutoff = new Date(Date.now() - MISSED_CALL_REPLY_COOLDOWN_MS);
    const recent = await db.$queryRaw<{ ok: number }[]>`
      SELECT 1 AS ok FROM "chat_messages"
      WHERE "userId" = ${userId}
        AND "fromMe" = true
        AND "content" = ${text}
        AND "messageTimestamp" >= ${cooldownCutoff}
        AND (
          "remoteJid" LIKE ${`%${digits}%`}
          OR "remoteJidAlt" LIKE ${`%${digits}%`}
          OR "senderPn" LIKE ${`%${digits}%`}
        )
      LIMIT 1
    `;
    if (recent.length > 0) {
      return { sent: false, message: 'Ya se envió un mensaje de llamada perdida a este contacto en las últimas 3 h.' };
    }

    // Instancia de la cuenta (cualquier canal de WhatsApp).
    const inst =
      (await db.instancia.findFirst({
        where: { userId, instanceType: { in: ['Whatsapp', 'whatsapp', 'evolution', 'baileys', 'meta'] } },
        select: { instanceName: true, instanceType: true },
      })) ??
      (await db.instancia.findFirst({ where: { userId }, select: { instanceName: true, instanceType: true } }));
    const instanceName = inst?.instanceName;
    if (!instanceName) return { sent: false, message: 'Sin instancia de WhatsApp.' };

    const remoteJid = `${digits}@s.whatsapp.net`;
    const channel = (inst?.instanceType ?? '').toLowerCase();

    // Canales oficiales/unificados (Meta Cloud API, Baileys): se envía por el
    // backend, que respeta la ventana de 24h de Meta y persiste en el panel.
    if (channel === 'meta' || channel === 'baileys') {
      const res = await sendChannelTextAction(instanceName, remoteJid, { kind: 'text', text });
      return { sent: !!res?.success, message: res?.success ? undefined : res?.message };
    }

    // Evolution (WhatsApp no oficial): envío directo con las credenciales de la cuenta.
    const baseUrl = user.apiKey?.url?.trim();
    const apikey = user.apiKey?.key?.trim();
    if (!baseUrl || !apikey) return { sent: false, message: 'Sin credenciales de WhatsApp.' };
    const normalizedBase = /^https?:\/\//i.test(baseUrl)
      ? baseUrl.replace(/\/+$/, '')
      : `https://${baseUrl.replace(/\/+$/, '')}`;

    const res = await sendMessageWithHistoryAction({
      instanceName,
      remoteJid,
      message: text,
      url: `${normalizedBase}/message/sendText/${instanceName}`,
      apikey,
      historyType: 'notification',
      // Va al CLIENTE: se envía tal cual (el texto de "llamada perdida" de la
      // cuenta). Sin este flag, si el texto contenía palabras como "asesor" o
      // "esperando tu respuesta", el reformateador lo convertía en la plantilla
      // genérica "Solicitud de asesor / Sin número" y el cliente recibía eso en
      // vez del mensaje real de la cuenta.
      additionalKwargs: { recipient: 'client' },
    });

    // Persistir el saliente en el panel de Chats (chat_messages) además del
    // historial del agente (n8nChatHistory), que el panel NO lee para burbujas.
    // Sin esto la burbuja solo aparecía de forma transitoria por el poll en vivo
    // a Evolution y DESAPARECÍA al recargar la lista desde chat_messages. Se usa
    // el messageId REAL devuelto por Evolution para que su eco posterior
    // deduplique (ON CONFLICT) y no salga la burbuja doble. Si no llegó id real,
    // NO se persiste con id aleatorio (evita duplicar contra el eco).
    const realMessageId = (res as { messageId?: string })?.messageId;
    if (res?.success && realMessageId) {
      await persistChatMessage({
        userId,
        instanceName,
        instanceType: inst?.instanceType ?? 'evolution',
        remoteJid,
        messageId: realMessageId,
        fromMe: true,
        messageType: 'conversation',
        content: text,
        messageTimestamp: new Date(),
      }).catch(() => { /* best-effort: el mensaje ya se envió */ });
    }

    return { sent: !!res?.success, message: res?.success ? undefined : res?.message };
  } catch (e: any) {
    return { sent: false, message: e?.message };
  }
}
