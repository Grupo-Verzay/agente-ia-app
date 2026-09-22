'use server';

import { db } from '@/lib/db';
import { Tag } from '@prisma/client';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { laCuentaDeLaAccion } from '@/lib/cuenta-de-la-accion';
import { comoListaDeCuentas } from '@/lib/etiquetas-de-la-linea';

/**
 * Este fichero no tenía **ni una** llamada a `currentUser()`: el `userId` llegaba
 * del navegador y entraba directo al `where`. Es el H02 de siempre, y aquí con
 * la vuelta de tuerca que avisa la regla — el id sale de un `parse`, así que
 * buscarlo en la firma no lo encuentra.
 *
 * Todas las acciones que reciben una cuenta pasan por `laCuentaDeLaAccion`, y
 * **se usa lo que ella devuelve**, no el id que llegó: comprobar y luego
 * consultar con el original es dejar la mitad del arreglo sin hacer.
 */

export interface ActionResponse<T> {
    success: boolean;
    message: string;
    data?: T;
}

export type TagWithCount = Tag & {
  _count: { sessionTags: number };
};

// Helper simple para normalizar el nombre a slug
function slugify(name: string): string {
    return name
        .normalize('NFD') // quita acentos
        .replace(/[\u0300-\u036f]/g, '') // rango Unicode para diacríticos
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9\-]/g, '');
};

/* ===========================
 *  Zod schemas básicos
 * =========================== */

const baseTagSchema = z.object({
    userId: z.string().min(1, 'userId requerido'),
    name: z.string().min(1, 'Nombre requerido').max(80),
    color: z.string().max(20).optional().nullable(),
});

const tagIdSchema = z.object({
    id: z.number().int().positive(),
    userId: z.string().min(1),
});

const sessionTagSchema = z.object({
    userId: z.string().min(1),
    sessionId: z.number().int().positive(),
    tagId: z.number().int().positive(),
});

const replaceSessionTagsSchema = z.object({
    userId: z.string().min(1),
    sessionId: z.number().int().positive(),
    tagIds: z.array(z.number().int().positive()).default([]),
});

// Listar todos los tags de un usuario

export async function listTagsAction(
    userId: string,
): Promise<ActionResponse<TagWithCount[]>> {
    try {
        const parsed = z.string().min(1).parse(userId);
        const cuenta = await laCuentaDeLaAccion(parsed);
        if (!cuenta) return { success: false, message: 'No autorizado.' };

        const tags = await db.tag.findMany({
            where: { userId: cuenta },
            orderBy: [{ order: "asc" }, { id: "asc" }],
            include: {
                _count: {
                    select: {
                        sessionTags: true, // 👈 cuenta cuántos SessionTag tiene cada Tag
                    },
                },
            },
        });

        return {
            success: true,
            message: "Tags obtenidos correctamente.",
            data: tags,
        };
    } catch (error) {
        console.error("listTagsAction error:", error);
        return {
            success: false,
            message: "Error obteniendo los tags.",
        };
    }
}

/**
 * Las etiquetas de VARIAS cuentas, cada una con su dueña (`userId`).
 *
 * Es lo que necesita Chats: la bandeja enseña líneas de varias cuentas de la
 * familia, y a cada conversación solo se le ofrecen las etiquetas de la cuenta
 * de su línea (`lib/etiquetas-de-la-linea.ts`). Con `listTagsAction` sobre la
 * cuenta de quien mira, desde la madre una conversación de Atención ofrecía
 * las etiquetas de la madre, que el servidor luego rechaza.
 *
 * Cada cuenta pasa por `laCuentaDeLaAccion`, la misma puerta con la que después
 * se asigna: lo que no se alcanza no se lista. Y es UNA consulta para todas.
 */
export async function listTagsDeLasCuentasAction(
    userIds: string[],
): Promise<ActionResponse<(TagWithCount & { userId: string })[]>> {
    try {
        const pedidas = comoListaDeCuentas(userIds);
        if (pedidas.length === 0) {
            return { success: true, message: "Sin cuentas.", data: [] };
        }
        const alcanzadas = (
            await Promise.all(pedidas.map((id) => laCuentaDeLaAccion(id)))
        ).filter((c): c is string => Boolean(c));
        const cuentas = Array.from(new Set(alcanzadas));
        if (cuentas.length === 0) return { success: false, message: 'No autorizado.' };

        const tags = await db.tag.findMany({
            where: { userId: { in: cuentas } },
            orderBy: [{ order: "asc" }, { id: "asc" }],
            include: { _count: { select: { sessionTags: true } } },
        });

        return { success: true, message: "Tags obtenidos correctamente.", data: tags };
    } catch (error) {
        console.error("listTagsDeLasCuentasAction error:", error);
        return { success: false, message: "Error obteniendo los tags." };
    }
}

