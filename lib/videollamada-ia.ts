/**
 * Videollamada con IA de Verzay (Tavus): las reglas, puras.
 *
 * Una cuenta elige en Agenda › Ajustes cómo se reúne con sus clientes:
 *
 * | modo | qué recibe el cliente |
 * | --- | --- |
 * | `enlace` | el enlace fijo de siempre (Meet, Zoom…), escrito en `User.meetingUrl` |
 * | `tavus` | `<plataforma>/videollamada/<id de la cita>`, que al abrirse crea la sesión con el avatar |
 *
 * El enlace fijo **no se toca**: `tavus` es un modo al lado, y sin fila de
 * ajustes la cuenta sigue en `enlace`.
 *
 * # La sesión NO se crea por adelantado
 *
 * El enlace del cliente es nuestro y no caduca; la conversación de Tavus se
 * crea al ABRIRLO, con el avatar fijo de la plataforma («Verzy»). Una sesión
 * creada al agendar caducaría o se gastaría antes de la cita. Lo decide
 * {@link queHacerAlAbrir}.
 */

export const MODOS_DE_REUNION = ["enlace", "tavus"] as const;
export type ModoDeReunion = (typeof MODOS_DE_REUNION)[number];

/** Lo que no se entienda es el modo de siempre: el enlace fijo. */
export function comoModoDeReunion(valor: unknown): ModoDeReunion {
    return valor === "tavus" ? "tavus" : "enlace";
}

export const NOMBRE_DEL_MODO: Record<ModoDeReunion, string> = {
    enlace: "Enlace de reunión virtual fijo",
    tavus: "Videollamada con IA de Verzay",
};

/** La variable de las plantillas de recordatorio que se cambia por el enlace de ESA cita. */
export const VARIABLE_DEL_ENLACE = "@meeting_link";

/** El enlace que recibe el cliente. Nunca lleva la clave ni nada de Tavus. */
export function elEnlaceDeLaVideollamada(origen: string, citaId: string): string {
    const base = String(origen ?? "").replace(/\/+$/, "");
    return `${base}/videollamada/${encodeURIComponent(citaId)}`;
}

/** Tope de largo del enlace con nombre (sin contar el sufijo «-2»). */
export const TOPE_DEL_ENLACE = 48;

/**
 * El trozo amigable del enlace, sacado del nombre del prospecto:
 * «María Alejandra Rosas» → «maria-alejandra-rosas». La tilde se quita y la
 * letra se queda. Sin nombre utilizable (vacío, solo un teléfono) → `null`, y
 * el enlace sigue siendo el id de la cita.
 */
export function elEnlaceDelNombre(nombre: unknown): string | null {
    const limpio = String(nombre ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, TOPE_DEL_ENLACE)
        .replace(/-+$/g, "");
    if (limpio.length < 3 || !/[a-z]/.test(limpio)) return null;
    return limpio;
}

/** El candidato n-ésimo cuando el nombre ya lo usa otra cita: base, base-2, base-3… */
export function elEnlaceConSufijo(base: string, intento: number): string {
    return intento <= 1 ? base : `${base}-${intento}`;
}

/** Lo que llega en `/videollamada/<x>` puede ser un enlace con nombre. */
export function pareceUnEnlaceConNombre(valor: string): boolean {
    return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(valor) && valor.length >= 3 && valor.length <= TOPE_DEL_ENLACE + 4;
}

/** El nombre con el que entra el prospecto: el de la cita, nunca se le pide. */
export function elNombreDelProspecto(cita: {
    clientName?: string | null;
    session?: { customName?: string | null; pushName?: string | null } | null;
}): string | null {
    return cita.session?.customName?.trim() || cita.clientName?.trim() || cita.session?.pushName?.trim() || null;
}

/* ── La ausencia del cliente ───────────────────────────────────────────── */

/** A los 3 minutos sin entrar, el asistente de voz le llama por WhatsApp. */
export const MINUTOS_PARA_LLAMAR = 3;
/** A los 5 sin entrar, la cita queda «No asistió» y se le manda el enlace. */
export const MINUTOS_PARA_NO_ASISTIO = 5;

/** Desde cuántos minutos antes del inicio se puede abrir la sala. */
export const MINUTOS_ANTES_DE_ABRIR = 15;

