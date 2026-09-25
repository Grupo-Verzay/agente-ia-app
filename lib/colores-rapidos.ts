/**
 * Los colores rápidos, en UN solo sitio.
 *
 * La fila de seis círculos que se elige al crear una etiqueta —y ahora al
 * editar una etapa de un embudo— estaba **copiada en dos ficheros**
 * (`SessionTagsManager` y `SortableTagList`), así que ya eran dos listas que un
 * día dirían cosas distintas. Con una tercera copia en Embudos, «los mismos
 * seis colores de Etiquetas» dejaría de ser cierto en cuanto alguien afinara
 * uno: y eso no se ve como un error, se ve como dos pantallas de la misma
 * plataforma que no se parecen, sin saber cuál es la buena.
 *
 * Aquí es cierto **por construcción**: los tres sitios importan esta lista.
 *
 * Y el gris de «sin color» va al lado a propósito: es el que se pinta cuando no
 * se eligió ninguno, y separado de los seis acabaría siendo otro gris.
 */

/** Los seis de la fila rápida: azul, verde, naranja, rosa, violeta, ámbar. */
export const COLORES_RAPIDOS = [
    "#3B82F6",
    "#22C55E",
    "#F97316",
    "#EC4899",
    "#A855F7",
    "#F59E0B",
] as const;

/** El gris de «sin color elegido». */
export const COLOR_SIN_ELEGIR = "#64748B";

/** Con el que abre el selector libre cuando todavía no hay color. */
export const COLOR_DEL_SELECTOR = "#3B82F6";

/**
 * ¿Son el mismo color?
 *
 * **Hace falta, y es un fallo que ya estaba**: los seis de arriba van en
 * MAYÚSCULAS y el selector nativo del navegador devuelve siempre minúsculas
 * (`#3b82f6`). Comparando con `===`, elegir azul en la rueda no marcaba el
 * círculo azul de al lado: el mismo color salía como dos, y desde fuera eso se
 * lee como que la selección no se guarda.
 */
export function mismoColor(a: string | null | undefined, b: string | null | undefined): boolean {
    const limpio = (v: string | null | undefined) => (typeof v === "string" ? v.trim().toLowerCase() : "");
    const x = limpio(a);
    const y = limpio(b);
    return x !== "" && x === y;
}

/**
 * Un color que llega de fuera se acepta solo si es un hex de seis dígitos, y se
 * guarda en MAYÚSCULAS para que la base no tenga dos formas del mismo color.
 *
 * Lo que no encaje es `null` —«sin color»—, nunca un color inventado: un valor
 * raro guardado tal cual acaba pintado como un hueco transparente y nadie sabe
 * de dónde salió.
 */
export function comoColorHex(valor: unknown): string | null {
    if (typeof valor !== "string") return null;
    const limpio = valor.trim();
    if (!/^#[0-9a-fA-F]{6}$/.test(limpio)) return null;
    return limpio.toUpperCase();
}
