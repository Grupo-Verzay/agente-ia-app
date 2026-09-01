/**
 * Las marcas de tiempo de WhatsApp, siempre en milisegundos.
 *
 * Evolution las manda unas veces en segundos y otras en milisegundos, y el aviso
 * de tiempo real reenvía la que le llegó sin tocarla. Una marca en milisegundos
 * entre otras en segundos es MIL VECES mayor que cualquiera, así que cualquier
 * comparación en crudo entre dos marcas de distinta procedencia da lo contrario
 * de lo que parece.
 *
 * Eso ya costó dos días: la conversación se quedaba minutos por detrás de la
 * lista, una fila se clavaba arriba del todo, y un mensaje guardado en nuestra
 * base perdía contra los viejos de Evolution y no llegaba a la pantalla.
 *
 * Vive aquí, y solo aquí, a propósito: había TRES copias de esta función
 * —`chat-sidebar.utils.ts`, `actions/chat-actions.ts` y ninguna en
 * `actions/chat-manual-actions.ts`, que por eso comparaba en crudo—. Es un
 * módulo sin dependencias para que lo pueda usar tanto el navegador como el
 * servidor. Ver "Chats: las marcas de tiempo, siempre en segundos" en CLAUDE.md.
 *
 * El corte son 2.000.000.000: en segundos eso es mayo de 2033, y en milisegundos
 * enero de 1970. Cualquier marca real cae del lado correcto.
 */
export function epochToMs(epoch?: number | null): number {
  if (!epoch) return 0;
  return epoch < 2_000_000_000 ? epoch * 1000 : epoch;
}
