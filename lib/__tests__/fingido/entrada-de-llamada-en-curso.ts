/**
 * La entrada del banco de «una llamada con IA a la vez por número». Lo fingido
 * (`currentUser()`, `openai`) entra por alias; `startBotCallAction` es la de
 * producción — o, en `MODO=roto`, la de antes (alias en el script).
 */
export { ponerAQuienMira } from "./auth-de-llamadas";
export { startBotCallAction } from "@/actions/voicebot-actions";
export {
    hayUnaLlamadaEnCurso,
    lasLlamadasVivas,
    laLlaveDelCandado,
    YA_HAY_UNA_LLAMADA_EN_CURSO,
} from "@/lib/llamada-en-curso";
export { ESPERA_ENTRE_INTENTOS_MS } from "@/lib/grabacion-de-llamada.server";
export { db } from "@/lib/db";
