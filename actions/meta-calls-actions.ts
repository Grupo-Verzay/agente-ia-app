'use server';

import { currentUser } from '@/lib/auth';
import { db } from '@/lib/db';

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

export async function getMetaWhatsAppCallAnswer(params: {
  instanceName?: string;
  callId: string;
}): Promise<{ success: boolean; sdpAnswer?: string; message?: string }> {
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
  const sdp = metaCall?.session?.sdp;
  const sdpType = metaCall?.session?.sdp_type;
  const errorMessage = Array.isArray(metaCall?.errors)
    ? metaCall.errors.map((error: any) => error?.message || error?.title).filter(Boolean).join(' ')
    : '';

  if (typeof sdp === 'string' && sdp.trim()) {
    return { success: true, sdpAnswer: sdp };
  }

  if (metaCall?.event === 'terminate' && metaCall?.status === 'FAILED') {
    return {
      success: false,
      message: errorMessage || 'Meta rechazó la conexión de audio.',
    };
  }

  return {
    success: false,
    message: sdpType ? 'Respuesta de llamada recibida sin SDP.' : 'Esperando respuesta de Meta.',
  };
}
