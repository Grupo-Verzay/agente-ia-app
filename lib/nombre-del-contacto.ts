/**
 * # Cómo se pinta el NOMBRE de un contacto
 *
 * La lista de Chats y la cabecera de la conversación enseñan el mismo nombre, y
 * lo tienen que dibujar IGUAL, emojis incluidos. Durante un tiempo no: en la
 * cabecera «Ramírez 🌷🌼» salía con cuadritos vacíos y en la fila de la lista se
 * veía bien.
 *
 * La diferencia no estaba en el texto —los dos salen de la misma sesión— sino
 * en la CAJA. Al apretar la cabecera a 78 px (#935) el nombre quedó en una línea
 * de 18 px, y seguía con `truncate`, que es `overflow: hidden` en los DOS ejes.
 * Un emoji de color es más alto que la letra (su fuente, Noto Color Emoji o
 * Segoe UI Emoji, reserva ~1,2–1,33 em), así que en 18 px se le recortaba arriba
 * y abajo. La fila de la lista mide 24 px y no recorta en vertical.
 *
 * Dos reglas, y las dos van aquí para que no haya una segunda versión:
 *
 * 1. **La letra es la de la lista** (`TIPOGRAFIA_DEL_NOMBRE`): `app-item-title`
 *    —16 px, 600— y `capitalize`. Con Poppins, 600 cae en el mismo fichero Bold
 *    que el `font-bold` de antes, así que la letra latina se ve igual; lo que
 *    cambia es que el emoji se pide con el mismo peso que en la lista.
 * 2. **Se recorta SOLO a lo ancho** (`RECORTE_A_LO_ANCHO`): `overflow-x: clip`
 *    con puntos suspensivos. Un nombre largo sigue acabando en «…», y a lo alto
 *    nada se corta aunque la línea sea más baja que el emoji. **Nunca
 *    `truncate`** en una línea más baja que 24 px.
 *
 * Lo comprueba `scripts/banco-estado-en-la-cabecera.sh` por píxeles: el nombre
 * se pinta igual con el recorte que sin él.
 */
export const TIPOGRAFIA_DEL_NOMBRE = "app-item-title capitalize";

/** Puntos suspensivos a lo ancho, sin recortar a lo alto. */
export const RECORTE_A_LO_ANCHO = "min-w-0 overflow-x-clip text-ellipsis whitespace-nowrap";
