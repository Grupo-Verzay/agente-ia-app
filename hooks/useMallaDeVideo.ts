"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
    CADA_CUANTO_EN_LA_PUERTA_MS,
    CADA_CUANTO_EN_LA_SALA_MS,
    comoQuedaLaMalla,
    debeOfrecer,
    hayVideoDelRemoto,
} from "@/lib/sala-de-video";
import {
    CUANDO_NO_SE_PUDO_VOLVER,
    comoSeLeeLaReconexion,
    estaMuertaLaConexion,
    hayQueRendirse,
    laConexionEsDeOtraSesion,
} from "@/lib/reconexion-de-la-sala";
import { esperarLosCandidatos } from "@/lib/webrtc-del-navegador";
import {
    enviarSenalAction,
    latidoDeLaSalaAction,
    volverAEntrarAction,
    type MensajeDeLaSala,
    type QuienEstaEnLaSala,
} from "@/actions/salas-de-video-actions";
import type { MediosDeLlamada } from "@/hooks/useMediosDeLlamada";

/**
 * La malla: una conexión con cada persona de la sala, montada sobre el reloj.
 *
 * # Quién ofrece, y por qué no puede decidirse con el reloj
 *
 * En una malla, cada pareja tiene que ponerse de acuerdo en quién hace la
 * oferta **sin hablar antes**. Si ofrecen los dos, las dos ofertas chocan
 * (*glare*) y no se conecta; si no ofrece ninguno, tampoco.
 *
 * Lo decide `debeOfrecer`, comparando los ids: **ofrece el menor**. Es puro y
 * no depende del orden de llegada, que es justo lo que aquí no se puede usar:
 * dos personas que entran en la misma vuelta se descubren cada una en su propio
 * ciclo, y con «ofrece el que llegó antes» las dos podrían creerse la segunda.
 *
 * # Y cada conexión se negocia UNA vez
 *
 * Los dos transceptores se abren en `sendrecv` desde el principio, con pista o
 * sin ella (ver `useMediosDeLlamada`), así que encender la cámara o compartir
 * la pantalla no vuelve a mandar nada por el reloj. Una oferta, una respuesta,
 * y esa conexión ya no se toca hasta que alguien se va.
 *
 * # Lo que cuesta, dicho antes de que sorprenda
 *
 * Entrar tarda **una o dos vueltas del reloj** por cada persona que ya estaba:
 * la oferta se deja en el buzón y la otra punta la recoge en su siguiente
 * vuelta. Con dos segundos, el cuarto en entrar puede tardar unos segundos en
 * ver a los tres. Es el precio de no tener un socket propio, el mismo que ya
 * paga la llamada de voz, y es lo que hace que todo esto quepa en la base que
 * ya hay.
 */

/**
 * Juntar lo que ya había con lo que acaba de llegar, sin repetir.
 *
 * El corte es una HORA, y dos mensajes pueden compartirla: dos personas
 * escribiendo en el mismo milisegundo, o —lo normal— una vuelta que llega
 * tarde y trae otra vez el último. Sin deduplicar por id, el hilo enseñaría el
 * mismo mensaje dos veces y no habría forma de saber si fue la persona quien
 * lo mandó dos veces.
 */
function juntarLosMensajes(
    habia: MensajeDeLaSala[],
    llegan: MensajeDeLaSala[],
): MensajeDeLaSala[] {
    if (!llegan.length) return habia;
    const vistos = new Set(habia.map((m) => m.id));
    const nuevos = llegan.filter((m) => !vistos.has(m.id));
    return nuevos.length ? [...habia, ...nuevos] : habia;
}

export type RemotoEnLaSala = QuienEstaEnLaSala & {
    /** Lo que llega de esa persona. `null` mientras se conecta. */
    stream: MediaStream | null;
    /** Si ahora mismo está llegando imagen. Ver `alCambiarLaPista`. */
    hayVideo: boolean;
    estado: RTCPeerConnectionState;
};

