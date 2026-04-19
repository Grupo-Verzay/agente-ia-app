// builders.ts
import { z } from "zod";
import { buildSectionedMarkdown } from "./markdownBuilder";
import { ExtrasDraftSchema, FaqDraftSchema, flowBehaviorText, ProductsDraftSchema, TrainingDraftSchema, ManagementDraftSchema } from "@/types/agentAi";

export function buildExtrasMarkdown(extras: z.infer<typeof ExtrasDraftSchema>): string {
    return buildSectionedMarkdown(extras, {
        sectionPrefix: "Paso",
        joinSeparator: "\n\n---\n\n",
        flowBehaviorText: flowBehaviorText
    });
}

export function buildFaqMarkdown(faq: z.infer<typeof FaqDraftSchema>): string {
    return buildSectionedMarkdown(faq, {
        sectionPrefix: "Paso",
        joinSeparator: "\n\n---\n\n",
        flowBehaviorText: flowBehaviorText
    });
}

export function buildProductsMarkdown(products: z.infer<typeof ProductsDraftSchema>): string {
    return buildSectionedMarkdown(products, {
        sectionPrefix: "Paso",
        joinSeparator: "\n\n---\n\n",
        flowBehaviorText: flowBehaviorText
    });
}

export function buildTrainingMarkdown(training: z.infer<typeof TrainingDraftSchema>): string {
    return buildSectionedMarkdown(training, {
        sectionPrefix: "Paso",
        joinSeparator: "\n\n---\n\n",
        flowBehaviorText: flowBehaviorText
    });
}

export function buildManagementMarkdown(management: z.infer<typeof ManagementDraftSchema>): string {
    return buildSectionedMarkdown(management, {
        sectionPrefix: "Paso",
        joinSeparator: "\n\n---\n\n",
        flowBehaviorText: flowBehaviorText
    });
}