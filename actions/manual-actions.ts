'use server'

import { db } from '@/lib/db'
import { Manual } from '@prisma/client'
import { z } from 'zod'

// ===================
// 📥 CREATE MANUAL
// ===================
const createManualSchema = z.object({
    name: z.string().min(3, 'El nombre es obligatorio.'),
    description: z.string().optional(),
    url: z.string().url('URL inválida'),
})

interface ManualResponse {
    success: boolean
    message: string
    data?: Manual | Manual[]
}

export async function createManual(
    userId: string,
    values: z.infer<typeof createManualSchema>
): Promise<ManualResponse> {
    const validated = createManualSchema.safeParse(values)

    if (!validated.success) {
        return {
            success: false,
            message: validated.error.errors[0].message,
        }
    }

    try {
        const manual = await db.manual.create({
            data: {
                name: validated.data.name,
                description: validated.data.description,
                url: validated.data.url,
            },
        })

        return {
            success: true,
            message: 'Manual creado exitosamente.',
            data: manual,
        }
    } catch (error) {
        console.error('Error al crear manual:', error)
        return {
            success: false,
            message: 'Error al crear el manual.',
        }
    }
}

// ===================
// 📄 GET MANUALS
// ===================
export async function getManuals(): Promise<ManualResponse> {
    try {
        const list = await db.manual.findMany({
            orderBy: { name: 'asc' },
        })

        return {
            success: true,
            message: 'Manuales obtenidos correctamente.',
            data: list,
        }
    } catch (error) {
        console.error('Error al obtener los manuales:', error)
        return {
            success: false,
            message: 'Error al obtener los manuales.',
        }
    }
}

// ===================
// ✏️ UPDATE MANUAL
// ===================
const updateManualSchema = z.object({
    id: z.string().uuid(),
    name: z.string().min(3, 'Nombre requerido'),
    url: z.string().min(3, 'Url requerida'),
    description: z.string().optional(),
})

export async function updateManual(values: z.infer<typeof updateManualSchema>): Promise<ManualResponse> {
    const validated = updateManualSchema.safeParse(values)

    if (!validated.success) {
        return {
            success: false,
            message: validated.error.errors[0].message,
        }
    }

    try {
        const manual = await db.manual.update({
            where: { id: validated.data.id },
            data: {
                name: validated.data.name,
                description: validated.data.description,
            },
        })

        return {
            success: true,
            message: 'Manual actualizado.',
            data: manual,
        }
    } catch (error) {
        console.error('Error al actualizar manual:', error)
        return {
            success: false,
            message: 'Error al actualizar el manual.',
        }
    }
}

// ===================
// 🗑 DELETE MANUAL
// ===================
export async function deleteManual(id: string): Promise<ManualResponse> {
    try {
        await db.manual.delete({
            where: { id },
        })

        return {
            success: true,
            message: 'Manual eliminado correctamente.',
        }
    } catch (error) {
        console.error('Error al eliminar manual:', error)
        return {
            success: false,
            message: 'Error al eliminar el manual.',
        }
    }
}
