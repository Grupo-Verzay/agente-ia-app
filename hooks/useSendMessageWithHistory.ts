'use client';

import { useTransition } from 'react';
import { sendMessageWithHistoryAction } from '@/actions/chat-history/send-message-with-history-action';

/**
 * Sin `url` ni `apikey`: la clave del servidor no está en el navegador. Se
 * nombra la línea y `sendMessageWithHistoryAction` la resuelve en el servidor
 * después de comprobar que quien manda alcanza esa línea.
 */
interface UseSendMessageWithHistoryParams {
    instanceName: string;
    remoteJid?: string;
    payload?: Record<string, unknown>;
    additionalKwargs?: Record<string, unknown>;
    responseMetadata?: Record<string, unknown>;
}

export function useSendMessageWithHistory({
    instanceName,
    remoteJid,
    payload = {},
    additionalKwargs = {},
    responseMetadata = {},
}: UseSendMessageWithHistoryParams) {
    const [isPending, startTransition] = useTransition();

    const sendMessage = (
        message: string,
        options?: {
            historyType?: 'ia' | 'workflow' | 'notification' | 'system';
            remoteJid?: string;
            additionalKwargs?: Record<string, unknown>;
            responseMetadata?: Record<string, unknown>;
            onSuccess?: () => void;
            onError?: (error: string) => void;
        },
    ) => {
        const targetRemoteJid = options?.remoteJid?.trim() || remoteJid?.trim();

        if (!instanceName?.trim()) {
            options?.onError?.('Faltan datos de configuracion para enviar el mensaje.');
            return;
        }

        if (!targetRemoteJid) {
            options?.onError?.('remoteJid es requerido para enviar el mensaje.');
            return;
        }

        startTransition(async () => {
            try {
                const result = await sendMessageWithHistoryAction({
                    instanceName,
                    remoteJid: targetRemoteJid,
                    message,
                    historyType: options?.historyType ?? 'ia',
                    payload,
                    additionalKwargs: {
                        ...additionalKwargs,
                        ...options?.additionalKwargs,
                    },
                    responseMetadata: {
                        ...responseMetadata,
                        ...options?.responseMetadata,
                    },
                });

                if (result?.success === false) {
                    // El fallo llega unas veces en `error` y otras en `message`,
                    // y no siempre como texto.
                    const fallo = result as { error?: unknown; message?: unknown };
                    const motivo =
                        (typeof fallo.error === 'string' && fallo.error) ||
                        (typeof fallo.message === 'string' && fallo.message) ||
                        'No se pudo enviar el mensaje.';
                    options?.onError?.(motivo);
                    return;
                }

                options?.onSuccess?.();
            } catch (error) {
                options?.onError?.(
                    error instanceof Error ? error.message : 'Ocurrio un error al enviar.',
                );
            }
        });
    };

    return {
        sendMessage,
        isPending,
    };
}
