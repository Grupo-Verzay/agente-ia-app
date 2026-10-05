"use client";

import { useEffect, useRef, useState } from "react";
import DailyIframe, { type DailyCall } from "@daily-co/daily-js";
import { laOrdenDeLaPantalla, laRutaYElAncla, type PaginaDelAvatar } from "@/lib/pantalla-del-avatar";

/** Baja al ancla dentro del marco (es del mismo origen). La landing pinta
 * sus secciones después de cargar, así que se insiste unos segundos. */
function bajarAlAncla(marco: HTMLIFrameElement | null, ancla: string | null) {
    if (!marco) return;
    let vueltas = 0;
    const intentar = () => {
        try {
            const doc = marco.contentDocument;
            if (!ancla) { marco.contentWindow?.scrollTo({ top: 0, behavior: "smooth" }); return; }
            const el = doc?.getElementById(ancla);
            if (el) { el.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
        } catch (error) {
            console.warn("[videollamada] no se pudo bajar al ancla de la pantalla", { ancla, error });
            return;
        }
        if (++vueltas < 25) window.setTimeout(intentar, 200);
        else console.warn("[videollamada] el ancla de la pantalla no apareció", { ancla });
    };
    intentar();
}

/** Pinta una pista en su `<video>`/`<audio>` sin volver a montar el elemento. */
function usarPista(track: MediaStreamTrack | null) {
    const ref = useRef<HTMLVideoElement & HTMLAudioElement>(null);
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        el.srcObject = track ? new MediaStream([track]) : null;
    }, [track]);
    return ref;
}

type Pistas = { avatarVideo: MediaStreamTrack | null; avatarAudio: MediaStreamTrack | null; miVideo: MediaStreamTrack | null };
const SIN_PISTAS: Pistas = { avatarVideo: null, avatarAudio: null, miVideo: null };

/** Lee las pistas que se pueden reproducir: la del avatar (el otro) y la mía. */
function lasPistas(llamada: DailyCall): Pistas {
    const ps = llamada.participants();
    const avatar = Object.values(ps).find((p) => !p.local);
    const pista = (p: typeof avatar, tipo: "video" | "audio") =>
        p?.tracks?.[tipo]?.state === "playable" ? p.tracks[tipo].persistentTrack ?? null : null;
    return { avatarVideo: pista(avatar, "video"), avatarAudio: pista(avatar, "audio"), miVideo: pista(ps.local, "video") };
}

/**
 * La sala de la videollamada con IA. No redirige a Tavus ni usa la interfaz
 * de Daily: con un `callObject` se ENTRA DIRECTO a la conversación al abrir el
 * enlace —sin la pantalla «Are you ready to join?» en inglés, donde un
 * prospecto se quedaba sin saber que tenía que pulsar «Join»— y el video del
 * avatar se pinta aquí, con la PANTALLA DEL AVATAR al lado. La pantalla la
 * decide Verzy con su herramienta `mostrar_pantalla`, que llega por el canal
 * de Daily (`app-message`) y se lee con `laOrdenDeLaPantalla` — lo demás que
 * viaje por ese canal se ignora.
 *
 * Varios humanos pueden abrir el mismo enlace: todos entran a la MISMA
 * conversación (el servidor la reutiliza) y cada uno ve la pantalla que
 * comparte el avatar, porque la orden les llega a todos.
 */
