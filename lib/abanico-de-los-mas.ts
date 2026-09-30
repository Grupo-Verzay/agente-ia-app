/**
 * Los «+» de las TRES salidas del nodo Decisión (Sí, Variante y No).
 *
 * Cada «+» mide 28 px y cuelga a la derecha de su punto de salida. Los tres
 * puntos van al 16, 50 y 84 % del alto de la caja, o sea a un 34 % de
 * distancia: 15, 20 o 25 px según el tamaño del nodo. Pegados a su punto, los
 * tres «+» se montaban unos sobre otros y sus bordes discontinuos se cruzaban.
 *
 * Se abren en ABANICO, simétrico sobre el del medio: el de Sí sube y el de No
 * baja lo justo para dejar `HUECO_ENTRE_MAS_PX` entre ellos. El orden no
 * cambia, así que cada «+» sigue a la altura relativa de su punto.
 */
export const LADO_DEL_MAS_PX = 28;
export const HUECO_ENTRE_MAS_PX = 4;

/** Dónde va cada salida, en % del alto de la caja. */
export const SALIDAS_DE_LA_DECISION_PCT = { yes: 16, variante: 50, no: 84 } as const;

/** Cuánto se separa del medio el «+» de Sí (hacia arriba) y el de No (hacia abajo). */
export function elAbanicoDeLosMas(altoDeLaCajaPx: number): number {
    const separacion = ((SALIDAS_DE_LA_DECISION_PCT.no - SALIDAS_DE_LA_DECISION_PCT.variante) / 100) * altoDeLaCajaPx;
    return Math.max(0, LADO_DEL_MAS_PX + HUECO_ENTRE_MAS_PX - separacion);
}
