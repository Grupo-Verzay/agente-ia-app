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
import { esperarYProcesarLaGrabacion } from '@/lib/grabacion-de-llamada.server';
import { laCuentaDeLaLlamada, SIN_NUMERO_EN_LA_LINEA } from '@/lib/cuenta-de-la-llamada.server';

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
/**
 * El id que devuelve el servidor de llamadas al lanzar la del bot.
 *
 * Hoy contesta `{"call":{"callId":"…"}}`, y se leen tambien las otras formas
 * por el mismo motivo por el que las lee el backend: **una forma de dato se
 * comprueba en todas sus fuentes**, y aqui equivocarse no da ningun error —
 * deja la llamada sin `astraCallId`, o sea sin forma de pedir su grabacion
 * nunca mas.
 */
function elIdDeLaLlamada(cuerpo: unknown): string | null {
  if (!cuerpo || typeof cuerpo !== 'object') return null;
  const raiz = cuerpo as Record<string, unknown>;
  const dentro = (raiz.call && typeof raiz.call === 'object' ? raiz.call : {}) as Record<string, unknown>;
  const candidato = raiz.callId ?? raiz.id ?? dentro.callId ?? dentro.id;
  const texto = typeof candidato === 'string' || typeof candidato === 'number' ? String(candidato).trim() : '';
  return texto || null;
}

export async function startBotCallAction(
  phone: string,
  /** La linea por la que entro la conversacion desde la que se llama. */
  lineaDeLaConversacion?: string | null,
): Promise<{ success: boolean; message?: string }> {
  const me = await currentUser();
  if (!me?.id) return { success: false, message: 'No autorizado.' };
  if (!ASTRA_BASE || !ASTRA_KEY) return { success: false, message: 'Llamadas no configuradas.' };

  const digits = (phone || '').replace(/\D/g, '');
  if (digits.length < 6) return { success: false, message: 'Número inválido.' };

  // **La llamada es de la cuenta DUEÑA de la conversación**, no de quien mira
  // (`laCuentaDeLaLlamada`). El servidor de llamadas identifica la cuenta por
  // la sesión (`sid`): de ahí salen el asistente y su configuración, los
  // créditos que se descuentan y el WhatsApp por el que sale. Con el `sid` de
  // quien mira —que es lo que había— una llamada lanzada desde una
  // conversación de Verzay Ventas salía por el número de la madre, cobraba a
  // la madre y aparecía en el chat de la madre.
  //
  // Sin línea (el marcador de CRM › Llamadas) es la cuenta de quien mira, y
  // de la CUENTA, no de la persona: un asesor no tiene `astraCallsSid` propio.
  const cuentaDeLaLlamada = await laCuentaDeLaLlamada(lineaDeLaConversacion);
  if (!cuentaDeLaLlamada.ok) return { success: false, message: cuentaDeLaLlamada.motivo };
  const cuenta = cuentaDeLaLlamada.cuentaId;
  const sid = cuentaDeLaLlamada.sid;
  if (!sid) {
    if (cuentaDeLaLlamada.origen === 'linea') {
      console.warn('[llamadas] la cuenta dueña de la linea no tiene numero vinculado; no se llama con IA', {
        instanceName: cuentaDeLaLlamada.instanceName,
        cuentaId: cuenta,
      });
      return { success: false, message: SIN_NUMERO_EN_LA_LINEA };
    }
    return { success: false, message: 'No tienes un número de llamadas vinculado (Conexión → Llamadas).' };
  }

  try {
    const r = await fetch(`${ASTRA_BASE}/api/sessions/${sid}/calls/bot`, {
      method: 'POST',
      headers: { 'X-API-Key': ASTRA_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: digits }),
    });
    if (!r.ok) {
      const t = await r.json().catch(() => ({} as { error?: string; reason?: string }));
      if (r.status === 403) {
        // Cada motivo con sus palabras, y NINGUNO se cae en «activa el
        // asistente».
        //
        // Ese aviso era el cajón de sastre de seis condiciones distintas —la
        // línea no se encontraba, el secreto no coincidía, el backend no
        // contestaba, la respuesta venía rota— y todas mandaban a encender un
        // interruptor que ya estaba encendido. Eso es lo que hizo que este
        // fallo se buscara en la pantalla equivocada: el aviso nombraba una
        // condición que se cumplía.
        const byReason: Record<string, string> = {
          no_credits: 'Sin créditos disponibles para llamadas con IA. Recarga créditos.',
          disabled: 'Activa "Asistente de voz IA" en Conexión → Llamadas primero.',
          no_line:
            'Esta cuenta no tiene una línea de WhatsApp por QR: el asistente de voz se configura sobre ella. Conéctala en Conexión → Mensajería WhatsApp (QR).',
          no_openai_key: 'Configura tu clave de OpenAI en Ajustes (el voicebot la necesita).',
          no_account: 'No tienes un número de llamadas vinculado.',
          bad_secret:
            'El servidor de llamadas y la plataforma no se reconocen (VOICEBOT_SECRET). Avisa a soporte: no es algo que se arregle desde aquí.',
          no_sid: 'No tienes un número de llamadas vinculado (Conexión → Llamadas).',
          sin_respuesta:
            'No se pudo comprobar el asistente de voz con el servidor. Vuelve a intentarlo en un momento.',
        };
        return { success: false, message: byReason[t?.reason ?? ''] ?? 'Voicebot no habilitado para esta cuenta.' };
      }
      return { success: false, message: t?.error || `No se pudo iniciar la llamada del bot (${r.status}).` };
    }
    // Registra la llamada del bot como SALIENTE (IA) para que no la tomen como
    // perdida (el evento de Evolution se deduplica en el backend).
    //
    // **Y con su `astraSid` y su `astraCallId` dentro.** Esta es la causa de
    // que una llamada con IA lanzada a mano nunca dejara Resumen IA ni
    // Transcripcion: la respuesta del servidor de llamadas —que trae el id de
    // la llamada— se tiraba, la fila se escribia sin el, y sin ese par no hay
    // forma de pedir la grabacion. No fallaba nada: simplemente no habia a
    // quien preguntarle por el audio.
    const callId = elIdDeLaLlamada(await r.json().catch(() => null));
    const { id: filaDeLaLlamada, userId: cuentaDeLaFila } = await logOutgoingCallAction(
      digits,
      0,
      false,
      undefined,
      { isBot: true, provider: 'astra', astraSid: sid, ...(callId ? { astraCallId: callId } : {}) },
      lineaDeLaConversacion,
    );

    if (!callId) {
      // Sin id no hay grabacion que pedir. La llamada sale igual —eso es lo
      // que importa— pero se dice, que es lo contrario de quedarse sin resumen
      // sin saber por que.
      console.warn('[llamadas] el servidor de llamadas no devolvio el id de la llamada del bot', {
        sid,
      });
    } else if (filaDeLaLlamada) {
      // De fondo: la grabacion no existe hasta que alguien cuelga. Es la
      // MISMA espera que usa el flujo por `/api/calls/process-bot-recording`.
      void esperarYProcesarLaGrabacion({
        // La cuenta bajo la que quedo la FILA, no la de quien llamo: cuando la
        // conversacion es de una linea de otra cuenta de la familia, son dos
        // ids distintos y buscar con el equivocado no encuentra nada.
        userId: cuentaDeLaFila ?? cuenta,
        chatMessageId: filaDeLaLlamada,
        astraSid: sid,
        astraCallId: callId,
      });
    }
    return { success: true };
  } catch (e: any) {
    return { success: false, message: e?.message || 'Error iniciando la llamada del bot.' };
  }
}
