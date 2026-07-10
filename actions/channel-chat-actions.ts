'use server';

import {
  getPersistedInboxChats,
  getPersistedMessages,
  persistChatMessage,
  resolveInstanceOwner,
} from '@/lib/chat-persistence';
import { currentUser } from '@/lib/auth';
import { db } from '@/lib/db';
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

function mediaFallbackLabel(payload: ChannelOutgoingPayload) {
  const mediatype = String(payload.mediatype ?? 'media');
  if (mediatype === 'image') return '🖼️ Imagen';
  if (mediatype === 'video') return '🎥 Video';
  if (mediatype === 'audio') return payload.ptt === false ? '🎧 Audio' : '🎙️ Nota de voz';
  if (mediatype === 'document') return '📄 Documento';
  return '📎 Archivo';
}

async function applyAdvisorSignatureIfEnabled(instanceName: string, remoteJid: string, text: string) {
  const user = await currentUser();
  const signature = (user?.advisorSignature as string | null | undefined)?.trim();
  if (!user?.id || !signature) return text;

  const owner = await resolveInstanceOwner(instanceName);
  const userIds = Array.from(
    new Set([owner?.userId, user.effectiveId, user.ownerId, user.id].filter(Boolean) as string[]),
  );
  if (userIds.length === 0) return text;

  const sessionRow = await db.session.findFirst({
    where: {
      userId: { in: userIds },
      remoteJid,
      signatureEnabled: true,
    },
    select: { id: true },
  });

  return sessionRow ? `${signature}\n${text}` : text;
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
      userIds: [owner.userId],
      instanceName,
      remoteJid,
      aliases: opts?.remoteJidAliases,
      take: pageSize,
      skip: (page - 1) * pageSize,
    });
    return {
      success: true,
      message: 'OK',
      data,
      currentPage: page,
      nextPage: data.length === pageSize ? page + 1 : null,
    };
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
      const res = await fetch(
        `${backendUrl()}/whatsapp/baileys/send-media-channel/${encodeURIComponent(instanceName)}`,
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
      if (!res.ok) {
        const reason = await res.json().then((j) => j?.message).catch(() => null);
        return { success: false, message: typeof reason === 'string' && reason ? reason : `Error ${res.status} al enviar.`, remoteJid };
      }
      const publicUrl = await res.json().then((j) => j?.mediaUrl).catch(() => null);
      const owner = await resolveInstanceOwner(instanceName);
      if (owner?.userId) {
        await persistChatMessage({
          userId: owner.userId,
          instanceName,
          instanceType: owner.instanceType ?? undefined,
          remoteJid,
          fromMe: true,
          messageType: `${String(payload.mediatype ?? 'media')}Message`,
          content: String(payload.caption ?? payload.fileName ?? mediaFallbackLabel(payload)),
          mediaUrl: typeof publicUrl === 'string' ? publicUrl : (typeof payload.mediaUrl === 'string' ? payload.mediaUrl : null),
          messageTimestamp: new Date(),
        });
      }
      return { success: true, message: 'Enviado.', remoteJid };
    }
    const text = await applyAdvisorSignatureIfEnabled(
      instanceName,
      remoteJid,
      (payload.text ?? '').trim(),
    );
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

/* ─── Plantillas de WhatsApp Cloud (Meta) ─── */

export interface MetaTemplateOption {
  name: string;
  language: string;
  category: string;
  bodyText: string;
  paramCount: number;
}

/** Lista las plantillas aprobadas de la WABA de una instancia Meta. */
export async function listMetaTemplates(
  instanceName: string,
): Promise<{ success: boolean; templates: MetaTemplateOption[] }> {
  try {
    const res = await fetch(
      `${backendUrl()}/whatsapp/baileys/meta-templates/${encodeURIComponent(instanceName)}`,
      { headers: authHeaders(), cache: 'no-store' },
    );
    if (!res.ok) return { success: false, templates: [] };
    const json = await res.json();
    return { success: true, templates: (json?.templates ?? []) as MetaTemplateOption[] };
  } catch {
    return { success: false, templates: [] };
  }
}

/** Renderiza el cuerpo de la plantilla sustituyendo {{1}}, {{2}}… por los params. */
function renderTemplateBody(bodyText: string, params: string[]): string {
  return bodyText.replace(/\{\{\s*(\d+)\s*\}\}/g, (_, n) => params[Number(n) - 1] ?? `{{${n}}}`);
}

/** Envía una plantilla de WhatsApp Cloud y persiste el saliente en el panel. */
export async function sendMetaTemplate(
  instanceName: string,
  remoteJid: string,
  template: MetaTemplateOption,
  params: string[],
): Promise<SendMessageResult> {
  try {
    const res = await fetch(
      `${backendUrl()}/whatsapp/baileys/send-template/${encodeURIComponent(instanceName)}`,
      {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          remoteJid,
          name: template.name,
          language: template.language,
          params,
        }),
        cache: 'no-store',
      },
    );
    if (!res.ok) {
      const reason = await res.json().then((j) => j?.message).catch(() => null);
      return { success: false, message: typeof reason === 'string' && reason ? reason : `Error ${res.status} al enviar la plantilla.`, remoteJid };
    }

    const owner = await resolveInstanceOwner(instanceName);
    if (owner?.userId) {
      await persistChatMessage({
        userId: owner.userId,
        instanceName,
        instanceType: owner.instanceType ?? 'meta',
        remoteJid,
        fromMe: true,
        messageType: 'conversation',
        content: renderTemplateBody(template.bodyText, params) || `[Plantilla: ${template.name}]`,
        messageTimestamp: new Date(),
      });
    }
    return { success: true, message: 'Plantilla enviada.', remoteJid };
  } catch (err: any) {
    return { success: false, message: err?.message ?? 'Error al enviar la plantilla.', remoteJid };
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
