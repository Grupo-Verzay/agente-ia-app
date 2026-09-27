/**
 * La entrada que se empaqueta para el banco del COBRO de IA. Lo único fingido
 * es quién ha iniciado sesión y los clientes de IA (`createAiClient`, `openai`,
 * `@google/genai`; el `fetch` a OpenAI lo pone el propio banco), que apuntan
 * sus llamadas. El saldo, el descuento, la puerta de la cuenta y los NUEVE usos
 * de IA son los de producción.
 */
export { ponerAQuienMira } from "./auth-de-documentos";
export { llamadasALaIa, ponerTokensQueDice } from "./cliente-de-ia-de-mentira";
export {
    analizarElSentimientoAlAbrirChats,
    olvidarLoRecordado,
} from "@/lib/sentimiento-runner.server";
export { losPendientes } from "@/lib/sentimiento-db";
export { generateSuggestedReplyAction } from "@/actions/ai-suggested-reply-action";
export { pedirSugerenciaALaIa } from "@/lib/sugerencia-de-correo.server";
export {
    losTokensDelUso,
    losTokensDelProveedor,
    puedeUsarLaIa,
    elAvisoSinCreditos,
    TOKENS_DE_UNA_IMAGEN,
} from "@/lib/cobro-de-ia";
// Los usos que antes no cobraban.
export { sendChatAction } from "@/actions/ai-chat-actions";
export { sendAgentPromptChatAction } from "@/actions/ai-prompt-chat-actions";
export { analyzeInstructionAction } from "@/actions/ai-inject-section-action";
export { generateConversationIntelligence } from "@/actions/conversation-intelligence-actions";
export { scoreLeadBySessionId, scoreAllLeadsByUserId } from "@/actions/lead-score-action";
export { generateNarrative } from "@/lib/weekly-report-runner.server";
export { buildDynamicSalesPlaybook, recordConfirmedSalesOutcome } from "@/lib/sales-learning";
export { generateAdImage, generarCopyDelAnuncio } from "@/actions/ai-image-actions";
export { simulateChatMessage } from "@/actions/simulate-chat-actions";
export { generateFlowSections } from "@/actions/generate-agent-flow";
export { db } from "@/lib/db";
