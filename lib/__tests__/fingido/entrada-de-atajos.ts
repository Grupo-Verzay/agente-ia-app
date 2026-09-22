/**
 * Entrada del banco de los atajos por línea (respuestas rápidas y workflows).
 *
 * Solo exporta lo que existe también en el commit de ANTES, porque el mismo
 * fichero se empaqueta contra los dos árboles (ver
 * `scripts/banco-atajos-de-la-linea.sh`). `currentUser()` es el DE VERDAD:
 * lo único que se finge es la sesión y las cookies de la petición.
 */
export { ponerLaSesion } from "./sesion-y-cookies";
export { loadChatBootstrapData } from "@/actions/chat-bootstrap-actions";
export { getWorkFlowByUserIds } from "@/actions/workflow-actions";
export { sendManualWorkflowAction } from "@/actions/chat-manual-actions";
export { sendWahaWorkflowAction, sendWahaQuickReplyAction } from "@/actions/waha-chat-actions";
export { sendChannelQuickReplyAction } from "@/actions/channel-chat-actions";
export { db } from "@/lib/db";
