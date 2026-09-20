"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import {
    ALTO_DEL_LIENZO,
    ANCHO_DEL_LIENZO,
    AUDIO_BPS,
    FPS_DEL_LIENZO,
    TAMANO_DE_PARTE,
    TOPE_DE_UNA_GRABACION_MS,
    VIDEO_BPS,
    comoEntraElVideo,
    lasCasillasDelLienzo,
    sePuedeMandarLaParte,
    type ModoDeGrabacion,
} from "@/lib/grabacion-de-reunion";
import {
    empezarAGrabarAction,
    terminarDeGrabarAction,
} from "@/actions/salas-de-video-actions";

/**
 * Grabar la reunión desde la pestaña de quien pulsa.
 *
 * # Por qué aquí y no en el servidor
 *
 * Porque el servidor **nunca ve un fotograma**: esto es una malla directa sin
 * servidor de video, y lo único que pasa por la base son ofertas SDP. Así que
 * graba quien pulsa, mezclando el audio de todos y —si se pidió video—
 * dibujando la rejilla en un lienzo.
 *
 * De ahí salen las dos cosas que hay que saber antes de tocar nada:
 *
 * 1. **Si esa pestaña se cierra, la grabación se acaba.** Lo subido se
 *    conserva; lo que estuviera en el buffer, no. Por eso el aviso de «se está
 *    grabando» caduca solo, y por eso al descargar la página se intenta cerrar.
 * 2. **No toca ni una conexión.** No añade pistas, no renegocia y no cambia lo
 *    que viaja por la malla: lo que hace es *leer* los streams que ya están
 *    llegando. Grabar no puede costarle la reunión a nadie.
 *
 * # El audio se graba SIEMPRE, aunque se pida video
 *
 * Es lo que hace posible transcribir: Whisper no admite más de 25 MB y una hora
 * de video es un giga. Sacarle el audio en el servidor pediría `ffmpeg`, que no
 * hay. Así que en modo video salen **dos** ficheros y el pequeño es el que se
 * transcribe. Cuesta un 1,5 % más de bucket.
 */

export type EstadoDeLaGrabacion = {
    /** El id mientras se graba. Es lo que viaja en el latido. */
    grabacionId: string | null;
    grabando: boolean;
    /** Mientras se pide permiso, se junta o se cierra. */
    ocupado: boolean;
    /** Segundos grabados, para el contador de la cabecera. */
    segundos: number;
    modo: ModoDeGrabacion | null;
};

type Fuente = { id: string; stream: MediaStream | null };

