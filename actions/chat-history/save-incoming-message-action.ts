'use server';

import { buildChatHistorySessionId } from '@/lib/chat-history/build-session-id';
import { saveChatHistoryMessage } from '@/lib/chat-history/chat-history.helper';
import { persistChatMessage, resolveInstanceOwner } from '@/lib/chat-persistence';
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

  const instanceOwner = await resolveInstanceOwner(instanceName);
  if (instanceOwner?.userId) {
    await persistChatMessage({
      userId: instanceOwner.userId,
      instanceName,
      instanceType: instanceOwner.instanceType,
      remoteJid,
      remoteJidAlt,
      senderPn,
      messageId:
        typeof responseMetadata?.messageId === 'string'
          ? responseMetadata.messageId
          : typeof additionalKwargs?.messageId === 'string'
            ? additionalKwargs.messageId
            : null,
      fromMe: false,
      pushName:
        typeof additionalKwargs?.pushName === 'string'
          ? additionalKwargs.pushName
          : null,
      messageType:
        typeof additionalKwargs?.messageType === 'string'
          ? additionalKwargs.messageType
          : 'conversation',
      content: message,
      raw: {
        additionalKwargs: additionalKwargs ?? {},
        responseMetadata: responseMetadata ?? {},
      } as any,
      messageTimestamp:
        typeof responseMetadata?.messageTimestamp === 'number' ||
        typeof responseMetadata?.messageTimestamp === 'string'
          ? responseMetadata.messageTimestamp
          : typeof additionalKwargs?.messageTimestamp === 'number' ||
              typeof additionalKwargs?.messageTimestamp === 'string'
            ? additionalKwargs.messageTimestamp
            : null,
    });
  }

  return { success: true };
}
