"use server";

import { currentUser } from "@/lib/auth";
import type { ChatMessage } from "@/types/ai-assistence-chat";
import { toAiMessages } from "@/app/(root)/ai-chat/helpers/toAiMessages";
import { createAiClient } from "@/app/(root)/ai-chat/helpers/createAiClient";
import { resolveUserAiClient, type ActionResult } from "./userAiconfig-actions";

export type AgentPromptChatContext = {
  activeSection: string;
  sectionDraft?: string;
  promptPreview?: string;
};

export type AgentPromptChatRequest = {
  messages: ChatMessage[];
  context: AgentPromptChatContext;
};

export type AgentPromptChatResponse = {
  message: ChatMessage;
};

function limitText(value: string | undefined, max: number) {
  const text = String(value ?? "").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n...[contenido recortado]`;
}

function buildAgentPromptAssistantSystem(ctx: AgentPromptChatContext) {
  return `
Eres un copiloto experto para configurar el Agente IA de Verzay.

OBJETIVO:
Ayudar al usuario a crear mejores prompts, formulas conversacionales, reglas, respuestas, preguntas frecuentes, capturas de datos y flujos de atencion.

REGLAS:
- Responde en espanol claro, practico y breve.
- Trabaja con el contexto del modulo Agente IA.
- Si el usuario pide mejorar un texto, entrega una version lista para pegar.
- Si el usuario pide una formula, usa estructuras concretas: objetivo, condicion, respuesta, excepcion y siguiente paso.
- Si detectas riesgo de respuesta fria, robotica o larga, propone una version mas natural para WhatsApp.
- No inventes datos del negocio que no aparecen en el contexto. Si falta un dato clave, pide solo ese dato.
- No cambies el sentido comercial del negocio sin confirmarlo.
- Evita tecnicismos innecesarios.
- Cuando sea util, entrega el resultado en bloques copiables.

SECCION ACTUAL:
${ctx.activeSection}

BORRADOR DE LA SECCION:
<<<SECTION_DRAFT>>>
${limitText(ctx.sectionDraft, 5000)}
<<<END_SECTION_DRAFT>>>

PROMPT COMPLETO ACTUAL:
<<<PROMPT_PREVIEW>>>
${limitText(ctx.promptPreview, 9000)}
<<<END_PROMPT_PREVIEW>>>
`.trim();
}

export async function sendAgentPromptChatAction(
  req: AgentPromptChatRequest
): Promise<ActionResult<AgentPromptChatResponse>> {
  try {
    const user = await currentUser();
    if (!user?.id) return { success: false, message: "auth_required" };

    const resolved = await resolveUserAiClient(user.id);
    if (!resolved.success || !resolved.data) {
      return { success: false, message: resolved.message || "ai_config_missing" };
    }

    const { provider, model, apiKey } = resolved.data;
    const ai = createAiClient(provider);

    const result = await ai.complete({
      apiKey,
      model,
      system: buildAgentPromptAssistantSystem(req.context),
      messages: toAiMessages(req.messages).slice(-12),
    });

    const content =
      (result.content || "").trim() ||
      "No pude generar una respuesta. Dame un poco mas de contexto y lo intento de nuevo.";

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
  } catch (error) {
    console.error("[sendAgentPromptChatAction]", error);
    return { success: false, message: "agent_prompt_chat_error" };
  }
}
