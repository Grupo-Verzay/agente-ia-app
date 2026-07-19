'use server';

import { db } from '@/lib/db';
import { AppointmentStatus } from '@prisma/client';
import {
    addMinutes,
    format,
    parseISO,
    isBefore,
    isAfter,
} from 'date-fns';
import { es } from 'date-fns/locale';
import { toZonedTime, fromZonedTime } from 'date-fns-tz';
import { DEFAULT_SERVICE_REMINDERS } from '@/types/reminder';
import { serviceDefaultMsg } from '@/app/(root)/schedule/_components/services/defaultServiceValues';

// ─── Tipos de respuesta ───────────────────────────────────────────────────────

type OpResult<T = undefined> = T extends undefined
    ? { success: boolean; message: string }
    : { success: boolean; message: string; data?: T };

// ─── EQUIPO (Team) ────────────────────────────────────────────────────────────

export async function getOrCreateTeam(userId: string) {
    try {
        let team = await db.team.findUnique({
            where: { userId },
            include: {
                members: {
                    where: { isActive: true },
                    include: {
                        availability: { orderBy: { dayOfWeek: 'asc' } },
                        services: { select: { teamServiceId: true } },
                    },
                    orderBy: { name: 'asc' },
                },
                services: {
                    where: { isActive: true },
                    orderBy: { order: 'asc' },
                },
            },
        });

        if (!team) {
            const user = await db.user.findUnique({ where: { id: userId }, select: { name: true, timezone: true } });
            team = await db.team.create({
                data: {
                    userId,
                    name: `Equipo de ${user?.name ?? 'Mi Empresa'}`,
                    timezone: user?.timezone ?? 'America/Bogota',
                },
                include: {
                    members: {
                        where: { isActive: true },
                        include: {
                            availability: { orderBy: { dayOfWeek: 'asc' } },
                            services: { select: { teamServiceId: true } },
                        },
                        orderBy: { name: 'asc' },
                    },
                    services: {
                        where: { isActive: true },
                        orderBy: { order: 'asc' },
                    },
                },
            });
        }

        return { success: true, message: 'Equipo obtenido.', data: team };
    } catch (error) {
        console.error('[getOrCreateTeam]', error);
        return { success: false, message: 'Error al obtener el equipo.' };
    }
}

export async function updateTeam(
    teamId: string,
    data: { name?: string; description?: string; timezone?: string; isActive?: boolean; minNoticeMinutes?: number },
): Promise<OpResult<{ id: string }>> {
    try {
        const updated = await db.team.update({ where: { id: teamId }, data, select: { id: true } });
        return { success: true, message: 'Equipo actualizado.', data: updated };
    } catch (error) {
        console.error('[updateTeam]', error);
        return { success: false, message: 'Error al actualizar el equipo.' };
    }
}

export async function getBookingStatusCounts(teamId: string): Promise<{
    success: boolean;
    data?: { status: AppointmentStatus; count: number }[];
    message?: string;
}> {
    try {
        const counts = await db.bookingAppointment.groupBy({
            by: ['status'],
            where: { teamId },
            _count: { id: true },
        });
        return {
            success: true,
            data: counts.map((c) => ({ status: c.status as AppointmentStatus, count: c._count.id })),
        };
    } catch (error) {
        console.error('[getBookingStatusCounts]', error);
        return { success: false, message: 'Error al obtener conteos.' };
    }
}

// ─── ESPECIALISTAS (TeamMember) ───────────────────────────────────────────────

export async function getTeamMembers(teamId: string) {
    try {
        const members = await db.teamMember.findMany({
            where: { teamId },
            include: {
                availability: { orderBy: { dayOfWeek: 'asc' } },
                services: { select: { teamServiceId: true } },
            },
            orderBy: { name: 'asc' },
        });
        return { success: true, message: 'Especialistas obtenidos.', data: members };
    } catch (error) {
        console.error('[getTeamMembers]', error);
        return { success: false, message: 'Error al obtener especialistas.' };
    }
}

export async function createTeamMember(
    teamId: string,
    data: { name: string; bio?: string; photo?: string; color?: string },
) {
    try {
        const member = await db.teamMember.create({ data: { teamId, ...data } });
        return { success: true, message: 'Especialista creado.', data: member };
    } catch (error) {
        console.error('[createTeamMember]', error);
        return { success: false, message: 'Error al crear el especialista.' };
    }
}

