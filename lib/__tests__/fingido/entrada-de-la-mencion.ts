/**
 * La entrada que se empaqueta para el banco de la MENCIÓN EN CHATS.
 *
 * Todo lo que sale por aquí es de PRODUCCIÓN: escribir una nota con menciones
 * (`createInternalNoteAction`), las tres acciones del acceso por mención, la
 * única puerta de resolver (`resolveSession`) y los participantes de siempre,
 * para afirmar que no se tocan. Se finge SOLO `currentUser()`, el resumen de
 * la conversación (OpenAI), el auto-sync de Sheets y `revalidatePath`.
 */
export { ponerAQuienMira } from "./auth-de-finanzas";
export { createInternalNoteAction } from "@/actions/internal-notes-actions";
export {
    accesosPorMencionAction,
    quitarAccesoPorMencionAction,
    accesoALaConversacionAction,
} from "@/actions/acceso-por-mencion-actions";
export { resolveSession, transferSession } from "@/actions/advisor-assign-actions";
export {
    addSessionParticipantAction,
    getSessionParticipantsAction,
} from "@/actions/collab-actions";
export { db } from "@/lib/db";
