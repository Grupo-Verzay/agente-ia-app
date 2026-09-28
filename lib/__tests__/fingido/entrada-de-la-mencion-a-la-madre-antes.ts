/**
 * El «antes»: `createInternalNoteAction` tal como estaba en `ANTES_REF`,
 * sacado de git a una carpeta aparte. El modo roto afirma con él que a un
 * administrador de la madre no se le podía mencionar: se descartaba y no le
 * saltaba nada.
 */
export { ponerAQuienMira } from "./auth-de-finanzas";
export { createInternalNoteAction } from "../.antes/mencion-madre/actions/internal-notes-actions";
export { avisosPorSaltar } from "@/lib/avisos-de-tarea";
export { db } from "@/lib/db";
