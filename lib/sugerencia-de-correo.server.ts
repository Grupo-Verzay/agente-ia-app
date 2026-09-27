import "server-only";

import { resolveUserAiClient } from "@/lib/cliente-de-ia.server";
import { createAiClient } from "@/app/(root)/ai-chat/helpers/createAiClient";

/**
 * La sugerencia de respuesta de un CORREO, con la IA de la cuenta.
 *
 * Es la misma que la de Chats (`generateSuggestedReplyAction`): la misma llave
 * —la de la cuenta por la que se trabaja, resuelta por `resolveUserAiClient`,
 * con su puerta de siempre— y el mismo cliente. Lo que cambia es la
 * instrucción: un correo no es un WhatsApp, lleva saludo y despedida y puede
 * ser más largo que tres frases.
 *
 * Vive aparte de `actions/correo-actions.ts` por dos motivos: la clave de IA no
 * puede pasar por un fichero `'use server'` (ver `lib/cliente-de-ia.server.ts`),
 * y así el banco la finge sin arrastrar los clientes de OpenAI y Google.
 */
export const INSTRUCCION_DEL_CORREO = `Eres un asistente que ayuda a redactar respuestas a correos electrónicos de trabajo.
Escribe UNA sola respuesta lista para enviar al remitente, en el mismo idioma en que está escrito el correo.
- Empieza con un saludo breve y termina con una despedida corta, sin firma ni nombre (la firma la pone la plataforma).
- Sé cordial, claro y concreto: responde a lo que pide el correo, sin inventar datos, precios ni fechas que no estén en él.
- Si falta información para responder, pídela con amabilidad.
- NO uses markdown ni asteriscos. NO expliques lo que vas a hacer: escribe solo el texto de la respuesta.`;

export async function pedirSugerenciaALaIa(
    cuentaId: string,
    correo: { de: string; asunto: string; texto: string },
    borrador: string,
): Promise<{ ok: true; texto: string } | { ok: false; motivo: string }> {
    const resuelto = await resolveUserAiClient(cuentaId);
    if (!resuelto.success || !resuelto.data) {
        return { ok: false, motivo: resuelto.message || "La cuenta no tiene una IA configurada." };
    }
    const { provider, model, apiKey } = resuelto.data;
    const pedido = [
        `De: ${correo.de}`,
        `Asunto: ${correo.asunto}`,
        "",
        correo.texto,
        "",
        borrador.trim() ? `Lo que el usuario ya empezó a escribir (respétalo y termina la respuesta a partir de ahí):\n${borrador.trim()}` : "",
        "Escribe la respuesta:",
    ].join("\n");
    const r = await createAiClient(provider).complete({
        apiKey,
        model,
        system: INSTRUCCION_DEL_CORREO,
        messages: [{ role: "user", content: pedido }],
    });
    const texto = (r.content || "").trim();
    return texto ? { ok: true, texto } : { ok: false, motivo: "La IA no devolvió ninguna respuesta." };
}
