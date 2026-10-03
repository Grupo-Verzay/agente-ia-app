/**
 * FullCalendar con una zona NOMBRADA (`timeZone="America/Bogota"`) y sin el
 * plugin de zonas hace «UTC-coercion»: trata cada fecha como si fuera UTC.
 * Así que:
 *
 * - un evento con su instante (`2026-10-02T16:00:00Z`) sale a las 16:00
 *   aunque en la cuenta sean las 11:00;
 * - el `info.start` de `datesSet` es la medianoche de ese día EN UTC, y
 *   pasarlo por `startOfDay` en un navegador al oeste de Greenwich da el día
 *   ANTERIOR: el calendario decía «2 de octubre» y debajo pintaba las citas
 *   del 1.
 *
 * Estas dos funciones hablan con FullCalendar en su idioma —la hora de pared
 * de la zona, sin desfase— y devuelven al resto de la pantalla instantes de
 * verdad. Puras.
 */
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';

/** La hora de pared de `d` en la zona, sin desfase: lo que FullCalendar pinta tal cual. */
export function laHoraDePared(d: Date | string, zona: string): string {
    return formatInTimeZone(new Date(d), zona, "yyyy-MM-dd'T'HH:mm:ss");
}

/**
 * El día que enseña el calendario, como el instante de su medianoche EN LA
 * ZONA. `inicio` es el `info.start` de `datesSet` (UTC-coercionado): su fecha
 * en UTC es la del día que se ve.
 */
export function elDiaDelCalendario(inicio: Date, zona: string): Date {
    return fromZonedTime(`${inicio.toISOString().slice(0, 10)}T00:00:00`, zona);
}

/** La medianoche de HOY en la zona. */
export function hoyEnLaZona(zona: string, ahora: Date = new Date()): Date {
    return fromZonedTime(`${formatInTimeZone(ahora, zona, 'yyyy-MM-dd')}T00:00:00`, zona);
}