export async function updateTeamMember(
    memberId: string,
    data: { name?: string; bio?: string; photo?: string; color?: string; isActive?: boolean; defaultDuration?: number; meetingLink?: string | null; minNoticeMinutes?: number },
) {
    try {
        const member = await db.teamMember.update({ where: { id: memberId }, data });
        return { success: true, message: 'Especialista actualizado.', data: member };
    } catch (error) {
        console.error('[updateTeamMember]', error);
        return { success: false, message: 'Error al actualizar el especialista.' };
    }
}

export async function deleteTeamMember(memberId: string): Promise<OpResult> {
    try {
        await db.teamMember.delete({ where: { id: memberId } });
        return { success: true, message: 'Especialista eliminado.' };
    } catch (error) {
        console.error('[deleteTeamMember]', error);
        return { success: false, message: 'Error al eliminar el especialista.' };
    }
}

// ─── DISPONIBILIDAD (TeamMemberAvailability) ──────────────────────────────────

export type AvailabilitySlot = {
    dayOfWeek: number; // 0=Domingo … 6=Sábado
    startTime: string; // "HH:mm"
    endTime: string;   // "HH:mm"
};

export async function setMemberAvailability(
    memberId: string,
    slots: AvailabilitySlot[],
): Promise<OpResult> {
    try {
        await db.$transaction([
            db.teamMemberAvailability.deleteMany({ where: { teamMemberId: memberId } }),
            db.teamMemberAvailability.createMany({
                data: slots.map((s) => ({ teamMemberId: memberId, ...s })),
                skipDuplicates: true,
            }),
        ]);
        return { success: true, message: 'Disponibilidad guardada.' };
    } catch (error) {
        console.error('[setMemberAvailability]', error);
        return { success: false, message: 'Error al guardar la disponibilidad.' };
    }
}

// ─── SERVICIOS (TeamService) ──────────────────────────────────────────────────

export async function getTeamServices(teamId: string) {
    try {
        const services = await db.teamService.findMany({
            where: { teamId },
            include: { members: { select: { teamMemberId: true } } },
            orderBy: { order: 'asc' },
        });
        return { success: true, message: 'Servicios obtenidos.', data: services };
    } catch (error) {
        console.error('[getTeamServices]', error);
        return { success: false, message: 'Error al obtener servicios.' };
    }
}

export async function createTeamService(
    teamId: string,
    data: { name: string; description?: string; duration: number; messageText?: string; remindersConfig?: any; color?: string; order?: number },
) {
    try {
        // Sembrar valores por defecto al crear: mensaje de confirmación y los 5
        // recordatorios por servicio, salvo que ya vengan definidos.
        const hasReminders =
            Array.isArray(data.remindersConfig) && data.remindersConfig.length > 0;
        const remindersConfig = hasReminders
            ? data.remindersConfig
            : DEFAULT_SERVICE_REMINDERS;
        const messageText = data.messageText?.trim() ? data.messageText : serviceDefaultMsg;

        const service = await db.teamService.create({
            data: { teamId, ...data, messageText, remindersConfig },
        });
        return { success: true, message: 'Servicio creado.', data: service };
    } catch (error) {
        console.error('[createTeamService]', error);
        return { success: false, message: 'Error al crear el servicio.' };
    }
}

export async function updateTeamService(
    serviceId: string,
    data: { name?: string; description?: string; duration?: number; messageText?: string; remindersConfig?: any; color?: string; order?: number; isActive?: boolean },
) {
    try {
        const service = await db.teamService.update({ where: { id: serviceId }, data });
        return { success: true, message: 'Servicio actualizado.', data: service };
    } catch (error) {
        console.error('[updateTeamService]', error);
        return { success: false, message: 'Error al actualizar el servicio.' };
    }
}

export async function deleteTeamService(serviceId: string): Promise<OpResult> {
    try {
        await db.teamService.delete({ where: { id: serviceId } });
        return { success: true, message: 'Servicio eliminado.' };
    } catch (error) {
        console.error('[deleteTeamService]', error);
        return { success: false, message: 'Error al eliminar el servicio.' };
    }
}

// ─── ASIGNACIÓN servicio ↔ especialista ───────────────────────────────────────

export async function assignServiceToMember(memberId: string, serviceId: string): Promise<OpResult> {
    try {
        await db.teamMemberService.upsert({
            where: { teamMemberId_teamServiceId: { teamMemberId: memberId, teamServiceId: serviceId } },
            create: { teamMemberId: memberId, teamServiceId: serviceId },
            update: {},
        });
        return { success: true, message: 'Servicio asignado al especialista.' };
    } catch (error) {
        console.error('[assignServiceToMember]', error);
        return { success: false, message: 'Error al asignar el servicio.' };
    }
}

