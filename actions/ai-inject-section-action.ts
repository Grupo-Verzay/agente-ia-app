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
import { buildFirmaBlock } from "@/app/(root)/ai/_components/helpers/firmaTemplate";

const INJECTABLE_SECTION_KEYS = ["training", "faq", "products", "extras", "management", "firma"] as const;
export type InjectableSectionKey = typeof INJECTABLE_SECTION_KEYS[number];

const INJECT_SECTION_LABELS: Record<InjectableSectionKey, string> = {
  training: "INICIO",
  faq: "PREGUNTAS",
  products: "PRODUCTOS",
  extras: "EXTRAS",
  management: "GESTIÓN",
  firma: "PERFIL",
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
- "firma": ÚNICAMENTE cuando el usuario quiere ponerle un nombre al agente, IA, chatbot o bot. En ese caso, title="FIRMA DEL AGENTE" y mainMessage=SOLO el nombre (sin frases adicionales, sin signos de puntuación). Ej: "Sofia", "Max", "Valentina".

REGLAS para mainMessage (excepto sección "firma"):
- Redacción clara, natural y correcta para WhatsApp (sin errores ortográficos)
- Si hay lista de opciones, preséntala con viñetas
- OBLIGATORIO: terminar SIEMPRE con una pregunta contextual separada del texto con DOS saltos de línea (\\n\\n). Ej: "...PayPal\\n\\n¿Cuál de ellos te queda bien?"
- Máx 300 chars

IMPORTANTE: Responde ÚNICAMENTE con JSON válido, sin texto adicional ni markdown:
{"sectionKey":"faq","title":"Medios de pago","mainMessage":"Los medios de pago que manejamos son:\\n- Nequi\\n- Bancolombia\\n- PayPal\\n\\n¿Cuál de ellos te queda bien para realizar tu pago?"}`.trim();
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
        title: (parsed.title || "Sin título").slice(0, 50).toUpperCase(),
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
    const extrasData = sections.extras ?? {};

    let result: { ok: boolean; conflict?: boolean; data?: any; error?: string };

    if (sectionKey === "firma") {
      const agentName = mainMessage.trim();
      result = await patchExtrasSection({
        promptId,
        version: promptVersion,
        data: {
          firmaEnabled: true,
          firmaName: agentName,
          firmaText: buildFirmaBlock(agentName),
          steps: extrasData.steps ?? extrasData.items ?? [],
        },
      });
    } else {
      const sectionData = sections[sectionKey] ?? {};
      const existingSteps: any[] = sectionData.steps ?? sectionData.items ?? [];
      const newStep = { id: crypto.randomUUID(), title, mainMessage, elements: [] };
      const updatedSteps = [...existingSteps, newStep];

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
              firmaEnabled: extrasData.firmaEnabled ?? false,
              firmaText: extrasData.firmaText ?? "",
              firmaName: extrasData.firmaName ?? "",
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
