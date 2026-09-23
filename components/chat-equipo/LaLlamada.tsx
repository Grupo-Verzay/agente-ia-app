"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
    GripVertical,
    Loader2,
    Mic,
    MicOff,
    Minimize2,
    MonitorUp,
    Phone,
    PhoneOff,
    ScreenShare,
    Video,
    VideoOff,
} from "lucide-react";
import {
    losMandosDeLaLlamada,
    meRechazaronElVideo,
    nombreDelModo,
    type ModoDeLlamada,
    type PeticionDeVideo,
} from "@/lib/modo-de-la-llamada";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
// El micro, la cámara y la pantalla son los MISMOS que los de la sala de
// video. Copiados, el día que se afine cómo se apaga la cámara se afina en una
// pantalla y la otra se queda atrás — y eso no se ve como un error, se ve como
// que «en las llamadas a veces la cámara no se apaga».
import { useMediosDeLlamada } from "@/hooks/useMediosDeLlamada";
import { useVentanaArrastrable } from "@/hooks/useVentanaArrastrable";
import {
    PastillaDeLlamada,
    VentanaDeLlamada,
} from "@/components/shared/VentanaDeLlamada";
import { esperarLosCandidatos } from "@/lib/webrtc-del-navegador";
import {
    CADA_CUANTO_ESCUCHA_MS,
    comoSeLeeLaDuracion,
    type FinDeLlamada,
} from "@/lib/llamada-de-voz";
import {
    contestarAction,
    contestarVideoAction,
    llamarAction,
    pedirVideoAction,
    losServidoresDeLlamadaAction,
    terminarAction,
} from "@/actions/llamadas-actions";

