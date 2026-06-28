'use server';

import {
  getPersistedInboxChats,
  getPersistedMessages,
  persistChatMessage,
  resolveInstanceOwner,
} from '@/lib/chat-persistence';
import type {
  FetchChatsResult,
  FindMessagesResult,
  SendMessageResult,
} from '@/actions/chat-actions';
import type { ChatToolActionResult } from '@/types/chat';

type ChannelOutgoingPayload = { kind: string; text?: string; [key: string]: unknown };

function backendUrl() {
  return (process.env.BACKEND_URL ?? '').replace(/\/$/, '');
}

function authHeaders(): Record<string, string> {
  return {
    'x-internal-secret': process.env.CRM_FOLLOW_UP_RUNNER_KEY ?? '',
    'Content-Type': 'application/json',
  };
}

/**
 * Acciones de chat para canales que viven en el store unificado
 * (Telegram, Meta: WhatsApp Cloud / Facebook / Instagram).
 *
 * Lectura: tablas chat_messages / chat_conversations (persistidas por el backend).
 * Envío manual: endpoint genérico /whatsapp/baileys/send-channel (WhatsAppSenderFactory).
 */

export async function fetchChannelChats(instanceName: string): Promise<FetchChatsResult> {
  try {
    const owner = await resolveInstanceOwner(instanceName);
    if (!owner?.userId) return { success: false, message: 'Instancia sin propietario.' };

    const data = await getPersistedInboxChats({
      userIds: [owner.userId],
      instanceNames: [instanceName],
    });
    return { success: true, message: 'OK', data };
  } catch (err: any) {
    return { success: false, message: err?.message ?? 'Error al cargar chats.' };
  }
}

export async function warmChannelMessages(
  instanceName: string,
  remoteJid: string,
  opts?: { pageSize?: number; before?: string; page?: number; remoteJidAliases?: string[]; localOnly?: boolean },
): Promise<FindMessagesResult> {
  try {
    const owner = await resolveInstanceOwner(instanceName);
    if (!owner?.userId) return { success: false, message: 'Instancia sin propietario.' };

    const pageSize = opts?.pageSize ?? 50;
    const page = opts?.page && opts.page > 0 ? opts.page : 1;

    const data = await getPersistedMessages({
      userId: owner.userId,
      instanceName,
      remoteJid,
      aliases: opts?.remoteJidAliases,
      take: pageSize,
      skip: (page - 1) * pageSize,
    });
    return { success: true, message: 'OK', data };
  } catch (err: any) {
    return { success: false, message: err?.message ?? 'Error al cargar mensajes.' };
  }
}

export async function sendChannelTextAction(
  instanceName: string,
  remoteJid: string,
  payload: ChannelOutgoingPayload,
): Promise<SendMessageResult> {
  try {
    if (payload.kind === 'media') {
      return { success: false, message: 'El envío manual de multimedia aún no está disponible para este canal.', remoteJid };
    }
    const text = (payload.text ?? '').trim();
    if (!text) return { success: false, message: 'Mensaje vacío.', remoteJid };

    const res = await fetch(
      `${backendUrl()}/whatsapp/baileys/send-channel/${encodeURIComponent(instanceName)}`,
      {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ remoteJid, text }),
        cache: 'no-store',
      },
    );
    if (!res.ok) {
      // El backend devuelve un motivo legible (p.ej. fuera de la ventana de 24h de Meta).
      const reason = await res.json().then((j) => j?.message).catch(() => null);
      return {
        success: false,
        message: typeof reason === 'string' && reason ? reason : `Error ${res.status} al enviar.`,
        remoteJid,
      };
    }

    const owner = await resolveInstanceOwner(instanceName);
    if (owner?.userId) {
      await persistChatMessage({
        userId: owner.userId,
        instanceName,
        instanceType: owner.instanceType ?? undefined,
        remoteJid,
        fromMe: true,
        messageType: 'conversation',
        content: text,
        messageTimestamp: new Date(),
      });
    }
    return { success: true, message: 'Enviado.', remoteJid };
  } catch (err: any) {
    return { success: false, message: err?.message ?? 'Error al enviar.', remoteJid };
  }
}

export async function sendChannelWorkflowAction(
  _instanceName: string,
  _remoteJid: string,
  _workflowId: string,
): Promise<ChatToolActionResult> {
  return { success: false, message: 'Workflows manuales no disponibles en este canal.' };
}

export async function sendChannelQuickReplyAction(
  instanceName: string,
  remoteJid: string,
  quickReplyId: number,
): Promise<ChatToolActionResult> {
  try {
    const { db } = await import('@/lib/db');
    const rr = await db.quickReply.findUnique({ where: { id: quickReplyId } });
    if (!rr?.mensaje?.trim()) return { success: false, message: 'Respuesta rápida no encontrada.' };

    const res = await sendChannelTextAction(instanceName, remoteJid, { kind: 'text', text: rr.mensaje.trim() });
    return res.success
      ? { success: true, message: 'Enviado.' }
      : { success: false, message: res.message };
  } catch (err: any) {
    return { success: false, message: err?.message ?? 'Error al enviar respuesta rápida.' };
  }
}
