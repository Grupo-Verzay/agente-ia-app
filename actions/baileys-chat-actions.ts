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
      } satisfies ChatData;
    });

    return { success: true, message: 'OK', data: chats };
  } catch (err) {
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

    const MEDIA_LABELS: Record<string, string> = {
      imageMessage:    '[Imagen]',
      videoMessage:    '[Video]',
      audioMessage:    '[Audio]',
      documentMessage: '[Documento]',
      stickerMessage:  '[Sticker]',
    };
    const MEDIA_TYPES = Object.keys(MEDIA_LABELS);

    const messages: EvolutionMessage[] = (json.messages ?? []).map((m: any) => {
      const isMedia  = MEDIA_TYPES.includes(m.type);
      const mediaUrl: string | null = m.mediaUrl ?? null;

      return {
        key: { id: m.id, fromMe: m.fromMe, remoteJid: m.remoteJid },
        // Si hay mediaUrl renderiza con UI de media; si no, muestra como texto con etiqueta
        messageType: isMedia && mediaUrl ? m.type : 'conversation',
        message: {
          conversation: isMedia && !mediaUrl
            ? (m.body?.trim() || MEDIA_LABELS[m.type] || '')
            : (m.body ?? ''),
          ...(mediaUrl ? { mediaUrl } : {}),
        },
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
  } catch (err) {
    return { success: false, message: err?.message ?? 'Error al enviar.', remoteJid };
  }
}

export async function sendBaileysWorkflowAction(
  instanceName: string,
  remoteJid: string,
  workflowId: string,
): Promise<ChatToolActionResult> {
  try {
    const nodes = await db.workflowNode.findMany({
      where: { workflowId },
      orderBy: { order: 'asc' },
    });

    console.log(`[Baileys][Workflow] workflowId=${workflowId} nodos=${nodes.length}`, nodes.map(n => ({ id: n.id, tipo: n.tipo, hasMsg: !!n.message?.trim(), hasUrl: !!n.url?.trim() })));

    if (nodes.length === 0) {
      return { success: false, message: `El flujo no tiene nodos (workflowId: ${workflowId}).` };
    }

    let sent = 0;
    for (const node of nodes) {
      const tipo = (node.tipo ?? '').trim().toLowerCase();

      let body: Record<string, string> | null = null;

      if (tipo === 'text') {
        const text = (node.message ?? '').trim();
        if (text) body = { remoteJid, text };
      } else if (tipo === 'audio') {
        const audioUrl = (node.url as string | null)?.trim();
        if (audioUrl) body = { remoteJid, audioUrl };
      } else if (['image', 'video', 'document'].includes(tipo)) {
        const audioUrl = (node.url as string | null)?.trim();
        if (audioUrl) body = { remoteJid, audioUrl };
      }

      console.log(`[Baileys][Workflow] nodo tipo=${tipo} body=${body ? JSON.stringify(body).substring(0, 80) : 'SKIPPED'}`);

      if (!body) continue;

      const res = await fetch(
        `${backendUrl()}/whatsapp/baileys/send/${encodeURIComponent(instanceName)}`,
        {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify(body),
          cache: 'no-store',
        },
      );
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        console.error(`[Baileys][Workflow] Error HTTP ${res.status} enviando nodo ${node.id}: ${errText}`);
        return { success: false, message: `Error ${res.status} enviando nodo tipo=${tipo}: ${errText}` };
      }
      sent++;
    }

    console.log(`[Baileys][Workflow] Completado. sent=${sent}`);
    return { success: true, message: 'Flujo enviado.', data: { sent } };
  } catch (err: any) {
    console.error('[Baileys][Workflow] Excepción:', err);
    return { success: false, message: err?.message ?? 'Error al ejecutar flujo.' };
  }
}

export async function sendBaileysQuickReplyAction(
  instanceName: string,
  remoteJid: string,
  quickReplyId: number,
): Promise<ChatToolActionResult> {
  try {
    const rr = await db.quickReply.findUnique({ where: { id: quickReplyId } });
    if (!rr) return { success: false, message: 'Respuesta rápida no encontrada.' };

    const hasText = !!rr.mensaje?.trim();
    const hasWorkflow = !!rr.workflowId;

    if (!hasText && !hasWorkflow) {
      return { success: false, message: 'La respuesta rápida no tiene mensaje ni flujo configurado.' };
    }

    // 1. Enviar texto si existe
    if (hasText) {
      const res = await fetch(
        `${backendUrl()}/whatsapp/baileys/send/${encodeURIComponent(instanceName)}`,
        {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({ remoteJid, text: rr.mensaje!.trim() }),
          cache: 'no-store',
        },
      );
      if (!res.ok) return { success: false, message: `Error ${res.status} al enviar texto.` };
    }

    // 2. Ejecutar flujo si existe
    if (hasWorkflow) {
      const workflowResult = await sendBaileysWorkflowAction(instanceName, remoteJid, rr.workflowId!);
      if (!workflowResult.success) return workflowResult;
    }

    return { success: true, message: 'Respuesta rápida enviada correctamente.' };
  } catch (err: any) {
    return { success: false, message: err?.message ?? 'Error al enviar respuesta rápida.' };
  }
}
