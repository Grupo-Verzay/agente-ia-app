"use client";

import { useEffect, useRef, useState } from "react";

import { AUDIO_BPS, comoEntraElVideo, elFormato } from "@/lib/grabacion-de-reunion";
import {
    ALTO_DEL_LIENZO_DE_LA_SALA,
    ANCHO_DEL_LIENZO_DE_LA_SALA,
    FPS_DEL_LIENZO_DE_LA_SALA,
    EN_PAUSA_TRAS_MS,
    REINTENTAR_EL_AUDIO_CADA_MS,
    TROZO_CADA_MS,
    VIDEO_BPS_DE_LA_SALA,
    comoCabeEntero,
    elFormatoDeLaGrabacion,
    lasCajasDelLienzoDeLaSala,
} from "@/lib/grabacion-de-videollamada";

/** Lo que se pinta en el lienzo: un `<video>` de la sala o la foto en vivo de la pantalla. */
export type LoQueSeVe = { grande: HTMLVideoElement | HTMLImageElement | null; mini: HTMLVideoElement | null };

function lasMedidas(el: HTMLVideoElement | HTMLImageElement): { ancho: number; alto: number } {
    return el instanceof HTMLVideoElement
        ? { ancho: el.videoWidth, alto: el.videoHeight }
        : { ancho: el.naturalWidth, alto: el.naturalHeight };
}

/**
 * Grabar la videollamada con IA desde la sala del CLIENTE (ver
 * `lib/grabacion-de-videollamada.ts`).
 *
 * - **Empieza sola** la primera vez que la sala está `dentro`, y sigue a través
 *   de las reconexiones: la sala no se desmonta, solo cambian las pistas, y el
 *   mezclador las vuelve a enchufar por su id.
 * - **Termina** al colgar (`terminar`), y al cerrar la pestaña manda un
 *   `sendBeacon` para que el servidor junte lo subido.
 * - **No toca la llamada**: solo LEE pistas y elementos que ya están. Grabar no
 *   puede costarle la llamada al cliente, así que cualquier fallo se dice en la
 *   consola y la llamada sigue.
 * - El audio va SIEMPRE en su propio fichero (`AUDIO_BPS`), como en Reuniones.
 * - **Sin el `AudioContext` en marcha no se graba NADA**, ni el video: el
 *   video lleva la mezcla de voces, y con ella parada Chrome no suelta ni un
 *   fotograma. Y un `AudioContext` nacido sin un clic nace parado: la
 *   grabación empezaba con el primer toque en la página, a veces un minuto
 *   tarde. Se insiste en arrancarlo cada `REINTENTAR_EL_AUDIO_CADA_MS` (en
 *   cuanto la cámara o el micrófono están abiertos, el navegador lo deja) y,
 *   si sigue parado tras `EN_PAUSA_TRAS_MS`, `enPausa` le dice a la sala que
 *   pida un toque.
 */
