/**
 * El mapa de la tarjeta de ubicación, armado con TESELAS de OpenStreetMap.
 *
 * Por qué así y no de otra forma:
 *
 * - **Sin clave ni proveedor de pago.** Un mapa estático de Google o Mapbox
 *   pide una clave que habría que configurar y pagar por cuenta; las teselas de
 *   OpenStreetMap son imágenes sueltas de 256 px que se piden directamente.
 * - **Sin `<iframe>`.** Un mapa embebido por burbuja es una página entera, con
 *   sus scripts, por cada ubicación de la conversación. Aquí son 2-4 imágenes
 *   con `loading="lazy"`: una conversación con diez ubicaciones no pide nada
 *   hasta que se ven.
 * - **La miniatura de WhatsApp no sirve:** `JPEGThumbnail` se quita al guardar
 *   (`recortarRawAdjuntos`, en el backend) y en las 62 ubicaciones guardadas no
 *   hay ninguna. Las coordenadas sí están siempre.
 *
 * La cuenta es la de Web Mercator, que es la que usan las teselas: el punto se
 * pasa a píxeles del mundo a un zoom dado y se piden las teselas que cubren una
 * ventana de `ancho × alto` centrada en él. Cada tesela se coloca RELATIVA AL
 * CENTRO (`calc(50% + dx)`), así que si la caja se estrecha en un móvil el
 * punto sigue en medio y solo se recortan los bordes.
 *
 * Puro: entra el punto y sale la lista de imágenes con su desplazamiento.
 */

export const TAMANO_DE_TESELA = 256;
/** Calles y manzanas a la vista, que es lo que sirve para llegar a un sitio. */
export const ZOOM_DEL_MAPA = 15;
/** La caja del mapa, en píxeles CSS: el ancho de una tarjeta de documento (350 px) y el alto de su miniatura. */
export const ANCHO_DEL_MAPA = 350;
export const ALTO_DEL_MAPA = 150;

/** El límite de Web Mercator: más allá, las teselas no existen. */
const LATITUD_MAXIMA = 85.05112878;

export const ATRIBUCION_DEL_MAPA = "© OpenStreetMap";

export type Tesela = {
    url: string;
    /** Desplazamiento de su esquina superior izquierda respecto al PUNTO, en px. */
    dx: number;
    dy: number;
};

/** El punto en píxeles del mundo, al zoom dado. */
export function aPixelesDelMundo(latitud: number, longitud: number, zoom: number): { x: number; y: number } {
    const lado = TAMANO_DE_TESELA * 2 ** zoom;
    const lat = Math.max(-LATITUD_MAXIMA, Math.min(LATITUD_MAXIMA, latitud));
    const rad = (lat * Math.PI) / 180;
    const x = ((longitud + 180) / 360) * lado;
    const y = ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * lado;
    return { x, y };
}

/**
 * Las teselas que cubren la caja del mapa, centradas en el punto.
 *
 * En horizontal el mundo da la vuelta (la tesela x = -1 es la última), así que
 * se envuelve; en vertical no, y lo que se sale por un polo no se pide.
 */
export function lasTeselasDelMapa(
    latitud: number,
    longitud: number,
    opciones: { zoom?: number; ancho?: number; alto?: number } = {},
): Tesela[] {
    const zoom = opciones.zoom ?? ZOOM_DEL_MAPA;
    const ancho = opciones.ancho ?? ANCHO_DEL_MAPA;
    const alto = opciones.alto ?? ALTO_DEL_MAPA;
    const n = 2 ** zoom;
    const { x, y } = aPixelesDelMundo(latitud, longitud, zoom);

    const x0 = Math.floor((x - ancho / 2) / TAMANO_DE_TESELA);
    const x1 = Math.floor((x + ancho / 2 - 1) / TAMANO_DE_TESELA);
    const y0 = Math.floor((y - alto / 2) / TAMANO_DE_TESELA);
    const y1 = Math.floor((y + alto / 2 - 1) / TAMANO_DE_TESELA);

    const teselas: Tesela[] = [];
    for (let ty = y0; ty <= y1; ty++) {
        if (ty < 0 || ty >= n) continue;
        for (let tx = x0; tx <= x1; tx++) {
            const envuelta = ((tx % n) + n) % n;
            teselas.push({
                url: `https://tile.openstreetmap.org/${zoom}/${envuelta}/${ty}.png`,
                dx: Math.round(tx * TAMANO_DE_TESELA - x),
                dy: Math.round(ty * TAMANO_DE_TESELA - y),
            });
        }
    }
    return teselas;
}
