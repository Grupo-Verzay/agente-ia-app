// actions/system-prompt-actions.ts
import { z } from "zod";
import {
    SectionsDraftSchema,
    SectionsStrictSchema,
    ManagementDraftSchema,
} from "@/types/agentAi";

/** Convierte estructuras antiguas a la forma nueva antes de parsear. */
export function upgradeSectionsLegacy(raw: any) {
    const next = { ...(raw ?? {}) };

    // Asegura management presente
    if (!next.management) next.management = {};

    // --- Migraciones suaves (si aplican en tu app) ---

    // products: items[] -> steps[]
    if (next.products && Array.isArray(next.products.items) && !Array.isArray(next.products.steps)) {
        next.products.steps = next.products.items; // si ya usas StepBase en items, sirve 1:1
        delete next.products.items;
    }

    // faq: items[] -> steps[]
    if (next.faq && Array.isArray(next.faq.items) && !Array.isArray(next.faq.steps)) {
        // si faq.items eran strings/preguntas simples, mapea a steps con 1 elemento text
        next.faq.steps = next.faq.items.map((it: any, i: number) => {
            if (typeof it === "string") {
                return {
                    id: `faq-${i}`,
                    title: "",
                    mainMessage: "",
                    elements: [{ id: `faq-el-${i}`, kind: "text", text: it }],
                };
            }
            return it; // si ya es Step-like, lo deja igual
        });
        delete next.faq.items;
    }

    // management: tolera prompts viejos que tenían sólo items (si alguna vez existió)
    if (Array.isArray(next.management.items) && !Array.isArray(next.management.steps)) {
        next.management.steps = next.management.items.map((it: any) => ({
            id: it.id ?? crypto.randomUUID?.() ?? String(Math.random()),
            title: it.title ?? "",
            mainMessage: "",
            elements: [{ id: crypto.randomUUID?.() ?? String(Math.random()), kind: "text", text: it.content ?? "" }],
        }));
        delete next.management.items;
    }

    return next;
}

/** Aplica defaults del Draft tras la “upgrade”. */
export function normalizeAsDraft(raw: any) {
    const upgraded = upgradeSectionsLegacy(raw);
    // management con defaults seguros
    if (!upgraded.management) upgraded.management = {};
    return SectionsDraftSchema.parse(upgraded);
}

/** Valida estrictamente pero sobre datos ya “upgraded”. */
export function normalizeAsStrict(raw: any) {
    const upgraded = upgradeSectionsLegacy(raw);
    return SectionsStrictSchema.parse(upgraded);
}