export function useGrabacionDeLaReunion(input: {
    codigo: string;
    /**
     * Lo que se VE de cada uno. El recuadro propio va aquí, y **sin audio**.
     */
    fuentes: Fuente[];
    /**
     * El micrófono propio, que NO está en `fuentes`.
     *
     * `medios.local` excluye el audio de uno mismo a propósito —para que nadie
     * se oiga con retardo si algún día se le quita el `muted` al recuadro—, así
     * que sin este segundo canal **quien graba no sale en su propia
     * grabación**. Con una sola persona en la sala eso es un fichero de cero
     * bytes: el `MediaRecorder` no emite ni un trozo si no hay nada conectado
     * al mezclador. Medido antes de arreglarlo: nueve segundos grabando, cero
     * `dataavailable`, y un blob final de 0 B.
     */
    miAudio: MediaStream | null;
}): EstadoDeLaGrabacion & {
    empezar: (modo: ModoDeGrabacion) => Promise<void>;
    terminar: () => Promise<void>;
} {
    const { codigo } = input;

    const [estado, setEstado] = useState<EstadoDeLaGrabacion>({
        grabacionId: null,
        grabando: false,
        ocupado: false,
        segundos: 0,
        modo: null,
    });

    /**
     * Las fuentes, **por referencia**.
     *
     * El mismo motivo de siempre en esta suite: el bucle del lienzo y el mezclador
     * se montan una vez y leen de aquí. Con `fuentes` en las dependencias, cada
     * vez que alguien tocara el micro se desmontaría el lienzo a mitad de
     * grabación.
     */
    const fuentesRef = useRef(input.fuentes);
    fuentesRef.current = input.fuentes;

    const idRef = useRef<string | null>(null);
    const empezoEnRef = useRef<number>(0);
    const audioCtxRef = useRef<AudioContext | null>(null);
    const mezclaRef = useRef<MediaStreamAudioDestinationNode | null>(null);
    const enchufadosRef = useRef<Map<string, MediaStreamAudioSourceNode>>(new Map());
    const videosRef = useRef<Map<string, HTMLVideoElement>>(new Map());
    const lienzoRef = useRef<HTMLCanvasElement | null>(null);
    const pintandoRef = useRef<number | null>(null);
    const grabadoresRef = useRef<MediaRecorder[]>([]);
    const sueltaRef = useRef<(() => void) | null>(null);
    /**
     * `terminar` por referencia, y declarado ANTES de quien lo llama.
     *
     * `mandarLaParte` tiene que poder cortar la grabación —el cupo se acabó, la
     * subida falló— y `terminar` la llama a ella: escritas como dos `useCallback`
     * que se nombran, una de las dos capturaría a la otra de un render anterior.
     * Un ref rompe el círculo sin que ninguna dependa de la otra.
     */
    const terminarRef = useRef<(() => Promise<void>) | null>(null);
    /** El cerrojo de cerrar: a `terminar` se llega por tres caminos distintos. */
    const cerrandoRef = useRef(false);

    /** Lo que se ha acumulado de cada fichero y por qué parte va. */
    const buffersRef = useRef<Record<"audio" | "video", { trozos: Blob[]; bytes: number; parte: number }>>({
        audio: { trozos: [], bytes: 0, parte: 0 },
        video: { trozos: [], bytes: 0, parte: 0 },
    });

    /**
     * Mandar lo acumulado como una parte.
     *
     * **En serie y sin reintento.** En serie porque las partes se juntan por su
     * número y dos subiendo a la vez pueden llegar desordenadas al contador; sin
     * reintento porque mientras se reintenta siguen llegando trozos, y la cola
     * crecería en memoria más deprisa de lo que se vacía.
     *
     * Un `413` es el cupo de la cuenta: **se para y se guarda lo que haya**, que
     * es lo contrario de tirar media hora de reunión por no caber la última
     * parte.
     */
    const mandarLaParte = useCallback(
        async (cual: "audio" | "video", esLaUltima: boolean): Promise<void> => {
            const buf = buffersRef.current[cual];
            if (!sePuedeMandarLaParte({ bytes: buf.bytes, esLaUltima })) return;
            const id = idRef.current;
            if (!id) return;

            const cuerpo = new Blob(buf.trozos, { type: "video/webm" });
            buf.trozos = [];
            buf.bytes = 0;
            buf.parte += 1;

            try {
                const res = await fetch(
                    `/api/reuniones/parte?grabacion=${encodeURIComponent(id)}&cual=${cual}&numero=${buf.parte}`,
                    { method: "POST", body: cuerpo },
                );
                if (res.status === 413) {
                    toast.error("Se acabó el espacio de grabación. Se guarda lo grabado hasta aquí.");
                    void terminarRef.current?.();
                    return;
                }
                if (!res.ok) {
                    // Una parte que no sube deja un hueco en el fichero, así que
                    // no se puede seguir como si nada: se cierra con lo que sí
                    // llegó. Mudo se vería como una grabación que sale cortada
                    // sin motivo.
                    console.warn("[reuniones] una parte no se pudo subir", {
                        cual,
                        parte: buf.parte,
                        estado: res.status,
                    });
                    toast.error("Se cortó la subida de la grabación. Se guarda lo que llegó.");
                    void terminarRef.current?.();
                }
            } catch (error) {
                console.warn("[reuniones] fallo al subir una parte", error);
                toast.error("Se cortó la subida de la grabación. Se guarda lo que llegó.");
                void terminarRef.current?.();
            }
        },
        [],
    );

    /** Soltarlo todo: grabadores, lienzo, mezclador y videos sueltos. */
    const soltar = useCallback(() => {
        for (const g of grabadoresRef.current) {
            try {
                if (g.state !== "inactive") g.stop();
            } catch {
                // Parar uno ya parado no es un error que nadie tenga que ver.
            }
        }
        grabadoresRef.current = [];
        if (pintandoRef.current !== null) {
            window.clearInterval(pintandoRef.current);
            pintandoRef.current = null;
        }
        for (const v of videosRef.current.values()) {
            v.srcObject = null;
        }
        videosRef.current.clear();
        for (const n of enchufadosRef.current.values()) {
            try {
                n.disconnect();
            } catch {
                // Igual.
            }
        }
        enchufadosRef.current.clear();
        mezclaRef.current = null;
        const ctx = audioCtxRef.current;
        audioCtxRef.current = null;
        // **Se cierra el `AudioContext`.** Dejarlo abierto no se nota en esta
        // reunión: se nota en la siguiente, porque los navegadores topan cuántos
        // se pueden tener a la vez y al llegar al tope deja de sonar todo.
        if (ctx && ctx.state !== "closed") void ctx.close().catch(() => {});
        lienzoRef.current = null;
    }, []);
    sueltaRef.current = soltar;

    const terminar = useCallback(async () => {
        const id = idRef.current;
        // **El id NO se borra aquí.** `mandarLaParte` se rinde sin él, así que
        // borrarlo antes de vaciar hace que la última parte no suba nunca — y en
        // una grabación corta esa es la única, o sea que se pierde entera. Lo
        // que impide entrar dos veces es un cerrojo aparte, que es lo que hace
        // falta de verdad: a `terminar` se llega desde el botón, desde el tope
        // de tiempo y desde una parte que falla, y las tres pueden coincidir.
        if (!id || cerrandoRef.current) return;
        cerrandoRef.current = true;
        setEstado((e) => ({ ...e, ocupado: true, grabando: false }));

        // Se para ANTES de vaciar: `stop()` provoca el último `ondataavailable`,
        // y sin él se perdería el trozo que estuviera en curso.
        for (const g of grabadoresRef.current) {
            try {
                if (g.state !== "inactive") g.stop();
            } catch {
                // Ya estaba parado.
            }
        }
        // Un respiro para que ese último trozo llegue al buffer. Sin él, lo que
        // se pierde es el final de la reunión, que suele ser lo que importa.
        await new Promise((listo) => setTimeout(listo, 250));

        await mandarLaParte("audio", true);
        await mandarLaParte("video", true);
        // Ahora sí: vaciadas las dos, el id ya no hace falta y soltarlo es lo
        // que impide que un trozo tardío se cuele en una grabación cerrada.
        idRef.current = null;
        soltar();

        const segundos = Math.round((Date.now() - empezoEnRef.current) / 1000);
        try {
            const res = await terminarDeGrabarAction({ codigo, grabacionId: id, segundos });
            if (!res.success) toast.error(res.message);
            else toast.success("Grabación guardada. Está en la ficha de la reunión.");
        } catch (error) {
            console.warn("[reuniones] no se pudo cerrar la grabacion", error);
            toast.error("No se pudo cerrar la grabación.");
        } finally {
            cerrandoRef.current = false;
            setEstado({
                grabacionId: null,
                grabando: false,
                ocupado: false,
                segundos: 0,
                modo: null,
            });
        }
    }, [codigo, mandarLaParte, soltar]);
    terminarRef.current = terminar;

    const empezar = useCallback(
        async (modo: ModoDeGrabacion) => {
            if (idRef.current) return;
            setEstado((e) => ({ ...e, ocupado: true }));
            try {
                const res = await empezarAGrabarAction({ codigo, modo });
                if (!res.success) {
                    toast.error(res.message);
                    setEstado((e) => ({ ...e, ocupado: false }));
                    return;
                }

                buffersRef.current = {
                    audio: { trozos: [], bytes: 0, parte: 0 },
                    video: { trozos: [], bytes: 0, parte: 0 },
                };
                idRef.current = res.grabacionId;
                empezoEnRef.current = Date.now();

                // El mezclador: una entrada por stream, todas a una salida. Es
                // lo único que puede producir «la reunión» como un solo audio —
                // grabar solo el micro propio sería grabar un monólogo.
                const ctx = new AudioContext();
                audioCtxRef.current = ctx;
                const mezcla = ctx.createMediaStreamDestination();
                mezclaRef.current = mezcla;

                // **Un silencio conectado siempre**, y no es decoración.
                //
                // Un `MediaStreamAudioDestinationNode` sin nada conectado no
                // hace rodar el grafo, así que `MediaRecorder` no emite ni un
                // trozo: la grabación sale de cero bytes y el botón dice que
                // todo fue bien. Pasa de verdad —una reunión donde todo el
                // mundo está callado, o los segundos antes de que entre el
                // primero— y es el peor final posible porque nada avisa.
                //
                // Un `ConstantSourceNode` con `offset = 0` es silencio exacto
                // que mantiene el grafo rodando. Se para con el contexto.
                const silencio = ctx.createConstantSource();
                silencio.offset.value = 0;
                silencio.connect(mezcla);
                silencio.start();

                const grabadores: MediaRecorder[] = [];

                const audio = new MediaRecorder(mezcla.stream, {
                    mimeType: elFormato(["audio/webm;codecs=opus", "audio/webm"]),
                    audioBitsPerSecond: AUDIO_BPS,
                });
                audio.ondataavailable = (ev) => acumular("audio", ev.data);
                audio.start(2000);
                grabadores.push(audio);

                if (modo === "video") {
                    const lienzo = document.createElement("canvas");
                    lienzo.width = ANCHO_DEL_LIENZO;
                    lienzo.height = ALTO_DEL_LIENZO;
                    lienzoRef.current = lienzo;
                    pintandoRef.current = window.setInterval(pintar, Math.round(1000 / FPS_DEL_LIENZO));

                    const conVideo = lienzo.captureStream(FPS_DEL_LIENZO);
                    for (const p of mezcla.stream.getAudioTracks()) conVideo.addTrack(p);
                    const video = new MediaRecorder(conVideo, {
                        mimeType: elFormato([
                            "video/webm;codecs=vp8,opus",
                            "video/webm;codecs=vp9,opus",
                            "video/webm",
                        ]),
                        videoBitsPerSecond: VIDEO_BPS,
                        audioBitsPerSecond: AUDIO_BPS,
                    });
                    video.ondataavailable = (ev) => acumular("video", ev.data);
                    video.start(2000);
                    grabadores.push(video);
                }

                grabadoresRef.current = grabadores;
                setEstado({
                    grabacionId: res.grabacionId,
                    grabando: true,
                    ocupado: false,
                    segundos: 0,
                    modo,
                });
            } catch (error) {
                console.warn("[reuniones] no se pudo empezar a grabar", error);
                toast.error("No se pudo empezar a grabar.");
                idRef.current = null;
                soltar();
                setEstado((e) => ({ ...e, ocupado: false, grabando: false }));
            }
        },
        // `acumular` y `pintar` se definen abajo y no cambian de identidad:
        // viven en este mismo cierre y leen todo por referencia.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [codigo, soltar],
    );

    /** Meter un trozo en su buffer y soltar la parte cuando llegue al tamaño. */
    function acumular(cual: "audio" | "video", trozo: Blob) {
        if (!trozo || !trozo.size || !idRef.current) return;
        const buf = buffersRef.current[cual];
        buf.trozos.push(trozo);
        buf.bytes += trozo.size;
        if (buf.bytes >= TAMANO_DE_PARTE) void mandarLaParte(cual, false);
    }

    /** Un fotograma del lienzo con lo que se está viendo ahora mismo. */
    function pintar() {
        const lienzo = lienzoRef.current;
        const ctx = lienzo?.getContext("2d");
        if (!lienzo || !ctx) return;

        const fuentes = fuentesRef.current.filter((f) => f.stream);
        ctx.fillStyle = "#09090b";
        ctx.fillRect(0, 0, lienzo.width, lienzo.height);

        const casillas = lasCasillasDelLienzo(fuentes.length, lienzo.width, lienzo.height);
        fuentes.forEach((f, i) => {
            const casilla = casillas[i];
            if (!casilla) return;
            const v = elVideoDe(f);
            if (!v || !v.videoWidth) return;
            const corte = comoEntraElVideo({
                anchoDelVideo: v.videoWidth,
                altoDelVideo: v.videoHeight,
                casilla,
            });
            if (!corte) return;
            ctx.drawImage(
                v,
                corte.sx,
                corte.sy,
                corte.sw,
                corte.sh,
                casilla.x,
                casilla.y,
                casilla.ancho,
                casilla.alto,
            );
        });
    }

    /**
     * El `<video>` con el que se lee cada stream para dibujarlo.
     *
     * **Fuera del DOM y en silencio.** Fuera del DOM porque esto es un hook y no
     * pinta nada, y en silencio (`muted`) porque si sonara se oiría cada voz dos
     * veces en la sala — una por el recuadro de verdad y otra por este.
     */
    function elVideoDe(f: Fuente): HTMLVideoElement | null {
        if (!f.stream) return null;
        let v = videosRef.current.get(f.id);
        if (!v) {
            v = document.createElement("video");
            v.muted = true;
            v.playsInline = true;
            v.autoplay = true;
            videosRef.current.set(f.id, v);
        }
        if (v.srcObject !== f.stream) {
            v.srcObject = f.stream;
            void v.play().catch(() => {
                // Sin permiso de reproducción automática no hay nada que hacer
                // aquí: el recuadro saldrá en negro y el audio se graba igual.
            });
        }
        return v;
    }

    /**
     * Enchufar y desenchufar fuentes de audio según entra y sale gente.
     *
     * Sin esto, quien entrara a mitad de grabación **no saldría en el audio**, y
     * eso no se ve hasta que alguien escucha el fichero.
     */
    useEffect(() => {
        const mezcla = mezclaRef.current;
        const ctx = audioCtxRef.current;
        if (!mezcla || !ctx || !estado.grabando) return;

        const vivos = new Set<string>();
        // El micrófono propio entra como una fuente más, con su id reservado.
        const todas: Fuente[] = input.miAudio
            ? [{ id: "yo:mic", stream: input.miAudio }, ...input.fuentes]
            : input.fuentes;
        for (const f of todas) {
            if (!f.stream || !f.stream.getAudioTracks().length) continue;
            vivos.add(f.id);
            if (enchufadosRef.current.has(f.id)) continue;
            try {
                const nodo = ctx.createMediaStreamSource(f.stream);
                nodo.connect(mezcla);
                enchufadosRef.current.set(f.id, nodo);
            } catch (error) {
                console.warn("[reuniones] no se pudo mezclar a alguien", { de: f.id, error });
            }
        }
        for (const [id, nodo] of Array.from(enchufadosRef.current)) {
            if (vivos.has(id)) continue;
            try {
                nodo.disconnect();
            } catch {
                // Ya estaba suelto.
            }
            enchufadosRef.current.delete(id);
        }
    }, [estado.grabando, input.fuentes, input.miAudio]);

    /** El contador, y el tope de una grabación suelta. */
    useEffect(() => {
        if (!estado.grabando) return;
        const id = window.setInterval(() => {
            const va = Date.now() - empezoEnRef.current;
            if (va >= TOPE_DE_UNA_GRABACION_MS) {
                toast.info("La grabación llegó a su tope. Se guarda lo grabado.");
                void terminarRef.current?.();
                return;
            }
            setEstado((e) => ({ ...e, segundos: Math.round(va / 1000) }));
        }, 1000);
        return () => window.clearInterval(id);
    }, [estado.grabando]);

    /**
     * Al cerrar la pestaña se intenta cerrar la grabación.
     *
     * **Best-effort a propósito**: `pagehide` da milisegundos, así que lo que
     * esté sin subir se pierde. Lo que esto evita es que la fila se quede en
     * `grabando` para siempre —y con ella la sala, que entonces no podría
     * volver a grabarse nunca—. El barrido diario la cerraría igual; esto solo
     * hace que pase al momento.
     */
    useEffect(() => {
        const alCerrar = () => {
            if (!idRef.current) return;
            const id = idRef.current;
            const segundos = Math.round((Date.now() - empezoEnRef.current) / 1000);
            navigator.sendBeacon?.(
                `/api/reuniones/parte?cerrar=1&grabacion=${encodeURIComponent(id)}&segundos=${segundos}`,
            );
        };
        window.addEventListener("pagehide", alCerrar);
        return () => window.removeEventListener("pagehide", alCerrar);
    }, []);

    /** Y al desmontar: una grabación sin su pantalla es una cámara sin dueño. */
    useEffect(() => {
        return () => {
            sueltaRef.current?.();
        };
    }, []);

    return { ...estado, empezar, terminar };
}

/**
 * El primer formato que este navegador sepa grabar.
 *
 * No se da ninguno por hecho: Safari no tiene webm y sin esto `MediaRecorder`
 * lanza al construirse, o sea que el botón de grabar reventaría en vez de
 * decir que no se puede. Con la lista vacía se deja elegir al navegador.
 */
function elFormato(candidatos: string[]): string | undefined {
    if (typeof MediaRecorder === "undefined") return undefined;
    for (const c of candidatos) {
        if (MediaRecorder.isTypeSupported?.(c)) return c;
    }
    return undefined;
}
