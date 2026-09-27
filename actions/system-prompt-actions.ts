'use server';

import { z } from 'zod';
import type {
    PatchSectionSchema,
    PublishSchema,
    BusinessDraftSchema,
    TrainingDraftSchema,
    FaqDraftSchema,
    ProductsDraftSchema,
    ExtrasDraftSchema,
    ManagementDraftSchema,
    KeywordsDraftSchema,
} from '@/types/agentAi';
import { laCuentaDeLaAccion } from '@/lib/cuenta-de-la-accion';
import { laCuentaDelEntrenamiento } from '@/lib/dueno-del-dato.server';
import * as nucleo from '@/lib/entrenamiento-del-agente.server';

/**
 * El editor del agente: guardar cada sección, publicar, listar y restaurar
 * versiones.
 *
 * # Todas pasan por una puerta, y es la MISMA
 *
 * Aquí vivía el cuerpo entero, y de las diecisiete funciones solo dos
 * preguntaban de quién era el prompt. Con el id del entrenamiento de otra
 * cuenta se guardaba cualquier sección, se publicaba y se volvía a una versión
 * vieja; con su `userId` se leía o se creaba su entrenamiento.
 *
 * Ahora el cuerpo vive en `lib/entrenamiento-del-agente.server.ts` —que es lo
 * que usa el modo dueño por WhatsApp, sin sesión— y cada función de aquí
 * pregunta primero:
 *
 * - las que reciben un `promptId`, por `laCuentaDelEntrenamiento`: el dueño
 *   sale de la FILA (`lib/dueno-del-dato.server.ts`);
 * - las que reciben un `userId`, por `laCuentaDeLaAccion`.
 *
 * Las dos acaban en `assertCanAccessTargetUser`, la puerta de más de cien
 * acciones. Y «no existe» y «no es tuyo» se contestan igual: con la forma que
 * cada una ya devolvía cuando el prompt no estaba.
 */

const NO_ESTA = 'Prompt no encontrado';

async function exigirElEntrenamiento(promptId: unknown) {
    if (!(await laCuentaDelEntrenamiento(promptId))) throw new Error(NO_ESTA);
}

async function exigirLaCuenta(userId: unknown) {
    const cuenta = await laCuentaDeLaAccion(String(userId ?? ''));
    if (!cuenta || !String(userId ?? '').trim()) throw new Error('No autorizado.');
    return cuenta;
}

export async function patchBusinessSection(input: {
    promptId: string;
    version: number;
    data: z.input<typeof BusinessDraftSchema>;
}) {
    await exigirElEntrenamiento(input?.promptId);
    return nucleo.patchBusinessSection(input);
}

export async function patchBusinessAndFirma(input: {
    promptId: string;
    version: number;
    business: z.input<typeof BusinessDraftSchema>;
    firma: { firmaEnabled: boolean; firmaText: string; firmaName: string };
}) {
    await exigirElEntrenamiento(input?.promptId);
    return nucleo.patchBusinessAndFirma(input);
}

export async function patchTrainingSection(input: {
    promptId: string;
    version: number;
    data: z.input<typeof TrainingDraftSchema>;
}) {
    await exigirElEntrenamiento(input?.promptId);
    return nucleo.patchTrainingSection(input);
}

export async function patchFaqSection(input: {
    promptId: string;
    version: number;
    data: z.input<typeof FaqDraftSchema>;
}) {
    await exigirElEntrenamiento(input?.promptId);
    return nucleo.patchFaqSection(input);
}

export async function patchProductsSection(input: {
    promptId: string;
    version: number;
    data: z.input<typeof ProductsDraftSchema>;
}) {
    await exigirElEntrenamiento(input?.promptId);
    return nucleo.patchProductsSection(input);
}

export async function patchExtrasSection(input: {
    promptId: string;
    version: number;
    data: { steps?: z.input<typeof ExtrasDraftSchema>["steps"] };
}) {
    await exigirElEntrenamiento(input?.promptId);
    return nucleo.patchExtrasSection(input);
}

export async function patchKeywordsSection(input: {
    promptId: string;
    version: number;
    data: z.input<typeof KeywordsDraftSchema>;
}) {
    await exigirElEntrenamiento(input?.promptId);
    return nucleo.patchKeywordsSection(input);
}

export async function patchManagementSection(input: {
    promptId: string;
    version: number;
    data: z.input<typeof ManagementDraftSchema>;
}) {
    await exigirElEntrenamiento(input?.promptId);
    return nucleo.patchManagementSection(input);
}

export async function patchSection(input: z.infer<typeof PatchSectionSchema>) {
    await exigirElEntrenamiento(input?.promptId);
    return nucleo.patchSection(input);
}

/** Obtiene o crea el entrenamiento de un canal. Con la cuenta ya comprobada. */
export async function getOrCreateChannelPrompt(opts: { userId: string; agentId: string }) {
    const cuenta = await exigirLaCuenta(opts?.userId);
    return nucleo.getOrCreateChannelPrompt({ ...opts, userId: cuenta });
}

export async function getOrCreatePrompt(opts: { userId: string; agentId: string }) {
    const cuenta = await exigirLaCuenta(opts?.userId);
    return nucleo.getOrCreatePrompt({ ...opts, userId: cuenta });
}

export async function getAgentPromptByUserAndAgentId(opts: { userId: string; agentId: string }) {
    const cuenta = await laCuentaDeLaAccion(String(opts?.userId ?? ''));
    if (!cuenta || !String(opts?.userId ?? '').trim()) return null;
    return nucleo.getAgentPromptByUserAndAgentId({ ...opts, userId: cuenta });
}

export async function upsertAgentPromptText(input: {
    userId: string;
    agentId: string;
    promptText: string;
}) {
    const cuenta = await laCuentaDeLaAccion(String(input?.userId ?? ''));
    if (!cuenta || !String(input?.userId ?? '').trim()) {
        return { ok: false as const, error: 'No autorizado.' };
    }
    return nucleo.upsertAgentPromptText({ ...input, userId: cuenta });
}

/** Obtiene el prompt por id (rehidratación de UI). */
export async function getCurrentPrompt(promptId: string, agentId: string) {
    if (!(await laCuentaDelEntrenamiento(promptId))) return null;
    return nucleo.getCurrentPrompt(promptId, agentId);
}

/** Publica (crea revisión) + deja el draft sincronizado. */
export async function publishPrompt(input: z.infer<typeof PublishSchema>) {
    if (!(await laCuentaDelEntrenamiento(input?.promptId))) {
        return { ok: false as const, error: NO_ESTA };
    }
    return nucleo.publishPrompt(input);
}

/** Lista las revisiones de un prompt, de la más reciente a la más antigua. */
export async function listPromptRevisions(promptId: string) {
    if (!(await laCuentaDelEntrenamiento(promptId))) {
        return { ok: false as const, error: 'No se pudieron cargar las revisiones' };
    }
    return nucleo.listPromptRevisions(promptId);
}

/** Restaura una revisión: copia sectionsSnapshot al draft del AgentPrompt. */
export async function restoreRevision(input: {
    promptId: string;
    revisionNumber: number;
    revalidate?: string;
}) {
    if (!(await laCuentaDelEntrenamiento(input?.promptId))) {
        return { ok: false as const, error: 'Revisión no encontrada' };
    }
    return nucleo.restoreRevision(input);
}
