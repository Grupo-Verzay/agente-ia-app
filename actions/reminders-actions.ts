"use server"

import { db } from "@/lib/db"
import { z } from "zod"
import { formValuesReminderSchema, reminderSchema } from "@/schema/reminder"
import { Prisma } from "@prisma/client"

// ─── Helpers de campaña ───────────────────────────────────────────────────────

function randomBetween(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function addSecondsToTime(timeStr: string, extraSeconds: number): string {
    if (!timeStr || extraSeconds === 0) return timeStr;
    const d = new Date(timeStr);
    if (!isNaN(d.getTime())) {
        return new Date(d.getTime() + extraSeconds * 1000).toISOString();
    }
    return timeStr;
}

function applyVariables(message: string, name: string, phone: string): string {
    const today = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });
    return message
        .replace(/\{\{nombre\}\}/gi, name || phone)
        .replace(/\{\{telefono\}\}/gi, phone)
        .replace(/\{\{fecha\}\}/gi, today);
}

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

        const serverurl = data.serverUrl
            ? (data.serverUrl.startsWith("https://") ? data.serverUrl : `https://${data.serverUrl}`)
            : "";

        const jids   = (data.remoteJid ?? '').split(',').map(s => s.trim()).filter(Boolean);
        const names  = (data.pushName  ?? '').split(',').map(s => s.trim());
        const baseMsg = data.description || data.title;

        if (jids.length <= 1) {
            // Recordatorio normal — un solo destinatario
            await db.seguimiento.create({
                data: {
                    idNodo:    `reminder-${reminder.id}`,
                    serverurl,
                    instancia: data.instanceName ?? "",
                    apikey:    data.apikey ?? "",
                    remoteJid: data.remoteJid ?? "",
                    mensaje:   baseMsg,
                    tipo:      "text",
                    time:      data.time ?? "",
                },
            });
        } else {
            // Campaña — un Seguimiento por lead con delay escalonado y variables
            const minDelay = Math.max(5, data.campaignMinDelay ?? 20);
            const maxDelay = Math.max(minDelay, data.campaignMaxDelay ?? 60);
            let cumulativeDelay = 0;

            for (let i = 0; i < jids.length; i++) {
                const jid   = jids[i];
                const name  = names[i] ?? '';
                const phone = jid.replace(/@.*/, '');

                if (i > 0) cumulativeDelay += randomBetween(minDelay, maxDelay);

                await db.seguimiento.create({
                    data: {
                        idNodo:    `reminder-${reminder.id}-${i + 1}`,
                        serverurl,
                        instancia: data.instanceName ?? "",
                        apikey:    data.apikey ?? "",
                        remoteJid: jid,
                        mensaje:   applyVariables(baseMsg, name, phone),
                        tipo:      "text",
                        time:      addSecondsToTime(data.time ?? '', cumulativeDelay),
                    },
                });
            }
        }

        return {
            success: true,
            message: jids.length > 1
                ? `Campaña creada: ${jids.length} mensajes programados.`
                : "Recordatorio creado exitosamente.",
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
            orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
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

/**
 * Actualiza el campo order de un recordatorio
 */
export async function updateReminderOrder(reminderId: string, order: number): Promise<{ success: boolean }> {
    try {
        await db.reminders.update({ where: { id: reminderId }, data: { order } });
        return { success: true };
    } catch {
        return { success: false };
    }
}

export async function getReminderFormDeps(userId: string, instanceId: string): Promise<{
    success: boolean
    message?: string
    data?: {
        apikey: string
        serverUrl: string
        instanceName: string
        workflows: { id: string; name: string; userId: string; description: string | null; definition: string; status: string; createdAt: Date; updatedAt: Date; order: number }[]
        leads: { id: number; userId: string; remoteJid: string; pushName: string; instanceId: string; status: boolean; leadStatus: string | null }[]
    }
}> {
    try {
        const user = await db.user.findUnique({
            where: { id: userId },
            select: { apiKeyId: true },
        })

        const [apiKey, instances, workflows, leads] = await Promise.all([
            user?.apiKeyId
                ? db.apiKey.findUnique({ where: { id: user.apiKeyId }, select: { url: true, key: true } })
                : null,
            db.instancia.findMany({ where: { userId }, select: { instanceName: true, instanceId: true } }),
            db.workflow.findMany({ where: { userId }, orderBy: { name: 'asc' } }),
            db.session.findMany({
                where: { userId },
                select: { id: true, userId: true, remoteJid: true, pushName: true, instanceId: true, status: true, leadStatus: true },
                orderBy: { pushName: 'asc' },
                take: 200,
            }),
        ])

        const instance = instances.find(i => i.instanceId === instanceId) ?? instances[0]

        return {
            success: true,
            data: {
                apikey: apiKey?.key ?? '',
                serverUrl: apiKey?.url ?? '',
                instanceName: instance?.instanceName ?? instanceId,
                workflows: workflows as any,
                leads: leads as any,
            },
        }
    } catch (error) {
        console.error('[GET_REMINDER_FORM_DEPS]', error)
        return { success: false, message: 'Error al cargar datos del formulario.' }
    }
}