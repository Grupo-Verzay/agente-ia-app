"use server"

import { db } from "@/lib/db"
import { z } from "zod"
import { formValuesReminderSchema, reminderSchema } from "@/schema/reminder"
import { Prisma } from "@prisma/client"

export interface ReminderResponse {
    success: boolean
    message: string
    data?: any
}

/**
 * Crear un nuevo recordatorio
 */
export async function createReminder(formData: formValuesReminderSchema): Promise<ReminderResponse> {
    const parse = reminderSchema.safeParse(formData)

    if (!parse.success) {
        const errors = parse.error.format()
        return {
            success: false,
            message: "Datos inválidos. Corrige los campos requeridos.",
            data: errors,
        }
    }

    const data = parse.data

    try {
        const reminder = await db.reminders.create({
            data: data as Prisma.RemindersCreateInput,
        })

        return {
            success: true,
            message: "Recordatorio creado exitosamente.",
            data: reminder,
        }
    } catch (error) {
        console.error("[CREATE_REMINDER]", error)
        return {
            success: false,
            message: "Error al crear el recordatorio.",
        }
    }
}

/**
 * Obtener todos los recordatorios de un usuario
 */
export async function getRemindersByUserId(userId: string): Promise<ReminderResponse> {
    if (!userId) {
        return {
            success: false,
            message: "El ID del usuario es obligatorio.",
        }
    }

    try {
        const reminders = await db.reminders.findMany({
            where: { userId },
            orderBy: { id: "asc" },
        })

        return {
            success: true,
            message: "Recordatorios obtenidos correctamente.",
            data: reminders,
        }
    } catch (error) {
        console.error("[GET_REMINDERS]", error)
        return {
            success: false,
            message: "Error al obtener los recordatorios.",
        }
    }
}

/**
 * Eliminar un recordatorio por su ID
 */
export async function deleteReminder(id: string): Promise<ReminderResponse> {
    if (!id) {
        return {
            success: false,
            message: "El ID del recordatorio es obligatorio.",
        }
    }

    try {
        await db.reminders.delete({ where: { id } })

        return {
            success: true,
            message: "Recordatorio eliminado correctamente.",
        }
    } catch (error) {
        console.error("[DELETE_REMINDER]", error)
        return {
            success: false,
            message: "Error al eliminar el recordatorio.",
        }
    }
}

/**
 * Actualizar un recordatorio por ID
 */
export async function updateReminder(id: string, formData: formValuesReminderSchema): Promise<ReminderResponse> {
    if (!id) {
        return {
            success: false,
            message: "El ID del recordatorio es obligatorio.",
        }
    }

    const parse = reminderSchema.safeParse(formData)

    if (!parse.success) {
        return {
            success: false,
            message: "Datos inválidos. Corrige los campos requeridos.",
            data: parse.error.format(),
        }
    }

    const data = parse.data

    try {
        const updated = await db.reminders.update({
            where: { id },
            data: data as Prisma.RemindersCreateInput,
        })

        return {
            success: true,
            message: "Recordatorio actualizado correctamente.",
            data: updated,
        }
    } catch (error) {
        console.error("[UPDATE_REMINDER]", error)
        return {
            success: false,
            message: "Error al actualizar el recordatorio.",
        }
    }
}