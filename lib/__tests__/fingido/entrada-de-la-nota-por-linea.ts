/**
 * La entrada que se empaqueta para el banco de LA NOTA INTERNA POR LÍNEA.
 *
 * Todo lo que sale por aquí es de PRODUCCIÓN: la búsqueda de la ficha de la
 * conversación abierta (`getSessionByRemoteJid`), escribir y leer las notas de
 * una ficha, la lista de notas de la bandeja, la fila de una sesión y la regla
 * pura con la que el hook arma su pregunta. Se finge SOLO `currentUser()`, el
 * resumen de la conversación (OpenAI), el auto-sync de Sheets y
 * `revalidatePath`.
 */
export { ponerAQuienMira } from "./auth-de-finanzas";
export {
    createInternalNoteAction,
    getInternalNotesBySessionAction,
    lasNotasDeLaBandejaAction,
} from "@/actions/internal-notes-actions";
export { getSessionByRemoteJid, laFilaDeLaSesionAction } from "@/actions/session-action";
export { laBusquedaDeLaSesionAbierta } from "@/lib/sesion-de-la-conversacion-abierta";
export { db } from "@/lib/db";
