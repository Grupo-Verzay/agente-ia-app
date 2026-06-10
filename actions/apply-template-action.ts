"use server";

import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { AGENT_TEMPLATES } from "@/app/(root)/ai/_components/helpers/agentTemplates";

export async function applyTemplateToPrompt(input: {
  promptId: string;
  templateId: string;
}): Promise<{ ok: boolean; error?: string }> {
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

    revalidatePath("/ia");
    return { ok: true };
  } catch (e) {
    console.error("[applyTemplateToPrompt]", e);
    return { ok: false, error: "Error al aplicar la plantilla" };
  }
}
