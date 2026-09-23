"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { CADA_CUANTO_ESCUCHA_MS } from "@/lib/llamada-de-voz";
import { comoModo, type ModoDeLlamada } from "@/lib/modo-de-la-llamada";
import { atenderLlamadasAction } from "@/actions/llamadas-actions";
import { LaLlamada } from "./LaLlamada";

/**
 * El que hace que una llamada suene **estés donde estés** en la plataforma.
 *
 * Cuelga del layout, como la ventana que interrumpe de los avisos de tarea y
 * los botones del borde: una llamada que solo sonara con el chat de equipo
 * abierto no serviría para nada.
 *
 * # Y por eso su reloj es lo que es
 *
 * Corre en **todas** las pantallas de **todo el mundo**, así que cada vuelta
 * tiene que ser una consulta corta sobre un índice — y lo es: una sola, que
 * además deja el latido de presencia de paso. Con la pestaña de fondo no
 * pregunta, como el resto de relojes de la App.
 *
 * Tres segundos es el precio de no tener un socket propio (ver
 * `lib/llamada-de-voz.ts`): quien llama puede esperar hasta eso a que suene al
 * otro lado. Lo que **no** espera es saber si la otra persona está — eso se
 * contesta al instante, con el latido, antes de empezar a sonar.
 *
 * Es un `setInterval` montado **una sola vez**, no una cadena de `setTimeout`:
 * si una vuelta no llegara a programar la siguiente, dejarían de sonar las
 * llamadas y nadie se enteraría de nada — que es la primera regla de los
 * relojes de este proyecto.
 */
