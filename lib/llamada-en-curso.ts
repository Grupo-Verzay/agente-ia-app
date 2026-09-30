/**
 * ¿Ya hay una llamada con IA en curso con este número?
 *
 * Se lanzaban dos llamadas al mismo cliente con 29 s de diferencia —la segunda
 * mientras la primera seguía sonando o hablando— y en la conversación salían
 * dos «Llamada realizada». El servidor de llamadas no lo impide: su lista de
 * llamadas vivas no dice a qué número va cada una. Lo que sí sabemos es qué
 * llamadas le hicimos a ese número (sus filas `callout_<ts>_<digitos>` guardan
 * su `astraCallId`), así que se cruzan las dos cosas.
 *
 * Puro: la consulta y la red viven en `llamada-en-curso.server.ts`.
 */

/** Cuánto hacia atrás se miran las llamadas a un número. Más que cualquier timbre. */
export const VENTANA_DE_LLAMADA_EN_CURSO_MIN = 30;

export const YA_HAY_UNA_LLAMADA_EN_CURSO =
  'Ya hay una llamada en curso con este número. Espera a que termine.';

export type LlamadaViva = { callId?: string | null; stale?: boolean | null };

/** Saca las llamadas de la respuesta de `GET /api/sessions/{sid}/calls`. */
export function lasLlamadasVivas(respuesta: unknown): LlamadaViva[] {
  const calls = (respuesta as { calls?: unknown } | null)?.calls;
  return Array.isArray(calls) ? (calls as LlamadaViva[]) : [];
}

/**
 * Hay una en curso si alguna de las llamadas que le hicimos a este número
 * sigue en la lista de vivas. Una colgada (`stale`) no cuenta: es un sitio que
 * el barrido del servidor va a soltar, no una conversación.
 */
export function hayUnaLlamadaEnCurso(idsDelNumero: string[], vivas: LlamadaViva[]): boolean {
  const nuestras = new Set(idsDelNumero.filter(Boolean));
  if (nuestras.size === 0) return false;
  return vivas.some((c) => !!c?.callId && nuestras.has(String(c.callId)) && !c.stale);
}

/** Llave del candado en memoria: el mismo número por la misma sesión. */
export function laLlaveDelCandado(sid: string, digitos: string): string {
  return `${sid}::${digitos}`;
}
