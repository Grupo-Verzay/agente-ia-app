'use server';

import { db } from '@/lib/db';
import { currentUser } from '@/lib/auth';
import { resolveUserAiClient } from '@/lib/cliente-de-ia.server';
import { pedirAOpenAiCobrando } from '@/lib/openai-cobrado.server';

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

    // El simulador lo PAGA la cuenta en la que se trabaja: sin créditos no se
    // llama a OpenAI y se dice. Ver `lib/openai-cobrado.server.ts`.
    const pedido = await pedirAOpenAiCobrando(user.effectiveId, "simulador de chat", apiKey, {
        model: 'gpt-4o',
        temperature: 0.7,
        max_tokens: 1024,
        messages: [
            { role: 'system', content: agentPrompt.promptText },
            ...messages,
        ],
    });
    if (!pedido.ok) return { ok: false, error: pedido.error };
    const reply = pedido.json?.choices?.[0]?.message?.content ?? '';
    if (!reply) return { ok: false, error: 'El agente no devolvió respuesta. Intenta de nuevo.' };
    return { ok: true, reply };
}
