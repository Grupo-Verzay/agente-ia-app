"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, MicOff, Phone, PhoneOff } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
    comoSeLeeLaDuracion,
    type FinDeLlamada,
} from "@/lib/llamada-de-voz";
import {
    contestarAction,
    llamarAction,
    losServidoresDeLlamadaAction,
    terminarAction,
} from "@/actions/llamadas-actions";

/**
 * Una llamada de voz, de navegador a navegador.
 *
 * # El WebRTC es el que esta App ya tenía
 *
 * `CallDialog` lleva tiempo en producción haciendo esto contra AstraCalls:
 * micro, `RTCPeerConnection`, `ontrack` a un `<audio>`, y —lo que de verdad
 * importa aquí— **espera a que ICE termine de recolectar** antes de mandar
 * **una sola** oferta. Eso es lo que permite señalizar por la base con un
 * reloj: viajan dos mensajes, no un goteo de candidatos.
 *
 * Lo único nuevo es que la otra punta es otro navegador y no un servidor.
 *
 * # Y sin TURN, algunas llamadas no conectan
 *
 * STUN dice cuál es tu dirección pública; **no transporta audio**. Con las dos
 * puntas detrás de NAT simétrico no hay ruta directa y hace falta un relevo.
 * Eso no se puede arreglar desde aquí — lo que sí se puede es **no perderlo en
 * silencio**: si la conexión no llega a `connected`, se corta y se dice
 * `sin_conexion`, que en el directo se lee «no se pudo conectar».
 */

/** Cuánto se espera a que el audio conecte antes de darla por imposible. */
const ESPERA_DE_CONEXION_MS = 20_000;

/**
 * Esperar a que ICE termine, con tope.
 *
 * El tope no es un lujo: con una red que no contesta al STUN, `complete` puede
 * no llegar nunca y la oferta no saldría jamás — la llamada se quedaría
 * «preparando» para siempre. Es el mismo patrón, y el mismo motivo, que en
 * `CallDialog`.
 */
function esperarLosCandidatos(pc: RTCPeerConnection): Promise<void> {
    return new Promise((resolve) => {
        if (pc.iceGatheringState === "complete") return resolve();
        const tope = setTimeout(resolve, 2_500);
        pc.addEventListener(
            "icegatheringstatechange",
            () => {
                if (pc.iceGatheringState === "complete") {
                    clearTimeout(tope);
                    resolve();
                }
            },
            { once: true },
        );
    });
}

type Estado = "preparando" | "sonando" | "hablando" | "cerrando";

