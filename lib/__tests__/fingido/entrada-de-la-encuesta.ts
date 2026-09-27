/**
 * La entrada que se empaqueta para el banco de la ENCUESTA DE SATISFACCIÓN.
 *
 * Todo lo que sale por aquí es de PRODUCCIÓN: `resolveSession` —la única
 * puerta de resolver, donde se engancha la encuesta—, las acciones del
 * interruptor, del NPS del CRM y de la ficha, y el envío. Se finge SOLO lo que
 * habla con fuera o pide una petición de Next: `currentUser()`, el resumen de
 * la conversación (OpenAI) y el auto-sync de Sheets, y `revalidatePath`. La red
 * a Evolution se finge en el propio banco, con `globalThis.fetch`.
 */
export { ponerAQuienMira } from "./auth-de-finanzas";
export { resolveSession } from "@/actions/advisor-assign-actions";
export {
    getAjustesDeLaEncuesta,
    guardarEncuestaActiva,
    getNpsDelCrm,
    getEncuestasDelContactoAction,
} from "@/actions/encuesta-de-satisfaccion-actions";
export { mandarLaEncuestaDeSatisfaccion } from "@/lib/encuesta-de-satisfaccion.server";
export {
    recogerLasRespuestas,
    guardarLosAjustesDeLaEncuesta,
} from "@/lib/encuesta-de-satisfaccion-db";
export { persistChatMessage } from "@/lib/chat-persistence";
export { db } from "@/lib/db";
