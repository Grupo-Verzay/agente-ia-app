"use client";

import { useEffect, useRef, useState } from "react";

import {
    elNivelDeLasMuestras,
    elQueHabla,
    type NivelDeVoz,
    type QuienHabla,
} from "@/lib/voz-activa";

/**
 * Quién habla ahora mismo, para ponerle en grande.
 *
 * Esto **mide**; quien **decide** es `lib/voz-activa.ts`, que es puro. La
 * separación no es de estilo: la histéresis —el rato mínimo en grande, la
 * ventaja para desbancar— es lo único de aquí que se puede equivocar de forma
 * visible, y es justo lo que no se puede probar con un navegador de mentira.
 *
 * # Un `AnalyserNode` por persona, sobre el stream que ya llega
 *
 * No hace falta nada nuevo por la red: el audio de cada uno **ya está llegando**
 * por su conexión. Se le engancha un analizador y se lee el nivel; es la misma
 * pista que ya suena, leída por otro sitio.
 *
 * Y el propio se mide también, sobre el micro local. Sin él, quien habla nunca
 * se vería a sí mismo en grande y la vista de orador se sentiría rota justo
 * para quien la está probando solo.
 *
 * # Por qué un solo `AudioContext` y por qué se cierra
 *
 * Cada `AudioContext` es un hilo de audio del sistema. Abriendo uno por
 * persona, una reunión de cuatro deja cuatro corriendo, y al cambiar de reunión
 * sin cerrarlos se van acumulando hasta que el navegador deja de dar más —y
 * entonces **deja de sonar todo**, no solo lo nuevo. Uno para toda la sala, y
 * se cierra al desmontar.
 *
 * # El ritmo: diez veces por segundo, y no sesenta
 *
 * Medir es barato pero repintar no: con `requestAnimationFrame` esto propondría
 * un cambio sesenta veces por segundo sobre una pantalla con cuatro `<video>`
 * dentro. A diez por segundo la conmutación se sigue sintiendo inmediata —la
 * histéresis es de un segundo y medio— y el coste es una lectura de un buffer
 * pequeño por persona.
 */
