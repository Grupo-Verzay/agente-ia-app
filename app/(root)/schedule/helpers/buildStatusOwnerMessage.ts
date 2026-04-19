import { format, toZonedTime } from "date-fns-tz";
import { AppointmentWithSession } from "./normalizeAppointmentsToEvents";
import { AppointmentStatus } from "@prisma/client";

const STATUS_META: Record<
    AppointmentStatus,
    { title: string; emoji: string }
> = {
    PENDIENTE: { title: "Cita Pendiente", emoji: "🕒" },
    CONFIRMADA: { title: "Cita Confirmada", emoji: "✅" },
    CANCELADA: { title: "Cita Cancelada", emoji: "❌" },
    ATENDIDA: { title: "Cita Atendida", emoji: "✅" },
    NO_ASISTIDA: { title: "Cita No Asistida", emoji: "⚠️" },
};

interface BuildStatusOwnerMessageInterface {
    appointment: AppointmentWithSession;
    newStatus: AppointmentStatus;
    opts?: { reason?: string };
    userId: string;
}

// Genera el texto para notificar cambio de estado (formato compacto)
export const buildStatusOwnerMessage = ({
    appointment,
    newStatus,
    opts,
    userId,
}: BuildStatusOwnerMessageInterface) => {
    const meta = STATUS_META[newStatus];

    // Fecha/hora en la zona horaria de la cita
    const zonedStart = toZonedTime(new Date(appointment.startTime), appointment.timezone);

    // Formato como tu ejemplo: 23/2/2026 y 10:00 AM
    const dateLabel = format(zonedStart, "d/M/yyyy");
    const timeLabel = format(zonedStart, "h:mm a");

    const serviceName = appointment.service?.name ?? "—";
    const clientName = appointment.session?.pushName ?? "Cliente";

    const scheduleUrl = userId === "cm84mjtp50000l6soenaosi2z" ? 'https://verzay.com/agendar-una-cita' : `https://agente.ia-app.com/schedule/${userId}`;

    // Motivo opcional (útil en cancelación, pero funciona en cualquier estado)
    const reasonBlock = opts?.reason ? `\n\n📝 Motivo: ${opts.reason}` : "";

    if (newStatus === "ATENDIDA") {
        const text = `📅 *CITA ATENDIDA* ✅

👤 *${clientName}*, agradecemos su asistencia.

Si considera que podemos mejorar algún aspecto del proceso, le agradecemos indicarlo. Es clave para mejorar nuestro servicio.🤝`;

        return text;
    };

    if (newStatus === "NO_ASISTIDA") {
        const text = `📅 *CITA NO ASISTIDA* ❌

👤 *${clientName}*, no fue posible su asistencia.

Puedes reagendar nuevamente aquí:

👉 ${scheduleUrl}`;

        return text;
    }


    const text = `📅 *${meta.title.toUpperCase()}* ${meta.emoji}

👤 *Nombre:* ${clientName}
📝 *Servicio:* ${serviceName}
📅 *Fecha:* ${dateLabel}
⌚ *Hora:* ${timeLabel} 
🌐 *Zona horaria:* (${appointment.timezone.split("/")[1]})
${reasonBlock}`;

    return text;
};