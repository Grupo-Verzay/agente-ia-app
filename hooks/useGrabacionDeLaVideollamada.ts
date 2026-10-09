"use client";

import { useEffect, useRef, useState } from "react";

import { AUDIO_BPS, comoEntraElVideo, elFormato } from "@/lib/grabacion-de-reunion";
import {
    ALTO_DEL_LIENZO_DE_LA_SALA,
    ANCHO_DEL_LIENZO_DE_LA_SALA,
    FPS_DEL_LIENZO_DE_LA_SALA,
    TOPE_DE_VOCES,
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
 * Grabar la videollamada con IA desde la sala (ver
 * `lib/grabacion-de-videollamada.ts`).
 *
 * - **Empieza sola** la primera vez que la sala está `dentro`, y sigue a través
 *   de las reconexiones: la sala no se desmonta, solo cambian las pistas.
 * - **Sin `AudioContext`**: nacido sin un toque nace parado, y parado no
 *   grababa NADA (en el teléfono, ni un byte). El video es solo el lienzo, y
 *   cada voz va con su propio `MediaRecorder` y su `desdeMs` (cuándo empezó
 *   respecto al video). El servidor las mezcla y las pega al video al cerrar.
 * - **Termina** al colgar (`terminar`), y al cerrar la pestaña manda un
 *   `sendBeacon` para que el servidor junte lo subido.
 * - **No toca la llamada**: solo LEE pistas y elementos que ya están. Grabar no
 *   puede costarle la llamada al cliente, así que cualquier fallo se dice en la
 *   consola y la llamada sigue.
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
}): { grabando: boolean } {
    const [grabando, setGrabando] = useState(false);
    const queSeVeRef = useRef(input.queSeVe);
    queSeVeRef.current = input.queSeVe;
    const consultaRef = useRef(input.consulta);
    consultaRef.current = input.consulta;

    const idRef = useRef<string | null>(null);
    const empezoRef = useRef(false);
    const cerradaRef = useRef(false);
    const terminadaRef = useRef(false);
    /** Cuándo empezó el VIDEO: cada voz dice cuánto después empezó ella. */
    const empezoEnRef = useRef(0);
    const formatoRef = useRef<"webm" | "mp4">("webm");
    const videoRef = useRef<MediaRecorder | null>(null);
    /** Un grabador por voz, por el id de su pista. */
    const vocesRef = useRef<Map<string, MediaRecorder>>(new Map());
    const pistasRef = useRef(0);
    const pintandoRef = useRef<number | null>(null);
    // Los trozos suben EN SERIE (una cola): dos a la vez podrían llegar
    // desordenados, y el número del trozo es su sitio en el fichero.
    const colaRef = useRef<Promise<void>>(Promise.resolve());
    const numerosRef = useRef<Map<string, number>>(new Map());

    const segundos = () => Math.round((Date.now() - empezoEnRef.current) / 1000);

    const parar = (g: MediaRecorder | null) => {
        try {
            if (g && g.state !== "inactive") g.stop();
        } catch {
            // Ya parado.
        }
    };

    const soltar = () => {
        if (pintandoRef.current !== null) window.clearInterval(pintandoRef.current);
        pintandoRef.current = null;
    };

    const cerrar = async () => {
        if (cerradaRef.current || !idRef.current) return;
        cerradaRef.current = true;
        setGrabando(false);
        // `stop()` provoca el último `dataavailable`: se para ANTES de esperar la cola.
        parar(videoRef.current);
        videoRef.current = null;
        for (const g of vocesRef.current.values()) parar(g);
        vocesRef.current.clear();
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

    /** `voz` lleva su pista y cuándo empezó; el video no. */
    const mandarElTrozo = (trozo: Blob, voz?: { pista: number; desdeMs: number }) => {
        if (!trozo?.size || !idRef.current) return;
        const id = idRef.current;
        const llave = voz ? `voz-${voz.pista}` : "video";
        const numero = (numerosRef.current.get(llave) ?? 0) + 1;
        numerosRef.current.set(llave, numero);
        const deLaVoz = voz ? `&cual=voz&pista=${voz.pista}&desde=${voz.desdeMs}` : "&cual=video";
        colaRef.current = colaRef.current.then(async () => {
            try {
                const res = await fetch(
                    `/api/videollamada/grabacion?a=trozo&g=${encodeURIComponent(id)}${deLaVoz}&numero=${numero}&${consultaRef.current}`,
                    { method: "POST", body: trozo },
                );
                if (res.status === 413) {
                    // Llegó al techo: se para y se guarda lo que hay.
                    console.warn("[videollamada] la grabación llegó a su tope; se guarda lo grabado");
                    void cerrarRef.current();
                } else if (!res.ok) {
                    // Un trozo perdido deja un salto, no tira la grabación: se
                    // sigue y el servidor lo salta al juntar.
                    console.warn("[videollamada] un trozo de la grabación no subió", { llave, numero, estado: res.status });
                }
            } catch (error) {
                console.warn("[videollamada] fallo al subir un trozo de la grabación", { llave, numero, error });
            }
        });
    };

    /** Una voz nueva: su propio grabador, sin mezclar nada aquí. */
    const grabarLaVoz = (pista: MediaStreamTrack) => {
        if (vocesRef.current.has(pista.id) || pista.readyState === "ended") return;
        if (pistasRef.current >= TOPE_DE_VOCES) return;
        try {
            const tipo = elFormato(
                formatoRef.current === "mp4"
                    ? ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"]
                    : ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"],
            );
            const g = new MediaRecorder(new MediaStream([pista]), { ...(tipo ? { mimeType: tipo } : {}), audioBitsPerSecond: AUDIO_BPS });
            const voz = { pista: ++pistasRef.current, desdeMs: Math.max(0, Date.now() - empezoEnRef.current) };
            g.ondataavailable = (ev) => mandarElTrozo(ev.data, voz);
            g.start(TROZO_CADA_MS);
            vocesRef.current.set(pista.id, g);
        } catch (error) {
            console.warn("[videollamada] no se pudo grabar una voz", error);
        }
    };

    const empezar = async () => {
        if (empezoRef.current) return;
        empezoRef.current = true;
        if (typeof MediaRecorder === "undefined") {
            console.warn("[videollamada] este navegador no puede grabar la llamada");
            return;
        }
        try {
            const tipoDelVideo = elFormato(["video/webm;codecs=vp8", "video/webm", "video/mp4"]);
            const formato = elFormatoDeLaGrabacion(tipoDelVideo);
            formatoRef.current = formato;
            const r = await fetch(`/api/videollamada/grabacion?a=empezar&formato=${formato}&${consultaRef.current}`, {
                method: "POST",
            }).then((x) => x.json());
            if (!r?.ok || typeof r.grabacionId !== "string") {
                console.warn("[videollamada] no se pudo empezar a grabar", { motivo: r?.motivo });
                return;
            }
            idRef.current = r.grabacionId;
            if (terminadaRef.current) {
                void cerrarRef.current();
                return;
            }
            numerosRef.current = new Map();

            // El video es SOLO el lienzo: sin una pista de audio dentro, nada
            // (un `AudioContext` parado, una voz que tarda) lo puede frenar.
            const lienzo = document.createElement("canvas");
            lienzo.width = ANCHO_DEL_LIENZO_DE_LA_SALA;
            lienzo.height = ALTO_DEL_LIENZO_DE_LA_SALA;
            pintandoRef.current = window.setInterval(() => pintar(lienzo), Math.round(1000 / FPS_DEL_LIENZO_DE_LA_SALA));
            pintar(lienzo);
            const video = new MediaRecorder(lienzo.captureStream(FPS_DEL_LIENZO_DE_LA_SALA), {
                ...(tipoDelVideo ? { mimeType: tipoDelVideo } : {}),
                videoBitsPerSecond: VIDEO_BPS_DE_LA_SALA,
            });
            video.ondataavailable = (ev) => mandarElTrozo(ev.data);
            empezoEnRef.current = Date.now();
            video.start(TROZO_CADA_MS);
            videoRef.current = video;
            setGrabando(true);
            console.info("[videollamada] grabando la llamada", { grabacion: r.grabacionId, formato });
        } catch (error) {
            console.warn("[videollamada] no se pudo montar la grabación", error);
            parar(videoRef.current);
            videoRef.current = null;
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

    // Las voces: cada una nueva, su grabador; la que se va (una reconexión
    // trae pistas nuevas), se para y entrega su último trozo.
    useEffect(() => {
        if (!grabando) return;
        const vivas = new Set<string>();
        for (const pista of input.voces) {
            if (!pista || pista.readyState === "ended") continue;
            vivas.add(pista.id);
            grabarLaVoz(pista);
        }
        for (const [id, g] of Array.from(vocesRef.current)) {
            if (vivas.has(id)) continue;
            parar(g);
            vocesRef.current.delete(id);
        }
    }, [grabando, input.voces]); // eslint-disable-line react-hooks/exhaustive-deps

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

    return { grabando };
}
