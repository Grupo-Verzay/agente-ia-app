// actions/system-prompt-actions.ts
import { z } from "zod";
import {
    SectionsDraftSchema,
    SectionsStrictSchema,
    ManagementDraftSchema,
} from "@/types/agentAi";

/** Convierte estructuras antiguas a la forma nueva antes de parsear. */
export function upgradeSectionsLegacy(raw: unknown) {
    const next = { ...(raw as Record<string, unknown> ?? {}) } as Record<string, unknown>;

    // Asegura management presente
    if (!next.management) next.management = {};

    // --- Migraciones suaves (si aplican en tu app) ---

    // products: items[] -> steps[]
    if (next.products && typeof next.products === 'object' && Array.isArray((next.products as Record<string, unknown>).items) && !Array.isArray((next.products as Record<string, unknown>).steps)) {
        const p = next.products as Record<string, unknown>;
        p.steps = p.items;
        delete p.items;
    }

    // faq: items[] -> steps[]
    if (next.faq && typeof next.faq === 'object' && Array.isArray((next.faq as Record<string, unknown>).items) && !Array.isArray((next.faq as Record<string, unknown>).steps)) {
        const f = next.faq as Record<string, unknown>;
        f.steps = (f.items as unknown[]).map((it, i: number) => {
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
        delete f.items;
    }

    // management: tolera prompts viejos que tenían sólo items (si alguna vez existió)
    const mgmt = next.management as Record<string, unknown>;
    if (Array.isArray(mgmt.items) && !Array.isArray(mgmt.steps)) {
        mgmt.steps = (mgmt.items as Record<string, unknown>[]).map((it) => ({
            id: it.id ?? crypto.randomUUID?.() ?? String(Math.random()),
            title: it.title ?? "",
            mainMessage: "",
            elements: [{ id: crypto.randomUUID?.() ?? String(Math.random()), kind: "text", text: it.content ?? "" }],
        }));
        delete mgmt.items;
    }

    return next;
}

/** Aplica defaults del Draft tras la "upgrade". */
export function normalizeAsDraft(raw: unknown) {
    const upgraded = upgradeSectionsLegacy(raw);
    if (!upgraded.management) upgraded.management = {};
    return SectionsDraftSchema.parse(upgraded);
}

/** Valida estrictamente pero sobre datos ya "upgraded". */
export function normalizeAsStrict(raw: unknown) {
    const upgraded = upgradeSectionsLegacy(raw);
    return SectionsStrictSchema.parse(upgraded);
}
