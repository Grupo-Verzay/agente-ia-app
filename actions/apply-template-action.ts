"use server";

import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { AGENT_TEMPLATES } from "@/app/(root)/ai/_components/helpers/agentTemplates";

// Flujos por defecto que se crean al aplicar cada plantilla por objetivo
const TEMPLATE_FLOWS: Record<string, string[]> = {
  "venta-consultiva": [
    "BIENVENIDA",
    "PREGUNTA_1",
    "PREGUNTA_2",
    "PRESENTACION",
    "PROPUESTA_AGENDAMIENTO",
    "ACUERDO",
  ],
  "venta-directa": [
    "BIENVENIDA",
    "AVERIGUACION",
    "EXPOSICION",
    "ACUERDO",
    "POSTVENTA",
  ],
  "agendamiento-citas": [
    "BIENVENIDA",
    "SERVICIO",
    "DISPONIBILIDAD",
    "CONFIRMACION",
    "RECORDATORIO",
  ],
  "calificacion-leads": [
    "BIENVENIDA",
    "CALIFICACION",
    "URGENCIA",
    "PRESUPUESTO",
    "HANDOFF",
  ],
  "atencion-cliente": [
    "BIENVENIDA",
    "IDENTIFICACION",
    "VALIDACION",
    "RESOLUCION",
    "CIERRE",
  ],
  "pedidos-delivery": [
    "BIENVENIDA",
    "PEDIDO",
    "RESUMEN",
    "ENTREGA",
    "PAGO",
    "SEGUIMIENTO",
  ],
};

// Planes que habilitan creación de flujos y si son isPro
const PLAN_FLOW_CONFIG: Record<string, { isPro: boolean } | null> = {
  lite:          null,          // no crear flujos
  basico:        null,          // no crear flujos
  intermedio:    { isPro: false }, // Disparadores IA
  avanzado:      { isPro: true },  // Creación de Flujos
  enterprise:    { isPro: true },  // Creación de Flujos
  personalizado: null,          // no crear flujos
};

export async function applyTemplateToPrompt(input: {
  promptId: string;
  templateId: string;
}): Promise<{ ok: boolean; error?: string; flowsCreated?: number }> {
  try {
    const user = await currentUser();
    if (!user?.id) return { ok: false, error: "No autorizado" };

    const { promptId, templateId } = input;

    const template = AGENT_TEMPLATES.find((t) => t.id === templateId);
    if (!template) return { ok: false, error: "Plantilla no encontrada" };

    const prompt = await db.agentPrompt.findUnique({
      where: { id: promptId },
      select: { sections: true },
    });
    if (!prompt) return { ok: false, error: "Prompt no encontrado" };

    const existing = (prompt.sections ?? {}) as Record<string, any>;

    const makeSteps = (steps?: { title: string; mainMessage: string }[]) =>
      (steps ?? []).map((s) => ({
        id: crypto.randomUUID(),
        title: s.title,
        mainMessage: s.mainMessage,
        elements: [],
      }));

    const CAPTURE_SUBTYPES: Record<string, "Solicitudes" | "Reclamos" | "Pedidos" | "Reservas" | "Citas"> = {
      SOLICITUDES: "Solicitudes",
      RECLAMOS:    "Reclamos",
      PEDIDOS:     "Pedidos",
      RESERVAS:    "Reservas",
      CITAS:       "Citas",
    };

    const makeManagementSteps = (steps?: { title: string; mainMessage: string }[]) =>
      (steps ?? []).map((s) => {
        const subtype = CAPTURE_SUBTYPES[s.title.toUpperCase()];
        return {
          id: crypto.randomUUID(),
          title: s.title,
          mainMessage: s.mainMessage,
          elements: subtype
            ? [{ id: crypto.randomUUID(), kind: "function", fn: "captura_datos", subtype, prompt: s.mainMessage }]
            : [],
        };
      });

    const newSections = {
      ...existing,
      business: existing.business ?? {},
      training: template.sections.training
        ? { steps: makeSteps(template.sections.training) }
        : existing.training ?? { steps: [] },
      faq: template.sections.faq
        ? { steps: makeSteps(template.sections.faq) }
        : existing.faq ?? { steps: [] },
      management: template.sections.management
        ? { steps: makeManagementSteps(template.sections.management) }
        : existing.management ?? { steps: [] },
    };

    await db.agentPrompt.update({
      where: { id: promptId },
      data: {
        sections: newSections,
        version: { increment: 1 },
      },
    });

    // Crear flujos por defecto si la plantilla tiene flujos definidos
    let flowsCreated = 0;
    const flowNames = TEMPLATE_FLOWS[templateId];
    const planConfig = PLAN_FLOW_CONFIG[user.plan];

    if (flowNames && planConfig) {
      const maxOrderResult = await db.workflow.aggregate({
        where: { userId: user.id },
        _max: { order: true },
      });
      let nextOrder = (maxOrderResult._max.order ?? 0) + 1;

      for (const name of flowNames) {
        const exists = await db.workflow.findUnique({
          where: { name_userId: { name, userId: user.id } },
        });
        if (!exists) {
          await db.workflow.create({
            data: {
              userId: user.id,
              name,
              status: "DRAFT",
              definition: "workflow",
              isPro: planConfig.isPro,
              order: nextOrder++,
            },
          });
          flowsCreated++;
        }
      }
    }

    revalidatePath("/ia");
    return { ok: true, flowsCreated };
  } catch (e) {
    console.error("[applyTemplateToPrompt]", e);
    return { ok: false, error: "Error al aplicar la plantilla" };
  }
}
