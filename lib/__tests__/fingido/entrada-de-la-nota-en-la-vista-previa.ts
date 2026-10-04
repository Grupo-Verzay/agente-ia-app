/**
 * La entrada que se empaqueta para el banco de LA NOTA EN LA VISTA PREVIA.
 *
 * Todo lo que sale por aquí es de PRODUCCIÓN: escribir y borrar una nota
 * (`createInternalNoteAction`, `deleteInternalNoteAction`), la lista de notas
 * de la bandeja (`lasNotasDeLaBandejaAction`), la fila de una sola sesión
 * (`laFilaDeLaSesionAction`) y la regla pura con la que la lista decide la
 * vista previa. Se finge SOLO `currentUser()`, el resumen de la conversación
 * (OpenAI), el auto-sync de Sheets y `revalidatePath`.
 */
export { ponerAQuienMira } from "./auth-de-finanzas";
export {
    createInternalNoteAction,
    deleteInternalNoteAction,
    lasNotasDeLaBandejaAction,
} from "@/actions/internal-notes-actions";
export { laFilaDeLaSesionAction } from "@/actions/session-action";
export { laVistaPreviaDeLaFila, ICONO_DE_LA_NOTA, TOPE_DEL_TEXTO_DE_LA_NOTA } from "@/lib/nota-en-la-vista-previa";
export { db } from "@/lib/db";
