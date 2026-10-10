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

import { laDuracionDeLaCita } from "./reagendar-cita";

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

/* ── Los ajustes ───────────────────────────────────────────────────────── */

/**
 * El nombre con el que se presenta el asistente con video. El AVATAR (clave y
 * persona de Tavus) es SIEMPRE el de la cuenta: no hay avatar de la casa ni
 * respaldo del entorno (`elAvatarQueUsa`).
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

export type Avatar = { clave: string; personaId: string };

/**
 * Qué avatar usa una cuenta: el SUYO si tiene clave y persona válidas, y si
 * no, NINGUNO. No hay avatar de la casa: una cuenta sin su clave y su persona
 * de Tavus no tiene videollamada con IA, en vez de gastar la cuenta de otro.
 * Medio avatar (clave sin persona) tampoco cuenta.
 */
export function elAvatarQueUsa(propio: { clave?: unknown; personaId?: unknown } | null | undefined): Avatar | null {
    const clave = comoClaveDeTavus(propio?.clave);
    const personaId = comoPersonaId(propio?.personaId);
    return clave && personaId ? { clave, personaId } : null;
}

/**
 * El modo que VALE de verdad: la videollamada con IA solo si la cuenta tiene su
 * avatar; si no, el enlace fijo. Así una cuenta que estaba en modo IA con el
 * avatar de la casa (que ya no existe) no reparte enlaces que no abren: sus
 * citas llevan su enlace fijo hasta que ponga su clave, y entonces vuelven
 * solas a la videollamada con IA (el modo guardado no se toca).
 */
export function elModoQueVale(ajustes: { modo: ModoDeReunion; disponible: boolean } | null | undefined): ModoDeReunion {
    return ajustes?.modo === "tavus" && ajustes.disponible ? "tavus" : "enlace";
}

/** Lo que se le dice a quien elige la videollamada con IA sin tener su avatar. */
export const FALTA_EL_AVATAR_PROPIO =
    "Configura tu clave y tu avatar de Tavus en Agente IA › Videollamadas › Claves para usar la videollamada con IA.";

/* ── El límite de duración de cada videollamada ───────────────────────── */

/**
 * La reunión dura lo que se AGENDÓ: de `startTime` a `endTime` de la cita
 * (`losMinutosDeLaVideollamada`). 20, 30, 45 minutos o lo que sea, con los avisos 5 y
 * 1 minuto antes de ese corte (`losMomentosDelReloj`).
 *
 * El límite de la CUENTA (Agenda › Ajustes, de fábrica 30, entre 5 y 30) es
 * solo el RESPALDO de una cita sin duración legible: una sala que no se cierra
 * es una sala que se paga.
 */
export const LIMITE_DE_FABRICA_MIN = 30;
export const LIMITE_MINIMO_MIN = 5;
export const LIMITE_MAXIMO_MIN = 30;
/** Lo más que dura una reunión con el avatar, la agenden como la agenden (2 h). */
export const TECHO_DE_LA_REUNION_MIN = 120;
/** Lo que Tavus espera de más tras el corte de la sala: el corte con despedida es SIEMPRE el de la sala. */
export const MARGEN_DE_TAVUS_S = 60;

/**
 * El límite de la cuenta en minutos: un entero entre el mínimo y el máximo.
 * Lo que no se entiende (vacío, texto, `null`) es el de fábrica, nunca «sin
 * límite».
 */
export function comoLimiteDeMinutos(valor: unknown): number {
    if (valor === null || valor === undefined || valor === "") return LIMITE_DE_FABRICA_MIN;
    const n = Math.round(Number(valor));
    if (!Number.isFinite(n)) return LIMITE_DE_FABRICA_MIN;
    return Math.min(LIMITE_MAXIMO_MIN, Math.max(LIMITE_MINIMO_MIN, n));
}

/**
 * Los minutos que dura UNA reunión: un entero entre el mínimo y el techo de la
 * reunión. Lo que no se entiende es el de fábrica, nunca «sin límite».
 */
