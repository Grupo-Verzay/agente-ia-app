'use server'

import { db } from '@/lib/db'
import { UserAvailability } from '@prisma/client'

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
        const list = await db.userAvailability.findMany({
            where: { userId },
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
        // valida solapes dentro del mismo día
        const sameDay = await db.userAvailability.findMany({ where: { userId, dayOfWeek } })
        const clash = sameDay.some(p => overlaps(startTime, endTime, p.startTime, p.endTime))
        if (clash) return { success: false, message: 'Periodo solapado con otro existente.' }

        const created = await db.userAvailability.create({ data })
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
        await db.userAvailability.deleteMany({ where: { userId, dayOfWeek } })
        return { success: true, message: 'Día marcado como no disponible.' }
    } catch (e) {
        console.error(e)
        return { success: false, message: 'No se pudo limpiar el día.' }
    }
}
