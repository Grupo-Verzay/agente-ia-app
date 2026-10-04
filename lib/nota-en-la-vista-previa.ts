/**
 * # La nota interna en la vista previa de la fila de Chats
 *
 * Cuando lo ÚLTIMO que pasó en una conversación es una nota interna de un
 * asesor, la fila de la lista la enseña como vista previa —el candado y su
 * texto—, igual que enseña «🖼️ Imagen», «🎙️ Nota de voz» o «📞 Llamada». En
 * cuanto llega o sale un mensaje nuevo, la vista previa vuelve a ser ese
 * mensaje y la nota se queda solo en la fila de iconitos (el candado ámbar).
 *
 * Por qué no salía: la nota de un asesor vive en `internal_notes`, NO en
 * `chat_messages`, y la vista previa sale entera de `chat.lastMessage`, que es
 * el último mensaje de WhatsApp. A la lista solo le llegaba «esta conversación
 * tiene notas» (un `Set` de ids) para pintar el candado, así que se veía el
 * icono y nunca el texto.
 *
 * La regla es una comparación de marcas, y las dos en MILISEGUNDOS: la de la
 * nota sale de `internal_notes.createdAt` y la del mensaje de `epochToMs` —el
 * mensaje llega en segundos o en milisegundos según el proveedor (ver «las
 * marcas de tiempo, siempre en segundos» en CLAUDE.md)—. Gana la nota solo si
 * es ESTRICTAMENTE posterior: a igualdad manda el mensaje, que es lo que el
 * cliente ve.
 *
 * Lo que NO cambia, a propósito:
 *
 * - **el orden de la lista y la hora de la fila** siguen siendo los del último
 *   mensaje. El orden lo comparten la lista y el número de «Todos»
 *   (`lo-que-ve-todos`), y una nota no es actividad del cliente;
 * - **«sin leer»**, que sigue mirando el mensaje: una nota de un compañero no
 *   pone una conversación en rojo;
 * - **el candado de la fila**, que sale mientras la conversación tenga notas,
 *   sea o no la nota lo último.
 *
 * Es puro y sin dependencias de React: lo usan la lista (navegador), las
 * acciones (servidor) y el banco.
 */
import { epochToMs } from "@/lib/epoch";

/** El icono de nota interna en la vista previa: el mismo candado de la fila. */
export const ICONO_DE_LA_NOTA = "🔒";

/** Lo que viaja de cada nota: la fila solo enseña una línea. */
export const TOPE_DEL_TEXTO_DE_LA_NOTA = 200;

/** Cuando una nota no trae texto (no debería pasar: crear exige contenido). */
export const NOTA_SIN_TEXTO = "Nota interna";

/** La última nota interna de UNA conversación, lista para la fila. */
export type UltimaNotaDeLaFila = { texto: string; creadaEnMs: number };

/** Lo que trae la consulta de la bandeja: una nota por conversación. */
export type NotaDeLaFila = UltimaNotaDeLaFila & { sessionId: number };

/**
 * El texto de una nota en UNA línea: los saltos y los espacios repetidos se
 * aplastan, y lo que pasa del tope se corta con «…». La fila recorta además
 * con CSS; esto es para no mover párrafos enteros por la red.
 */
export function elTextoDeLaNota(contenido: unknown): string {
  if (typeof contenido !== "string") return "";
  const una = contenido.replace(/\s+/g, " ").trim();
  if (una.length <= TOPE_DEL_TEXTO_DE_LA_NOTA) return una;
  return `${una.slice(0, TOPE_DEL_TEXTO_DE_LA_NOTA - 1).trimEnd()}…`;
}

/** Una marca de tiempo (Date, ISO o número) en milisegundos; 0 si no se entiende. */
function comoMs(valor: unknown): number {
  if (valor instanceof Date) {
    const ms = valor.getTime();
    return Number.isFinite(ms) ? ms : 0;
  }
  if (typeof valor === "number") return Number.isFinite(valor) && valor > 0 ? epochToMs(valor) : 0;
  if (typeof valor === "string" && valor.trim()) {
    const ms = Date.parse(valor);
    return Number.isFinite(ms) ? ms : 0;
  }
  return 0;
}

