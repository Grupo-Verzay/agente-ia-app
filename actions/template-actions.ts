'use server'

import { z } from 'zod'
import { currentUser } from '@/lib/auth';
import { db } from "@/lib/db";
import { isAdminLike } from '@/lib/rbac';
import { PromptTemplate } from '@prisma/client';

export interface ModuleResponse {
    success: boolean
    message: string
    data?: PromptTemplate[]
}

const createTemplateSchema = z.object({
    name: z.string().min(3),
    description: z.string().optional(),
    content: z.string().min(10),
    category: z.string().optional(),
    isActive: z.boolean().default(true),
})

const updateTemplateSchema = z.object({
    id: z.string().uuid(),
    name: z.string().min(3),
    description: z.string().optional(),
    content: z.string().min(10),
    category: z.string().optional(),
    isActive: z.boolean(),
})

const assertCanManageTemplates = async (): Promise<ModuleResponse | null> => {
    const me = await currentUser();
    if (!me || !isAdminLike(me.role)) {
        return {
            success: false,
            message: "No autorizado.",
        };
    }
    return null;
};

export async function createTemplate(input: z.infer<typeof createTemplateSchema>): Promise<ModuleResponse> {
    try {
        const unauthorized = await assertCanManageTemplates();
        if (unauthorized) return unauthorized;

        const data = createTemplateSchema.parse(input)

        const existing = await db.promptTemplate.findUnique({
            where: { name: data.name },
        })

        if (existing) {
            return {
                success: false,
                message: 'Ya existe una plantilla con ese nombre.',
            }
        }

        await db.promptTemplate.create({ data })

        return {
            success: true,
            message: 'Plantilla creada correctamente.',
        }
    } catch (error) {
        return {
            success: false,
            message: `Error al eliminar plantilla, ${error}`,
        }
    }
};

export async function updateTemplate(input: z.infer<typeof updateTemplateSchema>): Promise<ModuleResponse> {
    try {
        const unauthorized = await assertCanManageTemplates();
        if (unauthorized) return unauthorized;

        const data = updateTemplateSchema.parse(input)

        const exists = await db.promptTemplate.findUnique({ where: { id: data.id } })
        if (!exists) {
            return { success: false, message: 'La plantilla no existe.' }
        }

        await db.promptTemplate.update({
            where: { id: data.id },
            data: {
                name: data.name,
                description: data.description,
                content: data.content,
                category: data.category,
                isActive: data.isActive,
            },
        })

        return {
            success: true,
            message: 'Plantilla actualizada exitosamente.',
        }
    } catch (error) {
        return {
            success: false,
            message: `Error al eliminar plantilla, ${error}`,
        }
    }
};

export async function deleteTemplate(id: string): Promise<ModuleResponse> {
    try {
        const unauthorized = await assertCanManageTemplates();
        if (unauthorized) return unauthorized;

        const idSchema = z.string().uuid()
        idSchema.parse(id)

        const existing = await db.promptTemplate.findUnique({ where: { id } })

        if (!existing) {
            return { success: false, message: 'Plantilla no encontrada.' }
        }

        await db.promptTemplate.delete({ where: { id } })

        return {
            success: true,
            message: 'Plantilla eliminada correctamente.',
        }
    } catch (error) {
        return {
            success: false,
            message: `Error al eliminar plantilla, ${error}`,
        }
    }
};

export async function getAllTemplates(): Promise<ModuleResponse> {
    try {
        const unauthorized = await assertCanManageTemplates();
        if (unauthorized) return unauthorized;

        const data = await db.promptTemplate.findMany({
            orderBy: { createdAt: 'desc' },
        })

        return {
            success: true,
            message: 'Plantillas obtenidas correctamente.',
            data,
        }
    } catch (error) {
        return {
            success: false,
            message: `Error al eliminar plantilla, ${error}`,
        }
    }
};
