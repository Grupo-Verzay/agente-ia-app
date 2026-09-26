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
export { POST as avisarDelFinDeLaLlamada } from "@/app/api/calls/call-ended/route";

export {
    processCallRecordingForUser,
    esperarYProcesarLaGrabacion,
    procesarElFinDeLaLlamada,
    proponerElResultado,
    ESPERA_ENTRE_INTENTOS_MS,
    INTENTOS_DE_GRABACION,
} from "@/lib/grabacion-de-llamada.server";

export {
    queHacerConLaGrabacion,
    porQueNoSeTranscribio,
    TOPE_DE_BYTES_DE_AUDIO,
    TOPE_DE_TROZOS,
    // Lo que hace que un abandono deje de ser mudo: el motivo que se guarda en
    // la fila, y lo que la tarjeta enseña con él.
    elMotivoDeLaGrabacion,
    laMarcaDeLaLlamada,
    loQueSeEnsenaDeLaLlamada,
    valeLaPenaSeguirEsperando,
} from "@/lib/transcripcion-de-la-llamada";

// La regla de si se puede volver a pulsar es la MISMA que la de una nota de
// voz: el banco la ejerce por su nombre para que no puedan separarse.
export { sePuedeReintentar, porQueNoSeTranscribio as porQueNoSalioLaNota } from "@/lib/transcripcion-de-voz";

// El botón de la tarjeta, con su puerta de verdad.
export { reintentarLaTranscripcionAction } from "@/actions/calls-recording-actions";

// El barrido de abajo: que no se baje el WAV ocho veces por un motivo firme.
export { queLeFaltaALaLlamada } from "@/lib/rescate-de-llamadas";

// El corte del WAV: lo que hace que una llamada de mas de 6 min 49 s deje de
// ser «demasiado grande» y pase a transcribirse por partes.
export { trozosDeWav, cuantosTrozos, segundosDelWav, elFormatoDelWav } from "@/lib/wav-en-trozos";

export { costoDeLaNota, TOKENS_POR_CREDITO } from "@/lib/transcripcion-de-voz";
export { conElNombreDeLaMarca, PISTA_DE_VOCABULARIO } from "@/lib/nombres-de-la-marca";
export { descontarLaTranscripcion, losCreditosQueQuedan } from "@/lib/creditos-de-transcripcion";

// El resultado: lo que propone la IA y la corrección a mano encima, con las
// acciones de verdad de CRM › Llamadas.
export { setCallDisposition, getCallDetailAction } from "@/actions/calls-crm-actions";
export { getDispositionMeta, CALL_DISPOSITIONS } from "@/lib/call-dispositions";

export { db } from "@/lib/db";
