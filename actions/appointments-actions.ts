'use server';

import { db } from '@/lib/db';
import { Appointment, AppointmentStatus } from '@prisma/client';
import { addMinutes, parseISO, isBefore } from 'date-fns';
import { registerSession } from './session-action';
import { getAuditActorId, writeAuditLog } from './audit-log-actions';

interface AppointmentOperationResponse {
    success: boolean;
    message: string;
    data?: Appointment | Appointment[];
    seguimientosCount?: Record<string, number>;
}

interface CreateAppointmentInput {
    userId: string;
    sessionId?: number;
    pushName: string;
    phone: string;
    instanceName: string;
    startTime: string;
    endTime: string;
    timezone: string;
    serviceId: string;
}

//Obtener citas por usuario (Asesor)
export async function getAppointmentsByUser(userId: string): Promise<AppointmentOperationResponse> {
    try {
        const list = await db.appointment.findMany({
            where: { userId },
            include: {
                session: {
                    include: {
                        sessionTags: { include: { tag: { select: { id: true, name: true, color: true } } } },
                    },
                },
                service: true,
            },
            orderBy: { startTime: 'asc' },
        });

        let seguimientosCount: Record<string, number> = {};
        try {
            const jids = list.map(a => a.session.remoteJid).filter(Boolean);
            if (jids.length) {
                const rows = await db.seguimiento.findMany({
                    where: { remoteJid: { in: jids }, followUpStatus: 'pending' },
                    select: { remoteJid: true },
                });
                for (const r of rows) {
                    if (r.remoteJid) seguimientosCount[r.remoteJid] = (seguimientosCount[r.remoteJid] ?? 0) + 1;
                }
            }
        } catch (segErr) {
            console.error('Error cargando seguimientos:', segErr);
        }

        return {
            success: true,
            message: 'Citas obtenidas correctamente.',
            data: list,
            seguimientosCount,
        };
    } catch (error) {
        console.error('Error al obtener citas:', error);
        return {
            success: false,
            message: 'Error al obtener las citas.',
        };
    }
}

//Crear una cita
export async function createAppointment(input: CreateAppointmentInput): Promise<AppointmentOperationResponse> {
    const {
        userId,
        sessionId: requestedSessionId,
        pushName,
        phone,
        instanceName,
        startTime,
        endTime,
        timezone,
        serviceId,
    } = input;
    const normalizedPushName = pushName.trim();

    if (!userId || !normalizedPushName || !phone || !instanceName || !startTime || !endTime || !timezone || !serviceId) {
        return {
            success: false,
            message: 'Faltan campos requeridos.',
        };
    }

    const start = parseISO(startTime);
    const end = parseISO(endTime);
    if (isBefore(end, start)) {
        return {
            success: false,
            message: 'La hora final no puede ser menor a la hora inicial.',
        };
    }

    try {
        // Validar tiempo mínimo de anticipación
        const userNotice = await db.user.findUnique({ where: { id: userId }, select: { minNoticeMinutes: true } });
        if (userNotice && userNotice.minNoticeMinutes > 0) {
            const earliestAllowed = addMinutes(new Date(), userNotice.minNoticeMinutes);
            if (isBefore(start, earliestAllowed)) {
                return { success: false, message: `Debes agendar con al menos ${userNotice.minNoticeMinutes} minutos de anticipación.` };
            }
        }
        let sessionId = requestedSessionId;

        if (sessionId) {
            const existingSession = await db.session.findFirst({
                where: {
                    id: sessionId,
                    userId,
                },
                select: {
                    id: true,
                    pushName: true,
                },
            });

            if (!existingSession) {
                return {
                    success: false,
                    message: 'No se encontr\u00f3 la sesi\u00f3n asociada a la cita.',
                };
            }

            if ((existingSession.pushName ?? '').trim() !== normalizedPushName) {
                await db.session.update({
                    where: { id: existingSession.id },
                    data: {
                        pushName: normalizedPushName,
                    },
                });
            }
        } else {
            const register = await registerSession({
                userId,
                remoteJid: phone,
                pushName: normalizedPushName,
                instanceId: instanceName,
            });

            if (!register.success || !register.data) {
                return {
                    success: false,
                    message: register.message || 'Error al registrar sesi\u00f3n.',
                };
            }

            sessionId = register.data.id;
        }

        const overlap = await db.appointment.findFirst({
            where: {
                userId,
                status: { in: ['PENDIENTE', 'CONFIRMADA', 'ATENDIDA'] },
                OR: [
                    {
                        startTime: {
                            lt: end,
                        },
                        endTime: {
                            gt: start,
                        },
                    },
                ],
            },
        });

        if (overlap) {
            return {
                success: false,
                message: 'Ya existe una cita registrada en ese horario.',
            };
        }

        const created = await db.appointment.create({
            data: {
                userId,
                sessionId,
                clientName: normalizedPushName,
                startTime: start,
                endTime: end,
                timezone,
                status: AppointmentStatus.PENDIENTE,
                serviceId,
            },
        });

        await writeAuditLog({
            userId,
            actorId: await getAuditActorId(),
            entityType: 'appointment',
            entityId: created.id,
            action: 'created',
            summary: `Creo cita para ${normalizedPushName}`,
            metadata: {
                sessionId,
                status: created.status,
                startTime: created.startTime.toISOString(),
                endTime: created.endTime.toISOString(),
                serviceId,
            },
        });

        return {
            success: true,
            message: 'Cita creada exitosamente.',
            data: created,
        };
    } catch (error) {
        console.error('Error al crear la cita:', error);
        return {
            success: false,
            message: 'Error al crear la cita.',
        };
    }
}

