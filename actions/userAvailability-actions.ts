'use server'

import { db } from '@/lib/db'
import { UserAvailability } from '@prisma/client'
import { laCuentaDeLaAccion } from '@/lib/cuenta-de-la-accion'

/**
 * Sin guarda ninguna: el `userId` llegaba del navegador y entraba directo al
 * `where`, al `create` y a un `deleteMany`. Es el H02 de siempre — con otro id
 * se leía y se borraba el horario de atención de otra cuenta.
 *
 * Las dos que van por `id` —actualizar y eliminar— leen el dueño **de la fila**,
 * que es lo único que hay a mano: un `where` sin dueño es el mismo hueco sin el
 * id delante.
 */

async function laCuentaDelPeriodo(id: string) {
    const suyo = await db.userAvailability.findUnique({ where: { id }, select: { userId: true } })
    if (!suyo?.userId) return null
    return laCuentaDeLaAccion(suyo.userId)
}

interface AvailabilityOperationResponse {
    success: boolean
    message?: string
    data?: UserAvailability | UserAvailability[]
}

const overlaps = (aStart: string, aEnd: string, bStart: string, bEnd: string) =>
    aStart < bEnd && aEnd > bStart

// Obtener disponibilidad
export async function getUserAvailability(userId: string): Promise<AvailabilityOperationResponse> {
    try {
        const cuenta = await laCuentaDeLaAccion(userId)
        if (!cuenta) return { success: false, message: 'No autorizado.' }

        const list = await db.userAvailability.findMany({
            where: { userId: cuenta },
            orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' },]
        })
        return { success: true, data: list }
    } catch (e) {
        console.error(e)
        return { success: false, message: 'Error al obtener la disponibilidad.' }
    }
}

// Crear periodo
export async function createAvailability(data: {
    userId: string
    dayOfWeek: number
    startTime: string
    endTime: string,
}): Promise<AvailabilityOperationResponse> {
    const { userId, dayOfWeek, startTime, endTime } = data
    if (!userId || dayOfWeek === undefined || !startTime || !endTime)
        return { success: false, message: 'Faltan campos requeridos.' }
    if (startTime >= endTime)
        return { success: false, message: 'La hora de inicio debe ser menor a la hora de fin.' }

    try {
        const cuenta = await laCuentaDeLaAccion(userId)
        if (!cuenta) return { success: false, message: 'No autorizado.' }

        // valida solapes dentro del mismo día
        const sameDay = await db.userAvailability.findMany({ where: { userId: cuenta, dayOfWeek } })
        const clash = sameDay.some(p => overlaps(startTime, endTime, p.startTime, p.endTime))
        if (clash) return { success: false, message: 'Periodo solapado con otro existente.' }

        const created = await db.userAvailability.create({ data: { ...data, userId: cuenta } })
        return { success: true, data: created, message: 'Horario creado correctamente.' }
    } catch (e) {
        console.error(e)
        return { success: false, message: 'Error al crear el horario.' }
    }
}

// Actualizar periodo
export async function updateAvailability(
    id: string,
    startTime: string,
    endTime: string,
): Promise<AvailabilityOperationResponse> {
    if (startTime >= endTime)
        return { success: false, message: 'La hora de inicio debe ser menor a la hora de fin.' }

    try {
        const current = await db.userAvailability.findUnique({ where: { id } })
        if (!current) return { success: false, message: 'No encontrado.' }
        if (!(await laCuentaDeLaAccion(current.userId))) {
            return { success: false, message: 'No autorizado.' }
        }

        const sameDay = await db.userAvailability.findMany({
            where: { userId: current.userId, dayOfWeek: current.dayOfWeek, NOT: { id } },
        })
        const clash = sameDay.some(p => overlaps(startTime, endTime, p.startTime, p.endTime))
        if (clash) return { success: false, message: 'Periodo solapado con otro existente.' }

        const updated = await db.userAvailability.update({
            where: { id },
            data: { startTime, endTime },
        })
        return { success: true, data: updated }
    } catch (e) {
        console.error(e)
        return { success: false, message: 'No se pudo actualizar la disponibilidad.' }
    }
}

// Eliminar un periodo
export async function deleteAvailability(id: string): Promise<AvailabilityOperationResponse> {
    try {
        if (!(await laCuentaDelPeriodo(id))) {
            return { success: false, message: 'No autorizado.' }
        }

        await db.userAvailability.delete({ where: { id } })
        return { success: true, message: 'Horario eliminado correctamente.' }
    } catch (e) {
        console.error(e)
        return { success: false, message: 'Error al eliminar el horario.' }
    }
}

// 🛇 Eliminar TODOS los periodos de un día (marcar “No disponible”)
export async function clearDayAvailability(
    userId: string,
    dayOfWeek: number
): Promise<AvailabilityOperationResponse> {
    try {
        const cuenta = await laCuentaDeLaAccion(userId)
        if (!cuenta) return { success: false, message: 'No autorizado.' }

        await db.userAvailability.deleteMany({ where: { userId: cuenta, dayOfWeek } })
        return { success: true, message: 'Día marcado como no disponible.' }
    } catch (e) {
        console.error(e)
        return { success: false, message: 'No se pudo limpiar el día.' }
    }
}
