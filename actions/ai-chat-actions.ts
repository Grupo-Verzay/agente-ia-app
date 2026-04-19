"use server";

import { AppContextSnapshot, ChatMessage } from "@/types/ai-assistence-chat";
import { ActionResult, resolveUserAiClient } from "./userAiconfig-actions";
import { currentUser } from "@/lib/auth";
import { toAiMessages } from "@/app/(root)/ai-chat/helpers/toAiMessages";
import { createAiClient } from "@/app/(root)/ai-chat/helpers/createAiClient";
import { getPromptAssistence } from "./ai-actions";

export type ChatRequest = {
    messages: ChatMessage[];
    context: AppContextSnapshot;
};

export type ChatResponse = {
    message: ChatMessage;
    suggestions?: string[];
};

async function buildSystemPrompt(ctx: AppContextSnapshot) {
    let AI_SUPPORT_KB = "";

    try {
        const kb = await getPromptAssistence();
        AI_SUPPORT_KB = (kb ?? "").trim();
    } catch (error) {
        console.error("Error al obtener el KB de soporte:", error);
        AI_SUPPORT_KB = "";
    }

    return `
Eres un asistente de soporte interno para Verzay app.

OBJETIVO:
Resolver dudas sobre el uso y comportamiento de la aplicación, guiando al usuario paso a paso.

REGLAS:
- Prioriza el contexto actual (ruta/params/search) para orientar la respuesta.
- Puedes guiar a otras pantallas si es mejor.
- NO inventes pantallas, botones, campos o flujos.
- Usa la BASE DE CONOCIMIENTO (KB) como fuente principal.
- Si la respuesta NO está en la KB: pide 1 dato puntual o indica qué falta.
- Responde en español, claro y directo.

FORMATO OBLIGATORIO DE RESPUESTA:
1) Respuesta breve (1-2 líneas)
2) Pasos numerados
3) Ruta sugerida: "Ruta: /xxx/yyy" (si aplica)
4) Nota de verificación (si aplica: permisos/rol/estado)

CONTEXTO ACTUAL:
pathname: ${ctx.pathname}
params: ${JSON.stringify(ctx.params)}
search: ${JSON.stringify(ctx.search)}

BASE DE CONOCIMIENTO (KB):
<<<KB_START>>>
${AI_SUPPORT_KB}
<<<KB_END>>>

- NO repitas encabezados internos como "Elementos del extra", "Regla/parámetro", ni listas numeradas del documento si no son parte de una instrucción al usuario final.
`.trim();
}

export async function sendChatAction(
    req: ChatRequest
): Promise<ActionResult<ChatResponse>> {
    try {
        const user = await currentUser();
        if (!user?.id) return { success: false, message: "auth_required" };

        const resolved = await resolveUserAiClient(user.id);
        if (!resolved.success || !resolved.data) return resolved as any;

        const { provider, model, apiKey } = resolved.data;

        const ai = createAiClient(provider);
        const system = await buildSystemPrompt(req.context);
        const msgs = toAiMessages(req.messages);

        const result = await ai.complete({
            apiKey,
            model,
            system,
            messages: msgs,
        });

        const content =
            (result.content || "").trim() ||
            "No pude generar una respuesta. ¿Puedes reformular tu pregunta?";

        return {
            success: true,
            message: "ok",
            data: {
                message: {
                    id: crypto.randomUUID(),
                    role: "assistant",
                    content,
                    createdAt: Date.now(),
                },
            },
        };
    } catch {
        return { success: false, message: "chat_action_error" };
    }
}