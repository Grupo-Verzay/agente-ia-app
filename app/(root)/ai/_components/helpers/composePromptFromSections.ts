import z from "zod";
import { buildBusinessHeader } from "./buildBusinessHeader";
import { nonEmpty } from "./nonEmpty";
import { SectionsDraftSchema } from "@/types/agentAi";
import { buildExtrasMarkdown, buildFaqMarkdown, buildManagementMarkdown, buildProductsMarkdown, buildTrainingMarkdown } from "./actionsBuilders";

export function composePromptFromSections(sections: z.infer<typeof SectionsDraftSchema>): string {
    if (!nonEmpty(sections.business?.nombre)) {
        return `Completa al menos el nombre del negocio para generar el prompt.`;
    }

    const out: string[] = [];
    out.push(buildBusinessHeader(sections.business));

    const trainingMd = buildTrainingMarkdown(sections.training);
    if (nonEmpty(trainingMd)) {
        out.push('## INICIO\n');
        out.push(trainingMd);
    }

    const faqMd = buildFaqMarkdown(sections.faq);
    if (nonEmpty(faqMd)) {
        out.push('\n## PREGUNTAS & RESPUESTAS\n');
        out.push(faqMd);
    }

    const prodMd = buildProductsMarkdown(sections.products);
    if (nonEmpty(prodMd)) {
        out.push('\n## CATÁLOGO / PRODUCTOS\n');
        out.push(prodMd);
    }

    const extrasMd = buildExtrasMarkdown(sections.extras);
    if (nonEmpty(extrasMd)) {
        out.push('\n## EXTRAS\n');
        out.push(extrasMd);
    }

    const managementMd = buildManagementMarkdown(sections.management);
    if (nonEmpty(managementMd)) {
        if (sections.management?.steps?.length) {
            out.push('\n## GESTIÓN\n');
            out.push(managementMd);
        }
    }

    return out.join('\n');
}
