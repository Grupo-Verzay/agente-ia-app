/**
 * La entrada que se empaqueta para el banco de **«la transcripción la paga la
 * misma cuenta que pagó la llamada»**.
 *
 * Existe aparte de `entrada-de-grabacion.ts` por una razón concreta: el
 * `MODO=roto` de aquel ejerce OTRO fallo —el registro sin `astraCallId` del
 * #877— y meterle un segundo «antes» encima dejaría un banco con dos modos
 * rotos que no se pueden pedir por separado. Aquí el «antes» es el de este
 * arreglo, pinchado a un commit, y lo aliasa el script.
 *
 * Lo que sale por aquí es el **camino de producción**: las dos funciones que
 * procesan una grabación (Astra y Meta) y la puerta de la acción. Lo único
 * fingido son `currentUser()` y el paquete `openai` —transcribir y resumir salen
 * de la red—, inyectados con un alias de esbuild para que queden DENTRO del
 * paquete: importándolos aparte desde el banco se movería otra copia y
 * `ponerAQuienMira` no tendría efecto sobre el código que corre.
 */
export { ponerAQuienMira } from "./auth-de-llamadas";
export {
    ponerLoQueDiceLaIa,
    loQueSeLePidioALaIa,
    olvidarLoPedido,
    // Con qué CLAVE se le habló a la IA: es lo único que prueba de qué cuenta
    // salió, y por tanto que el cobro y la clave miran la misma bolsa.
    lasClavesQueSeUsaron,
} from "./ia-de-mentira";

// Quien paga: la regla pura, la consulta con su desempate y el camino entero.
export { laCuentaQuePaga } from "@/lib/cuenta-que-paga-la-llamada";
export { laCuentaQuePagaLaLlamada, elDuenoDelSid } from "@/lib/cuenta-que-paga-la-llamada.server";

export {
    processCallRecordingForUser,
    processMetaCallRecordingForUser,
    ESPERA_ENTRE_INTENTOS_MS,
} from "@/lib/grabacion-de-llamada.server";

// La decisión de qué se transcribe, y la mitad que distingue «no cabe» de «no
// respondió».
export {
    queHacerConLaGrabacion,
    porQueNoSeTranscribio,
    elMotivoDeLaGrabacion,
    laMarcaDeLaLlamada,
    loQueSeEnsenaDeLaLlamada,
    TOPE_DE_BYTES_DE_AUDIO,
    TOPE_DE_TROZOS,
} from "@/lib/transcripcion-de-la-llamada";
export { sePuedeCortarElWav, trozosDeWav, elFormatoDelWav } from "@/lib/wav-en-trozos";

export { costoDeLaNota, sePuedeReintentar, porQueNoSeTranscribio as porQueNoSalioLaNota } from "@/lib/transcripcion-de-voz";
export { losCreditosQueQuedan } from "@/lib/creditos-de-transcripcion";

// El botón de la tarjeta, con su puerta de verdad.
export { reintentarLaTranscripcionAction } from "@/actions/calls-recording-actions";

export { db } from "@/lib/db";
