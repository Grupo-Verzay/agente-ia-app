"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { ElFondoDeVideo, type FondoElegido, type ModoDeFondo } from "@/lib/fondo-de-video";
import {
    guardarLaSupresion,
    laRestriccionDeAudio,
    leerLaSupresion,
    seAplico,
} from "@/lib/supresion-de-ruido";

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
    /**
     * Qué fondo lleva la cámara: nada, desenfocado, o sustituido.
     *
     * Vive aquí y no en la pantalla porque **decide qué pista viaja**: con el
     * fondo encendido lo que sale por las seis conexiones de la malla no es la
     * cámara, es el canvas. Dos sitios decidiendo eso no se ve como un error,
     * se ve como que a veces se manda la cámara sin desenfocar.
     */
    fondo: ModoDeFondo;
    /**
     * Cuál fondo de sustitución está puesto: el id de un preset, `"subida"` si
     * es una imagen propia, o `null`. Solo para que el menú marque el activo;
     * los demás no lo necesitan —el fondo va horneado en la pista del canvas—.
     */
    fondoId: string | null;
    /** Mientras se carga el modelo, que la primera vez son 6 MB. */
    preparandoElFondo: boolean;
    /** Lo que se ve en el recuadro propio. Cambia al encender o compartir. */
    local: MediaStream | null;
    /**
     * El micrófono propio, suelto, para quien necesite MEZCLARLO.
     *
     * Aparte de `local` y no dentro, porque `local` es **lo que se pinta** y ahí
     * el audio propio no puede estar: el recuadro va con `muted`, pero el día
     * que alguien se lo quite se oiría a sí mismo con retardo, que es lo más
     * desagradable que puede hacer una videollamada.
     *
     * Y hace falta de verdad: la grabación mezcla a todo el mundo, y sin esto
     * **quien graba no sale en su propia grabación**. Con una sola persona en
     * la sala eso es un fichero de cero bytes, que es el peor final posible
     * porque el botón dice que funcionó.
     */
    miAudio: MediaStream | null;
    micEncendido: boolean;
    camaraEncendida: boolean;
    compartiendo: boolean;
    /**
     * Si el micrófono va con supresión de ruido, procesada por el navegador
     * sobre su propia pista. Vive aquí y no en la pantalla porque es lo que
     * decide con qué restricción se pide el micro y sobre qué pista se aplica.
     */
    supresionDeRuido: boolean;
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
    /**
     * Cambiar el fondo de la cámara.
     *
     * **Nunca lanza.** Si el modelo no carga —red, un navegador sin SIMD— se
     * queda en `ninguno` y se dice: es preferible mandar la cámara sin
     * desenfocar que no mandar nada. Quien llama no tiene que envolverlo en un
     * `try`, que es donde se olvida.
     */
    cambiarElFondo: (modo: ModoDeFondo, fondo?: FondoElegido) => Promise<void>;
    /**
     * Encender o quitar la supresión de ruido del micrófono.
     *
     * **Nunca lanza.** Se intenta en caliente sobre la misma pista
     * (`applyConstraints`, que no toca la malla); si el navegador no la deja
     * cambiar así, se re-pide el micro con la restricción y se empuja con
     * `replaceTrack`. La elección se recuerda en el navegador. Quien llama no
     * tiene que envolverlo en un `try`.
     */
    cambiarSupresion: (activada: boolean) => Promise<void>;
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

    // Inicializador perezoso: lee la preferencia del navegador UNA vez, no en
    // cada render. En el servidor `window` no existe y `leerLaSupresion` cae al
    // valor por defecto sin romper el render.
    const [estado, setEstado] = useState<EstadoDeLosMedios>(() => ({
        local: null,
        miAudio: null,
        micEncendido: false,
        camaraEncendida: false,
        compartiendo: false,
        supresionDeRuido: leerLaSupresion(),
        pidiendo: false,
        fondo: "ninguno",
        fondoId: null,
        preparandoElFondo: false,
    }));

    /** El micro. Vive toda la llamada; callarse es `enabled`, no soltarlo. */
    const micRef = useRef<MediaStream | null>(null);
    /**
     * La supresión de ruido de AHORA, por referencia, para leerla dentro de
     * callbacks (`arrancar`, `reabrirMic`) sin volver a crearlos ni depender del
     * estado. Se arranca con lo que se recuerda del navegador.
     */
    const supresionRef = useRef<boolean>(leerLaSupresion());
    /** La cámara, cuando está encendida. Apagarla la para de verdad. */
    const camaraRef = useRef<MediaStream | null>(null);
    /** La pantalla compartida, mientras se comparte. */
    const pantallaRef = useRef<MediaStream | null>(null);
    /** Las conexiones a las que hay que empujarles lo que se manda. */
    const conexionesRef = useRef<Set<RTCPeerConnection>>(new Set());
    /** Lo que se está enseñando de uno mismo, para el recuadro propio. */
    const localRef = useRef<MediaStream | null>(null);
    /** El motor del fondo. Se crea perezosamente: quien no lo use no lo paga. */
    const fondoRef = useRef<ElFondoDeVideo | null>(null);
    /** La pista que sale del canvas, cuando el fondo está encendido. */
    const pistaConFondoRef = useRef<MediaStreamTrack | null>(null);

    /**
     * La pista de video que toca mandar AHORA.
     *
     * El orden es **pantalla > cámara con fondo > cámara**, y las dos primeras
     * no compiten por casualidad: compartir pantalla ocupa la única pista de
     * video que hay, así que mientras se comparte no se manda la cámara — ni
     * con fondo ni sin él. Desenfocar una pantalla compartida además no tendría
     * ningún sentido: el modelo busca una persona y ahí no hay ninguna.
     */
    const laPistaDeVideo = useCallback((): MediaStreamTrack | null => {
        const pantalla = pantallaRef.current?.getVideoTracks()[0];
        if (pantalla) return pantalla;
        const conFondo = pistaConFondoRef.current;
        // Una pista procesada que ya terminó no se manda: dejaría a la otra
        // punta mirando el último fotograma congelado. Se cae a la cámara.
        if (conFondo && conFondo.readyState === "live") return conFondo;
        return camaraRef.current?.getVideoTracks()[0] ?? null;
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
        // El micrófono va en su propio stream, que es el que se puede mezclar
        // sin que nadie lo pinte.
        const soloMic = audio ? new MediaStream([audio]) : null;
        setEstado((e) => ({
            ...e,
            local: video ? nuevo : null,
            miAudio: soloMic,
            micEncendido: Boolean(audio?.enabled),
            camaraEncendida: Boolean(camaraRef.current?.getVideoTracks()[0]),
            compartiendo: Boolean(pantallaRef.current?.getVideoTracks()[0]),
        }));
    }, [laPistaDeAudio, laPistaDeVideo]);

    /**
     * Apagar el fondo y soltar su pista.
     *
     * **Por todos los caminos**: el botón, apagar la cámara, soltarlo todo y el
     * desmontaje. Con un camino que no suelte queda un bucle pintando
     * veinticuatro veces por segundo sobre una reunión que ya terminó, y una
     * pista de canvas viva que la otra punta sigue recibiendo congelada.
     */
    const apagarElFondo = useCallback(() => {
        fondoRef.current?.apagar();
        pistaConFondoRef.current = null;
    }, []);

    /**
     * La última elección de fondo, ENTERA (modo y qué fondo), por referencia.
     *
     * `alternarCamara` la lee para volver a poner el fondo al reencender la
     * cámara, y no puede depender de ella en sus dependencias. Guardar solo el
     * modo perdería qué preset o qué imagen estaba puesta.
     */
    const ultimaEleccionRef = useRef<{ modo: ModoDeFondo; fondo?: FondoElegido }>({
        modo: "ninguno",
    });

    /**
     * Cambiar el fondo de la cámara.
     *
     * Dos cosas que no son obvias y las dos son de las que se olvidan:
     *
     * 1. **Sin cámara no hay fondo que poner.** Se guarda la elección igual,
     *    para que al encender la cámara se aplique sola — al revés, quien
     *    elige el desenfoque con la cámara apagada vería que su botón no hace
     *    nada y volvería a pulsarlo.
     * 2. **Nunca lanza.** Si el modelo no carga se deja en `ninguno`, se manda
     *    la cámara de siempre y se dice. Un botón que revienta la reunión por
     *    no poder desenfocar es mucho peor que uno que no desenfoca.
     */
    /** El id que se enseña en el menú a partir de la elección. */
    const idDelFondo = (modo: ModoDeFondo, fondo?: FondoElegido): string | null => {
        if (modo !== "fondo") return null;
        if (fondo?.tipo === "imagen") return "subida";
        return fondo?.tipo === "preset" ? fondo.id : (ultimaEleccionRef.current.fondo?.tipo === "preset" ? ultimaEleccionRef.current.fondo.id : null);
    };

    const cambiarElFondo = useCallback(
        async (modo: ModoDeFondo, fondo?: FondoElegido) => {
            if (modo === "ninguno") {
                ultimaEleccionRef.current = { modo: "ninguno" };
                apagarElFondo();
                setEstado((e) => ({ ...e, fondo: "ninguno", fondoId: null }));
                rehacerElLocal();
                empujarLasPistas();
                return;
            }

            // Se recuerda la elección ENTERA —modo y qué fondo— para volver a
            // ponerla si se apaga y enciende la cámara. Con solo el modo, subir
            // una imagen y apagar la cámara la perdería en silencio.
            ultimaEleccionRef.current = { modo, fondo: fondo ?? ultimaEleccionRef.current.fondo };

            const camara = camaraRef.current?.getVideoTracks()[0];
            if (!camara) {
                // La elección se recuerda y se aplicará al encender la cámara.
                setEstado((e) => ({ ...e, fondo: modo, fondoId: idDelFondo(modo, fondo) }));
                return;
            }

            setEstado((e) => ({ ...e, preparandoElFondo: true }));
            try {
                if (!fondoRef.current) fondoRef.current = new ElFondoDeVideo();
                const procesada = await fondoRef.current.encender(
                    camara,
                    modo,
                    ultimaEleccionRef.current.fondo,
                );
                pistaConFondoRef.current = procesada;
                setEstado((e) => ({ ...e, fondo: modo, fondoId: idDelFondo(modo, fondo) }));
                rehacerElLocal();
                empujarLasPistas();
            } catch (error) {
                console.warn("[medios] no se pudo poner el fondo", error);
                apagarElFondo();
                setEstado((e) => ({ ...e, fondo: "ninguno", fondoId: null }));
                rehacerElLocal();
                empujarLasPistas();
                alFallar?.(
                    "No se pudo preparar el fondo. Tu navegador o tu conexión no pudieron con el modelo.",
                );
            } finally {
                setEstado((e) => ({ ...e, preparandoElFondo: false }));
            }
        },
        [alFallar, apagarElFondo, empujarLasPistas, rehacerElLocal],
    );

    /** Para poder llamarlo desde `alternarCamara` sin ordenar las definiciones. */
    const cambiarElFondoRef = useRef(cambiarElFondo);
    cambiarElFondoRef.current = cambiarElFondo;

    const arrancar = useCallback(
        async (conVideo: boolean): Promise<boolean> => {
            setEstado((e) => ({ ...e, pidiendo: true }));
            try {
                if (!micRef.current) {
                    try {
                        // El micro se pide con la supresión que se recuerda, así
                        // que la elección se respeta desde el primer segundo.
                        micRef.current = await navigator.mediaDevices.getUserMedia({
                            audio: laRestriccionDeAudio(supresionRef.current),
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

    /**
     * El respaldo cuando el navegador no deja cambiar la supresión en caliente:
     * se vuelve a pedir el micro con la restricción y se empuja la pista nueva.
     *
     * Conserva si estaba silenciado —re-pedir el micro trae una pista nueva
     * `enabled = true`, así que sin esto quitar la supresión desmutearía a
     * quien estaba callado—. Y va con `replaceTrack` (dentro de
     * `empujarLasPistas`): la malla no se renegocia.
     */
    const reabrirMicConSupresion = useCallback(
        async (activada: boolean) => {
            const anterior = micRef.current?.getAudioTracks()[0];
            const estabaSilenciado = anterior ? !anterior.enabled : false;
            try {
                const nuevo = await navigator.mediaDevices.getUserMedia({
                    audio: laRestriccionDeAudio(activada),
                });
                const nuevaPista = nuevo.getAudioTracks()[0];
                if (nuevaPista) nuevaPista.enabled = !estabaSilenciado;
                micRef.current?.getTracks().forEach((t) => t.stop());
                micRef.current = nuevo;
                rehacerElLocal();
                empujarLasPistas();
            } catch (error) {
                console.warn("[medios] no se pudo re-pedir el micrófono", error);
                alFallar?.(loQuePasoConElPermiso(error, "micrófono"));
            }
        },
        [alFallar, empujarLasPistas, rehacerElLocal],
    );

    /**
     * Encender o quitar la supresión de ruido.
     *
     * La preferencia se guarda SIEMPRE, haya micro o no: sin micro todavía, la
     * elección se aplicará al arrancar —igual que el fondo—. Con micro, se
     * intenta en caliente sobre la misma pista (no toca la malla) y solo se
     * re-pide el micro si el navegador dice, en claro, que no la cambió.
     */
    const cambiarSupresion = useCallback(
        async (activada: boolean) => {
            supresionRef.current = activada;
            guardarLaSupresion(activada);
            setEstado((e) => ({ ...e, supresionDeRuido: activada }));

            const pista = laPistaDeAudio();
            if (!pista) return; // se aplicará al arrancar el micro

            try {
                await pista.applyConstraints(laRestriccionDeAudio(activada));
                const obtenido = pista.getSettings().noiseSuppression;
                if (seAplico(obtenido, activada)) return;
            } catch (error) {
                console.warn(
                    "[medios] applyConstraints de supresión falló; re-pido el micro",
                    error,
                );
            }
            await reabrirMicConSupresion(activada);
        },
        [laPistaDeAudio, reabrirMicConSupresion],
    );

    const alternarCamara = useCallback(async () => {
        if (camaraRef.current) {
            // El fondo se apaga PRIMERO: come de la pista de la cámara, así
            // que dejarlo corriendo sobre una pista parada son veinticuatro
            // fotogramas por segundo pintando lo mismo congelado.
            apagarElFondo();
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
            // Y si había un fondo elegido, se vuelve a poner —con su preset o
            // su imagen—. Sin esto, apagar y encender la cámara lo pierde en
            // silencio: el botón sigue pintado como encendido y lo que se manda
            // es la cámara pelada.
            const ultima = ultimaEleccionRef.current;
            if (ultima.modo !== "ninguno") {
                void cambiarElFondoRef.current(ultima.modo, ultima.fondo);
            }
        } catch (error) {
            console.warn("[medios] no se pudo encender la cámara", error);
            alFallar?.(loQuePasoConElPermiso(error, "cámara"));
        } finally {
            setEstado((e) => ({ ...e, pidiendo: false }));
        }
    }, [alFallar, apagarElFondo, empujarLasPistas, rehacerElLocal]);

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
        // El fondo primero: su bucle lee la pista de la cámara, y pararla por
        // debajo deja el bucle girando sobre nada.
        fondoRef.current?.apagar();
        fondoRef.current = null;
        pistaConFondoRef.current = null;
        for (const s of [micRef.current, camaraRef.current, pantallaRef.current]) {
            s?.getTracks().forEach((t) => t.stop());
        }
        micRef.current = null;
        camaraRef.current = null;
        pantallaRef.current = null;
        conexionesRef.current.clear();
        localRef.current = null;
        ultimaEleccionRef.current = { modo: "ninguno" };
        // La supresión SÍ se recuerda entre reuniones: es una preferencia del
        // micrófono, no del momento. Se relee del navegador, que es donde vive.
        supresionRef.current = leerLaSupresion();
        setEstado({
            local: null,
            miAudio: null,
            micEncendido: false,
            camaraEncendida: false,
            compartiendo: false,
            supresionDeRuido: supresionRef.current,
            pidiendo: false,
            // El fondo elegido SÍ se olvida al soltarlo todo: soltarlo todo es
            // el final de una reunión, y la próxima empieza de cero. Lo que se
            // recuerda entre reuniones vive en `localStorage`, no aquí.
            fondo: "ninguno",
            fondoId: null,
            preparandoElFondo: false,
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
        cambiarElFondo,
        cambiarSupresion,
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
