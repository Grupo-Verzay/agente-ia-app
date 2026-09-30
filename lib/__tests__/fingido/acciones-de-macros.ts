/**
 * Las acciones que corre una macro, de mentira, para el banco de Mis macros.
 *
 * Lo que se prueba no es que Waha, Meta o Evolution entreguen el mensaje —eso
 * lo prueban sus propios bancos—: es **por cuál de los tres sale** cada acción
 * y **qué hace la macro con lo que le contestan**. Así que las ocho acciones de
 * las que tira `executeMacroAction` se sustituyen por esta, que apunta cada
 * llamada (`llamadas`) y contesta lo que el caso le pida (`contestar`).
 *
 * Sirve igual para la macro de hoy y para la de ANTES: las dos importan de los
 * mismos ficheros, y a la de antes le faltan solo las de Waha.
 */
export type Llamada = { fn: string; args: unknown[] };
export const llamadas: Llamada[] = [];

type Respuesta = { success: boolean; message?: string };
const respuestas = new Map<string, Respuesta>();

/** Lo que contestará `fn` hasta que se vuelva a limpiar. Por defecto, `success: true`. */
export function contestar(fn: string, r: Respuesta) {
    respuestas.set(fn, r);
}

export function limpiar() {
    llamadas.length = 0;
    respuestas.clear();
}

function apuntar(fn: string) {
    return async (...args: unknown[]): Promise<Respuesta> => {
        llamadas.push({ fn, args });
        return respuestas.get(fn) ?? { success: true, message: "ok" };
    };
}

// Las tres de Evolution (chat-manual-actions)
export const sendManualChatPayloadAction = apuntar("sendManualChatPayloadAction");
export const sendManualQuickReplyAction = apuntar("sendManualQuickReplyAction");
export const sendManualWorkflowAction = apuntar("sendManualWorkflowAction");
// Las de los canales (channel-chat-actions)
export const sendChannelTextAction = apuntar("sendChannelTextAction");
export const sendChannelQuickReplyAction = apuntar("sendChannelQuickReplyAction");
export const sendChannelWorkflowAction = apuntar("sendChannelWorkflowAction");
export const sendMetaTemplate = apuntar("sendMetaTemplate");
export async function listMetaTemplates() {
    return { success: true, data: [] };
}
export type MetaTemplateOption = { name: string; language: string; body?: string };
// Las de WhatsApp Mensajería (waha-chat-actions)
export const sendWahaTextAction = apuntar("sendWahaTextAction");
export const sendWahaQuickReplyAction = apuntar("sendWahaQuickReplyAction");
export const sendWahaWorkflowAction = apuntar("sendWahaWorkflowAction");
// Las de la conversación
export const assignTagToSessionAction = apuntar("assignTagToSessionAction");
export const removeTagFromSessionAction = apuntar("removeTagFromSessionAction");
export const updateSessionLeadStatus = apuntar("updateSessionLeadStatus");
export const toggleAgentDisabled = apuntar("toggleAgentDisabled");
export const assignSessionToAdvisor = apuntar("assignSessionToAdvisor");
export const resolveSession = apuntar("resolveSession");
export const createInternalNoteAction = apuntar("createInternalNoteAction");
export const createTaskAction = apuntar("createTaskAction");
