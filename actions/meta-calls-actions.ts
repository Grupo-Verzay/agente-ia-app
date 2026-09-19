'use server';

import { currentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { loQueDiceMeta, type LoQueDiceElProveedor } from '@/lib/fin-de-la-llamada';

const GRAPH_VERSION =
  process.env.META_GRAPH_VERSION ||
  process.env.NEXT_PUBLIC_META_GRAPH_VERSION ||
  'v25.0';

const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

async function getMetaInstance(instanceName?: string) {
  const me = await currentUser();
  if (!me?.id) return { error: 'No autenticado.' };

  const userId = me.ownerId ?? me.effectiveId ?? me.id;

  const inst = await db.instancia.findFirst({
    where: {
      userId,
      instanceType: 'meta',
      metaChannel: 'whatsapp',
      ...(instanceName ? { instanceName } : {}),
    } as any,
    select: {
      instanceName: true,
      metaPhoneNumberId: true,
      metaAccessToken: true,
    } as any,
  });

  if (!inst?.metaPhoneNumberId || !inst?.metaAccessToken) {
    return { error: 'WhatsApp Cloud API no tiene credenciales completas.' };
  }

  return {
    instanceName: inst.instanceName,
    phoneNumberId: inst.metaPhoneNumberId as string,
    token: inst.metaAccessToken as string,
  };
}

/**
 * Resuelve con qué instancia/proveedor debe llamarse desde la CUENTA que se
 * está gestionando (cuenta efectiva/dueña), sin depender de que el call site
 * pase la instancia. Así llamar funciona igual desde Chats, CRM u otras
 * secciones, y en cuentas administradas/vinculadas usa el número de esa cuenta.
 *
 * - Si la cuenta tiene WhatsApp Cloud API (Meta) con credenciales → llama por Meta.
 * - Si no → devuelve vacío y el diálogo usa el número de llamadas (AstraCalls).
 */
export async function getPreferredCallInstance(): Promise<{
  instanceType?: string;
  instanceName?: string;
}> {
  const me = await currentUser();
  if (!me?.id) return {};

  const userId = me.ownerId ?? me.effectiveId ?? me.id;

  const inst = await db.instancia.findFirst({
    where: {
      userId,
      instanceType: 'meta',
      metaChannel: 'whatsapp',
    } as any,
    select: {
      instanceName: true,
      metaPhoneNumberId: true,
      metaAccessToken: true,
    } as any,
  });

  if (inst?.metaPhoneNumberId && inst?.metaAccessToken) {
    return { instanceType: 'meta', instanceName: (inst as any).instanceName as string };
  }

  return {};
}

export async function startMetaWhatsAppCall(params: {
  instanceName?: string;
  phone: string;
  sdpOffer: string;
}): Promise<{ success: boolean; callId?: string; message?: string }> {
  const phone = params.phone.replace(/\D/g, '');
  if (!phone) return { success: false, message: 'Número inválido.' };
  if (!params.sdpOffer?.trim()) return { success: false, message: 'Falta SDP de la llamada.' };

  const inst = await getMetaInstance(params.instanceName);
  if ('error' in inst) return { success: false, message: inst.error };

  const res = await fetch(`${GRAPH}/${encodeURIComponent(inst.phoneNumberId)}/calls`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${inst.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: phone,
      action: 'connect',
      session: {
        sdp_type: 'offer',
        sdp: params.sdpOffer,
      },
    }),
    cache: 'no-store',
  });

  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    const metaMessage =
      json?.error?.error_user_msg ||
      json?.error?.message ||
      `Meta respondió ${res.status}.`;
    return { success: false, message: metaMessage };
  }

  const callId = json?.calls?.[0]?.id as string | undefined;
  if (!callId) return { success: false, message: 'Meta no devolvió call_id.' };

  return { success: true, callId };
}

