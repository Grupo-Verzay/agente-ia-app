'use server';

import { resolveUserAiClient, ActionResult } from './userAiconfig-actions';
import { createAiClient } from '@/app/(root)/ai-chat/helpers/createAiClient';
import type { EvolutionMessage } from '@/actions/chat-actions';

type SuggestedReplyRequest = {
  userId: string;
  messages: EvolutionMessage[];
  contactName?: string | null;
};

function extractText(msg: EvolutionMessage): string {
  const c = msg.message;
  return (
    c?.conversation ||
    c?.extendedTextMessage?.text ||
    c?.imageMessage?.caption ||
    c?.videoMessage?.caption ||
    c?.documentMessage?.caption ||
    ''
  ).trim();
}

export async function generateSuggestedReplyAction(
  req: SuggestedReplyRequest,
): Promise<ActionResult<{ reply: string }>> {
  try {
    const resolved = await resolveUserAiClient(req.userId);
    if (!resolved.success || !resolved.data) {
      return { success: false, message: resolved.message };
    }

    const { provider, model, apiKey } = resolved.data;

    // Tomar los últimos 10 mensajes como contexto
    const recent = req.messages.slice(0, 10).reverse();
    const historyLines = recent
      .map((m) => {
        const fromMe = m.key?.fromMe ?? false;
        const text = extractText(m);
        if (!text) return null;
        const role = fromMe ? 'Asesor' : req.contactName || 'Cliente';
        return `${role}: ${text}`;
      })
      .filter(Boolean)
      .join('\n');

    const system = `Eres un asistente que ayuda a asesores de ventas a redactar respuestas profesionales y amigables para WhatsApp.
Tu tarea es sugerir UNA sola respuesta corta (máximo 3 oraciones) que el asesor puede enviar al cliente.
- Responde en el mismo idioma que usa el cliente.
- Sé cordial, profesional y directo.
- NO uses asteriscos, markdown ni emojis excesivos.
- NO expliques lo que vas a hacer, simplemente escribe el texto de la respuesta lista para enviar.`;

    const ai = createAiClient(provider);
    const result = await ai.complete({
      apiKey,
      model,
      system,
      messages: [
        {
          role: 'user',
          content: `Aquí está la conversación reciente:\n\n${historyLines}\n\nSugiere una respuesta para el asesor:`,
        },
      ],
    });

    const reply = (result.content || '').trim();
    if (!reply) return { success: false, message: 'empty_reply' };

    return { success: true, message: 'ok', data: { reply } };
  } catch (error) {
    console.error('[generateSuggestedReplyAction]', error);
    return { success: false, message: 'suggestion_error' };
  }
}
