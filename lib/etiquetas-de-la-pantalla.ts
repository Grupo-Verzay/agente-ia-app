/**
 * Las reglas de la pantalla de ETIQUETAS (`/tags`), puras: las usan el tablero,
 * la barra de arriba de la pantalla, la lista de Gestionar y la guía pública.
 *
 * Estaban repartidas y desacordadas:
 *
 * - Los cinco rangos de puntaje vivían DOS veces —la barra los pintaba con su
 *   nombre y su color, y el tablero filtraba con su mínimo y su máximo—, y el
 *   color de la insignia del puntaje de cada tarjeta era una tercera copia con
 *   los cortes escritos a mano. Tres sitios para decir «qué es un lead Alto».
 * - Pulsar el rango que ya estaba puesto no lo quitaba: dejaba el mismo, y la
 *   «x» que salía al lado prometía algo que el botón no hacía. Una vez puesto un
 *   filtro de puntaje no había forma de volver a ver el tablero entero.
 * - Reordenar las etiquetas con una búsqueda puesta guardaba el orden SOLO de
 *   las que se veían (0, 1, 2…) y dejaba en la pantalla nada más que esas: las
 *   escondidas desaparecían de la lista hasta recargar y su orden quedaba
 *   empatado con las de arriba.
 */

/** Un rango de puntaje del filtro, de 0 a 100 y sin huecos entre uno y otro. */
export type RangoDePuntaje = {
    readonly clave: "bajo" | "medio" | "moderado" | "alto" | "listo";
    readonly nombre: string;
    readonly min: number;
    readonly max: number;
    readonly color: string;
};

export const RANGOS_DE_PUNTAJE: readonly RangoDePuntaje[] = [
    { clave: "bajo", nombre: "Bajo", min: 0, max: 25, color: "#EF4444" },
    { clave: "medio", nombre: "Medio", min: 26, max: 50, color: "#F97316" },
    { clave: "moderado", nombre: "Moderado", min: 51, max: 75, color: "#F59E0B" },
    { clave: "alto", nombre: "Alto", min: 76, max: 90, color: "#22C55E" },
    { clave: "listo", nombre: "Listo", min: 91, max: 100, color: "#16A34A" },
] as const;

export type ClaveDePuntaje = RangoDePuntaje["clave"];

/** «26–50»: lo que se lee en el globo de cada rango. */
export const elTramo = (r: RangoDePuntaje) => `${r.min}–${r.max}`;

/**
 * El rango de un puntaje, o `null` si no lo hay (sin calificar). Un número
 * fuera de 0..100 —un dato viejo— se acota al extremo: nunca se queda sin
 * color una insignia que sí tiene número.
 */
export function elRangoDelPuntaje(puntaje: number | null | undefined): RangoDePuntaje | null {
    if (puntaje === null || puntaje === undefined || !Number.isFinite(puntaje)) return null;
    const p = Math.min(100, Math.max(0, Math.round(puntaje)));
    return RANGOS_DE_PUNTAJE.find((r) => p >= r.min && p <= r.max) ?? null;
}

/**
 * Qué filtro queda puesto al pulsar un rango: uno a la vez, y pulsar el que ya
 * está puesto lo QUITA. Devuelve la clave, o `null` si no queda ninguno.
 */
export function elFiltroDePuntaje(puesto: ClaveDePuntaje | null, pulsado: ClaveDePuntaje): ClaveDePuntaje | null {
    return puesto === pulsado ? null : pulsado;
}

/** ¿Pasa esta tarjeta el filtro de puntaje? Sin filtro pasan todas; con filtro, solo las calificadas en ese rango. */
export function pasaElFiltroDePuntaje(puntaje: number | null | undefined, puesto: ClaveDePuntaje | null): boolean {
    if (puesto === null) return true;
    return elRangoDelPuntaje(puntaje)?.clave === puesto;
}

/** Cuántas tarjetas caen en cada rango. Las que no tienen puntaje no cuentan en ninguno. */
export function cuantasPorRango(puntajes: ReadonlyArray<number | null | undefined>): Record<ClaveDePuntaje, number> {
    const cuentas = Object.fromEntries(RANGOS_DE_PUNTAJE.map((r) => [r.clave, 0])) as Record<ClaveDePuntaje, number>;
    for (const p of puntajes) {
        const r = elRangoDelPuntaje(p);
        if (r) cuentas[r.clave] += 1;
    }
    return cuentas;
}

/**
 * Por qué no se puede reordenar la lista de etiquetas ahora mismo, o `null` si
 * se puede. Con una búsqueda puesta se ve un trozo de la lista, y arrastrar
 * dentro de un trozo no dice dónde quedan las escondidas.
 */
export function porQueNoSePuedenOrdenarLasEtiquetas(busqueda: string): string | null {
    return busqueda.trim() ? "Quita la búsqueda para ordenar las etiquetas." : null;
}
