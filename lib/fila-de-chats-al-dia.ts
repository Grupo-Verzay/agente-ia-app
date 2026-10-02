/**
 * Lo que se cambia DESDE una conversación abierta se pinta en SU fila de la
 * lista al momento, no al minuto.
 *
 * La fila de la bandeja pinta sus iconos —etiquetas, recordatorios, cita,
 * notas internas, seguimientos, flujos— a partir de la sesión que trajo el
 * reloj de sesiones (60 s, `INTERVALO_MINIMO_DE_SESIONES`). La calificación y
 * la etapa ya se aplicaban en memoria al cambiarlas (`aplicarEnLaSesion`); los
 * demás no avisaban a nadie, así que el icono se quedaba como estaba hasta
 * recargar o hasta la vuelta siguiente del reloj.
 *
 * La regla: **quien cambia algo de la fila AVISA con el id de la sesión**
 * (`avisarQueCambioLaFila`), y la pantalla de Chats vuelve a leer ESA fila con
 * la MISMA consulta que la bandeja (`laFilaDeLaSesionAction` →
 * `getSesionesDeLaCuenta`) y la aplica en TODAS sus llaves por el id. Nada se
 * calcula en el navegador: el número del icono es el mismo que traería el
 * reloj, porque sale del mismo sitio.
 *
 * Es un evento del navegador y no un contexto por lo mismo que el anfitrión de
 * llamadas: quien cambia algo vive en componentes muy separados (la cabecera,
 * el panel de recordatorio, la conversación, el menú de la fila).
 */
import type { ChatContactSessionSummary } from "@/types/session";

export const EVENTO_FILA_DE_CHAT = "chats:fila-cambio";
export const EVENTO_NOTAS_DE_LA_FILA = "chats:notas-de-la-fila";

/**
 * Cuánto se espera antes de leer la fila: los avisos de la misma sesión que
 * llegan juntos (guardar y refrescar el contador, una macro que toca tres
 * cosas) se agrupan en UNA lectura. Corto: lo que se viene a arreglar es que
 * el icono tardaba un minuto.
 */
export const ESPERA_PARA_LEER_LA_FILA_MS = 250;

/**
 * Cada cuánto se vuelven a leer las conversaciones con notas internas para
 * pintar las de los compañeros: el ritmo del reloj de sesiones (60 s). Lo que
 * cambia desde la conversación abierta no espera a esto: llega por el aviso.
 */
export const INTERVALO_DE_LAS_NOTAS_MS = 60_000;

export type AvisoDeLaFila = { sessionId: number; porQue: string };
export type NotasDeLaFila = { sessionId: number; tieneNotas: boolean };

/**
 * Los campos de la sesión que la FILA enseña y que se toman de la lectura
 * fresca. Fuera a propósito `resolvedAt`, que lleva su propio camino
 * (`marcarResolucion`, con la cuenta de «Todos»), y lo que solo sirve para
 * emparejar (`instanceId`, `updatedAt`, las identidades).
 */
export const CAMPOS_DE_LA_FILA_AL_DIA = [
  "tags",
  "leadStatus",
  "assignedAdvisorId",
  "customName",
  "pushName",
  "flujos",
  "pendingSeguimientos",
  "seguimientosTipos",
  "latestAppointmentStatus",
  "reminderCount",
  "escalatedAt",
  "etapa",
  "status",
] as const satisfies readonly (keyof ChatContactSessionSummary)[];

/** Lo que se aplica en memoria a partir de la fila recién leída. */
export function elCambioDeLaFila(
  fila: Partial<ChatContactSessionSummary>,
): Partial<ChatContactSessionSummary> {
  const cambio: Partial<ChatContactSessionSummary> = {};
  for (const campo of CAMPOS_DE_LA_FILA_AL_DIA) {
    if (campo in fila) (cambio as Record<string, unknown>)[campo] = fila[campo];
  }
  return cambio;
}

/**
 * Avisa de que algo de la fila de esa sesión cambió. Sin id no hay fila que
 * poner al día (una conversación sin ficha CRM no pinta iconos), y no es un
 * error: se vuelve sin hacer nada.
 */
export function avisarQueCambioLaFila(sessionId: number | null | undefined, porQue: string): void {
  if (typeof window === "undefined") return;
  if (typeof sessionId !== "number" || !Number.isFinite(sessionId)) return;
  window.dispatchEvent(
    new CustomEvent<AvisoDeLaFila>(EVENTO_FILA_DE_CHAT, { detail: { sessionId, porQue } }),
  );
}

/** El candado de las notas internas vive aparte (la lista lo lleva en un `Set`). */
export function avisarDeLasNotasDeLaFila(sessionId: number, tieneNotas: boolean): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<NotasDeLaFila>(EVENTO_NOTAS_DE_LA_FILA, { detail: { sessionId, tieneNotas } }),
  );
}

/** Pone o quita una sesión del conjunto de las que tienen notas, sin copiar si no cambia. */
export function conLasNotasDeLaFila(
  conNotas: ReadonlySet<number>,
  sessionId: number,
  tieneNotas: boolean,
): ReadonlySet<number> {
  if (conNotas.has(sessionId) === tieneNotas) return conNotas;
  const siguiente = new Set(conNotas);
  if (tieneNotas) siguiente.add(sessionId);
  else siguiente.delete(sessionId);
  return siguiente;
}
