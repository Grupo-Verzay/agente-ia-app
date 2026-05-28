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

    // 1. Datos del negocio
    out.push(buildBusinessHeader(sections.business));

    // 2. Firma del agente — justo después de datos del negocio
    const firmaText = sections.extras?.firmaText?.trim();
    if (sections.extras?.firmaEnabled && firmaText) {
        out.push('\n---\n\n' + firmaText);
    }

    // 3. Inicio / Bienvenida
    const trainingMd = buildTrainingMarkdown(sections.training);
    if (nonEmpty(trainingMd)) {
        out.push('\n---\n\n## 👋 INICIO / BIENVENIDA\n');
        out.push(trainingMd);
    }

    // 4. Preguntas & Respuestas
    const faqMd = buildFaqMarkdown(sections.faq);
    if (nonEmpty(faqMd)) {
        out.push('\n---\n\n## ❓ PREGUNTAS & RESPUESTAS\n');
        out.push(faqMd);
    }

    // 5. Catálogo / Productos
    const prodMd = buildProductsMarkdown(sections.products);
    if (nonEmpty(prodMd)) {
        out.push('\n---\n\n## 💎 CATÁLOGO DE: PRODUCTOS Y SERVICIOS\n');
        out.push(prodMd);
    }

    // 6. Extras
    const extrasMd = buildExtrasMarkdown(sections.extras);
    if (nonEmpty(extrasMd)) {
        out.push('\n---\n\n## ⚖️ EXTRAS / OBJECIONES\n');
        out.push(extrasMd);
    }

    // 7. Gestión
    if (sections.management?.steps?.length) {
        const managementMd = buildManagementMarkdown(sections.management);
        if (nonEmpty(managementMd)) {
            out.push('\n---\n\n## 📦 GESTIÓN / CIERRE\n');
            out.push(managementMd);
        }
    }

    return out.join('\n');
}
