'use server';

import { db } from '@/lib/db';
import { AppointmentStatus } from '@prisma/client';
import {
    addMinutes,
    format,
    parseISO,
    setHours,
    setMinutes,
    setSeconds,
    setMilliseconds,
    isBefore,
    isAfter,
    startOfDay,
    endOfDay,
} from 'date-fns';
import { toZonedTime, fromZonedTime } from 'date-fns-tz';

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
    data: { name?: string; description?: string; timezone?: string; isActive?: boolean },
): Promise<OpResult<{ id: string }>> {
    try {
        const updated = await db.team.update({ where: { id: teamId }, data, select: { id: true } });
        return { success: true, message: 'Equipo actualizado.', data: updated };
    } catch (error) {
        console.error('[updateTeam]', error);
        return { success: false, message: 'Error al actualizar el equipo.' };
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
    data: { name?: string; bio?: string; photo?: string; color?: string; isActive?: boolean },
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
    data: { name: string; description?: string; duration: number; messageText?: string; color?: string; order?: number },
) {
    try {
        const service = await db.teamService.create({ data: { teamId, ...data } });
        return { success: true, message: 'Servicio creado.', data: service };
    } catch (error) {
        console.error('[createTeamService]', error);
        return { success: false, message: 'Error al crear el servicio.' };
    }
}

export async function updateTeamService(
    serviceId: string,
    data: { name?: string; description?: string; duration?: number; messageText?: string; color?: string; order?: number; isActive?: boolean },
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
): Promise<{ success: boolean; message?: string; data?: BookingSlot[] }> {
    try {
        // Obtener disponibilidad del miembro para ese día de la semana
        const [year, month, day] = ymd.split('-').map(Number);
        const localMidnight = new Date(year, month - 1, day, 0, 0, 0, 0);
        const dayOfWeek = localMidnight.getDay();

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

            while (isBefore(addMinutes(cursor, durationMinutes), blockEnd) ||
                   addMinutes(cursor, durationMinutes).getTime() === blockEnd.getTime()) {
                const slotEnd = addMinutes(cursor, durationMinutes);

                // Verificar si choca con una cita existente
                const busy = existing.some(
                    (appt) => isBefore(cursor, appt.endTime) && isAfter(slotEnd, appt.startTime),
                );

                if (!busy) {
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
                // Todos los miembros activos del equipo (fallback cuando un servicio no tiene asignados)
                members: {
                    where: { isActive: true },
                    select: { id: true, name: true, bio: true, photo: true, color: true },
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
                        members: {
                            select: {
                                teamMember: {
                                    select: { id: true, name: true, bio: true, photo: true, color: true },
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