export async function removeServiceFromMember(memberId: string, serviceId: string): Promise<OpResult> {
    try {
        await db.teamMemberService.delete({
            where: { teamMemberId_teamServiceId: { teamMemberId: memberId, teamServiceId: serviceId } },
        });
        return { success: true, message: 'Servicio removido del especialista.' };
    } catch (error) {
        console.error('[removeServiceFromMember]', error);
        return { success: false, message: 'Error al remover el servicio.' };
    }
}

// ─── CITAS BOOKINGS (BookingAppointment) ─────────────────────────────────────

export async function getBookingAppointments(teamId: string) {
    try {
        const list = await db.bookingAppointment.findMany({
            where: { teamId },
            include: {
                teamMember: { select: { id: true, name: true, color: true } },
                teamService: { select: { id: true, name: true, duration: true } },
            },
            orderBy: { startTime: 'asc' },
        });
        return { success: true, message: 'Citas obtenidas.', data: list };
    } catch (error) {
        console.error('[getBookingAppointments]', error);
        return { success: false, message: 'Error al obtener las citas.' };
    }
}

export interface CreateBookingInput {
    teamId: string;
    teamMemberId: string;
    teamServiceId: string;
    clientName: string;
    clientPhone: string;
    startTime: string; // ISO
    endTime: string;   // ISO
    timezone: string;
    notes?: string;
}

export async function createBookingAppointment(input: CreateBookingInput) {
    const { teamId, teamMemberId, teamServiceId, clientName, clientPhone, startTime, endTime, timezone, notes } = input;

    if (!teamId || !teamMemberId || !teamServiceId || !clientName || !clientPhone || !startTime || !endTime) {
        return { success: false, message: 'Faltan campos requeridos.' };
    }

    const start = parseISO(startTime);
    const end = parseISO(endTime);
    if (isBefore(end, start)) {
        return { success: false, message: 'La hora final no puede ser menor a la hora inicial.' };
    }

    try {
        // Validar tiempo mínimo de anticipación (especialista sobreescribe al equipo)
        const [team, member] = await Promise.all([
            db.team.findUnique({ where: { id: teamId }, select: { minNoticeMinutes: true } }),
            db.teamMember.findUnique({ where: { id: teamMemberId }, select: { minNoticeMinutes: true } }),
        ]);
        const effectiveNotice = (member?.minNoticeMinutes ?? 0) > 0
            ? member!.minNoticeMinutes
            : (team?.minNoticeMinutes ?? 0);
        if (effectiveNotice > 0) {
            const earliestAllowed = addMinutes(new Date(), effectiveNotice);
            if (isBefore(start, earliestAllowed)) {
                return { success: false, message: `Debes agendar con al menos ${effectiveNotice} minutos de anticipación.` };
            }
        }
        const overlap = await db.bookingAppointment.findFirst({
            where: {
                teamMemberId,
                status: { in: ['PENDIENTE', 'CONFIRMADA', 'ATENDIDA'] },
                startTime: { lt: end },
                endTime: { gt: start },
            },
        });

        if (overlap) {
            return { success: false, message: 'El especialista ya tiene una cita en ese horario.' };
        }

        const appt = await db.bookingAppointment.create({
            data: {
                teamId,
                teamMemberId,
                teamServiceId,
                clientName: clientName.trim(),
                clientPhone,
                startTime: start,
                endTime: end,
                timezone,
                status: AppointmentStatus.PENDIENTE,
                notes,
            },
        });

        return { success: true, message: 'Cita agendada exitosamente.', data: appt };
    } catch (error) {
        console.error('[createBookingAppointment]', error);
        return { success: false, message: 'Error al crear la cita.' };
    }
}

export async function updateBookingAppointmentStatus(id: string, status: AppointmentStatus): Promise<OpResult> {
    try {
        await db.bookingAppointment.update({ where: { id }, data: { status } });
        return { success: true, message: 'Estado actualizado.' };
    } catch (error) {
        console.error('[updateBookingAppointmentStatus]', error);
        return { success: false, message: 'Error al actualizar el estado.' };
    }
}

export async function deleteBookingAppointment(id: string): Promise<OpResult> {
    try {
        await db.bookingAppointment.delete({ where: { id } });
        return { success: true, message: 'Cita eliminada.' };
    } catch (error) {
        console.error('[deleteBookingAppointment]', error);
        return { success: false, message: 'Error al eliminar la cita.' };
    }
}