export type EstadoDeLaMalla = {
    /** Dónde estoy: esperando en la puerta, dentro, o fuera. */
    estado: "cargando" | "esperando" | "dentro" | "fuera";
    /** Por qué estoy fuera, cuando lo estoy. */
    motivo: string | null;
    yo: {
        participanteId: string;
        nombre: string;
        abroLaPuerta: boolean;
        /** Si puedo silenciar y sacar. No es lo mismo que abrir la puerta. */
        moderas: boolean;
        manoLevantada: boolean;
        silenciadoEn: string | null;
    } | null;
    sala: { id: string; codigo: string; titulo: string | null; expiraEn: string | null } | null;
    remotos: RemotoEnLaSala[];
    esperando: QuienEstaEnLaSala[];
    /**
     * El chat de la reunión, **acumulado aquí y no pedido entero cada vuelta**.
     *
     * El servidor solo manda los que faltan (ver `desdeMensaje`), así que el
     * hilo se va construyendo en el navegador. Guardarlo en el estado de la
     * pantalla en vez de aquí obligaría a subirlo cuando el panel del chat se
     * cierra y se vuelve a abrir — o sea, a perderlo.
     */
    mensajes: MensajeDeLaSala[];
    /**
     * Si ahora mismo se está intentando volver, y qué decir mientras.
     *
     * `null` en marcha normal. Mientras no sea `null`, **la reunión no se da
     * por perdida**: no se cierran las conexiones, no se suelta la cámara y el
     * reloj sigue preguntando. Es lo único que separa «se cayó la red un
     * momento» de «se acabó la reunión», que antes eran lo mismo.
     */
    reconectando: { desde: number; mensaje: string } | null;
    /** Si se está grabando, para que lo vea todo el mundo y no solo quien graba. */
    grabando: { desde: string; por: string } | null;
    /** Si a mí me toca el botón de grabar. Lo decide el servidor. */
    puedoGrabar: boolean;
};

/**
 * Si el «no» del servidor es firme o vale la pena seguir intentándolo.
 *
 * Se decide por el mensaje porque es lo único que cruza: `Respuesta` es
 * `{success, message}` y meterle un código de motivo obligaría a tocar las
 * quince acciones que la usan. Lo que no se puede es tratarlos todos igual —
 * insistir un minuto a quien acaban de sacar de la reunión es mentirle, y
 * rendirse al primer intento con un servidor que tardó en contestar es no
 * reconectar—.
 *
 * **La duda cae del lado de seguir intentando**: lo que no se reconozca aquí
 * se reintenta hasta el plazo, que es el lado que como mucho tarda un minuto de
 * más en decir lo mismo.
 */
function esUnNoDefinitivo(mensaje: string): boolean {
    const m = (mensaje ?? "").toLowerCase();
    return (
        m.includes("ya no estás") ||
        m.includes("no autorizado") ||
        m.includes("se llenó") ||
        m.includes("ya no vale") ||
        m.includes("ya no existe") ||
        m.includes("no es válido") ||
        m.includes("caducado") ||
        m.includes("revocado")
    );
}

