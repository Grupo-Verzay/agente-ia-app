// builders.ts
import { z } from "zod";
import { buildSectionedMarkdown } from "./markdownBuilder";
import { buildMotorFromTrainingSteps } from "./buildMotor";
import { ExtrasDraftSchema, FaqDraftSchema, flowBehaviorText, ProductsDraftSchema, TrainingDraftSchema, ManagementDraftSchema, KeywordsDraftSchema } from "@/types/agentAi";

// FAQ: título + label + mainMessage como respuesta directa
const FAQ_CFG = { sectionPrefix: "PREGUNTA", joinSeparator: "\n\n---\n\n", flowBehaviorText, renderMode: "answer" as const, mainMessageLabel: (n: number) => `OBJETIVO/RESPUESTA PRINCIPAL DE LA PREGUNTA ${n}:`, elementsLabel: (n: number) => `ELEMENTOS DE LA PREGUNTA ${n}:` };
// Productos: título + label + mainMessage (ficha técnica)
const PRODUCTS_CFG = { sectionPrefix: "PRODUCTO", joinSeparator: "\n\n---\n\n", flowBehaviorText, renderMode: "answer" as const, mainMessageLabel: (n: number) => `OBJETIVO/RESPUESTA PRINCIPAL DEL PRODUCTO ${n}:`, elementsLabel: (n: number) => `ELEMENTOS DEL PRODUCTO ${n}:` };
// Extras: título + label + mainMessage
const EXTRAS_CFG = { sectionPrefix: "EXTRA", joinSeparator: "\n\n---\n\n", flowBehaviorText, renderMode: "answer" as const, mainMessageLabel: (n: number) => `OBJETIVO/RESPUESTA PRINCIPAL DEL EXTRA ${n}:`, elementsLabel: (n: number) => `ELEMENTOS DEL EXTRA ${n}:` };
// Gestión: título + label objetivo + elementos
const MGMT_CFG = { sectionPrefix: "GESTIÓN", joinSeparator: "\n\n---\n\n", flowBehaviorText, renderMode: "management" as const, mainMessageLabel: (n: number) => `OBJETIVO PRINCIPAL DE LA GESTIÓN ${n}:`, elementsLabel: (n: number) => `ELEMENTOS DE LA GESTIÓN ${n}:` };
// Inicio/Training: modo completo (mainMessage + elementos numerados)
const FULL_CFG = { sectionPrefix: "PASO", joinSeparator: "\n\n---\n\n", flowBehaviorText, renderMode: "full" as const, mainMessageLabel: (n: number) => `OBJETIVO/RESPUESTA PRINCIPAL DEL PASO ${n}:`, elementsLabel: (n: number) => `ELEMENTOS DEL PASO ${n}:` };

export function buildExtrasMarkdown(extras: z.infer<typeof ExtrasDraftSchema>): string {
    return buildSectionedMarkdown(extras, EXTRAS_CFG);
}

export function buildFaqMarkdown(faq: z.infer<typeof FaqDraftSchema>): string {
    return buildSectionedMarkdown(faq, FAQ_CFG);
}

export function buildProductsMarkdown(products: z.infer<typeof ProductsDraftSchema>): string {
    return buildSectionedMarkdown(products, PRODUCTS_CFG);
}

export function buildTrainingMarkdown(training: z.infer<typeof TrainingDraftSchema>): string {
    const stepsMd = buildSectionedMarkdown(training, FULL_CFG);
    const motorMd = buildMotorFromTrainingSteps(training?.steps ?? []);
    return [stepsMd, motorMd].filter(Boolean).join('\n\n---\n\n');
}

export function buildManagementMarkdown(management: z.infer<typeof ManagementDraftSchema>): string {
    return buildSectionedMarkdown(management, MGMT_CFG);
}

export function buildKeywordsMarkdown(keywords: z.infer<typeof KeywordsDraftSchema> | undefined | null): string {
    const rules = keywords?.rules ?? [];
    const lines = rules
        .filter((r) => r.keywords.length > 0 && (r.action === "escalar" || r.response.trim()))
        .map((r) => {
            const kws = r.keywords.map((k) => `"${k}"`).join(", ");
            if (r.action === "escalar")
                return `- Si el mensaje contiene ${kws}: Transfiere INMEDIATAMENTE a un asesor humano. No respondas tú.`;
            return `- Si el mensaje contiene ${kws}: Responde EXACTAMENTE con: "${r.response}"`;
        });
    if (!lines.length) return "";
    return `## 🔑 PALABRAS CLAVE — RESPUESTAS DIRECTAS\nCuando el mensaje del cliente contenga alguna de estas palabras, aplica la acción indicada sin agregar nada más:\n\n${lines.join("\n")}`;
}