/**
 * La hora de un recordatorio se LEE y se ENSEÑA en la zona de la CUENTA.
 *
 * Tres cosas estaban cada una por su lado, y ninguna era la cuenta:
 *
 * | qué | en qué zona se leía |
 * | --- | --- |
 * | un recordatorio manual (Recordatorios) | la del servidor al escribir y la de Colombia al enviar |
 * | un recordatorio de tarea | la del servidor (`format` a secas) y la de Colombia al enviar |
 * | la hora dentro del texto de una cita | la del **país del teléfono del cliente** |
 *
 * La del servidor depende de dónde corra el contenedor, que no es un dato de
 * nadie. Así que la regla es una: **el reloj que marca la hora es el de la
 * cuenta** (`User.timezone`), y lo que se guarda para el motor es un instante
 * absoluto (ISO en UTC), que no hace falta volver a interpretar.
 *
 * Puro: sin base ni red. Lo que lee la zona de la base vive en
 * `lib/zona-de-la-cuenta.server.ts`.
 */
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { fromZonedTime, toZonedTime } from "date-fns-tz";

/** La zona por defecto: la misma que pone el esquema (`@default("America/Bogota")`). */
export const ZONA_POR_DEFECTO = "America/Bogota";

/** ¿Es una zona IANA que el motor de fechas entiende? */
export function esZonaValida(zona: unknown): zona is string {
    if (typeof zona !== "string" || !zona.trim()) return false;
    try {
        new Intl.DateTimeFormat("en-US", { timeZone: zona.trim() });
        return true;
    } catch {
        return false;
    }
}

/**
 * La zona de la cuenta, saneada. Lo que no se entienda cae en la de por
 * defecto: una zona rota no puede tumbar un recordatorio, y la de por defecto
 * es la que tenían TODOS hasta ahora, así que no mueve a nadie de sitio.
 */
export function laZonaDeLaCuenta(zona: unknown, respaldo: string = ZONA_POR_DEFECTO): string {
    if (esZonaValida(zona)) return zona.trim();
    return esZonaValida(respaldo) ? respaldo.trim() : ZONA_POR_DEFECTO;
}

const RELOJ_LOCAL = /^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/;

/** ¿Es el formato de reloj de pared que escribe el selector de fecha? */
export function esHoraDeReloj(texto: unknown): boolean {
    return typeof texto === "string" && RELOJ_LOCAL.test(texto.trim());
}

/**
 * «28/09/2026 15:30» leído como la hora de pared de la cuenta → el instante.
 *
 * `fromZonedTime` recibe la hora como TEXTO (`yyyy-MM-ddTHH:mm:ss`) a
 * propósito: con un `Date` construido por partes, el resultado dependería de la
 * zona del proceso que lo ejecuta, que es exactamente el fallo que se viene a
 * quitar.
 */
export function deRelojAInstante(texto: string, zona: string): Date | null {
    const m = RELOJ_LOCAL.exec(String(texto ?? "").trim());
    if (!m) return null;
    const [, dd, mm, yyyy, hh, min] = m;
    const d = fromZonedTime(`${yyyy}-${mm}-${dd}T${hh}:${min}:00`, laZonaDeLaCuenta(zona));
    return Number.isNaN(d.getTime()) ? null : d;
}

/** El instante escrito como la hora de pared de la cuenta: «28/09/2026 15:30». */
export function deInstanteAReloj(instante: Date, zona: string): string {
    return format(toZonedTime(instante, laZonaDeLaCuenta(zona)), "dd/MM/yyyy HH:mm");
}

/**
 * Lo que se guarda en `seguimientos.time` para el motor: SIEMPRE el instante en
 * ISO/UTC. Acepta el reloj de pared de la cuenta o un ISO que ya lo sea; lo que
 * no se entienda se devuelve tal cual (no se inventa una hora).
 */
export function laHoraParaElMotor(texto: string, zona: string, segundosDeMas = 0): string {
    const t = String(texto ?? "").trim();
    if (!t) return t;
    const base = esHoraDeReloj(t) ? deRelojAInstante(t, zona) : new Date(t);
    if (!base || Number.isNaN(base.getTime())) return t;
    return new Date(base.getTime() + segundosDeMas * 1000).toISOString();
}

/** «Ciudad» de una zona IANA: `America/Mexico_City` → «Mexico City». */
export function laCiudadDeLaZona(zona: string): string {
    const partes = zona.split("/");
    return (partes[partes.length - 1] ?? zona).replace(/_/g, " ");
}

/** Fecha y hora de una cita tal como se leen en un mensaje: «17/10/2025 3:00 p. m. (hora Bogota).» */
export function laFechaDeLaCita(inicio: Date, zona: string): string {
    const z = laZonaDeLaCuenta(zona);
    const local = toZonedTime(inicio, z);
    return `${format(local, "dd/MM/yyyy", { locale: es })} ${format(local, "h:mm a", { locale: es })} (hora ${laCiudadDeLaZona(z)}).`;
}
