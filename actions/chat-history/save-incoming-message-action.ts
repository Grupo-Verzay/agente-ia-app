'use server';

import { buildChatHistorySessionId } from '@/lib/chat-history/build-session-id';
import { saveChatHistoryMessage } from '@/lib/chat-history/chat-history.helper';
import { pickExplicitWhatsAppPhoneJid, pickPreferredWhatsAppRemoteJid } from '@/lib/whatsapp-jid';

interface SaveIncomingMessageActionInput {
  instanceName: string;
  remoteJid: string;
  remoteJidAlt?: string;
  senderPn?: string;
  message: string;
  additionalKwargs?: Record<string, unknown>;
  responseMetadata?: Record<string, unknown>;
}

export async function saveIncomingMessageAction({
  instanceName,
  remoteJid,
  remoteJidAlt,
  senderPn,
  message,
  additionalKwargs,
  responseMetadata,
}: SaveIncomingMessageActionInput) {
  const preferredRemoteJid =
    pickExplicitWhatsAppPhoneJid([remoteJidAlt, senderPn, remoteJid]) ||
    pickPreferredWhatsAppRemoteJid([remoteJidAlt, senderPn, remoteJid]) ||
    remoteJid;
  const sessionId = buildChatHistorySessionId(instanceName, preferredRemoteJid);

  await saveChatHistoryMessage({
    sessionId,
    content: message,
    type: 'human',
    additionalKwargs: {
      remoteJid,
      remoteJidAlt,
      senderPn,
      ...additionalKwargs,
    },
    responseMetadata,
  });

  return { success: true };
}
