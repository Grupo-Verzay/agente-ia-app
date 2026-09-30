/**
 * La entrada que se empaqueta para el banco de Mis formularios contra
 * Postgres. Lo único fingido es `currentUser()` y Google Sheets: las acciones,
 * la puerta de la cuenta y la base son las de producción.
 *
 * En `MODO=roto` el banco empaqueta ESTE MISMO fichero dentro de un árbol del
 * commit de antes, así que `@/actions/forms-actions` resuelve al de entonces.
 */
export { ponerAQuienMira } from "./auth-de-documentos";
export { ponerLaHoja, laHojaDeMentira } from "./googleapis-de-formularios";
export * as acciones from "@/actions/forms-actions";
export { db } from "@/lib/db";
