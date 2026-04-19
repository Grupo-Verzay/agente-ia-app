'use server';

import type { ChatHistoryMessageType } from '@/lib/chat-history/chat-history.helper';
import { sendMessageWithHistoryAction } from './send-message-with-history-action';

type OutgoingHistoryType = Exclude<ChatHistoryMessageType, 'human' | 'intention'>;

interface SendMessageBlocksWithHistoryInput {
  instanceName: string;
  remoteJid: string;
  message: string;
  url?: string;
  apikey?: string;
  historyType?: OutgoingHistoryType;
  additionalKwargs?: Record<string, unknown>;
  responseMetadata?: Record<string, unknown>;
  payload?: Record<string, unknown>;
  delayMs?: number;
}

export async function sendMessageBlocksWithHistoryAction({
  instanceName,
  remoteJid,
  message,
  url,
  apikey,
  historyType = 'ia',
  additionalKwargs,
  responseMetadata,
  payload = {},
  delayMs = 300,
}: SendMessageBlocksWithHistoryInput) {
  const blocks = message
    .split('\n\n')
    .map((block) => block.trim())
    .filter(Boolean);

  if (!blocks.length) {
    return {
      success: false,
      message: 'No hay bloques para enviar.',
      error: 'No hay bloques para enviar.',
    };
  }

  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    const result = await sendMessageWithHistoryAction({
      instanceName,
      remoteJid,
      message: block,
      url,
      apikey,
      historyType,
      additionalKwargs: {
        blockIndex: index,
        blockCount: blocks.length,
        ...additionalKwargs,
      },
      responseMetadata,
      payload,
    });

    if (!result.success) {
      return {
        success: false,
        message: result.message,
        error: result.error ?? result.message,
        failedBlockIndex: index,
      };
    }

    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return { success: true };
}
