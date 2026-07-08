'use server'

import { db } from '@/lib/db';
import { addMinutes } from 'date-fns';
import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz";

interface Slot {
    startTime: string; // ISO UTC
    endTime: string;
}
interface AvailableSlotsResponse {
    success: boolean;
    message: string;
    data?: Slot[];
}

// helper: avanza un día sobre un YYYY-MM-DD sin usar la TZ del sistema
function nextLocalDateStr(ymd: string): string {
    const [y, m, d] = ymd.split('-').map(Number);
    const u = new Date(Date.UTC(y, m - 1, d));
    u.setUTCDate(u.getUTCDate() + 1);
    const yyyy = u.getUTCFullYear();
    const mm = String(u.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(u.getUTCDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

export async function getAvailableSlots(
    userId: string,
    dateYmd: string,
    slotDuration: number,
    serverTimeZone: string
): Promise<AvailableSlotsResponse> {
    if (!userId || !dateYmd || !slotDuration) {
        return { success: false, message: 'Parámetros requeridos faltantes (userId, date o slotDuration).' };
    }

    try {
        // 1) TZ y minNoticeMinutes del dueño
        const user = await db.user.findUnique({ where: { id: userId }, select: { timezone: true, minNoticeMinutes: true } });
        const ownerTz = user?.timezone || serverTimeZone;
        const minNoticeMinutes = user?.minNoticeMinutes ?? 0;

        // 2) Fechas locales puras (YYYY-MM-DD) en la TZ del dueño
        const selectedDayLocal = formatInTimeZone(dateYmd, ownerTz, 'yyyy-MM-dd');
        const todayLocal = formatInTimeZone(new Date(), ownerTz, 'yyyy-MM-dd');

        // Si el día seleccionado ya pasó -> sin disponibilidad
        if (selectedDayLocal < todayLocal) {
            return { success: true, message: 'El día seleccionado ya pasó.', data: [] };
        }

        // 3) Límites del día (local dueño) → UTC (¡sin startOfDay/addDays!)
        const dayStartUtc = fromZonedTime(`${selectedDayLocal} 00:00:00`, ownerTz);
        const nextDayLocal = nextLocalDateStr(selectedDayLocal);
        const nextDayStartUtc = fromZonedTime(`${nextDayLocal} 00:00:00`, ownerTz);

        // 4) Weekday en la TZ del dueño (para la tabla UserAvailability)
        const weekdayInOwnerTz = toZonedTime(dayStartUtc, ownerTz).getDay();

        const availability = await db.userAvailability.findMany({
            where: { userId, dayOfWeek: weekdayInOwnerTz },
            orderBy: [{ startTime: 'asc' }],
        });
        if (!availability.length) {
            return { success: true, message: 'No hay horarios disponibles para este día.', data: [] };
        }

        // 5) Citas ocupadas (consulta en UTC)
        const appointments = await db.appointment.findMany({
            where: {
                userId,
                startTime: { gte: dayStartUtc, lt: nextDayStartUtc },
                status: { in: ['PENDIENTE', 'CONFIRMADA', 'ATENDIDA'] },
            },
            select: { startTime: true, endTime: true },
            orderBy: { startTime: 'asc' },
        });
        const takenRanges = appointments.map(a => ({ start: a.startTime, end: a.endTime }));

        // 6) Corte mínimo: ahora + minNoticeMinutes (aplica siempre, no solo hoy)
        const earliestAllowed = addMinutes(new Date(), minNoticeMinutes);
        const nowUtcCutoff = earliestAllowed > dayStartUtc ? earliestAllowed : dayStartUtc;

        // 7) Construcción de slots HH:mm (local dueño) → UTC
        const availableSlots: Slot[] = [];
        for (const range of availability) {
            const [sh, sm] = range.startTime.split(':').map(Number);
            const [eh, em] = range.endTime.split(':').map(Number);
            if ([sh, sm, eh, em].some(Number.isNaN)) continue;

            const rangeStartUtc = fromZonedTime(`${selectedDayLocal} ${range.startTime}:00`, ownerTz);
            const rangeEndUtc = fromZonedTime(`${selectedDayLocal} ${range.endTime}:00`, ownerTz);

            let cursorUtc = new Date(rangeStartUtc);
            while (cursorUtc < rangeEndUtc) {
                const slotStartUtc = new Date(cursorUtc);
                const slotEndUtc = new Date(slotStartUtc.getTime() + slotDuration * 60 * 1000);

                // El turno define las horas de INICIO permitidas: basta con que el
                // inicio caiga dentro del rango (la cita puede terminar después del
                // fin del turno). Así cada turno configurado en Disponibilidad se
                // ofrece al cliente aunque sea más corto que la duración del servicio
                // (p. ej. un turno de noche 19:00-20:00 con servicio de 180 min
                // muestra 19:00), y un turno largo ofrece varios inicios.
                const insideRange = slotStartUtc < rangeEndUtc;
                const notTaken = !takenRanges.some(r => slotStartUtc < r.end && slotEndUtc > r.start);
                const notPast = slotStartUtc >= nowUtcCutoff;

                if (insideRange && notTaken && notPast) {
                    availableSlots.push({
                        startTime: slotStartUtc.toISOString(),
                        endTime: slotEndUtc.toISOString(),
                    });
                }
                cursorUtc = new Date(cursorUtc.getTime() + slotDuration * 60 * 1000);
            }
        }

        return { success: true, message: 'Horarios disponibles obtenidos correctamente.', data: availableSlots };
    } catch (err) {
        console.error('Error en getAvailableSlots:', err);
        return { success: false, message: 'Ocurrió un error al obtener los horarios disponibles.' };
    }
}
