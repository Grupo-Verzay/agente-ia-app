'use server'

import {
    buildChatHistorySessionId,
    extractInstanceNameFromSendTextUrl,
    normalizeChatHistoryRemoteJid,
} from '@/lib/chat-history/build-session-id';
import {
    saveChatHistoryMessage,
    type ChatHistoryMessageType,
} from '@/lib/chat-history/chat-history.helper';

type OutgoingHistoryType = Exclude<ChatHistoryMessageType, 'human' | 'intention'>;

interface SendingMessagesHistory {
    save?: boolean;
    instanceName?: string;
    type?: OutgoingHistoryType;
    additionalKwargs?: Record<string, unknown>;
    responseMetadata?: Record<string, unknown>;
}

interface SendingMessages {
    url: string
    apikey: string
    remoteJid: string
    text: string
    history?: SendingMessagesHistory
};

export interface SendingMessagesResult {
    success: boolean;
    message: string;
    error?: string;
}

/**
 * Send message type text
 *
 * @param {string} url - `${urlevo}/message/sendText/${instanceName}`.
 * @param {string} apikey - 58900D6F-2692-5B41-A047-57BEF8717B26.
 * @param {string} remoteJid - 573107964105@s.whatsapp.net.
 * @param {string} text - message.
 * @returns {{ success: boolean; message: string }} - Resultado del envio.
 */
export const sendingMessages = async ({
    url,
    apikey,
    remoteJid,
    text,
    history,
}: SendingMessages): Promise<SendingMessagesResult> => {
    try {
        const normalizedRemoteJid = normalizeChatHistoryRemoteJid(remoteJid);
        const body = {
            number: normalizedRemoteJid,
            delay: 1200,
            text,
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                apikey,
            },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const errorText = `Error HTTP: ${response.status}`;
            console.error(errorText);
            return { success: false, message: errorText, error: errorText };
        }

        await response.json().catch(() => null);

        const shouldSaveHistory = history?.save !== false;
        const resolvedInstanceName =
            history?.instanceName ?? extractInstanceNameFromSendTextUrl(url);

        if (shouldSaveHistory && resolvedInstanceName) {
            try {
                await saveChatHistoryMessage({
                    sessionId: buildChatHistorySessionId(resolvedInstanceName, normalizedRemoteJid),
                    content: text,
                    type: history?.type ?? 'notification',
                    additionalKwargs: {
                        channel: 'whatsapp',
                        provider: 'evolution',
                        remoteJid: normalizedRemoteJid,
                        ...history?.additionalKwargs,
                    },
                    responseMetadata: {
                        sentAt: new Date().toISOString(),
                        requestUrl: url,
                        ...history?.responseMetadata,
                    },
                });
            } catch (historyError) {
                console.error(
                    '[CHAT_HISTORY] No se pudo guardar el historial del mensaje enviado.',
                    historyError,
                );
            }
        }

        return { success: true, message: 'Se notifico correctamente.' };

    } catch (error: any) {
        const errMsg = `Error enviando texto a ${remoteJid}: ${error.message || error}`;
        console.error(errMsg);
        return { success: false, message: errMsg, error: errMsg };
    }
};
