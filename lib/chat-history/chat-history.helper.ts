'use server';

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

export type ChatHistoryMessageType =
  | 'human'
  | 'ia'
  | 'system'
  | 'workflow'
  | 'notification'
  | 'intention';

interface SaveMessageInput {
  sessionId: string;
  content: string;
  type: ChatHistoryMessageType;
  additionalKwargs?: Record<string, unknown>;
  responseMetadata?: Record<string, unknown>;
}

interface RegisterExecutedIntentionInput {
  sessionId: string;
  name: string;
  tipo: string;
}

export async function saveChatHistoryMessage({
  sessionId,
  content,
  type,
  additionalKwargs = {},
  responseMetadata = {},
}: SaveMessageInput): Promise<void> {
  if (!sessionId?.trim()) {
    throw new Error('sessionId es requerido para guardar historial.');
  }

  if (!content?.trim()) {
    return;
  }

  const messageJson = {
    type,
    content,
    additional_kwargs: additionalKwargs as Prisma.InputJsonObject,
    response_metadata: responseMetadata as Prisma.InputJsonObject,
  } as Prisma.InputJsonObject;

  await db.n8nChatHistory.create({
    data: {
      sessionId,
      message: messageJson,
    },
  });
}

export async function getChatHistory(sessionId: string, take = 10): Promise<string[]> {
  if (!sessionId?.trim()) return [];

  const messages = await db.n8nChatHistory.findMany({
    where: { sessionId },
    orderBy: { id: 'desc' },
    take,
  });

  return messages
    .reverse()
    .map((msg) => {
      const message = msg.message as { content?: string } | null;
      return message?.content ?? '';
    })
    .filter(Boolean);
}

export async function registerExecutedIntention({
  sessionId,
  name,
  tipo,
}: RegisterExecutedIntentionInput): Promise<void> {
  if (!sessionId?.trim() || !name?.trim()) return;

  const message = {
    type: 'intention',
    name,
    tipo,
    executedAt: new Date().toISOString(),
  };

  await db.n8nChatHistory.create({
    data: {
      sessionId,
      message,
    },
  });
}

export async function hasIntentionBeenExecuted(
  sessionId: string,
  name: string,
): Promise<boolean> {
  if (!sessionId?.trim() || !name?.trim()) return false;

  const executed = await db.n8nChatHistory.findMany({
    where: {
      sessionId,
      message: {
        path: ['type'],
        equals: 'intention',
      },
    },
  });

  if (!executed.length) return false;

  return executed.some((record) => {
    const msg = record.message as { type?: string; name?: string };
    return msg.type === 'intention' && msg.name === name;
  });
}
