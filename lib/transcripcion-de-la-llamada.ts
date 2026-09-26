/**
 * Qué hacer con la grabación de una llamada antes de transcribirla.
 *
 * Puro a propósito, como `lib/transcripcion-de-voz.ts`: de aquí tiran la
 * maquinaria del servidor y el banco, y así la decisión se prueba sin levantar
 * nada.
 *
 * **La tarifa NO se vuelve a escribir aquí.** Es la misma de las notas de voz
 * —`costoDeLaNota`, seis créditos por minuto prorrateado— porque es el mismo
 * Whisper sobre el mismo audio. Con una segunda cuenta en este fichero, el día
 * que cambie el precio una de las dos cosas cobraría otra, y eso no se ve: se
 * nota meses después en la factura.
 */

import {
    costoDeLaNota,
    porQueNoSeTranscribio as porQueNoSeTranscribioLaLlamada,
    sePuedeReintentar,
    type CostoDeLaNota,
    type NoSeTranscribio,
} from "@/lib/transcripcion-de-voz";
import { cuantosTrozos } from "@/lib/wav-en-trozos";

/**
 * Lo más grande que OpenAI acepta en **una** transcripción: **25 MB**.
 *
 * Y aquí no es un límite de gasto como el de las notas de voz: es el techo
 * duro de la API. El WAV que graba el servidor de llamadas va a 16 kHz, dos
 * canales y 16 bits —64.000 bytes por segundo—, así que **una llamada de más
 * de 6 minutos y 49 segundos ya se pasa**. Eso ya estaba pasando: la subida
 * devolvía un 413, el `catch` de `transcribe` se lo tragaba y la llamada se
 * quedaba sin texto **sin decir por qué**.
 *
 * El tope va sobre BYTES y no sobre minutos, que es la misma regla que ya
 * sigue la grabación de una reunión: los bytes son el dato que va a viajar y
 * los minutos son una estimación.
 *
 * **Y ya no es el final del camino: es el tamaño de un TROZO.** Una llamada
 * con IA de varios minutos pasa de los 25 MB sin esfuerzo, así que rendirse
 * ahí era rendirse en el caso normal. El audio es PCM, así que se corta y se
 * manda por partes (`lib/wav-en-trozos.ts`); el precio no cambia, porque se
 * cobra por segundos y los segundos son los mismos.
 */
export const TOPE_DE_BYTES_DE_AUDIO = 25 * 1024 * 1024;

/**
 * Cuántos trozos como mucho. **Doce**, o sea más de hora y cuarto de llamada.
 *
 * El tope existe para que un audio absurdo —una grabación que se quedó
 * abierta, un fichero que no es lo que dice ser— no se convierta en cien
 * peticiones a OpenAI cobradas de la bolsa de alguien. Por encima de esto sí
 * se abandona, y se dice con esas palabras.
 */
export const TOPE_DE_TROZOS = 12;

export type QueHacerConLaGrabacion =
    | { hacer: "transcribir"; costo: CostoDeLaNota; trozos: number }
    | { hacer: "demasiado_grande"; bytes: number }
    | { hacer: "sin_creditos"; costo: CostoDeLaNota; disponibles: number };

/**
 * Decide si esta grabación se transcribe, en cuántos trozos y cuánto cuesta.
 *
 * **El orden de las dos preguntas no es intercambiable.** Primero el tamaño:
 * un audio que la API va a rechazar no se cobra ni se intenta, y decir «sin
 * créditos» sobre algo que tampoco se habría transcrito con ellos manda a
 * recargar para nada. Después los créditos.
 *
 * `null` en `creditosDisponibles` es **ilimitado** —la cuenta paga su propia
 * IA— y no es cero: confundirlos dejaría a esas cuentas sin transcribir nada,
 * que es el fallo que ya costó una vuelta en el voicebot.
 */