export function comoMinutosDeLaReunion(valor: unknown): number {
    if (valor === null || valor === undefined || valor === "") return LIMITE_DE_FABRICA_MIN;
    const n = Math.round(Number(valor));
    if (!Number.isFinite(n)) return LIMITE_DE_FABRICA_MIN;
    return Math.min(TECHO_DE_LA_REUNION_MIN, Math.max(LIMITE_MINIMO_MIN, n));
}

/**
 * Cuánto dura la videollamada de una cita: lo que se agendó (fin − inicio, con
 * `laDuracionDeLaCita`, la misma regla que reagendar). Una cita sin duración
 * legible usa el límite de la cuenta.
 */
export function losMinutosDeLaVideollamada(
    inicio: Date | string | null | undefined,
    fin: Date | string | null | undefined,
    limiteDeLaCuenta: unknown,
): number {
    const minutos = inicio && fin ? laDuracionDeLaCita(inicio, fin, 0) : 0;
    return minutos > 0 ? comoMinutosDeLaReunion(minutos) : comoLimiteDeMinutos(limiteDeLaCuenta);
}

/**
 * El `max_call_duration` de Tavus: la duración de la reunión y un margen. Tavus
 * nunca corta ANTES que la sala: si cortara él (antes, con lo que quedaba de la
 * franja), una entrada tarde se quedaba sin avisos ni despedida.
 */
export function laDuracionEnTavus(minutos: number): number {
    return comoMinutosDeLaReunion(minutos) * 60 + MARGEN_DE_TAVUS_S;
}

/**
 * Cuándo se cierra la sala: la duración contada desde que alguien ENTRÓ de
 * verdad (no desde que se abrió el enlace). Sin entrada todavía, desde ahora.
 */
export function elCierreDeLaSala(empezoEn: Date | string | null | undefined, ahora: Date, minutos: number): Date {
    const inicio = empezoEn ? new Date(empezoEn) : ahora;
    const base = Number.isFinite(inicio.getTime()) ? inicio : ahora;
    return new Date(base.getTime() + comoMinutosDeLaReunion(minutos) * 60_000);
}

export type AjustesParaGuardar = { modo: ModoDeReunion; limiteMinutos: number };

/**
 * Qué se guarda: el modo y nada más. El modo `tavus` solo se puede encender si
 * la CUENTA tiene su avatar de Tavus configurado; apagarlo se puede siempre.
 */
export function losAjustesQueSeGuardan(
    pedido: { modo?: unknown; limiteMinutos?: unknown },
    hayAvatar: boolean,
): { ok: true; ajustes: AjustesParaGuardar } | { ok: false; motivo: string } {
    const modo = comoModoDeReunion(pedido.modo);
    if (modo === "tavus" && !hayAvatar) {
        return { ok: false, motivo: FALTA_EL_AVATAR_PROPIO };
    }
    return { ok: true, ajustes: { modo, limiteMinutos: comoLimiteDeMinutos(pedido.limiteMinutos) } };
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
 * Con qué empieza lo que la SALA le pide decir a Verzy (`conversation.respond`
 * del reloj y de la espera del humano). Tavus lo apunta como frase del
 * cliente: no es suya, y ni la sala ni la transcripción la cuentan.
 */
export const MARCA_DEL_AVISO_INTERNO = "[AVISO INTERNO]";

/**
 * La transcripción que manda Tavus, en el texto que se guarda: una línea por
 * turno, «Asistente:» o «Cliente:». Se quitan el mensaje de sistema y los
 * avisos internos de la sala (`MARCA_DEL_AVISO_INTERNO`).
 */
export function laTranscripcionDeTavus(frases: unknown): string {
    if (!Array.isArray(frases)) return "";
    return (frases as FraseDeLaTranscripcion[])
        .map((f) => {
            const rol = String(f?.role ?? "");
            const texto = String(f?.content ?? "").replace(/\s+/g, " ").trim();
            if (!texto || rol === "system" || texto.startsWith(MARCA_DEL_AVISO_INTERNO)) return "";
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
