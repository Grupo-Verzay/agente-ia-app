/**
 * La entrada del banco puro de «los cinco asuntos de CRM › Llamadas».
 * `MODO=roto` no usa esta: el script arma otra con los ficheros de ANTES_REF.
 */
export { elDetalleDeLaLlamada } from "@/lib/detalle-de-la-llamada";
export { CALL_DISPOSITIONS, getDispositionMeta } from "@/lib/call-dispositions";
export {
    leerElResultadoDeLaIa,
    laIaPuedeEscribir,
    resultadoSinConversacion,
    elResultadoQueSeVe,
} from "@/lib/resultado-de-la-llamada";
export { laDuracionDelReproductor, elTiempoDelReproductor } from "@/lib/reproductor-de-llamada";
