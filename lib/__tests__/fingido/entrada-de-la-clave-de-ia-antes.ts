/**
 * El «antes» del banco de la clave de IA: el mismo paquete, pero con
 * `actions/userAiconfig-actions.ts` tal como estaba en el commit anterior al
 * arreglo (lo saca `scripts/banco-clave-de-ia.sh` con `git show`). Sirve para
 * AFIRMAR el fallo: que la clave en claro llegaba en la respuesta.
 */
export { ponerAQuienMira } from "./auth-de-documentos";
export * from "../.antes/clave-de-ia/userAiconfig-actions";
export { db } from "@/lib/db";