export default function SalaDeLaVideollamada({ url, nombre }: { url: string; nombre?: string | null }) {
    const [pagina, setPagina] = useState<PaginaDelAvatar | null>(null);
    const marco = useRef<HTMLIFrameElement>(null);
    const destino = pagina ? laRutaYElAncla(pagina.ruta) : null;
    // Cambiar de sección en la misma página no recarga el marco: solo baja.
    useEffect(() => {
        if (destino) bajarAlAncla(marco.current, destino.ancla);
    }, [destino?.ruta, destino?.ancla]); // eslint-disable-line react-hooks/exhaustive-deps
    const [error, setError] = useState<string | null>(null);
    const [estado, setEstado] = useState<"entrando" | "dentro" | "fuera">("entrando");
    const [pistas, setPistas] = useState<Pistas>(SIN_PISTAS);
    const [micOn, setMicOn] = useState(true);
    const [camOn, setCamOn] = useState(true);
    const [pantallaOn, setPantallaOn] = useState(false);
    const [sinSonido, setSinSonido] = useState(false);
    // Compartir pantalla solo se ofrece donde el navegador lo deja (un iPhone no).
    const [hayCompartir, setHayCompartir] = useState(false);
    useEffect(() => {
        setHayCompartir(typeof navigator !== "undefined" && !!navigator.mediaDevices?.getDisplayMedia);
    }, []);
    const llamadaRef = useRef<DailyCall | null>(null);
    const videoAvatar = usarPista(pistas.avatarVideo);
    const audioAvatar = usarPista(pistas.avatarAudio);
    const miVideo = usarPista(pistas.miVideo);

    useEffect(() => {
        let llamada: DailyCall;
        try {
            llamada = DailyIframe.createCallObject({ subscribeToTracksAutomatically: true });
        } catch (e) {
            console.error("[videollamada] no se pudo montar la sala", e);
            setError("No pudimos abrir la sala. Recarga la página.");
            return;
        }
        llamadaRef.current = llamada;
        const refrescar = () => {
            setPistas(lasPistas(llamada));
            const local = llamada.participants().local;
            setMicOn(!!local?.audio);
            setCamOn(!!local?.video);
        };
        for (const ev of ["participant-joined", "participant-updated", "participant-left", "track-started", "track-stopped"] as const) {
            llamada.on(ev, refrescar);
        }
        llamada.on("joined-meeting", () => { setEstado("dentro"); refrescar(); });
        llamada.on("left-meeting", () => setEstado("fuera"));
        llamada.on("local-screen-share-started", () => setPantallaOn(true));
        llamada.on("local-screen-share-stopped", () => setPantallaOn(false));
        llamada.on("app-message", (ev) => {
            const orden = laOrdenDeLaPantalla(ev?.data);
            if (!orden) return;
            setPagina(orden.accion === "mostrar" ? orden.pagina : null);
        });
        llamada.on("camera-error", (ev) => {
            console.warn("[videollamada] sin cámara o micrófono", ev);
            setError("No pudimos usar tu cámara o micrófono. Revisa los permisos del navegador; Verzy te sigue escuchando si das acceso al micrófono.");
        });
        llamada.on("error", (ev) => {
            console.error("[videollamada] error de la sala", ev);
            setError("Se cortó la videollamada. Recarga la página para volver a entrar.");
        });
        // El nombre sale de la cita: nunca se le pide al prospecto.
        const conNombre = nombre?.trim();
        llamada.join(conNombre ? { url, userName: conNombre } : { url }).catch((e) => {
            console.error("[videollamada] no se pudo entrar", e);
            setError("No pudimos entrar a la videollamada. Recarga la página.");
        });
        return () => {
            llamadaRef.current = null;
            void llamada.destroy();
        };
    }, [url]); // eslint-disable-line react-hooks/exhaustive-deps

    // Con la cámara o el micrófono abiertos el navegador deja sonar solo; si
    // aun así lo bloquea, se ofrece un botón en vez de dejar al avatar mudo.
    useEffect(() => {
        const el = audioAvatar.current;
        if (!el || !pistas.avatarAudio) return;
        el.play().then(() => setSinSonido(false)).catch(() => setSinSonido(true));
    }, [pistas.avatarAudio]); // eslint-disable-line react-hooks/exhaustive-deps

    const activarSonido = () => {
        void audioAvatar.current?.play().then(() => setSinSonido(false)).catch(() => setSinSonido(true));
    };
    const alternarPantalla = () => {
        const llamada = llamadaRef.current;
        if (!llamada) return;
        if (pantallaOn) llamada.stopScreenShare();
        else llamada.startScreenShare();
    };
    const reentrar = () => window.location.reload();

    return (
        <main className="flex h-[100dvh] w-full flex-col bg-slate-950 text-slate-100 lg:flex-row">
            <section
                data-zona="sala"
                className={`relative min-h-0 ${pagina ? "h-[45dvh] lg:h-auto lg:w-[38%]" : "flex-1"}`}
            >
                <video
                    ref={videoAvatar}
                    data-zona="video-del-avatar"
                    autoPlay
                    playsInline
                    muted
                    className="h-full w-full bg-black object-contain"
                />
                <audio ref={audioAvatar} autoPlay />
                {estado !== "fuera" && !pistas.avatarVideo && (
                    <p data-zona="conectando" className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-slate-300">
                        <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" aria-hidden />
                        Conectando con Verzy…
                    </p>
                )}
                {estado === "fuera" && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-950 text-center">
                        <p className="text-base">Saliste de la videollamada.</p>
                        <button type="button" onClick={reentrar} className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-white">
                            Volver a entrar
                        </button>
                    </div>
                )}
                {pistas.miVideo && camOn && estado === "dentro" && (
                    <video
                        ref={miVideo}
                        data-zona="mi-video"
                        autoPlay
                        playsInline
                        muted
                        className="absolute bottom-20 right-3 h-24 w-32 rounded-lg border border-slate-700 bg-black object-cover [transform:scaleX(-1)] sm:h-32 sm:w-44"
                    />
                )}
                {sinSonido && (
                    <button
                        type="button"
                        onClick={activarSonido}
                        className="absolute inset-x-4 top-4 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white"
                    >
                        Toca aquí para escuchar a Verzy
                    </button>
                )}
                {estado === "dentro" && (
                    <div data-zona="mandos" className="absolute inset-x-0 bottom-3 flex justify-center gap-2">
                        <button
                            type="button"
                            onClick={() => llamadaRef.current?.setLocalAudio(!micOn)}
                            className={`rounded-full px-4 py-2 text-sm font-medium ${micOn ? "bg-slate-800 text-white" : "bg-red-600 text-white"}`}
                        >
                            {micOn ? "Silenciar" : "Activar micrófono"}
                        </button>
                        <button
                            type="button"
                            onClick={() => llamadaRef.current?.setLocalVideo(!camOn)}
                            className={`rounded-full px-4 py-2 text-sm font-medium ${camOn ? "bg-slate-800 text-white" : "bg-red-600 text-white"}`}
                        >
                            {camOn ? "Apagar cámara" : "Encender cámara"}
                        </button>
                        {hayCompartir && (
                            <button
                                type="button"
                                data-mando="pantalla"
                                onClick={alternarPantalla}
                                className={`rounded-full px-4 py-2 text-sm font-medium ${pantallaOn ? "bg-emerald-600 text-white" : "bg-slate-800 text-white"}`}
                            >
                                {pantallaOn ? "Dejar de compartir" : "Compartir pantalla"}
                            </button>
                        )}
                    </div>
                )}
                {error && (
                    <p role="alert" className="absolute inset-x-4 top-4 rounded-lg bg-red-600/90 px-3 py-2 text-sm">
                        {error}
                    </p>
                )}
            </section>
            {pagina && (
                <section
                    data-zona="pantalla-del-avatar"
                    data-pagina={pagina.clave}
                    className="flex min-h-0 flex-1 flex-col border-t border-slate-800 lg:border-l lg:border-t-0"
                >
                    <header className="flex h-10 shrink-0 items-center gap-2 px-4 text-sm text-slate-300">
                        <span className="h-2 w-2 rounded-full bg-emerald-400" aria-hidden />
                        Verzy te está mostrando: <strong className="text-slate-100">{pagina.titulo}</strong>
                    </header>
                    <iframe
                        ref={marco}
                        key={destino!.ruta}
                        src={destino!.ruta}
                        onLoad={() => bajarAlAncla(marco.current, destino!.ancla)}
                        title={`Pantalla de Verzy: ${pagina.titulo}`}
                        className="min-h-0 w-full flex-1 bg-white"
                    />
                </section>
            )}
        </main>
    );
}
