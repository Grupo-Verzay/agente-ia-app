/** Lo demás que la pantalla de Llamadas le pide al servidor, mudo. */
export const getMissedCallReplyConfig = async () => ({ enabled: false, text: "" });
export const saveMissedCallReplyConfig = async () => ({ success: true as const });
export const startBotCallAction = async () => ({ success: true as const });
export const getSessionLatestSummarySnapshot = async () => null;
export const createManualSynthesis = async () => ({ success: true as const });
export const updateFollowUpSummarySnapshot = async () => ({ success: true as const });
// El detalle de una llamada ofrece reintentar la transcripción; sin esto el
// paquete del navegador arrastra el lector de grabaciones, que es del servidor.
export const reintentarLaTranscripcionAction = async () => ({ success: true as const });
export const processCallRecordingAction = async () => ({ success: true as const });
export const processMetaCallRecordingAction = async () => ({ success: true as const });
