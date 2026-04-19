'use server';

import { db } from '@/lib/db';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import {
    PatchSectionSchema,
    SaveSchema,
    PublishSchema,
    RevertSchema,
    BusinessDraftSchema,
    TrainingDraftSchema,
    SectionsDraftSchema,
    FaqDraftSchema,
    ProductsDraftSchema,
    ExtrasDraftSchema,
    SectionsStrictSchema,
    ManagementDraftSchema,
} from '@/types/agentAi';
import { composePromptFromSections } from '@/app/(root)/ai/_components/helpers/composePromptFromSections';
import { denormalizeBusiness } from '@/app/(root)/ai/_components/helpers/denormalizeBusiness';
import { nextRevisionNumber } from '@/app/(root)/ai/_components/helpers/nextRevisionNumber';
import { normalizeAsDraft, normalizeAsStrict } from '@/app/(root)/ai/_components/helpers/normalizeOldPrompt';

type Ok<T> = { ok: true; data: T };
type Conflict<T = any> = { ok: false; conflict: true; data: T };
type Fail = { ok: false; error: string };
const FreeformAgentPromptSchema = z.object({
    userId: z.string().min(1, "userId requerido"),
    agentId: z.string().min(1, "agentId requerido"),
    promptText: z.string(),
});

/* =========================
   Actions públicas
========================= */
export async function patchBusinessSection(input: {
    promptId: string;
    version: number;
    data: z.input<typeof BusinessDraftSchema>;
}) {
    const { promptId, version, data } = input;

    // Zod completa defaults y normaliza aquí
    const parsed = BusinessDraftSchema.parse(data);

    const result = await patchSection({
        promptId,
        version,
        sectionKey: "business",
        patch: parsed,
    });

    return result;
}

export async function patchTrainingSection(input: {
    promptId: string;
    version: number;
    data: z.input<typeof TrainingDraftSchema>;
}) {
    const { promptId, version, data } = input;

    // Normaliza + valida la **sección** de training
    const parsed = TrainingDraftSchema.parse({
        // Permite enviar solo steps desde el cliente
        id: "",
        title: "",
        mainMessage: "",
        openPicker: false,
        ...data,
    });

    return await patchSection({
        promptId,
        version,
        sectionKey: "training",
        patch: parsed, // ← sección completa (al menos { steps })
    });
}

export async function patchFaqSection(input: {
    promptId: string;
    version: number;
    data: z.input<typeof FaqDraftSchema>;
}) {
    const { promptId, version, data } = input;

    const parsed = FaqDraftSchema.parse({
        items: [],
        ...data,
    });

    return await patchSection({
        promptId,
        version,
        sectionKey: "faq",
        patch: parsed, // { items: [...] }
    });
}

export async function patchProductsSection(input: {
    promptId: string;
    version: number;
    data: z.input<typeof ProductsDraftSchema>;
}) {
    const { promptId, version, data } = input;

    // normaliza + valida con Draft
    const parsed = ProductsDraftSchema.parse({
        items: [],
        ...data,
    });

    return await patchSection({
        promptId,
        version,
        sectionKey: "products",
        patch: parsed, // { items: [...] }
    });
}

export async function patchExtrasSection(input: {
    promptId: string;
    version: number;
    data: z.input<typeof ExtrasDraftSchema>; // { firmaEnabled?, firmaText?, firmaName?, items? }
}) {
    const { promptId, version, data } = input;

    // Normaliza con Draft (defaults seguros)
    const parsed = ExtrasDraftSchema.parse({
        firmaEnabled: false,
        firmaText: "",
        firmaName: "",
        items: [],
        ...data,
    });

    return await patchSection({
        promptId,
        version,
        sectionKey: "extras",
        patch: parsed,
    });
}

/** Obtiene o crea el draft del agente. */
export async function getOrCreatePrompt(opts: { userId: string; agentId: string }) {
    const { userId, agentId } = opts;

    let prompt = await db.agentPrompt.findFirst({
        where: { userId, agentId: agentId ?? undefined },
    });

    if (!prompt) {
        // estado inicial mínimo
        const emptySections = {
            business: {
                nombre: '',
                sector: '',
                ubicacion: '',
                horarios: '',
                maps: '',
                telefono: '',
                email: '',
                sitio: '',
                facebook: '',
                instagram: '',
                tiktok: '',
                youtube: '',
                notas: '',
            },
            training: { steps: [] },
            faq: { items: [] },
            products: { items: [] },
            extras: { firmaEnabled: false, firmaText: '', firmaName: '', items: [] },
            management: { items: [] },
        };

        prompt = await db.agentPrompt.create({
            data: {
                userId,
                agentId,
                status: 'draft',
                sections: emptySections,
                promptText: composePromptFromSections(SectionsDraftSchema.parse(emptySections)),
                businessName: '',
                businessSector: '',
            },
        });
    }

    return prompt;
}

export async function getAgentPromptByUserAndAgentId(opts: {
    userId: string;
    agentId: string;
}) {
    const { userId, agentId } = FreeformAgentPromptSchema.pick({
        userId: true,
        agentId: true,
    }).parse(opts);

    return db.agentPrompt.findFirst({
        where: { userId, agentId },
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    });
}