export function useVozActiva(input: {
    /** Lo que llega de cada uno: su id y su stream. El propio incluido. */
    fuentes: Array<{ id: string; stream: MediaStream | null; micEncendido: boolean }>;
    /** Mientras sea `false` no se mide nada: ni contexto de audio ni reloj. */
    activo: boolean;
}): string | null {
    const { fuentes, activo } = input;

    const [quien, setQuien] = useState<string | null>(null);

    /**
     * Lo que el reloj lee, **por referencia**.
     *
     * El mismo motivo que en la malla: el reloj se monta una sola vez, y con
     * las fuentes en las dependencias se desmontaría y remontaría cada vez que
     * alguien tocara el micro — o sea, se perdería la medida justo en el
     * momento en que cambia.
     */
    const fuentesRef = useRef(fuentes);
    fuentesRef.current = fuentes;

    /** La decisión de la vuelta anterior, que es lo que da la histéresis. */
    const anteriorRef = useRef<QuienHabla>({ id: null, desde: 0 });

    useEffect(() => {
        if (!activo) return;
        if (typeof window === "undefined") return;

        const Contexto =
            window.AudioContext ??
            (window as unknown as { webkitAudioContext?: typeof AudioContext })
                .webkitAudioContext;
        if (!Contexto) {
            // Sin Web Audio no hay orador activo, y **eso no es un fallo**: la
            // vista de orador sigue funcionando con quien esté primero. Se dice
            // una vez y no se vuelve a intentar.
            console.info("[sala] este navegador no mide el nivel de voz");
            return;
        }

        let contexto: AudioContext;
        try {
            contexto = new Contexto();
        } catch (error) {
            console.warn("[sala] no se pudo abrir el medidor de voz", error);
            return;
        }

        /** Un analizador por stream, para no montarlo en cada vuelta. */
        const analizadores = new Map<
            string,
            { analizador: AnalyserNode; fuente: MediaStreamAudioSourceNode; buffer: Uint8Array }
        >();
        /** De qué stream es cada analizador: si cambia, se rehace. */
        const deQueStream = new Map<string, MediaStream>();

        const soltar = (id: string) => {
            const a = analizadores.get(id);
            if (a) {
                try {
                    a.fuente.disconnect();
                } catch {
                    // Ya estaba suelto.
                }
            }
            analizadores.delete(id);
            deQueStream.delete(id);
        };

        const vuelta = () => {
            const ahora = Date.now();
            const niveles: NivelDeVoz[] = [];
            const presentes: string[] = [];

            for (const f of fuentesRef.current) {
                presentes.push(f.id);
                const stream = f.stream;
                // Sin stream todavía no hay nada que medir, pero la persona SÍ
                // está: entra en `presentes` para que pueda quedarse en grande
                // mientras se conecta, y no en `niveles`.
                if (!stream || !stream.getAudioTracks().length) {
                    soltar(f.id);
                    continue;
                }

                // El stream de alguien cambia cuando su conexión se rehace —una
                // recarga, una reconexión—. Sin rehacer el analizador, se
                // seguiría midiendo una pista muerta y esa persona nunca
                // volvería a «hablar».
                if (deQueStream.get(f.id) !== stream) soltar(f.id);

                let a = analizadores.get(f.id);
                if (!a) {
                    try {
                        const fuente = contexto.createMediaStreamSource(stream);
                        const analizador = contexto.createAnalyser();
                        // Pequeño a propósito: aquí no se dibuja un espectro, se
                        // mide cuánto suena. 512 muestras a 48 kHz son ~10 ms,
                        // que es justo la ventana que se quiere.
                        analizador.fftSize = 512;
                        fuente.connect(analizador);
                        // Y NO se conecta al destino: el audio ya suena por su
                        // `<video>`. Conectándolo aquí se oiría dos veces, y el
                        // propio se oiría a sí mismo con retardo.
                        a = {
                            analizador,
                            fuente,
                            buffer: new Uint8Array(analizador.frequencyBinCount),
                        };
                        analizadores.set(f.id, a);
                        deQueStream.set(f.id, stream);
                    } catch (error) {
                        // Un stream sin audio, o ya cerrado. No es un error que
                        // nadie tenga que ver, pero tampoco se reintenta en
                        // bucle: se salta esta vuelta.
                        console.info("[sala] no se pudo medir a alguien", error);
                        continue;
                    }
                }

                a.analizador.getByteTimeDomainData(a.buffer);
                niveles.push({
                    id: f.id,
                    nivel: elNivelDeLasMuestras(a.buffer),
                    micEncendido: f.micEncendido,
                });
            }

            // Los que se fueron sueltan su analizador. Sin esto, una reunión
            // larga con gente entrando y saliendo va dejando nodos colgados.
            for (const id of Array.from(analizadores.keys())) {
                if (!presentes.includes(id)) soltar(id);
            }

            const decidido = elQueHabla({
                niveles,
                anterior: anteriorRef.current,
                ahora,
                presentes,
            });
            anteriorRef.current = decidido;
            // Solo se repinta si CAMBIA. Sin esta condición serían diez
            // repintados por segundo de una pantalla con cuatro `<video>`
            // dentro, para decir lo mismo.
            setQuien((antes) => (antes === decidido.id ? antes : decidido.id));
        };

        const reloj = window.setInterval(vuelta, 100);

        return () => {
            window.clearInterval(reloj);
            for (const id of Array.from(analizadores.keys())) soltar(id);
            // Cerrar el contexto es lo que libera el hilo de audio del sistema.
            // Sin esto, entrar y salir de varias reuniones agota los que el
            // navegador da y **deja de sonar todo**, no solo lo nuevo.
            void contexto.close().catch(() => {
                // Cerrar uno ya cerrado no es un error que nadie tenga que ver.
            });
        };
    }, [activo]);

    return quien;
}