//Actualizar estado de cita
export async function sendAppointmentStatusNotification(
    appointmentId: string,
    status: AppointmentStatus,
): Promise<void> {
    if (status === 'FINALIZADO' || status === 'DESCARTADO') return;
    try {
        const appt = await db.appointment.findUnique({
            where: { id: appointmentId },
            include: {
                session: true,
                service: true,
                user: {
                    select: {
                        apiKey: { select: { url: true, key: true } },
                        instancias: { take: 1, select: { instanceName: true } },
                    },
                },
            },
        });
        if (!appt) return;

        const apiKeyUrl = appt.user?.apiKey?.url;
        const apiKeyValue = appt.user?.apiKey?.key;
        const instanceName = appt.user?.instancias?.[0]?.instanceName;
        const remoteJid = appt.session.remoteJid;
        if (!apiKeyUrl || !apiKeyValue || !instanceName) return;

        const { buildStatusOwnerMessage } = await import('@/app/(root)/schedule/helpers/buildStatusOwnerMessage');
        const { sendMessageWithHistoryAction } = await import('@/actions/chat-history/send-message-with-history-action');

        const message = buildStatusOwnerMessage({
            appointment: appt as unknown as import('@/app/(root)/schedule/helpers/normalizeAppointmentsToEvents').AppointmentWithSession,
            newStatus: status,
            userId: appt.userId,
        });

        await sendMessageWithHistoryAction({
            instanceName,
            url: `https://${apiKeyUrl}/message/sendText/${instanceName}`,
            apikey: apiKeyValue,
            remoteJid,
            message,
            historyType: 'notification',
            additionalKwargs: { source: 'AgendaStatusChange', appointmentId, nextStatus: status },
        });
    } catch { /* silent */ }
}

