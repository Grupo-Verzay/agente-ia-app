'use client';

import { useTransition } from 'react';
import { sendMessageWithHistoryAction } from '@/actions/chat-history/send-message-with-history-action';

interface UseSendMessageWithHistoryParams {
    instanceName: string;
    url: string;
    apikey: string;
    remoteJid?: string;
    payload?: Record<string, unknown>;
    additionalKwargs?: Record<string, unknown>;
    responseMetadata?: Record<string, unknown>;
}

export function useSendMessageWithHistory({
    instanceName,
    url,
    apikey,
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

        if (!instanceName?.trim() || !url?.trim() || !apikey?.trim()) {
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
                    url,
                    apikey,
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
                    options?.onError?.(
                        result.error ?? result.message ?? 'No se pudo enviar el mensaje.',
                    );
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
