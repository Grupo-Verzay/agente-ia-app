/**
 * La MISMA entrada, con la acción de notas tal cual estaba antes del arreglo
 * (`git show` del commit pinchado, en `lib/__tests__/.antes/adjuntos-notas`).
 * Sirve para que `MODO=roto` AFIRME el fallo: una nota no sabía de archivos —
 * los ignoraba y guardaba solo el texto— y sin texto se rechazaba.
 */
export { ponerAQuienMira } from "./auth-de-finanzas";
export {
    createInternalNoteAction,
    deleteInternalNoteAction,
    getInternalNotesBySessionAction,
    lasNotasDeLaBandejaAction,
} from "../.antes/adjuntos-notas/actions/internal-notes-actions";
export { quitados, fallan } from "./minio-de-las-notas";
export { db } from "@/lib/db";
