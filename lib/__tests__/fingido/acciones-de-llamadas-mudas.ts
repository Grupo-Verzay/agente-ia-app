/** Lo demás que la pantalla de Llamadas le pide al servidor, mudo. */
export const getMissedCallReplyConfig = async () => ({ enabled: false, text: "" });
export const saveMissedCallReplyConfig = async () => ({ success: true as const });
export const startBotCallAction = async () => ({ success: true as const });
export const getSessionLatestSummarySnapshot = async () => null;
export const createManualSynthesis = async () => ({ success: true as const });
export const updateFollowUpSummarySnapshot = async () => ({ success: true as const });