export function OyenteDeLlamadas() {
    const [entrante, setEntrante] = useState<{
        id: string;
        canalId: string;
        oferta: string | null;
        deQuien: string;
        modo: ModoDeLlamada;
    } | null>(null);
    const [saliente, setSaliente] = useState<{
        canalId: string;
        modo: ModoDeLlamada;
    } | null>(null);
    /** Con quién es la llamada abierta. Lo pone quien la abre, de los dos lados. */
    const [conQuien, setConQuien] = useState("");
    /**
     * Si hay que estar timbrando ahora mismo.
     *
     * Lo dice la ventana de la llamada, que es quien sabe si ya se contestó.
     * Aquí NO se puede deducir de `entrante`: esa llamada sigue siendo la misma
     * después de contestarla, y por eso el timbre sonaba durante toda la
     * conversación.
     *
     * Arranca en `true` para que suene desde la primera vuelta, sin esperar a
     * que la ventana se monte y diga lo suyo: medio segundo de silencio al
     * principio de un timbre se nota.
     */
    const [timbrando, setTimbrando] = useState(true);

    // El sonido se monta una vez y se reutiliza: crear un `AudioContext` por
    // vuelta los va dejando abiertos hasta que el navegador se queja.
    const tonoRef = useRef<{ parar: () => void } | null>(null);
    const abiertaRef = useRef(false);
    abiertaRef.current = Boolean(entrante || saliente);

    const vuelta = useCallback(async () => {
        if (typeof document !== "undefined" && document.hidden) return;
        try {
            const res = await atenderLlamadasAction();
            if (!res.success) return;

            const { datos } = res;

            // Lo que me suena. Solo se pone si no hay ya una ventana abierta:
            // dos llamadas a la vez se atienden de una en una, y pisar la que
            // está sonando con otra es la forma de perder las dos.
            if (datos.entrante && !abiertaRef.current) {
                setTimbrando(true);
                setEntrante({
                    id: datos.entrante.id,
                    canalId: datos.entrante.canalId,
                    oferta: datos.entrante.oferta,
                    deQuien: datos.entrante.deQuienNombre,
                    modo: comoModo(datos.entrante.modo),
                });
            }

            // La mía: cuando la contestan llega la respuesta SDP, y se la paso
            // a la ventana por un evento. No por un contexto: la ventana se
            // monta y se desmonta sola y el evento llega igual.
            if (datos.mia?.respuesta) {
                window.dispatchEvent(
                    new CustomEvent("llamada:respuesta", {
                        detail: { id: datos.mia.id, respuesta: datos.mia.respuesta },
                    }),
                );
            }

            // Y el modo de la que está en curso, con la petición de video si
            // la hay. Por el mismo camino que la respuesta: un evento, porque
            // la ventana es quien sabe qué hacer con él.
            if (datos.enCurso) {
                window.dispatchEvent(
                    new CustomEvent("llamada:estado", { detail: datos.enCurso }),
                );
            }

            // Y las que acaban de terminar, para que la ventana se cierre sola
            // en la punta que no colgó.
            for (const t of datos.terminadas) {
                window.dispatchEvent(
                    new CustomEvent("llamada:terminada", { detail: { id: t.id } }),
                );
            }
        } catch (error) {
            // Mudo aquí se ve como «a mí no me suenan las llamadas».
            console.warn("[llamadas] falló una vuelta del oyente", error);
        }
    }, []);

    useEffect(() => {
        let vivo = true;
        const correr = () => {
            if (vivo) void vuelta();
        };
        correr();

        const id = window.setInterval(correr, CADA_CUANTO_ESCUCHA_MS);
        const alVolver = () => {
            if (!document.hidden) correr();
        };
        document.addEventListener("visibilitychange", alVolver);
        return () => {
            vivo = false;
            window.clearInterval(id);
            document.removeEventListener("visibilitychange", alVolver);
        };
    }, [vuelta]);

    // ── El timbre ───────────────────────────────────────────────────────────
    //
    // Se genera con WebAudio y no con un fichero: un `.mp3` habría que subirlo,
    // servirlo y esperar a que cargue justo cuando hace falta que suene ya.
    const debeTimbrar = Boolean(entrante) && timbrando;

    useEffect(() => {
        if (!debeTimbrar) {
            tonoRef.current?.parar();
            tonoRef.current = null;
            return;
        }

        let ctx: AudioContext | null = null;
        let parado = false;
        try {
            const Ctor =
                window.AudioContext ??
                (window as unknown as { webkitAudioContext?: typeof AudioContext })
                    .webkitAudioContext;
            if (!Ctor) return;
            ctx = new Ctor();
            const ganancia = ctx.createGain();
            ganancia.gain.value = 0.0001;
            ganancia.connect(ctx.destination);

            const osc = ctx.createOscillator();
            osc.type = "sine";
            osc.frequency.value = 440;
            osc.connect(ganancia);
            osc.start();

            // Dos pitidos y un silencio, como un teléfono. Con un tono continuo
            // no se distingue de una alarma.
            const ciclo = window.setInterval(() => {
                if (!ctx || parado) return;
                const t = ctx.currentTime;
                for (const inicio of [0, 0.6]) {
                    ganancia.gain.setValueAtTime(0.0001, t + inicio);
                    ganancia.gain.exponentialRampToValueAtTime(0.08, t + inicio + 0.05);
                    ganancia.gain.exponentialRampToValueAtTime(0.0001, t + inicio + 0.4);
                }
            }, 2000);

            tonoRef.current = {
                parar: () => {
                    parado = true;
                    window.clearInterval(ciclo);
                    try {
                        osc.stop();
                        void ctx?.close();
                    } catch {
                        // Ya estaba cerrado.
                    }
                },
            };
        } catch (error) {
            // Sin sonido la llamada se ve igual en pantalla: es una ayuda, no
            // la función. Pero se dice, que si no «no me suena» no se explica.
            console.warn("[llamadas] no se pudo sonar el timbre", error);
        }

        return () => {
            tonoRef.current?.parar();
            tonoRef.current = null;
        };
    }, [debeTimbrar]);

    // Salir a llamar desde la cabecera del directo.
    useEffect(() => {
        const alLlamar = (e: Event) => {
            const d = (e as CustomEvent<{
                canalId: string;
                conQuien: string;
                modo?: string;
            }>).detail;
            if (!d?.canalId || abiertaRef.current) return;
            setConQuien(d.conQuien);
            // Sin modo es voz: es lo que mandaba la cabecera de antes.
            setSaliente({ canalId: d.canalId, modo: comoModo(d.modo) });
        };
        window.addEventListener("llamada:salir", alLlamar);
        return () => window.removeEventListener("llamada:salir", alLlamar);
    }, []);

    if (entrante) {
        return (
            <LaLlamada
                llamadaId={entrante.id}
                canalId={entrante.canalId}
                conQuien={entrante.deQuien}
                entrante={{ id: entrante.id, oferta: entrante.oferta }}
                modoInicial={entrante.modo}
                onSonando={setTimbrando}
                onCerrar={() => {
                    setEntrante(null);
                    // Rearmado para la siguiente: sin esto, la llamada de
                    // después entraría muda.
                    setTimbrando(true);
                }}
            />
        );
    }
    if (saliente) {
        return (
            <LaLlamada
                llamadaId={null}
                canalId={saliente.canalId}
                conQuien={conQuien}
                entrante={null}
                modoInicial={saliente.modo}
                onCerrar={() => setSaliente(null)}
            />
        );
    }
    return null;
}
