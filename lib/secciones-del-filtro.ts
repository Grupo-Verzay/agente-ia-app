/**
 * El panel de filtros de Chats (el embudo de la columna): qué sección se ve
 * desplegada y qué cierra el panel. Puro, para poder probarlo sin navegador.
 *
 * Etiquetas y Embudos son dos secciones PLEGABLES, cerradas al abrir el panel.
 * Desplegar una pliega la otra: con las dos listas abiertas a la vez el panel
 * se hacía larguísimo y tapaba la lista de chats entera.
 *
 * Y elegir una etiqueta o una etapa CIERRA el panel entero: lo que se viene a
 * hacer es filtrar la lista, y dejar el panel encima obligaba a pulsar fuera
 * para ver el resultado. Elegir la cuenta o el embudo NO lo cierra: son pasos
 * intermedios, todavía no filtran nada.
 */

export type SeccionDelFiltro = "etiquetas" | "embudos";

/** Las dos, en el orden en que se pintan. */
export const SECCIONES_DEL_FILTRO: readonly SeccionDelFiltro[] = ["etiquetas", "embudos"];

/** Con qué sección desplegada nace el panel cada vez que se abre: ninguna. */
export const SECCION_AL_ABRIR: SeccionDelFiltro | null = null;

/**
 * Pulsar el título de una sección: si ya estaba desplegada se pliega; si no, se
 * despliega y la otra se pliega (nunca dos a la vez).
 */
export function alternarSeccion(
  actual: SeccionDelFiltro | null,
  pulsada: SeccionDelFiltro,
): SeccionDelFiltro | null {
  return actual === pulsada ? null : pulsada;
}

export type AccionDelFiltro =
  | "etiqueta"
  | "etapa"
  | "embudo"
  | "cuenta"
  | "seccion"
  | "rango";

/**
 * ¿Esta acción cierra el panel? Solo lo que APLICA un filtro sobre la lista
 * (elegir o quitar una etiqueta o una etapa). El resto son pasos dentro del
 * panel —o el rango de fechas, que se escribe en dos campos— y cerrarlo a
 * mitad obligaría a volver a abrirlo.
 */
export function cierraElPanel(accion: AccionDelFiltro): boolean {
  return accion === "etiqueta" || accion === "etapa";
}