export function LaLlamada({
    llamadaId,
    canalId,
    conQuien,
    entrante,
    onCerrar,
}: {
    /** La llamada ya creada, cuando entra. Al salir se crea aquí. */
    llamadaId: string | null;
    canalId: string;
    conQuien: string;
    /** La oferta de quien llama, si esto es una llamada entrante. */
    entrante: { id: string; oferta: string | null } | null;
    onCerrar: () => void;
}) {
    const [estado, setEstado] = useState<Estado>(entrante ? "sonando" : "preparando");
    const [segundos, setSegundos] = useState(0);
    const [callado, setCallado] = useState(false);

    const pcRef = useRef<RTCPeerConnection | null>(null);
    const micRef = useRef<MediaStream | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const idRef = useRef<string | null>(llamadaId ?? entrante?.id ?? null);
    const cerradoRef = useRef(false);

    /**
     * Soltar el micro y la conexión.
     *
     * **Siempre, por todos los caminos**: colgar, que cuelguen, un fallo, o
     * cerrar la pestaña. Un `getUserMedia` que no se para deja el punto rojo
     * del navegador encendido y el micro abierto — que es lo peor que puede
     * dejarse una función así.
     */
    const soltarTodo = useCallback(() => {
        micRef.current?.getTracks().forEach((t) => t.stop());
        micRef.current = null;
        try {
            pcRef.current?.close();
        } catch {
            // Cerrar dos veces no es un error que nadie tenga que ver.
        }
        pcRef.current = null;
    }, []);

    /** Terminar de verdad: soltar, avisar al servidor y cerrar la ventana. */
    const terminar = useCallback(
        async (fin: FinDeLlamada) => {
            if (cerradoRef.current) return;
            cerradoRef.current = true;
            setEstado("cerrando");
            soltarTodo();
            const id = idRef.current;
            if (id) {
                try {
                    await terminarAction(id, fin);
                } catch (error) {
                    // La llamada ya está cortada en esta punta; lo que se
                    // pierde es el registro, y eso se dice.
                    console.warn("[llamadas] no se pudo avisar de que colgué", error);
                }
            }
            onCerrar();
        },
        [onCerrar, soltarTodo],
    );

    /** Montar la conexión, con el micro dentro. */
    const montar = useCallback(async (): Promise<RTCPeerConnection | null> => {
        const ice = await losServidoresDeLlamadaAction();
        if (!ice.success) {
            toast.error(ice.message);
            return null;
        }

        let mic: MediaStream;
        try {
            mic = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (error) {
            // Permiso denegado, o sin micro. Es lo más común de todo y tiene
            // que decirse con palabras que se puedan usar.
            console.warn("[llamadas] no se pudo abrir el micrófono", error);
            toast.error("No se pudo usar el micrófono. Revisa el permiso del navegador.");
            return null;
        }
        micRef.current = mic;

        const pc = new RTCPeerConnection({ iceServers: ice.ice });
        pcRef.current = pc;
        mic.getAudioTracks().forEach((t) => pc.addTrack(t, mic));
        pc.ontrack = (ev) => {
            if (audioRef.current && ev.streams[0]) audioRef.current.srcObject = ev.streams[0];
        };
        pc.onconnectionstatechange = () => {
            if (pc.connectionState === "connected") setEstado("hablando");
            if (pc.connectionState === "failed") {
                // Aquí es donde acaba una llamada entre dos redes que no dejan
                // conectar directo. Se dice con su nombre.
                void terminar("sin_conexion");
            }
            if (pc.connectionState === "disconnected" || pc.connectionState === "closed") {
                void terminar("contestada");
            }
        };
        return pc;
    }, [terminar]);

    // ── Salir ───────────────────────────────────────────────────────────────
    useEffect(() => {
        if (entrante) return;
        let vivo = true;
        void (async () => {
            const pc = await montar();
            if (!pc || !vivo) return;

            const oferta = await pc.createOffer({ offerToReceiveAudio: true });
            await pc.setLocalDescription(oferta);
            await esperarLosCandidatos(pc);

            const res = await llamarAction(canalId, JSON.stringify(pc.localDescription));
            if (!vivo) return;
            if (!res.success) {
                // «No está conectado ahora mismo» sale por aquí: no llegó a
                // sonar en ninguna parte, así que no se anota nada.
                toast.error(res.message);
                cerradoRef.current = true;
                soltarTodo();
                onCerrar();
                return;
            }
            idRef.current = res.llamadaId;
            setEstado("sonando");
        })();
        return () => {
            vivo = false;
        };
    }, [canalId, entrante, montar, onCerrar, soltarTodo]);

    // ── Contestar ───────────────────────────────────────────────────────────
    const contestar = useCallback(async () => {
        if (!entrante?.oferta) return;
        const pc = await montar();
        if (!pc) return;

        try {
            await pc.setRemoteDescription(JSON.parse(entrante.oferta));
            const respuesta = await pc.createAnswer();
            await pc.setLocalDescription(respuesta);
            await esperarLosCandidatos(pc);

            const res = await contestarAction(entrante.id, JSON.stringify(pc.localDescription));
            if (!res.success) {
                toast.error(res.message);
                cerradoRef.current = true;
                soltarTodo();
                onCerrar();
                return;
            }
            setEstado("hablando");
        } catch (error) {
            console.warn("[llamadas] no se pudo contestar", error);
            void terminar("sin_conexion");
        }
    }, [entrante, montar, onCerrar, soltarTodo, terminar]);

    // ── Quien llamó espera la respuesta ─────────────────────────────────────
    //
    // La trae el mismo reloj que escucha las llamadas, por `respuestaRecibida`.
    const respuestaPuesta = useRef(false);
    const ponerLaRespuesta = useCallback(async (respuesta: string) => {
        const pc = pcRef.current;
        if (!pc || respuestaPuesta.current) return;
        respuestaPuesta.current = true;
        try {
            await pc.setRemoteDescription(JSON.parse(respuesta));
        } catch (error) {
            console.warn("[llamadas] la respuesta no se pudo aplicar", error);
            void terminar("sin_conexion");
        }
    }, [terminar]);

    useEffect(() => {
        const alRecibir = (e: Event) => {
            const detalle = (e as CustomEvent<{ id: string; respuesta: string }>).detail;
            if (detalle?.id === idRef.current && detalle.respuesta) {
                void ponerLaRespuesta(detalle.respuesta);
            }
        };
        const alColgar = (e: Event) => {
            const detalle = (e as CustomEvent<{ id: string }>).detail;
            if (detalle?.id === idRef.current && !cerradoRef.current) {
                cerradoRef.current = true;
                soltarTodo();
                onCerrar();
            }
        };
        window.addEventListener("llamada:respuesta", alRecibir);
        window.addEventListener("llamada:terminada", alColgar);
        return () => {
            window.removeEventListener("llamada:respuesta", alRecibir);
            window.removeEventListener("llamada:terminada", alColgar);
        };
    }, [onCerrar, ponerLaRespuesta, soltarTodo]);

    // ── El contador, y el plazo de conexión ─────────────────────────────────
    useEffect(() => {
        if (estado !== "hablando") return;
        const id = window.setInterval(() => setSegundos((s) => s + 1), 1000);
        return () => window.clearInterval(id);
    }, [estado]);

    useEffect(() => {
        if (estado !== "sonando") return;
        // Si el audio no llega a conectar en este plazo, no va a conectar: es
        // el caso de las dos redes cerradas. Mejor decirlo que dejar a alguien
        // mirando «Llamando…» un minuto.
        const id = window.setTimeout(() => {
            if (pcRef.current?.connectionState !== "connected") {
                void terminar(entrante ? "sin_conexion" : "sin_respuesta");
            }
        }, ESPERA_DE_CONEXION_MS);
        return () => window.clearTimeout(id);
    }, [estado, entrante, terminar]);

    // Soltar el micro pase lo que pase, también al desmontar.
    useEffect(() => () => soltarTodo(), [soltarTodo]);

    const silenciar = () => {
        const pista = micRef.current?.getAudioTracks()[0];
        if (!pista) return;
        pista.enabled = !pista.enabled;
        setCallado(!pista.enabled);
    };

    return (
        <div className="fixed inset-x-0 top-4 z-[100] mx-auto w-[min(92vw,22rem)] rounded-xl border border-border bg-background p-4 shadow-2xl">
            <audio ref={audioRef} autoPlay className="hidden" />

            <div className="flex flex-col items-center gap-1 text-center">
                <span className="text-sm text-muted-foreground">
                    {estado === "hablando"
                        ? "En llamada"
                        : entrante
                          ? "Llamada entrante"
                          : "Llamando…"}
                </span>
                <span className="max-w-full truncate text-lg font-medium">{conQuien}</span>
                {estado === "hablando" && (
                    <span className="font-mono text-sm tabular-nums text-muted-foreground">
                        {comoSeLeeLaDuracion(segundos)}
                    </span>
                )}
            </div>

            <div className="mt-4 flex items-center justify-center gap-3">
                {entrante && estado === "sonando" ? (
                    <>
                        <Button
                            variant="destructive"
                            size="icon"
                            className="h-12 w-12 rounded-full"
                            onClick={() => void terminar("rechazada")}
                            aria-label="Rechazar"
                        >
                            <PhoneOff className="h-5 w-5" />
                        </Button>
                        <Button
                            size="icon"
                            className="h-12 w-12 rounded-full bg-emerald-600 hover:bg-emerald-700"
                            onClick={() => void contestar()}
                            aria-label="Contestar"
                        >
                            <Phone className="h-5 w-5" />
                        </Button>
                    </>
                ) : (
                    <>
                        {estado === "hablando" && (
                            <Button
                                variant="outline"
                                size="icon"
                                className="h-12 w-12 rounded-full"
                                onClick={silenciar}
                                aria-label={callado ? "Activar micrófono" : "Silenciar"}
                            >
                                {callado ? (
                                    <MicOff className="h-5 w-5" />
                                ) : (
                                    <Mic className="h-5 w-5" />
                                )}
                            </Button>
                        )}
                        <Button
                            variant="destructive"
                            size="icon"
                            className="h-12 w-12 rounded-full"
                            onClick={() => void terminar("contestada")}
                            aria-label="Colgar"
                        >
                            <PhoneOff className="h-5 w-5" />
                        </Button>
                    </>
                )}
            </div>
        </div>
    );
}
