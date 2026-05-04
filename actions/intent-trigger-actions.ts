"use server"

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"

export interface IntentTriggerPayload {
    name: string
    mode: "keywords" | "prompt"
    condition: string
    workflowId: string
    isActive?: boolean
}

export async function getIntentTriggersByUser(userId: string) {
    try {
        const triggers = await db.intentTrigger.findMany({
            where: { userId },
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
        const trigger = await db.intentTrigger.create({
            data: {
                userId,
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
        await db.intentTrigger.update({ where: { id }, data: { isActive } })
        revalidatePath("/workflow")
        return { success: true }
    } catch (error) {
        console.error("[TOGGLE_INTENT_TRIGGER]", error)
        return { success: false, message: "Error al cambiar estado del disparador." }
    }
}
