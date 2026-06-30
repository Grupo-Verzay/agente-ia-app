'use server';

// Item 7 (M3.1): configuración del voicebot por cuenta.
// El bot que contesta llamadas entrantes se activa por cuenta (instancia de
// WhatsApp). Aquí se lee/guarda esa config; el servidor de llamadas (wacalls)
// la consulta vía el endpoint del backend al entrar una llamada.

import { currentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { VOICEBOT_VOICES } from '@/lib/voicebot-voices';

const ASTRA_BASE = (process.env.ASTRACALLS_URL || '').replace(/\/+$/, '');
const ASTRA_KEY = process.env.ASTRACALLS_API_KEY || '';

export interface VoicebotConfig {
  enabled: boolean;
  voice: string | null;
  transferTo: string | null;
}

async function getWhatsappInstance(userId: string) {
  return db.instancia.findFirst({
    where: { userId, instanceType: { in: ['Whatsapp', 'whatsapp'] } },
    orderBy: { id: 'asc' },
    select: { id: true, voicebotEnabled: true, voicebotVoice: true, voicebotTransferTo: true },
  });
}

export async function getVoicebotConfig(): Promise<{ success: boolean; data?: VoicebotConfig; message?: string }> {
  const me = await currentUser();
  const userId = me?.ownerId ?? me?.id;
  if (!userId) return { success: false, message: 'No autorizado.' };
  try {
    const inst = await getWhatsappInstance(userId);
    if (!inst) return { success: true, data: { enabled: false, voice: null, transferTo: null } };
    return {
      success: true,
      data: {
        enabled: Boolean(inst.voicebotEnabled),
        voice: inst.voicebotVoice ?? null,
        transferTo: inst.voicebotTransferTo ?? null,
      },
    };
  } catch (err) {
    console.error('[getVoicebotConfig]', err);
    return { success: false, message: 'No se pudo cargar la configuración del bot.' };
  }
}

export async function setVoicebotConfig(input: {
  enabled?: boolean;
  voice?: string | null;
  transferTo?: string | null;
}): Promise<{ success: boolean; message?: string }> {
  const me = await currentUser();
  const userId = me?.ownerId ?? me?.id;
  if (!userId) return { success: false, message: 'No autorizado.' };

  // Normaliza el número de transferencia a solo dígitos (o null).
  const transferTo =
    input.transferTo === undefined
      ? undefined
      : (input.transferTo || '').replace(/\D/g, '') || null;

  if (input.voice && !VOICEBOT_VOICES.includes(input.voice as (typeof VOICEBOT_VOICES)[number])) {
    return { success: false, message: 'Voz no válida.' };
  }

  try {
    const inst = await getWhatsappInstance(userId);
    if (!inst) return { success: false, message: 'No tienes una cuenta de WhatsApp vinculada.' };
    await db.instancia.update({
      where: { id: inst.id },
      data: {
        ...(input.enabled !== undefined ? { voicebotEnabled: input.enabled } : {}),
        ...(input.voice !== undefined ? { voicebotVoice: input.voice } : {}),
        ...(transferTo !== undefined ? { voicebotTransferTo: transferTo } : {}),
      },
    });
    return { success: true };
  } catch (err) {
    console.error('[setVoicebotConfig]', err);
    return { success: false, message: 'No se pudo guardar la configuración del bot.' };
  }
}

/**
 * Lanza una llamada SALIENTE atendida por el voicebot: la app le pide a wacalls
 * que llame al número y, al contestar, conecte la IA de voz. Requiere el toggle
 * "Asistente de voz IA" activo (lo valida el resolve del backend).
 */
export async function startBotCallAction(
  phone: string,
): Promise<{ success: boolean; message?: string }> {
  const me = await currentUser();
  if (!me?.id) return { success: false, message: 'No autorizado.' };
  if (!ASTRA_BASE || !ASTRA_KEY) return { success: false, message: 'Llamadas no configuradas.' };

  const digits = (phone || '').replace(/\D/g, '');
  if (digits.length < 6) return { success: false, message: 'Número inválido.' };

  const user = await db.user.findUnique({ where: { id: me.id }, select: { astraCallsSid: true } });
  const sid = user?.astraCallsSid;
  if (!sid) return { success: false, message: 'No tienes un número de llamadas vinculado (Conexión → Llamadas).' };

  try {
    const r = await fetch(`${ASTRA_BASE}/api/sessions/${sid}/calls/bot`, {
      method: 'POST',
      headers: { 'X-API-Key': ASTRA_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: digits }),
    });
    if (!r.ok) {
      const t = await r.json().catch(() => ({} as { error?: string; reason?: string }));
      if (r.status === 403) {
        const byReason: Record<string, string> = {
          no_credits: 'Sin créditos disponibles para llamadas con IA. Recarga créditos.',
          disabled: 'Activa "Asistente de voz IA" en Conexión → Llamadas primero.',
          no_openai_key: 'Configura tu clave de OpenAI en Ajustes (el voicebot la necesita).',
          no_account: 'No tienes un número de llamadas vinculado.',
        };
        return { success: false, message: byReason[t?.reason ?? ''] ?? 'Voicebot no habilitado para esta cuenta.' };
      }
      return { success: false, message: t?.error || `No se pudo iniciar la llamada del bot (${r.status}).` };
    }
    return { success: true };
  } catch (e: any) {
    return { success: false, message: e?.message || 'Error iniciando la llamada del bot.' };
  }
}
