"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { useGrabacionDeLaVideollamada, type LoQueSeVe } from "@/hooks/useGrabacionDeLaVideollamada";
import { useMandosQueSeEsconden } from "@/hooks/useMandosQueSeEsconden";
import DailyIframe, { type DailyCall } from "@daily-co/daily-js";
import { Mic, MicOff, MonitorOff, MonitorUp, PhoneOff, Video, VideoOff } from "lucide-react";
import {
    laOrdenDeAgendar,
    laOrdenDeEnvio,
    laOrdenDeLaPantalla,
    elAvisoDeRutaInvalida,
    laOrdenDeTomarNota,
    type OrdenDeAgendar,
    type OrdenDeEnvio,
} from "@/lib/pantalla-del-avatar";
import {
    elDispositivo,
    loQueSeLeCuentaAVerzy,
    type LugarDeVerzy,
    type OrdenDeLaPantalla,
} from "@/lib/pantalla-de-verzy";
import { NOVEDADES_CADA_MS } from "@/lib/videollamada-en-vivo";
import { AL_CALLARSE, AL_LLAMARLO_DE_NUEVO, loQueHaceConElSilencio } from "@/lib/silencio-de-verzy";
import { SALUDO_INICIAL } from "@/lib/videollamada-crm";
import {
    AL_DESPEDIRSE_EL_CLIENTE,
    ESPERA_TRAS_LA_DESPEDIDA_MS,
    GRACIA_SI_VERZY_SALE_MS,
    loQueTerminaLaLlamada,
    TOPE_DE_LA_DESPEDIDA_MS,
    terminaLaConversacionAlColgar,
} from "@/lib/fin-de-la-videollamada";
import { elAbajoDeLoGrande, AJUSTE_DE_LA_PANTALLA, ESLOGAN_DE_LA_PORTADA, laDisposicion, LOGO_DE_LA_PORTADA, NOMBRE_DE_LA_PORTADA, TEXTO_DE_LA_PORTADA, TOPE_DE_LA_PRESENTACION_MS } from "@/lib/disposicion-de-la-videollamada";
import { elCierreDeLaSala, LIMITE_DE_FABRICA_MIN } from "@/lib/videollamada-ia";
import { laSalaGraba } from "@/lib/grabacion-de-videollamada";

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
type Pistas = {
    avatarVideo: MediaStreamTrack | null;
    avatarAudio: MediaStreamTrack | null;
    humanos: VozDeHumano[];
    /** La cámara y la pantalla del ASESOR (quien entra marcado como del equipo). La del cliente no se pinta nunca. */
    asesorCamara: MediaStreamTrack | null;
    asesorPantalla: MediaStreamTrack | null;
    /** Mi micrófono: no se pinta (nadie se oye a sí mismo), solo entra en la grabación. */
    miMicro: MediaStreamTrack | null;
    /** ¿Hay un CLIENTE (persona sin la marca de asesor) en la sala, yo incluido? Decide si un asesor graba (`laSalaGraba`). */
    hayCliente: boolean;
};
const SIN_PISTAS: Pistas = { avatarVideo: null, avatarAudio: null, humanos: [], asesorCamara: null, asesorPantalla: null, miMicro: null, hayCliente: false };

/** Cada persona entra marcada (`userData.humano`): así se distingue del avatar
 * de Tavus, que es el único remoto SIN la marca. */
export const MARCA_DE_HUMANO = { humano: true } as const;
/** La marca de quien entra como alguien del EQUIPO (un asesor). */
export function laMarcaDe(esAsesor: boolean) {
    return esAsesor ? { humano: true, asesor: true } : MARCA_DE_HUMANO;
}
export function esAsesorDeLaSala(p: { userData?: unknown }): boolean {
    return esHumano(p) && (p.userData as { asesor?: unknown }).asesor === true;
}
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
function lasPistas(llamada: DailyCall, soyAsesor: boolean): Pistas {
    const todos = llamada.participants();
    const remotos = Object.values(todos).filter((p) => !p.local) as Remoto[];
    const avatar = elAvatarEntre(remotos);
    const pista = (p: Remoto | undefined, tipo: "video" | "audio" | "screenVideo") =>
        p?.tracks?.[tipo]?.state === "playable" ? p.tracks[tipo].persistentTrack ?? null : null;
    const humanos: VozDeHumano[] = [];
    for (const p of remotos) {
        if (p === avatar) continue;
        const audio = pista(p, "audio");
        if (audio) humanos.push({ id: p.session_id, audio });
    }
    // El asesor: yo mismo si entré como del equipo; si no, el remoto marcado.
    const asesor = soyAsesor ? (todos.local as Remoto | undefined) : remotos.find((p) => p !== avatar && esAsesorDeLaSala(p));
    return {
        avatarVideo: pista(avatar, "video"),
        avatarAudio: pista(avatar, "audio"),
        humanos,
        asesorCamara: pista(asesor, "video"),
        asesorPantalla: pista(asesor, "screenVideo"),
        miMicro: pista(todos.local as Remoto | undefined, "audio"),
        hayCliente: !soyAsesor || remotos.some((p) => p !== avatar && esHumano(p) && !esAsesorDeLaSala(p)),
    };
}

