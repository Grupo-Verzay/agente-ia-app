/**
 * El ENCUADRE de la miniatura de una sección de la guía: qué trozo de la
 * pantalla se fotografía para la tarjeta del índice.
 *
 * La tarjeta es 16:9 (`aspect-[16/9]` en `TarjetaDeSeccion`), así que el trozo
 * también: con otra proporción el `object-cover` recortaría y la zona
 * señalada podría quedarse fuera de la tarjeta. Y la zona va CENTRADA con
 * aire alrededor, que es lo que deja ver el fondo atenuado: una miniatura
 * recortada al ras del recuadro no tendría nada que atenuar.
 *
 * La misma regla para las siete secciones —eso es lo que las hace
 * simétricas—, y pura para poder probarla sin navegador.
 */
export const PROPORCION = 16 / 9;
/** Cuánto más grande que la zona es el encuadre, por cada lado a la vez. */
export const AIRE = 1.6;
/** El encuadre más pequeño: por debajo, un botón suelto llenaría la tarjeta y no se vería dónde está. */
export const ANCHO_MINIMO = 720;
/** El ancho de referencia de las marcas: a este ancho, el recuadro mide lo mismo que en una captura de paso. */
export const ANCHO_DE_REFERENCIA = 640;
/** Lo que mide la miniatura en disco. */
export const SALIDA = { ancho: 960, alto: 540 };

export function encuadreDeLaMiniatura(foco, vista) {
    let w = Math.max(foco.w * AIRE, ANCHO_MINIMO);
    let h = w / PROPORCION;
    if (h < foco.h * AIRE) {
        h = foco.h * AIRE;
        w = h * PROPORCION;
    }
    if (w > vista.width) {
        w = vista.width;
        h = w / PROPORCION;
    }
    if (h > vista.height) {
        h = vista.height;
        w = h * PROPORCION;
    }
    const cx = foco.x + foco.w / 2;
    const cy = foco.y + foco.h / 2;
    const x = Math.min(Math.max(cx - w / 2, 0), vista.width - w);
    const y = Math.min(Math.max(cy - h / 2, 0), vista.height - h);
    return { x, y, w, h, escala: w / ANCHO_DE_REFERENCIA };
}
