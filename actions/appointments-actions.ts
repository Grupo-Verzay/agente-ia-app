'use server';

import { db } from '@/lib/db';
import { Appointment, AppointmentStatus } from '@prisma/client';
import { parseISO, isBefore } from 'date-fns';
import { registerSession } from './session-action';
import { deleteReminderByInstanceUserRemote } from './seguimientos-actions';

interface AppointmentOperationResponse {
    success: boolean;
    message: string;
    data?: Appointment | Appointment[];
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
                session: true,
                service: true,
            },
            orderBy: { startTime: 'asc' },
        });

        return {
            success: true,
            message: 'Citas obtenidas correctamente.',
            data: list,
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
                startTime: start,
                endTime: end,
                timezone,
                status: AppointmentStatus.PENDIENTE,
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
export async function updateAppointmentStatus(
    id: string,
    status: AppointmentStatus
): Promise<AppointmentOperationResponse> {
    try {
        const updated = await db.appointment.update({
            where: { id },
            data: { status },
            include: {
                session: true,
            },
        });

        if (status === 'CANCELADA') {
            const userId = updated.userId;
            const instanceName = updated.session.instanceId;
            const remoteJid = updated.session.remoteJid;

            if (instanceName && userId && remoteJid) {
                const del = await deleteReminderByInstanceUserRemote(
                    instanceName,
                    userId,
                    remoteJid
                );

                if (!del.success) {
                    console.warn('[updateAppointmentStatus] No se pudieron eliminar seguimientos:', del.message);

                    return {
                        success: false,
                        message: 'No se pudieron eliminar seguimientos.',
                    };
                }
            } else {
                console.warn(
                    '[updateAppointmentStatus] Faltan datos para eliminar seguimientos:',
                    { instanceName, userId, remoteJid }
                );

                return {
                    success: false,
                    message: 'Faltan datos para eliminar seguimientos.',
                };
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

//Eliminar una cita
export async function deleteAppointment(id: string): Promise<AppointmentOperationResponse> {
    try {
        await db.appointment.delete({ where: { id } });

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