// Crear un nuevo tag para un usuario
export async function createTagAction(
    input: z.infer<typeof baseTagSchema>,
): Promise<ActionResponse<Tag>> {
    try {
        const { userId, name, color } = baseTagSchema.parse(input);
        const cuenta = await laCuentaDeLaAccion(userId);
        if (!cuenta) return { success: false, message: 'No autorizado.' };
        const slug = slugify(name);

        // Verificar si ya existe para ese usuario
        const existing = await db.tag.findFirst({
            where: { userId: cuenta, slug },
        });

        if (existing) {
            return {
                success: false,
                message: 'Ya existe un tag con ese nombre para este usuario.',
            };
        }

        const lastTag = await db.tag.findFirst({
            where: { userId: cuenta },
            orderBy: { order: "desc" },
            select: { order: true },
        });
        const nextOrder = (lastTag?.order ?? -1) + 1;

        const tag = await db.tag.create({
            data: {
                userId: cuenta,
                name,
                slug,
                color: color ?? null,
                order: nextOrder,
            },
        });

        return {
            success: true,
            message: 'Tag creado correctamente.',
            data: tag,
        };
    } catch (error) {
        console.error('createTagAction error:', error);
        return {
            success: false,
            message: 'Error creando el tag.',
        };
    }
}

// Actualizar nombre/color de un tag
export async function updateTagAction(
    input: z.infer<typeof baseTagSchema> & { id: number },
): Promise<ActionResponse<Tag>> {
    try {
        const parsedId = z.number().int().positive().parse(input.id);
        const { userId, name, color } = baseTagSchema.parse(input);
        const cuenta = await laCuentaDeLaAccion(userId);
        if (!cuenta) return { success: false, message: 'No autorizado.' };
        const slug = slugify(name);

        // Aseguramos que el tag pertenece al user y que el nuevo slug no choque
        const existing = await db.tag.findFirst({
            where: {
                userId: cuenta,
                slug,
                NOT: { id: parsedId },
            },
        });

        if (existing) {
            return {
                success: false,
                message: 'Ya existe otro tag con ese nombre para este usuario.',
            };
        }

        // El `where: { id }` pelado es el mismo hueco sin el id delante: sin
        // esta comprobación, la cuenta comprobada no decide nada y se edita la
        // etiqueta de cualquiera con solo acertar el número.
        const suyo = await db.tag.findUnique({ where: { id: parsedId }, select: { userId: true } });
        if (!suyo || suyo.userId !== cuenta) {
            return { success: false, message: 'Tag no encontrado o no pertenece a esta cuenta.' };
        }

        const tag = await db.tag.update({
            where: { id: parsedId },
            data: {
                name,
                slug,
                color: color ?? null,
            },
        });

        return {
            success: true,
            message: 'Tag actualizado correctamente.',
            data: tag,
        };
    } catch (error) {
        console.error('updateTagAction error:', error);
        return {
            success: false,
            message: 'Error actualizando el tag.',
        };
    }
}

// Actualizar el orden de un tag (individual — mantenido por compatibilidad)
/** El dueño sale de la FILA, no del navegador. */
async function laCuentaDeLaEtiqueta(tagId: number) {
    const suya = await db.tag.findUnique({ where: { id: tagId }, select: { userId: true } });
    if (!suya?.userId) return null;
    return laCuentaDeLaAccion(suya.userId);
}

export async function updateTagOrderAction(
    tagId: number,
    order: number,
): Promise<ActionResponse<null>> {
    try {
        if (!(await laCuentaDeLaEtiqueta(tagId))) {
            return { success: false, message: 'No autorizado.' };
        }

        await db.tag.update({
            where: { id: tagId },
            data: { order },
        });
        revalidatePath('/tags');
        return { success: true, message: 'Orden actualizado.', data: null };
    } catch (error) {
        console.error('updateTagOrderAction error:', error);
        return { success: false, message: 'Error actualizando el orden.' };
    }
}

