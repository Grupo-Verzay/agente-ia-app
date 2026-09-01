import z from "zod";
import { buildBusinessHeader } from "./buildBusinessHeader";
import { nonEmpty } from "./nonEmpty";
import { SectionsDraftSchema } from "@/types/agentAi";
import { buildExtrasMarkdown, buildFaqMarkdown, buildManagementMarkdown, buildProductsMarkdown, buildTrainingMarkdown, buildKeywordsMarkdown } from "./actionsBuilders";

/**
 * Opciones de armado del texto que lee el agente.
 */
export interface OpcionesDePrompt {
    /**
     * La cuenta responde con notas de voz en lugar de texto.
     *
     * Con la voz activa la firma se omite. La firma es una instruccion de
     * escribir `*🤖 Sofia*` al principio de cada mensaje: en texto WhatsApp la
     * muestra en negrita y se ve bien, pero al convertir la respuesta a audio
     * se lee en voz alta y el agente arranca cada nota diciendo su propio
     * nombre.
     */
    vozActiva?: boolean;
}

export function composePromptFromSections(
    sections: z.infer<typeof SectionsDraftSchema>,
    opciones?: OpcionesDePrompt,
): string {
    if (!nonEmpty(sections.business?.nombre)) {
        return `Completa al menos el nombre del negocio para generar el prompt.`;
    }

    const out: string[] = [];

    // 1. Datos del negocio
    out.push(buildBusinessHeader(sections.business));

    // 2. Firma del agente — justo después de datos del negocio.
    //    Se salta con la voz activa: ver OpcionesDePrompt.vozActiva. No se
    //    apaga firmaEnabled, para que al desactivar la voz vuelva sola sin que
    //    nadie tenga que acordarse de reactivarla.
    const firmaText = sections.extras?.firmaText?.trim();
    if (sections.extras?.firmaEnabled && firmaText && !opciones?.vozActiva) {
        out.push('\n---\n\n' + firmaText);
    }

    // 3. Notas adicionales del negocio
    const notas = sections.business?.notas?.trim();
    if (notas) {
        out.push('\n---\n\n## 📌 NOTAS ADICIONALES\n');
        out.push(notas);
    }

    // 4. Inicio / Bienvenida
    const trainingMd = buildTrainingMarkdown(sections.training);
    if (nonEmpty(trainingMd)) {
        out.push('\n---\n\n## 👋 FLUJO DE INICIO Y BIENVENIDA\n');
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

    // 8. Palabras clave
    const keywordsMd = buildKeywordsMarkdown(sections.keywords);
    if (nonEmpty(keywordsMd)) {
        out.push('\n---\n\n');
        out.push(keywordsMd);
    }

    return out.join('\n');
}
