'use server';

import {
    saveChatHistoryMessage,
    type ChatHistoryMessageType,
} from '@/lib/chat-history/chat-history.helper';

interface SaveChatHistoryActionInput {
    sessionId: string;
    content: string;
    type: ChatHistoryMessageType;
    additionalKwargs?: Record<string, unknown>;
    responseMetadata?: Record<string, unknown>;
}

export async function saveChatHistoryAction({
    sessionId,
    content,
    type,
    additionalKwargs,
    responseMetadata,
}: SaveChatHistoryActionInput) {
    await saveChatHistoryMessage({
        sessionId,
        content,
        type,
        additionalKwargs,
        responseMetadata,
    });

    return { success: true };
}