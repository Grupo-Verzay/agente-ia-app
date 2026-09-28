import "server-only";

import { db } from "@/lib/db";
import type { AppointmentStatus } from "@prisma/client";

/**
 * Cuántas citas hay en cada estado. Es la ÚNICA consulta detrás de las
 * pastillas de estado de Agenda y de Multiagenda **y** del numerito de esos dos
 * apartados en el menú lateral.
 *
 * El número del menú se cuenta aquí, con las mismas cuentas y el mismo `where`
 * que la pastilla «Pendiente» de su pantalla. Con dos consultas parecidas —como
 * había: el menú contaba solo la cuenta propia y solo las citas futuras, y la
 * pantalla todas las cuentas y todas las fechas— la Agenda enseñaba «4
 * pendientes» y el menú ningún número. Dos números para lo mismo que no
 * coinciden se leen como un contador roto.
 *
 * La puerta NO está aquí: quien llama ya resolvió las cuentas o el equipo con
 * su puerta de siempre.
 */
export type ConteoPorEstado = { status: AppointmentStatus; count: number };

/** Las citas de la Agenda de esas cuentas, por estado. */
export async function lasCitasPorEstado(cuentas: readonly string[]): Promise<ConteoPorEstado[]> {
    if (cuentas.length === 0) return [];
    const filas = await db.appointment.groupBy({
        by: ["status"],
        where: { userId: { in: [...cuentas] } },
        _count: { id: true },
    });
    return filas.map((c) => ({ status: c.status, count: c._count.id }));
}

/** Las reservas de Multiagenda de ese equipo, por estado. */
export async function lasReservasPorEstado(teamId: string): Promise<ConteoPorEstado[]> {
    const filas = await db.bookingAppointment.groupBy({
        by: ["status"],
        where: { teamId },
        _count: { id: true },
    });
    return filas.map((c) => ({ status: c.status as AppointmentStatus, count: c._count.id }));
}
