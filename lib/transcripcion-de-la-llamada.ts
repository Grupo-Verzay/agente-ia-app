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

import { costoDeLaNota, type CostoDeLaNota } from "@/lib/transcripcion-de-voz";
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
