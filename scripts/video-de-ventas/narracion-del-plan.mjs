/**
 * Lo que hay que sintetizar para los VÍDEOS DE LOS PLANES (`planes.mjs`): la
 * narración del caso de uso y la de cada tramo del montaje, con la MISMA voz
 * del vídeo de ventas (`VOZ_DE_VENTAS`: Cedar en tono de anuncio). Viven en la
 * misma caché (`video-de-ventas/voz/`): la llave de cada frase sale de su
 * texto y su voz, así que no se pisan con las del vídeo de ventas.
 *
 *   node scripts/sintetizar-en-el-contenedor.mjs scripts/video-de-ventas/narracion-del-plan.mjs
 */
import { CACHE_DE_VENTAS, VOZ_DE_VENTAS } from "./narracion.mjs";
import { PLANES_DEL_VIDEO } from "./planes.mjs";

export { CACHE_DE_VENTAS };

/** Las frases de un plan, en el orden en que suenan. */
export function lasFrasesDelPlan(plan) {
    const caso = Object.values(plan.narracion).map((n) => n.texto);
    const tramos = plan.tramos.filter((t) => t.texto).map((t) => t.texto);
    return [...caso, ...tramos];
}

export function loQueSeSintetiza() {
    return [...new Set(Object.values(PLANES_DEL_VIDEO).flatMap(lasFrasesDelPlan))].map((texto) => ({ texto, voz: VOZ_DE_VENTAS }));
}
