/**
 * La entrada que se empaqueta para el banco de «la grabación de una llamada
 * con IA»: que al colgar queden la Transcripción y el Resumen IA en la llamada
 * correcta, y que los créditos se le descuenten a la CUENTA.
 *
 * Existe por la misma razón que la de Llamadas y la de la línea: lo que se
 * finge se inyecta con un alias de esbuild, así que queda **dentro** del
 * paquete. Importándolo aparte desde el banco se estaría moviendo otra copia
 * —otro módulo, otra variable— y ni `ponerAQuienMira` ni `ponerLoQueDiceLaIa`
 * tendrían efecto sobre el código que corre.
 *
 * Lo que sale por aquí son **los dos caminos de verdad**: el botón «Llamar con
 * IA» (`startBotCallAction`) y la ruta que pide el backend cuando la llamada
 * la lanzó un flujo. Probar solo `processCallRecordingForUser` sería probar el
 * único trozo que nunca estuvo roto.
 */
export { ponerAQuienMira } from "./auth-de-llamadas";
export { ponerLoQueDiceLaIa, loQueSeLePidioALaIa, olvidarLoPedido } from "./ia-de-mentira";

export { startBotCallAction } from "@/actions/voicebot-actions";
export { logOutgoingCallAction } from "@/actions/astracalls-actions";
export { POST as pedirLaTranscripcion } from "@/app/api/calls/process-bot-recording/route";

export {
    processCallRecordingForUser,
    esperarYProcesarLaGrabacion,
    ESPERA_ENTRE_INTENTOS_MS,
    INTENTOS_DE_GRABACION,
} from "@/lib/grabacion-de-llamada.server";

export {
    queHacerConLaGrabacion,
    porQueNoSeTranscribio,
    TOPE_DE_BYTES_DE_AUDIO,
} from "@/lib/transcripcion-de-la-llamada";

export { costoDeLaNota, TOKENS_POR_CREDITO } from "@/lib/transcripcion-de-voz";
export { descontarLaTranscripcion, losCreditosQueQuedan } from "@/lib/creditos-de-transcripcion";

export { db } from "@/lib/db";
