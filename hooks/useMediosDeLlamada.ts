"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * El micrófono, la cámara y la pantalla de una llamada — **una sola vez**.
 *
 * Lo usan las dos pantallas que hacen WebRTC en esta App: la llamada de uno a
 * uno del directo y la sala de video de hasta cuatro. Copiado, el día que se
 * afine cómo se apaga la cámara o qué pasa al dejar de compartir se afina en
 * una y la otra se queda atrás — y eso no se ve como un error, se ve como que
 * «en las reuniones a veces la cámara no se apaga».
 *
 * Es *headless*: devuelve estado y funciones, no pinta nada. Cada pantalla le
 * pone los botones que le toquen, igual que `useAudioRecording`.
 *
 * # La idea de la que cuelga todo: las pistas se NEGOCIAN una vez
 *
 * Cada conexión abre un transceptor de audio y uno de video en `sendrecv`
 * **desde el principio**, haya o no algo que poner encima. A partir de ahí,
 * encender la cámara, callarse o compartir la pantalla son `replaceTrack` y
 * `enabled`: cosas que pasan **dentro** de una conexión ya negociada y que no
 * necesitan decirle nada a nadie.
 *
 * Eso es lo que hace viable señalizar por la base con un reloj. La alternativa
 * —añadir una pista al compartir pantalla— obligaría a renegociar, y en una
 * malla de cuatro son **seis** renegociaciones contra un reloj de segundos cada
 * vez que alguien pulsa «compartir».
 *
 * # Por qué el micro y la cámara se apagan de forma distinta
 *
 * No es un descuido, y conviene no «arreglarlo»:
 *
 * - **El micro se silencia** (`enabled = false`) y la pista se queda viva.
 *   Callarse es momentáneo y se deshace a media frase: soltar el micro y
 *   volver a pedirlo metería medio segundo de retraso justo cuando alguien
 *   quiere interrumpir.
 * - **La cámara se SUELTA de verdad** (se para la pista y el emisor se queda
 *   sin nada). Apagar la cámara es una decisión que dura, y lo que la gente
 *   espera al pulsarlo es que **el piloto del portátil se apague**. Con
 *   `enabled = false` el piloto sigue encendido y se manda una imagen negra:
 *   desde fuera, la App parece estar mirando igual.
 */

export type EstadoDeLosMedios = {
    /** Lo que se ve en el recuadro propio. Cambia al encender o compartir. */
    local: MediaStream | null;
    micEncendido: boolean;
    camaraEncendida: boolean;
    compartiendo: boolean;
    /** Mientras se pide un permiso al navegador, para que el botón lo diga. */
    pidiendo: boolean;
};

export type MediosDeLlamada = EstadoDeLosMedios & {
    /**
     * Pedir micro y —si se quiere— cámara. Devuelve si se consiguió **algo**.
     *
     * Vale sin cámara: una reunión con el micro puesto y sin imagen es una
     * reunión; sin micro no lo es. Por eso el fallo de la cámara no tumba la
     * entrada y el del micro sí.
     */
    arrancar: (conVideo: boolean) => Promise<boolean>;
    alternarMic: () => void;
    alternarCamara: () => Promise<void>;
    alternarPantalla: () => Promise<void>;
    /** Montar los dos transceptores en una conexión nueva y engancharle lo de ahora. */
    prepararLaConexion: (pc: RTCPeerConnection) => void;
    /** Lo mismo, pero sobre una conexión que ya trae los transceptores del otro. */
    engancharALaConexion: (pc: RTCPeerConnection) => void;
    olvidarLaConexion: (pc: RTCPeerConnection) => void;
    soltarTodo: () => void;
};