export function useGrabacionDeLaVideollamada(input: {
    /** ¿Esta pestaña graba? La del cliente, o la de un asesor solo con Verzy (`laSalaGraba`). Una vez empezada, sigue. */
    graba: boolean;
    /** ¿La sala ya está dentro de la llamada? La primera vez, empieza. */
    dentro: boolean;
    /** ¿La llamada terminó? Se cierra la grabación. */
    terminada: boolean;
    /** `c=<cita>&f=<firma>` */
    consulta: string;
    /** Todas las voces: la del avatar, las de otras personas y el micrófono propio. */
    voces: MediaStreamTrack[];
    /** Qué se ve ahora mismo (lo lee el lienzo en cada fotograma). */
    queSeVe: () => LoQueSeVe;
}): { grabando: boolean; enPausa: boolean; reanudar: () => void } {
    // Montada: los grabadores existen. Corriendo: el audio rueda, o sea que de
    // verdad se graba. «Grabando» es las dos cosas.
    const [montada, setMontada] = useState(false);
    const [corriendo, setCorriendo] = useState(false);
    const [enPausa, setEnPausa] = useState(false);
    const queSeVeRef = useRef(input.queSeVe);
    queSeVeRef.current = input.queSeVe;
    const consultaRef = useRef(input.consulta);
    consultaRef.current = input.consulta;

    const idRef = useRef<string | null>(null);
    const empezoRef = useRef(false);
    const cerradaRef = useRef(false);
    const terminadaRef = useRef(false);
    const empezoEnRef = useRef(0);
    const ctxRef = useRef<AudioContext | null>(null);
    const mezclaRef = useRef<MediaStreamAudioDestinationNode | null>(null);
    const enchufadasRef = useRef<Map<string, MediaStreamAudioSourceNode>>(new Map());
    const grabadoresRef = useRef<MediaRecorder[]>([]);
    const pintandoRef = useRef<number | null>(null);
    // Los trozos suben EN SERIE (una cola): dos a la vez podrían llegar
    // desordenados, y el número del trozo es su sitio en el fichero.
    const colaRef = useRef<Promise<void>>(Promise.resolve());
    const numerosRef = useRef({ audio: 0, video: 0 });

    const segundos = () => Math.round((Date.now() - empezoEnRef.current) / 1000);

    const soltar = () => {
        if (pintandoRef.current !== null) window.clearInterval(pintandoRef.current);
        pintandoRef.current = null;
        for (const n of enchufadasRef.current.values()) {
            try {
                n.disconnect();
            } catch {
                // Ya estaba suelta.
            }
        }
        enchufadasRef.current.clear();
        mezclaRef.current = null;
        const ctx = ctxRef.current;
        ctxRef.current = null;
        // Cerrarlo: los navegadores topan cuántos `AudioContext` hay a la vez.
        if (ctx && ctx.state !== "closed") void ctx.close().catch(() => {});
    };

    const cerrar = async () => {
        if (cerradaRef.current || !idRef.current) return;
        cerradaRef.current = true;
        setMontada(false);
        // `stop()` provoca el último `dataavailable`: se para ANTES de esperar la cola.
        for (const g of grabadoresRef.current) {
            try {
                if (g.state !== "inactive") g.stop();
            } catch {
                // Ya parado.
            }
        }
        grabadoresRef.current = [];
        await new Promise((listo) => setTimeout(listo, 300));
        await colaRef.current;
        soltar();
        const id = idRef.current;
        try {
            const r = await fetch(
                `/api/videollamada/grabacion?a=cerrar&g=${encodeURIComponent(id)}&segundos=${segundos()}&${consultaRef.current}`,
                { method: "POST" },
            ).then((x) => x.json());
            if (r?.ok) console.info("[videollamada] grabación guardada", { grabacion: id });
            else console.warn("[videollamada] la grabación no se pudo juntar", { grabacion: id, hecho: r?.hecho });
        } catch (error) {
            console.warn("[videollamada] no se pudo cerrar la grabación", error);
        }
    };
    const cerrarRef = useRef(cerrar);
    cerrarRef.current = cerrar;

    const mandarElTrozo = (cual: "audio" | "video", trozo: Blob) => {
        if (!trozo?.size || !idRef.current) return;
        const id = idRef.current;
        const numero = ++numerosRef.current[cual];
        colaRef.current = colaRef.current.then(async () => {
            try {
                const res = await fetch(
                    `/api/videollamada/grabacion?a=trozo&g=${encodeURIComponent(id)}&cual=${cual}&numero=${numero}&${consultaRef.current}`,
                    { method: "POST", body: trozo },
                );
                if (res.status === 413) {
                    // Llegó al techo: se para y se guarda lo que hay.
                    console.warn("[videollamada] la grabación llegó a su tope; se guarda lo grabado");
                    void cerrarRef.current();
                } else if (!res.ok) {
                    // Un trozo perdido deja un salto, no tira la grabación: se
                    // sigue y el servidor lo salta al juntar.
                    console.warn("[videollamada] un trozo de la grabación no subió", { cual, numero, estado: res.status });
                }
            } catch (error) {
                console.warn("[videollamada] fallo al subir un trozo de la grabación", { cual, numero, error });
            }
        });
    };

    const empezar = async () => {
        if (empezoRef.current) return;
        empezoRef.current = true;
        if (typeof MediaRecorder === "undefined" || typeof AudioContext === "undefined") {
            console.warn("[videollamada] este navegador no puede grabar la llamada");
            return;
        }
        try {
            const ctx = new AudioContext();
            ctxRef.current = ctx;
            const alCambiar = () => setCorriendo(ctx.state === "running");
            ctx.addEventListener("statechange", alCambiar);
            alCambiar();
            const mezcla = ctx.createMediaStreamDestination();
            mezclaRef.current = mezcla;
            // Silencio exacto conectado siempre: sin nada enchufado el grafo no
            // rueda y `MediaRecorder` no emite ni un trozo (ver Reuniones).
            const silencio = ctx.createConstantSource();
            silencio.offset.value = 0;
            silencio.connect(mezcla);
            silencio.start();
            // Un `AudioContext` creado sin gesto puede nacer suspendido; la
            // sala ya tiene el audio sonando, así que suele dejar reanudarlo.
            if (ctx.state === "suspended") void ctx.resume().catch(() => {});

            const audio = new MediaRecorder(mezcla.stream, {
                mimeType: elFormato(["audio/webm;codecs=opus", "audio/webm", "audio/mp4"]),
                audioBitsPerSecond: AUDIO_BPS,
            });
            const formato = elFormatoDeLaGrabacion(audio.mimeType);
            const r = await fetch(`/api/videollamada/grabacion?a=empezar&formato=${formato}&${consultaRef.current}`, {
                method: "POST",
            }).then((x) => x.json());
            if (!r?.ok || typeof r.grabacionId !== "string") {
                console.warn("[videollamada] no se pudo empezar a grabar", { motivo: r?.motivo });
                soltar();
                return;
            }
            idRef.current = r.grabacionId;
            empezoEnRef.current = Date.now();
            if (terminadaRef.current) {
                soltar();
                void cerrarRef.current();
                return;
            }
            numerosRef.current = { audio: 0, video: 0 };

            audio.ondataavailable = (ev) => mandarElTrozo("audio", ev.data);
            const grabadores: MediaRecorder[] = [audio];

            const lienzo = document.createElement("canvas");
            lienzo.width = ANCHO_DEL_LIENZO_DE_LA_SALA;
            lienzo.height = ALTO_DEL_LIENZO_DE_LA_SALA;
            pintandoRef.current = window.setInterval(() => pintar(lienzo), Math.round(1000 / FPS_DEL_LIENZO_DE_LA_SALA));
            pintar(lienzo);
            const conVideo = lienzo.captureStream(FPS_DEL_LIENZO_DE_LA_SALA);
            for (const p of mezcla.stream.getAudioTracks()) conVideo.addTrack(p);
            const video = new MediaRecorder(conVideo, {
                mimeType: elFormato(
                    formato === "mp4"
                        ? ["video/mp4"]
                        : ["video/webm;codecs=vp8,opus", "video/webm;codecs=vp9,opus", "video/webm"],
                ),
                videoBitsPerSecond: VIDEO_BPS_DE_LA_SALA,
                audioBitsPerSecond: AUDIO_BPS,
            });
            video.ondataavailable = (ev) => mandarElTrozo("video", ev.data);
            grabadores.push(video);

            for (const g of grabadores) g.start(TROZO_CADA_MS);
            grabadoresRef.current = grabadores;
            setMontada(true);
            console.info("[videollamada] grabando la llamada", { grabacion: r.grabacionId, formato, audio: ctx.state });
        } catch (error) {
            console.warn("[videollamada] no se pudo montar la grabación", error);
            for (const g of grabadoresRef.current) {
                try {
                    g.stop();
                } catch {
                    // Nada.
                }
            }
            grabadoresRef.current = [];
            soltar();
            if (idRef.current) {
                cerradaRef.current = false;
                void cerrarRef.current();
            }
        }
    };

    /** Un fotograma: lo grande entero (`contain`) y la miniatura recortada. */
    function pintar(lienzo: HTMLCanvasElement) {
        const ctx = lienzo.getContext("2d");
        if (!ctx) return;
        ctx.fillStyle = "#020617";
        ctx.fillRect(0, 0, lienzo.width, lienzo.height);
        let ve: LoQueSeVe;
        try {
            ve = queSeVeRef.current();
        } catch {
            return;
        }
        const cajas = lasCajasDelLienzoDeLaSala(Boolean(ve.mini), lienzo.width, lienzo.height);
        try {
            if (ve.grande) {
                const m = lasMedidas(ve.grande);
                const destino = comoCabeEntero({ anchoDeLaFuente: m.ancho, altoDeLaFuente: m.alto, caja: cajas.grande });
                if (destino) ctx.drawImage(ve.grande, destino.x, destino.y, destino.ancho, destino.alto);
            }
            if (ve.mini && cajas.mini && ve.mini.videoWidth) {
                const corte = comoEntraElVideo({
                    anchoDelVideo: ve.mini.videoWidth,
                    altoDelVideo: ve.mini.videoHeight,
                    casilla: cajas.mini,
                });
                if (corte) {
                    ctx.drawImage(ve.mini, corte.sx, corte.sy, corte.sw, corte.sh, cajas.mini.x, cajas.mini.y, cajas.mini.ancho, cajas.mini.alto);
                }
            }
        } catch {
            // Un fotograma que no se puede pintar (la imagen aún cargando) se salta.
        }
    }

    // Empieza la primera vez que la sala está dentro.
    useEffect(() => {
        if (input.graba && input.dentro && !empezoRef.current) void empezar();
    }, [input.graba, input.dentro]); // eslint-disable-line react-hooks/exhaustive-deps

    // Al colgar, se cierra. Si cuelga mientras `empezar` aún espera al
    // servidor, `empezar` lo ve al volver y no arranca.
    useEffect(() => {
        terminadaRef.current = input.terminada;
        if (input.terminada) void cerrarRef.current();
    }, [input.terminada]);

    // Enchufar y desenchufar voces: cambian con cada reconexión y con quien entra.
    useEffect(() => {
        const ctx = ctxRef.current;
        const mezcla = mezclaRef.current;
        if (!ctx || !mezcla || !montada) return;
        const vivas = new Set<string>();
        for (const pista of input.voces) {
            if (!pista || pista.readyState === "ended") continue;
            vivas.add(pista.id);
            if (enchufadasRef.current.has(pista.id)) continue;
            try {
                const nodo = ctx.createMediaStreamSource(new MediaStream([pista]));
                nodo.connect(mezcla);
                enchufadasRef.current.set(pista.id, nodo);
            } catch (error) {
                console.warn("[videollamada] no se pudo mezclar una voz en la grabación", error);
            }
        }
        for (const [id, nodo] of Array.from(enchufadasRef.current)) {
            if (vivas.has(id)) continue;
            try {
                nodo.disconnect();
            } catch {
                // Ya suelta.
            }
            enchufadasRef.current.delete(id);
        }
    }, [montada, input.voces]);

    // Un `AudioContext` nacido sin gesto se queda suspendido, y suspendido no
    // graba NI EL VIDEO: se insiste solo (el navegador lo deja en cuanto la
    // cámara o el micrófono están abiertos) y con el primer toque o tecla.
    useEffect(() => {
        if (!montada || corriendo) {
            setEnPausa(false);
            return;
        }
        const reanudar = () => {
            const ctx = ctxRef.current;
            if (ctx && ctx.state === "suspended") void ctx.resume().catch(() => {});
        };
        reanudar();
        const insistir = window.setInterval(reanudar, REINTENTAR_EL_AUDIO_CADA_MS);
        const avisar = window.setTimeout(() => {
            console.warn("[videollamada] la grabación espera un toque: el navegador no deja arrancar el audio");
            setEnPausa(true);
        }, EN_PAUSA_TRAS_MS);
        window.addEventListener("pointerdown", reanudar);
        window.addEventListener("keydown", reanudar);
        return () => {
            window.clearInterval(insistir);
            window.clearTimeout(avisar);
            window.removeEventListener("pointerdown", reanudar);
            window.removeEventListener("keydown", reanudar);
        };
    }, [montada, corriendo]);

    // La pestaña se cierra: lo que esté sin subir (como mucho un trozo) se
    // pierde, pero el servidor junta lo subido al momento.
    useEffect(() => {
        const alCerrar = () => {
            const id = idRef.current;
            if (!id || cerradaRef.current) return;
            cerradaRef.current = true;
            navigator.sendBeacon?.(
                `/api/videollamada/grabacion?a=cerrar&g=${encodeURIComponent(id)}&segundos=${segundos()}&${consultaRef.current}`,
            );
        };
        window.addEventListener("pagehide", alCerrar);
        return () => {
            window.removeEventListener("pagehide", alCerrar);
            soltar();
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const reanudar = () => {
        const ctx = ctxRef.current;
        if (ctx && ctx.state === "suspended") void ctx.resume().catch(() => {});
    };

    return { grabando: montada && corriendo, enPausa: montada && !corriendo && enPausa, reanudar };
}
