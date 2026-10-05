"use client";

import { useEffect, useRef, useState } from "react";
import DailyIframe, { type DailyCall } from "@daily-co/daily-js";
import {
    laOrdenDeAgendar,
    laOrdenDeEnvio,
    laOrdenDeLaPantalla,
    laOrdenDeTomarNota,
    type OrdenDeAgendar,
    type OrdenDeEnvio,
} from "@/lib/pantalla-del-avatar";
import {
    loQueSeLeCuentaAVerzy,
    type LugarDeVerzy,
    type OrdenDeLaPantalla,
} from "@/lib/pantalla-de-verzy";
import { NOVEDADES_CADA_MS } from "@/lib/videollamada-en-vivo";
import { SALUDO_INICIAL } from "@/lib/videollamada-crm";
import {
    AL_DESPEDIRSE_EL_CLIENTE,
    ESPERA_TRAS_LA_DESPEDIDA_MS,
    GRACIA_SI_VERZY_SALE_MS,
    loQueTerminaLaLlamada,
    TOPE_DE_LA_DESPEDIDA_MS,
} from "@/lib/fin-de-la-videollamada";

/** Si el video de la pantalla se corta, cuánto se espera para reabrirlo (sube con cada intento). */
export const REABRIR_EL_VIDEO_MS = 1_500;
/**
 * Margen entre entrar a la sala y el saludo: el cliente todavía está
 * acomodando la pantalla y el sonido, y un «hola» dicho en el primer segundo
 * se pierde. El saludo lo dice SIEMPRE la sala pasado este rato (Tavus ya no
 * saluda solo al conectar).
 */
export const ESPERA_DEL_SALUDO_MS = 2_500;
/** Lo que se le cuenta a Verzy después de que la sala dijo el saludo por ella. */
export function yaSaludaste(saludo: string): string {
    return `Ya saludaste al cliente con «${saludo}». No vuelvas a saludar: espera a que responda y sigue el guion con frases cortas.`;
}

/** ¿Este mensaje dice si Verzy empezó (true) o terminó (false) de hablar? null si no dice nada de eso. */
export function siVerzyEstaHablando(mensaje: unknown): boolean | null {
    const m = (mensaje ?? {}) as { event_type?: unknown };
    if (m.event_type === "conversation.replica.started_speaking") return true;
    if (m.event_type === "conversation.replica.stopped_speaking") return false;
    return null;
}

