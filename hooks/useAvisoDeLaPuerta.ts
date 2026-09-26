"use client";

import { useEffect, useRef } from "react";

import {
    TONO_DE_LA_PUERTA,
    losQueEsperanSinAtender,
    tocaSonarEnLaPuerta,
} from "@/lib/aviso-de-la-puerta";

/**
 * El aviso sonoro de que alguien llama a la puerta de la reunión.
 *
 * Esto **suena**; quien **decide** es `lib/aviso-de-la-puerta.ts`, que es puro.
 * La separación no es de estilo: a qué se le hace caso y cada cuánto es lo
 * único de aquí que se puede equivocar de forma que nadie vea —sonar de más se
 * arregla silenciando la pestaña, y entonces deja de sonar todo—, y es lo que
 * se prueba sin navegador.
 *
 * # Ni un sondeo nuevo, y ningún reloj cuando no hay nadie
 *
 * La lista de quién espera **ya llega** en la vuelta del reloj de la sala, que
 * está pagada. Lo único propio de aquí es un latido de un segundo que pregunta
 * «¿toca?», y **solo existe mientras hay alguien en la puerta sin atender**:
 * el 99 % de una reunión no hay nadie, y entonces aquí no corre nada. Es el
 * mismo reparto que el reloj del hilo del equipo, que solo corre con el panel
 * abierto.
 *
 * El latido va a un segundo y el ritmo de verdad lo pone
 * `CADA_CUANTO_SUENA_LA_PUERTA_MS` dentro de la decisión pura. Al revés —un
 * `setInterval` del intervalo entero— cada vez que cambiara la lista se
 * remontaría el reloj y el ritmo real dependería de cuándo llega la gente.
 *
 * # Un solo `AudioContext`, y para siempre
 *
 * Cada `AudioContext` es un hilo de audio del sistema: abriendo uno por pitido,
 * una reunión con tráfico en la puerta los va acumulando hasta que el navegador
 * deja de dar más — y entonces **deja de sonar todo**, la llamada de WhatsApp
 * incluida. Uno perezoso a nivel de módulo, reutilizado siempre, no puede
 * acumular; es lo que ya hace el sonido del chat del equipo.
 */

let contexto: AudioContext | null = null;

/** Cada cuánto se PREGUNTA. El ritmo lo decide la función pura. */
const LATIDO_MS = 1_000;

function sonarLaPuerta() {
    try {
        const Ctor =
            window.AudioContext ??
            (window as unknown as { webkitAudioContext?: typeof AudioContext })
                .webkitAudioContext;
        if (!Ctor) return;
        contexto ??= new Ctor();
        const ctx = contexto;
        // A una reunión se entra pulsando, así que aquí siempre hubo un gesto
        // antes: el contexto se puede reanudar y el navegador no lo niega.
        if (ctx.state === "suspended") void ctx.resume();

        const { desde, hasta, duracion, volumen, golpes, entreGolpes } = TONO_DE_LA_PUERTA;
        const t0 = ctx.currentTime;

        // Dos golpes, como se llama a una puerta. Cada uno con su oscilador:
        // uno solo con la frecuencia reprogramada arrastra la cola del primero
        // y suena como un gorjeo, no como dos golpes.
        for (let i = 0; i < golpes; i += 1) {
            const t = t0 + i * entreGolpes;

            const gain = ctx.createGain();
            gain.connect(ctx.destination);

            const osc = ctx.createOscillator();
            osc.type = "sine";
            osc.connect(gain);

            // BAJA. Los otros dos tonos del producto suben, y eso es lo único
            // que de verdad los distingue estando distraído.
            osc.frequency.setValueAtTime(desde, t);
            osc.frequency.exponentialRampToValueAtTime(hasta, t + duracion);

            // Entra y sale con rampa: un corte en seco se oye como un clic.
            gain.gain.setValueAtTime(0.0001, t);
            gain.gain.exponentialRampToValueAtTime(volumen, t + 0.015);
            gain.gain.exponentialRampToValueAtTime(0.0001, t + duracion);

            osc.start(t);
            osc.stop(t + duracion + 0.02);
        }
    } catch (error) {
        // Sin sonido la franja de arriba sigue estando: es una ayuda, no la
        // función. Pero se dice, que si no «a mí no me suena» no se puede
        // explicar.
        console.warn("[sala] no se pudo sonar el aviso de la puerta", error);
    }
}

export function useAvisoDeLaPuerta(input: {
    /** Los que esperan, tal como los trae el reloj de la sala. */
    esperando: ReadonlyArray<{ id: string }>;
    /** Si puedo dejar entrar. A quien no abre, esto no le suena. */
    abroLaPuerta: boolean;
    /** Si quien modera calló el aviso de esta reunión. */
    silenciado: boolean;
    /** Sobre quiénes ya se decidió y todavía no ha llegado la vuelta. */
    yaDecididos: ReadonlyArray<string>;
}): void {
    const { abroLaPuerta, silenciado } = input;

    const cuantosEsperan = losQueEsperanSinAtender({
        esperando: input.esperando,
        yaDecididos: input.yaDecididos,
    }).length;

    /**
     * Cuándo sonó la última vez.
     *
     * En un ref y no en el estado: cambiarlo no tiene que repintar nada, y
     * sobre todo **manda por encima del remonte del efecto**. Sin eso, cada
     * persona que llega a la puerta reiniciaría el intervalo y dos pitidos
     * podrían caer con un segundo de diferencia.
     */
    const ultimoSonido = useRef<number | null>(null);

    useEffect(() => {
        // Sin nadie a quien abrir no hay reloj que montar. Y se olvida cuándo
        // sonó, para que la siguiente persona que llame suene **al momento** en
        // vez de esperarse el intervalo de una tanda que ya terminó.
        if (cuantosEsperan <= 0 || !abroLaPuerta || silenciado) {
            ultimoSonido.current = null;
            return;
        }

        const intentar = () => {
            if (
                !tocaSonarEnLaPuerta({
                    cuantosEsperan,
                    abroLaPuerta,
                    silenciado,
                    ultimoSonido: ultimoSonido.current,
                })
            ) {
                return;
            }
            ultimoSonido.current = Date.now();
            sonarLaPuerta();
        };

        intentar();
        const reloj = setInterval(intentar, LATIDO_MS);
        return () => clearInterval(reloj);
        // Nota de lo que esto NO hace, para que no se lea como un olvido: si
        // entra uno y llega otro en la misma vuelta, el número de los que
        // esperan no cambia y el aviso **no se adelanta** — el recién llegado
        // espera al siguiente intervalo. Es a propósito: con la puerta ocupada
        // el aviso ya está sonando, y adelantarlo por cada llegada convertiría
        // una tanda de tres en tres pitidos pegados.
    }, [cuantosEsperan, abroLaPuerta, silenciado]);
}