export type AlAbrir =
    | { accion: "temprano"; abreEn: Date }
    | { accion: "cerrada" }
    | { accion: "cancelada" }
    | { accion: "reutilizar" }
    | { accion: "crear" };

const ESTADOS_SIN_SALA = new Set(["CANCELADA", "DESCARTADO"]);

/**
 * Qué hacer cuando alguien abre `/videollamada/<id>`.
 *
 * - Antes de `inicio − 15 min`: todavía no, y se dice cuándo abre.
 * - Pasado el FIN de la franja: cerrada. Hasta entonces sigue viva, también
 *   después de marcarla «No asistió» (es la regla del minuto 5: el enlace se
 *   le manda para que pueda entrar tarde).
 * - Cancelada o descartada: no hay sala.
 * - Con una conversación ya creada y viva: se reutiliza (dos pestañas, o
 *   recargar, no crean dos sesiones ni pagan dos).
 */
export function queHacerAlAbrir(input: {
    ahora: Date;
    inicio: Date;
    fin: Date;
    estado: string;
    existente: { url: string; estado: string } | null;
}): AlAbrir {
    if (ESTADOS_SIN_SALA.has(String(input.estado ?? "").toUpperCase())) return { accion: "cancelada" };
    const abre = new Date(input.inicio.getTime() - MINUTOS_ANTES_DE_ABRIR * 60_000);
    if (input.ahora.getTime() < abre.getTime()) return { accion: "temprano", abreEn: abre };
    if (input.ahora.getTime() > input.fin.getTime()) return { accion: "cerrada" };
    if (input.existente?.url && input.existente.estado !== "finalizada") return { accion: "reutilizar" };
    return { accion: "crear" };
}

/**
 * Cuánto puede durar la conversación en Tavus: lo que quede de la franja, con
 * un suelo (una cita que se abre tarde no puede durar dos minutos) y un techo.
 */
export function laDuracionMaxima(ahora: Date, fin: Date): number {
    const restante = Math.ceil((fin.getTime() - ahora.getTime()) / 1000);
    return Math.max(10 * 60, Math.min(restante, 2 * 60 * 60));
}

/* ── Los ajustes ───────────────────────────────────────────────────────── */

/**
 * El avatar de la plataforma es el Pal «Verzy» de Verzay, con la clave de
 * Tavus de la casa: sale del entorno (`TAVUS_API_KEY`, `TAVUS_PERSONA_ID`) y
 * nunca viaja al navegador. Una cuenta PUEDE tener además su propio avatar
 * (clave y persona suyas, `elAvatarQueUsa`); sin él usa el de la casa.
 */
export const NOMBRE_DEL_AVATAR = "Verzy";

/** Un `persona_id` de Tavus: letras, números, guion y guion bajo. */
export function comoPersonaId(valor: unknown): string | null {
    const limpio = String(valor ?? "").trim();
    return /^[a-z0-9_-]{3,64}$/i.test(limpio) ? limpio : null;
}

/** Una clave de API de Tavus: sin espacios, de un largo razonable. */
export function comoClaveDeTavus(valor: unknown): string | null {
    const limpio = String(valor ?? "").trim();
    return /^[A-Za-z0-9_\-.]{16,200}$/.test(limpio) ? limpio : null;
}

/** El avatar de la casa leído del entorno, o `null` si falta algo o no tiene forma. */
export function elAvatarDelEntorno(
    entorno: { TAVUS_API_KEY?: string; TAVUS_PERSONA_ID?: string },
): { clave: string; personaId: string } | null {
    const clave = comoClaveDeTavus(entorno.TAVUS_API_KEY);
    const personaId = comoPersonaId(entorno.TAVUS_PERSONA_ID);
    return clave && personaId ? { clave, personaId } : null;
}

export type Avatar = { clave: string; personaId: string };

/**
 * Qué avatar usa una cuenta: el SUYO si tiene clave y persona válidas, y si
 * no, el de la casa. Medio avatar propio (clave sin persona) no cuenta: se
 * cae al de la casa en vez de mezclar la clave de uno con la persona de otro.
 */
export function elAvatarQueUsa(propio: { clave?: unknown; personaId?: unknown } | null | undefined, casa: Avatar | null): Avatar | null {
    const clave = comoClaveDeTavus(propio?.clave);
    const personaId = comoPersonaId(propio?.personaId);
    return clave && personaId ? { clave, personaId } : casa;
}

