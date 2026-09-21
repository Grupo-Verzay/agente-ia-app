/**
 * Entrada para el banco END TO END del latido: corre el `latidoDeLaSalaAction`
 * REAL con una sesión fingida, para comprobar que el `dentro` que recibe CADA
 * cliente trae la mano levantada de los demás. Es la mitad que faltaba al banco
 * de `losDeLaSala`: prueba la ACCIÓN entera, no solo la consulta.
 */
export { db } from "@/lib/db";
export {
    crearLaSala,
    entrarConCuenta,
    levantarLaMano,
    llamarALaPuerta,
    dejarPasar,
} from "@/lib/salas-de-video-db";
export { latidoDeLaSalaAction, levantarLaManoAction } from "@/actions/salas-de-video-actions";
// `__setUser` sale del stub por su ruta real (para que `tsc` lo vea); el
// `banco-mano.sh` ALIAS-ea además `@/lib/auth` → este mismo stub, así que el
// `currentUser` que usa la acción y este `__setUser` son el MISMO módulo.
export { __setUser } from "@/lib/__tests__/fingido/stub-auth-mano";