export function queHacerConLaGrabacion(input: {
    /** Duración del audio, en segundos. Decide el precio. */
    segundos: number;
    /** Lo que pesa el audio ya descargado. */
    bytes: number;
    /** Lo que le queda a la cuenta que paga, o `null` si son ilimitados. */
    creditosDisponibles: number | null;
}): QueHacerConLaGrabacion {
    const trozos = cuantosTrozos(input.bytes, TOPE_DE_BYTES_DE_AUDIO);
    if (trozos > TOPE_DE_TROZOS) {
        return { hacer: "demasiado_grande", bytes: input.bytes };
    }

    const costo = costoDeLaNota(input.segundos);
    if (input.creditosDisponibles === null) return { hacer: "transcribir", costo, trozos };
    if (input.creditosDisponibles < costo.creditos) {
        return { hacer: "sin_creditos", costo, disponibles: input.creditosDisponibles };
    }
    return { hacer: "transcribir", costo, trozos };
}

/**
 * El motivo, con las palabras que se le enseñan a una persona.
 *
 * Los tres caminos que abandonan una transcripción devolvían `success: false`
 * con un texto genérico —o con ninguno— hacia un `void`, así que desde fuera
 * la llamada se quedaba sin Resumen IA y sin nada que mirar. Cada uno dice lo
 * suyo, y el de los créditos **con los números delante**: «no se pudo» a secas
 * manda a buscar un fallo que no existe.
 */
export function porQueNoSeTranscribio(que: QueHacerConLaGrabacion): string | null {
    if (que.hacer === "transcribir") return null;
    if (que.hacer === "demasiado_grande") {
        const mb = Math.round((que.bytes / (1024 * 1024)) * 10) / 10;
        const minutos = Math.floor((TOPE_DE_TROZOS * TOPE_DE_BYTES_DE_AUDIO) / 64_000 / 60);
        return `La grabación pesa ${mb} MB y no se puede transcribir: el máximo son unos ${minutos} minutos de llamada.`;
    }
    return `Sin créditos suficientes para transcribir: cuesta ${que.costo.creditos} y quedan ${que.disponibles}.`;
}

/**
 * El motivo por el que una llamada se quedó sin transcribir, **con el mismo
 * vocabulario que una nota de voz**.
 *
 * No se escribe una segunda lista de motivos aquí, y no es por ahorrar: es el
 * mismo Whisper sobre el mismo audio, y los cinco finales posibles ya están
 * nombrados en `lib/transcripcion-de-voz.ts` —con su frase y con su regla de
 * reintento—. Con dos vocabularios paralelos, el día que se afine uno el otro
 * se queda atrás y la misma avería se le cuenta al cliente de dos maneras
 * distintas según dónde la mire. Es la misma decisión que la tarifa.
 *
 * Los tres valores que ese tipo tiene de más (`sin_linea`, `no_es_nota`,
 * `sin_audio`) no los produce este camino: aquí la fila y su par de ids ya se
 * comprobaron antes de llegar al audio.
 */
export type MotivoDeLaLlamada = Extract<
    NoSeTranscribio,
    "muy_larga" | "sin_creditos" | "sin_ia" | "no_bajo" | "no_transcribio"
>;

/**
 * Traduce la decisión de `queHacerConLaGrabacion` al motivo que se guarda.
 *
 * Devuelve `null` cuando sí hay que transcribir, que es lo que deja el
 * `if (motivo)` de quien llama leyéndose como lo que es.
 */
export function elMotivoDeLaGrabacion(que: QueHacerConLaGrabacion): MotivoDeLaLlamada | null {
    if (que.hacer === "transcribir") return null;
    return que.hacer === "demasiado_grande" ? "muy_larga" : "sin_creditos";
}

/**
 * Lo que se guarda en la fila cuando una vuelta abandona, y lo que se lee al
 * pintar la tarjeta.
 *
 * **Va en `raw.call`, no en una columna nueva**: `chat_messages` la tocan la
 * App, el webhook del backend y el chat-store, y añadirle columnas desde aquí
 * es lo que reventó el #360. Es la misma forma con la que la nota de voz de un
 * chat guarda el suyo.
 */
export type MarcaDeLaLlamada = {
    motivo: MotivoDeLaLlamada;
    /** Para el aviso de los créditos, que lleva los números delante. */
    hacenFalta?: number;
    quedan?: number;
};

