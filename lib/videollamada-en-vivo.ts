import { fromZonedTime } from "date-fns-tz";
import { FORMA_DE_LA_FECHA, type OrdenDeAgendar } from "@/lib/pantalla-del-avatar";
import { laZonaDeLaCuenta } from "@/lib/zona-de-la-cuenta";

/**
 * Lo que la sala hace DURANTE la videollamada además de hablar: agendar el
 * siguiente paso, enseñar la ficha y los resultados, y enterarse de que el
 * prospecto pagó. Reglas puras; el servidor está en
 * `lib/videollamada-en-vivo.server.ts`.
 */

/** Cada cuánto pregunta la sala si el prospecto ya pagó. */
export const NOVEDADES_CADA_MS = 20_000;
/** Con qué prefijo se escribe un seguimiento agendado desde la videollamada:
 * `auto-reminder-` sale a su hora SIEMPRE (no espera horario laboral). */
export const PREFIJO_DEL_NODO = "auto-reminder-videollamada-";

/** «2026-10-08T15:30» leído en la zona del negocio → el instante. */
export function elInstanteDeLaAgenda(fechaHora: string, zona: string): Date | null {
    const m = FORMA_DE_LA_FECHA.exec(String(fechaHora ?? "").trim());
    if (!m) return null;
    const d = fromZonedTime(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00`, laZonaDeLaCuenta(zona));
    return Number.isNaN(d.getTime()) ? null : d;
}

/** Lo agendado tiene que ser futuro (con un minuto de margen) y no más de un año. */
export function porQueNoSeAgenda(instante: Date | null, ahora: Date): string | null {
    if (!instante) return "la fecha no se entiende";
    if (instante.getTime() <= ahora.getTime() + 60_000) return "la fecha ya pasó";
    if (instante.getTime() > ahora.getTime() + 366 * 24 * 3_600_000) return "la fecha está a más de un año";
    return null;
}

/** La llave que hace que el mismo acuerdo se agende UNA vez. */
export function laLlaveDeLaAgenda(orden: OrdenDeAgendar): string {
    return `agenda:${orden.tipo}:${orden.fechaHora}`;
}

/** El WhatsApp de un recordatorio acordado en la videollamada. */
export function elMensajeDelRecordatorio(nombre: string | null, nota: string): string {
    const saludo = nombre?.trim() ? `Hola ${nombre.trim().split(/\s+/)[0]}` : "Hola";
    const que = nota.trim() ? nota.trim() : "lo que hablamos en la videollamada";
    return `⏰ ${saludo}, te escribimos como quedamos en la videollamada: *${que}*.`;
}

/** Los últimos diez dígitos de un teléfono: así se compara sin indicativo. */
export function losUltimosDiez(telefono: string | null | undefined): string {
    return String(telefono ?? "").split("@")[0].replace(/\D/g, "").slice(-10);
}

/** ¿Este registro de una cuenta nueva es el prospecto? Mismo número, y después de abrir la cita. */
export function esElProspecto(
    cuenta: { notificationNumber: string | null; createdAt: Date },
    telefono: string,
    desde: Date,
): boolean {
    const suyo = losUltimosDiez(cuenta.notificationNumber);
    return suyo.length >= 7 && suyo === losUltimosDiez(telefono) && cuenta.createdAt.getTime() >= desde.getTime();
}

export type EstadoDelPago = "nada" | "registrado" | "pagado";

/** Lo que se le cuenta a Verzy cuando cambia el estado del pago. */
export function elAvisoDelPago(estado: EstadoDelPago, plan: string | null): string | null {
    if (estado === "registrado") {
        return "El cliente ya creó su cuenta en Verzay durante la llamada, pero todavía no ha pagado. Acompáñalo a terminar el pago sin presionarlo.";
    }
    if (estado === "pagado") {
        return `¡El cliente acaba de pagar${plan ? ` el plan ${plan}` : ""}! Felicítalo, agradécele la confianza y explícale el siguiente paso: un asesor lo contactará por WhatsApp para dejar todo configurado.`;
    }
    return null;
}

/** Notas de la llamada: lo que el cliente dijo, sin repetidos y con tope. */
export const TOPE_DE_NOTAS = 30;
export function conLaNota(notas: string[], dicho: unknown): string[] {
    const texto = typeof dicho === "string" ? dicho.trim().replace(/\s+/g, " ") : "";
    if (texto.length < 3 || notas[notas.length - 1] === texto) return notas;
    return [...notas, texto.slice(0, 280)].slice(-TOPE_DE_NOTAS);
}

/** Lo que dijo el cliente, si el evento es su turno de habla. */
export function loQueDijoElCliente(mensaje: unknown): string | null {
    if (!mensaje || typeof mensaje !== "object") return null;
    const m = mensaje as Record<string, unknown>;
    if (m.event_type !== "conversation.utterance") return null;
    const p = (m.properties ?? {}) as Record<string, unknown>;
    if (p.role !== "user") return null;
    return typeof p.speech === "string" ? p.speech : null;
}
