/**
 * Entrada para el banco del logo de la puerta de una reunión.
 *
 * Reúne la regla pura (`elLogoQueSeMuestra`), el lector contra la base
 * (`elLogoDeLaCuenta`) y las dos funciones de sala que hacen falta para probar
 * que el logo es el de la cuenta DUEÑA de la reunión, no otro.
 */
export { db } from "@/lib/db";
export { elLogoQueSeMuestra } from "@/lib/logo-de-la-reunion";
export {
    elLogoDeLaCuenta,
    crearLaSala,
    laSalaPorCodigo,
} from "@/lib/salas-de-video-db";
