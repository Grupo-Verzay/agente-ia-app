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
 * **«Pendiente» es lo que queda POR ATENDER**: una cita en estado PENDIENTE
 * cuya hora de fin todavía no ha pasado. Una de ayer que nadie cambió de estado
 * ya no se va a atender, y contarla infla el número que se mira para saber qué
 * falta. Se mira el FIN y no el inicio: la de las 9 que está en curso sigue
 * pendiente. Los demás estados cuentan todas las fechas, como siempre.
 *
 * La puerta NO está aquí: quien llama ya resolvió las cuentas o el equipo con
 * su puerta de siempre.
 */
export type ConteoPorEstado = { status: AppointmentStatus; count: number };

/** Las citas de la Agenda de esas cuentas, por estado. */
export async function lasCitasPorEstado(cuentas: readonly string[]): Promise<ConteoPorEstado[]> {
    if (cuentas.length === 0) return [];
    const where = { userId: { in: [...cuentas] } };
    const [filas, porAtender] = await Promise.all([
        db.appointment.groupBy({ by: ["status"], where: { ...where, status: { not: "PENDIENTE" } }, _count: { id: true } }),
        db.appointment.count({ where: { ...where, status: "PENDIENTE", endTime: { gte: new Date() } } }),
    ]);
    return conLasPorAtender(filas.map((c) => ({ status: c.status, count: c._count.id })), porAtender);
}

/** Las reservas de Multiagenda de ese equipo, por estado. */
export async function lasReservasPorEstado(teamId: string): Promise<ConteoPorEstado[]> {
    const [filas, porAtender] = await Promise.all([
        db.bookingAppointment.groupBy({ by: ["status"], where: { teamId, status: { not: "PENDIENTE" } }, _count: { id: true } }),
        db.bookingAppointment.count({ where: { teamId, status: "PENDIENTE", endTime: { gte: new Date() } } }),
    ]);
    return conLasPorAtender(filas.map((c) => ({ status: c.status as AppointmentStatus, count: c._count.id })), porAtender);
}

/** Pone la fila PENDIENTE con las que quedan por atender (sin fila si son 0). */
function conLasPorAtender(filas: ConteoPorEstado[], porAtender: number): ConteoPorEstado[] {
    return porAtender > 0 ? [...filas, { status: "PENDIENTE" as AppointmentStatus, count: porAtender }] : filas;
}
