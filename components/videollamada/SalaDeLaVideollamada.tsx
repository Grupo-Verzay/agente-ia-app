"use client";

import { useEffect, useRef, useState } from "react";
import DailyIframe, { type DailyCall } from "@daily-co/daily-js";
import {
    laOrdenDeAgendar,
    laOrdenDeEnvio,
    laOrdenDeLaPantalla,
    laRutaYElAncla,
    VISTAS_DE_LA_SALA,
    type OrdenDeAgendar,
    type OrdenDeEnvio,
    type PaginaDelAvatar,
} from "@/lib/pantalla-del-avatar";
import { conLaNota, loQueDijoElCliente, NOVEDADES_CADA_MS } from "@/lib/videollamada-en-vivo";
import { esLaVistaDelCrm } from "@/lib/videollamada-crm";

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

type Pistas = { avatarVideo: MediaStreamTrack | null; avatarAudio: MediaStreamTrack | null };
const SIN_PISTAS: Pistas = { avatarVideo: null, avatarAudio: null };

/** Lee las pistas del avatar (el otro participante). La cámara propia no se
 * pinta: el cliente no necesita verse, y un recuadro propio era el que se
 * quedaba en negro. */
function lasPistas(llamada: DailyCall): Pistas {
    const avatar = Object.values(llamada.participants()).find((p) => !p.local);
    const pista = (tipo: "video" | "audio") =>
        avatar?.tracks?.[tipo]?.state === "playable" ? avatar.tracks[tipo].persistentTrack ?? null : null;
    return { avatarVideo: pista("video"), avatarAudio: pista("audio") };
}

/** Cuántas veces se reintenta reconectar sola antes de pedir un clic. */
export const INTENTOS_DE_RECONEXION = 5;
/** Espera antes de cada intento: 1 s, 2 s, 4 s… con techo. */
export function laEsperaDelIntento(intento: number): number {
    return Math.min(15_000, 1_000 * 2 ** Math.max(0, intento));
}

/** El id de la conversación de Tavus es el último trozo de su dirección. */
function elIdDeLaConversacion(url: string): string | null {
    try {
        return new URL(url).pathname.split("/").filter(Boolean).pop() ?? null;
    } catch {
        return null;
    }
}

const AL_VOLVER =
    "El cliente se reconectó a la videollamada después de un corte. Continúa exactamente donde iban, sin volver a saludar ni presentarte, y retoma el último tema.";

type Estado = "entrando" | "dentro" | "reconectando" | "terminada" | "sin_conexion";

/**
 * La sala de la videollamada con IA. No redirige a Tavus ni usa la interfaz
 * de Daily: con un `callObject` se ENTRA DIRECTO al abrir el enlace. Arranca
 * con el AVATAR en grande y nada más; la pantalla solo aparece cuando Verzy
 * la comparte con su herramienta `mostrar_pantalla` (según su guion), y
 * entonces el avatar pasa a una miniatura abajo a la derecha. Los mandos son
 * dos, centrados: cámara y compartir pantalla. El micrófono va siempre
 * abierto: Tavus decide los turnos y filtra el ruido.
 *
 * Si Verzy pide mandar un enlace (`enviar_por_whatsapp`), la sala avisa al
 * servidor y sale al WhatsApp del prospecto. Si se cae la conexión, la sala
 * se reconecta sola a la MISMA conversación y le dice a Verzy que siga donde
 * iban.
 */
/** Las vistas de la sala solo abren con la firma de la cita. */
function conLaFirma(destino: { ruta: string; ancla: string | null }, consulta: string) {
    if (!destino.ruta.startsWith(VISTAS_DE_LA_SALA)) return destino;
    const [camino, resto] = destino.ruta.split("?");
    return { ...destino, ruta: `${camino}?${resto ? `${resto}&` : ""}${consulta}` };
}

