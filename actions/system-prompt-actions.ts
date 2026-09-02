'use server';

import { db } from '@/lib/db';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { assertCanAccessTargetUser } from './billing/helpers/app-access-guard';
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
    KeywordsDraftSchema,
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

/**
 * Guarda la sección de negocio Y la firma del agente en una sola transacción.
 * La firma se edita en la pestaña de negocio pero se almacena dentro de `extras`,
 * por eso debe persistirse aquí preservando los `steps` existentes de extras.
 */
export async function patchBusinessAndFirma(input: {
    promptId: string;
    version: number;
    business: z.input<typeof BusinessDraftSchema>;
    firma: { firmaEnabled: boolean; firmaText: string; firmaName: string };
}) {
    const { promptId, version, business, firma } = input;
    const parsedBusiness = BusinessDraftSchema.parse(business);

    return await db.$transaction(async (tx) => {
        const current = await tx.agentPrompt.findUnique({ where: { id: promptId } });
        if (!current) throw new Error('Prompt no encontrado');

        if (current.version !== version) {
            return { ok: false as const, conflict: true as const, data: current };
        }

        const sectionsRaw = (current.sections ?? {}) as Record<string, any>;
        if (!sectionsRaw.management) sectionsRaw.management = {};
        if (!sectionsRaw.keywords) sectionsRaw.keywords = { rules: [] };
        const parsed = SectionsDraftSchema.parse(sectionsRaw);

        const next = { ...parsed };
        next.business = BusinessDraftSchema.parse({ ...parsed.business, ...parsedBusiness });
        // Solo sobreescribe los campos de firma; conserva los steps de extras.
        next.extras = ExtrasDraftSchema.parse({
            ...parsed.extras,
            firmaEnabled: firma.firmaEnabled,
            firmaText: firma.firmaText,
            firmaName: firma.firmaName,
        });

        const updated = await tx.agentPrompt.update({
            where: { id: promptId },
            data: {
                sections: next,
                promptText: componerTextoDelPrompt(next),
                version: { increment: 1 },
                businessName: next.business.nombre || null,
                businessSector: next.business.sector || null,
            },
        });

        return { ok: true as const, conflict: false as const, data: updated };
    });
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
    data: { steps?: z.input<typeof ExtrasDraftSchema>["steps"] };
}) {
    const { promptId, version, data } = input;

    // Extras solo gestiona los `steps`. La firma se administra desde la
    // pestaña de negocio (patchBusinessAndFirma); aquí NO se toca para no
    // sobreescribirla — patchSection hace merge y conserva los campos de firma.
    const steps = ExtrasDraftSchema.shape.steps.parse(data?.steps ?? []);

    return await patchSection({
        promptId,
        version,
        sectionKey: "extras",
        patch: { steps },
    });
}

/** Obtiene o crea el draft del agente. */
/**
 * Igual que getOrCreatePrompt, pero para entrenamientos POR CANAL. Si el canal
 * (agentId) no tiene entrenamiento propio, lo crea como COPIA del entrenamiento
 * base de WhatsApp QR (system-prompt-ai), para que arranque igual y luego se
 * personalice. El base se obtiene/crea normalmente.
 */
export async function getOrCreateChannelPrompt(opts: { userId: string; agentId: string }) {
    const BASE = 'system-prompt-ai';
    const { userId, agentId } = opts;
    if (!agentId || agentId === BASE) {
        return getOrCreatePrompt({ userId, agentId: BASE });
    }

    const existing = await db.agentPrompt.findFirst({ where: { userId, agentId } });
    if (existing) return existing;

    // Copiar del entrenamiento base de WhatsApp.
    const base = await getOrCreatePrompt({ userId, agentId: BASE });
    return db.agentPrompt.create({
        data: {
            userId,
            agentId,
            status: 'draft',
            sections: base.sections as any,
            promptText: base.promptText,
            businessName: base.businessName,
            businessSector: base.businessSector,
        },
    });
}

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
                telefono: '',
                email: '',
                sitio: '',
                facebook: '',
                instagram: '',
                tiktok: '',
                youtube: '',
                linkedin: '',
                twitter: '',
                telegram: '',
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
        // Verifica que el usuario de la sesión tenga permiso sobre este userId
        // (evita sobrescribir/borrar el prompt del Agente IA de otro tenant — IDOR).
        await assertCanAccessTargetUser(userId);
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
/**
 * Rehace el texto que lee el agente a partir de las secciones.
 *
 * El agente NO lee las secciones: lee `promptText`, que hasta ahora solo se
 * rehacía al publicar. Quien editaba un paso y guardaba veía su cambio en
 * pantalla, pero el agente seguía contestando con el texto de la última
 * publicación. Es el motivo de que "no se actualice de verdad".
 */
function componerTextoDelPrompt(secciones: unknown): string {
    return composePromptFromSections(normalizeAsDraft(normalizeAsStrict(secciones)));
}

