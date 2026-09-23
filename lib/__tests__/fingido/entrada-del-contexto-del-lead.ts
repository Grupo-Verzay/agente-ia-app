/**
 * La entrada que se empaqueta para el banco del Contexto del lead.
 *
 * `currentUser()` de mentira DENTRO del paquete —importado aparte sería otra
 * copia y `ponerAQuienMira` no movería el código que corre— y, al lado, las dos
 * acciones que el panel llama al abrirse: el playbook y la puntuación.
 */
export { ponerAQuienMira } from "./auth-de-documentos";
export { getSalesPlaybookAction, saveSalesPlaybookFeedbackAction } from "@/actions/sales-playbook-actions";
export { scoreLeadBySessionId } from "@/actions/lead-score-action";
export { db } from "@/lib/db";