/**
 * Lo que sale de la base, convertido a lo que la fila necesita. Sin fecha que
 * se entienda no hay nota que comparar: `null`, y la vista previa se queda
 * con el mensaje, que es el lado seguro.
 */
export function comoUltimaNota(
  fila: { contenido?: unknown; creadaEn?: unknown } | null | undefined,
): UltimaNotaDeLaFila | null {
  if (!fila) return null;
  const creadaEnMs = comoMs(fila.creadaEn);
  if (!creadaEnMs) return null;
  return { texto: elTextoDeLaNota(fila.contenido), creadaEnMs };
}

/**
 * ¿La nota es lo último que pasó en la conversación? Solo si es posterior al
 * último mensaje. Una conversación sin ningún mensaje (marca 0) y con nota:
 * manda la nota.
 */
export function laNotaEsLoUltimo(
  nota: UltimaNotaDeLaFila | null | undefined,
  ultimoMensajeMs: number | null | undefined,
): boolean {
  if (!nota || !Number.isFinite(nota.creadaEnMs) || nota.creadaEnMs <= 0) return false;
  const mensaje = Number.isFinite(ultimoMensajeMs) ? Number(ultimoMensajeMs) : 0;
  return nota.creadaEnMs > mensaje;
}

/** El texto de la vista previa de una nota: el candado y lo que dice. */
export function laVistaPreviaDeLaNota(texto: string): string {
  return `${ICONO_DE_LA_NOTA} ${texto.trim() || NOTA_SIN_TEXTO}`;
}

export type VistaPreviaDeLaFila = { texto: string; esNota: boolean };

/**
 * Qué enseña la fila: la nota si es lo último, y si no el mensaje tal cual lo
 * armó la lista (con sus «🖼️ Imagen», «📞 Llamada»…).
 */
export function laVistaPreviaDeLaFila(entrada: {
  textoDelMensaje: string;
  ultimoMensajeMs: number;
  nota?: UltimaNotaDeLaFila | null;
}): VistaPreviaDeLaFila {
  if (laNotaEsLoUltimo(entrada.nota, entrada.ultimoMensajeMs)) {
    return { texto: laVistaPreviaDeLaNota(entrada.nota!.texto), esNota: true };
  }
  return { texto: entrada.textoDelMensaje, esNota: false };
}

/** La lista que trae el servidor, como el mapa que guarda la pantalla. */
export function elMapaDeLasNotas(
  lista: ReadonlyArray<NotaDeLaFila> | null | undefined,
): Map<number, UltimaNotaDeLaFila> {
  const mapa = new Map<number, UltimaNotaDeLaFila>();
  for (const n of lista ?? []) {
    if (!Number.isInteger(n?.sessionId) || n.sessionId <= 0) continue;
    if (!Number.isFinite(n.creadaEnMs) || n.creadaEnMs <= 0) continue;
    const previa = mapa.get(n.sessionId);
    // Si llegaran dos de la misma conversación, se queda la más reciente.
    if (!previa || n.creadaEnMs > previa.creadaEnMs) {
      mapa.set(n.sessionId, { texto: n.texto ?? "", creadaEnMs: n.creadaEnMs });
    }
  }
  return mapa;
}

/**
 * Pone, cambia o quita la última nota de UNA conversación, sin copiar el mapa
 * si no cambia nada (la lista es grande: un mapa nuevo rehace todas las filas).
 * `null` es «ya no tiene notas»: se borró la última.
 */
export function conLaUltimaNota(
  mapa: ReadonlyMap<number, UltimaNotaDeLaFila>,
  sessionId: number,
  nota: UltimaNotaDeLaFila | null,
): ReadonlyMap<number, UltimaNotaDeLaFila> {
  const antes = mapa.get(sessionId);
  if (!nota) {
    if (!antes) return mapa;
    const siguiente = new Map(mapa);
    siguiente.delete(sessionId);
    return siguiente;
  }
  if (antes && antes.texto === nota.texto && antes.creadaEnMs === nota.creadaEnMs) return mapa;
  const siguiente = new Map(mapa);
  siguiente.set(sessionId, nota);
  return siguiente;
}
