/**
 * Las tres acciones de servidor que llama `LeadContextSheet`, fingidas para el
 * banco de la cabecera del chat. Anotan cada llamada en `window.__llamadas`
 * para que el banco afirme QUÉ se pidió, y leen el estado de
 * `window.__sintesis` (con seguimiento o sin él).
 */
const w = globalThis as any;
w.__llamadas = w.__llamadas ?? [];

export async function getSessionLatestSummarySnapshot(sessionId: number) {
    w.__llamadas.push(["leer", sessionId]);
    const s = w.__sintesis;
    if (!s) return { success: false, message: "sin seguimiento" };
    return { success: true, data: { id: s.id, summarySnapshot: s.texto } };
}

export async function updateFollowUpSummarySnapshot(id: string, texto: string) {
    w.__llamadas.push(["actualizar", id, texto]);
    return { success: true };
}

export async function createManualSynthesis(sessionId: number, texto: string) {
    w.__llamadas.push(["crear", sessionId, texto]);
    return { success: true, data: { id: "nuevo" } };
}

export async function scoreLeadBySessionId() {
    return { success: false, message: "no se puntúa en el banco" };
}

export async function getSalesPlaybookAction() {
    return { success: true, data: null };
}

export async function saveSalesPlaybookFeedbackAction() {
    return { success: true };
}
