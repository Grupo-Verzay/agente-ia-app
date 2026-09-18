"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GripVertical, Maximize2, Mic, MicOff, Minus, Phone, PhoneOff } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
    comoSeLeeLaDuracion,
    dentroDeLaPantalla,
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

/**
 * Los cinco momentos de una llamada, y `conectando` no sobra.
 *
 * Es el que existe entre pulsar «Contestar» y que el audio esté puesto: pedir
 * el micro, armar la respuesta y esperar a ICE son varios segundos. Sin él, el
 * estado seguía siendo `sonando` todo ese rato y **el timbre seguía sonando
 * después de haber contestado** — que es justo el fallo que se viene a
 * arreglar. Un estado que no se nombra no se puede apagar.
 */
type Estado = "preparando" | "sonando" | "conectando" | "hablando" | "cerrando";

export function LaLlamada({
    llamadaId,
    canalId,
    conQuien,
    entrante,
    onSonando,
    onCerrar,
}: {
    /** La llamada ya creada, cuando entra. Al salir se crea aquí. */
    llamadaId: string | null;
    canalId: string;
    conQuien: string;
    /** La oferta de quien llama, si esto es una llamada entrante. */
    entrante: { id: string; oferta: string | null } | null;
    /**
     * Si AHORA MISMO hay que estar timbrando.
     *
     * Quien hace sonar el timbre es el oyente —cuelga del layout y suena estés
     * donde estés—, pero quien sabe si se está sonando es esta ventana. Va como
     * booleano y no como un «cállate» de una sola dirección: si contestar falla
     * —sin micro, permiso denegado— la llamada **sigue sonando en la otra
     * punta** y aquí tiene que volver a sonar. Un aviso de un solo sentido
     * dejaría esa llamada muda para siempre.
     */
    onSonando?: (sonando: boolean) => void;
    onCerrar: () => void;
}) {
    const [estado, setEstado] = useState<Estado>(entrante ? "sonando" : "preparando");
    const [segundos, setSegundos] = useState(0);
    const [callado, setCallado] = useState(false);
    const [minimizada, setMinimizada] = useState(false);
    /**
     * Dónde está la ventana, en píxeles, **una vez se ha movido**.
     *
     * `null` significa «donde la pone el CSS», arriba y centrada. No es lo
     * mismo que `{x,y}` calculado: mientras nadie la toque, la ventana se
     * recentra sola al cambiar el ancho de la pantalla, que es lo que se quiere
     * para algo que acaba de aparecer.
     */
    const [posicion, setPosicion] = useState<{ x: number; y: number } | null>(null);

    const pcRef = useRef<RTCPeerConnection | null>(null);
    const micRef = useRef<MediaStream | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const cajaRef = useRef<HTMLDivElement | null>(null);
    /** Dónde se agarró la ventana, para que no salte bajo el cursor. */
    const agarreRef = useRef<{ dx: number; dy: number } | null>(null);
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
        // Lo PRIMERO, antes de pedir el micro: desde aquí ya no se está
        // sonando. Pedir el micro abre el diálogo de permiso del navegador, y
        // dejar el timbre puesto detrás de ese diálogo es exactamente lo que se
        // vive como «contesté y sigue sonando».
        setEstado("conectando");
        const pc = await montar();
        if (!pc) {
            // Sin micro no se ha contestado nada, y la otra punta sigue
            // llamando: se vuelve a sonando y los botones vuelven, para poder
            // dar el permiso y reintentar. Quedarse en «Conectando…» sería un
            // callejón sin salida con el aviso ya mostrado.
            setEstado("sonando");
            return;
        }

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

    // ── Quién decide que el timbre calla ────────────────────────────────────
    //
    // Esta ventana, y no el oyente. El oyente es quien lo hace sonar, pero solo
    // lo paraba al desaparecer la llamada entrante —o sea al COLGAR—, así que
    // contestar no lo callaba y el timbre seguía sonando **toda la
    // conversación**.
    //
    // Y sonaba en las DOS puntas aunque el tono se genere en una sola: el micro
    // de quien contesta ya está abierto, así que su propio timbre se le colaba
    // por el micrófono a quien llamó. Una causa, dos síntomas.
    useEffect(() => {
        onSonando?.(estado === "sonando");
    }, [estado, onSonando]);

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

    // ── Arrastrar y minimizar ───────────────────────────────────────────────
    //
    // Solo con la llamada ya conectada. Mientras suena no hay nada que
    // recolocar: son dos botones y una decisión de un segundo, y poder
    // arrastrar una llamada entrante solo añade formas de no darle a Contestar.

    const puedeMoverse = estado === "hablando";

    /** Volver a meterla en pantalla midiéndola de verdad. */
    const recolocar = useCallback(() => {
        const caja = cajaRef.current;
        if (!caja) return;
        const r = caja.getBoundingClientRect();
        setPosicion((p) =>
            p
                ? dentroDeLaPantalla(p.x, p.y, r.width, r.height, {
                      ancho: window.innerWidth,
                      alto: window.innerHeight,
                  })
                : p,
        );
    }, []);

    // Al girar el móvil o estrechar la ventana, lo que estaba colocado puede
    // quedar fuera — y fuera está el botón de colgar.
    useEffect(() => {
        window.addEventListener("resize", recolocar);
        return () => window.removeEventListener("resize", recolocar);
    }, [recolocar]);

    // Y al plegarla o desplegarla cambia de tamaño: desplegar una barra pegada
    // al borde de abajo la sacaría por ahí.
    useEffect(() => {
        recolocar();
    }, [minimizada, recolocar]);

    const agarrar = (e: React.PointerEvent<HTMLElement>) => {
        // Solo el botón principal: con el derecho se abre el menú del
        // navegador y el arrastre se quedaría pegado al cursor.
        if (!puedeMoverse || e.button !== 0) return;
        const caja = cajaRef.current;
        if (!caja) return;
        const r = caja.getBoundingClientRect();
        // Fijar dónde está AHORA antes de tocar nada. Hasta este momento la
        // ventana la centra el CSS (`inset-x-0` más `mx-auto`), así que
        // aplicarle un desplazamiento sin fijarla antes la mandaría a la
        // esquina en el primer píxel de movimiento.
        setPosicion({ x: r.left, y: r.top });
        agarreRef.current = { dx: e.clientX - r.left, dy: e.clientY - r.top };
        // La captura va en el asa, que es quien lleva los manejadores: sin
        // ella, sacar el cursor de la ventana suelta el arrastre a medias.
        e.currentTarget.setPointerCapture(e.pointerId);
    };

    const mover = (e: React.PointerEvent<HTMLElement>) => {
        const agarre = agarreRef.current;
        const caja = cajaRef.current;
        if (!agarre || !caja) return;
        const r = caja.getBoundingClientRect();
        setPosicion(
            dentroDeLaPantalla(e.clientX - agarre.dx, e.clientY - agarre.dy, r.width, r.height, {
                ancho: window.innerWidth,
                alto: window.innerHeight,
            }),
        );
    };

    const soltar = (e: React.PointerEvent<HTMLElement>) => {
        if (!agarreRef.current) return;
        agarreRef.current = null;
        try {
            e.currentTarget.releasePointerCapture(e.pointerId);
        } catch {
            // El puntero ya se fue; no hay nada que soltar.
        }
    };

    /**
     * Lo que hace que un trozo sea asa.
     *
     * `touch-none` no es decoración: sin él, en un móvil el navegador se queda
     * el gesto para desplazar la página y la ventana no se mueve nunca.
     */
    const asa = puedeMoverse
        ? {
              onPointerDown: agarrar,
              onPointerMove: mover,
              onPointerUp: soltar,
              onPointerCancel: soltar,
              className: "cursor-grab touch-none active:cursor-grabbing",
          }
        : { className: "" };

    const silenciar = () => {
        const pista = micRef.current?.getAudioTracks()[0];
        if (!pista) return;
        pista.enabled = !pista.enabled;
        setCallado(!pista.enabled);
    };

    const rotulo =
        estado === "hablando"
            ? "En llamada"
            : estado === "conectando"
              ? "Conectando…"
              : entrante
                ? "Llamada entrante"
                : "Llamando…";

    return (
        // La caja de fuera es la que sostiene la POSICIÓN, y dentro cambia lo
        // que se pinta. Partirla en dos ventanas —una plegada y otra
        // desplegada— desmontaría el `<audio>` al plegar, y con él se iría el
        // `srcObject` que trae la voz del otro: la llamada seguiría abierta y
        // muda. Por eso el `<audio>` vive aquí fuera y no se mueve nunca.
        <div
            ref={cajaRef}
            style={posicion ? { left: posicion.x, top: posicion.y } : undefined}
            className={cn(
                "fixed z-[100] rounded-xl border border-border bg-background shadow-2xl",
                posicion ? "" : "inset-x-0 top-4 mx-auto",
                // `w-fit` y no `w-auto`: sin posición propia la caja va con
                // `inset-x-0`, y un ancho automático entre `left:0` y
                // `right:0` **se estira** — la barra pequeña salía de lado a
                // lado de la pantalla.
                minimizada ? "w-fit" : "w-[min(92vw,22rem)]",
            )}
        >
            <audio ref={audioRef} autoPlay className="hidden" />

            {minimizada ? (
                <div className="flex items-center gap-1 py-1 pl-1 pr-1.5">
                    {/* El asa se lleva el rato y el nombre: es la zona ancha y
                        la que no hace nada al pulsarla, así que puede recibir
                        el gesto sin competir con ningún botón. */}
                    <div
                        {...asa}
                        className={cn(
                            "flex min-w-0 items-center gap-2 rounded-lg px-2 py-1.5",
                            asa.className,
                        )}
                    >
                        <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="font-mono text-sm tabular-nums">
                            {comoSeLeeLaDuracion(segundos)}
                        </span>
                        <span className="max-w-[9rem] truncate text-sm text-muted-foreground">
                            {conQuien}
                        </span>
                    </div>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        onClick={() => setMinimizada(false)}
                        aria-label="Ampliar la llamada"
                    >
                        <Maximize2 className="h-4 w-4" />
                    </Button>
                    <Button
                        variant="destructive"
                        size="icon"
                        className="h-8 w-8 shrink-0 rounded-full"
                        onClick={() => void terminar("contestada")}
                        aria-label="Colgar"
                    >
                        <PhoneOff className="h-4 w-4" />
                    </Button>
                </div>
            ) : (
                <div className="relative flex flex-col gap-4 p-4">
                    {/* `gap` y no `space-y-*`: el botón de plegar va fuera del
                        flujo, y `space-y-*` le reparte margen igual — que es lo
                        que descuadra la tarjeta ocho píxeles.

                        Y va FUERA del asa, no dentro: el asa captura el puntero
                        al agarrarla, así que los eventos de después se le
                        redirigen a ella y el `click` del botón no llegaría a
                        salir nunca. Un botón que no hace nada. */}
                    {puedeMoverse && (
                        <Button
                            variant="ghost"
                            size="icon"
                            className="absolute right-2 top-2 z-10 h-8 w-8"
                            onClick={() => setMinimizada(true)}
                            aria-label="Plegar la llamada"
                        >
                            <Minus className="h-4 w-4" />
                        </Button>
                    )}
                    <div
                        {...asa}
                        className={cn(
                            // El hueco del botón se reserva: un nombre largo
                            // pasaría por debajo, y lo que no se ve ocupa igual.
                            "flex flex-col items-center gap-1 rounded-lg px-8 py-1 text-center",
                            asa.className,
                        )}
                    >
                        <span className="text-sm text-muted-foreground">{rotulo}</span>
                        <span className="max-w-full truncate text-lg font-medium">
                            {conQuien}
                        </span>
                        {estado === "hablando" && (
                            <span className="font-mono text-sm tabular-nums text-muted-foreground">
                                {comoSeLeeLaDuracion(segundos)}
                            </span>
                        )}
                    </div>

                    <div className="flex items-center justify-center gap-3">
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
                                        aria-label={
                                            callado ? "Activar micrófono" : "Silenciar"
                                        }
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
            )}
        </div>
    );
}
