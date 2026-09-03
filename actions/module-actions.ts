'use server'

import { FormModuleSchema, FormModuleValues, ModuleWithItems } from '@/schema/module';
import { db } from '@/lib/db';

/**
 * Sella cada submodulo con un instante distinto, en el orden en que llegan.
 *
 * ModuleItem no tiene columna de orden: el unico criterio disponible es
 * `createdAt`. Y al guardar se borran todos y se crean de nuevo en UNA
 * transaccion, donde Postgres le pone a todos la MISMA hora -la de inicio de la
 * transaccion-. Con las ocho marcas identicas, ordenar por ella es un empate
 * total: cada consulta los devolvia en un orden distinto y las pestañas se
 * reordenaban solas al pasar de un modulo a otro. Y el orden que se arrastra en
 * el editor no se guardaba en ninguna parte.
 *
 * Un milisegundo por item basta para conservarlo y no necesita migracion, que
 * aqui no se puede hacer: el esquema lo gobierna api-webhook.
 */
function conOrdenDeLlegada<T>(items: T[]): (T & { createdAt: Date })[] {
    const base = Date.now();
    return items.map((item, i) => ({ ...item, createdAt: new Date(base + i) }));
}

export interface ModuleResponse {
    success: boolean;
    message: string;
    data?: ModuleWithItems[];
}

// Usa el singleton compartido (antes creaba su propio PrismaClient, fragmentando
// el pool de conexiones — y getAllModules corre en cada request del layout).
const prisma = db;

/**
 * Obtiene todos los módulos, incluyendo sus items.
 */
export async function getAllModules(): Promise<ModuleResponse> {
    try {
        const modules = await prisma.module.findMany({
            include: { moduleItems: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] } },
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
                    create: conOrdenDeLlegada(items.map(item => ({
                        title: item.title,
                        url: item.url,
                        customUrl: item.customUrl,
                        lockedPlans: item.lockedPlans ?? [],
                    }))),
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
                        create: conOrdenDeLlegada(items.map(item => ({
                            title: item.title,
                            url: item.url,
                            customUrl: item.customUrl,
                            lockedPlans: item.lockedPlans ?? [],
                        }))),
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