// Actualizar el orden de múltiples tags en una sola transacción
export async function batchUpdateTagOrderAction(
    updates: { id: number; order: number }[],
): Promise<ActionResponse<null>> {
    try {
        // Una lista que llega de fuera no decide a qué filas se llega: se
        // comprueban **todas**, y si alguna no es suya no se escribe ninguna —
        // un orden a medias no es un orden.
        const suyas = await db.tag.findMany({
            where: { id: { in: updates.map((u) => u.id) } },
            select: { id: true, userId: true },
        });
        const alcanzadas = new Set<number>();
        for (const fila of suyas) {
            if (fila.userId && (await laCuentaDeLaAccion(fila.userId))) alcanzadas.add(fila.id);
        }
        if (updates.some((u) => !alcanzadas.has(u.id))) {
            return { success: false, message: 'No autorizado.' };
        }

        await db.$transaction(
            updates.map(({ id, order }) =>
                db.tag.update({ where: { id }, data: { order } })
            )
        );
        revalidatePath('/tags');
        return { success: true, message: 'Orden actualizado.', data: null };
    } catch (error) {
        console.error('batchUpdateTagOrderAction error:', error);
        return { success: false, message: 'Error actualizando el orden.' };
    }
}

// Eliminar un tag (se borran SessionTag por onDelete: Cascade)
export async function deleteTagAction(
    input: z.infer<typeof tagIdSchema>,
): Promise<ActionResponse<null>> {
    try {
        const { id, userId } = tagIdSchema.parse(input);
        const cuenta = await laCuentaDeLaAccion(userId);
        if (!cuenta) return { success: false, message: 'No autorizado.' };

        // Verificar que el tag es del usuario
        const tag = await db.tag.findUnique({ where: { id } });
        if (!tag || tag.userId !== cuenta) {
            return {
                success: false,
                message: 'Tag no encontrado o no pertenece a este usuario.',
            };
        }

        await db.tag.delete({
            where: { id },
        });

        return {
            success: true,
            message: 'Tag eliminado correctamente.',
            data: null,
        };
    } catch (error) {
        console.error('deleteTagAction error:', error);
        return {
            success: false,
            message: 'Error eliminando el tag.',
        };
    }
}

/* ===========================
 *  SESSION + TAGS
 * =========================== */

// Obtener tags de una sesión
export async function getSessionTagsAction(
    userId: string,
    sessionId: number,
): Promise<
    ActionResponse<
        {
            id: number;
            name: string;
            slug: string;
            color: string | null;
        }[]
    >
> {
    try {
        const parsedUserId = z.string().min(1).parse(userId);
        const parsedSessionId = z.number().int().positive().parse(sessionId);
        const cuenta = await laCuentaDeLaAccion(parsedUserId);
        if (!cuenta) return { success: false, message: 'No autorizado.' };


        const session = await db.session.findUnique({
            where: { id: parsedSessionId },
            include: {
                sessionTags: {
                    include: { tag: true },
                    orderBy: { tag: { order: "asc" } },
                },
            },
        });

        if (!session || session.userId !== cuenta) {
            return {
                success: false,
                message: 'Sesión no encontrada o no pertenece a este usuario.',
            };
        }

        const tags = session.sessionTags.map((st) => ({
            id: st.tag.id,
            name: st.tag.name,
            slug: st.tag.slug,
            color: st.tag.color,
            order: st.tag.order,
        }));

        return {
            success: true,
            message: 'Tags de la sesión obtenidos correctamente.',
            data: tags,
        };
    } catch (error) {
        console.error('getSessionTagsAction error:', error);
        return {
            success: false,
            message: 'Error obteniendo los tags de la sesión.',
        };
    }
}

// Asignar un tag a una sesión (si no existe la relación, la crea)
/**
 * Dispara (fire-and-forget) las automatizaciones configuradas para un tag
 * cuando se asigna a una sesión. Espeja triggerStageAutomations/triggerAdvisorAutomations.
 */
async function triggerTagAutomations(sessionId: number, tagId: number): Promise<void> {
    const backendUrl = (process.env.BACKEND_URL ?? '').replace(/\/$/, '');
    if (!backendUrl) return;
    const key = process.env.CRM_FOLLOW_UP_RUNNER_KEY ?? '';
    try {
        await fetch(`${backendUrl}/tag-automations/execute`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-internal-secret': key },
            body: JSON.stringify({ sessionId, tagId }),
        });
    } catch (error) {
        console.error('[triggerTagAutomations]', error);
    }
}