/** Lo que se le dice a alguien cuando el navegador dice que no. */
function loQuePasoConElPermiso(error: unknown, que: "micrófono" | "cámara" | "pantalla"): string {
    const nombre = error instanceof Error ? error.name : "";
    if (nombre === "NotAllowedError") {
        return `No diste permiso para ${que === "pantalla" ? "compartir la pantalla" : `usar ${que === "micrófono" ? "el micrófono" : "la cámara"}`}.`;
    }
    if (nombre === "NotFoundError" || nombre === "OverconstrainedError") {
        return `No se encontró ${que === "micrófono" ? "ningún micrófono" : "ninguna cámara"}.`;
    }
    if (nombre === "NotReadableError") {
        return `Otra aplicación está usando ${que === "micrófono" ? "el micrófono" : "la cámara"}.`;
    }
    return `No se pudo usar ${que === "pantalla" ? "la pantalla" : que === "micrófono" ? "el micrófono" : "la cámara"}.`;
}

export function useMediosDeLlamada(opciones?: {
    /** Para decir en pantalla qué pasó. Sin esto, un permiso denegado es mudo. */
    alFallar?: (mensaje: string) => void;
}): MediosDeLlamada {
    const alFallar = opciones?.alFallar;

    const [estado, setEstado] = useState<EstadoDeLosMedios>({
        local: null,
        micEncendido: false,
        camaraEncendida: false,
        compartiendo: false,
        pidiendo: false,
    });

    /** El micro. Vive toda la llamada; callarse es `enabled`, no soltarlo. */
    const micRef = useRef<MediaStream | null>(null);
    /** La cámara, cuando está encendida. Apagarla la para de verdad. */
    const camaraRef = useRef<MediaStream | null>(null);
    /** La pantalla compartida, mientras se comparte. */
    const pantallaRef = useRef<MediaStream | null>(null);
    /** Las conexiones a las que hay que empujarles lo que se manda. */
    const conexionesRef = useRef<Set<RTCPeerConnection>>(new Set());
    /** Lo que se está enseñando de uno mismo, para el recuadro propio. */
    const localRef = useRef<MediaStream | null>(null);

    /** La pista de video que toca mandar AHORA: la pantalla gana a la cámara. */
    const laPistaDeVideo = useCallback((): MediaStreamTrack | null => {
        return (
            pantallaRef.current?.getVideoTracks()[0] ??
            camaraRef.current?.getVideoTracks()[0] ??
            null
        );
    }, []);

    const laPistaDeAudio = useCallback((): MediaStreamTrack | null => {
        return micRef.current?.getAudioTracks()[0] ?? null;
    }, []);

    /**
     * Empujar a TODAS las conexiones lo que se manda ahora mismo.
     *
     * Se llama en cada cambio —encender la cámara, compartir, dejar de
     * compartir— y también al abrir una conexión nueva. Con una sola función
     * no puede pasar que una conexión de la malla se quede con la cámara y
     * otra con la pantalla, que es el fallo que solo se ve cuando hay cuatro.
     */
    const empujarLasPistas = useCallback(() => {
        const audio = laPistaDeAudio();
        const video = laPistaDeVideo();
        for (const pc of conexionesRef.current) {
            if (pc.connectionState === "closed") continue;
            for (const t of pc.getTransceivers()) {
                // De qué es cada transceptor lo dice su RECEPTOR, no su emisor:
                // el emisor puede estar vacío —recién creado, o con la cámara
                // apagada— y entonces `sender.track` es nulo y no dice nada. El
                // receptor trae su pista desde que el transceptor existe, y con
                // la clase correcta, así que es el único dato fiable de los dos.
                const clase = t.receiver?.track?.kind;
                if (clase === "audio") void t.sender.replaceTrack(audio).catch(nada);
                else if (clase === "video") void t.sender.replaceTrack(video).catch(nada);
            }
        }
    }, [laPistaDeAudio, laPistaDeVideo]);

    /** El recuadro propio: lo que se está mandando, montado en un stream. */
    const rehacerElLocal = useCallback(() => {
        const nuevo = new MediaStream();
        const audio = laPistaDeAudio();
        const video = laPistaDeVideo();
        // El audio propio NO entra en el recuadro: se pintaría con `muted`
        // igual, pero si algún día alguien le quita el `muted` al `<video>` se
        // oiría a sí mismo con retardo, que es lo más desagradable que puede
        // hacer una videollamada.
        if (video) nuevo.addTrack(video);
        localRef.current = nuevo;
        setEstado((e) => ({
            ...e,
            local: video ? nuevo : null,
            micEncendido: Boolean(audio?.enabled),
            camaraEncendida: Boolean(camaraRef.current?.getVideoTracks()[0]),
            compartiendo: Boolean(pantallaRef.current?.getVideoTracks()[0]),
        }));
    }, [laPistaDeAudio, laPistaDeVideo]);

    const arrancar = useCallback(
        async (conVideo: boolean): Promise<boolean> => {
            setEstado((e) => ({ ...e, pidiendo: true }));
            try {
                if (!micRef.current) {
                    try {
                        micRef.current = await navigator.mediaDevices.getUserMedia({
                            audio: true,
                        });
                    } catch (error) {
                        console.warn("[medios] no se pudo abrir el micrófono", error);
                        alFallar?.(loQuePasoConElPermiso(error, "micrófono"));
                        return false;
                    }
                }
                if (conVideo && !camaraRef.current) {
                    try {
                        camaraRef.current = await navigator.mediaDevices.getUserMedia({
                            video: { width: { ideal: 1280 }, height: { ideal: 720 } },
                        });
                    } catch (error) {
                        // Sin cámara se entra igual: una reunión con voz es una
                        // reunión. Se dice, pero no se cierra la puerta.
                        console.warn("[medios] no se pudo abrir la cámara", error);
                        alFallar?.(loQuePasoConElPermiso(error, "cámara"));
                    }
                }
                rehacerElLocal();
                empujarLasPistas();
                return true;
            } finally {
                setEstado((e) => ({ ...e, pidiendo: false }));
            }
        },
        [alFallar, empujarLasPistas, rehacerElLocal],
    );

    const alternarMic = useCallback(() => {
        const pista = laPistaDeAudio();
        if (!pista) return;
        pista.enabled = !pista.enabled;
        setEstado((e) => ({ ...e, micEncendido: pista.enabled }));
    }, [laPistaDeAudio]);

    const alternarCamara = useCallback(async () => {
        if (camaraRef.current) {
            // Apagar: se PARA la pista, no se deshabilita. Es lo que apaga el
            // piloto del portátil, que es el único signo de que de verdad no se
            // está mirando.
            camaraRef.current.getTracks().forEach((t) => t.stop());
            camaraRef.current = null;
            rehacerElLocal();
            empujarLasPistas();
            return;
        }
        setEstado((e) => ({ ...e, pidiendo: true }));
        try {
            camaraRef.current = await navigator.mediaDevices.getUserMedia({
                video: { width: { ideal: 1280 }, height: { ideal: 720 } },
            });
            rehacerElLocal();
            empujarLasPistas();
        } catch (error) {
            console.warn("[medios] no se pudo encender la cámara", error);
            alFallar?.(loQuePasoConElPermiso(error, "cámara"));
        } finally {
            setEstado((e) => ({ ...e, pidiendo: false }));
        }
    }, [alFallar, empujarLasPistas, rehacerElLocal]);

    /** Dejar de compartir, por donde sea que se haya dejado. */
    const dejarDeCompartir = useCallback(() => {
        pantallaRef.current?.getTracks().forEach((t) => t.stop());
        pantallaRef.current = null;
        rehacerElLocal();
        empujarLasPistas();
    }, [empujarLasPistas, rehacerElLocal]);

    const alternarPantalla = useCallback(async () => {
        if (pantallaRef.current) {
            dejarDeCompartir();
            return;
        }
        setEstado((e) => ({ ...e, pidiendo: true }));
        try {
            // Solo video: el audio del sistema sería una SEGUNDA pista de
            // audio, y eso obliga a renegociar las seis conexiones de la malla.
            // El micro sigue sonando, que es lo que hace falta para explicar lo
            // que se está enseñando.
            const pantalla = await navigator.mediaDevices.getDisplayMedia({ video: true });
            pantallaRef.current = pantalla;
            // Y lo que no se puede olvidar: el navegador pone su propio botón
            // de «dejar de compartir», fuera de nuestra pantalla. Sin
            // escucharlo, quien lo pulsa deja a los demás mirando el último
            // fotograma congelado para siempre.
            pantalla.getVideoTracks()[0]?.addEventListener("ended", () => dejarDeCompartir());
            rehacerElLocal();
            empujarLasPistas();
        } catch (error) {
            // Cancelar el diálogo de compartir es un `NotAllowedError` y **no
            // es un fallo**: es alguien que se lo pensó mejor. Avisar ahí sería
            // regañar a quien pulsó «cancelar».
            if (!(error instanceof Error && error.name === "NotAllowedError")) {
                console.warn("[medios] no se pudo compartir la pantalla", error);
                alFallar?.(loQuePasoConElPermiso(error, "pantalla"));
            }
        } finally {
            setEstado((e) => ({ ...e, pidiendo: false }));
        }
    }, [alFallar, dejarDeCompartir, empujarLasPistas, rehacerElLocal]);

    /**
     * Una conexión que sale: se le montan los dos transceptores y se le
     * engancha lo que haya.
     *
     * **Audio primero y video después, siempre.** El orden de los transceptores
     * es el orden de las líneas `m=` del SDP, y en una malla las conexiones se
     * montan en momentos distintos con dispositivos distintos: si una punta
     * pusiera el video primero, esa conexión negociaría el video de uno contra
     * el audio del otro.
     */
    const prepararLaConexion = useCallback(
        (pc: RTCPeerConnection) => {
            conexionesRef.current.add(pc);
            pc.addTransceiver("audio", { direction: "sendrecv" });
            pc.addTransceiver("video", { direction: "sendrecv" });
            empujarLasPistas();
        },
        [empujarLasPistas],
    );

    /**
     * Una conexión que entra: los transceptores ya los creó la oferta del otro.
     *
     * Aquí lo único que hay que hacer es **ponerlos en `sendrecv`**. Sin esa
     * línea, quien contesta sin cámara negocia el video en `recvonly` y ya no
     * puede encenderla nunca sin renegociar — o sea, el botón de la cámara
     * dejaría de funcionar justo para quien entró con ella apagada, que es la
     * mitad de la gente.
     */
    const engancharALaConexion = useCallback(
        (pc: RTCPeerConnection) => {
            conexionesRef.current.add(pc);
            for (const t of pc.getTransceivers()) {
                if (t.direction !== "stopped") t.direction = "sendrecv";
            }
            empujarLasPistas();
        },
        [empujarLasPistas],
    );

    const olvidarLaConexion = useCallback((pc: RTCPeerConnection) => {
        conexionesRef.current.delete(pc);
    }, []);

    /**
     * Soltarlo todo.
     *
     * **Por todos los caminos**: colgar, que cuelguen, un fallo o cerrar la
     * pestaña. Un `getUserMedia` que no se para deja el piloto encendido y el
     * micro abierto, que es lo peor que puede dejarse una función así.
     */
    const soltarTodo = useCallback(() => {
        for (const s of [micRef.current, camaraRef.current, pantallaRef.current]) {
            s?.getTracks().forEach((t) => t.stop());
        }
        micRef.current = null;
        camaraRef.current = null;
        pantallaRef.current = null;
        conexionesRef.current.clear();
        localRef.current = null;
        setEstado({
            local: null,
            micEncendido: false,
            camaraEncendida: false,
            compartiendo: false,
            pidiendo: false,
        });
    }, []);

    // Y también al desmontar, pase lo que pase.
    useEffect(() => () => soltarTodo(), [soltarTodo]);

    return {
        ...estado,
        arrancar,
        alternarMic,
        alternarCamara,
        alternarPantalla,
        prepararLaConexion,
        engancharALaConexion,
        olvidarLaConexion,
        soltarTodo,
    };
}

/** Un `catch` que a propósito no hace nada: ver dónde se usa. */
function nada() {
    // `replaceTrack` rechaza cuando la conexión se cerró entre el `for` y la
    // llamada — o sea, alguien que colgó medio milisegundo antes. No es un
    // error que nadie tenga que ver, y tratarlo como tal llenaría la consola
    // justo cuando se está cerrando una reunión.
}
