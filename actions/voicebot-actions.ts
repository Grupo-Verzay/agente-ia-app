'use server';

// Item 7 (M3.1): configuración del voicebot por cuenta.
// El bot que contesta llamadas entrantes se activa por cuenta (instancia de
// WhatsApp). Aquí se lee/guarda esa config; el servidor de llamadas (wacalls)
// la consulta vía el endpoint del backend al entrar una llamada.

import { currentUser } from '@/lib/auth';
import { db } from '@/lib/db';

export interface VoicebotConfig {
  enabled: boolean;
  voice: string | null;
  transferTo: string | null;
}

/** Voces disponibles de OpenAI Realtime (las más naturales). */
export const VOICEBOT_VOICES = ['alloy', 'verse', 'shimmer', 'coral', 'sage', 'ash'] as const;

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
