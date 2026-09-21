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

/**
 * Lo más grande que OpenAI acepta en una transcripción: **25 MB**.
 *
 * Y aquí no es un límite de gasto como el de las notas de voz: es el techo
 * duro de la API. El WAV que graba el servidor de llamadas va a 16 kHz, dos
 * canales y 16 bits —64.000 bytes por segundo—, así que **una llamada de más
 * de unos 6 minutos y medio ya se pasa**. Eso ya estaba pasando: la subida
 * devolvía un 413, el `catch` de `transcribe` se lo tragaba y la llamada se
 * quedaba sin texto **sin decir por qué**.
 *
 * El tope va sobre BYTES y no sobre minutos, que es la misma regla que ya
 * sigue la grabación de una reunión: los bytes son el dato que va a viajar y
 * los minutos son una estimación.
 */
export const TOPE_DE_BYTES_DE_AUDIO = 25 * 1024 * 1024;

export type QueHacerConLaGrabacion =
    | { hacer: "transcribir"; costo: CostoDeLaNota }
    | { hacer: "demasiado_grande"; bytes: number }
    | { hacer: "sin_creditos"; costo: CostoDeLaNota; disponibles: number };

/**
 * Decide si esta grabación se transcribe, y cuánto cuesta.
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
    if (input.bytes > TOPE_DE_BYTES_DE_AUDIO) {
        return { hacer: "demasiado_grande", bytes: input.bytes };
    }

    const costo = costoDeLaNota(input.segundos);
    if (input.creditosDisponibles === null) return { hacer: "transcribir", costo };
    if (input.creditosDisponibles < costo.creditos) {
        return { hacer: "sin_creditos", costo, disponibles: input.creditosDisponibles };
    }
    return { hacer: "transcribir", costo };
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
        return `La grabación pesa ${mb} MB y el máximo para transcribir son 25 MB (unos 6 minutos de llamada).`;
    }
    return `Sin créditos suficientes para transcribir: cuesta ${que.costo.creditos} y quedan ${que.disponibles}.`;
}
