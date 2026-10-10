/**
 * La entrada que se empaqueta para el banco de los ADJUNTOS EN LAS NOTAS.
 *
 * Todo lo que sale por aquí es de PRODUCCIÓN: escribir, leer y borrar una nota
 * (`createInternalNoteAction`, `getInternalNotesBySessionAction`,
 * `deleteInternalNoteAction`) y la lista de notas de la bandeja
 * (`lasNotasDeLaBandejaAction`). Se finge SOLO `currentUser()`, el bucket
 * (`minio`), el resumen de la conversación (OpenAI), el auto-sync de Sheets y
 * `revalidatePath`.
 */
export { ponerAQuienMira } from "./auth-de-finanzas";
export {
    createInternalNoteAction,
    deleteInternalNoteAction,
    getInternalNotesBySessionAction,
    lasNotasDeLaBandejaAction,
} from "@/actions/internal-notes-actions";
export { quitados, fallan } from "./minio-de-las-notas";
export { db } from "@/lib/db";
