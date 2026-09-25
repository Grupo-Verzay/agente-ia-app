/**
 * La entrada del banco del alcance del selector de Embudos y de la cuenta
 * recordada.
 *
 * Va aparte de `entrada-de-embudos.ts` porque su «antes» es otro: aquel
 * reproduce el tablero de cuando no había selector, y este el de cuando el
 * selector ofrecía **todas las cuentas de la plataforma**. Dos fallos, dos
 * commits pinchados, dos entradas.
 *
 * El `currentUser()` de mentira va DENTRO del paquete —importado aparte sería
 * otra copia y `ponerAQuienMira` no movería el código que corre— y al lado la
 * acción de verdad y las dos lecturas del servidor.
 */
export { ponerAQuienMira } from "./auth-de-documentos";
export { tableroDelEmbudoAction } from "@/actions/embudos-actions";
export { laCuentaConLaQueAbre } from "@/lib/tablero-de-embudo.server";
export { laCuentaRecordada } from "@/lib/embudos-db";
export { db } from "@/lib/db";
