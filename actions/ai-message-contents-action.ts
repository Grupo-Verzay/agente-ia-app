'use server';

import { db } from '@/lib/db';
import { buildChatHistorySessionIdCandidates } from '@/lib/chat-history/build-session-id';

export async function getAiMessageContentsAction(
  instanceName: string,
  remoteJid: string,
): Promise<Set<string>> {
  if (!instanceName || !remoteJid) return new Set();

  try {
    const sessionIds = buildChatHistorySessionIdCandidates(instanceName, remoteJid);

    const rows = await db.n8nChatHistory.findMany({
      where: { sessionId: { in: sessionIds } },
      select: { message: true },
    });

    const aiContents = new Set<string>();
    for (const row of rows) {
      const msg = row.message as { type?: string; content?: string } | null;
      if (msg?.type === 'ai' && typeof msg.content === 'string' && msg.content.trim()) {
        aiContents.add(msg.content.trim());
      }
    }

    return aiContents;
  } catch {
    return new Set();
  }
}
