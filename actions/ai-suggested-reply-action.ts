'use server';

import { type ActionResult } from './userAiconfig-actions';
import { resolveUserAiClient } from '@/lib/cliente-de-ia.server';
import { createAiClient } from '@/app/(root)/ai-chat/helpers/createAiClient';
import type { EvolutionMessage } from '@/actions/chat-actions';
import { laCuentaDeLaAccion } from '@/lib/cuenta-de-la-accion';
import { resolveInstanceOwner } from '@/lib/chat-persistence';
import { antesDeUsarLaIa, cobrarElUsoDeIa } from '@/lib/cobro-de-ia.server';

type SuggestedReplyRequest = {
  userId: string;
  /**
   * La línea de la conversación. De ella sale la cuenta DUEÑA, que es la que
   * paga la sugerencia (ver `lib/cobro-de-ia.ts`): desde la cuenta madre, la
   * sugerencia en una conversación de Ventas la paga Ventas.
   */
  instanceName?: string | null;
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
    // Sin guarda, el `userId` del navegador elegía **la llave de OpenAI de otra
    // cuenta**: o sea gastar su consumo, y hacerlo sobre la conversación que se
    // le mandara. Es el H02 de siempre, con el id dentro de un objeto.
    //
    // Y la cuenta es la DUEÑA de la conversación —la de su línea—, no la de
    // quien mira: esa es la que usa su IA y la que paga. Pasa por la misma
    // puerta (`assertCanAccessTargetUser`): hacia abajo, nunca hacia arriba.
    const duena = req.instanceName ? await resolveInstanceOwner(req.instanceName) : null;
    const cuenta = await laCuentaDeLaAccion(duena?.userId ?? req.userId);
    if (!cuenta) return { success: false, message: 'No autorizado.' };

    // Todo uso de IA descuenta créditos de la cuenta dueña: sin créditos no se
    // pide nada, y se dice por qué.
    const permiso = await antesDeUsarLaIa(cuenta);
    if (!permiso.ok) return { success: false, message: permiso.aviso };

    const resolved = await resolveUserAiClient(cuenta);
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

    const pedido = `Aquí está la conversación reciente:\n\n${historyLines}\n\nSugiere una respuesta para el asesor:`;
    const ai = createAiClient(provider);
    const result = await ai.complete({
      apiKey,
      model,
      system,
      messages: [{ role: 'user', content: pedido }],
    });

    // La IA contestó: se cobra, entregue texto o no. DESPUÉS de tener la
    // respuesta, nunca antes.
    await cobrarElUsoDeIa(
      cuenta,
      permiso.saldo,
      { tokens: result.tokens, entrada: system + pedido, salida: result.content },
      'sugerencia de chats',
    );

    const reply = (result.content || '').trim();
    if (!reply) return { success: false, message: 'empty_reply' };

    return { success: true, message: 'ok', data: { reply } };
  } catch (error) {
    console.error('[generateSuggestedReplyAction]', error);
    return { success: false, message: 'suggestion_error' };
  }
}
