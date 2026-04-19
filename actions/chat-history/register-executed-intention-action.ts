'use server';

import { registerExecutedIntention } from '@/lib/chat-history/chat-history.helper';

interface RegisterExecutedIntentionActionInput {
    sessionId: string;
    name: string;
    tipo: string;
}

export async function registerExecutedIntentionAction({
    sessionId,
    name,
    tipo,
}: RegisterExecutedIntentionActionInput) {
    await registerExecutedIntention({
        sessionId,
        name,
        tipo,
    });

    return { success: true };
}