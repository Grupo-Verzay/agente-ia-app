/**
 * El orden de la lista de DIRECTOS del chat de equipo, que es de cada persona.
 *
 * Puro. Lo guarda `orden_en_tablero` con `tipo: "directos"` y `tableroId` = la
 * PERSONA que mira —el mismo mecanismo que los tableros y el árbol de
 * Documentación, un tipo más—, así que cada quien ve su propio orden al volver
 * y lo que coloca una persona no se lo mueve a nadie.
 *
 * # La llave es la PERSONA con quien se habla, no el canal
 *
 * La lista mezcla dos cosas: los directos que ya existen (un canal) y la gente
 * con quien todavía no se ha abierto ninguno (sin canal). Llaveando por canal,
 * la persona que hoy no tiene directo no se podría colocar, y en cuanto se le
 * escribiera por primera vez saltaría de sitio. Por la persona, abrir el
 * directo no la mueve.
 *
 * # Lo que no tiene posición va DETRÁS, en el orden de siempre
 *
 * Al revés que en un tablero (`ordenarLaColumna`), y a propósito: allí una
 * tarjeta nueva SÍ trae posición y lo sin colocar es lo viejo; aquí nadie le da
 * posición a quien entra en el equipo, así que delante saltaría encima del
 * orden que la persona puso a mano. Detrás, sin tocar nada, la lista sale
 * exactamente como salía antes de que existiera esto.
 */

import type { PosicionesDelTablero } from "@/lib/orden-del-tablero";

/**
 * La lista colocada. `claveDe` devuelve `null` para lo que NO se ordena —un
 * directo que se lee sin pertenecer, lo que ve quien administra—: eso va al
 * final siempre, fuera de la parte que se arrastra.
 */
export function ordenarLosDirectos<T>(
    items: T[],
    posiciones: PosicionesDelTablero,
    claveDe: (t: T) => string | null,
): T[] {
    const colocados: Array<{ t: T; pos: number; llegada: number }> = [];
    const sinColocar: T[] = [];
    const fuera: T[] = [];

    items.forEach((t, llegada) => {
        const clave = claveDe(t);
        if (!clave) {
            fuera.push(t);
            return;
        }
        const pos = posiciones[clave];
        if (typeof pos === "number" && Number.isFinite(pos)) colocados.push({ t, pos, llegada });
        else sinColocar.push(t);
    });

    colocados.sort((a, b) => (a.pos === b.pos ? a.llegada - b.llegada : a.pos - b.pos));
    return [...colocados.map((c) => c.t), ...sinColocar, ...fuera];
}

/** Cuántas personas se guardan de una vez: el equipo de una familia no llega. */
export const TOPE_DE_DIRECTOS = 500;
