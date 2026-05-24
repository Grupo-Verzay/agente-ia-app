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
      const MEDIA_LABELS_CHAT: Record<string, string> = {
        imageMessage: '[Imagen]', videoMessage: '[Video]',
        audioMessage: '[Audio]', documentMessage: '[Documento]', stickerMessage: '[Sticker]',
      };
      const lastBody = c.lastMessageBody ?? '';
      const lastType = c.lastMessageType ?? 'conversation';
      const isLastMedia = lastType in MEDIA_LABELS_CHAT;
      const lastMessageBody = isLastMedia && !lastBody
        ? MEDIA_LABELS_CHAT[lastType]
        : lastBody;

      const lastMessage: LastMessage | null = c.lastMessageBody != null || isLastMedia
        ? {
            id: null,
            key: { id: '', fromMe: c.lastMessageFromMe ?? false, remoteJid: c.remoteJid },
            pushName: c.pushName ?? null,
            participant: null,
            messageType: 'conversation',
            message: { conversation: lastMessageBody },
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
        instanceName,
        instanceType: 'baileys' as const,
      } satisfies ChatData;
    });

    return { success: true, message: 'OK', data: chats };
  } catch (err) {
    return { success: false, message: err?.message ?? 'Error al cargar chats Baileys.' };
  }
}

const MIME_FROM_EXT: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp',
  mp4: 'video/mp4', mov: 'video/quicktime', avi: 'video/x-msvideo',
  ogg: 'audio/ogg', mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel', csv: 'text/csv',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword', zip: 'application/zip', rar: 'application/x-rar-compressed',
};

function inferMimeFromUrl(url: string): string {
  const ext = (url.split('.').pop() ?? '').toLowerCase().split('?')[0];
  return MIME_FROM_EXT[ext] ?? 'application/octet-stream';
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

    const MEDIA_LABELS: Record<string, string> = {
      imageMessage:    '[Imagen]',
      videoMessage:    '[Video]',
      audioMessage:    '[Audio]',
      documentMessage: '[Documento]',
      stickerMessage:  '[Sticker]',
    };
    const MEDIA_TYPES = Object.keys(MEDIA_LABELS);

    const messages: EvolutionMessage[] = (json.messages ?? []).map((m: any) => {
      const isMedia    = MEDIA_TYPES.includes(m.type);
      const isReaction = m.type === 'reactionMessage';
      const mediaUrl: string | null = m.mediaUrl ?? null;

      const messageType = isReaction
        ? 'reactionMessage'
        : isMedia && mediaUrl ? m.type : 'conversation';

      let message: Record<string, any>;
      if (isReaction) {
        message = { reactionMessage: { text: m.body ?? '' } };
      } else if (m.type === 'documentMessage' && mediaUrl) {
        // Incluir estructura documentMessage para que extractMediaInfo obtenga mimetype y caption
        message = {
          documentMessage: {
            mimetype: inferMimeFromUrl(mediaUrl),
            caption: m.body || undefined,
            fileName: m.body || undefined,
          },
          mediaUrl,
        };
      } else {
        message = {
          conversation: isMedia && !mediaUrl
            ? (m.body?.trim() || MEDIA_LABELS[m.type] || '')
            : (m.body ?? ''),
          ...(mediaUrl ? { mediaUrl } : {}),
        };
      }

      return {
        key: { id: m.id, fromMe: m.fromMe, remoteJid: m.remoteJid },
        messageType,
        message,
        messageTimestamp: m.timestamp
          ? Math.floor(new Date(m.timestamp).getTime() / 1000)
          : 0,
        status: m.status ?? 'DELIVERY_ACK',
        pushName: null,
      };
    });

    return { success: true, message: 'OK', data: messages };
  } catch (err) {
    return { success: false, message: err?.message ?? 'Error al cargar mensajes Baileys.' };
  }
}

export async function sendBaileysTextAction(
  instanceName: string,
  remoteJid: string,
  payload: BaileysOutgoingPayload,
): Promise<SendMessageResult> {
  try {
    if (payload.kind === 'media') {
      const res = await fetch(
        `${backendUrl()}/whatsapp/baileys/send-media/${encodeURIComponent(instanceName)}`,
        {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({
            remoteJid,
            mediatype: payload.mediatype,
            mediaUrl: payload.mediaUrl,
            mimetype: payload.mimetype,
            fileName: payload.fileName,
            caption: payload.caption,
            ptt: payload.ptt ?? false,
          }),
          cache: 'no-store',
        },
      );
      if (!res.ok) return { success: false, message: `Error ${res.status} al enviar media.`, remoteJid };
      return { success: true, message: 'Enviado.', remoteJid };
    }

    // Texto
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
  } catch (err) {
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
  } catch (err) {
    return { success: false, message: err?.message ?? 'Error al enviar respuesta rápida.' };
  }
}
