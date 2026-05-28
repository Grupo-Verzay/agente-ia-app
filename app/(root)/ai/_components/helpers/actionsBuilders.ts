// builders.ts
import { z } from "zod";
import { buildSectionedMarkdown } from "./markdownBuilder";
import { ExtrasDraftSchema, FaqDraftSchema, flowBehaviorText, ProductsDraftSchema, TrainingDraftSchema, ManagementDraftSchema } from "@/types/agentAi";

// FAQ: título (pregunta) + mainMessage como respuesta directa
const FAQ_CFG = { joinSeparator: "\n\n---\n\n", flowBehaviorText, renderMode: "answer" as const };
// Productos y Extras: solo título + elementos de texto (sin mainMessage ni funciones)
const QA_CFG = { joinSeparator: "\n\n---\n\n", flowBehaviorText, renderMode: "qa" as const };
// Gestión: título + llamadas a funciones, sin mainMessage
const MGMT_CFG = { sectionPrefix: "Gestión", joinSeparator: "\n\n---\n\n", flowBehaviorText, renderMode: "management" as const };
// Inicio/Training: modo completo (mainMessage + elementos)
const FULL_CFG = { sectionPrefix: "PASO", joinSeparator: "\n\n---\n\n", flowBehaviorText, renderMode: "full" as const };

export function buildExtrasMarkdown(extras: z.infer<typeof ExtrasDraftSchema>): string {
    return buildSectionedMarkdown(extras, FAQ_CFG);
}

export function buildFaqMarkdown(faq: z.infer<typeof FaqDraftSchema>): string {
    return buildSectionedMarkdown(faq, FAQ_CFG);
}

export function buildProductsMarkdown(products: z.infer<typeof ProductsDraftSchema>): string {
    return buildSectionedMarkdown(products, FAQ_CFG);
}

export function buildTrainingMarkdown(training: z.infer<typeof TrainingDraftSchema>): string {
    return buildSectionedMarkdown(training, FULL_CFG);
}

export function buildManagementMarkdown(management: z.infer<typeof ManagementDraftSchema>): string {
    return buildSectionedMarkdown(management, MGMT_CFG);
}