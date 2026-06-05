"use server"

import { db } from "@/lib/db"
import { z } from "zod"
import { formValuesReminderSchema, ReminderDeliverySummary, reminderSchema } from "@/schema/reminder"
import { Prisma } from "@prisma/client"
import { parse as parseDate, format, isValid, addSeconds } from "date-fns"

// â”€â”€â”€ Helpers de campaÃ±a â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function randomBetween(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function normalizeToAbsoluteTime(timeStr: string): Date | null {
    if (!timeStr) return null;
    // Formato dd/MM/yyyy HH:mm (DateTimePicker)
    const byFormat = parseDate(timeStr, 'dd/MM/yyyy HH:mm', new Date());
    if (isValid(byFormat)) return byFormat;
    // Formato ISO
    const byIso = new Date(timeStr);
    if (!isNaN(byIso.getTime())) return byIso;
    return null;
}

function addSecondsToTime(timeStr: string, extraSeconds: number): string {
    if (!timeStr) return timeStr;
    const base = normalizeToAbsoluteTime(timeStr);
    if (!base) return timeStr;
    return format(addSeconds(base, extraSeconds), 'dd/MM/yyyy HH:mm');
}

function addSecondsToIsoTime(timeStr: string, extraSeconds: number): string {
    if (!timeStr) return timeStr;
    const base = normalizeToAbsoluteTime(timeStr);
    if (!base) return timeStr;
    return addSeconds(base, extraSeconds).toISOString();
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
    data?: unknown
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
            message: "Datos invÃ¡lidos. Corrige los campos requeridos.",
            data: errors,
        }
    }

    const { campaignMinDelay, campaignMaxDelay, media, mediaType, nameFile, ...reminderData } = parse.data

    const jids    = (reminderData.remoteJid ?? '').split(',').map(s => s.trim()).filter(Boolean);
    const names   = (reminderData.pushName  ?? '').split(',').map(s => s.trim());
    const baseMsg = reminderData.description || reminderData.title;
    const isCampaign = jids.length > 1;
    const seguimientoTipo = media ? `seguimiento-${mediaType ?? "image"}` : "text";

    const serverurl = reminderData.serverUrl
        ? (reminderData.serverUrl.startsWith("https://") ? reminderData.serverUrl : `https://${reminderData.serverUrl}`)
        : "";

    try {
        // Crear 1 registro Reminders por campaÃ±a o recordatorio
        const reminder = await db.reminders.create({
            data: { ...reminderData, isCampaign } as Prisma.RemindersCreateInput,
        });

        if (!isCampaign) {
            // Recordatorio individual â€” 1 Seguimiento
            await db.seguimiento.create({
                data: {
                    idNodo:    `reminder-${reminder.id}`,
                    serverurl,
                    instancia: reminderData.instanceName ?? "",
                    apikey:    reminderData.apikey ?? "",
                    remoteJid: reminderData.remoteJid ?? "",
                    mensaje:   baseMsg,
                    tipo:      seguimientoTipo,
                    media:     media ?? null,
                    nameFile:  nameFile ?? null,
                    time:      addSecondsToTime(reminderData.time ?? '', 0),
                    workflowId: reminderData.workflowId ?? null,
                },
            });

            return {
                success: true,
                message: "Recordatorio creado exitosamente.",
                data: reminder,
            };
        }

        // CampaÃ±a â€” N Seguimientos individuales con delay escalonado y variables resueltas
        const minDelay = Math.max(30, campaignMinDelay ?? 30);
        const maxDelay = Math.max(minDelay, campaignMaxDelay ?? 60);
        let cumulativeDelay = 0;

        for (let i = 0; i < jids.length; i++) {
            const jid   = jids[i];
            const name  = names[i] ?? '';
            const phone = jid.replace(/@.*/, '');

            cumulativeDelay += randomBetween(minDelay, maxDelay);

            await db.seguimiento.create({
                data: {
                    idNodo:    `camping-${reminder.id}-${i + 1}`,
                    serverurl,
                    instancia: reminderData.instanceName ?? "",
                    apikey:    reminderData.apikey ?? "",
                    remoteJid: jid,
                    mensaje:   applyVariables(baseMsg, name, phone),
                    tipo:      seguimientoTipo,
                    media:     media ?? null,
                    nameFile:  nameFile ?? null,
                    time:      addSecondsToIsoTime(reminderData.time ?? '', cumulativeDelay),
                    workflowId: reminderData.workflowId ?? null,
                },
            });
        }

        return {
            success: true,
            message: `CampaÃ±a creada: ${jids.length} mensajes programados.`,
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
            where: { userId, isCampaign: false },
            orderBy: [{ order: 'asc' }, { createdAt: 'desc' }],
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

export async function getCampaignsByUserId(userId: string): Promise<ReminderResponse> {
    if (!userId) {
        return {
            success: false,
            message: "El ID del usuario es obligatorio.",
        }
    }

    try {
        const campaigns = await db.reminders.findMany({
            where: { userId, isCampaign: true },
            orderBy: { createdAt: 'desc' },
        })

        return {
            success: true,
            message: "CampaÃ±as obtenidas correctamente.",
            data: campaigns,
        }
    } catch (error) {
        console.error("[GET_CAMPAIGNS]", error)
        return {
            success: false,
            message: "Error al obtener las campaÃ±as.",
        }
    }
}

const SENT_STATUSES = new Set(["sent", "success", "completed", "done", "delivered"]);
const FAILED_STATUSES = new Set(["failed", "error"]);
const CANCELED_STATUSES = new Set(["canceled", "cancelled", "deleted"]);

function normalizeDeliveryStatus(status: string | null | undefined) {
    return (status ?? "pending").toLowerCase();
}

export async function getReminderDeliverySummaries(
    reminderIds: string[],
): Promise<{ success: boolean; message: string; data?: Record<string, ReminderDeliverySummary> }> {
    const ids = reminderIds.filter(Boolean);
    if (ids.length === 0) {
        return { success: true, message: "Sin recordatorios.", data: {} };
    }

    try {
        const directIds = ids.map((id) => `reminder-${id}`);
        const campaignPrefixes = ids.map((id) => `camping-${id}-`);

        const rows = await db.seguimiento.findMany({
            where: {
                OR: [
                    { idNodo: { in: directIds } },
                    ...campaignPrefixes.map((prefix) => ({ idNodo: { startsWith: prefix } })),
                ],
            },
            orderBy: { time: "asc" },
            select: {
                id: true,
                idNodo: true,
                remoteJid: true,
                mensaje: true,
                tipo: true,
                time: true,
                followUpStatus: true,
                followUpAttempt: true,
                followUpMaxAttempts: true,
                errorReason: true,
                media: true,
                nameFile: true,
                createdAt: true,
                updatedAt: true,
            },
        });

        const summaries: Record<string, ReminderDeliverySummary> = Object.fromEntries(
            ids.map((id) => [id, { total: 0, pending: 0, sent: 0, failed: 0, canceled: 0, items: [] }])
        );

        for (const row of rows) {
            const reminderId = row.idNodo?.startsWith("reminder-")
                ? row.idNodo.replace("reminder-", "")
                : row.idNodo?.match(/^camping-(.+)-\d+$/)?.[1];
            if (!reminderId || !summaries[reminderId]) continue;

            const status = normalizeDeliveryStatus(row.followUpStatus);
            const summary = summaries[reminderId];
            summary.total += 1;
            if (SENT_STATUSES.has(status)) summary.sent += 1;
            else if (FAILED_STATUSES.has(status)) summary.failed += 1;
            else if (CANCELED_STATUSES.has(status)) summary.canceled += 1;
            else summary.pending += 1;

            summary.items.push({
                id: row.id,
                remoteJid: row.remoteJid,
                mensaje: row.mensaje,
                tipo: row.tipo,
                time: row.time,
                followUpStatus: row.followUpStatus,
                followUpAttempt: row.followUpAttempt,
                followUpMaxAttempts: row.followUpMaxAttempts,
                errorReason: row.errorReason,
                media: row.media,
                nameFile: row.nameFile,
                createdAt: row.createdAt.toISOString(),
                updatedAt: row.updatedAt.toISOString(),
            });
        }

        return { success: true, message: "Estados obtenidos correctamente.", data: summaries };
    } catch (error) {
        return {
            success: false,
            message: error instanceof Error ? error.message : "Error al obtener estados de envio.",
        };
    }
}

function reminderSeguimientoWhere(reminderId: string) {
    return {
        OR: [
            { idNodo: `reminder-${reminderId}` },
            { idNodo: { startsWith: `camping-${reminderId}-` } },
        ],
    };
}

export async function retryReminderFailedDeliveries(reminderId: string): Promise<ReminderResponse> {
    if (!reminderId) return { success: false, message: "ID obligatorio." };

    try {
        const result = await db.seguimiento.updateMany({
            where: {
                ...reminderSeguimientoWhere(reminderId),
                followUpStatus: { in: ["failed", "error"] },
            },
            data: {
                followUpStatus: "pending",
                followUpAttempt: 0,
                errorReason: null,
                time: new Date().toISOString(),
            },
        });

        return {
            success: true,
            message: result.count > 0 ? `Se reintentaran ${result.count} envio(s).` : "No hay envios fallidos para reintentar.",
            data: { count: result.count },
        };
    } catch (error) {
        return {
            success: false,
            message: error instanceof Error ? error.message : "Error al reintentar envios.",
        };
    }
}

export async function cancelReminderPendingDeliveries(reminderId: string): Promise<ReminderResponse> {
    if (!reminderId) return { success: false, message: "ID obligatorio." };

    try {
        const result = await db.seguimiento.updateMany({
            where: {
                ...reminderSeguimientoWhere(reminderId),
                followUpStatus: "pending",
            },
            data: {
                followUpStatus: "canceled",
                errorReason: "Cancelado manualmente",
            },
        });

        return {
            success: true,
            message: result.count > 0 ? `Se pausaron ${result.count} envio(s).` : "No hay envios pendientes para pausar.",
            data: { count: result.count },
        };
    } catch (error) {
        return {
            success: false,
            message: error instanceof Error ? error.message : "Error al pausar envios.",
        };
    }
}

export async function resumeReminderCanceledDeliveries(reminderId: string): Promise<ReminderResponse> {
    if (!reminderId) return { success: false, message: "ID obligatorio." };

    try {
        const result = await db.seguimiento.updateMany({
            where: {
                ...reminderSeguimientoWhere(reminderId),
                followUpStatus: "canceled",
            },
            data: {
                followUpStatus: "pending",
                errorReason: null,
                time: new Date().toISOString(),
            },
        });

        return {
            success: true,
            message: result.count > 0 ? `Se reanudaron ${result.count} envio(s).` : "No hay envios pausados para reanudar.",
            data: { count: result.count },
        };
    } catch (error) {
        return {
            success: false,
            message: error instanceof Error ? error.message : "Error al reanudar envios.",
        };
    }
}

/**
 * Eliminar todos los recordatorios de un usuario
 */
export async function deleteAllReminders(userId: string, isCampaign: boolean): Promise<ReminderResponse> {
    if (!userId) {
        return { success: false, message: "El ID del usuario es obligatorio." }
    }

    try {
        await db.reminders.deleteMany({ where: { userId, isCampaign } })
        return { success: true, message: "Todos los registros eliminados correctamente." }
    } catch (error) {
        console.error("[DELETE_ALL_REMINDERS]", error)
        return { success: false, message: "Error al eliminar los registros." }
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
        await db.reminders.delete({ where: { id } });
        // Eliminar también el Seguimiento programado asociado a este recordatorio
        await db.seguimiento.deleteMany({ where: { idNodo: `reminder-${id}` } });

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

export type ReminderItem = {
  id: string;
  title: string;
  description: string | null;
  time: string | null;
  repeatType: string | null;
  instanceName: string | null;
  createdAt: string;
  updatedAt: string;
};

export async function getRemindersByRemoteJid(
  userId: string,
  remoteJid: string,
): Promise<{ success: boolean; message: string; data?: ReminderItem[] }> {
  try {
    const items = await db.reminders.findMany({
      where: { userId, remoteJid, isCampaign: false },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        description: true,
        time: true,
        repeatType: true,
        instanceName: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return {
      success: true,
      message: 'Recordatorios obtenidos correctamente.',
      data: items.map((r) => ({
        ...r,
        repeatType: r.repeatType as string | null,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      })),
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Error al obtener los recordatorios.',
    };
  }
}

export async function updateReminderBasic(
  id: string,
  data: { title?: string; description?: string; time?: string }
): Promise<ReminderResponse> {
  if (!id) return { success: false, message: "ID obligatorio." };
  try {
    await db.reminders.update({ where: { id }, data });
    return { success: true, message: "Recordatorio actualizado correctamente." };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : "Error al actualizar." };
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
            message: "Datos invÃ¡lidos. Corrige los campos requeridos.",
            data: parse.error.format(),
        }
    }

    const { campaignMinDelay, campaignMaxDelay, media, mediaType, nameFile, ...data } = parse.data

    try {
        const updated = await db.reminders.update({
            where: { id },
            data: data as Prisma.RemindersUpdateInput,
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
                workflows: workflows,
                leads: leads,
            },
        }
    } catch (error) {
        console.error('[GET_REMINDER_FORM_DEPS]', error)
        return { success: false, message: 'Error al cargar datos del formulario.' }
    }
}