export type AjustesParaGuardar = { modo: ModoDeReunion };

/**
 * Qué se guarda: el modo y nada más. El modo `tavus` solo se puede encender si
 * la plataforma tiene su avatar configurado; apagarlo se puede siempre.
 */
export function losAjustesQueSeGuardan(
    pedido: { modo?: unknown },
    hayAvatar: boolean,
): { ok: true; ajustes: AjustesParaGuardar } | { ok: false; motivo: string } {
    const modo = comoModoDeReunion(pedido.modo);
    if (modo === "tavus" && !hayAvatar) {
        return { ok: false, motivo: "La videollamada con IA no está disponible en este momento." };
    }
    return { ok: true, ajustes: { modo } };
}

/* ── El contexto que se le da al avatar ────────────────────────────────── */

/**
 * El `conversational_context` de Tavus: los datos de la cita y, debajo, el
 * bloque de la conversación de WhatsApp (el MISMO que recibe el asistente de
 * voz: `elContextoDeLaConversacion`, copiado del backend).
 */
export function elContextoParaTavus(input: {
    negocio: string;
    nombreDelCliente: string | null;
    servicio: string | null;
    inicioLegible: string;
    conversacion: string;
}): string {
    return [
        `Estás en una videollamada agendada con un cliente de ${input.negocio || "nuestro negocio"}.`,
        input.nombreDelCliente ? `El cliente se llama ${input.nombreDelCliente}.` : "",
        input.servicio ? `La cita es para: ${input.servicio}.` : "",
        `La cita estaba agendada para ${input.inicioLegible}.`,
        "",
        input.conversacion,
    ]
        .filter((l, i, todas) => l !== "" || (i > 0 && todas[i - 1] !== ""))
        .join("\n")
        .trim();
}

/* ── El aviso de Tavus (webhook) ───────────────────────────────────────── */

export type FraseDeLaTranscripcion = { role?: unknown; content?: unknown };

/**
 * La transcripción que manda Tavus, en el texto que se guarda: una línea por
 * turno, «Asistente:» o «Cliente:». Se quita el mensaje de sistema.
 */
export function laTranscripcionDeTavus(frases: unknown): string {
    if (!Array.isArray(frases)) return "";
    return (frases as FraseDeLaTranscripcion[])
        .map((f) => {
            const rol = String(f?.role ?? "");
            const texto = String(f?.content ?? "").replace(/\s+/g, " ").trim();
            if (!texto || rol === "system") return "";
            return `${rol === "user" ? "Cliente" : "Asistente"}: ${texto}`;
        })
        .filter(Boolean)
        .join("\n");
}

export type AvisoDeTavus = {
    evento: string;
    conversacionId: string | null;
    accion: "transcripcion" | "grabacion" | "terminada" | "ignorar";
    frases: unknown;
    grabacionUrl: string | null;
};

/**
 * Qué trae un aviso de Tavus. Tres eventos importan:
 * `application.transcription_ready` (la transcripción, en
 * `properties.transcript`), `application.recording_ready` (la grabación) y
 * `system.shutdown` (la sala se cerró). Lo demás se ignora.
 *
 * Una grabación solo se apunta si es una dirección `https`: Tavus puede
 * mandar la llave del bucket del cliente (`s3_key`), que no es un enlace.
 */
export function queHaceElAvisoDeTavus(cuerpo: unknown): AvisoDeTavus {
    const c = (cuerpo && typeof cuerpo === "object" ? cuerpo : {}) as Record<string, unknown>;
    const props = (c.properties && typeof c.properties === "object" ? c.properties : {}) as Record<string, unknown>;
    const evento = String(c.event_type ?? c.message_type ?? "");
    const conversacionId = typeof c.conversation_id === "string" && c.conversation_id ? c.conversation_id : null;
    const url = [props.recording_url, props.url, props.download_url].find(
        (v): v is string => typeof v === "string" && /^https:\/\//i.test(v),
    );
    let accion: AvisoDeTavus["accion"] = "ignorar";
    if (evento === "application.transcription_ready") accion = "transcripcion";
    else if (evento === "application.recording_ready") accion = "grabacion";
    else if (evento === "system.shutdown") accion = "terminada";
    return { evento, conversacionId, accion, frases: props.transcript, grabacionUrl: url ?? null };
}
