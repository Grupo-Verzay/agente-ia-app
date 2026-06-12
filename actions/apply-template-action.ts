"use server";

import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { AGENT_TEMPLATES } from "@/app/(root)/ai/_components/helpers/agentTemplates";

const VENTA_CONSULTIVA_FLOWS = [
  "BIENVENIDA",
  "PREGUNTA_1",
  "PREGUNTA_2",
  "PRESENTACION",
  "PROPUESTA_AGENDAMIENTO",
  "ACUERDO",
] as const;

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
        ? { steps: makeSteps(template.sections.management) }
        : existing.management ?? { steps: [] },
    };

    await db.agentPrompt.update({
      where: { id: promptId },
      data: {
        sections: newSections,
        version: { increment: 1 },
      },
    });

    // Crear flujos por defecto para la plantilla Venta Consultiva según el plan
    let flowsCreated = 0;
    if (templateId === "venta-consultiva") {
      const plan = user.plan;

      // Lite, Básico y Personalizado: no crear flujos
      const shouldCreate =
        plan === "intermedio" || plan === "avanzado" || plan === "enterprise";

      if (shouldCreate) {
        // Intermedio → Disparadores IA (isPro: false)
        // Avanzado / Enterprise → Creación de Flujos (isPro: true)
        const isPro = plan === "avanzado" || plan === "enterprise";

        const maxOrderResult = await db.workflow.aggregate({
          where: { userId: user.id },
          _max: { order: true },
        });
        let nextOrder = (maxOrderResult._max.order ?? 0) + 1;

        for (const name of VENTA_CONSULTIVA_FLOWS) {
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
                isPro,
                order: nextOrder++,
              },
            });
            flowsCreated++;
          }
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