/**
 * Una llamada entre dos, de navegador a navegador. Con voz **y con video**.
 *
 * # La cámara empieza apagada, y encenderla no renegocia nada
 *
 * Es la decisión que hace que esto siga siendo una llamada y no una reunión:
 * se llama como siempre —suena, se contesta— y la cámara es un botón más,
 * junto al del micro. Quien quiera una videollamada la enciende; quien esté
 * andando por la calle, no.
 *
 * Y encenderla a mitad **no manda nada por el reloj**: los dos transceptores
 * —audio y video— se negocian en `sendrecv` desde la primera oferta, con pista
 * o sin ella, así que la cámara y la pantalla compartida entran por
 * `replaceTrack` dentro de una conexión ya hecha. Sin eso habría que
 * renegociar contra un reloj de tres segundos cada vez que alguien pulsa la
 * cámara, y eso son varios segundos de llamada cortada. Lo hace
 * `useMediosDeLlamada`, que es el mismo que usa la sala de video.
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
    modoInicial = "voz",
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
     * Voz o video, tal como se lanzó. Una de voz arranca en voz y ofrece
     * SUBIR a video; una videollamada arranca con la cámara encendida. Ver
     * `lib/modo-de-la-llamada.ts`.
     */
    modoInicial?: ModoDeLlamada;
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
    /**
     * El modo lo manda el SERVIDOR una vez la llamada está en curso: es lo que
     * hace que las dos puntas pasen a video a la vez, y solo cuando la otra
     * aceptó. Aquí se arranca con el de la llamada tal como se lanzó.
     */
    const [modo, setModo] = useState<ModoDeLlamada>(modoInicial);
    const modoRef = useRef<ModoDeLlamada>(modoInicial);
    modoRef.current = modo;
    /** La petición de subir a video, vista desde esta punta. */
    const [peticion, setPeticion] = useState<PeticionDeVideo>("nada");
    const peticionRef = useRef<PeticionDeVideo>("nada");
    const [pidiendoVideo, setPidiendoVideo] = useState(false);
    /**
     * Cuándo se pidió el video desde aquí.
     *
     * Una vuelta del reloj que salió ANTES de pedirlo vuelve diciendo «no hay
     * petición», y eso se leería como un rechazo que nadie ha dado. Durante
     * unos segundos después de pedir, ese «nada» no se cree.
     */
    const pedidoEnRef = useRef(0);
    /**
     * Arranca PLEGADA, y eso vale también para una llamada entrante.
     *
     * Una tarjeta grande encima de todo desde el primer segundo obliga a
     * plegarla a mano cada vez, y durante una llamada se trabaja. La pastilla
     * lleva el botón de contestar cuando la llamada entra, así que plegada no
     * significa que no se pueda coger.
     */
    const [minimizada, setMinimizada] = useState(true);
    /** Lo que llega del otro lado. Se monta a mano: ver `ontrack`. */
    const [remoto, setRemoto] = useState<MediaStream | null>(null);
    /** Si ahora mismo llega imagen. La pista se queda en `muted` al apagarla. */
    const [hayVideoRemoto, setHayVideoRemoto] = useState(false);
    const medios = useMediosDeLlamada({ alFallar: (m) => toast.error(m) });
    const pcRef = useRef<RTCPeerConnection | null>(null);
    const mediosRef = useRef(medios);
    mediosRef.current = medios;
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const propioRef = useRef<HTMLVideoElement | null>(null);
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
        // El micro, la cámara y la pantalla los suelta el hook, que es quien
        // los tiene. Con una copia de esa lógica aquí, el día que se añada otro
        // dispositivo se soltaría en una pantalla y en la otra no.
        mediosRef.current.soltarTodo();
        try {
            pcRef.current?.close();
        } catch {
            // Cerrar dos veces no es un error que nadie tenga que ver.
        }
        pcRef.current = null;
        setRemoto(null);
        setHayVideoRemoto(false);
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

    /**
     * Montar la conexión.
     *
     * La cámara se pide **apagada** (`arrancar(false)`): lo único que hace
     * falta para que suene una llamada es el micro, y pedir la cámara a quien
     * solo quería hablar es un permiso de más y un piloto encendido para nada.
     * Encenderla luego no cuesta ninguna renegociación.
     */
    const montar = useCallback(async (): Promise<RTCPeerConnection | null> => {
        const ice = await losServidoresDeLlamadaAction();
        if (!ice.success) {
            toast.error(ice.message);
            return null;
        }

        // Una videollamada arranca ya en video: la cámara se pide con el micro.
        // Una de voz, solo el micro — pedir la cámara a quien solo quería
        // hablar es un permiso de más y un piloto encendido para nada.
        if (!(await mediosRef.current.arrancar(modoRef.current === "video"))) {
            // Sin micro no hay llamada. El hook ya dijo por qué —permiso
            // denegado, sin dispositivo, ocupado por otra aplicación— con
            // palabras que se puedan usar.
            return null;
        }

        const pc = new RTCPeerConnection({ iceServers: ice.ice });
        pcRef.current = pc;
        pc.ontrack = (ev) => {
            // El stream se construye A MANO y no se coge de `ev.streams[0]`.
            //
            // Al pasar a `addTransceiver` —que es lo que permite negociar el
            // video desde el principio— ya no hay stream asociado, así que
            // `ev.streams` llega **vacío**. Con el código de antes, el audio se
            // quedaría mudo con la conexión perfectamente establecida: el peor
            // fallo posible, porque todo lo demás dice que va bien.
            const stream = (() => {
                const actual = audioRef.current?.srcObject;
                return actual instanceof MediaStream ? actual : new MediaStream();
            })();
            if (!stream.getTracks().includes(ev.track)) stream.addTrack(ev.track);
            if (audioRef.current) audioRef.current.srcObject = stream;
            setRemoto(stream);

            if (ev.track.kind === "video") {
                // Si el otro apaga la cámara, su pista se queda en `muted`: eso
                // sí viaja por la conexión, al revés que el micro. Es lo que
                // decide al instante si se pinta el video o no.
                const mirar = () =>
                    setHayVideoRemoto(!ev.track.muted && ev.track.readyState === "live");
                ev.track.addEventListener("mute", mirar);
                ev.track.addEventListener("unmute", mirar);
                ev.track.addEventListener("ended", mirar);
                mirar();
            }
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

            // Los dos transceptores, audio y video, en `sendrecv` y SIEMPRE.
            // Es lo que permite encender la cámara a mitad de llamada sin
            // renegociar nada. Sustituye al `offerToReceiveAudio`, que solo
            // pedía audio y dejaba la llamada sin sitio para el video.
            mediosRef.current.prepararLaConexion(pc);
            const oferta = await pc.createOffer();
            await pc.setLocalDescription(oferta);
            await esperarLosCandidatos(pc);

            const res = await llamarAction(
                canalId,
                JSON.stringify(pc.localDescription),
                modoRef.current,
            );
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
            // DESPUÉS de aplicar la oferta: los transceptores los creó ella, y
            // lo único que falta es ponerlos en `sendrecv` y engancharles lo
            // propio. Sin esta línea, quien contesta negocia el video en
            // `recvonly` y **su** botón de cámara deja de funcionar para toda
            // la llamada — que es justo la mitad de la gente.
            mediosRef.current.engancharALaConexion(pc);
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

    // ── Voz o video, según diga el servidor ─────────────────────────────────
    //
    // Llega por el mismo reloj que la respuesta. Tres cosas pasan aquí:
    //
    // 1. **Pasar a video enciende la cámara**, en las dos puntas, y solo
    //    cuando el servidor dice que el otro aceptó. Dentro de la MISMA
    //    conexión: el video ya está negociado desde la primera oferta, así que
    //    la llamada no se corta ni un segundo.
    // 2. **Una petición del otro despliega la ventana.** Plegada, la pregunta
    //    no se vería y el otro se quedaría esperando una respuesta que nadie
    //    lee.
    // 3. **Un rechazo se dice** a quien lo pidió: sin eso el botón volvería a
    //    su sitio sin explicar por qué no pasó nada.
    useEffect(() => {
        const alCambiar = (e: Event) => {
            const d = (e as CustomEvent<{
                id: string;
                modo: ModoDeLlamada;
                peticion: PeticionDeVideo;
            }>).detail;
            if (!d || d.id !== idRef.current || cerradoRef.current) return;

            const antes = peticionRef.current;
            const vueltaVieja =
                antes === "esperando" &&
                d.peticion === "nada" &&
                d.modo === "voz" &&
                Date.now() - pedidoEnRef.current < 2 * CADA_CUANTO_ESCUCHA_MS;
            if (vueltaVieja) return;
            if (meRechazaronElVideo(antes, d.peticion, d.modo)) {
                toast.message(`${conQuien} prefiere seguir solo con voz.`);
            }
            peticionRef.current = d.peticion;
            setPeticion(d.peticion);
            if (d.peticion === "decidir" && antes !== "decidir") setMinimizada(false);

            if (d.modo === "video" && modoRef.current !== "video") {
                modoRef.current = "video";
                setModo("video");
                if (!mediosRef.current.camaraEncendida) {
                    void mediosRef.current.alternarCamara();
                }
            }
        };
        window.addEventListener("llamada:estado", alCambiar);
        return () => window.removeEventListener("llamada:estado", alCambiar);
    }, [conQuien]);

    /** Pedir subir a video. La cámara NO se enciende hasta que el otro acepte. */
    const pedirVideo = useCallback(async () => {
        const id = idRef.current;
        if (!id || pidiendoVideo) return;
        setPidiendoVideo(true);
        try {
            const res = await pedirVideoAction(id);
            if (!res.success) {
                toast.error(res.message);
                return;
            }
            // Se pinta al momento: el reloj lo confirmaría en su vuelta, pero
            // un botón que no cambia al pulsarlo se pulsa cinco veces.
            pedidoEnRef.current = Date.now();
            peticionRef.current = "esperando";
            setPeticion("esperando");
        } catch (error) {
            console.warn("[llamadas] no se pudo pedir el video", error);
            toast.error("No se pudo pedir el video.");
        } finally {
            setPidiendoVideo(false);
        }
    }, [pidiendoVideo]);

    /** Contestar la petición del otro. Aceptar enciende la cámara aquí mismo. */
    const contestarVideo = useCallback(async (acepta: boolean) => {
        const id = idRef.current;
        if (!id) return;
        peticionRef.current = "nada";
        setPeticion("nada");
        try {
            const res = await contestarVideoAction(id, acepta);
            if (!res.success) {
                toast.error(res.message);
                return;
            }
            if (acepta) {
                modoRef.current = "video";
                setModo("video");
                if (!mediosRef.current.camaraEncendida) {
                    await mediosRef.current.alternarCamara();
                }
            }
        } catch (error) {
            console.warn("[llamadas] no se pudo contestar el video", error);
            toast.error("No se pudo contestar.");
        }
    }, []);

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

    // Los dos `<video>` se enganchan aquí y solo si cambió: reasignar el mismo
    // `srcObject` reinicia la reproducción y hace parpadear la imagen en cada
    // repintado.
    useEffect(() => {
        const el = videoRef.current;
        if (el && el.srcObject !== remoto) el.srcObject = remoto;
    }, [remoto, hayVideoRemoto]);

    useEffect(() => {
        const el = propioRef.current;
        if (el && el.srcObject !== medios.local) el.srcObject = medios.local;
    }, [medios.local]);

    /** Si hay algo de imagen, de cualquiera de los dos lados. */
    const hayImagen =
        modo === "video" &&
        estado === "hablando" &&
        (hayVideoRemoto || Boolean(medios.local));
    /** Los mandos de este momento: los decide el modo, no la pantalla. */
    const mandos = losMandosDeLaLlamada(modo, estado === "hablando");

    // ── Arrastrar y minimizar ───────────────────────────────────────────────
    //
    // Se puede mover **desde el primer momento**, y no solo conectada como
    // antes. El motivo de aquella condición era que «arrastrar una llamada
    // entrante añade formas de no darle a Contestar»; con la pastilla siendo lo
    // que se ve desde el principio, no poder apartarla es peor — y Contestar
    // está fuera del asa, así que el gesto no compite con el botón.
    //
    // El cómo se arrastra vive en `useVentanaArrastrable`, que comparte con la
    // llamada de WhatsApp y con el panel de una reunión: la captura del
    // puntero, el `touch-none` y el volver a meterla en pantalla costaron una
    // vuelta cada uno y no pueden estar escritos en tres sitios.
    /**
     * Si se puede plegar a la pastilla.
     *
     * En cualquier estado menos cerrando: la pastilla ya es lo que se ve al
     * empezar, así que desplegada y sin forma de volver a plegarla la tarjeta
     * se queda tapando la pantalla el resto de la llamada.
     */
    const sePuedePlegar = estado !== "cerrando";
    const { cajaRef, estilo, asa, posicion } = useVentanaArrastrable({
        activa: true,
        // Plegar y desplegar cambia el alto: una barra pegada al borde de
        // abajo se saldría por ahí al desplegarse, y fuera está el de colgar.
        tamano: `${minimizada}-${modo}`,
    });

    const rotulo =
        estado === "hablando"
            ? modo === "video"
                ? "En videollamada"
                : "En llamada"
            : estado === "conectando"
              ? "Conectando…"
              : entrante
                ? `${nombreDelModo(modo)} entrante`
                : "Llamando…";

    return (
        // La caja de fuera, la pastilla al plegarla y el contrato del
        // `<audio>` viven en `components/shared/VentanaDeLlamada.tsx`: los usan
        // esta llamada y la de WhatsApp en Chats. Con una copia en cada sitio,
        // el día que se afine el arrastre se afina en una y la otra se queda
        // atrás — y eso no se ve como un error, se ve como que «en Chats la
        // llamada a veces no se deja mover».
        <VentanaDeLlamada
            cajaRef={cajaRef}
            estilo={estilo}
            posicion={posicion}
            ancho={
                minimizada
                    ? "w-fit"
                    : hayImagen
                      ? // Con imagen la tarjeta crece: 22rem es un recuadro de
                        // video de sello de correos. No es `w-full` porque esto
                        // flota encima del trabajo de alguien.
                        "w-[min(92vw,32rem)]"
                      : "w-[min(92vw,22rem)]"
            }
        >
            {/* El `<audio>` y el `<video>` viven AQUÍ FUERA y no se mueven
                nunca. Metidos dentro de la rama de plegado, plegar la llamada
                los desmontaría y con ellos se iría el `srcObject`: la llamada
                seguiría abierta y muda, y con la imagen en negro. */}
            <audio ref={audioRef} autoPlay className="hidden" />

            {minimizada ? (
                <PastillaDeLlamada
                    asa={asa}
                    segundos={segundos}
                    conQuien={conQuien}
                    // Mientras no se hable no hay nada que contar: el contador
                    // a «00:00» se lee como una llamada conectada y muda.
                    rotulo={estado === "hablando" ? undefined : rotulo}
                    // Solo en una entrante que todavía suena. Sin esto, una
                    // llamada que entra plegada no se podría coger.
                    onContestar={
                        entrante && estado === "sonando"
                            ? () => void contestar()
                            : undefined
                    }
                    onAmpliar={() => setMinimizada(false)}
                    onColgar={() => void terminar("contestada")}
                />
            ) : (
                <div className="flex flex-col gap-3 p-3" data-llamada="tarjeta">
                    {/* La barra de ARRIBA, y el botón de plegar en ella.
                      *
                      * Antes iba `absolute` en la esquina, encima de la tarjeta.
                      * Con la imagen puesta esa esquina es el VIDEO: un botón
                      * fantasma de icono oscuro sobre un recuadro casi negro no
                      * se ve, y la tarjeta se quedaba grande sin forma aparente
                      * de volver a la pastilla. Ahora va en su propia fila, con
                      * el fondo de la tarjeta detrás, y en el MISMO sitio que el
                      * de ampliar de la pastilla: el extremo derecho de la fila
                      * de arriba. Plegar y ampliar son el mismo gesto de ida y
                      * vuelta, así que el dedo va al mismo sitio.
                      *
                      * Y FUERA del asa: el asa captura el puntero al agarrarla y
                      * el `click` de un botón de dentro no llegaría a salir. */}
                    <div className="flex items-start gap-1">
                        {/* Contrapeso del botón de la derecha: sin él, el
                            nombre no queda centrado en la tarjeta. */}
                        {sePuedePlegar ? (
                            <span className="-ml-1.5 h-8 w-8 shrink-0" aria-hidden />
                        ) : null}
                        <div
                            {...asa}
                            className={cn(
                                "flex min-w-0 flex-1 flex-col items-center gap-1 rounded-lg py-1 text-center",
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
                        {sePuedePlegar ? (
                            <Button
                                variant="ghost"
                                size="icon"
                                // El negativo lo pone a la MISMA distancia del
                                // borde que el de ampliar en la pastilla (6 px
                                // a la derecha, 4 arriba): sin él quedaría 6 px
                                // más adentro y el dedo no lo encuentra donde
                                // estaba.
                                className="-mr-1.5 -mt-2 h-8 w-8 shrink-0"
                                onClick={() => setMinimizada(true)}
                                aria-label="Plegar la llamada"
                                title="Plegar la llamada"
                                data-mando="plegar"
                            >
                                <Minimize2 className="h-4 w-4" />
                            </Button>
                        ) : null}
                    </div>

                    {/* La imagen, solo en video y cuando la hay. En voz la
                        tarjeta no reserva sitio para un recuadro negro. */}
                    {hayImagen ? (
                        <div className="relative overflow-hidden rounded-lg bg-zinc-900">
                            <video
                                ref={videoRef}
                                autoPlay
                                playsInline
                                className={cn(
                                    "aspect-video w-full",
                                    hayVideoRemoto ? "" : "invisible",
                                )}
                            />
                            {!hayVideoRemoto ? (
                                <span className="absolute inset-0 flex items-center justify-center text-xs text-zinc-400">
                                    {conQuien} tiene la cámara apagada
                                </span>
                            ) : null}
                            {/* El recuadro propio, pequeño y en una esquina.
                                Va en espejo porque uno se ve como en un
                                espejo; lo que se comparte NO, o el texto de la
                                pantalla saldría al revés. */}
                            {medios.local ? (
                                <video
                                    ref={propioRef}
                                    autoPlay
                                    playsInline
                                    muted
                                    className={cn(
                                        "absolute bottom-2 right-2 h-16 w-24 rounded border border-zinc-700 bg-zinc-950 object-cover",
                                        medios.compartiendo ? "" : "-scale-x-100",
                                    )}
                                />
                            ) : null}
                        </div>
                    ) : null}

                    {/* El otro quiere pasar a video: se decide aquí. Nadie
                        enciende la cámara hasta que esta punta acepte. */}
                    {estado === "hablando" && peticion === "decidir" ? (
                        <div
                            className="flex flex-col gap-2 rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm dark:border-sky-900 dark:bg-sky-950/40"
                            data-llamada="peticion-de-video"
                        >
                            <span>{conQuien} quiere pasar a videollamada.</span>
                            <div className="flex justify-end gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => void contestarVideo(false)}
                                >
                                    Seguir con voz
                                </Button>
                                <Button
                                    size="sm"
                                    className="bg-sky-600 text-white hover:bg-sky-700"
                                    onClick={() => void contestarVideo(true)}
                                >
                                    Aceptar video
                                </Button>
                            </div>
                        </div>
                    ) : null}

                    <div className="flex items-center justify-center gap-3" data-llamada="mandos">
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
                            // Los mandos salen de `losMandosDeLaLlamada`: en voz
                            // NO hay cámara ni pantalla compartida, hay «subir a
                            // video»; en video, cámara y pantalla. Con la lista
                            // escrita aquí es como la pantalla compartida acabó
                            // saliendo en una llamada de voz.
                            mandos.map((m) => {
                                switch (m) {
                                    case "micro":
                                        return (
                                            <MandoDeLlamada
                                                key={m}
                                                encendido={medios.micEncendido}
                                                onClick={medios.alternarMic}
                                                rotuloEncendido="Silenciar"
                                                rotuloApagado="Activar el micrófono"
                                                Icono={Mic}
                                                IconoApagado={MicOff}
                                            />
                                        );
                                    case "camara":
                                        return (
                                            <MandoDeLlamada
                                                key={m}
                                                encendido={medios.camaraEncendida}
                                                onClick={() => void medios.alternarCamara()}
                                                rotuloEncendido="Apagar la cámara"
                                                rotuloApagado="Encender la cámara"
                                                Icono={Video}
                                                IconoApagado={VideoOff}
                                                ocupado={medios.pidiendo}
                                            />
                                        );
                                    case "pantalla":
                                        return (
                                            <MandoDeLlamada
                                                key={m}
                                                encendido={medios.compartiendo}
                                                onClick={() => void medios.alternarPantalla()}
                                                rotuloEncendido="Dejar de compartir"
                                                rotuloApagado="Compartir la pantalla"
                                                Icono={MonitorUp}
                                                IconoApagado={ScreenShare}
                                                alReves
                                            />
                                        );
                                    case "subirAVideo": {
                                        const esperando = peticion === "esperando";
                                        const rotuloSubir = esperando
                                            ? `Esperando a que ${conQuien} acepte el video`
                                            : "Pasar a videollamada";
                                        return (
                                            <Button
                                                key={m}
                                                variant="ghost"
                                                size="icon"
                                                className={cn(
                                                    "h-12 w-12 rounded-full border border-border bg-background hover:bg-muted",
                                                    esperando && "animate-pulse",
                                                )}
                                                onClick={() => void pedirVideo()}
                                                disabled={esperando || pidiendoVideo}
                                                aria-label={rotuloSubir}
                                                title={rotuloSubir}
                                                data-mando="subir-a-video"
                                            >
                                                {pidiendoVideo ? (
                                                    <Loader2 className="h-5 w-5 animate-spin" />
                                                ) : (
                                                    <Video className="h-5 w-5" />
                                                )}
                                            </Button>
                                        );
                                    }
                                    case "colgar":
                                        return (
                                            <Button
                                                key={m}
                                                variant="destructive"
                                                size="icon"
                                                className="h-12 w-12 rounded-full"
                                                onClick={() => void terminar("contestada")}
                                                aria-label="Colgar"
                                            >
                                                <PhoneOff className="h-5 w-5" />
                                            </Button>
                                        );
                                }
                            })
                        )}
                    </div>
                </div>
            )}
        </VentanaDeLlamada>
    );
}

/**
 * Un mando de la llamada: encendido, apagado, y lo que dice cada uno.
 *
 * Los tres estados de color no son decoración: el micro y la cámara **apagados
 * se pintan en rojo** porque apagados es el estado del que hay que acordarse —
 * el clásico «llevo dos minutos hablando en silencio»—; compartir es al revés,
 * porque lo que hay que notar es que se está compartiendo.
 */
function MandoDeLlamada({
    encendido,
    onClick,
    rotuloEncendido,
    rotuloApagado,
    Icono,
    IconoApagado,
    ocupado = false,
    alReves = false,
}: {
    encendido: boolean;
    onClick: () => void;
    rotuloEncendido: string;
    rotuloApagado: string;
    Icono: typeof Mic;
    IconoApagado: typeof MicOff;
    ocupado?: boolean;
    alReves?: boolean;
}) {
    const rotulo = encendido ? rotuloEncendido : rotuloApagado;
    const Pintar = encendido ? Icono : IconoApagado;
    return (
        <Button
            variant="ghost"
            size="icon"
            className={cn(
                "h-12 w-12 rounded-full",
                alReves
                    ? encendido
                        ? "bg-sky-600 text-white hover:bg-sky-700"
                        : "border border-border bg-background hover:bg-muted"
                    : encendido
                      ? "border border-border bg-background hover:bg-muted"
                      : "bg-red-600 text-white hover:bg-red-700",
            )}
            onClick={onClick}
            disabled={ocupado}
            aria-pressed={encendido}
            aria-label={rotulo}
            title={rotulo}
        >
            {ocupado ? (
                <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
                <Pintar className="h-5 w-5" />
            )}
        </Button>
    );
}
