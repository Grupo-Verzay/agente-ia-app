import "server-only";

import { db } from "@/lib/db";
import { losNumerosDelCliente } from "@/lib/reagendar-cita";

/**
 * La cita de una videollamada con IA, venga de Agenda (`Appointment`) o de
 * Multiagenda (`booking_appointments`). Las dos son uuid, así que el id no
 * choca: se pregunta primero a Agenda y, si no está, a Multiagenda.
 *
 * Una reserva de Multiagenda no guarda su conversación: se busca la del cliente
 * en la cuenta dueña del equipo por TODAS las formas de su número (la regla de
 * `laConversacionDeLaReserva`). Sin conversación, `session` es `null` y todo lo
 * que la necesita (contexto del chat, anotar en el CRM) se salta y lo dice.
 *
 * La forma es la MISMA para las dos: quien abre la sala, quien la vigila y
 * quien anota no tienen que saber de qué pantalla salió la cita.
 */

export type SesionDeLaCita = {
    id: number;
    remoteJid: string;
    remoteJidAlt: string | null;
    instanceId: string;
    pushName: string;
    customName: string | null;
    leadStatus: string | null;
    leadScore: number | null;
    leadScoreReason: string | null;
};

export type CitaDeLaVideollamada = {
    id: string;
    /** La cuenta dueña: la de la cita, o la dueña del equipo de la reserva. */
    userId: string;
    /** `null` en una reserva de Multiagenda: no tiene ficha propia. */
    sessionId: number | null;
    clientName: string | null;
    startTime: Date;
    endTime: Date;
    timezone: string;
    status: string;
    /** Solo una cita de Agenda tiene servicio de Agenda. */
    serviceId: string | null;
    createdAt: Date;
    service: { name: string } | null;
    session: SesionDeLaCita | null;
    user: { company: string | null; name: string | null; email: string; timezone: string | null };
    esReserva: boolean;
};

const SESION = {
    id: true,
    remoteJid: true,
    remoteJidAlt: true,
    instanceId: true,
    pushName: true,
    customName: true,
    leadStatus: true,
    leadScore: true,
    leadScoreReason: true,
} as const;

const USUARIO = { company: true, name: true, email: true, timezone: true } as const;

export async function laCitaDeLaVideollamada(citaId: string): Promise<CitaDeLaVideollamada | null> {
    const id = String(citaId ?? "").trim();
    if (!id) return null;

    const cita = await db.appointment.findUnique({
        where: { id },
        select: {
            id: true,
            userId: true,
            sessionId: true,
            clientName: true,
            startTime: true,
            endTime: true,
            timezone: true,
            status: true,
            serviceId: true,
            createdAt: true,
            service: { select: { name: true } },
            session: { select: SESION },
            user: { select: USUARIO },
        },
    });
    if (cita) return { ...(cita as Omit<CitaDeLaVideollamada, "esReserva">), status: String(cita.status), esReserva: false };

    const reserva = await db.bookingAppointment.findUnique({
        where: { id },
        select: {
            id: true,
            clientName: true,
            clientPhone: true,
            startTime: true,
            endTime: true,
            timezone: true,
            status: true,
            createdAt: true,
            teamService: { select: { name: true } },
            team: { select: { userId: true, user: { select: USUARIO } } },
        },
    });
    if (!reserva?.team) return null;

    const cuentaId = reserva.team.userId;
    const numeros = losNumerosDelCliente(reserva.clientPhone);
    const session = numeros.length
        ? ((await db.session.findFirst({
              where: { userId: cuentaId, OR: [{ remoteJid: { in: numeros } }, { remoteJidAlt: { in: numeros } }] },
              orderBy: { updatedAt: "desc" },
              select: SESION,
          })) as SesionDeLaCita | null)
        : null;

    return {
        id: reserva.id,
        userId: cuentaId,
        sessionId: session?.id ?? null,
        clientName: reserva.clientName,
        startTime: reserva.startTime,
        endTime: reserva.endTime,
        timezone: reserva.timezone,
        status: String(reserva.status),
        serviceId: null,
        createdAt: reserva.createdAt,
        service: reserva.teamService ? { name: reserva.teamService.name } : null,
        session,
        user: reserva.team.user,
        esReserva: true,
    };
}
