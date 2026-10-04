/**
 * La MISMA entrada, con las dos acciones tal cual estaban antes del arreglo
 * (`git show` del commit pinchado, en `lib/__tests__/.antes/nota-vista-previa`).
 * Sirve para que `MODO=roto` AFIRME el fallo: a la lista solo le llegaban los
 * ids de las conversaciones con notas, y la fila de una sesión solo decía si
 * tenía notas, nunca qué decía la última.
 */
export { ponerAQuienMira } from "./auth-de-finanzas";
export {
    createInternalNoteAction,
    deleteInternalNoteAction,
    getSessionIdsWithNotesAction,
} from "../.antes/nota-vista-previa/actions/internal-notes-actions";
export { laFilaDeLaSesionAction } from "../.antes/nota-vista-previa/actions/session-action";
export { db } from "@/lib/db";
