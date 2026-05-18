'use server';

import { db } from '@/lib/db';
import type {
  ChatData,
  EvolutionMessage,
  FetchChatsResult,
  FindMessagesResult,
  LastMessage,
  SendMessageResult,
} from '@/actions/chat-actions';
import type { ChatToolActionResult } from '@/types/chat';

type BaileysOutgoingPayload = { kind: string; text?: string; [key: string]: unknown };

function backendUrl() {
  return (process.env.BACKEND_URL ?? '').replace(/\/$/, '');
}

function authHeaders(): Record<string, string> {
  return {
    'x-internal-secret': process.env.CRM_FOLLOW_UP_RUNNER_KEY ?? '',
    'Content-Type': 'application/json',
  };
}

export async function fetchChatsFromBaileys(instanceName: string): Promise<FetchChatsResult> {
  try {
    const res = await fetch(
      `${backendUrl()}/whatsapp/baileys/chats/${encodeURIComponent(instanceName)}`,
      { headers: authHeaders(), cache: 'no-store' },
    );
    if (!res.ok) return { success: false, message: `Error ${res.status} al cargar chats Baileys.` };

    const json = await res.json();

    const chats: ChatData[] = (json.chats ?? []).map((c: any) => {
      const lastMessage: LastMessage | null = c.lastMessageBody != null
        ? {
            id: null,
            key: { id: '', fromMe: c.lastMessageFromMe ?? false, remoteJid: c.remoteJid },
            pushName: c.pushName ?? null,
            participant: null,
            messageType: 'conversation',
            message: { conversation: c.lastMessageBody },
            contextInfo: null,
            source: 'baileys',
            instanceId: instanceName,
            sessionId: null,
            status: 'DELIVERY_ACK',
            messageTimestamp: c.lastMessageAt
              ? Math.floor(new Date(c.lastMessageAt).getTime() / 1000)
              : 0,
          }
        : null;

      // phoneNumber es el número real para contactos @lid (senderPn de Baileys)
      const senderPn = c.phoneNumber
        ? `${String(c.phoneNumber).replace(/\D/g, '')}@s.whatsapp.net`
        : undefined;

      return {
        id: null,
        remoteJid: c.remoteJid,
        pushName: c.pushName ?? null,
        profilePicUrl: null,
        unreadCount: 0,
        updatedAt: c.lastMessageAt ?? undefined,
        lastMessage,
        senderPn,
      } satisfies ChatData;
    });

    return { success: true, message: 'OK', data: chats };
  } catch (err: any) {
    return { success: false, message: err?.message ?? 'Error al cargar chats Baileys.' };
  }
}

export async function findMessagesFromBaileys(
  instanceName: string,
  remoteJid: string,
  opts?: { pageSize?: number; before?: string; page?: number; remoteJidAliases?: string[] },
): Promise<FindMessagesResult> {
  try {
    const params = new URLSearchParams();
    if (opts?.pageSize) params.set('limit', String(opts.pageSize));
    if (opts?.before) params.set('before', opts.before);

    const url = `${backendUrl()}/whatsapp/baileys/messages/${encodeURIComponent(instanceName)}/${encodeURIComponent(remoteJid)}?${params}`;
    const res = await fetch(url, { headers: authHeaders(), cache: 'no-store' });
    if (!res.ok) return { success: false, message: `Error ${res.status} al cargar mensajes.` };

    const json = await res.json();

    const messages: EvolutionMessage[] = (json.messages ?? []).map((m: any) => ({
      key: { id: m.id, fromMe: m.fromMe, remoteJid: m.remoteJid },
      // El body siempre se mapea como conversation; mantener el tipo real
      // solo si es audioMessage/imageMessage/etc. para el renderer de media
      messageType: ['audioMessage', 'imageMessage', 'videoMessage', 'documentMessage', 'stickerMessage'].includes(m.type)
        ? m.type
        : 'conversation',
      message: { conversation: m.body ?? '' },
      messageTimestamp: m.timestamp
        ? Math.floor(new Date(m.timestamp).getTime() / 1000)
        : 0,
      status: m.status ?? 'DELIVERY_ACK',
      pushName: null,
    }));

    return { success: true, message: 'OK', data: messages };
  } catch (err: any) {
    return { success: false, message: err?.message ?? 'Error al cargar mensajes Baileys.' };
  }
}

export async function sendBaileysTextAction(
  instanceName: string,
  remoteJid: string,
  payload: BaileysOutgoingPayload,
): Promise<SendMessageResult> {
  if (payload.kind !== 'text') {
    return { success: false, message: 'Solo texto soportado en Baileys por ahora.', remoteJid };
  }
  try {
    const res = await fetch(
      `${backendUrl()}/whatsapp/baileys/send/${encodeURIComponent(instanceName)}`,
      {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ remoteJid, text: payload.text }),
        cache: 'no-store',
      },
    );
    if (!res.ok) return { success: false, message: `Error ${res.status} al enviar.`, remoteJid };
    return { success: true, message: 'Enviado.', remoteJid };
  } catch (err: any) {
    return { success: false, message: err?.message ?? 'Error al enviar.', remoteJid };
  }
}

export async function sendBaileysWorkflowAction(
  _instanceName: string,
  _remoteJid: string,
  _workflowId: string,
): Promise<ChatToolActionResult> {
  return { success: false, message: 'Workflows manuales no disponibles en modo Baileys.' };
}

export async function sendBaileysQuickReplyAction(
  instanceName: string,
  remoteJid: string,
  quickReplyId: number,
): Promise<ChatToolActionResult> {
  try {
    const rr = await db.quickReply.findUnique({ where: { id: quickReplyId } });
    if (!rr?.mensaje?.trim()) return { success: false, message: 'Respuesta rápida no encontrada.' };

    const res = await fetch(
      `${backendUrl()}/whatsapp/baileys/send/${encodeURIComponent(instanceName)}`,
      {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ remoteJid, text: rr.mensaje.trim() }),
        cache: 'no-store',
      },
    );
    return res.ok
      ? { success: true, message: 'Enviado.' }
      : { success: false, message: `Error ${res.status}.` };
  } catch (err: any) {
    return { success: false, message: err?.message ?? 'Error al enviar respuesta rápida.' };
  }
}