export async function assignTagToSessionAction(
    input: z.infer<typeof sessionTagSchema>,
): Promise<ActionResponse<null>> {
    try {
        const { userId, sessionId, tagId } = sessionTagSchema.parse(input);
        const cuenta = await laCuentaDeLaAccion(userId);
        if (!cuenta) return { success: false, message: 'No autorizado.' };

        // Validar sesión y usuario
        const session = await db.session.findUnique({
            where: { id: sessionId },
        });
        if (!session || session.userId !== cuenta) {
            return {
                success: false,
                message: 'Sesión no encontrada o no pertenece a este usuario.',
            };
        }

        // Validar tag y usuario
        const tag = await db.tag.findUnique({
            where: { id: tagId },
        });
        if (!tag || tag.userId !== cuenta) {
            return {
                success: false,
                message: 'Tag no encontrado o no pertenece a este usuario.',
            };
        }

        // ¿Ya estaba asignado? Para disparar automatizaciones solo cuando es nuevo.
        const already = await db.sessionTag.findUnique({
            where: { sessionId_tagId: { sessionId, tagId } },
        });

        // Crear relación si no existe (gracias al @@id compuesto)
        await db.sessionTag.upsert({
            where: {
                sessionId_tagId: {
                    sessionId,
                    tagId,
                },
            },
            update: {},
            create: {
                sessionId,
                tagId,
            },
        });

        if (!already) void triggerTagAutomations(sessionId, tagId);

        return {
            success: true,
            message: 'Tag asignado a la sesión correctamente.',
            data: null,
        };
    } catch (error) {
        console.error('assignTagToSessionAction error:', error);
        return {
            success: false,
            message: 'Error asignando el tag a la sesión.',
        };
    }
}

// Quitar un tag específico de una sesión
export async function removeTagFromSessionAction(
    input: z.infer<typeof sessionTagSchema>,
): Promise<ActionResponse<null>> {
    try {
        const { userId, sessionId, tagId } = sessionTagSchema.parse(input);
        const cuenta = await laCuentaDeLaAccion(userId);
        if (!cuenta) return { success: false, message: 'No autorizado.' };

        // Validar sesión y usuario
        const session = await db.session.findUnique({
            where: { id: sessionId },
        });
        if (!session || session.userId !== cuenta) {
            return {
                success: false,
                message: 'Sesión no encontrada o no pertenece a este usuario.',
            };
        }

        // Validar tag y usuario
        const tag = await db.tag.findUnique({
            where: { id: tagId },
        });
        if (!tag || tag.userId !== cuenta) {
            return {
                success: false,
                message: 'Tag no encontrado o no pertenece a este usuario.',
            };
        }

        await db.sessionTag.deleteMany({
            where: {
                sessionId,
                tagId,
            },
        });

        return {
            success: true,
            message: 'Tag eliminado de la sesión correctamente.',
            data: null,
        };
    } catch (error) {
        console.error('removeTagFromSessionAction error:', error);
        return {
            success: false,
            message: 'Error eliminando el tag de la sesión.',
        };
    }
}

// Reemplazar TODOS los tags de una sesión por una lista nueva
export async function replaceSessionTagsAction(
    input: z.infer<typeof replaceSessionTagsSchema>,
): Promise<ActionResponse<null>> {
    try {
        const { userId, sessionId, tagIds } = replaceSessionTagsSchema.parse(input);
        const cuenta = await laCuentaDeLaAccion(userId);
        if (!cuenta) return { success: false, message: 'No autorizado.' };

        const session = await db.session.findUnique({
            where: { id: sessionId },
        });
        if (!session || session.userId !== cuenta) {
            return {
                success: false,
                message: 'Sesión no encontrada o no pertenece a este usuario.',
            };
        }

        // Verificar que todos los tagIds pertenecen al mismo user
        if (tagIds.length > 0) {
            const tags = await db.tag.findMany({
                where: {
                    id: { in: tagIds },
                },
            });

            const allBelongToUser =
                tags.length === tagIds.length &&
                tags.every((t) => t.userId === cuenta);

            if (!allBelongToUser) {
                return {
                    success: false,
                    message: 'Uno o más tags no pertenecen a este usuario.',
                };
            }
        }

        // Tags previos (para disparar automatizaciones solo de los nuevos)
        const prev = await db.sessionTag.findMany({
            where: { sessionId },
            select: { tagId: true },
        });
        const prevSet = new Set(prev.map((p: { tagId: number }) => p.tagId));

        // Borrar relaciones actuales
        await db.sessionTag.deleteMany({
            where: { sessionId },
        });

        // Crear nuevas relaciones
        if (tagIds.length > 0) {
            await db.sessionTag.createMany({
                data: tagIds.map((tagId) => ({
                    sessionId,
                    tagId,
                })),
                skipDuplicates: true,
            });
        }

        // Disparar automatizaciones de cada tag recién agregado
        for (const tagId of tagIds) {
            if (!prevSet.has(tagId)) void triggerTagAutomations(sessionId, tagId);
        }

        return {
            success: true,
            message: 'Tags de la sesión actualizados correctamente.',
            data: null,
        };
    } catch (error) {
        console.error('replaceSessionTagsAction error:', error);
        return {
            success: false,
            message: 'Error reemplazando los tags de la sesión.',
        };
    }
}