// ─── SLOTS DISPONIBLES ────────────────────────────────────────────────────────

export type BookingSlot = {
    startTime: string; // ISO
    endTime: string;   // ISO
    label: string;     // "9:00 AM"
};

export async function getAvailableBookingSlots(
    memberId: string,
    ymd: string,           // "yyyy-MM-dd" en timezone del team
    durationMinutes: number,
    teamTimezone: string,
    minNoticeMinutes: number = 0,
): Promise<{ success: boolean; message?: string; data?: BookingSlot[] }> {
    try {
        // Obtener disponibilidad del miembro para ese día de la semana
        const [year, month, day] = ymd.split('-').map(Number);
        const localMidnight = new Date(year, month - 1, day, 0, 0, 0, 0);
        const dayOfWeek = localMidnight.getDay();
        // Tiempo mínimo de anticipación: no mostrar slots antes de (ahora + minNoticeMinutes)
        const earliestAllowed = addMinutes(new Date(), minNoticeMinutes);

        const availability = await db.teamMemberAvailability.findMany({
            where: { teamMemberId: memberId, dayOfWeek },
        });

        if (!availability.length) {
            return { success: true, data: [], message: 'Sin disponibilidad para ese día.' };
        }

        // Citas existentes del especialista ese día
        const dayStartUtc = fromZonedTime(new Date(year, month - 1, day, 0, 0, 0), teamTimezone);
        const dayEndUtc = fromZonedTime(new Date(year, month - 1, day, 23, 59, 59), teamTimezone);

        const existing = await db.bookingAppointment.findMany({
            where: {
                teamMemberId: memberId,
                status: { in: ['PENDIENTE', 'CONFIRMADA', 'ATENDIDA'] },
                startTime: { gte: dayStartUtc },
                endTime: { lte: dayEndUtc },
            },
            select: { startTime: true, endTime: true },
        });

        const slots: BookingSlot[] = [];

        for (const avail of availability) {
            const [sh, sm] = avail.startTime.split(':').map(Number);
            const [eh, em] = avail.endTime.split(':').map(Number);

            // Construir inicio y fin del bloque en UTC
            let cursor = fromZonedTime(new Date(year, month - 1, day, sh, sm, 0), teamTimezone);
            const blockEnd = fromZonedTime(new Date(year, month - 1, day, eh, em, 0), teamTimezone);

            // El bloque define las horas de INICIO permitidas: basta con que el
            // inicio caiga dentro del bloque (la cita puede terminar después del fin
            // del bloque). Así cada turno configurado se ofrece al cliente aunque sea
            // más corto que la duración del servicio, y un bloque largo ofrece varios
            // inicios (p. ej. 08:00-14:00 con 180 min => 08:00 y 11:00).
            while (isBefore(cursor, blockEnd)) {
                const slotEnd = addMinutes(cursor, durationMinutes);

                // Verificar si choca con una cita existente
                const busy = existing.some(
                    (appt) => isBefore(cursor, appt.endTime) && isAfter(slotEnd, appt.startTime),
                );

                if (!busy && !isBefore(cursor, earliestAllowed)) {
                    const localStart = toZonedTime(cursor, teamTimezone);
                    slots.push({
                        startTime: cursor.toISOString(),
                        endTime: slotEnd.toISOString(),
                        label: format(localStart, 'h:mm a'),
                    });
                }

                cursor = slotEnd;
            }
        }

        return { success: true, data: slots };
    } catch (error) {
        console.error('[getAvailableBookingSlots]', error);
        return { success: false, message: 'Error al calcular los horarios disponibles.' };
    }
}

// ─── DATOS PÚBLICOS (página de booking sin autenticación) ─────────────────────

export async function getPublicTeamData(userId: string) {
    try {
        const team = await db.team.findUnique({
            where: { userId, isActive: true },
            select: {
                id: true,
                name: true,
                description: true,
                timezone: true,
                minNoticeMinutes: true,
                // Todos los miembros activos del equipo (fallback cuando un servicio no tiene asignados)
                members: {
                    where: { isActive: true },
                    select: { id: true, name: true, bio: true, photo: true, color: true, minNoticeMinutes: true },
                    orderBy: { name: 'asc' },
                },
                services: {
                    where: { isActive: true },
                    select: {
                        id: true,
                        name: true,
                        description: true,
                        duration: true,
                        color: true,
                        order: true,
                        messageText: true,
                        members: {
                            select: {
                                teamMember: {
                                    select: { id: true, name: true, bio: true, photo: true, color: true, minNoticeMinutes: true },
                                },
                            },
                        },
                    },
                    orderBy: { order: 'asc' },
                },
            },
        });

        if (!team) return { success: false, message: 'Equipo no encontrado.' };
        return { success: true, message: 'Datos obtenidos.', data: team };
    } catch (error) {
        console.error('[getPublicTeamData]', error);
        return { success: false, message: 'Error al obtener datos del equipo.' };
    }
}