export async function patchSection(input: z.infer<typeof PatchSectionSchema>) {
    const { promptId, version, sectionKey, patch } = PatchSectionSchema.parse(input);

    return await db.$transaction(async (tx) => {
        const current = await tx.agentPrompt.findUnique({ where: { id: promptId } });
        if (!current) throw new Error('Prompt no encontrado');

        if (current.version !== version) {
            // Conflicto de versión
            return { ok: false as const, conflict: true as const, data: current };
        }

        // ⬇️ Fallback para registros viejos sin "management" o "keywords"
        const sectionsRaw = (current.sections ?? {}) as Record<string, any>;
        if (!sectionsRaw.management) sectionsRaw.management = {};
        if (!sectionsRaw.keywords) sectionsRaw.keywords = { rules: [] };
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
            case 'keywords': {
                next.keywords = KeywordsDraftSchema.parse({ ...parsed.keywords, ...(patch || {}) });
                break;
            }
        }

        const updated = await tx.agentPrompt.update({
            where: { id: promptId },
            data: {
                sections: next,
                // El texto que lee el agente se rehace en cada guardado. Antes
                // solo se rehacía al publicar, así que editar un paso no
                // cambiaba nada de lo que el agente contestaba.
                promptText: componerTextoDelPrompt(next),
                version: { increment: 1 },
                // Denormalizados para listados
                businessName: next.business.nombre || null,
                businessSector: next.business.sector || null,
            },
        });

        return { ok: true as const, conflict: false as const, data: updated };
    });
}

/**
 * Cuántas revisiones se conservan de cada prompt.
 *
 * Cada una guarda el prompt entero —unos 23 kB— y hasta ahora no se borraba
 * ninguna: la tabla acumulaba 181 MB desde octubre y era la cuarta más grande
 * de la base. Cinco cubre lo que de verdad se usa: volver a la anterior o a la
 * de antes.
 */
const REVISIONES_A_CONSERVAR = 5;

/**
 * Borra las revisiones que se salen de las últimas N de este prompt.
 *
 * Va FUERA de la transacción del publicado a propósito. Dentro, una cuenta con
 * cientos de revisiones acumuladas se pasaba del tiempo límite y tumbaba la
 * publicación entera: salía "No se pudo publicar" y no se guardaba nada. La
 * poda es limpieza, no parte de publicar; si falla, se reintenta en el
 * siguiente publicado o en el barrido diario.
 */
async function podarRevisionesAntiguas(promptId: string): Promise<void> {
    const sobrantes = await db.agentPromptRevision.findMany({
        where: { promptId },
        select: { id: true },
        orderBy: { revisionNumber: "desc" },
        skip: REVISIONES_A_CONSERVAR,
    });

    if (!sobrantes.length) return;
    await db.agentPromptRevision.deleteMany({
        where: { id: { in: sobrantes.map((r) => r.id) } },
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

        // Con la publicación ya confirmada: si esto falla, no se pierde nada.
        if (result.ok) {
            await podarRevisionesAntiguas(promptId).catch((e) => {
                console.warn("[publishPrompt] no se pudieron podar las revisiones:", e);
            });
        }

        if (result.ok && input.revalidate) {
            revalidatePath(input.revalidate);
        }

        return result;
    } catch (e) {
        // Lo que cae aqui puede ser cualquier cosa, no solo un Error: se mira
        // que trae antes de leerlo en vez de darlo por hecho.
        const fallo = e as { errors?: unknown; message?: unknown };
        const msg = fallo?.errors
            ? JSON.stringify(fallo.errors)
            : (typeof fallo?.message === "string" ? fallo.message : "Error al publicar prompt");
        return { ok: false, error: msg } as Fail;
    }
}

/** Lista las revisiones de un prompt, ordenadas de la más reciente a la más antigua. */
export async function listPromptRevisions(promptId: string) {
    try {
        const revisions = await db.agentPromptRevision.findMany({
            where: { promptId },
            orderBy: { revisionNumber: "desc" },
            select: {
                id: true,
                revisionNumber: true,
                publishedAt: true,
                notes: true,
                publishedBy: true,
                sectionsSnapshot: true,
            },
            take: 20,
        });
        return { ok: true as const, data: revisions };
    } catch (e) {
        return { ok: false as const, error: "No se pudieron cargar las revisiones" };
    }
}

/** Restaura una revisión: copia sectionsSnapshot al draft del AgentPrompt. */
export async function restoreRevision(input: {
    promptId: string;
    revisionNumber: number;
    revalidate?: string;
}) {
    try {
        const { promptId, revisionNumber, revalidate } = input;

        const revision = await db.agentPromptRevision.findUnique({
            where: { promptId_revisionNumber: { promptId, revisionNumber } },
        });

        if (!revision) return { ok: false as const, error: "Revisión no encontrada" };

        await db.agentPrompt.update({
            where: { id: promptId },
            data: {
                sections: revision.sectionsSnapshot as any,
                status: "draft",
            },
        });

        if (revalidate) revalidatePath(revalidate);

        return { ok: true as const };
    } catch (e) {
        return { ok: false as const, error: "No se pudo restaurar la revisión" };
    }
}

export async function patchKeywordsSection(input: {
    promptId: string;
    version: number;
    data: z.input<typeof KeywordsDraftSchema>;
}) {
    const { promptId, version, data } = input;
    const parsed = KeywordsDraftSchema.parse(data);
    return await patchSection({ promptId, version, sectionKey: "keywords", patch: parsed });
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