export default function SalaDeLaVideollamada({
    url: urlInicial,
    nombre,
    citaId,
    firma,
    reentrada = false,
}: {
    url: string;
    nombre?: string | null;
    citaId: string;
    firma: string;
    reentrada?: boolean;
}) {
    const [conexion, setConexion] = useState({ url: urlInicial, reentrada, vuelta: 0 });
    const [pagina, setPagina] = useState<PaginaDelAvatar | null>(null);
    const [notas, setNotas] = useState<string[]>([]);
    const marco = useRef<HTMLIFrameElement>(null);
    const consulta = `c=${encodeURIComponent(citaId)}&f=${encodeURIComponent(firma)}`;
    const destino = pagina ? conLaFirma(laRutaYElAncla(pagina.ruta), consulta) : null;
    // Cambiar de sección en la misma página no recarga el marco: solo baja.
    useEffect(() => {
        if (destino) bajarAlAncla(marco.current, destino.ancla);
    }, [destino?.ruta, destino?.ancla]); // eslint-disable-line react-hooks/exhaustive-deps
    const [error, setError] = useState<string | null>(null);
    const [estado, setEstado] = useState<Estado>("entrando");
    const [pistas, setPistas] = useState<Pistas>(SIN_PISTAS);
    const [camOn, setCamOn] = useState(true);
    const [pantallaOn, setPantallaOn] = useState(false);
    const [sinSonido, setSinSonido] = useState(false);
    // Compartir pantalla solo se ofrece donde el navegador lo deja (un iPhone no).
    const [hayCompartir, setHayCompartir] = useState(false);
    useEffect(() => {
        setHayCompartir(typeof navigator !== "undefined" && !!navigator.mediaDevices?.getDisplayMedia);
    }, []);
    const llamadaRef = useRef<DailyCall | null>(null);
    const intentos = useRef(0);
    const videoAvatar = usarPista(pistas.avatarVideo);
    const audioAvatar = usarPista(pistas.avatarAudio);
    const conversacionRef = useRef<string | null>(null);

    // Lo que se le cuenta a Verzy en medio de la conversación (la reconexión,
    // un pago que acaba de entrar): va como contexto, nunca como un mensaje.
    const contarleAVerzy = (contexto: string) => {
        const llamada = llamadaRef.current;
        const conversacion = conversacionRef.current;
        if (!llamada || !conversacion) return;
        try {
            llamada.sendAppMessage({
                message_type: "conversation",
                event_type: "conversation.append_llm_context",
                conversation_id: conversacion,
                properties: { context: contexto },
            }, "*");
        } catch (e) {
            console.warn("[videollamada] no se pudo darle contexto a Verzy", e);
        }
    };

    const agendar = (orden: OrdenDeAgendar) => {
        fetch(`/api/videollamada/agendar?${consulta}`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(orden),
        })
            .then((r) => r.json())
            .then((r) => {
                if (!r?.ok) {
                    console.warn("[videollamada] no se agendó el seguimiento", { orden, motivo: r?.motivo });
                    contarleAVerzy(`No se pudo agendar el ${orden.tipo} (${r?.motivo ?? "sin respuesta"}). Díselo al cliente con naturalidad y propón otra fecha.`);
                }
            })
            .catch((e) => console.warn("[videollamada] no se pudo pedir el agendamiento", e));
    };

    // Si el prospecto crea su cuenta o paga mientras habla, Verzy se entera.
    useEffect(() => {
        if (estado !== "dentro") return;
        let ultimo: string | null = null;
        const preguntar = () => {
            fetch(`/api/videollamada/novedades?${consulta}`)
                .then((r) => r.json())
                .then((r) => {
                    const aviso = r?.ok && typeof r.aviso === "string" ? r.aviso : null;
                    if (aviso && aviso !== ultimo) {
                        ultimo = aviso;
                        contarleAVerzy(aviso);
                    }
                })
                .catch((e) => console.warn("[videollamada] no se pudieron leer las novedades", e));
        };
        preguntar();
        const reloj = window.setInterval(preguntar, NOVEDADES_CADA_MS);
        return () => window.clearInterval(reloj);
    }, [estado]); // eslint-disable-line react-hooks/exhaustive-deps

    const mandarPorWhatsapp = (orden: OrdenDeEnvio) => {
        fetch(`/api/videollamada/whatsapp?${consulta}`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(orden),
        })
            .then((r) => r.json())
            .then((r) => {
                if (!r?.ok) console.warn("[videollamada] no salió el enlace por WhatsApp", { orden, motivo: r?.motivo });
            })
            .catch((e) => console.warn("[videollamada] no se pudo pedir el envío por WhatsApp", e));
    };

    useEffect(() => {
        let llamada: DailyCall;
        let aProposito = false;
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
            setCamOn(!!llamada.participants().local?.video);
        };
        // Se cayó: se vuelve a pedir la sala al servidor (misma conversación
        // si sigue viva) y se entra otra vez, con esperas crecientes.
        const reconectar = (porque: unknown) => {
            if (aProposito) return;
            aProposito = true;
            console.warn("[videollamada] se cayó la conexión; reconectando", { porque, intento: intentos.current });
            setEstado("reconectando");
            setPistas(SIN_PISTAS);
            const intento = intentos.current++;
            if (intento >= INTENTOS_DE_RECONEXION) {
                setEstado("sin_conexion");
                return;
            }
            window.setTimeout(() => {
                fetch(`/api/videollamada/sala?${consulta}`, { method: "POST" })
                    .then((r) => r.json())
                    .then((r) => {
                        if (r?.ok && r.url) {
                            setConexion((c) => ({ url: r.url, reentrada: true, vuelta: c.vuelta + 1 }));
                        } else if (["cerrada", "cancelada", "no_existe"].includes(r?.estado)) {
                            setEstado("terminada");
                        } else {
                            aProposito = false;
                            reconectar(r?.estado ?? "sin respuesta");
                        }
                    })
                    .catch((e) => {
                        aProposito = false;
                        reconectar(e);
                    });
            }, laEsperaDelIntento(intento));
        };
        for (const ev of ["participant-joined", "participant-updated", "participant-left", "track-started", "track-stopped"] as const) {
            llamada.on(ev, refrescar);
        }
        llamada.on("joined-meeting", () => {
            intentos.current = 0;
            setEstado("dentro");
            setError(null);
            refrescar();
            conversacionRef.current = elIdDeLaConversacion(conexion.url);
            if (conexion.reentrada) contarleAVerzy(AL_VOLVER);
        });
        llamada.on("left-meeting", () => reconectar("left-meeting"));
        llamada.on("error", (ev) => reconectar(ev));
        llamada.on("local-screen-share-started", () => setPantallaOn(true));
        llamada.on("local-screen-share-stopped", () => setPantallaOn(false));
        llamada.on("app-message", (ev) => {
            const dicho = loQueDijoElCliente(ev?.data);
            if (dicho) {
                setNotas((n) => conLaNota(n, dicho));
                return;
            }
            const agenda = laOrdenDeAgendar(ev?.data);
            if (agenda) {
                agendar(agenda);
                return;
            }
            const envio = laOrdenDeEnvio(ev?.data);
            if (envio) {
                mandarPorWhatsapp(envio);
                return;
            }
            const orden = laOrdenDeLaPantalla(ev?.data);
            if (!orden) return;
            setPagina(orden.accion === "mostrar" ? orden.pagina : null);
        });
        llamada.on("camera-error", (ev) => {
            console.warn("[videollamada] sin cámara o micrófono", ev);
            setError("No pudimos usar tu cámara o micrófono. Revisa los permisos del navegador; Verzy te sigue escuchando si das acceso al micrófono.");
        });
        // El nombre sale de la cita: nunca se le pide al prospecto.
        const conNombre = nombre?.trim();
        llamada.join(conNombre ? { url: conexion.url, userName: conNombre } : { url: conexion.url }).catch((e) => {
            console.error("[videollamada] no se pudo entrar", e);
            aProposito = false;
            reconectar(e);
        });
        return () => {
            aProposito = true;
            llamadaRef.current = null;
            void llamada.destroy();
        };
    }, [conexion.url, conexion.vuelta]); // eslint-disable-line react-hooks/exhaustive-deps

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
    const enMiniatura = !!pagina;
    // La pizarra es el CRM: ahí, y solo ahí, van las notas al lado.
    const conNotas = !!pagina && esLaVistaDelCrm(pagina.ruta);

    return (
        <main data-zona="sala" className="relative h-[100dvh] w-full overflow-hidden bg-slate-950 text-slate-100">
            {pagina && (
                <section
                    data-zona="pantalla-del-avatar"
                    data-pagina={pagina.clave}
                    className="absolute inset-x-0 top-0 bottom-16 flex flex-col"
                >
                    <header className="flex h-10 shrink-0 items-center gap-2 px-4 text-sm text-slate-300">
                        <span className="h-2 w-2 rounded-full bg-emerald-400" aria-hidden />
                        Verzy te está mostrando: <strong className="text-slate-100">{pagina.titulo}</strong>
                    </header>
                    <div className="flex min-h-0 flex-1 flex-col md:flex-row">
                        <iframe
                            ref={marco}
                            key={destino!.ruta}
                            src={destino!.ruta}
                            onLoad={() => bajarAlAncla(marco.current, destino!.ancla)}
                            title={`Pantalla de Verzy: ${pagina.titulo}`}
                            className="min-h-0 w-full flex-1 bg-white"
                        />
                        {conNotas && (
                            <aside
                                data-zona="notas"
                                className="flex max-h-[35%] shrink-0 flex-col border-t border-slate-800 bg-slate-950 px-3 md:max-h-none md:w-72 md:border-l md:border-t-0"
                            >
                                <header className="flex h-10 shrink-0 items-center gap-2 text-sm text-slate-300">
                                    <span className="h-2 w-2 rounded-full bg-emerald-400" aria-hidden />
                                    Notas de la llamada
                                </header>
                                {notas.length ? (
                                    <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto pb-4">
                                        {notas.map((n, i) => (
                                            <li key={`${i}-${n}`} className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-slate-100">
                                                {n}
                                            </li>
                                        ))}
                                    </ul>
                                ) : (
                                    <p className="pb-4 text-sm text-slate-500">Verzy apunta aquí lo que vas contando.</p>
                                )}
                            </aside>
                        )}
                    </div>
                </section>
            )}
            <div
                data-zona="avatar"
                data-miniatura={enMiniatura ? "si" : "no"}
                className={
                    enMiniatura
                        ? "absolute bottom-16 right-2 z-20 h-28 w-40 overflow-hidden rounded-lg border border-slate-700 bg-black shadow-lg sm:bottom-2 sm:h-32 sm:w-48"
                        : "absolute inset-x-0 top-0 bottom-16 bg-black"
                }
            >
                <video
                    ref={videoAvatar}
                    data-zona="video-del-avatar"
                    autoPlay
                    playsInline
                    muted
                    className={`h-full w-full bg-black ${enMiniatura ? "object-cover" : "object-contain"}`}
                />
                {(estado === "entrando" || estado === "dentro") && !pistas.avatarVideo && (
                    <p data-zona="conectando" className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-slate-300">
                        <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" aria-hidden />
                        Conectando con Verzy…
                    </p>
                )}
            </div>
            <audio ref={audioAvatar} autoPlay />
            {estado === "reconectando" && (
                <p data-zona="reconectando" className="absolute inset-0 z-30 flex items-center justify-center gap-2 bg-slate-950/80 text-sm text-slate-200">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-amber-400" aria-hidden />
                    Se cortó la conexión. Reconectando…
                </p>
            )}
            {(estado === "sin_conexion" || estado === "terminada") && (
                <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-slate-950 px-6 text-center">
                    <p className="text-base">
                        {estado === "terminada" ? "La videollamada terminó." : "No pudimos reconectar la videollamada."}
                    </p>
                    {estado === "sin_conexion" && (
                        <button type="button" onClick={reentrar} className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-white">
                            Volver a entrar
                        </button>
                    )}
                </div>
            )}
            {sinSonido && (
                <button
                    type="button"
                    onClick={activarSonido}
                    className="absolute inset-x-4 top-4 z-30 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white"
                >
                    Toca aquí para escuchar a Verzy
                </button>
            )}
            <div data-zona="mandos" className="absolute inset-x-0 bottom-0 z-10 flex h-16 items-center justify-center gap-2 px-2">
                {estado === "dentro" && (
                    <>
                        <button
                            type="button"
                            data-mando="camara"
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
                    </>
                )}
            </div>
            {error && (
                <p role="alert" className="absolute inset-x-4 top-4 z-30 rounded-lg bg-red-600/90 px-3 py-2 text-sm">
                    {error}
                </p>
            )}
        </main>
    );
}
