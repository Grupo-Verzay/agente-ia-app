/**
 * El formulario «Página de detalle» de un plan (Panel › Planes) va en el MISMO
 * orden que su página pública: cada bloque grande —video, para quién, resumen
 * de capacidad, qué incluye, preguntas, comenzar— es una sola pieza que se
 * arrastra entera o se sube y se baja, y moverla aquí es moverla en la página.
 *
 * Antes los bloques del formulario iban en un orden fijo y el orden de la
 * página se elegía en una lista aparte: con un orden distinto al de fábrica
 * había que saltar arriba y abajo para editar la página de arriba a abajo.
 *
 * Esto es lo que decide, puro, para poder probarlo sin navegador. La lista
 * compacta «Orden de la página» y los bloques del formulario usan las MISMAS
 * funciones: con dos reglas, un día una diría que el bloque cae delante y la
 * otra detrás.
 */

export type LadoDeLaCaida = "antes" | "despues";

/**
 * El orden después de soltar `activo` sobre `sobre`: el de `arrayMove` (el
 * bloque ocupa el sitio del que tenía debajo y los de en medio se corren).
 * Sin `sobre`, sobre sí mismo o con una clave que no está, no cambia nada y
 * devuelve la MISMA lista: así no se repinta por gusto.
 */
export function elOrdenAlSoltar<T>(orden: readonly T[], activo: T, sobre: T | null): readonly T[] {
    if (sobre === null || activo === sobre) return orden;
    const de = orden.indexOf(activo);
    const a = orden.indexOf(sobre);
    if (de < 0 || a < 0) return orden;
    const nuevo = [...orden];
    nuevo.splice(de, 1);
    nuevo.splice(a, 0, activo);
    return nuevo;
}

/** Subir (`-1`) o bajar (`1`) un puesto. En el borde no se mueve. */
export function elOrdenAlMover<T>(orden: readonly T[], bloque: T, paso: -1 | 1): readonly T[] {
    const de = orden.indexOf(bloque);
    const a = de + paso;
    if (de < 0 || a < 0 || a >= orden.length) return orden;
    return elOrdenAlSoltar(orden, bloque, orden[a]);
}

/**
 * Dónde se pinta la raya que dice dónde cae el bloque: delante de `sobre` si
 * el bloque SUBE, detrás si BAJA. Es la misma cuenta que `elOrdenAlSoltar`, así
 * que la raya enseña exactamente dónde va a quedar al soltar.
 */
export function laMarcaDeLaCaida<T>(
    orden: readonly T[],
    activo: T | null,
    sobre: T | null,
): { bloque: T; lado: LadoDeLaCaida } | null {
    if (activo === null || sobre === null || activo === sobre) return null;
    const de = orden.indexOf(activo);
    const a = orden.indexOf(sobre);
    if (de < 0 || a < 0) return null;
    return { bloque: sobre, lado: a < de ? "antes" : "despues" };
}

/**
 * El bloque más cercano a la altura `y` del puntero: el que la contiene, y si
 * cae en el hueco entre dos, el de borde más cercano (a igualdad, el de
 * arriba). Hace falta porque los bloques miden muy distinto —el video unas
 * líneas, el resumen de capacidad una pantalla—: medir por el centro, como en
 * una lista de filas iguales, haría que soltar al principio de un bloque largo
 * cayera en el de al lado.
 */
export function elMasCercanoEnVertical<T>(cajas: readonly { id: T; top: number; bottom: number }[], y: number): T | null {
    let mejor: { id: T; d: number } | null = null;
    for (const c of cajas) {
        const d = y < c.top ? c.top - y : y > c.bottom ? y - c.bottom : 0;
        if (!mejor || d < mejor.d) mejor = { id: c.id, d };
    }
    return mejor ? mejor.id : null;
}
