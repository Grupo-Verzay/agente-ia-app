/**
 * La entrada que se empaqueta para el banco de MENCIONAR A LA CUENTA MADRE
 * desde una nota interna. Todo es de PRODUCCIÓN: escribir la nota, la lista de
 * mencionables de la madre, la ventana que interrumpe (`avisosPorSaltar`) y la
 * puerta de acceso por mención. Se finge SOLO `currentUser()`, el resumen de la
 * conversación (OpenAI), el auto-sync de Sheets y `revalidatePath`.
 */
export { ponerAQuienMira } from "./auth-de-finanzas";
export {
    createInternalNoteAction,
    getInternalNotesBySessionAction,
    mencionablesDeLaMadreAction,
} from "@/actions/internal-notes-actions";
export { accesoALaConversacionAction } from "@/actions/acceso-por-mencion-actions";
export { avisosPorSaltar } from "@/lib/avisos-de-tarea";
export { db } from "@/lib/db";
