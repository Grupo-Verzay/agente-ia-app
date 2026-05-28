import z from "zod";
import { buildBusinessHeader } from "./buildBusinessHeader";
import { nonEmpty } from "./nonEmpty";
import { SectionsDraftSchema } from "@/types/agentAi";
import { buildExtrasMarkdown, buildFaqMarkdown, buildManagementMarkdown, buildProductsMarkdown, buildTrainingMarkdown } from "./actionsBuilders";
import { buildMotorFromTrainingSteps } from "./buildMotor";

export function composePromptFromSections(sections: z.infer<typeof SectionsDraftSchema>): string {
    if (!nonEmpty(sections.business?.nombre)) {
        return `Completa al menos el nombre del negocio para generar el prompt.`;
    }

    const out: string[] = [];

    // 1. Datos del negocio
    out.push(buildBusinessHeader(sections.business));

    // 2. Inicio / Bienvenida (modo completo: mainMessage + elementos)
    const trainingMd = buildTrainingMarkdown(sections.training);
    if (nonEmpty(trainingMd)) {
        out.push('## INICIO\n');
        out.push(trainingMd);
    }

    // 3. Preguntas & Respuestas (solo título + respuesta)
    const faqMd = buildFaqMarkdown(sections.faq);
    if (nonEmpty(faqMd)) {
        out.push('\n## PREGUNTAS & RESPUESTAS\n');
        out.push(faqMd);
    }

    // 4. Catálogo / Productos (solo título + descripción)
    const prodMd = buildProductsMarkdown(sections.products);
    if (nonEmpty(prodMd)) {
        out.push('\n## CATÁLOGO / PRODUCTOS\n');
        out.push(prodMd);
    }

    // 5. Extras (solo título + contenido)
    const extrasMd = buildExtrasMarkdown(sections.extras);
    if (nonEmpty(extrasMd)) {
        out.push('\n## EXTRAS\n');
        out.push(extrasMd);
    }

    // 6. Gestión (título + llamadas a funciones, sin mainMessage)
    if (sections.management?.steps?.length) {
        const managementMd = buildManagementMarkdown(sections.management);
        if (nonEmpty(managementMd)) {
            out.push('\n## GESTIÓN\n');
            out.push(managementMd);
        }
    }

    // 7. Motor de Flujo Determinista — siempre al final, construido desde los pasos de INICIO
    const motorMd = buildMotorFromTrainingSteps(sections.training?.steps ?? []);
    if (nonEmpty(motorMd)) {
        out.push('\n' + motorMd);
    }

    return out.join('\n');
}