export async function upsertAgentPromptText(input: {
    userId: string;
    agentId: string;
    promptText: string;
}) {
    try {
        const { userId, agentId, promptText } = FreeformAgentPromptSchema.parse(input);
        const normalizedPromptText = promptText.trim();
        const existing = await db.agentPrompt.findFirst({
            where: { userId, agentId },
            orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
        });

        if (!normalizedPromptText) {
            if (!existing) {
                return { ok: true as const, data: { mode: "noop" as const, prompt: null } };
            }

            await db.agentPrompt.delete({
                where: { id: existing.id },
            });

            return { ok: true as const, data: { mode: "deleted" as const, prompt: null } };
        }

        const prompt = existing
            ? await db.agentPrompt.update({
                where: { id: existing.id },
                data: {
                    promptText: normalizedPromptText,
                    version: { increment: 1 },
                },
            })
            : await db.agentPrompt.create({
                data: {
                    userId,
                    agentId,
                    status: "draft",
                    sections: {},
                    promptText: normalizedPromptText,
                },
            });

        return {
            ok: true as const,
            data: {
                mode: existing ? ("updated" as const) : ("created" as const),
                prompt,
            },
        };
    } catch (e: any) {
        return { ok: false as const, error: e?.message ?? "Error al guardar el prompt." };
    }
}

/** Obtiene el prompt por id (rehidratación de UI). */
export async function getCurrentPrompt(promptId: string, agentId: string) {
    return db.agentPrompt.findUnique({
        where: { id: promptId, agentId },
    });
}

/** Aplica un patch de una sección con optimistic locking. */
export async function patchSection(input: z.infer<typeof PatchSectionSchema>) {
    const { promptId, version, sectionKey, patch } = PatchSectionSchema.parse(input);

    return await db.$transaction(async (tx) => {
        const current = await tx.agentPrompt.findUnique({ where: { id: promptId } });
        if (!current) throw new Error('Prompt no encontrado');

        if (current.version !== version) {
            // Conflicto de versión
            return { ok: false as const, conflict: true as const, data: current };
        }

        // ⬇️ Fallback para registros viejos sin "management"
        const sectionsRaw = (current.sections ?? {}) as Record<string, any>;
        if (!sectionsRaw.management) sectionsRaw.management = {};  // 👈 clave
        const parsed = SectionsDraftSchema.parse(sectionsRaw);

        // Aplica patch validando contra el schema específico
        const next = { ...parsed };
        switch (sectionKey) {
            case 'business':
                next.business = BusinessDraftSchema.parse({ ...parsed.business, ...(patch || {}) });
                break;
            case 'training':
                next.training = TrainingDraftSchema.parse({ ...parsed.training, ...(patch || {}) });
                break;
            case 'faq':
                next.faq = FaqDraftSchema.parse({ ...parsed.faq, ...(patch || {}) });
                break;
            case 'products':
                next.products = ProductsDraftSchema.parse({ ...parsed.products, ...(patch || {}) });
                break;
            case 'extras':
                next.extras = ExtrasDraftSchema.parse({ ...parsed.extras, ...(patch || {}) });
                break;
            case 'management': {
                next.management = ManagementDraftSchema.parse({ ...parsed.management, ...(patch || {}) });
                break;
            }
        }

        const updated = await tx.agentPrompt.update({
            where: { id: promptId },
            data: {
                sections: next,
                version: { increment: 1 },
                // Denormalizados para listados
                businessName: next.business.nombre || null,
                businessSector: next.business.sector || null,
            },
        });

        return { ok: true as const, conflict: false as const, data: updated };
    });
}

/** Publica (crea revisión) + deja el draft sincronizado. */
export async function publishPrompt(input: z.infer<typeof PublishSchema>) {
    try {
        const { promptId, version, publishedBy, note, revalidate } = PublishSchema.parse(input);

        const result = await db.$transaction(async (tx) => {
            const current = await tx.agentPrompt.findUnique({ where: { id: promptId } });
            if (!current) return { ok: false, error: "Prompt no encontrado" } as Fail;
            // Strict sobre datos "upgraded"
            const strict = normalizeAsStrict(current.sections);

            // Para componer, usa Draft (por si tu composer espera defaults del Draft)
            const normalizedForCompose = normalizeAsDraft(strict);
            const promptTextStrict = composePromptFromSections(normalizedForCompose);
            const { businessName, businessSector } = denormalizeBusiness(strict);

            const revNumber = await nextRevisionNumber(promptId);
            const revision = await tx.agentPromptRevision.create({
                data: {
                    promptId,
                    revisionNumber: revNumber,
                    sectionsSnapshot: strict,
                    promptTextSnapshot: promptTextStrict,
                    publishedBy,
                    notes: note ?? null,
                },
            });

            const updated = await tx.agentPrompt.update({
                where: { id: promptId },
                data: {
                    status: "published",
                    promptText: promptTextStrict,
                    businessName,
                    businessSector,
                    version: { increment: 1 },
                },
            });

            return { ok: true, data: { prompt: updated, revision } } as Ok<{ prompt: typeof updated; revision: typeof revision }>;
        });

        if (result.ok && input.revalidate) {
            revalidatePath(input.revalidate);
        }

        return result;
    } catch (e: any) {
        const msg = e?.errors ? JSON.stringify(e.errors) : (e?.message ?? "Error al publicar prompt");
        return { ok: false, error: msg } as Fail;
    }
}

export async function patchManagementSection(input: {
    promptId: string;
    version: number;
    data: z.input<typeof ManagementDraftSchema>;
}) {
    const { promptId, version, data } = input;

    // Normaliza + valida con Draft
    const parsed = ProductsDraftSchema.parse({
        items: [],
        ...data,
    });

    return await patchSection({
        promptId,
        version,
        sectionKey: "management",
        patch: parsed, // ← sección completa (o subset) ya validada
    });
}
