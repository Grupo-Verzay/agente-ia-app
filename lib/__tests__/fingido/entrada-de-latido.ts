/**
 * Entrada para el banco END TO END del latido: corre el `latidoDeLaSalaAction`
 * REAL con una sesión fingida, para comprobar que el `dentro` que recibe CADA
 * cliente trae la mano levantada de los demás. Es la mitad que faltaba al banco
 * de `losDeLaSala`: prueba la ACCIÓN entera, no solo la consulta.
 */
export { db } from "@/lib/db";
export { crearLaSala, entrarConCuenta, levantarLaMano } from "@/lib/salas-de-video-db";
export { latidoDeLaSalaAction } from "@/actions/salas-de-video-actions";
export { __setUser } from "@/lib/auth";
