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

function shouldFormatAsInternalNotification(
  historyType: OutgoingHistoryType,
  message: string,
  additionalKwargs?: Record<string, unknown>,
) {
  if (historyType !== 'notification') return false;
  if (additionalKwargs?.internalNotification === true) return true;

  const recipient = String(additionalKwargs?.recipient ?? '').toLowerCase();
  // Un mensaje dirigido al CLIENTE nunca se reformatea como notificación interna
  // (asesor/evento). Hacerlo mutila el texto de confirmación de la cita —el
  // reformateador extrae solo nombre/descripción/teléfono y descarta el resto—
  // o, peor, envía al cliente la plantilla "Solicitud de asesor" si su mensaje
  // contiene palabras como "asesor" o "esperando tu respuesta".
  if (recipient === 'client' || recipient === 'cliente' || recipient === 'customer') return false;
  if (recipient === 'owner' || recipient === 'advisor' || recipient === 'asesor') return true;

  const source = String(additionalKwargs?.source ?? additionalKwargs?.toolType ?? '').toLowerCase();
  if (
    source.includes('notificacion_asesor') ||
    source.includes('notificacion asesor') ||
    source.includes('bookingnotificationowner') ||
    source.includes('ownernotification')
  ) {
    return true;
  }

  // Los handoffs disparados por palabras clave pueden llegar sin metadatos de
  // destinatario/origen. En ese caso el propio texto identifica que se trata de
  // una solicitud de asesor y debe normalizarse al formato interno vigente.
  return isAdvisorRequestNotification(message, additionalKwargs);
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

function isAdvisorRequestNotification(text: string, additionalKwargs?: Record<string, unknown>) {
  // Señal explícita del emisor: cuando la notificación declara su naturaleza
  // (p. ej. una cita agendada) no debe reclasificarse por coincidencia de
  // palabras clave. Evita que "Asesoría"/"asesor" en el nombre del servicio o
  // en el texto de confirmación convierta una cita en "Solicitud de asesor".
  if (typeof additionalKwargs?.advisorRequest === 'boolean') {
    return additionalKwargs.advisorRequest;
  }
  const explicitKind = String(
    additionalKwargs?.eventType ?? additionalKwargs?.kind ?? additionalKwargs?.type ?? '',
  ).toLowerCase();
  if (/\b(cita|agenda|booking|appointment|pago|pedido|orden|reclamo)\b/.test(explicitKind)) {
    return false;
  }

  const haystack = [
    text,
    additionalKwargs?.eventType,
    additionalKwargs?.kind,
    additionalKwargs?.type,
    additionalKwargs?.source,
    additionalKwargs?.reason,
  ]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toLowerCase();

  return (
    haystack.includes('asesor') ||
    haystack.includes('humano') ||
    haystack.includes('transfer') ||
    haystack.includes('handoff') ||
    haystack.includes('pausad') ||
    haystack.includes('esperando tu respuesta')
  );
}

function extractPhone(text: string, fallback: string) {
  const raw = text.match(/(\+?\d[\d\s().-]{7,}\d)/)?.[1] || fallback;
  const clean = raw.replace(/@s\.whatsapp\.net$/i, '').trim();
  const digits = clean.replace(/\D/g, '');
  if (!digits) return fallback;
  return clean.startsWith('+') ? '+' + digits : '+' + digits;
}

function buildInternalNotificationContext(message: string, additionalKwargs?: Record<string, unknown>) {
  const eventType = inferEventType(message, additionalKwargs);
  const name = cleanTemplateValue(
    additionalKwargs?.contactName ?? additionalKwargs?.clientName ?? additionalKwargs?.name,
    extractLine(message, ['Nombre', 'Cliente']) || 'Contacto',
  );
  const description = cleanTemplateValue(
    additionalKwargs?.description,
    extractLine(message, ['Descripción', 'Descripcion', 'Servicio', 'Fecha y hora']) || 'Evento registrado en Verzay.',
  );
  const phone = cleanTemplateValue(
    additionalKwargs?.contactPhone ?? additionalKwargs?.phone,
    extractPhone(message, 'Sin número'),
  );

  return {
    eventType,
    name: stripMarkdown(name),
    description: stripMarkdown(description),
    phone,
    isAdvisorRequest: isAdvisorRequestNotification(message, additionalKwargs),
  };
}

function buildInternalNotificationText(message: string, additionalKwargs?: Record<string, unknown>) {
  // Mensajes ya formateados por el emisor (p. ej. la notificación de cita del
  // agente, con fecha/servicio/especialista) se envían tal cual en canales de
  // texto libre; reformatearlos descartaría esos detalles y podría reducirlos a
  // la plantilla genérica de "Solicitud de asesor".
  if (additionalKwargs?.preformatted === true) {
    return message;
  }

  const context = buildInternalNotificationContext(message, additionalKwargs);

  if (context.isAdvisorRequest) {
    return [
      '\u{1F64B} *Solicitud de asesor*',
      '',
      '\u{1F464} *Nombre:* ' + context.name,
      '\u{1F4DD} *Descripción:* Este contacto está esperando tu respuesta en el chat.',
      '',
      '\u{1F4F1} *Contacto:*',
      '\u{1F4F2} ' + context.phone,
      '--------•--------•--------•--------',
      'Evento registrado',
    ].join('\n');
  }

  return [
    '\u{2705} *Nuevo aviso: ' + context.eventType + '*',
    '',
    '\u{1F464} *Nombre:* ' + context.name,
    '\u{1F4DD} *Descripción:* ' + context.description,
    '',
    '\u{1F4F1} *Contacto:*',
    '\u{1F4F2} ' + context.phone,
    '--------•--------•--------•--------',
    'Evento registrado',
  ].join('\n');
}

async function sendMetaInternalNotificationTemplate(args: {
  instanceName: string;
  remoteJid: string;
  message: string;
  additionalKwargs?: Record<string, unknown>;
}) {
  const templateList = await listMetaTemplates(args.instanceName);
  const advisorTemplate = templateList.templates.find((item) => item.name === 'solicitud_asesor');
  const eventTemplate = templateList.templates.find((item) => item.name === 'notificacion_evento');
  const useAdvisorTemplate = isAdvisorRequestNotification(args.message, args.additionalKwargs);
  const template = useAdvisorTemplate && advisorTemplate ? advisorTemplate : eventTemplate;
  if (!templateList.success || !template) return null;

  const eventType = inferEventType(args.message, args.additionalKwargs);
  const name = cleanTemplateValue(
    args.additionalKwargs?.contactName ?? args.additionalKwargs?.clientName ?? args.additionalKwargs?.name,
    extractLine(args.message, ['Nombre', 'Cliente']) || 'Contacto',
  );
  const description = cleanTemplateValue(
    args.additionalKwargs?.description,
    extractLine(args.message, ['Descripción', 'Descripcion', 'Servicio', 'Fecha y hora']) || 'Evento registrado en Verzay.',
  );
  const phone = cleanTemplateValue(
    args.additionalKwargs?.contactPhone ?? args.additionalKwargs?.phone,
    extractPhone(args.message, 'Sin número'),
  );

  if (useAdvisorTemplate && advisorTemplate) {
    return sendMetaTemplate(args.instanceName, args.remoteJid, advisorTemplate, [
      stripMarkdown(name),
      phone,
    ]);
  }

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

  const formatInternalNotification = shouldFormatAsInternalNotification(
    historyType,
    message,
    additionalKwargs,
  );

  const outgoingMessage =
    formatInternalNotification
      ? buildInternalNotificationText(message, additionalKwargs)
      : message;

  const dispatcher = await resolveWhatsAppDispatcherLineByInstanceName(instanceName);
  if (dispatcher && dispatcher.provider !== 'evolution') {
    if (dispatcher.provider === 'meta' && formatInternalNotification) {
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
      text: outgoingMessage,
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
    text: outgoingMessage,
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
