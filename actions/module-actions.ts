'use server'

import { FormModuleSchema, FormModuleValues, ModuleWithItems } from '@/schema/module';
import { PrismaClient } from '@prisma/client';

export interface ModuleResponse {
    success: boolean;
    message: string;
    data?: ModuleWithItems[];
}

const prisma = new PrismaClient();

/**
 * Obtiene todos los módulos, incluyendo sus items.
 */
export async function getAllModules(): Promise<ModuleResponse> {
    try {
        const modules = await prisma.module.findMany({
            include: { moduleItems: true },
            orderBy: { order: 'asc' },
        });

        return {
            success: true,
            message: 'Módulos obtenidos correctamente',
            data: modules,
        };
    } catch (error) {
        console.error('getAllModules error:', error);
        return {
            success: false,
            message: 'Error al obtener módulos',
        };
    }
}

/**
 * Crea un nuevo módulo con items relacionados.
 */
export async function createModule(formData: FormModuleValues): Promise<ModuleResponse> {
    const parse = FormModuleSchema.safeParse(formData);

    if (!parse.success) {
        return {
            success: false,
            message: "Datos inválidos. Corrige los campos requeridos.",
        };
    }

    const { items, ...moduleData } = parse.data;

    try {
        const moduleApp = await prisma.module.create({
            data: {
                ...moduleData,
                moduleItems: items && items.length > 0 ? {
                    create: items.map(item => ({
                        title: item.title,
                        url: item.url,
                        customUrl: item.customUrl,
                    })),
                } : undefined,
            },
            include: { moduleItems: true },
        });

        return {
            success: true,
            message: 'Módulo creado correctamente',
            data: [moduleApp],
        };
    } catch (error) {
        console.error('createModule error:', error);
        return {
            success: false,
            message: 'Error al crear el módulo',
        };
    }
}

/**
 * Actualiza un módulo por su ID incluyendo sus items.
 */
export async function updateModule(moduleId: string, formData: FormModuleValues): Promise<ModuleResponse> {
    if (!moduleId) {
        return {
            success: false,
            message: "El ID del módulo es obligatorio.",
        };
    }

    const parse = FormModuleSchema.safeParse(formData);

    if (!parse.success) {
        return {
            success: false,
            message: "Datos inválidos. Corrige los campos requeridos.",
        };
    }

    const { items, ...moduleData } = parse.data;

    try {
        const moduleApp = await prisma.module.update({
            where: { id: moduleId },
            data: {
                ...moduleData,
                moduleItems: items
                    ? {
                        deleteMany: {}, // Borra todos los anteriores
                        create: items.map(item => ({
                            title: item.title,
                            url: item.url,
                            customUrl: item.customUrl,
                        })),
                    }
                    : undefined,
            },
            include: { moduleItems: true },
        });

        return {
            success: true,
            message: 'Módulo actualizado correctamente',
            data: [moduleApp],
        };
    } catch (error) {
        console.error('updateModule error:', error);
        return {
            success: false,
            message: 'Error al actualizar el módulo',
        };
    }
}

/**
 * Elimina un módulo por su ID, incluyendo sus items.
 */
export async function deleteModule(moduleId: string): Promise<ModuleResponse> {
    try {
        await prisma.moduleItem.deleteMany({ where: { moduleId } });
        await prisma.module.delete({ where: { id: moduleId } });

        return {
            success: true,
            message: 'Módulo eliminado correctamente',
        };
    } catch (error) {
        console.error('deleteModule error:', error);
        return {
            success: false,
            message: 'Error al eliminar el módulo',
        };
    }
}

export async function updateModuleOrder(id: string, order: number) {
    try {
        await prisma.module.update({
            where: { id },
            data: { order },
        })
        return { success: true }
    } catch (error) {
        console.error("updateModuleOrder error:", error)
        return { success: false, error }
    }
}