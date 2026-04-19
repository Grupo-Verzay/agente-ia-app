import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toZonedTime } from "date-fns-tz";

/**
 * Reemplaza variables personalizadas en el texto del servicio por sus valores reales.
 *
 * Variables soportadas:
 * - @client_name → nombre del cliente
 * - @appointment_datetime → fecha y hora formateadas en la zona horaria
 * - @appointment_duration → duración de la reunión
 */
export function formatServiceMessage(
    messageText: string | undefined,
    {
        nameClient,
        selectedDate,
        selectedSlot,
        timezone,
        slotDuration,
    }: {
        nameClient: string;
        selectedDate?: Date;
        selectedSlot?: string | null;
        timezone: string;
        slotDuration: number;
    }
): string {
    if (!messageText) return "Gracias por agendar con nosotros.";

    let formatted = messageText;

    try {
        // Nombre del cliente
        formatted = formatted.replace(/@client_name\b/gi, `${nameClient}`);

        // Fecha y hora local formateada como "17/10/2025 3:00 PM."
        if (selectedDate && selectedSlot) {
            const [startTime] = selectedSlot.split("|");
            const localTime = toZonedTime(new Date(startTime), timezone);
            const dateLabel = format(selectedDate, "dd/MM/yyyy", { locale: es });
            const hourLabel = format(localTime, "h:mm a", { locale: es });
            const fullDateTime = `${dateLabel} ${hourLabel}.`;
            formatted = formatted.replace(/@appointment_datetime\b/gi, fullDateTime);
        }

        // Duración
        formatted = formatted.replace(/@appointment_duration\b/gi, `${slotDuration} min`);
        
    } catch (err) {
        console.error("Error formateando messageText:", err);
    }

    return formatted;
}
