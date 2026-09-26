/**
 * La puerta del banco del SALDO.
 *
 * Todo lo que se prueba aquí es **puro**: no toca base, ni red, ni sesión. El
 * paquete existe solo para que los `@/lib/...` resuelvan en un `node --test`.
 */
export {
    elSaldoDeLaFila,
    alcanzaPara,
    seCobra,
    loQueQueda,
    comoSeLeeElSaldo,
    TOKENS_POR_CREDITO,
} from "@/lib/saldo-de-la-cuenta";

export {
    queHacerConLaGrabacion,
    // Se re-exporta con otro nombre porque su hermana de las notas de voz se
    // llama igual y las dos hacen falta en el mismo banco: una decide sobre la
    // grabación de una llamada y la otra sobre el mensaje de un chat.
    porQueNoSeTranscribio as porQueNoSeTranscribioLaGrabacion,
    elMotivoDeLaGrabacion,
    laMarcaDeLaLlamada,
    loQueSeEnsenaDeLaLlamada,
    valeLaPenaSeguirEsperando,
    TOPE_DE_TROZOS,
    TOPE_DE_BYTES_DE_AUDIO,
} from "@/lib/transcripcion-de-la-llamada";

export {
    queHacerConLaNota,
    costoDeLaNota,
    porQueNoSeTranscribio,
    sePuedeReintentar,
} from "@/lib/transcripcion-de-voz";

export { trozosDeWav, cuantosTrozosDeVerdad, sePuedeCortar } from "@/lib/wav-en-trozos";
