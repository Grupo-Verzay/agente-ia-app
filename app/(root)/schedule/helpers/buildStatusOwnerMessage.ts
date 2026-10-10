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
    FINALIZADO: { title: "Cita Finalizada", emoji: "🎉" },
    DESCARTADO: { title: "Cita Descartada", emoji: "🚫" },
};

interface BuildStatusOwnerMessageInterface {
    appointment: AppointmentWithSession;
    newStatus: AppointmentStatus;
    opts?: { reason?: string };
    userId: string;
    /** El enlace para volver a agendar. Multiagenda pasa el de su página de reservas. */
    scheduleUrl?: string;
}

/**
 * El enlace para volver a agendar con una cuenta de Agenda. Lo usan el aviso de
 * «No asistida» y la contestación al «No» del recordatorio del ciclo
 * automático (`lib/ciclo-de-la-cita.server.ts`): el mismo enlace en los dos.
 */
export function elEnlaceParaReagendar(userId: string): string {
    return userId === "cm84mjtp50000l6soenaosi2z" ? 'https://verzay.com/agendar-una-reunion' // VERZAY_VENTAS
        : userId === "cm842kthc0000qd2l66nbnytv" ? 'https://verzay.com/agenda-tu-reunion' // VERZAY_ADMIN
        : `https://agente.ia-app.com/schedule/${userId}`;
}

// Genera el texto para notificar cambio de estado (formato compacto)
export const buildStatusOwnerMessage = ({
    appointment,
    newStatus,
    opts,
    userId,
    scheduleUrl: enlace,
}: BuildStatusOwnerMessageInterface) => {
    const meta = STATUS_META[newStatus];

    // Fecha/hora en la zona horaria de la cita
    const zonedStart = toZonedTime(new Date(appointment.startTime), appointment.timezone);

    // Formato como tu ejemplo: 23/2/2026 y 10:00 AM
    const dateLabel = format(zonedStart, "d/M/yyyy");
    const timeLabel = format(zonedStart, "h:mm a");

    const serviceName = appointment.service?.name ?? "—";
    const clientName = appointment.clientName || appointment.session?.pushName || "Cliente";

    const scheduleUrl = enlace || elEnlaceParaReagendar(userId);

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


    if (newStatus === "PENDIENTE") {
        return `📅 *CITA PENDIENTE* 🕒

👤 *${clientName}*, agradecemos su agendamiento.

Si es *aceptada* recibirás la confirmación por este medio.`;
    }

    if (newStatus === "CONFIRMADA") {
        return `📅 *CITA CONFIRMADA* ✅

👤 *${clientName}*, agradecemos su agendamiento.

Estaremos en *contacto* para atenderte en la hora pactada.`;
    }

    if (newStatus === "CANCELADA") {
        return `📅 *CITA CANCELADA* ❌

👤 *${clientName}*, no es posible poder atenderte.

Te pedimos *disculpas* y sería en una próxima ocasión.`;
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