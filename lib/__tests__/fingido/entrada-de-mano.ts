/**
 * Entrada para el banco de la mano levantada.
 *
 * Se reexportan las funciones REALES del servidor: crear la sala, meter gente,
 * levantar/bajar la mano, leer a los de la sala, y la regla de caducidad
 * (`tieneLaManoLevantada`). Con eso se reconstruye **exactamente lo que el
 * latido le manda a cada cliente sobre los demás** —`comoSeVe` en
 * `latidoDeLaSalaAction` hace `manoLevantada: tieneLaManoLevantada(f.manoLevantadaEn)`
 * sobre `losDeLaSala`—, sin fingir la sesión de dos personas.
 */
export { db } from "@/lib/db";
export {
    crearLaSala,
    entrarConCuenta,
    levantarLaMano,
    losDeLaSala,
} from "@/lib/salas-de-video-db";
export { tieneLaManoLevantada } from "@/lib/sala-de-video";
