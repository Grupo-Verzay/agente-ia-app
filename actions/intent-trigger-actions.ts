"use server"

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { laCuentaDeLaAccion } from "@/lib/cuenta-de-la-accion"

/**
 * Sin guarda ninguna: el `userId` llegaba del navegador y entraba directo al
 * `where` y al `data`. Es el H02 de siempre, y lo que se abre aquí es con qué
 * palabras arranca un flujo en la cuenta de otro.
 *
 * Y las tres de abajo van con `where: { id }` pelado —**un `where` sin dueño es
 * el mismo hueco sin el id delante**—, así que el dueño se lee de la fila.
 */
async function laCuentaDelDisparador(id: string) {
    const suyo = await db.intentTrigger.findUnique({ where: { id }, select: { userId: true } })
    if (!suyo) return null
    return laCuentaDeLaAccion(suyo.userId)
}

export interface IntentTriggerPayload {
    name: string
    mode: "keywords" | "prompt"
    condition: string
    workflowId: string
    isActive?: boolean
}

export async function getIntentTriggersByUser(userId: string) {
    try {
        const cuenta = await laCuentaDeLaAccion(userId)
        if (!cuenta) return { success: false, message: "No autorizado." }

        const triggers = await db.intentTrigger.findMany({
            where: { userId: cuenta },
            orderBy: { createdAt: "asc" },
        })
        return { success: true, data: triggers }
    } catch (error) {
        console.error("[GET_INTENT_TRIGGERS]", error)
        return { success: false, message: "Error al obtener los disparadores." }
    }
}

export async function createIntentTrigger(userId: string, payload: IntentTriggerPayload) {
    try {
        const cuenta = await laCuentaDeLaAccion(userId)
        if (!cuenta) return { success: false, message: "No autorizado." }

        const trigger = await db.intentTrigger.create({
            data: {
                userId: cuenta,
                name: payload.name.trim(),
                mode: payload.mode,
                condition: payload.condition.trim(),
                workflowId: payload.workflowId,
                isActive: payload.isActive ?? true,
            },
        })
        revalidatePath("/workflow")
        return { success: true, data: trigger }
    } catch (error) {
        console.error("[CREATE_INTENT_TRIGGER]", error)
        return { success: false, message: "Error al crear el disparador." }
    }
}

export async function updateIntentTrigger(id: string, payload: Partial<IntentTriggerPayload>) {
    try {
        if (!(await laCuentaDelDisparador(id))) {
            return { success: false, message: "No autorizado." }
        }

        const trigger = await db.intentTrigger.update({
            where: { id },
            data: {
                ...(payload.name !== undefined && { name: payload.name.trim() }),
                ...(payload.mode !== undefined && { mode: payload.mode }),
                ...(payload.condition !== undefined && { condition: payload.condition.trim() }),
                ...(payload.workflowId !== undefined && { workflowId: payload.workflowId }),
                ...(payload.isActive !== undefined && { isActive: payload.isActive }),
            },
        })
        revalidatePath("/workflow")
        return { success: true, data: trigger }
    } catch (error) {
        console.error("[UPDATE_INTENT_TRIGGER]", error)
        return { success: false, message: "Error al actualizar el disparador." }
    }
}

export async function deleteIntentTrigger(id: string) {
    try {
        if (!(await laCuentaDelDisparador(id))) {
            return { success: false, message: "No autorizado." }
        }

        await db.intentTrigger.delete({ where: { id } })
        revalidatePath("/workflow")
        return { success: true }
    } catch (error) {
        console.error("[DELETE_INTENT_TRIGGER]", error)
        return { success: false, message: "Error al eliminar el disparador." }
    }
}

export async function toggleIntentTrigger(id: string, isActive: boolean) {
    try {
        if (!(await laCuentaDelDisparador(id))) {
            return { success: false, message: "No autorizado." }
        }

        await db.intentTrigger.update({ where: { id }, data: { isActive } })
        revalidatePath("/workflow")
        return { success: true }
    } catch (error) {
        console.error("[TOGGLE_INTENT_TRIGGER]", error)
        return { success: false, message: "Error al cambiar estado del disparador." }
    }
}
