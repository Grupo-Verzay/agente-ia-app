/**
 * Qué recordatorios lleva una RESERVA de Multiagenda (`booking_appointments`)
 * y qué dicen. Es la regla que la ruta del agente (`/api/bookings/appointment`)
 * tenía escrita dentro, sacada aquí para que la usen los dos caminos que
 * programan recordatorios de una reserva: crearla y **reagendarla**. Con una
 * copia en cada uno, el día que se afine uno el otro le mandaría al cliente
 * otros recordatorios que los del día que agendó.
 *
 * - **Si el servicio tiene recordatorios propios** (`remindersConfig`), mandan
 *   esos: `booking-svc-reminder-<servicio>-<n>`.
 * - **Si no**, los de la agenda de la cuenta (`isSchedule`):
 *   `booking-reminder-<plantilla>`.
 * - El texto y la hora salen de `lib/recordatorios-de-la-cita.ts`: la MISMA
 *   hora estricta y la MISMA zona de la cuenta que las citas de Agenda.
 * - Los que ya pasaron no se programan.
 *
 * Puro. Lo que lee la base está en `lib/reagendar-reserva.server.ts`.
 */
import {
    elTextoDelRecordatorio,
    segundosAntesDeLaCita,
    type DatosDelRecordatorio,
    type PlantillaDeAgenda,
} from "@/lib/recordatorios-de-la-cita";

/** Los dos prefijos con los que se guardan los recordatorios de una reserva. */
export const PREFIJOS_DE_RECORDATORIO_DE_RESERVA = ["booking-reminder-", "booking-svc-reminder-"] as const;

export function esRecordatorioDeReserva(idNodo: string | null | undefined): boolean {
    const texto = String(idNodo ?? "");
    return PREFIJOS_DE_RECORDATORIO_DE_RESERVA.some((p) => texto.startsWith(p));
}

export type RecordatorioDelServicio = { timeMinutes: number; message: string };

/** Los recordatorios propios del servicio, saneados: lo que no tiene minutos o texto no cuenta. */
export function losRecordatoriosDelServicio(config: unknown): RecordatorioDelServicio[] {
    if (!Array.isArray(config)) return [];
    return config.filter(
        (r): r is RecordatorioDelServicio =>
            typeof r?.timeMinutes === "number" &&
            Number.isFinite(r.timeMinutes) &&
            r.timeMinutes > 0 &&
            typeof r?.message === "string",
    );
}

export type RecordatorioDeReserva = { idNodo: string; cuando: string; mensaje: string };

export function losRecordatoriosDeLaReserva(
    args: {
        servicioId: string;
        /** `TeamService.remindersConfig`, tal cual. */
        delServicio: unknown;
        /** Las plantillas de agenda de la cuenta: solo cuentan si el servicio no trae las suyas. */
        plantillas: PlantillaDeAgenda[];
        datos: DatosDelRecordatorio;
    },
    ahora: Date = new Date(),
): RecordatorioDeReserva[] {
    const inicio = args.datos.inicio.getTime();
    const propios = losRecordatoriosDelServicio(args.delServicio);
    const salida: RecordatorioDeReserva[] = [];

    if (propios.length > 0) {
        propios.forEach((r, idx) => {
            const cuando = inicio - r.timeMinutes * 60_000;
            if (cuando <= ahora.getTime()) return;
            salida.push({
                idNodo: `booking-svc-reminder-${args.servicioId}-${idx}`,
                cuando: new Date(cuando).toISOString(),
                mensaje: elTextoDelRecordatorio(r.message, args.datos),
            });
        });
        return salida;
    }

    for (const p of args.plantillas) {
        const segundos = segundosAntesDeLaCita(p.time);
        if (!segundos) continue;
        const cuando = inicio - segundos * 1000;
        if (cuando <= ahora.getTime()) continue;
        salida.push({
            idNodo: `booking-reminder-${p.id}`,
            cuando: new Date(cuando).toISOString(),
            mensaje: elTextoDelRecordatorio(p.description ?? p.title ?? "", args.datos),
        });
    }
    return salida;
}

/** El enlace que se ofrece para volver a reservar: la página pública de Multiagenda, no la de Agenda. */
export function elEnlaceParaReservar(cuentaId: string): string {
    return `https://agente.ia-app.com/bookings/${cuentaId}`;
}