/** ¿Este mensaje de Tavus dice que el avatar está hablando? */
export function esQueVerzyHabla(mensaje: unknown): boolean {
    const m = (mensaje ?? {}) as { event_type?: unknown; properties?: { role?: unknown } };
    if (m.event_type === "conversation.replica.started_speaking") return true;
    return m.event_type === "conversation.utterance" && m.properties?.role === "replica";
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

type VozDeHumano = { id: string; audio: MediaStreamTrack };
type Pistas = { avatarVideo: MediaStreamTrack | null; avatarAudio: MediaStreamTrack | null; humanos: VozDeHumano[] };
const SIN_PISTAS: Pistas = { avatarVideo: null, avatarAudio: null, humanos: [] };

/** Cada persona entra marcada (`userData.humano`): así se distingue del avatar
 * de Tavus, que es el único remoto SIN la marca. */
export const MARCA_DE_HUMANO = { humano: true } as const;
type Remoto = ReturnType<DailyCall["participants"]>[string];
export function esHumano(p: { userData?: unknown }): boolean {
    return !!(p.userData && typeof p.userData === "object" && (p.userData as { humano?: unknown }).humano === true);
}
/** El avatar: el remoto sin la marca de persona (prefiere el que se llama
 * como la réplica de Tavus si hubiera más de uno). */
export function elAvatarEntre<T extends { user_name?: string; userData?: unknown }>(remotos: T[]): T | undefined {
    const sinMarca = remotos.filter((p) => !esHumano(p));
    return sinMarca.find((p) => /tavus|replica/i.test(p.user_name ?? "")) ?? sinMarca[0];
}

/** Lee las pistas: video y voz del avatar, y la VOZ de cada otra persona de la
 * sala. Sin pintar la voz de los demás, dos personas en la misma reunión no se
 * oían entre sí (el avatar sí las oía). La cámara propia no se pinta. */
function lasPistas(llamada: DailyCall): Pistas {
    const remotos = Object.values(llamada.participants()).filter((p) => !p.local) as Remoto[];
    const avatar = elAvatarEntre(remotos);
    const pista = (p: Remoto | undefined, tipo: "video" | "audio") =>
        p?.tracks?.[tipo]?.state === "playable" ? p.tracks[tipo].persistentTrack ?? null : null;
    const humanos: VozDeHumano[] = [];
    for (const p of remotos) {
        if (p === avatar) continue;
        const audio = pista(p, "audio");
        if (audio) humanos.push({ id: p.session_id, audio });
    }
    return { avatarVideo: pista(avatar, "video"), avatarAudio: pista(avatar, "audio"), humanos };
}

/** La voz de otra persona de la sala: un `<audio>` por persona. */
function VozDeOtraPersona({ id, pista, bloqueado }: { id: string; pista: MediaStreamTrack; bloqueado: () => void }) {
    const ref = usarPista(pista);
    useEffect(() => {
        ref.current?.play().catch(() => bloqueado());
    }, [pista]); // eslint-disable-line react-hooks/exhaustive-deps
    return <audio ref={ref} autoPlay data-zona="voz-de-persona" data-persona={id} />;
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
export default function SalaDeLaVideollamada({
    url: urlInicial,
    nombre,
    citaId,
    firma,
    reentrada = false,
    saludo = SALUDO_INICIAL,
}: {
    url: string;
    nombre?: string | null;
    citaId: string;
    firma: string;
    reentrada?: boolean;
    /** El saludo del guion de la cuenta (Agente IA › Videollamadas); de fábrica, SALUDO_INICIAL. */
    saludo?: string;
}) {
    const [conexion, setConexion] = useState({ url: urlInicial, reentrada, vuelta: 0 });
    // Lo que Verzy enseña: una pantalla REAL de Verzay Ventas, navegada en el
    // servidor. Aquí solo llegan sus fotos.
    const [destino, setDestino] = useState<LugarDeVerzy | null>(null);
    // La última pantalla que de verdad se abrió. Una vez Verzy comparte
    // pantalla, el avatar se queda en miniatura el resto de la reunión: aunque
    // la oculte o una orden falle, se sigue viendo la última.
    const [pantallaFija, setPantallaFija] = useState<LugarDeVerzy | null>(null);
    const [video, setVideo] = useState(0);
    const consulta = `c=${encodeURIComponent(citaId)}&f=${encodeURIComponent(firma)}`;
    const verzyHablo = useRef(false);
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
    // Colgar a propósito (Salir, una despedida, Verzy que se va): nunca reconecta.
    const colgarRef = useRef<() => void>(() => {});

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

    // Al montar se deja la sesión de Verzay Ventas lista, para que la primera
    // pantalla no tarde lo que tarda abrir un navegador.
    useEffect(() => {
        fetch(`/api/videollamada/pantalla?preparar=1&${consulta}`)
            .then((r) => r.json())
            .then((r) => {
                if (!r?.ok) console.warn("[videollamada] la pantalla de Verzy no quedó lista", r?.motivo);
            })
            .catch((e) => console.warn("[videollamada] no se pudo preparar la pantalla", e));
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // La pantalla es un VIDEO en vivo (MJPEG): el navegador lo pinta solo,
    // fotograma a fotograma. Si se corta, se reabre con una espera creciente.
    const intentosDelVideo = useRef(0);
    const reabrirElVideo = () => {
        const n = ++intentosDelVideo.current;
        console.warn("[videollamada] se cortó el video de la pantalla; se reabre", { intento: n });
        window.setTimeout(() => setVideo((v) => v + 1), Math.min(REABRIR_EL_VIDEO_MS * n, 10_000));
    };

    // Una orden de Verzy (ir a un destino o apuntar una nota) va al servidor,
    // y lo que de verdad pasó se le cuenta a Verzy: nunca dice algo que no pasó.
    const pedirALaPantalla = (orden: OrdenDeLaPantalla) => {
        const cuerpo =
            orden.tipo === "ir"
                ? { tipo: "ir", lugar: orden.datos.lugar }
                : orden.tipo === "nota"
                  ? { tipo: "nota", texto: orden.datos.texto }
                  : null;
        if (!cuerpo) return;
        if (orden.tipo === "ir") {
            setDestino(orden.datos.lugar);
        }
        fetch(`/api/videollamada/pantalla?${consulta}`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(cuerpo),
        })
            .then((r) => r.json())
            .then((r) => {
                const resultado = r && typeof r.ok === "boolean" ? r : { ok: false, motivo: "sin respuesta" };
                if (!resultado.ok) console.warn("[videollamada] la pantalla no hizo la orden", { orden, motivo: resultado.motivo });
                if (orden.tipo === "ir") {
                    if (resultado.ok) setPantallaFija(orden.datos.lugar);
                    else setDestino(null);
                }
                const contexto = loQueSeLeCuentaAVerzy(orden, resultado);
                if (contexto) contarleAVerzy(contexto);
            })
            .catch((e) => {
                console.warn("[videollamada] no se pudo pedir a la pantalla", e);
                if (orden.tipo === "ir") setDestino(null);
                const contexto = loQueSeLeCuentaAVerzy(orden, { ok: false, motivo: "sin conexión" });
                if (contexto) contarleAVerzy(contexto);
            });
    };

    // El saludo: pasado el margen de arranque, la sala le hace decir a Verzy
    // el saludo de la cuenta y le cuenta que ya saludó. Nunca en
    // una reentrada (ya se saludaron), ni si Verzy ya habló por su cuenta.
    const saludarTrasElMargen = (llamada: DailyCall) => {
        window.setTimeout(() => {
            const conversacion = conversacionRef.current;
            if (verzyHablo.current || llamadaRef.current !== llamada || !conversacion) return;
            console.info("[videollamada] saluda la sala tras el margen de arranque");
            try {
                llamada.sendAppMessage({
                    message_type: "conversation",
                    event_type: "conversation.echo",
                    conversation_id: conversacion,
                    properties: { text: saludo || SALUDO_INICIAL },
                }, "*");
                contarleAVerzy(yaSaludaste(saludo || SALUDO_INICIAL));
            } catch (e) {
                console.warn("[videollamada] no se pudo mandar el saludo", e);
            }
        }, ESPERA_DEL_SALUDO_MS);
    };

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
        // Colgar de verdad: sin reconectar, y la sala dice que terminó.
        let colgada = false;
        const colgar = (porque: string) => {
            if (colgada) return;
            colgada = true;
            aProposito = true;
            console.info("[videollamada] se cuelga", { porque });
            setEstado("terminada");
            setPistas(SIN_PISTAS);
            setDestino(null);
            setPantallaFija(null);
            void llamada.leave().catch(() => {});
        };
        colgarRef.current = () => colgar("salir");
        // Despedida: se cuelga cuando Verzy termina su frase (con un tope).
        let despidiendo: number | null = null;
        let tope: number | null = null;
        const colgarTrasLaDespedida = (porque: string) => {
            if (despidiendo !== null) window.clearTimeout(despidiendo);
            despidiendo = window.setTimeout(() => colgar(porque), ESPERA_TRAS_LA_DESPEDIDA_MS);
        };
        let verzySalio: number | null = null;
        for (const ev of ["participant-joined", "participant-updated", "participant-left", "track-started", "track-stopped"] as const) {
            llamada.on(ev, refrescar);
        }
        llamada.on("participant-joined", (ev) => {
            if (!ev?.participant?.local && !esHumano(ev.participant) && verzySalio !== null) {
                window.clearTimeout(verzySalio);
                verzySalio = null;
            }
        });
        // Verzy (el único remoto) se fue: si no vuelve en la gracia, se cuelga.
        llamada.on("participant-left", (ev) => {
            if (ev?.participant?.local || (ev?.participant && esHumano(ev.participant))) return;
            if (verzySalio !== null) window.clearTimeout(verzySalio);
            verzySalio = window.setTimeout(() => {
                const quedan = Object.values(llamada.participants()).some((p) => !p.local && !esHumano(p));
                if (!quedan) colgar("verzy-salio");
            }, GRACIA_SI_VERZY_SALE_MS);
        });
        llamada.on("joined-meeting", () => {
            intentos.current = 0;
            setEstado("dentro");
            setError(null);
            refrescar();
            conversacionRef.current = elIdDeLaConversacion(conexion.url);
            // Entrar de verdad es esto, no abrir la página: se apunta aquí.
            void fetch(`/api/videollamada/sala?${consulta}`, { method: "PUT" }).catch((e) =>
                console.warn("[videollamada] no se pudo apuntar la entrada", e),
            );
            if (conexion.reentrada) contarleAVerzy(AL_VOLVER);
            else saludarTrasElMargen(llamada);
        });
        llamada.on("left-meeting", () => {
            if (!colgada) reconectar("left-meeting");
        });
        llamada.on("error", (ev) => reconectar(ev));
        llamada.on("local-screen-share-started", () => setPantallaOn(true));
        llamada.on("local-screen-share-stopped", () => setPantallaOn(false));
        llamada.on("app-message", (ev) => {
            const fin = loQueTerminaLaLlamada(ev?.data);
            if (fin?.tipo === "fin") {
                colgar("fin-de-tavus");
                return;
            }
            if (fin?.tipo === "despedida" && tope === null) {
                if (fin.quien === "cliente") contarleAVerzy(AL_DESPEDIRSE_EL_CLIENTE);
                tope = window.setTimeout(() => colgar(`despedida-${fin.quien}-tope`), TOPE_DE_LA_DESPEDIDA_MS);
            }
            if (fin?.tipo === "verzy_termino_de_hablar" && tope !== null) {
                colgarTrasLaDespedida("despedida");
            }
            // A DÓNDE va la pantalla lo decide SOLO Verzy con su herramienta:
            // que hable no mueve nada.
            const hablando = siVerzyEstaHablando(ev?.data);
            if (esQueVerzyHabla(ev?.data) || hablando === false) {
                verzyHablo.current = true;
                return;
            }
            const nota = laOrdenDeTomarNota(ev?.data);
            if (nota) {
                pedirALaPantalla({ tipo: "nota", datos: { texto: nota.texto } });
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
            if (orden.accion === "ocultar") setDestino(null);
            else pedirALaPantalla({ tipo: "ir", datos: { lugar: orden.lugar } });
        });
        llamada.on("camera-error", (ev) => {
            console.warn("[videollamada] sin cámara o micrófono", ev);
            setError("No pudimos usar tu cámara o micrófono. Revisa los permisos del navegador; Verzy te sigue escuchando si das acceso al micrófono.");
        });
        // El nombre sale de la cita: nunca se le pide al prospecto.
        const conNombre = nombre?.trim();
        llamada.join(conNombre ? { url: conexion.url, userName: conNombre, userData: MARCA_DE_HUMANO } : { url: conexion.url, userData: MARCA_DE_HUMANO }).catch((e) => {
            console.error("[videollamada] no se pudo entrar", e);
            aProposito = false;
            reconectar(e);
        });
        return () => {
            aProposito = true;
            colgada = true;
            if (despidiendo !== null) window.clearTimeout(despidiendo);
            if (tope !== null) window.clearTimeout(tope);
            if (verzySalio !== null) window.clearTimeout(verzySalio);
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
        const voces = [audioAvatar.current, ...Array.from(document.querySelectorAll<HTMLAudioElement>('[data-zona="voz-de-persona"]'))];
        void Promise.all(voces.filter(Boolean).map((el) => el!.play()))
            .then(() => setSinSonido(false))
            .catch(() => setSinSonido(true));
    };
    const alternarPantalla = () => {
        const llamada = llamadaRef.current;
        if (!llamada) return;
        if (pantallaOn) llamada.stopScreenShare();
        else llamada.startScreenShare();
    };
    const reentrar = () => window.location.reload();
    const pantallaQueSeVe = destino ?? pantallaFija;
    const enMiniatura = !!pantallaQueSeVe;

    return (
        <main data-zona="sala" className="relative h-[100dvh] w-full overflow-hidden bg-slate-950 text-slate-100">
            {pantallaQueSeVe && (
                <section
                    data-zona="pantalla-del-avatar"
                    data-destino={pantallaQueSeVe}
                    className="absolute inset-x-0 top-0 bottom-16 flex flex-col"
                >
                    <header className="flex h-10 shrink-0 items-center gap-2 px-4 text-sm text-slate-300">
                        <span className="h-2 w-2 rounded-full bg-emerald-400" aria-hidden />
                        Verzy te está mostrando: <strong className="text-slate-100">{pantallaQueSeVe}</strong>
                    </header>
                    <div className="flex min-h-0 flex-1 items-center justify-center bg-slate-900">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            data-zona="video-de-la-pantalla"
                            src={`/api/videollamada/pantalla?stream=1&${consulta}&k=${video}`}
                            onLoad={() => { intentosDelVideo.current = 0; }}
                            onError={reabrirElVideo}
                            alt={`Pantalla de Verzay Ventas: ${pantallaQueSeVe}`}
                            className="max-h-full max-w-full object-contain"
                        />
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
            {pistas.humanos.map((h) => (
                <VozDeOtraPersona key={h.id} id={h.id} pista={h.audio} bloqueado={() => setSinSonido(true)} />
            ))}
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
                        <button
                            type="button"
                            data-mando="salir"
                            onClick={() => colgarRef.current()}
                            className="rounded-full bg-red-600 px-4 py-2 text-sm font-medium text-white"
                        >
                            Salir
                        </button>
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