/**
 * La marca que trae la fila, saneada.
 *
 * Lo que no se entienda cuenta como **«no hay marca»**: se ve de menos, nunca
 * de más. Equivocarse hacia «esta llamada falló» pintaría un error sobre una
 * llamada perfectamente normal, que es peor que no decir nada.
 */
export function laMarcaDeLaLlamada(valor: unknown): MarcaDeLaLlamada | null {
    if (!valor || typeof valor !== "object" || Array.isArray(valor)) return null;
    const crudo = valor as Record<string, unknown>;
    const motivo = crudo.motivo;
    const vale =
        motivo === "muy_larga" ||
        motivo === "sin_creditos" ||
        motivo === "sin_ia" ||
        motivo === "no_bajo" ||
        motivo === "no_transcribio";
    if (!vale) return null;
    const numero = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : undefined);
    return {
        motivo: motivo as MotivoDeLaLlamada,
        hacenFalta: numero(crudo.hacenFalta),
        quedan: numero(crudo.quedan),
    };
}

/**
 * Qué se enseña en el bloque de Transcripción / Resumen de una llamada.
 *
 * Pura para que el banco la ejerza sin navegador, que es donde vivía el fallo:
 * la tarjeta deducía el estado de `hasRecording && !transcript` y de ahí solo
 * sale **«Procesando…»**, dijera lo que dijera la realidad. Una llamada que
 * abandonó hace media hora y una que se está transcribiendo ahora mismo se
 * veían exactamente igual, y la primera no volvía a cambiar nunca.
 *
 * Los cuatro estados son los cuatro que de verdad existen, y cada uno lleva a
 * una acción distinta: esperar, recargar, reintentar, o nada.
 */
export type LoQueSeEnsena =
    | { estado: "listo" }
    | { estado: "cargando" }
    | { estado: "procesando" }
    | { estado: "fallo"; texto: string; sePuedeReintentar: boolean }
    | { estado: "nada" };

export function loQueSeEnsenaDeLaLlamada(input: {
    transcript: string | null;
    hasRecording: boolean;
    motivo: MotivoDeLaLlamada | null;
    hacenFalta?: number | null;
    quedan?: number | null;
    cargando: boolean;
}): LoQueSeEnsena {
    if (input.transcript) return { estado: "listo" };
    // **El motivo manda sobre «cargando».** Al revés, una llamada que ya se
    // sabe que falló enseñaría «Cargando…» en cada apertura antes de decir la
    // verdad, y el parpadeo se lee como que todavía puede salir.
    if (input.motivo) {
        return {
            estado: "fallo",
            texto: porQueNoSeTranscribioLaLlamada(input.motivo, {
                hacenFalta: input.hacenFalta ?? undefined,
                quedan: input.quedan ?? undefined,
            }),
            sePuedeReintentar: sePuedeReintentar(input.motivo),
        };
    }
    if (input.cargando) return { estado: "cargando" };
    // Sin marca y con grabación: de verdad está en camino. Es el único caso en
    // que «Procesando…» dice la verdad.
    if (input.hasRecording) return { estado: "procesando" };
    return { estado: "nada" };
}

/**
 * Si tiene sentido **seguir sondeando ahora mismo**, dentro de la misma media
 * hora de espera.
 *
 * No es la misma pregunta que `sePuedeReintentar`, y confundirlas cuesta por
 * los dos lados:
 *
 * - **«¿Se puede volver a pulsar?»** incluye `sin_creditos`: se recarga y se
 *   reintenta, y por eso el botón de la tarjeta y el barrido de abajo —que
 *   vuelve horas después— sí lo ofrecen.
 * - **«¿Sigo esperando?»** no: nadie recarga créditos en los treinta minutos
 *   siguientes a una llamada, y **cada vuelta se baja el WAV entero**. Sesenta
 *   descargas de un audio para volver a abandonar en el mismo sitio.
 *
 * Lo que sí es de este momento —que el audio todavía no esté cerrado, que
 * OpenAI no contestara— se sigue reintentando: es justo para lo que está la
 * ventana.
 */
export function valeLaPenaSeguirEsperando(motivo: MotivoDeLaLlamada): boolean {
    return motivo === "no_bajo" || motivo === "no_transcribio";
}
