/**
 * El «antes» de la mención en Chats: `createInternalNoteAction` y
 * `resolveSession` tal como estaban en `ANTES_REF`, sacados de git a una
 * carpeta aparte (ver el script). El modo roto afirma con ellos que mencionar
 * no abría nada y que se avisaba a quien no era del equipo.
 */
export { ponerAQuienMira } from "./auth-de-finanzas";
export { createInternalNoteAction } from "../.antes/mencion/actions/internal-notes-actions";
export { resolveSession } from "../.antes/mencion/actions/advisor-assign-actions";
export { db } from "@/lib/db";
