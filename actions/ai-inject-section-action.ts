"use server";

import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { createAiClient } from "@/app/(root)/ai-chat/helpers/createAiClient";
import { resolveUserAiClient, type ActionResult } from "./userAiconfig-actions";
import {
  patchTrainingSection,
  patchFaqSection,
  patchProductsSection,
  patchExtrasSection,
  patchManagementSection,
} from "./system-prompt-actions";

const INJECTABLE_SECTION_KEYS = ["training", "faq", "products", "extras", "management"] as const;
export type InjectableSectionKey = typeof INJECTABLE_SECTION_KEYS[number];

const INJECT_SECTION_LABELS: Record<InjectableSectionKey, string> = {
  training: "INICIO",
  faq: "PREGUNTAS",
  products: "PRODUCTOS",
  extras: "EXTRAS",
  management: "GESTIÓN",
};

export type AnalyzedInstruction = {
  sectionKey: InjectableSectionKey;
  sectionLabel: string;
  title: string;
  mainMessage: string;
};

function buildAnalyzeSystemPrompt() {
  return `Eres un asistente experto en configurar agentes de atención al cliente por WhatsApp.

SECCIONES DISPONIBLES:
- "training": Flujo de inicio, bienvenida, saludo, presentación, apertura de conversación.
- "faq": Preguntas frecuentes y sus respuestas. Horarios, medios de pago, envíos, garantías, devoluciones, ubicación, requisitos, descuentos, cómo comprar, etc.
- "products": Catálogo de productos o servicios. Nombres, descripciones, precios, características.
- "extras": Información complementaria, políticas especiales, objeciones, condiciones, restricciones, casos especiales que el agente debe manejar de forma puntual.
- "management": Cierre de ventas, seguimiento post-venta, escalación a agente humano, quejas, reclamos.

TAREA:
Analiza el texto del usuario y extrae:
1. sectionKey: la sección más adecuada (solo: training, faq, products, extras, management)
2. title: título corto y descriptivo (máx 50 chars, sin puntuación final)
3. mainMessage: la respuesta que el agente debe dar (clara, natural para WhatsApp, máx 300 chars)

IMPORTANTE: Responde ÚNICAMENTE con JSON válido, sin texto adicional ni markdown:
{"sectionKey":"faq","title":"Medios de pago","mainMessage":"Aceptamos transferencia bancaria, tarjeta débito/crédito y Nequi. Si tienes alguna duda con tu pago, con gusto te ayudo."}`.trim();
}

export async function analyzeInstructionAction(
  userText: string
): Promise<ActionResult<AnalyzedInstruction>> {
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
      system: buildAnalyzeSystemPrompt(),
      messages: [{ role: "user" as const, content: userText.trim() }],
    });

    const raw = (result.content || "").trim();
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { success: false, message: "No se pudo analizar. Sé más específico sobre qué debe responder el agente." };
    }

    let parsed: { sectionKey?: string; title?: string; mainMessage?: string };
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      return { success: false, message: "Error al interpretar la respuesta de la IA." };
    }

    if (!parsed.sectionKey || !INJECTABLE_SECTION_KEYS.includes(parsed.sectionKey as InjectableSectionKey)) {
      return { success: false, message: "No se pudo determinar la sección correcta." };
    }

    const sectionKey = parsed.sectionKey as InjectableSectionKey;

    return {
      success: true,
      message: "ok",
      data: {
        sectionKey,
        sectionLabel: INJECT_SECTION_LABELS[sectionKey],
        title: (parsed.title || "Sin título").slice(0, 50),
        mainMessage: parsed.mainMessage || "",
      },
    };
  } catch (error) {
    console.error("[analyzeInstructionAction]", error);
    return { success: false, message: "Error al analizar la instrucción." };
  }
}

export async function applyInstructionAction(input: {
  promptId: string;
  promptVersion: number;
  sectionKey: InjectableSectionKey;
  title: string;
  mainMessage: string;
}): Promise<ActionResult<{ newVersion: number }>> {
  try {
    const user = await currentUser();
    if (!user?.id) return { success: false, message: "auth_required" };

    const { promptId, promptVersion, sectionKey, title, mainMessage } = input;

    const prompt = await db.agentPrompt.findUnique({
      where: { id: promptId },
      select: { sections: true },
    });
    if (!prompt) return { success: false, message: "Prompt no encontrado." };

    const sections = (prompt.sections ?? {}) as Record<string, any>;
    const sectionData = sections[sectionKey] ?? {};
    const existingSteps: any[] = sectionData.steps ?? sectionData.items ?? [];

    const newStep = {
      id: crypto.randomUUID(),
      title,
      mainMessage,
      elements: [],
    };

    const updatedSteps = [...existingSteps, newStep];

    let result: { ok: boolean; conflict?: boolean; data?: any; error?: string };

    switch (sectionKey) {
      case "training":
        result = await patchTrainingSection({ promptId, version: promptVersion, data: { steps: updatedSteps } });
        break;
      case "faq":
        result = await patchFaqSection({ promptId, version: promptVersion, data: { steps: updatedSteps } });
        break;
      case "products":
        result = await patchProductsSection({ promptId, version: promptVersion, data: { steps: updatedSteps } });
        break;
      case "extras":
        result = await patchExtrasSection({
          promptId,
          version: promptVersion,
          data: {
            firmaEnabled: sectionData.firmaEnabled ?? false,
            firmaText: sectionData.firmaText ?? "",
            firmaName: sectionData.firmaName ?? "",
            steps: updatedSteps,
          },
        });
        break;
      case "management":
        result = await patchManagementSection({ promptId, version: promptVersion, data: { steps: updatedSteps } });
        break;
      default:
        return { success: false, message: "Sección no válida." };
    }

    if (!result.ok) {
      if (result.conflict) {
        return { success: false, message: "El prompt fue modificado por otro proceso. Intenta de nuevo." };
      }
      return { success: false, message: (result as any).error || "Error al aplicar." };
    }

    return {
      success: true,
      message: "ok",
      data: { newVersion: result.data?.version ?? promptVersion + 1 },
    };
  } catch (error) {
    console.error("[applyInstructionAction]", error);
    return { success: false, message: "Error al aplicar la instrucción." };
  }
}
