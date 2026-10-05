import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toZonedTime } from "date-fns-tz";
import { formatServiceMessage } from "@/app/schedule/helpers/formatServiceMessage";

/**
 * Lo que se manda después de que alguien agenda una cita en la página PÚBLICA
 * (`/schedule/[userId]`), decidido en el servidor.
 *
 * # Por qué esto ya no lo hace el navegador
 *
 * La página pública recibía **la cuenta entera** —con la clave GLOBAL del
 * servidor de Evolution y el token de cada línea— y con eso, desde el
 * navegador de quien reservaba, programaba los recordatorios, avisaba al dueño
 * y le mandaba al cliente su confirmación. O sea: cualquiera que abriera el
 * enlace de agendar de una cuenta se llevaba unas credenciales que abren el
 * WhatsApp de todas las cuentas de ese servidor.
 *
 * > **Lo que sale de una reserva se arma en el servidor a partir del ID de la
 * > CITA.** Del navegador solo llegan el id, el día que se eligió y la zona
 * > horaria de quien reservó —para escribir la hora en la suya—. El texto, el
 * > número al que va, la línea y la clave salen de la base.
 *
 * Este módulo es la parte pura: qué mensajes salen y cuándo se puede pedir.
 * Quien lee la base y manda es `cita-publica.server.ts`.
 */

/**
 * Cuánto después de crear la cita se puede pedir su confirmación. Es lo que la
 * página tarda entre crear la cita y pedir el aviso —segundos—, con holgura
 * para una red lenta. Pasado esto, pedirla con un id viejo no manda nada: sin
 * este plazo, cualquiera con el id de una cita la podría volver a disparar.
 */
export const MINUTOS_PARA_CONFIRMAR = 30;

export function sePuedeConfirmarLaCita(creadaEn: Date | string | null | undefined, ahora: Date = new Date()): boolean {
    if (!creadaEn) return false;
    const t = new Date(creadaEn).getTime();
    if (!Number.isFinite(t)) return false;
    const edad = ahora.getTime() - t;
    // Una cita «del futuro» es un reloj que no cuadra, no una recién creada.
    return edad >= -60_000 && edad <= MINUTOS_PARA_CONFIRMAR * 60_000;
}

/** Una zona horaria que se puede usar, o la de respaldo. Llega del navegador. */
export function comoZonaHoraria(zona: unknown, respaldo: string): string {
    const texto = typeof zona === "string" ? zona.trim() : "";
    if (!texto || texto.length > 64) return respaldo;
    try {
        new Intl.DateTimeFormat("es", { timeZone: texto });
        return texto;
    } catch {
        return respaldo;
    }
}

/**
 * El día que se eligió en el calendario (`yyyy-MM-dd`). Si no llega o no se
 * entiende, el día de la cita en la zona del dueño: es la misma fecha que la
 * página ofrecía.
 */
export function elDiaElegido(ymd: unknown, inicio: Date, zonaDelDueno: string): Date {
    const texto = typeof ymd === "string" ? ymd.trim() : "";
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto);
    if (m) {
        const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
        if (!Number.isNaN(d.getTime())) return d;
    }
    const local = toZonedTime(inicio, zonaDelDueno);
    return new Date(local.getFullYear(), local.getMonth(), local.getDate());
}

export type DatosDeLaCita = {
    nombreDelCliente: string;
    telefonoDelCliente: string; // dígitos, sin '+'
    inicio: Date;
    fin: Date;
    diaElegido: Date;
    zonaDelDueno: string;
    zonaDelCliente: string;
    duracionMinutos: number;
    servicio: { name: string | null; messageText: string | null } | null;
    /** El enlace de la reunión de ESTA cita (`@meeting_link`). */
    enlaceDeReunion?: string | null;
};

// Los recordatorios de la agenda ya no se arman aquí: los arma
// `lib/recordatorios-de-la-cita.ts`, la misma regla para los cuatro caminos.

/** El aviso al dueño y a sus contactos de notificación. Mismo texto que tenía la página. */
export function elAvisoAlDueno(cita: DatosDeLaCita): { texto: string; descripcion: string; servicio: string } {
    const inicioLocal = toZonedTime(cita.inicio, cita.zonaDelDueno);
    const dia = format(cita.diaElegido, "d 'de' MMMM 'de' yyyy", { locale: es });
    const partes = cita.zonaDelDueno.split("/");
    const ciudad = (partes[partes.length - 1] ?? cita.zonaDelDueno).replace(/_/g, " ");
    const hora = `${format(inicioLocal, "hh:mm a")} (hora ${ciudad})`;
    const servicio = cita.servicio?.name ?? "Asesoría";
    const descripcion = `Para el día ${dia} a las ${hora}.`;
    const texto = `📅 *Tienes Nueva Cita*:

👤 *Nombre:* ${cita.nombreDelCliente}
📝 *Descripción ${servicio}:* ${descripcion}

📱 *WhatsApp del usuario:*

👉 +${cita.telefonoDelCliente}`;
    return { texto, descripcion, servicio };
}

/** La confirmación que recibe quien reservó: el texto del servicio con sus variables. */
export function laConfirmacionAlCliente(cita: DatosDeLaCita): string {
    return formatServiceMessage(cita.servicio?.messageText ?? undefined, {
        nameClient: cita.nombreDelCliente,
        selectedDate: cita.diaElegido,
        selectedSlot: `${cita.inicio.toISOString()}|${cita.fin.toISOString()}`,
        timezone: cita.zonaDelCliente,
        slotDuration: cita.duracionMinutos,
        serviceName: cita.servicio?.name ?? "",
        meetingLink: cita.enlaceDeReunion ?? "",
    });
}
