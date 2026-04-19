import { Appointment, Service, Session } from "@prisma/client";

export interface AppointmentWithSession extends Appointment {
    session: Session;
    service: Service | null;
}

export function normalizeAppointmentsToEvents(appointments: AppointmentWithSession[]) {
    return appointments.map((a) => ({
        id: a.id,
        title: `${a.session?.pushName || "Sin nombre"} - ${a.service?.name || "Sin servicio"}`,
        start: a.startTime,
        end: a.endTime,
        allDay: false,

        className:
            a.status === "CONFIRMADA"
                ? "bg-green-400 hover:bg-green-300 border-none transition-all"
                : a.status === "CANCELADA"
                    ? "bg-red-400 hover:bg-red-300 border-none transition-all"
                    : a.status === "ATENDIDA"
                        ? "bg-blue-400 hover:bg-blue-300 border-none transition-all"
                        : a.status === "NO_ASISTIDA"
                            ? "bg-gray-500 hover:bg-gray-400 border-none transition-all"
                            : "bg-yellow-600 hover:bg-yellow-500 border-none transition-all",
    }));
}