export async function updateAppointmentStatus(
    id: string,
    status: AppointmentStatus
): Promise<AppointmentOperationResponse> {
    try {
        const updated = await db.appointment.update({
            where: { id },
            data: { status },
            include: { session: true },
        });

        await writeAuditLog({
            userId: updated.userId,
            actorId: await getAuditActorId(),
            entityType: 'appointment',
            entityId: id,
            action: 'status_changed',
            summary: `Cambio la cita a ${status}`,
            metadata: {
                status,
                sessionId: updated.sessionId,
            },
        });

        // Al cancelar: borrar seguimientos de la cita (appt-confirm-*, appt-reminder-*)
        // y los legacy reminder-* que correspondan a plantillas isSchedule=true de este usuario.
        if (status === 'CANCELADA') {
            const instancia = updated.session?.instanceId;
            const remoteJid = updated.session?.remoteJid;
            if (instancia && remoteJid) {
                // Formato nuevo: appt-reminder-{id} — identificación directa sin ambigüedad
                // Formato legacy: reminder-{id} — buscar cuáles pertenecen a esta cita
                // mediante reverse-lookup: extraer IDs de los seguimientos existentes
                // y verificar que su Reminders padre tenga isSchedule=true para este usuario.
                const legacyReminderSeguimientos = await db.seguimiento.findMany({
                    where: { instancia, remoteJid, idNodo: { startsWith: 'reminder-' } },
                    select: { idNodo: true },
                });
                const candidateIds = legacyReminderSeguimientos
                    .map((s) => s.idNodo?.replace(/^reminder-/, '') ?? '')
                    .filter(Boolean);
                const validLegacyIds = candidateIds.length > 0
                    ? (await db.reminders.findMany({
                        where: { id: { in: candidateIds }, userId: updated.userId, isSchedule: true },
                        select: { id: true },
                      })).map((r) => `reminder-${r.id}`)
                    : [];

                const orFilter = [
                    { idNodo: null },
                    { idNodo: "" },                                // registros viejos con idNodo vacío
                    { idNodo: { startsWith: 'appt-confirm-' } },
                    { idNodo: { startsWith: 'appt-reminder-' } },
                    ...(validLegacyIds.length > 0 ? [{ idNodo: { in: validLegacyIds } }] : []),
                ];
                await db.seguimiento.deleteMany({
                    where: { instancia, remoteJid, OR: orFilter },
                });
            }
        }

        return {
            success: true,
            message: 'Estado actualizado correctamente.',
            data: updated,
        };
    } catch (error) {
        console.error('Error al actualizar estado de la cita:', error);
        return {
            success: false,
            message: 'No se pudo actualizar el estado.',
        };
    }
}

export async function updateAppointmentDetails(
    id: string,
    data: { startTime?: string; endTime?: string; serviceId?: string; timezone?: string }
): Promise<AppointmentOperationResponse> {
    try {
        const updateData: Record<string, unknown> = {};
        if (data.startTime) updateData.startTime = new Date(data.startTime);
        if (data.endTime) updateData.endTime = new Date(data.endTime);
        if (data.serviceId) updateData.serviceId = data.serviceId;
        if (data.timezone) updateData.timezone = data.timezone;

        const updated = await db.appointment.update({
            where: { id },
            data: updateData,
            include: { service: { select: { name: true } } },
        });
        await writeAuditLog({
            userId: updated.userId,
            actorId: await getAuditActorId(),
            entityType: 'appointment',
            entityId: id,
            action: 'updated',
            summary: 'Actualizo los datos de la cita',
            metadata: {
                fields: Object.keys(updateData),
                startTime: updated.startTime.toISOString(),
                endTime: updated.endTime.toISOString(),
                serviceId: updated.serviceId,
            },
        });
        return { success: true, message: 'Cita actualizada correctamente.', data: updated };
    } catch (error) {
        console.error('Error al actualizar cita:', error);
        return { success: false, message: 'Error al actualizar la cita.' };
    }
}

//Eliminar una cita
export async function deleteAppointment(id: string): Promise<AppointmentOperationResponse> {
    try {
        const deleted = await db.appointment.delete({ where: { id } });
        await writeAuditLog({
            userId: deleted.userId,
            actorId: await getAuditActorId(),
            entityType: 'appointment',
            entityId: id,
            action: 'deleted',
            summary: 'Elimino la cita',
            metadata: {
                sessionId: deleted.sessionId,
                status: deleted.status,
                startTime: deleted.startTime.toISOString(),
            },
        });

        return {
            success: true,
            message: 'Cita eliminada correctamente.',
        };
    } catch (error) {
        console.error('Error al eliminar la cita:', error);
        return {
            success: false,
            message: 'No se pudo eliminar la cita.',
        };
    }
}

// Configuración de agenda del usuario (timezone, duración, servicios)
export async function getUserScheduleConfig(userId: string): Promise<{
    success: boolean;
    data?: { timezone: string; meetingDuration: number; services: { id: string; name: string }[] };
    message?: string;
}> {
    try {
        const [user, services] = await Promise.all([
            db.user.findUnique({
                where: { id: userId },
                select: { timezone: true, meetingDuration: true },
            }),
            db.service.findMany({
                where: { userId },
                select: { id: true, name: true },
                orderBy: { order: 'asc' },
            }),
        ]);
        return {
            success: true,
            data: {
                timezone: user?.timezone ?? 'America/Bogota',
                meetingDuration: user?.meetingDuration ?? 30,
                services,
            },
        };
    } catch (error) {
        console.error('Error al obtener configuración de agenda:', error);
        return { success: false, message: 'Error al obtener configuración.' };
    }
}