export function useMallaDeVideo(input: {
    codigo: string;
    /** El token, cuando quien mira entró por el enlace y no tiene cuenta. */
    token?: string | null;
    medios: MediosDeLlamada;
    /** Mientras sea `false` no se pregunta nada: ni reloj ni conexiones. */
    activo: boolean;
    /**
     * La grabación que esta pestaña lleva, **como referencia y no como valor**.
     *
     * Viaja en el latido que ya existe para refrescar su marca: sin eso, el
     * aviso de «se está grabando» se apagaría solo en la pantalla de todos a
     * los veinte segundos de empezar.
     *
     * Y es una referencia porque el orden de los hooks no deja otra: la malla
     * se monta **antes** que la grabación —la grabación necesita los streams
     * que la malla produce—, así que al leerla como valor llegaría siempre un
     * render tarde. Con la referencia, el reloj lee lo que hay en el momento de
     * preguntar, que es lo único que importa.
     */
    grabando?: { readonly current: string | null };
}): EstadoDeLaMalla {
    const { codigo, token, medios, activo } = input;
    const grabandoRef = input.grabando;

    const [estado, setEstado] = useState<EstadoDeLaMalla>({
        estado: "cargando",
        motivo: null,
        yo: null,
        sala: null,
        remotos: [],
        esperando: [],
        mensajes: [],
        reconectando: null,
        grabando: null,
        puedoGrabar: false,
    });

    /**
     * El corte del chat: la hora del último mensaje que ya tengo.
     *
     * En un ref y no en el estado porque lo lee **el reloj**, que se monta una
     * sola vez y lee todo por referencia. Metido en el estado habría que
     * volverlo a montar en cada mensaje que llegara, o sea justo en el momento
     * en que menos conviene perder el ritmo.
     */
    const desdeMensajeRef = useRef<string | null>(null);

    /** Una conexión por persona, viva entre vueltas del reloj. */
    const conexionesRef = useRef<Map<string, RTCPeerConnection>>(new Map());
    /** Lo que llega de cada uno. Se construye a mano: ver `ontrack`. */
    const streamsRef = useRef<Map<string, MediaStream>>(new Map());
    /** Las que se están negociando, para no ofrecer dos veces seguidas. */
    const enMarchaRef = useRef<Set<string>>(new Set());
    /**
     * En qué estado está cada conexión y **desde cuándo**.
     *
     * Lo segundo es lo que hace falta: `disconnected` es el estado dudoso de
     * WebRTC y se recupera solo al segundo siguiente, así que tirar la conexión
     * ahí sería renegociar media reunión cada vez que alguien pasa por debajo
     * de un puente. Con la hora delante se le puede dar una gracia y decidir
     * con ella.
     */
    const saludRef = useRef<Map<string, { estado: string; desde: number }>>(new Map());
    /**
     * El `desde` que tenía cada persona cuando adopté su conexión.
     *
     * Es el sello contra el que se compara si RE-entró: si su `desde` cambia,
     * la conexión es de una sesión anterior y hay que rehacerla. Es un sello del
     * SERVIDOR, no una hora del navegador, para no cruzar dos relojes — ver
     * `laConexionEsDeOtraSesion`.
     */
    const desdeVistoRef = useRef<Map<string, string>>(new Map());
    /** Desde cuándo se intenta volver. `null` cuando todo va bien. */
    const reconectandoDesdeRef = useRef<number | null>(null);
    const iceRef = useRef<RTCIceServer[]>([]);
    /**
     * Lo que se manda ahora mismo, **por referencia**.
     *
     * El reloj se monta una sola vez y lee de aquí. Metiendo `medios` en las
     * dependencias del `useEffect`, cada vez que alguien tocara el micro se
     * desmontaría y se volvería a montar el `setInterval` — y con él se
     * perdería el ritmo justo cuando más hace falta.
     */
    const mediosRef = useRef(medios);
    mediosRef.current = medios;

    /** Para que el pintado se entere de lo que cambia dentro de los refs. */
    const [, repintar] = useState(0);
    const avisarDelCambio = useCallback(() => repintar((n) => n + 1), []);

    /**
     * Cerrar una conexión y olvidar lo suyo.
     *
     * **Por todos los caminos**: alguien que se va, alguien a quien sacan, o el
     * final de la reunión. Una conexión que no se cierra deja su recuadro negro
     * en la pantalla y sigue mandando la cámara a nadie.
     */
    const cerrarLaConexion = useCallback(
        (id: string) => {
            const pc = conexionesRef.current.get(id);
            if (pc) {
                medios.olvidarLaConexion(pc);
                try {
                    pc.close();
                } catch {
                    // Cerrar dos veces no es un error que nadie tenga que ver.
                }
            }
            conexionesRef.current.delete(id);
            streamsRef.current.delete(id);
            enMarchaRef.current.delete(id);
            saludRef.current.delete(id);
            desdeVistoRef.current.delete(id);
        },
        [medios],
    );

    /** Montar la conexión con alguien, con sus oyentes puestos. */
    const nuevaConexion = useCallback(
        (id: string): RTCPeerConnection => {
            const pc = new RTCPeerConnection({ iceServers: iceRef.current });
            conexionesRef.current.set(id, pc);
            saludRef.current.set(id, { estado: pc.connectionState, desde: Date.now() });

            pc.ontrack = (ev) => {
                // El stream se construye A MANO y no se coge de `ev.streams[0]`.
                //
                // Los transceptores se abren con `addTransceiver`, que no
                // asocia ningún stream, así que `ev.streams` llega **vacío** y
                // `ev.streams[0]` sería `undefined`: el recuadro se quedaría
                // negro con la conexión perfectamente establecida, que es de
                // los fallos más difíciles de mirar porque todo lo demás dice
                // que va bien.
                const stream = streamsRef.current.get(id) ?? new MediaStream();
                if (!stream.getTracks().includes(ev.track)) stream.addTrack(ev.track);
                streamsRef.current.set(id, stream);

                // Cuando la pista SÍ pasa a `muted`/`ended` —a veces lo hace—
                // se repinta al momento. Pero no se puede depender de ello:
                // `replaceTrack(null)` al apagar la cámara a menudo deja la
                // pista viva con el último fotograma, así que quien decide de
                // verdad es lo señalizado por el latido (ver `hayVideoDelRemoto`
                // en la vuelta del reloj). Esto es solo el camino rápido.
                const alCambiarLaPista = () => avisarDelCambio();
                ev.track.addEventListener("mute", alCambiarLaPista);
                ev.track.addEventListener("unmute", alCambiarLaPista);
                ev.track.addEventListener("ended", alCambiarLaPista);
                avisarDelCambio();
            };

            pc.onconnectionstatechange = () => {
                // La hora del cambio, no la de ahora al mirarlo: es lo que
                // después deja perdonar unos segundos de `disconnected` sin
                // perdonarlos para siempre.
                saludRef.current.set(id, {
                    estado: pc.connectionState,
                    desde: Date.now(),
                });
                avisarDelCambio();
                if (pc.connectionState === "failed") {
                    // Aquí es donde acaba una conexión entre dos redes que no
                    // dejan ruta directa y sin TURN detrás. No se cierra la
                    // reunión entera —los demás pueden estar bien— pero el
                    // recuadro lo dice, y la consola también: sin esto se ve
                    // como «a veces no veo a uno» y no hay nada que mirar.
                    console.warn("[sala] no se pudo conectar con alguien", {
                        con: id,
                        pista: "si se repite entre redes distintas, falta TURN",
                    });
                }
            };
            return pc;
        },
        [avisarDelCambio],
    );

    /** Yo ofrezco: monto los transceptores, recolecto y dejo la oferta. */
    const ofrecerA = useCallback(
        async (id: string) => {
            if (enMarchaRef.current.has(id)) return;
            enMarchaRef.current.add(id);
            try {
                const pc = nuevaConexion(id);
                medios.prepararLaConexion(pc);
                const oferta = await pc.createOffer();
                await pc.setLocalDescription(oferta);
                await esperarLosCandidatos(pc);
                const res = await enviarSenalAction({
                    codigo,
                    token,
                    paraId: id,
                    tipo: "oferta",
                    sdp: JSON.stringify(pc.localDescription),
                });
                if (!res.success) {
                    // Esa persona ya no está, o la sala se cerró. Se limpia
                    // para poder volver a intentarlo si reaparece.
                    console.warn("[sala] la oferta no se pudo dejar", res.message);
                    cerrarLaConexion(id);
                }
            } catch (error) {
                console.warn("[sala] no se pudo ofrecer", { con: id, error });
                cerrarLaConexion(id);
            } finally {
                enMarchaRef.current.delete(id);
            }
        },
        [cerrarLaConexion, codigo, medios, nuevaConexion, token],
    );

    /** Me ofrecen: aplico, pongo lo mío encima y contesto. */
    const contestarA = useCallback(
        async (id: string, sdp: string) => {
            if (enMarchaRef.current.has(id)) return;
            enMarchaRef.current.add(id);
            try {
                // Una oferta sobre una conexión que ya había es una reconexión:
                // la otra punta recargó. Se tira la vieja y se empieza de cero,
                // que es más simple y más fiable que intentar reaprovecharla.
                cerrarLaConexion(id);
                const pc = nuevaConexion(id);
                await pc.setRemoteDescription(JSON.parse(sdp));
                // DESPUÉS de aplicar la oferta: los transceptores los creó
                // ella, y lo único que falta es ponerlos en `sendrecv` y
                // engancharles lo mío. Sin esto, quien contesta sin cámara
                // negocia el video en `recvonly` y ya no puede encenderla.
                medios.engancharALaConexion(pc);
                const respuesta = await pc.createAnswer();
                await pc.setLocalDescription(respuesta);
                await esperarLosCandidatos(pc);
                const res = await enviarSenalAction({
                    codigo,
                    token,
                    paraId: id,
                    tipo: "respuesta",
                    sdp: JSON.stringify(pc.localDescription),
                });
                if (!res.success) {
                    console.warn("[sala] la respuesta no se pudo dejar", res.message);
                    cerrarLaConexion(id);
                }
            } catch (error) {
                console.warn("[sala] no se pudo contestar", { a: id, error });
                cerrarLaConexion(id);
            } finally {
                enMarchaRef.current.delete(id);
            }
        },
        [cerrarLaConexion, codigo, medios, nuevaConexion, token],
    );

    /** Me contestan: aplico y ya está conectada. */
    const aplicarLaRespuesta = useCallback(async (id: string, sdp: string) => {
        const pc = conexionesRef.current.get(id);
        if (!pc) return;
        // Una respuesta sobre una conexión que ya la tiene es un eco: aplicarla
        // otra vez lanza, y ese error no significa nada.
        if (pc.signalingState !== "have-local-offer") return;
        try {
            await pc.setRemoteDescription(JSON.parse(sdp));
        } catch (error) {
            console.warn("[sala] la respuesta no se pudo aplicar", { de: id, error });
        }
    }, []);

    /**
     * Intentar volver a la reunión, y rendirse cuando ya no tiene sentido.
     *
     * Se llama desde los **dos** sitios por los que se pierde una reunión, que
     * son distintos y antes no se distinguían:
     *
     * | qué pasó | cómo llega aquí |
     * | --- | --- |
     * | no hay red: la petición ni sale | el `catch` de la vuelta, con `porQue` vacío |
     * | hay red y el servidor dice que ya no estoy | `success: false`, con su mensaje |
     *
     * En los dos casos **no se cierra nada**: las conexiones que siguieran
     * vivas valen, y la cámara sigue encendida. Lo que se hace es marcar que se
     * está intentando —para que la tarjeta lo diga— y pedir la reanudación.
     *
     * Y hay un final. Una pestaña que reintenta para siempre es una pestaña con
     * el micrófono abierto mandando a nadie, y quien la dejó así no se entera:
     * pasado `TOPE_PARA_RECONECTAR_MS` se suelta todo y **se dice**.
     */
    const intentarVolver = useCallback(
        async (porQue: string | null) => {
            const ahora = Date.now();
            reconectandoDesdeRef.current ??= ahora;
            const desde = reconectandoDesdeRef.current;

            if (hayQueRendirse(ahora - desde)) {
                for (const id of Array.from(conexionesRef.current.keys())) {
                    cerrarLaConexion(id);
                }
                reconectandoDesdeRef.current = null;
                setEstado((e) => ({
                    ...e,
                    estado: "fuera",
                    // El motivo del servidor manda cuando lo hay: «te sacaron»
                    // explica mucho más que «se perdió la conexión».
                    motivo: porQue ?? CUANDO_NO_SE_PUDO_VOLVER,
                    reconectando: null,
                }));
                return;
            }

            setEstado((e) => ({
                ...e,
                reconectando: { desde, mensaje: comoSeLeeLaReconexion(ahora - desde) },
            }));

            // Sin red esto tampoco va a salir, y no pasa nada: el reloj vuelve
            // a llamar en la vuelta siguiente. Lo que NO se hace es montar un
            // temporizador propio de reintentos — el reloj ya es eso.
            try {
                const res = await volverAEntrarAction({ codigo, token });
                if (res.success) {
                    reconectandoDesdeRef.current = null;
                    setEstado((e) => ({ ...e, reconectando: null }));
                    return;
                }
                // Un «no» FIRME se acata al momento y no se reintenta hasta
                // agotar el plazo: a quien sacaron de la reunión, o a quien se
                // le cerró el enlace, insistirle un minuto es mentirle.
                if (esUnNoDefinitivo(res.message)) {
                    for (const id of Array.from(conexionesRef.current.keys())) {
                        cerrarLaConexion(id);
                    }
                    reconectandoDesdeRef.current = null;
                    setEstado((e) => ({
                        ...e,
                        estado: "fuera",
                        motivo: res.message,
                        reconectando: null,
                    }));
                }
            } catch {
                // Sigue sin haber red. La vuelta siguiente lo intenta otra vez.
            }
        },
        [cerrarLaConexion, codigo, token],
    );

    // ── El reloj ────────────────────────────────────────────────────────────
    //
    // Un `setInterval` montado UNA sola vez, que lee todo por referencia. No
    // una cadena de `setTimeout`: si una vuelta no llegara a programar la
    // siguiente, la reunión se quedaría congelada sin que nadie se entere —
    // que es la primera regla de los relojes de este proyecto.
    const vuelta = useCallback(async () => {
        try {
            const m = mediosRef.current;
            const res = await latidoDeLaSalaAction({
                codigo,
                token,
                medios: {
                    mic: m.micEncendido,
                    camara: m.camaraEncendida,
                    compartiendo: m.compartiendo,
                },
                desdeMensaje: desdeMensajeRef.current,
                grabando: grabandoRef?.current ?? null,
            });

            if (!res.success) {
                // **Ya no es un final.** Antes se cerraba todo y se ponía
                // «fuera» en la primera vuelta que contestara que no, y eso es
                // exactamente lo que pasa cuando se cae la red: el barrido del
                // servidor te saca a los veinte segundos y la vuelta siguiente
                // dice «ya no estás en esta reunión».
                //
                // Ahora se intenta volver, que no es entrar otra vez: se
                // reanuda la misma fila. Y las conexiones **no se tocan**
                // todavía — si el corte fue corto, siguen valiendo.
                await intentarVolver(res.message);
                return;
            }

            // Se volvió, o nunca se llegó a perder.
            reconectandoDesdeRef.current = null;

            const { datos } = res;
            if (datos.ice.length) iceRef.current = datos.ice;
            // El corte se mueve al ÚLTIMO que llegó, no a `now()`: con la hora
            // de ahora, un mensaje escrito entre la consulta y esta línea
            // quedaría del lado de los ya vistos y no llegaría nunca. Es la
            // misma regla que la marca de leído del chat de equipo.
            const ultimo = datos.mensajes[datos.mensajes.length - 1];
            if (ultimo) desdeMensajeRef.current = ultimo.creadoEn;

            if (datos.yo.estado !== "dentro") {
                setEstado({
                    estado: "esperando",
                    motivo: null,
                    yo: {
                        participanteId: datos.yo.participanteId,
                        nombre: datos.yo.nombre,
                        abroLaPuerta: false,
                        moderas: false,
                        manoLevantada: false,
                        silenciadoEn: null,
                    },
                    sala: datos.sala,
                    remotos: [],
                    esperando: [],
                    // Quien espera en la puerta no lee el chat de dentro: ver
                    // el latido. Aquí se vacía para que, si a alguien lo sacan
                    // y vuelve a la puerta, no se quede mirando la conversación
                    // de una sala en la que ya no está.
                    mensajes: [],
                    reconectando: null,
                    // En la puerta no se graba ni se puede grabar: el aviso de
                    // dentro no se le enseña a quien todavía no ha entrado,
                    // porque no le está grabando nadie.
                    grabando: null,
                    puedoGrabar: false,
                });
                return;
            }

            // 1. Lo que me dejaron en el buzón. **Antes de tocar la malla**:
            //    una oferta recién llegada es de alguien que puede no estar
            //    todavía en la lista de dentro de ESTA vuelta.
            for (const senal of datos.senales) {
                if (senal.tipo === "oferta") void contestarA(senal.deId, senal.sdp);
                else void aplicarLaRespuesta(senal.deId, senal.sdp);
            }

            // 2. Las conexiones muertas se tiran ANTES de mirar la malla.
            //
            //    Esto es la mitad que faltaba de «la reunión no vuelve»: una
            //    `RTCPeerConnection` en `failed` se quedaba en el mapa para
            //    siempre, y `comoQuedaLaMalla` la cuenta como montada — así
            //    que nadie la volvía a abrir nunca. La sala se recuperaba y los
            //    recuadros seguían en negro.
            //
            //    Y se tira también la que sea de una **sesión anterior** de esa
            //    persona: cuando a alguien se le cae la red y vuelve, el que
            //    no ofrece podría quedarse con una conexión que a él le parece
            //    viva esperando una oferta que el otro no cree deber. Se sabe
            //    porque su `desde` —el sello del servidor— cambió respecto al que
            //    tenía cuando adopté la conexión. Sello contra sello, nunca
            //    contra `Date.now()`: ver `laConexionEsDeOtraSesion`.
            const ahora = Date.now();
            for (const quienEsta of datos.dentro) {
                if (quienEsta.id === datos.yo.participanteId) continue;
                if (!conexionesRef.current.has(quienEsta.id)) continue;

                // La primera vez que veo esta conexión desde el reloj apunto su
                // `desde`: es el sello contra el que se compara si re-entra.
                if (!desdeVistoRef.current.has(quienEsta.id) && quienEsta.desde) {
                    desdeVistoRef.current.set(quienEsta.id, quienEsta.desde);
                }

                const salud = saludRef.current.get(quienEsta.id);
                const muerta = salud
                    ? estaMuertaLaConexion({
                          estado: salud.estado,
                          desdeMs: ahora - salud.desde,
                      })
                    : false;

                const vieja = laConexionEsDeOtraSesion({
                    desdeAhora: quienEsta.desde,
                    desdeAlAdoptar: desdeVistoRef.current.get(quienEsta.id),
                });

                if (muerta || vieja) {
                    console.info("[sala] se rehace una conexión", {
                        con: quienEsta.id,
                        porQue: muerta ? salud?.estado : "re-entró",
                    });
                    cerrarLaConexion(quienEsta.id);
                }
            }

            // 3. Con quién falta conexión y con quién sobra.
            const { abrir, cerrar } = comoQuedaLaMalla({
                yo: datos.yo.participanteId,
                dentro: datos.dentro.map((d) => d.id),
                montadas: Array.from(conexionesRef.current.keys()),
            });
            for (const id of cerrar) cerrarLaConexion(id);
            for (const id of abrir) {
                // Solo ofrece uno de los dos. El otro espera la oferta y la
                // contesta en su vuelta: por eso aquí no se monta nada para él.
                if (debeOfrecer(datos.yo.participanteId, id)) void ofrecerA(id);
            }

            // 4. Y lo que se pinta.
            const mios = datos.dentro.filter((d) => d.id !== datos.yo.participanteId);
            setEstado((e) => ({
                estado: "dentro",
                motivo: null,
                yo: {
                    participanteId: datos.yo.participanteId,
                    nombre: datos.yo.nombre,
                    abroLaPuerta: datos.yo.abroLaPuerta,
                    moderas: datos.yo.moderas,
                    manoLevantada: datos.yo.manoLevantada,
                    silenciadoEn: datos.yo.silenciadoEn,
                },
                sala: datos.sala,
                remotos: mios.map((d) => {
                    const stream = streamsRef.current.get(d.id) ?? null;
                    const video = stream?.getVideoTracks()[0];
                    // La pista sola NO decide si hay video: al apagar la cámara,
                    // `replaceTrack(null)` deja la pista de la otra punta con el
                    // último fotograma congelado sin pasar a `muted`. Manda lo
                    // SEÑALIZADO —`camaraEncendida`/`compartiendo`, que llegan por
                    // el latido igual que el estado del micro— y la pista solo
                    // confirma que de verdad ha llegado algo. Ver
                    // `hayVideoDelRemoto`.
                    const pistaViva = Boolean(
                        video && !video.muted && video.readyState === "live",
                    );
                    return {
                        ...d,
                        stream,
                        hayVideo: hayVideoDelRemoto({
                            camaraEncendida: d.camaraEncendida,
                            compartiendo: d.compartiendo,
                            pistaViva,
                        }),
                        estado:
                            conexionesRef.current.get(d.id)?.connectionState ?? "new",
                    };
                }),
                esperando: datos.esperando,
                // Se AÑADEN los que faltaban, no se sustituye la lista. Y se
                // deduplica por id: una vuelta que llegue tarde puede traer
                // otra vez el mismo mensaje, y el hilo lo enseñaría dos veces.
                mensajes: e.mensajes.length
                    ? juntarLosMensajes(e.mensajes, datos.mensajes)
                    : datos.mensajes,
                reconectando: null,
                grabando: datos.grabando,
                puedoGrabar: datos.puedoGrabar,
            }));
        } catch (error) {
            // Aquí cae el corte de red de verdad: la petición ni sale. Mudo se
            // ve como «la reunión se queda colgada», que no se parece a un
            // error — y quedarse callado y seguir tampoco vale, porque quien
            // mira tiene que saber que se está intentando.
            console.warn("[sala] falló una vuelta del reloj", error);
            await intentarVolver(null);
        }
    }, [
        aplicarLaRespuesta,
        cerrarLaConexion,
        codigo,
        contestarA,
        intentarVolver,
        ofrecerA,
        token,
    ]);

    const vueltaRef = useRef(vuelta);
    vueltaRef.current = vuelta;

    useEffect(() => {
        if (!activo) return;
        let vivo = true;
        const correr = () => {
            if (vivo) void vueltaRef.current();
        };
        correr();

        // Quien espera en la puerta pregunta más despacio: lo único que espera
        // es que alguien le abra, y puede no entrar nunca. Con el mismo ritmo
        // que dentro, una pestaña olvidada en la sala de espera costaría lo
        // mismo que una reunión entera.
        const cadencia =
            estado.estado === "esperando"
                ? CADA_CUANTO_EN_LA_PUERTA_MS
                : CADA_CUANTO_EN_LA_SALA_MS;
        const id = window.setInterval(correr, cadencia);

        // Y al volver a la pestaña se pregunta de inmediato: el navegador
        // ralentiza los temporizadores de una pestaña escondida, así que al
        // volver puede llevarse hasta un minuto de retraso encima.
        const alVolver = () => {
            if (!document.hidden) correr();
        };
        document.addEventListener("visibilitychange", alVolver);
        return () => {
            vivo = false;
            window.clearInterval(id);
            document.removeEventListener("visibilitychange", alVolver);
        };
        // `estado.estado` entra a propósito: es lo que cambia la cadencia al
        // pasar de la puerta a dentro. No se remonta por nada más, porque todo
        // lo demás se lee por referencia.
    }, [activo, estado.estado]);

    // Soltarlo todo al desmontar: una conexión que sobrevive a su pantalla
    // sigue mandando la cámara a gente que ya no se ve.
    //
    // Se capturan los DOS mapas, no sus contenidos: la identidad de un `Map`
    // no cambia nunca, así que al limpiar se recorre el mismo objeto con lo que
    // tenga dentro en ese momento — que es justo lo que hace falta. Leer
    // `.current` dentro de la limpieza haría lo mismo, pero el linter no puede
    // saberlo y avisa; capturarlo lo dice explícitamente.
    useEffect(() => {
        const conexiones = conexionesRef.current;
        const streams = streamsRef.current;
        return () => {
            for (const pc of conexiones.values()) {
                try {
                    pc.close();
                } catch {
                    // Ya estaba cerrada.
                }
            }
            conexiones.clear();
            streams.clear();
        };
    }, []);

    return estado;
}
