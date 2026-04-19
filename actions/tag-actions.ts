'use server';

import { db } from '@/lib/db';
import { Tag } from '@prisma/client';
import { z } from 'zod';

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

        const tags = await db.tag.findMany({
            where: { userId: parsed },
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

// Crear un nuevo tag para un usuario
export async function createTagAction(
    input: z.infer<typeof baseTagSchema>,
): Promise<ActionResponse<Tag>> {
    try {
        const { userId, name, color } = baseTagSchema.parse(input);
        const slug = slugify(name);

        // Verificar si ya existe para ese usuario
        const existing = await db.tag.findFirst({
            where: { userId, slug },
        });

        if (existing) {
            return {
                success: false,
                message: 'Ya existe un tag con ese nombre para este usuario.',
            };
        }

        const lastTag = await db.tag.findFirst({
            where: { userId },
            orderBy: { order: "desc" },
            select: { order: true },
        });
        const nextOrder = (lastTag?.order ?? -1) + 1;

        const tag = await db.tag.create({
            data: {
                userId,
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
        const slug = slugify(name);

        // Aseguramos que el tag pertenece al user y que el nuevo slug no choque
        const existing = await db.tag.findFirst({
            where: {
                userId,
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

        const tag = await db.tag.update({
            where: { id: parsedId },
            data: {
                name,
                slug,
                color: color ?? null,
            },
        });

        // (Opcional) podrías verificar también que tag.userId === userId
        // y lanzar error si no coincide para mayor seguridad multi-tenant.

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

// Actualizar el orden de un tag
export async function updateTagOrderAction(
    tagId: number,
    order: number,
): Promise<ActionResponse<null>> {
    try {
        await db.tag.update({
            where: { id: tagId },
            data: { order },
        });
        return { success: true, message: 'Orden actualizado.', data: null };
    } catch (error) {
        console.error('updateTagOrderAction error:', error);
        return { success: false, message: 'Error actualizando el orden.' };
    }
}

// Eliminar un tag (se borran SessionTag por onDelete: Cascade)
export async function deleteTagAction(
    input: z.infer<typeof tagIdSchema>,
): Promise<ActionResponse<null>> {
    try {
        const { id, userId } = tagIdSchema.parse(input);

        // Verificar que el tag es del usuario
        const tag = await db.tag.findUnique({ where: { id } });
        if (!tag || tag.userId !== userId) {
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

        const session = await db.session.findUnique({
            where: { id: parsedSessionId },
            include: {
                sessionTags: {
                    include: { tag: true },
                    orderBy: { tag: { order: "asc" } },
                },
            },
        });

        if (!session || session.userId !== parsedUserId) {
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
export async function assignTagToSessionAction(
    input: z.infer<typeof sessionTagSchema>,
): Promise<ActionResponse<null>> {
    try {
        const { userId, sessionId, tagId } = sessionTagSchema.parse(input);

        // Validar sesión y usuario
        const session = await db.session.findUnique({
            where: { id: sessionId },
        });
        if (!session || session.userId !== userId) {
            return {
                success: false,
                message: 'Sesión no encontrada o no pertenece a este usuario.',
            };
        }

        // Validar tag y usuario
        const tag = await db.tag.findUnique({
            where: { id: tagId },
        });
        if (!tag || tag.userId !== userId) {
            return {
                success: false,
                message: 'Tag no encontrado o no pertenece a este usuario.',
            };
        }

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

        // Validar sesión y usuario
        const session = await db.session.findUnique({
            where: { id: sessionId },
        });
        if (!session || session.userId !== userId) {
            return {
                success: false,
                message: 'Sesión no encontrada o no pertenece a este usuario.',
            };
        }

        // Validar tag y usuario
        const tag = await db.tag.findUnique({
            where: { id: tagId },
        });
        if (!tag || tag.userId !== userId) {
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

        const session = await db.session.findUnique({
            where: { id: sessionId },
        });
        if (!session || session.userId !== userId) {
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
                tags.every((t) => t.userId === userId);

            if (!allBelongToUser) {
                return {
                    success: false,
                    message: 'Uno o más tags no pertenecen a este usuario.',
                };
            }
        }

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