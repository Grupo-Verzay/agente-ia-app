/**
 * Reagendar una cita: la MISMA fila, otra fecha y hora, y sus recordatorios
 * rehechos desde la nueva.
 *
 * # Por qué es una ACCIÓN y no un estado más
 *
 * Los estados (Pendiente, Confirmada, Atendida…) son una columna enum de
 * `Appointment`, y ese enum es del BACKEND —añadirle un valor desde aquí es lo
 * que reventó el #360—. Y no hace falta: reagendar no es «en qué punto está la
 * cita», es **moverla**. Por eso aparece al lado de los estados en los cuatro
 * sitios donde se cambian (Agenda, su tablero, la cabecera del chat y la ficha
 * del CRM) y no dentro del enum.
 *
 * # Por qué la misma fila
 *
 * Crear una cita nueva y cancelar la vieja perdería su historial —el registro
 * de auditoría, el evento de Google Calendar, las automatizaciones que ya
 * corrieron— y dejaría dos citas donde hay una. Reagendar escribe
 * `startTime`/`endTime` en la fila que ya existe.
 *
 * Este módulo es la parte pura. Quien lee la base y escribe es
 * `reagendar-cita.server.ts`.
 */
import type { AppointmentStatus } from "@prisma/client";

/** El rótulo de la acción, el mismo en los cuatro sitios. */
export const ROTULO_REAGENDAR = "Reagendar";

/**
 * El valor que usan los desplegables de estado para la opción de reagendar.
 * No es un `AppointmentStatus`: al elegirlo se abre el selector de fecha y
 * hora en vez de guardarse. Va en mayúscula y con un prefijo que ningún
 * estado del enum puede tener, para que no se confunda con uno.
 */
export const OPCION_REAGENDAR = "__REAGENDAR__";

export function esLaOpcionDeReagendar(valor: unknown): boolean {
    return valor === OPCION_REAGENDAR;
}

/**
 * Los recordatorios de la agenda se guardan con este `idNodo`. Es el formato
 * que ya escribe la ruta del agente (`/api/schedule/appointment`) y el que
 * reconocen cancelar, el panel de registros y la protección de seguimientos,
 * así que lo que se reprograma aquí se trata igual que lo que se creó al
 * agendar.
 */
export function elIdNodoDelRecordatorio(recordatorioId: number | string): string {
    return `appt-reminder-${recordatorioId}`;
}

/**
 * En qué estado queda la cita después de reagendarla.
 *
 * - **Pendiente y Confirmada se quedan como están**: la cita sigue viva, solo
 *   cambió de hora.
 * - **Cualquier otro vuelve a Pendiente**. Reagendar una cita que el cliente
 *   no atendió, que se canceló o que se dio por terminada es volver a
 *   ponerla en marcha: con su estado viejo no saldría en «Pendiente» —que es
 *   lo que el menú cuenta— ni tendría sentido que le lleguen recordatorios.
 */
export function elEstadoAlReagendar(estado: AppointmentStatus | string | null | undefined): AppointmentStatus {
    if (estado === "PENDIENTE" || estado === "CONFIRMADA") return estado as AppointmentStatus;
    return "PENDIENTE" as AppointmentStatus;
}

export type FranjaNueva = { inicio: Date; fin: Date };

/**
 * La franja nueva que llega del navegador, validada. La cita solo se puede
 * mover a una hora que todavía no ha pasado, con el final después del inicio,
 * y no a la misma hora que ya tiene.
 */
export function comoFranjaNueva(
    inicio: unknown,
    fin: unknown,
    actual: { inicio: Date | string; fin: Date | string } | null,
    ahora: Date = new Date(),
): { ok: true; franja: FranjaNueva } | { ok: false; motivo: string } {
    const i = typeof inicio === "string" || inicio instanceof Date ? new Date(inicio) : null;
    const f = typeof fin === "string" || fin instanceof Date ? new Date(fin) : null;
    if (!i || !f || Number.isNaN(i.getTime()) || Number.isNaN(f.getTime())) {
        return { ok: false, motivo: "Elige la nueva fecha y hora." };
    }
    if (f.getTime() <= i.getTime()) {
        return { ok: false, motivo: "La hora final tiene que ser después de la inicial." };
    }
    if (i.getTime() <= ahora.getTime()) {
        return { ok: false, motivo: "La nueva hora ya pasó. Elige una hora futura." };
    }
    if (actual) {
        const ai = new Date(actual.inicio).getTime();
        const af = new Date(actual.fin).getTime();
        if (ai === i.getTime() && af === f.getTime()) {
            return { ok: false, motivo: "La cita ya está en ese horario." };
        }
    }
    return { ok: true, franja: { inicio: i, fin: f } };
}

/**
 * Cuánto dura la cita, en minutos. Reagendar CONSERVA la duración: el
 * selector pide huecos de ese largo, así que una cita de 90 minutos no se
 * convierte en una de 60 por moverla.
 */
export function laDuracionDeLaCita(inicio: Date | string, fin: Date | string, respaldo = 60): number {
    const min = Math.round((new Date(fin).getTime() - new Date(inicio).getTime()) / 60_000);
    return Number.isFinite(min) && min > 0 ? min : respaldo;
}

/**
 * De los recordatorios calculados para la nueva hora, los que se programan:
 * **solo los que todavía no han pasado**. Uno de «24 horas antes» sobre una
 * cita movida a esta tarde saldría en el acto, y al cliente le llegaría un
 * «mañana es tu cita» que no es verdad. Es la misma regla con la que la ruta
 * del agente los crea al agendar.
 */
export function losQueTodaviaNoPasan<T extends { cuando: string }>(programados: T[], ahora: Date = new Date()): T[] {
    return programados.filter((p) => {
        const t = new Date(p.cuando).getTime();
        return Number.isFinite(t) && t > ahora.getTime();
    });
}

/**
 * Los números con los que un recordatorio de esta cita puede estar guardado.
 * La ruta del agente guarda el teléfono TAL CUAL se lo dieron —a veces solo
 * dígitos—, y la página pública el `remoteJid` de la sesión. Buscando por una
 * sola forma, los recordatorios viejos de la otra se quedarían vivos y al
 * cliente le llegarían los de la hora vieja además de los de la nueva.
 */
export function losNumerosDelCliente(remoteJid: string | null | undefined, remoteJidAlt?: string | null): string[] {
    const salida = new Set<string>();
    for (const jid of [remoteJid, remoteJidAlt]) {
        const texto = String(jid ?? "").trim();
        if (!texto) continue;
        salida.add(texto);
        // Un @lid no es un teléfono: sus dígitos no se convierten en número.
        if (texto.endsWith("@lid")) continue;
        const digitos = texto.replace(/@.*/, "").replace(/:\d+$/, "").replace(/\D/g, "");
        if (digitos) {
            salida.add(digitos);
            salida.add(`${digitos}@s.whatsapp.net`);
        }
    }
    return [...salida];
}
