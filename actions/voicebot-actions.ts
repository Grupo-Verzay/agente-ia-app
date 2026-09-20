'use server';

// Item 7 (M3.1): configuración del voicebot por cuenta.
// El bot que contesta llamadas entrantes se activa por cuenta (instancia de
// WhatsApp). Aquí se lee/guarda esa config; el servidor de llamadas (wacalls)
// la consulta vía el endpoint del backend al entrar una llamada.

import { currentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { VOICEBOT_VOICES } from '@/lib/voicebot-voices';
import { laLineaDeWhatsappDeLaCuenta, porQueNoHayLineaQr } from '@/lib/linea-de-whatsapp';
import { logOutgoingCallAction } from '@/actions/astracalls-actions';

const ASTRA_BASE = (process.env.ASTRACALLS_URL || '').replace(/\/+$/, '');
const ASTRA_KEY = process.env.ASTRACALLS_API_KEY || '';

export interface VoicebotConfig {
  enabled: boolean;
  voice: string | null;
  transferTo: string | null;
  prompt: string | null;
}

/**
 * La cuenta cuyo voicebot se configura.
 *
 * Es `effectiveId`, **el mismo valor con el que la tarjeta de llamadas de esa
 * misma pantalla resuelve su sesión** (`getCallAccountUserId`). Antes aquí se
 * escribía `ownerId ?? id`, que hoy da lo mismo en las tres ramas de
 * `currentUser()` — pero son dos formas de preguntar la misma cosa, y dos
 * formas es una que se afina y otra que se queda atrás. El alcance se pregunta
 * a la fila EFECTIVA.
 */
function laCuentaDelVoicebot(me: Awaited<ReturnType<typeof currentUser>>) {
  return me?.effectiveId ?? me?.ownerId ?? me?.id ?? null;
}

export async function getVoicebotConfig(): Promise<{ success: boolean; data?: VoicebotConfig; message?: string }> {
  const me = await currentUser();
  const userId = laCuentaDelVoicebot(me);
  if (!userId) return { success: false, message: 'No autorizado.' };
  try {
    const { linea: inst } = await laLineaDeWhatsappDeLaCuenta(userId);
    if (!inst) return { success: true, data: { enabled: false, voice: null, transferTo: null, prompt: null } };
    return {
      success: true,
      data: {
        enabled: Boolean(inst.voicebotEnabled),
        voice: inst.voicebotVoice ?? null,
        transferTo: inst.voicebotTransferTo ?? null,
        prompt: inst.voicebotPrompt ?? null,
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
  prompt?: string | null;
}): Promise<{ success: boolean; message?: string }> {
  const me = await currentUser();
  const userId = laCuentaDelVoicebot(me);
  if (!userId) return { success: false, message: 'No autorizado.' };

  // Normaliza el número de transferencia a solo dígitos (o null).
  const transferTo =
    input.transferTo === undefined
      ? undefined
      : (input.transferTo || '').replace(/\D/g, '') || null;

  const prompt =
    input.prompt === undefined ? undefined : (input.prompt || '').trim() || null;

  if (input.voice && !VOICEBOT_VOICES.includes(input.voice as (typeof VOICEBOT_VOICES)[number])) {
    return { success: false, message: 'Voz no válida.' };
  }

  try {
    const { linea: inst, todas } = await laLineaDeWhatsappDeLaCuenta(userId);
    if (!inst) {
      // El aviso NOMBRA lo que falta. El genérico de antes —«No tienes una
      // cuenta de WhatsApp vinculada»— salía con la línea de esa misma cuenta
      // en pantalla diciendo Conectado, así que mandaba a desvincular y volver
      // a vincular; eso toca la sesión de llamadas, que no es lo que esto mira.
      console.warn('[voicebot] la cuenta no tiene linea de WhatsApp por QR', {
        userId,
        tiposQueTiene: todas.map((i) => i.instanceType ?? '(sin tipo)'),
      });
      return { success: false, message: porQueNoHayLineaQr(todas.map((i) => i.instanceType)) };
    }
    await db.instancia.update({
      where: { id: inst.id },
      data: {
        ...(input.enabled !== undefined ? { voicebotEnabled: input.enabled } : {}),
        ...(input.voice !== undefined ? { voicebotVoice: input.voice } : {}),
        ...(transferTo !== undefined ? { voicebotTransferTo: transferTo } : {}),
        ...(prompt !== undefined ? { voicebotPrompt: prompt } : {}),
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

  // El número de llamadas es de la CUENTA, no de la persona: es donde lo
  // guarda `linkMyCallSession` y donde lo lee la tarjeta de Conexión. Con
  // `me.id`, un asesor —cuya fila no tiene `astraCallsSid` y nunca lo va a
  // tener— recibía «No tienes un número de llamadas vinculado» con el número
  // de su cuenta perfectamente conectado.
  const cuenta = laCuentaDelVoicebot(me) ?? me.id;
  const user = await db.user.findUnique({ where: { id: cuenta }, select: { astraCallsSid: true } });
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
    // Registra la llamada del bot como SALIENTE (IA) para que no la tomen como
    // perdida (el evento de Evolution se deduplica en el backend).
    await logOutgoingCallAction(digits, 0, false, undefined, { isBot: true });
    return { success: true };
  } catch (e: any) {
    return { success: false, message: e?.message || 'Error iniciando la llamada del bot.' };
  }
}
