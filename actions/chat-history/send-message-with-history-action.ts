'use server';

import type { ChatHistoryMessageType } from '@/lib/chat-history/chat-history.helper';
import { sendingMessages } from '../sending-messages-actions';

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