// ─── NOTIFICACIONES WhatsApp ──────────────────────────────────────────────────

export interface BookingNotificationInput {
    userId: string;          // propietario del equipo
    bookingId: string;
    clientName: string;
    clientPhone: string;     // E.164 sin @s.whatsapp.net
    startTimeIso: string;
    endTimeIso: string;
    timezone: string;
    serviceName: string;
    serviceMessageText: string | null;
    memberName: string;
    teamName: string;
}

function replaceVars(template: string, vars: Record<string, string>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
}

export async function sendBookingNotifications(input: BookingNotificationInput): Promise<void> {
    try {
        const {
            userId, clientName, clientPhone,
            startTimeIso, timezone, serviceName,
            serviceMessageText, memberName, teamName,
        } = input;

        // Cargar apiKey + instancia del propietario del equipo
        const userData = await db.user.findUnique({
            where: { id: userId },
            select: {
                notificationNumber: true,
                apiKey: { select: { url: true } },
                instancias: { take: 1, select: { instanceName: true, instanceId: true } },
            },
        });

        const apiKeyUrl  = userData?.apiKey?.url;
        const instance   = userData?.instancias?.[0];
        if (!apiKeyUrl || !instance) return;

        const instanceName = instance.instanceName;
        const apikey       = instance.instanceId;
        const baseUrl      = `https://${apiKeyUrl}`;

        const { sendMessageWithHistoryAction } = await import('@/actions/chat-history/send-message-with-history-action');

        const localStart = toZonedTime(new Date(startTimeIso), timezone);
        const dateLabel  = format(localStart, "d 'de' MMMM 'de' yyyy", { locale: es });
        const hourLabel  = format(localStart, 'h:mm a');

        const clientJid = `${clientPhone.replace(/\D/g, '')}@s.whatsapp.net`;

        // ── Mensaje al cliente ──
        const rawMsg = serviceMessageText?.trim() ||
            `¡Hola {{nombre}}! Tu cita ha sido confirmada.\n📅 {{fecha}} — ⏰ {{hora}}\n🩺 {{servicio}} con {{especialista}}\n\n¡Te esperamos!`;

        const clientMsg = replaceVars(rawMsg, {
            nombre:       clientName,
            fecha:        dateLabel,
            hora:         hourLabel,
            servicio:     serviceName,
            especialista: memberName,
            equipo:       teamName,
        });

        await sendMessageWithHistoryAction({
            instanceName,
            url: `${baseUrl}/message/sendText/${instanceName}`,
            apikey,
            remoteJid: clientJid,
            message: clientMsg,
            historyType: 'notification',
            additionalKwargs: { source: 'BookingConfirmation' },
        }).catch(() => {});

        // ── Notificación al asesor ──
        const ownerPhone = userData?.notificationNumber;
        if (ownerPhone) {
            const ownerJid = ownerPhone.includes('@s.whatsapp.net')
                ? ownerPhone
                : `${ownerPhone.replace(/\D/g, '')}@s.whatsapp.net`;

            const ownerMsg =
                `📅 *Nueva cita en Multi-agenda*\n\n` +
                `👤 *Cliente:* ${clientName}\n` +
                `📱 *WhatsApp:* +${clientPhone.replace(/\D/g, '')}\n` +
                `🩺 *Servicio:* ${serviceName}\n` +
                `👨‍⚕️ *Especialista:* ${memberName}\n` +
                `📅 *Fecha:* ${dateLabel}\n` +
                `⏰ *Hora:* ${hourLabel}`;

            await sendMessageWithHistoryAction({
                instanceName,
                url: `${baseUrl}/message/sendText/${instanceName}`,
                apikey,
                remoteJid: ownerJid,
                message: ownerMsg,
                historyType: 'notification',
                additionalKwargs: {
                    source: 'BookingNotificationOwner',
                    recipient: 'owner',
                    eventType: 'Cita',
                    advisorRequest: false,
                    preformatted: true,
                },
            }).catch(() => {});
        }
    } catch (err) {
        console.error('[sendBookingNotifications]', err);
    }
}
