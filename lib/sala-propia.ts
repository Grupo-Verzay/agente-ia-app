/**
 * La SALA PROPIA de la videollamada (proveedor `verzay`): las reglas puras.
 *
 * Con Tavus, la sala es de Daily y Verzy es un participante más que Tavus mete
 * dentro. Con el motor propio la sala es nuestra:
 *
 * - Verzy vive en el navegador del CLIENTE (quien atiende): ahí se conecta el
 *   motor de voz (`lib/motor-de-verzay.ts`) y ahí se dibuja su logo.
 * - Si entra un asesor, se conecta con el cliente por WebRTC (una conexión por
 *   pareja, señalizada por `/api/videollamada/senales`). El cliente le pasa la
 *   VOZ de Verzy por esa conexión y le reenvía lo que Verzy dice y hace (los
 *   mensajes con forma de Tavus); el asesor le manda sus órdenes a Verzy por el
 *   mismo camino.
 *
 * La sala (`SalaDeLaVideollamada`) no se entera: ve los mismos participantes y
 * los mismos mensajes que con Daily.
 *
 * Puro: lo usan la sala propia del navegador, la ruta de señales y el banco.
 */

export { debeOfrecer } from "@/lib/sala-de-video";

/** Cada cuánto late cada persona (y recoge sus señales). */
export const LATIDO_DE_LA_SALA_MS = 1_500;
/** Sin latido en este rato, la persona ya no está. */
export const VIVOS_EN_LA_SALA_S = 8;

/**
 * El orden FIJO de lo que viaja entre dos personas: la oferta abre los cuatro
 * huecos de una vez, con pista o sin ella, y encender la cámara o compartir
 * pantalla solo cambia la pista del hueco (no se renegocia nada).
 */
export const HUECOS_DE_LA_CONEXION = ["microfono", "camara", "pantalla", "verzy"] as const;
export type HuecoDeLaConexion = (typeof HUECOS_DE_LA_CONEXION)[number];
export const TIPO_DEL_HUECO: Record<HuecoDeLaConexion, "audio" | "video"> = {
    microfono: "audio",
    camara: "video",
    pantalla: "video",
    verzy: "audio",
};

/** El participante sintético de Verzy en `participants()`. */
export const ID_DE_VERZY = "verzy";

/* ── El latido ─────────────────────────────────────────────────────────── */

export type SenalQueSale = { para: string; tipo: "oferta" | "respuesta"; cuerpo: string };
export type LatidoDeLaSala = {
    participanteId: string;
    nombre: string | null;
    /** La marca de la persona (`userData` de Daily) y si lleva el motor (`motor: true`). */
    datos: Record<string, unknown>;
    senales: SenalQueSale[];
    salir: boolean;
};

const ID_VALIDO = /^[A-Za-z0-9_-]{6,64}$/;
/** Tope del cuerpo de una señal (una SDP sin goteo ronda los 5–10 KB). */
export const TOPE_DE_LA_SENAL = 64_000;

/** Lo que llega a la ruta de señales, saneado; `null` si no se entiende. */
export function comoLatidoDeLaSala(valor: unknown): LatidoDeLaSala | null {
    const v = (valor && typeof valor === "object" ? valor : null) as Record<string, unknown> | null;
    if (!v) return null;
    const participanteId = typeof v.participanteId === "string" ? v.participanteId : "";
    if (!ID_VALIDO.test(participanteId)) return null;
    const nombre = typeof v.nombre === "string" && v.nombre.trim() ? v.nombre.trim().slice(0, 80) : null;
    const d = (v.datos && typeof v.datos === "object" ? v.datos : {}) as Record<string, unknown>;
    // Solo las marcas que la sala entiende: nada más viaja a las demás.
    const datos: Record<string, unknown> = {};
    if (d.humano === true) datos.humano = true;
    if (d.asesor === true) datos.asesor = true;
    if (d.motor === true) datos.motor = true;
    const senales = (Array.isArray(v.senales) ? v.senales : [])
        .map((s) => (s && typeof s === "object" ? (s as Record<string, unknown>) : {}))
        .filter((s) => typeof s.para === "string" && ID_VALIDO.test(s.para) && (s.tipo === "oferta" || s.tipo === "respuesta") && typeof s.cuerpo === "string" && s.cuerpo.length <= TOPE_DE_LA_SENAL)
        .slice(0, 8)
        .map((s) => ({ para: s.para as string, tipo: s.tipo as "oferta" | "respuesta", cuerpo: s.cuerpo as string }));
    return { participanteId, nombre, datos, senales, salir: v.salir === true };
}

/* ── Lo que viaja por el canal de datos entre dos personas ─────────────── */

export type MensajeEntrePersonas =
    /** Lo que Verzy dijo o hizo (del cliente que lleva el motor a las demás). */
    | { t: "evento"; m: unknown }
    /** Una orden para Verzy (de un asesor al cliente que lleva el motor). */
    | { t: "orden"; m: unknown }
    /** Qué tiene encendido esta persona (una pista callada no avisa sola). */
    | { t: "estado"; audio: boolean; video: boolean; pantalla: boolean };

export function comoMensajeEntrePersonas(texto: unknown): MensajeEntrePersonas | null {
    if (typeof texto !== "string" || texto.length > 200_000) return null;
    try {
        const v = JSON.parse(texto) as Record<string, unknown>;
        if (v?.t === "evento" || v?.t === "orden") return { t: v.t, m: v.m };
        if (v?.t === "estado") return { t: "estado", audio: v.audio === true, video: v.video === true, pantalla: v.pantalla === true };
        return null;
    } catch {
        return null;
    }
}

/* ── Los participantes, con la forma de Daily ──────────────────────────── */

export type PistaDeLaSala = { state: "playable" | "off"; persistentTrack: MediaStreamTrack | null };
export type ParticipanteDeLaSala = {
    local: boolean;
    session_id: string;
    user_name?: string;
    userData?: unknown;
    audio: boolean;
    video: boolean;
    tracks: { audio?: PistaDeLaSala; video?: PistaDeLaSala; screenVideo?: PistaDeLaSala };
};

/** Una pista con la forma de Daily: se puede pintar solo si existe, está viva y la persona la tiene encendida. */
export function laPista(pista: MediaStreamTrack | null | undefined, encendida: boolean): PistaDeLaSala {
    const viva = !!pista && pista.readyState !== "ended";
    return { state: viva && encendida ? "playable" : "off", persistentTrack: viva ? pista! : null };
}

/**
 * ¿Hay que encender el motor en ESTE navegador? Solo quien atiende (el cliente,
 * no un asesor) y solo si nadie más en la sala lo lleva ya (el mismo enlace
 * abierto en dos pestañas no puede tener dos Verzys hablando a la vez).
 */
export function llevaElMotor(input: { esAsesor: boolean; otros: Array<{ datos: Record<string, unknown> }> }): boolean {
    if (input.esAsesor) return false;
    return !input.otros.some((o) => o.datos.motor === true);
}
