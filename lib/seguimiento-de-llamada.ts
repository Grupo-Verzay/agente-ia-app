/**
 * Qué es un nodo de seguimiento, y cuál de ellos es la llamada con IA.
 *
 * «Llamar con IA (voz)» existía solo como ACCIÓN: al llegar el flujo a ese nodo
 * la llamada sale en el acto. Como SEGUIMIENTO es la misma llamada, pero con la
 * espera y el «Activar Inactividad» de los demás seguimientos: se agenda, y sale
 * días después si el cliente no contestó. La acción inmediata se queda igual.
 *
 * Esto es puro a propósito: la tarjeta del editor, el candado por plan y el
 * banco preguntan lo mismo, y con la condición escrita en cada sitio el tercero
 * se olvida — que aquí se vería como una tarjeta que pide subir un archivo para
 * hacer una llamada.
 */

export const PREFIJO_SEGUIMIENTO = 'seguimiento-';

/** El tipo del nodo de seguimiento que llama por voz con la IA. */
export const SEGUIMIENTO_DE_LLAMADA = 'seguimiento-ai-call';

/** El tipo de la ACCIÓN inmediata, que no cambia. */
export const LLAMADA_INMEDIATA = 'ai-call';

const limpio = (tipo?: string | null) => (tipo ?? '').trim().toLowerCase();

export function esSeguimiento(tipo?: string | null): boolean {
  return limpio(tipo).startsWith(PREFIJO_SEGUIMIENTO);
}

/**
 * De `seguimiento-ai-call` sale `ai-call`, y de `seguimiento-text`, `text`.
 *
 * Se quita el PREFIJO entero, no el primer trozo hasta el guion. Esto era
 * `tipo.split('-')[1]`, que con los cinco tipos de siempre daba lo mismo
 * —`text`, `image`…— y con el primero cuyo nombre lleva un guion dentro devolvía
 * `ai`: un tipo que no existe, así que la tarjeta se caía al caso por defecto y
 * pedía subir un archivo. Un guion de más no se ve leyendo.
 */
export function tipoBaseDelNodo(tipo?: string | null): string {
  const t = limpio(tipo);
  return t.startsWith(PREFIJO_SEGUIMIENTO) ? t.slice(PREFIJO_SEGUIMIENTO.length) : t;
}

/** ¿Este nodo es el seguimiento que llama con la IA? */
export function esSeguimientoDeLlamada(tipo?: string | null): boolean {
  return limpio(tipo) === SEGUIMIENTO_DE_LLAMADA;
}

/**
 * ¿Este nodo lanza una llamada con IA, por cualquiera de las dos puertas?
 *
 * La acción inmediata y el seguimiento son la MISMA llamada: el mismo número de
 * llamadas de la cuenta, el mismo asistente y los mismos créditos. Lo único que
 * cambia es cuándo sale.
 */
export function lanzaLlamadaConIa(tipo?: string | null): boolean {
  const t = limpio(tipo);
  return t === LLAMADA_INMEDIATA || t === SEGUIMIENTO_DE_LLAMADA;
}
