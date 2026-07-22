'use server';

import { db } from '@/lib/db';
import { currentUser } from '@/lib/auth';
import { resolveUserAiClient } from '@/actions/userAiconfig-actions';

type ChatMessage = { role: 'user' | 'assistant'; content: string };

export async function simulateChatMessage(input: {
    promptId: string;
    messages: ChatMessage[];
}): Promise<{ ok: true; reply: string } | { ok: false; error: string }> {
    const user = await currentUser();
    if (!user) return { ok: false, error: 'No autenticado.' };

    const { promptId, messages } = input;

    const agentPrompt = await db.agentPrompt.findUnique({
        where: { id: promptId, userId: user.effectiveId },
        select: { promptText: true, businessName: true },
    });

    if (!agentPrompt?.promptText?.trim()) {
        return { ok: false, error: 'El agente no tiene un prompt configurado. Completa el perfil del negocio y guarda.' };
    }

    const systemKey = process.env.OPENAI_SYSTEM_API_KEY ?? '';
    const aiClient = await resolveUserAiClient(user.effectiveId);
    // Limpiar caracteres inválidos (viñetas •, emojis, espacios, saltos de línea)
    // que se cuelan al copiar la key: los headers HTTP solo admiten ASCII
    // imprimible, y esos caracteres rompían el fetch con un TypeError de ByteString
    // que se veía como "Error de red".
    // Prioridad: la key propia del cliente; la del sistema solo como respaldo.
    const apiKey = (aiClient.data?.apiKey || systemKey || '').trim().replace(/[^\x21-\x7E]/g, '');
    if (!apiKey) {
        return { ok: false, error: 'No tienes una API Key de OpenAI configurada (o tiene caracteres inválidos). Ve a Perfil → Api Key IA.' };
    }

    try {
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'gpt-4o',
                temperature: 0.7,
                max_tokens: 1024,
                messages: [
                    { role: 'system', content: agentPrompt.promptText },
                    ...messages,
                ],
            }),
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            return { ok: false, error: `Error OpenAI ${res.status}: ${err?.error?.message ?? 'desconocido'}` };
        }

        const json = await res.json();
        const reply = json.choices?.[0]?.message?.content ?? '';
        if (!reply) return { ok: false, error: 'El agente no devolvió respuesta. Intenta de nuevo.' };

        return { ok: true, reply };
    } catch (err) {
        return { ok: false, error: `Error de red: ${(err as any)?.message ?? 'desconocido'}` };
    }
}
