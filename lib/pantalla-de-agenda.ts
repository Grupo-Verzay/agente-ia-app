/**
 * Lo que la pantalla de Agenda (`/schedule`) y su guía pública
 * (`lib/guia-agenda.ts`) tienen que decir IGUAL: los nombres de sus pestañas,
 * el rótulo del tiempo de un recordatorio y el enlace público de reserva.
 *
 * Puro: lo usan la pantalla, la guía y el banco. Con los nombres escritos en
 * los dos sitios, el día que una pestaña cambie de nombre la guía la seguiría
 * llamando como antes y nadie lo notaría.
 */

/** Las pestañas de Agenda, en su orden. `value` es la llave interna. */
export const PESTANAS_DE_LA_AGENDA = [
    { value: "dashboard", label: "Dashboard" },
    { value: "availability", label: "Disponibilidad" },
    { value: "kanban", label: "Kanban" },
    { value: "services", label: "Servicios" },
    { value: "reminders", label: "Recordatorios" },
    { value: "form", label: "Formulario" },
    { value: "registros", label: "Registros" },
    { value: "settings", label: "Ajustes" },
] as const;

export type PestanaDeLaAgenda = (typeof PESTANAS_DE_LA_AGENDA)[number]["value"];

/**
 * El rótulo del tiempo de un recordatorio de AGENDA. Ahí el número no es un
 * retraso: es cuánto ANTES de la cita sale el mensaje. Con el rótulo de
 * siempre («Duración de retraso») se leía como «sale tantas horas después».
 */
export const ROTULO_DEL_TIEMPO_ANTES_DE_LA_CITA = "Cuánto antes de la cita";

/** Cuántos recordatorios de agenda se pueden tener a la vez. */
export const TOPE_DE_RECORDATORIOS_DE_AGENDA = 10;

/**
 * El enlace PÚBLICO donde un cliente reserva: el dominio de la página que se
 * tiene abierta —el de la plataforma, o el de un reseller— y nunca uno
 * escrito a mano. Estaba fijo en `agente.ia-app.com`, así que desde cualquier
 * otro dominio «Copiar enlace» copiaba el de otro sitio.
 */
export function elEnlaceDeReserva(origen: string, cuentaId: string, slug?: string | null): string {
    const base = String(origen ?? "").replace(/\/+$/, "");
    // Con su nombre legible: `/schedule/<nombre>/agenda`. Sin él, con el id.
    if (slug) return `${base}/schedule/${encodeURIComponent(slug)}/agenda`;
    return `${base}/schedule/${encodeURIComponent(cuentaId)}`;
}
