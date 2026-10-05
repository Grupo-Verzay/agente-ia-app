/**
 * Lo que la pantalla de Multiagenda (`/bookings`) y su guía pública
 * (`lib/guia-multiagenda.ts`) tienen que decir IGUAL: los nombres de sus
 * pestañas, el enlace público de reserva y cómo se cuentan los días de un
 * especialista.
 *
 * Puro: lo usan la pantalla, la guía y el banco. Con los nombres escritos en
 * los dos sitios, el día que una pestaña cambie de nombre la guía la seguiría
 * llamando como antes y nadie lo notaría.
 */

/** Las pestañas de Multiagenda, en su orden. `value` es la llave interna. */
export const PESTANAS_DE_MULTIAGENDA = [
    { value: "dashboard", label: "Dashboard" },
    { value: "kanban", label: "Kanban" },
    { value: "members", label: "Especialistas" },
    { value: "services", label: "Servicios" },
    { value: "reminders", label: "Recordatorios" },
    { value: "form", label: "Formulario" },
    { value: "settings", label: "Ajustes" },
] as const;

export type PestanaDeMultiagenda = (typeof PESTANAS_DE_MULTIAGENDA)[number]["value"];

/**
 * El enlace PÚBLICO donde un cliente reserva con el equipo: el dominio de la
 * página abierta —el de la plataforma o el de un reseller—, nunca uno escrito
 * a mano.
 */
export function elEnlaceDeReservaDelEquipo(origen: string, cuentaId: string, slug?: string | null): string {
    const base = String(origen ?? "").replace(/\/+$/, "");
    // Con su nombre legible: `/bookings/<nombre>/agenda`. Sin él, con el id.
    if (slug) return `${base}/bookings/${encodeURIComponent(slug)}/agenda`;
    return `${base}/bookings/${encodeURIComponent(cuentaId)}`;
}

/**
 * Cuántos DÍAS distintos atiende un especialista. Su disponibilidad son
 * franjas (lunes de 8 a 12 y lunes de 14 a 18 son dos), y la insignia contaba
 * las franjas: un especialista que atiende de lunes a viernes en dos turnos
 * decía «10 días».
 */
export function losDiasQueAtiende(franjas: ReadonlyArray<{ dayOfWeek: number }>): number {
    return new Set((franjas ?? []).map((f) => f.dayOfWeek)).size;
}

export function elRotuloDeLosDias(n: number): string {
    return `${n} ${n === 1 ? "día" : "días"}`;
}