/** ¿Un video viene de pie (cámara de un teléfono en vertical)? */
export function esVertical(ancho: number, alto: number): boolean {
    return alto > ancho;
}

/** Un video de la sala; avisa si viene de pie para darle una miniatura vertical. */
function VideoDePista({ pista, cubrir, onVertical }: { pista: MediaStreamTrack | null; cubrir: boolean; onVertical?: (v: boolean) => void }) {
    const ref = usarPista(pista);
    const medir = (e: { currentTarget: HTMLVideoElement }) => {
        const v = e.currentTarget;
        if (v.videoWidth > 0 && v.videoHeight > 0) onVertical?.(esVertical(v.videoWidth, v.videoHeight));
    };
    return (
        <video
            ref={ref}
            autoPlay
            playsInline
            muted
            onLoadedMetadata={medir}
            onResize={medir}
            className={`h-full w-full bg-black ${cubrir ? "object-cover" : "object-contain"}`}
        />
    );
}

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
    limiteMinutos = LIMITE_DE_FABRICA_MIN,
    empezoEn = null,
    esAsesor = false,
}: {
    url: string;
    nombre?: string | null;
    citaId: string;
    firma: string;
    reentrada?: boolean;
    /** El saludo del guion de la cuenta (Agente IA › Videollamadas); de fábrica, SALUDO_INICIAL. */
    saludo?: string;
    /** Minutos que dura como mucho la sala (Agenda › Ajustes); llegado el tope se cuelga. */
    limiteMinutos?: number;
    /** Cuándo empezó de verdad (ISO); sin él, desde que se abrió esta página. */
    empezoEn?: string | null;
    /** ¿Quien abre es del equipo? Entonces su cámara y su pantalla se ven cuando toma la palabra. */
    esAsesor?: boolean;
}) {
    const inicioRef = useRef(new Date());
    // «Verzy, yo sigo desde aquí»: el asesor toma la palabra.
    const [asesorAlMando, setAsesorAlMando] = useState(false);
    // La presentación inicial (Verzy en grande) termina una vez y no vuelve.
    const [presentacionAcabo, setPresentacionAcabo] = useState(false);
    const [conexion, setConexion] = useState({ url: urlInicial, reentrada, vuelta: 0 });
    // Lo que Verzy enseña: una pantalla REAL de Verzay Ventas, navegada en el
    // servidor. Aquí solo llegan sus fotos.
    const [destino, setDestino] = useState<LugarDeVerzy | null>(null);
    // La última pantalla que de verdad se abrió. Una vez Verzy comparte
    // pantalla, el avatar se queda en miniatura el resto de la reunión: aunque
    // la oculte o una orden falle, se sigue viendo la última.
    const [pantallaFija, setPantallaFija] = useState<LugarDeVerzy | null>(null);
    // Fijo: en cuanto Verzy pide compartir una pantalla, la presentación acabó
    // para siempre, salga bien o mal esa pantalla (regla 5 de la disposición).
    const [yaSeCompartio, setYaSeCompartio] = useState(false);
    const [video, setVideo] = useState(0);
    const consulta = `c=${encodeURIComponent(citaId)}&f=${encodeURIComponent(firma)}`;
    const verzyHablo = useRef(false);
    const [error, setError] = useState<string | null>(null);
    const [estado, setEstado] = useState<Estado>("entrando");
    const [pistas, setPistas] = useState<Pistas>(SIN_PISTAS);
    const [camOn, setCamOn] = useState(true);
    const [micOn, setMicOn] = useState(true);
    const [pantallaOn, setPantallaOn] = useState(false);
    const [sinSonido, setSinSonido] = useState(false);
    // Compartir pantalla solo se ofrece donde el navegador lo deja (un iPhone no).
    const [hayCompartir, setHayCompartir] = useState(false);
    // ¿La cámara del avatar o la del asesor llega VERTICAL (un teléfono de pie)?
    const [avatarVertical, setAvatarVertical] = useState(false);
    const [asesorVertical, setAsesorVertical] = useState(false);
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

    // «Verzy, yo sigo desde aquí»: callado hasta que lo llamen por su nombre.
    // El modelo no puede cortar su propia voz, así que lo corta la sala.
    const silenciadoRef = useRef(false);
    const cortarAVerzy = () => {
        const llamada = llamadaRef.current;
        const conversacion = conversacionRef.current;
        if (!llamada || !conversacion) return;
        try {
            llamada.sendAppMessage({
                message_type: "conversation",
                event_type: "conversation.interrupt",
                conversation_id: conversacion,
            }, "*");
        } catch (e) {
            console.warn("[videollamada] no se pudo interrumpir a Verzy", e);
        }
    };
    const silenciarAVerzy = (si: boolean) => {
        silenciadoRef.current = si;
        setAsesorAlMando(si);
        if (si) setPresentacionAcabo(true);
        if (audioAvatar.current) audioAvatar.current.muted = si;
        if (si) cortarAVerzy();
        contarleAVerzy(si ? AL_CALLARSE : AL_LLAMARLO_DE_NUEVO);
        console.info(si ? "[videollamada] Verzy se calla: tomó la palabra un asesor" : "[videollamada] Verzy vuelve a hablar");
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

    // El navegador del servidor pinta la pantalla con el FORMATO del hueco
    // donde se ve aquí: si no, el video (1280×800) deja franjas a los lados.
    const [cajaDeLaPantalla, setCajaDeLaPantalla] = useState<HTMLDivElement | null>(null);
    // Con los mandos escondidos la caja baja hasta el borde (80 px más): se
    // descuentan, o cada vez que se apartan el servidor cambiaría de tamaño.
    const mandosOcultosRef = useRef(false);
    // El dispositivo de ESTA sala: el flujo pide la vista de su dispositivo
    // (cada sala la suya: el teléfono en vertical, el ordenador en horizontal).
    const [dispositivoDeLaPantalla, setDispositivoDeLaPantalla] = useState<string | null>(null);
    useEffect(() => {
        const caja = cajaDeLaPantalla;
        if (!caja || typeof ResizeObserver === "undefined") return;
        let espera: number | undefined;
        let ultimo = "";
        const avisar = () => {
            const { width, height } = caja.getBoundingClientRect();
            const ancho = Math.round(width);
            const alto = Math.round(height) - (mandosOcultosRef.current ? 80 : 0);
            if (ancho < 50 || alto < 50) return;
            // El servidor emula el DISPOSITIVO del cliente (móvil, tableta o
            // PC), no solo la forma del hueco.
            const dispositivo = elDispositivo(window.innerWidth);
            const llave = `${ancho}x${alto}x${dispositivo}`;
            if (llave === ultimo) return;
            ultimo = llave;
            setDispositivoDeLaPantalla(dispositivo);
            fetch(`/api/videollamada/pantalla?${consulta}`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ tipo: "tamano", ancho, alto, dispositivo }),
            })
                .then((r) => r.json())
                .then((r) => { if (!r?.ok) console.warn("[videollamada] la pantalla no cambió de tamaño", r?.motivo); })
                .catch((e) => console.warn("[videollamada] no se pudo ajustar el tamaño de la pantalla", e));
        };
        const ro = new ResizeObserver(() => {
            window.clearTimeout(espera);
            espera = window.setTimeout(avisar, 250);
        });
        ro.observe(caja);
        avisar();
        return () => { ro.disconnect(); window.clearTimeout(espera); };
    }, [cajaDeLaPantalla]); // eslint-disable-line react-hooks/exhaustive-deps

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
            setYaSeCompartio(true);
            setPresentacionAcabo(true);
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
            setPistas(lasPistas(llamada, esAsesor));
            setCamOn(!!llamada.participants().local?.video);
            setMicOn(!!llamada.participants().local?.audio);
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
            // A propósito y sin nadie más en la sala: se le dice a Tavus que
            // terminó (deja de cobrar ya; una caída de red no pasa por aquí).
            let quedanOtrasPersonas = false;
            try {
                quedanOtrasPersonas = Object.values(llamada.participants()).some((p) => !p.local && esHumano(p));
            } catch {
                // Sin la lista, se termina igual: quien cuelga es quien está.
            }
            if (terminaLaConversacionAlColgar({ porque, quedanOtrasPersonas })) {
                void fetch(`/api/videollamada/sala?${consulta}`, { method: "DELETE", keepalive: true }).catch((e) =>
                    console.warn("[videollamada] no se pudo terminar la conversación al colgar", e),
                );
            }
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
        let finDeLaPresentacion: number | null = null;
        // El límite de duración: se cuelga sola al llegar, contando desde que empezó de verdad.
        const cierre = elCierreDeLaSala(empezoEn ?? inicioRef.current, new Date(), limiteMinutos);
        const limite = window.setTimeout(() => colgar("limite"), Math.max(0, cierre.getTime() - Date.now()));
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
            // `quien=asesor`: un asesor que entra no es el prospecto, y no pone la cita en Atendida.
            void fetch(`/api/videollamada/sala?${consulta}${esAsesor ? "&quien=asesor" : ""}`, { method: "PUT" }).catch((e) =>
                console.warn("[videollamada] no se pudo apuntar la entrada", e),
            );
            if (conexion.reentrada) contarleAVerzy(AL_VOLVER);
            else saludarTrasElMargen(llamada);
            if (finDeLaPresentacion === null) {
                finDeLaPresentacion = window.setTimeout(() => setPresentacionAcabo(true), TOPE_DE_LA_PRESENTACION_MS);
            }
        });
        llamada.on("left-meeting", () => {
            if (!colgada) reconectar("left-meeting");
        });
        llamada.on("error", (ev) => reconectar(ev));
        llamada.on("local-screen-share-started", () => setPantallaOn(true));
        llamada.on("local-screen-share-stopped", () => setPantallaOn(false));
        llamada.on("app-message", (ev) => {
            // Va PRIMERO: nada detrás puede impedir que Verzy se calle.
            const silencio = loQueHaceConElSilencio(ev?.data, silenciadoRef.current);
            if (silencio) silenciarAVerzy(silencio === "silenciar");
            if (silenciadoRef.current && siVerzyEstaHablando(ev?.data) === true) cortarAVerzy();
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
            else if (orden.accion === "invalida") {
                // Nada se carga: una ruta vacía era el 404 de la primera pantalla.
                console.warn("[videollamada] Verzy pidió una pantalla que no es una ruta", { pedido: orden.pedido });
                contarleAVerzy(elAvisoDeRutaInvalida(orden.pedido));
            } else pedirALaPantalla({ tipo: "ir", datos: { lugar: orden.lugar } });
        });
        llamada.on("camera-error", (ev) => {
            console.warn("[videollamada] sin cámara o micrófono", ev);
            setError("No pudimos usar tu cámara o micrófono. Revisa los permisos del navegador; Verzy te sigue escuchando si das acceso al micrófono.");
        });
        // El nombre sale de la cita: nunca se le pide al prospecto.
        const conNombre = nombre?.trim();
        const marca = laMarcaDe(esAsesor);
        llamada.join(conNombre ? { url: conexion.url, userName: conNombre, userData: marca } : { url: conexion.url, userData: marca }).catch((e) => {
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
            if (finDeLaPresentacion !== null) window.clearTimeout(finDeLaPresentacion);
            window.clearTimeout(limite);
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
        // El botón sale siempre (los cuatro mandos en todas las anchuras); un
        // navegador sin `getDisplayMedia` (iPhone) lo dice en vez de no hacer nada.
        if (!pantallaOn && !hayCompartir) {
            setError("Tu dispositivo no permite compartir pantalla.");
            window.setTimeout(() => setError(null), 4000);
            return;
        }
        if (pantallaOn) llamada.stopScreenShare();
        else llamada.startScreenShare();
    };
    const reentrar = () => window.location.reload();
    const pantallaQueSeVe = destino ?? pantallaFija;
    // Qué va en grande y qué en miniatura lo decide la regla pura; la sala solo
    // le cuenta lo que sabe. La presentación acaba con la primera pantalla, un
    // asesor al mando, una reentrada o el tope de tiempo.
    const disp = laDisposicion({
        presentacionTerminada: presentacionAcabo || conexion.reentrada || !!pantallaFija,
        yaSeCompartio,
        pantallaVerzy: !!pantallaQueSeVe,
        asesorAlMando,
        asesor: { camara: !!pistas.asesorCamara, pantalla: !!pistas.asesorPantalla },
    });
    const avatarGrande = disp.grande === "avatar";
    const enMiniatura = disp.mini === "avatar";
    // Con una pantalla compartida en grande —la de Verzy, la de un asesor o la
    // propia— los mandos flotan encima y se apartan solos; vuelven al mover el
    // cursor, tocar o pulsar una tecla. Es el MISMO hook que Reuniones
    // (`useMandosQueSeEsconden`, regla en `lib/mandos-de-la-reunion.ts`).
    const hayPantallaCompartida =
        disp.grande === "pantalla-verzy" || disp.grande === "asesor-pantalla" || pantallaOn;
    const mandosFlotan = estado === "dentro" && hayPantallaCompartida;
    const mandos = useMandosQueSeEsconden({ activo: mandosFlotan });
    const mandosOcultos = mandosFlotan && !mandos.seVen;
    mandosOcultosRef.current = mandosOcultos;
    // La miniatura va encima de la barra de mandos y a 8 px de los bordes, en
    // todas las anchuras: con `sm:bottom-2` bajaba encima de los mandos.
    // La miniatura vive EN la barra de abajo, centrada con los botones
    // (BARRA_DE_ABAJO mide 80 px; la miniatura 64, a 8 de cada borde).
    // Una cámara VERTICAL (un teléfono de pie) va en una miniatura vertical,
    // recortando los lados; una horizontal, en la de siempre.
    const MINI_BASE = "absolute bottom-2 right-2 z-20 overflow-hidden rounded-lg border border-slate-700 bg-black shadow-lg";
    const miniDe = (vertical: boolean) => `${MINI_BASE} ${vertical ? "h-16 w-10" : "h-16 w-20 sm:w-28"}`;
    const MINI = miniDe(avatarVertical);
    // Lo grande acaba encima de la barra de abajo (80 px) mientras los mandos
    // se ven, y baja hasta el borde cuando se apartan (con transición): lo
    // decide `elAbajoDeLoGrande`.
    const ABAJO = elAbajoDeLoGrande(mandosOcultos);
    const GRANDE = `absolute inset-x-0 top-0 ${ABAJO} bg-black`;

    // La grabación (la del cliente, o la del asesor solo con Verzy; ver
    // `laSalaGraba` en `lib/grabacion-de-videollamada.ts`):
    // las voces de todos y, en el lienzo, lo mismo que se ve aquí.
    const salaRef = useRef<HTMLElement>(null);
    const dispRef = useRef(disp);
    dispRef.current = disp;
    const voces = useMemo(
        () => [pistas.avatarAudio, ...pistas.humanos.map((h) => h.audio), pistas.miMicro].filter((p): p is MediaStreamTrack => !!p),
        [pistas],
    );
    const queSeVe = (): LoQueSeVe => {
        const sala = salaRef.current;
        const d = dispRef.current;
        const video = (zona: string) => sala?.querySelector<HTMLVideoElement>(`[data-zona="${zona}"] video, video[data-zona="${zona}"]`) ?? null;
        const grande =
            d.grande === "avatar" ? video("video-del-avatar")
            : d.grande === "pantalla-verzy" ? sala?.querySelector<HTMLImageElement>('img[data-zona="video-de-la-pantalla"]') ?? null
            : d.grande === "asesor-camara" ? video("camara-del-asesor")
            : d.grande === "asesor-pantalla" ? video("pantalla-del-asesor")
            : sala?.querySelector<HTMLImageElement>('img[data-zona="logo-de-la-portada"]') ?? null;
        const mini = d.mini === "avatar" ? video("video-del-avatar") : d.mini === "asesor-camara" ? video("camara-del-asesor") : null;
        return { grande, mini };
    };
    const grabacion = useGrabacionDeLaVideollamada({
        graba: laSalaGraba({ esAsesor, hayCliente: pistas.hayCliente }),
        dentro: estado === "dentro",
        terminada: estado === "terminada" || estado === "sin_conexion",
        consulta,
        voces,
        queSeVe,
    });

    return (
        <main
            ref={salaRef}
            data-zona="sala"
            data-grabando={grabacion.grabando ? "si" : "no"}
            data-grande={disp.grande}
            data-mini={disp.mini ?? "ninguna"}
            className="relative h-[100dvh] w-full overflow-hidden bg-slate-950 text-slate-100"
        >
            {disp.grande === "portada" && (
                <section data-zona="portada" className={`absolute inset-x-0 top-0 ${ABAJO} flex items-center justify-center bg-[radial-gradient(circle_at_50%_42%,#10305f_0%,#071224_62%)] px-6 text-center`}>
                    <div aria-label={TEXTO_DE_LA_PORTADA} className="flex max-w-3xl flex-col items-center gap-3 sm:gap-4">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img data-zona="logo-de-la-portada" src={LOGO_DE_LA_PORTADA} alt="" className="h-20 w-20 drop-shadow-[0_16px_40px_rgba(31,123,255,0.45)] sm:h-32 sm:w-32" />
                        <h2 data-zona="nombre-de-la-portada" className="bg-gradient-to-r from-white from-30% to-sky-300 bg-clip-text text-5xl font-extrabold leading-tight tracking-tight text-transparent sm:text-7xl">
                            {NOMBRE_DE_LA_PORTADA}
                        </h2>
                        <p data-zona="eslogan-de-la-portada" className="bg-gradient-to-r from-sky-400 to-emerald-400 bg-clip-text text-lg font-semibold text-transparent sm:text-3xl">
                            {ESLOGAN_DE_LA_PORTADA}
                        </p>
                    </div>
                </section>
            )}
            {(disp.grande === "asesor-camara" || disp.mini === "asesor-camara") && (
                <div data-zona="camara-del-asesor" className={disp.grande === "asesor-camara" ? GRANDE : miniDe(asesorVertical)}>
                    <VideoDePista pista={pistas.asesorCamara} cubrir={disp.mini === "asesor-camara"} onVertical={setAsesorVertical} />
                </div>
            )}
            {disp.grande === "asesor-pantalla" && (
                <div data-zona="pantalla-del-asesor" className={GRANDE}>
                    <VideoDePista pista={pistas.asesorPantalla} cubrir={false} />
                </div>
            )}
            {disp.grande === "pantalla-verzy" && pantallaQueSeVe && (
                <section
                    data-zona="pantalla-del-avatar"
                    data-destino={pantallaQueSeVe}
                    className={`absolute inset-x-0 top-0 ${ABAJO} bg-black`}
                >
                    <div ref={setCajaDeLaPantalla} data-zona="caja-de-la-pantalla" className="h-full w-full overflow-hidden bg-black">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            data-zona="video-de-la-pantalla"
                            src={`/api/videollamada/pantalla?stream=1&${consulta}&k=${video}${dispositivoDeLaPantalla ? `&d=${dispositivoDeLaPantalla}` : ""}`}
                            onLoad={() => { intentosDelVideo.current = 0; }}
                            onError={reabrirElVideo}
                            alt={`Pantalla de Verzay Ventas: ${pantallaQueSeVe}`}
                            // ENTERA y con su forma real: `contain`, nunca `cover`.
                            // El servidor ya toma la forma de esta caja
                            // (elTamanoDeLaPantalla), así que en reposo llena el
                            // hueco sin franjas; si la forma no coincide (girar el
                            // teléfono, un relevo), se ve completa con franjas antes
                            // que recortada o deformada.
                            className={AJUSTE_DE_LA_PANTALLA}
                        />
                    </div>
                </section>
            )}
            <div
                data-zona="avatar"
                data-miniatura={enMiniatura ? "si" : "no"}
                data-visible={avatarGrande || enMiniatura ? "si" : "no"}
                // Siempre montado: un <video> que se monta tarde se queda negro.
                className={enMiniatura ? MINI : avatarGrande ? GRANDE : "hidden"}
            >
                <video
                    ref={videoAvatar}
                    data-zona="video-del-avatar"
                    onLoadedMetadata={(e) => setAvatarVertical(esVertical(e.currentTarget.videoWidth, e.currentTarget.videoHeight))}
                    onResize={(e) => setAvatarVertical(esVertical(e.currentTarget.videoWidth, e.currentTarget.videoHeight))}
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
            <div
                data-zona="mandos"
                data-flotan={mandosFlotan ? "si" : "no"}
                data-ocultos={mandosOcultos ? "si" : "no"}
                onMouseEnter={() => mandos.fijar("encima", true)}
                onMouseLeave={() => mandos.fijar("encima", false)}
                onFocus={() => mandos.mostrar()}
                // Escondidos NO se pueden pulsar: un «Salir» invisible que
                // responde al clic es colgar sin querer.
                className={`absolute inset-x-0 bottom-0 z-10 flex h-20 flex-nowrap items-center justify-center gap-1.5 px-28 transition-opacity duration-300 sm:gap-2 sm:px-32 ${
                    mandosFlotan ? "bg-gradient-to-t from-slate-950/80 to-transparent" : ""
                } ${mandosOcultos ? "pointer-events-none opacity-0" : "opacity-100"}`}
            >
                {estado === "dentro" && (
                    <>
                        <button
                            type="button"
                            data-mando="microfono"
                            aria-pressed={!micOn}
                            onClick={() => llamadaRef.current?.setLocalAudio(!micOn)}
                            title={micOn ? "Silenciar" : "Activar micrófono"}
                            className={`flex h-9 w-9 shrink-0 items-center justify-center gap-2 rounded-full text-sm font-medium text-white sm:h-10 sm:w-10 lg:w-auto lg:px-4 ${micOn ? "bg-slate-800" : "bg-red-600"}`}
                        >
                            {micOn ? <Mic className="h-4 w-4" aria-hidden /> : <MicOff className="h-4 w-4" aria-hidden />}
                            <span className="sr-only lg:not-sr-only lg:whitespace-nowrap">{micOn ? "Silenciar" : "Activar micrófono"}</span>
                        </button>
                        <button
                            type="button"
                            data-mando="camara"
                            onClick={() => llamadaRef.current?.setLocalVideo(!camOn)}
                            title={camOn ? "Apagar cámara" : "Encender cámara"}
                            className={`flex h-9 w-9 shrink-0 items-center justify-center gap-2 rounded-full text-sm font-medium text-white sm:h-10 sm:w-10 lg:w-auto lg:px-4 ${camOn ? "bg-slate-800" : "bg-red-600"}`}
                        >
                            {camOn ? <Video className="h-4 w-4" aria-hidden /> : <VideoOff className="h-4 w-4" aria-hidden />}
                            <span className="sr-only lg:not-sr-only lg:whitespace-nowrap">{camOn ? "Apagar cámara" : "Encender cámara"}</span>
                        </button>
                        <button
                            type="button"
                            data-mando="pantalla"
                            onClick={alternarPantalla}
                            title={pantallaOn ? "Dejar de compartir" : "Compartir pantalla"}
                            className={`flex h-9 w-9 shrink-0 items-center justify-center gap-2 rounded-full text-sm font-medium text-white sm:h-10 sm:w-10 lg:w-auto lg:px-4 ${pantallaOn ? "bg-emerald-600" : "bg-slate-800"}`}
                        >
                            {pantallaOn ? <MonitorOff className="h-4 w-4" aria-hidden /> : <MonitorUp className="h-4 w-4" aria-hidden />}
                            <span className="sr-only lg:not-sr-only lg:whitespace-nowrap">{pantallaOn ? "Dejar de compartir" : "Compartir pantalla"}</span>
                        </button>
                        <button
                            type="button"
                            data-mando="salir"
                            onClick={() => colgarRef.current()}
                            title="Salir"
                            className="flex h-9 w-9 shrink-0 items-center justify-center gap-2 rounded-full text-sm font-medium text-white sm:h-10 sm:w-10 lg:w-auto lg:px-4 bg-red-600"
                        >
                            <PhoneOff className="h-4 w-4" aria-hidden />
                            <span className="sr-only lg:not-sr-only lg:whitespace-nowrap">Salir</span>
                        </button>
                    </>
                )}
            </div>
            {/* Se dice que se graba: grabar la voz y la cara de alguien sin que
                se note no es una función (regla de Reuniones). */}
            {grabacion.grabando && estado === "dentro" && (
                <p
                    data-zona="aviso-de-grabacion"
                    className="pointer-events-none absolute left-3 top-3 z-20 flex items-center gap-1.5 rounded-full bg-slate-950/60 px-2 py-0.5 text-[11px] font-medium text-slate-200"
                >
                    <span className="h-1.5 w-1.5 rounded-full bg-red-500" aria-hidden />
                    Grabando
                </p>
            )}
            {error && (
                <p role="alert" className="absolute inset-x-4 top-4 z-30 rounded-lg bg-red-600/90 px-3 py-2 text-sm">
                    {error}
                </p>
            )}
        </main>
    );
}