export async function endMetaWhatsAppCall(params: {
  instanceName?: string;
  callId: string;
}): Promise<{ success: boolean; message?: string }> {
  if (!params.callId) return { success: false, message: 'Falta call_id.' };

  const inst = await getMetaInstance(params.instanceName);
  if ('error' in inst) return { success: false, message: inst.error };

  const res = await fetch(`${GRAPH}/${encodeURIComponent(inst.phoneNumberId)}/calls`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${inst.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      call_id: params.callId,
      action: 'terminate',
    }),
    cache: 'no-store',
  });

  if (!res.ok) {
    const json: any = await res.json().catch(() => ({}));
    return {
      success: false,
      message: json?.error?.message || `Meta respondió ${res.status}.`,
    };
  }

  return { success: true };
}

/**
 * El parte de una llamada de Meta: la respuesta de audio y, si ya acabó, cómo.
 *
 * **Esto es lo único que de verdad «reporta el fin» en esta plataforma.** El
 * webhook de llamadas de Meta no llega a la App —los webhooks los recibe el
 * backend, que es otro repositorio— pero el backend lo guarda en la fila
 * `meta_call_<id>` de `chat_messages`, así que aquí se lee. Es la misma fila de
 * la que ya salía el SDP; lo que faltaba era mirar también el `terminate`.
 *
 * AstraCalls no tiene nada equivalente y no se inventa: su fin se detecta por
 * el audio, que es donde de verdad se nota (ver `lib/fin-de-la-llamada.ts`).
 *
 * Las dos cosas van en **una sola consulta** a propósito: durante una llamada
 * esto se pregunta cada pocos segundos, y partirlo en dos acciones sería
 * duplicar el tráfico de la pantalla más cara de la App para leer la misma
 * fila dos veces.
 */
export async function elEstadoDeLaLlamadaMeta(params: {
  instanceName?: string;
  callId: string;
}): Promise<{
  success: boolean;
  sdpAnswer?: string;
  /** El parte de fin, solo si el proveedor ya lo mandó. */
  fin?: LoQueDiceElProveedor;
  message?: string;
}> {
  const me = await currentUser();
  if (!me?.id) return { success: false, message: 'No autenticado.' };
  if (!params.callId) return { success: false, message: 'Falta call_id.' };

  const userId = me.ownerId ?? me.effectiveId ?? me.id;

  const rows = await db.$queryRaw<Array<{ raw: any }>>`
    SELECT "raw"
    FROM "chat_messages"
    WHERE "userId" = ${userId}
      AND "messageId" = ${`meta_call_${params.callId}`}
      AND (${params.instanceName ?? null}::text IS NULL OR "instanceName" = ${params.instanceName ?? null})
    ORDER BY "updatedAt" DESC
    LIMIT 1
  `;

  const metaCall = rows[0]?.raw?.metaCall;
  const fin = loQueDiceMeta(metaCall) ?? undefined;
  const sdp = metaCall?.session?.sdp;
  const sdpType = metaCall?.session?.sdp_type;

  if (typeof sdp === 'string' && sdp.trim()) {
    return { success: true, sdpAnswer: sdp, fin };
  }

  if (fin?.fallo) {
    return {
      success: false,
      fin,
      message: fin.motivo || 'Meta rechazó la conexión de audio.',
    };
  }

  return {
    success: false,
    fin,
    message: sdpType ? 'Respuesta de llamada recibida sin SDP.' : 'Esperando respuesta de Meta.',
  };
}

/**
 * Compatibilidad: la forma antigua, que solo traía el SDP.
 *
 * @deprecated Se queda porque es una acción de servidor y quitarla de golpe
 * rompería cualquier pestaña abierta con el código anterior durante el
 * despliegue. Lo nuevo llama a `elEstadoDeLaLlamadaMeta`.
 */
export async function getMetaWhatsAppCallAnswer(params: {
  instanceName?: string;
  callId: string;
}): Promise<{ success: boolean; sdpAnswer?: string; message?: string }> {
  const { success, sdpAnswer, message } = await elEstadoDeLaLlamadaMeta(params);
  return { success, sdpAnswer, message };
}
