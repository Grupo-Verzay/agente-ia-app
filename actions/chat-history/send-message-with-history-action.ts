'use server';

import type { ChatHistoryMessageType } from '@/lib/chat-history/chat-history.helper';
import { sendingMessages } from '../sending-messages-actions';
import {
  resolveWhatsAppDispatcherLineByInstanceName,
  sendViaWhatsAppDispatcher,
} from '@/actions/whatsapp-dispatcher';
import { listMetaTemplates, sendMetaTemplate } from '@/actions/channel-chat-actions';

type OutgoingHistoryType = Exclude<ChatHistoryMessageType, 'human' | 'intention'>;

interface SendMessageWithHistoryInput {
  instanceName: string;
  remoteJid: string;
  message: string;
  url?: string;
  apikey?: string;
  historyType?: OutgoingHistoryType;
  additionalKwargs?: Record<string, unknown>;
  responseMetadata?: Record<string, unknown>;
  payload?: Record<string, unknown>;
}

function readPayloadValue(
  payload: Record<string, unknown>,
  keys: string[],
): string | undefined {
  for (const key of keys) {
    const value = payload[key];

    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return undefined;
}

function buildSendTextUrl(instanceName: string, baseUrl?: string): string | undefined {
  if (!baseUrl?.trim()) return undefined;

  const normalizedBaseUrl = /^https?:\/\//i.test(baseUrl)
    ? baseUrl.replace(/\/+$/, '')
    : `https://${baseUrl.replace(/\/+$/, '')}`;

  return `${normalizedBaseUrl}/message/sendText/${encodeURIComponent(instanceName)}`;
}

function cleanTemplateValue(value: unknown, fallback: string) {
  const text = typeof value === 'string' ? value.trim() : '';
  return text || fallback;
}

function stripMarkdown(value: string) {
  return value
    .replace(/\*/g, '')
    .replace(/^\s*[^A-Za-zÀ-ÿ0-9+]+/, '')
    .trim();
}

function extractLine(text: string, labels: string[]) {
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = text.match(new RegExp(`${escaped}[^:\\n]*:\\s*([^\\n]+)`, 'i'));
    if (match?.[1]?.trim()) return stripMarkdown(match[1]);
  }
  return '';
}

function inferEventType(text: string, additionalKwargs?: Record<string, unknown>) {
  const explicit = cleanTemplateValue(
    additionalKwargs?.eventType ?? additionalKwargs?.kind ?? additionalKwargs?.type,
    '',
  );
  if (explicit) return stripMarkdown(explicit);

  const lower = text.toLowerCase();
  if (lower.includes('cita') || lower.includes('agenda')) return 'Cita';
  if (lower.includes('pago') || lower.includes('comprobante') || lower.includes('cobro')) return 'Pago';
  if (lower.includes('pedido') || lower.includes('orden')) return 'Pedido';
  if (lower.includes('reclamo') || lower.includes('queja')) return 'Reclamo';
  return 'Solicitud';
}

function extractPhone(text: string, fallback: string) {
  const arrowMatch = text.match(/(?:👉|📲)\s*([+\d][\d\s().-]{7,})/);
  const raw = arrowMatch?.[1] || text.match(/(\+?\d[\d\s().-]{7,}\d)/)?.[1] || fallback;
  const clean = raw.replace(/@s\.whatsapp\.net$/i, '').trim();
  const digits = clean.replace(/\D/g, '');
  if (!digits) return fallback;
  return clean.startsWith('+') ? `+${digits}` : `+${digits}`;
}

async function sendMetaInternalNotificationTemplate(args: {
  instanceName: string;
  remoteJid: string;
  message: string;
  additionalKwargs?: Record<string, unknown>;
}) {
  const templateList = await listMetaTemplates(args.instanceName);
  const template = templateList.templates.find((item) => item.name === 'notificacion_evento');
  if (!templateList.success || !template) return null;

  const eventType = inferEventType(args.message, args.additionalKwargs);
  const name = cleanTemplateValue(
    args.additionalKwargs?.contactName ?? args.additionalKwargs?.clientName ?? args.additionalKwargs?.name,
    extractLine(args.message, ['Nombre', 'Cliente']) || 'Contacto',
  );
  const description = cleanTemplateValue(
    args.additionalKwargs?.description,
    extractLine(args.message, ['Descripción', 'Servicio', 'Fecha y hora']) || 'Evento registrado en Verzay.',
  );
  const phone = cleanTemplateValue(
    args.additionalKwargs?.contactPhone ?? args.additionalKwargs?.phone,
    extractPhone(args.message, 'Sin número'),
  );

  return sendMetaTemplate(args.instanceName, args.remoteJid, template, [
    eventType,
    stripMarkdown(name),
    stripMarkdown(description),
    phone,
  ]);
}

export async function sendMessageWithHistoryAction({
  instanceName,
  remoteJid,
  message,
  url,
  apikey,
  historyType = 'ia',
  additionalKwargs,
  responseMetadata,
  payload = {},
}: SendMessageWithHistoryInput) {
  if (!message?.trim()) {
    return { success: false, message: 'Mensaje vacio.', error: 'Mensaje vacio.' };
  }

  const dispatcher = await resolveWhatsAppDispatcherLineByInstanceName(instanceName);
  if (dispatcher && dispatcher.provider !== 'evolution') {
    if (dispatcher.provider === 'meta' && historyType === 'notification') {
      const templateResult = await sendMetaInternalNotificationTemplate({
        instanceName,
        remoteJid,
        message,
        additionalKwargs,
      });

      if (templateResult) {
        return templateResult.success
          ? templateResult
          : {
              ...templateResult,
              error: 'error' in templateResult ? templateResult.error : templateResult.message,
            };
      }
    }

    const result = await sendViaWhatsAppDispatcher({
      dispatcher,
      remoteJid,
      text: message,
      history: {
        instanceName,
        type: historyType,
        additionalKwargs,
        responseMetadata,
      },
    });

    return result.success
      ? result
      : { ...result, error: 'error' in result ? result.error : result.message };
  }

  const resolvedUrl =
    url?.trim() ||
    readPayloadValue(payload, ['url', 'sendTextUrl']) ||
    buildSendTextUrl(instanceName, readPayloadValue(payload, ['serverUrl', 'apiUrl']));
  const resolvedApiKey =
    apikey?.trim() || readPayloadValue(payload, ['apikey', 'apiKey', 'key']);

  if (!resolvedUrl || !resolvedApiKey) {
    const error = 'Faltan url y/o apikey para enviar el mensaje con historial.';
    return { success: false, message: error, error };
  }

  const result = await sendingMessages({
    url: resolvedUrl,
    apikey: resolvedApiKey,
    remoteJid,
    text: message,
    history: {
      instanceName,
      type: historyType,
      additionalKwargs,
      responseMetadata,
    },
  });

  if (!result.success) {
    return {
      ...result,
      error: result.error ?? result.message,
    };
  }

  return result;
}