// Obtener la cita más reciente de una sesión
export type SessionAppointmentCard = {
    id: string;
    status: AppointmentStatus;
    startTime: string;
    endTime: string;
    serviceName: string | null;
};

export async function getLatestAppointmentBySession(sessionId: number): Promise<{
    success: boolean;
    data?: SessionAppointmentCard | null;
    message?: string;
}> {
    try {
        const appt = await db.appointment.findFirst({
            where: { sessionId },
            include: { service: { select: { name: true } } },
            orderBy: { startTime: 'desc' },
        });

        return {
            success: true,
            data: appt
                ? {
                      id: appt.id,
                      status: appt.status,
                      startTime: appt.startTime.toISOString(),
                      endTime: appt.endTime.toISOString(),
                      serviceName: appt.service?.name ?? null,
                  }
                : null,
        };
    } catch (error) {
        console.error('Error al obtener cita por sesión:', error);
        return { success: false, message: 'Error al obtener la cita.' };
    }
}

// Obtener todas las citas de una sesión
export async function getAppointmentsBySession(sessionId: number): Promise<{
    success: boolean;
    data?: SessionAppointmentCard[];
    message?: string;
}> {
    try {
        const list = await db.appointment.findMany({
            where: { sessionId },
            include: { service: { select: { name: true } } },
            orderBy: { startTime: 'desc' },
        });

        return {
            success: true,
            data: list.map((a) => ({
                id: a.id,
                status: a.status,
                startTime: a.startTime.toISOString(),
                endTime: a.endTime.toISOString(),
                serviceName: a.service?.name ?? null,
            })),
        };
    } catch (error) {
        console.error('Error al obtener citas por sesión:', error);
        return { success: false, message: 'Error al obtener las citas.' };
    }
}

// Conteos de citas por estado
export async function getAppointmentStatusCounts(userId: string): Promise<{
    success: boolean;
    data?: { status: AppointmentStatus; count: number }[];
    message?: string;
}> {
    try {
        const counts = await db.appointment.groupBy({
            by: ['status'],
            where: { userId },
            _count: { id: true },
        });
        return {
            success: true,
            data: counts.map((c) => ({ status: c.status, count: c._count.id })),
        };
    } catch (error) {
        console.error('Error al obtener conteos de citas:', error);
        return { success: false, message: 'Error al obtener conteos.' };
    }
}

// Tipo para el Kanban de agenda
export type AgendaKanbanCard = {
    id: string;
    status: AppointmentStatus;
    startTime: string;
    endTime: string;
    pushName: string | null;
    remoteJid: string;
    serviceName: string | null;
    tags: { id: number; name: string; color: string | null }[];
};

// Obtener citas para el Kanban
export async function getAppointmentsForKanban(userId: string): Promise<{
    success: boolean;
    data?: AgendaKanbanCard[];
    message?: string;
}> {
    try {
        const list = await db.appointment.findMany({
            where: { userId },
            include: {
                session: { select: { pushName: true, remoteJid: true, sessionTags: { include: { tag: { select: { id: true, name: true, color: true } } } } } },
                service: { select: { name: true } },
            },
            orderBy: { startTime: 'asc' },
        });

        return {
            success: true,
            data: list.map((a) => ({
                id: a.id,
                status: a.status,
                startTime: a.startTime.toISOString(),
                endTime: a.endTime.toISOString(),
                pushName: a.clientName || a.session.pushName,
                remoteJid: a.session.remoteJid,
                serviceName: a.service?.name ?? null,
                tags: a.session.sessionTags.map((st) => ({ id: st.tag.id, name: st.tag.name, color: st.tag.color })),
            })),
        };
    } catch (error) {
        console.error('Error al obtener citas para kanban:', error);
        return { success: false, message: 'Error al cargar el tablero.' };
    }
}
