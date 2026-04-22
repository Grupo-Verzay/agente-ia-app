'use server';

import {
    buildChatHistorySessionId,
    normalizeChatHistoryRemoteJid,
} from '@/lib/chat-history/build-session-id';
import { saveChatHistoryMessage } from '@/lib/chat-history/chat-history.helper';

type MediaType = 'image' | 'video' | 'document' | 'audio';

interface SendingImageMessages {
    /** URL base de Evolution API con instancia, ej: https://evo.host.com/message/sendMedia/instancia-107 */
    url: string;
    apikey: string;
    remoteJid: string;
    mediaUrl: string;
    caption?: string;
    mediaType?: MediaType;
    instanceName?: string;
}

export interface SendingImageResult {
    success: boolean;
    message: string;
    error?: string;
}

function getMimeType(mediaType: MediaType, mediaUrl: string): string {
    if (mediaType === 'video') return 'video/mp4';
    if (mediaType === 'audio') return 'audio/mpeg';
    if (mediaType === 'document') return 'application/pdf';
    // image: intentar inferir de la URL
    const lower = mediaUrl.toLowerCase();
    if (lower.includes('.png')) return 'image/png';
    if (lower.includes('.webp')) return 'image/webp';
    if (lower.includes('.gif')) return 'image/gif';
    return 'image/jpeg';
}

/**
 * Envía un mensaje con imagen/media a WhatsApp vía Evolution API.
 *
 * @param url  - `${evoBaseUrl}/message/sendMedia/${instanceName}`
 * @param apikey - API key de la instancia Evolution
 * @param remoteJid - Número destino: 573107964105@s.whatsapp.net
 * @param mediaUrl  - URL pública de la imagen/archivo
 * @param caption   - Texto opcional debajo de la imagen
 * @param mediaType - 'image' | 'video' | 'document' | 'audio' (default: 'image')
 */
export const sendingImageMessage = async ({
    url,
    apikey,
    remoteJid,
    mediaUrl,
    caption = '',
    mediaType = 'image',
    instanceName,
}: SendingImageMessages): Promise<SendingImageResult> => {
    try {
        const normalizedRemoteJid = normalizeChatHistoryRemoteJid(remoteJid);

        const body = {
            number: normalizedRemoteJid,
            mediatype: mediaType,
            mimetype: getMimeType(mediaType, mediaUrl),
            caption,
            media: mediaUrl,
            fileName: mediaUrl.split('/').pop()?.split('?')[0] ?? 'archivo',
            delay: 800,
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
            const errorText = `Error HTTP al enviar media: ${response.status}`;
            console.error(errorText);
            return { success: false, message: errorText, error: errorText };
        }

        await response.json().catch(() => null);

        if (instanceName) {
            try {
                await saveChatHistoryMessage({
                    sessionId: buildChatHistorySessionId(instanceName, normalizedRemoteJid),
                    content: caption || `[${mediaType}] ${mediaUrl}`,
                    type: 'ia',
                    additionalKwargs: {
                        channel: 'whatsapp',
                        provider: 'evolution',
                        remoteJid: normalizedRemoteJid,
                        mediaUrl,
                        mediaType,
                    },
                    responseMetadata: {
                        sentAt: new Date().toISOString(),
                        requestUrl: url,
                    },
                });
            } catch (historyError) {
                console.error('[CHAT_HISTORY] No se pudo guardar historial de media.', historyError);
            }
        }

        return { success: true, message: 'Imagen enviada correctamente.' };
    } catch (error: any) {
        const errMsg = `Error enviando imagen a ${remoteJid}: ${error.message || error}`;
        console.error(errMsg);
        return { success: false, message: errMsg, error: errMsg };
    }
};
