"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
    CADA_CUANTO_EN_LA_PUERTA_MS,
    CADA_CUANTO_EN_LA_SALA_MS,
    comoQuedaLaMalla,
    debeOfrecer,
} from "@/lib/sala-de-video";
import { esperarLosCandidatos } from "@/lib/webrtc-del-navegador";
import {
    enviarSenalAction,
    latidoDeLaSalaAction,
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
    yo: { participanteId: string; nombre: string; abroLaPuerta: boolean } | null;
    sala: { id: string; codigo: string; titulo: string | null; expiraEn: string } | null;
    remotos: RemotoEnLaSala[];
    esperando: QuienEstaEnLaSala[];
};

export function useMallaDeVideo(input: {
    codigo: string;
    /** El token, cuando quien mira entró por el enlace y no tiene cuenta. */
    token?: string | null;
    medios: MediosDeLlamada;
    /** Mientras sea `false` no se pregunta nada: ni reloj ni conexiones. */
    activo: boolean;
}): EstadoDeLaMalla {
    const { codigo, token, medios, activo } = input;

    const [estado, setEstado] = useState<EstadoDeLaMalla>({
        estado: "cargando",
        motivo: null,
        yo: null,
        sala: null,
        remotos: [],
        esperando: [],
    });

    /** Una conexión por persona, viva entre vueltas del reloj. */
    const conexionesRef = useRef<Map<string, RTCPeerConnection>>(new Map());
    /** Lo que llega de cada uno. Se construye a mano: ver `ontrack`. */
    const streamsRef = useRef<Map<string, MediaStream>>(new Map());
    /** Las que se están negociando, para no ofrecer dos veces seguidas. */
    const enMarchaRef = useRef<Set<string>>(new Set());
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
        },
        [medios],
    );

    /** Montar la conexión con alguien, con sus oyentes puestos. */
    const nuevaConexion = useCallback(
        (id: string): RTCPeerConnection => {
            const pc = new RTCPeerConnection({ iceServers: iceRef.current });
            conexionesRef.current.set(id, pc);

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

                // Si la otra punta apaga la cámara, su pista de video se queda
                // en `muted` — eso sí viaja por la conexión, al revés que el
                // micro. Es lo que decide al instante si se pinta el video o
                // las iniciales, sin esperar a la vuelta del reloj.
                const alCambiarLaPista = () => avisarDelCambio();
                ev.track.addEventListener("mute", alCambiarLaPista);
                ev.track.addEventListener("unmute", alCambiarLaPista);
                ev.track.addEventListener("ended", alCambiarLaPista);
                avisarDelCambio();
            };

            pc.onconnectionstatechange = () => {
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
            });

            if (!res.success) {
                // Quedarse fuera es un final: se sueltan las conexiones para no
                // dejar la cámara mandando a nadie.
                for (const id of Array.from(conexionesRef.current.keys())) {
                    cerrarLaConexion(id);
                }
                setEstado((e) => ({ ...e, estado: "fuera", motivo: res.message }));
                return;
            }

            const { datos } = res;
            if (datos.ice.length) iceRef.current = datos.ice;

            if (datos.yo.estado !== "dentro") {
                setEstado({
                    estado: "esperando",
                    motivo: null,
                    yo: {
                        participanteId: datos.yo.participanteId,
                        nombre: datos.yo.nombre,
                        abroLaPuerta: false,
                    },
                    sala: datos.sala,
                    remotos: [],
                    esperando: [],
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

            // 2. Con quién falta conexión y con quién sobra.
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

            // 3. Y lo que se pinta.
            const mios = datos.dentro.filter((d) => d.id !== datos.yo.participanteId);
            setEstado({
                estado: "dentro",
                motivo: null,
                yo: {
                    participanteId: datos.yo.participanteId,
                    nombre: datos.yo.nombre,
                    abroLaPuerta: datos.yo.abroLaPuerta,
                },
                sala: datos.sala,
                remotos: mios.map((d) => {
                    const stream = streamsRef.current.get(d.id) ?? null;
                    const video = stream?.getVideoTracks()[0];
                    return {
                        ...d,
                        stream,
                        hayVideo: Boolean(video && !video.muted && video.readyState === "live"),
                        estado:
                            conexionesRef.current.get(d.id)?.connectionState ?? "new",
                    };
                }),
                esperando: datos.esperando,
            });
        } catch (error) {
            // Mudo aquí se ve como «la reunión se queda colgada», que no se
            // parece a un error.
            console.warn("[sala] falló una vuelta del reloj", error);
        }
    }, [aplicarLaRespuesta, cerrarLaConexion, codigo, contestarA, ofrecerA, token]);

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
