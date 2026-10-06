import type { IconosDeLaFila } from "@/lib/iconos-de-la-fila";

/**
 * Aviso entre pantallas de la MISMA pestaña: cambiar un interruptor en
 * Apariencia pone al día la lista de Chats si está montada, sin recargar.
 */
export const EVENTO_ICONOS_DE_LA_FILA = "chats:iconos-de-la-fila";

export function avisarDeLosIconosDeLaFila(iconos: IconosDeLaFila): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<IconosDeLaFila>(EVENTO_ICONOS_DE_LA_FILA, { detail: iconos }));
}
