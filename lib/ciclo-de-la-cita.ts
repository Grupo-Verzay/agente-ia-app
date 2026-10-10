/**
 * El ciclo automático de una cita de Agenda: los cuatro recordatorios, la
 * respuesta a «¿confirmas tu asistencia?», la espera el día de la cita y los
 * estados que se pueden poner solos. Puro: lo que lee la base y manda está en
 * `lib/ciclo-de-la-cita.server.ts`.
 *
 * **Qué estados pone el sistema y cuáles NUNCA** (la definición no se toca):
 *
 * | estado | quién |
 * | --- | --- |
 * | Pendiente | al agendar (como siempre) |
 * | Confirmada | una PERSONA: el prospecto es candidato calificado |
 * | Atendida | el sistema, cuando el prospecto ENTRA a la videollamada |
 * | No asistida | el sistema, al agotarse la espera (o si en la llamada dice que no puede) |
 * | Cancelada | una PERSONA: decisión de negocio. Nunca por lo que diga el chat |
 * | Finalizado | una PERSONA: el pago se valida en otra cuenta |
 * | Descartado | el sistema, solo con un rechazo LITERAL del cliente |
 *
 * El «Sí» del recordatorio de una hora antes dice que la persona asistirá;
 * **no** es «Confirmada» (eso es calificación, y la decide una persona).
 */
import { laFechaDeLaCita, laZonaDeLaCuenta } from "@/lib/zona-de-la-cuenta";

/* ── Los recordatorios ─────────────────────────────────────────────────── */

export type ClaveDelRecordatorio = "3h" | "1h" | "30m" | "0";

export type RecordatorioDelCiclo = {
    clave: ClaveDelRecordatorio;
    /** Minutos antes del inicio. */
    minutos: number;
    /** `botones` sale con «Sí» / «No» (o como texto donde la línea no los admite). */
    tipo: "text" | "botones";
};

export const RECORDATORIOS_DEL_CICLO: readonly RecordatorioDelCiclo[] = [
    { clave: "3h", minutos: 180, tipo: "text" },
    { clave: "1h", minutos: 60, tipo: "botones" },
    { clave: "30m", minutos: 30, tipo: "text" },
    { clave: "0", minutos: 0, tipo: "text" },
];

/** Los dos botones del recordatorio de una hora antes. El backend los pinta tal cual. */
export const BOTONES_DE_ASISTENCIA = ["Sí", "No"] as const;

export type DatosDelCiclo = {
    nombreDelCliente: string;
    inicio: Date;
    /** La zona de la CUENTA. */
    zona: string;
    servicio?: string | null;
    enlaceDeReunion?: string | null;
};

/** La hora de la cita en la zona de la cuenta («3:00 p. m.»), sin la fecha. */
function laHora(cita: DatosDelCiclo): string {
    return new Intl.DateTimeFormat("es-CO", {
        timeZone: laZonaDeLaCuenta(cita.zona),
        hour: "numeric",
        minute: "2-digit",
    }).format(cita.inicio);
}

function elSaludo(cita: DatosDelCiclo): string {
    const nombre = cita.nombreDelCliente.trim();
    return nombre ? `Hola *${nombre}*` : "Hola";
}

function elServicio(cita: DatosDelCiclo): string {
    const s = String(cita.servicio ?? "").trim();
    return s ? ` de *${s}*` : "";
}

/** Lo que dice cada recordatorio. */
export function elTextoDelCiclo(clave: ClaveDelRecordatorio, cita: DatosDelCiclo): string {
    const saludo = elSaludo(cita);
    const hora = laHora(cita);
    const enlace = String(cita.enlaceDeReunion ?? "").trim();
    switch (clave) {
        case "3h":
            return (
                `${saludo} 👋\n\nTe recordamos que hoy tienes tu reunión${elServicio(cita)} a las *${hora}*` +
                ` (${laFechaDeLaCita(cita.inicio, laZonaDeLaCuenta(cita.zona))}).\n\n¡Te esperamos!`
            );
        case "1h":
            return (
                `${saludo}, tu reunión${elServicio(cita)} empieza en *1 hora* (a las *${hora}*).\n\n` +
                `¿Confirmas tu asistencia? Responde *Sí* o *No*.`
            );
        case "30m":
            return `${saludo}, tu reunión está por comenzar: empieza en *30 minutos* (a las *${hora}*). 🕒`;
        case "0":
            return enlace
                ? `${saludo}, ¡tu reunión empieza ahora! Entra aquí:\n\n👉 ${enlace}`
                : `${saludo}, ¡tu reunión empieza ahora!`;
    }
}

export type RecordatorioProgramadoDelCiclo = {
    clave: ClaveDelRecordatorio;
    tipo: "text" | "botones";
    /** El instante en ISO/UTC, como lo lee el motor. */
    cuando: string;
    mensaje: string;
};

/**
 * Los recordatorios que le tocan a una cita: los cuatro, menos los que ya
 * pasaron (una cita agendada con dos horas de margen no recibe el de tres).
 * El del momento exacto se programa aunque falten segundos: es el del enlace.
 */
export function losRecordatoriosDelCiclo(cita: DatosDelCiclo, ahora: Date = new Date()): RecordatorioProgramadoDelCiclo[] {
    const salida: RecordatorioProgramadoDelCiclo[] = [];
    for (const r of RECORDATORIOS_DEL_CICLO) {
        const cuando = new Date(cita.inicio.getTime() - r.minutos * 60_000);
        if (cuando.getTime() <= ahora.getTime()) continue;
        salida.push({ clave: r.clave, tipo: r.tipo, cuando: cuando.toISOString(), mensaje: elTextoDelCiclo(r.clave, cita) });
    }
    return salida;
}

/**
 * La llave de un recordatorio del ciclo (`seguimientos.idempotencyKey`, única).
 * Empieza por `appt-reminder:<cita>:` A PROPÓSITO: reagendar borra por ese
 * prefijo, así que la hora vieja no deja ningún recordatorio colgado.
 */
export function laLlaveDelCiclo(citaId: string, clave: ClaveDelRecordatorio): string {
    return `appt-reminder:${citaId}:ciclo-${clave}`;
}

/**
 * El `idNodo`. `appt-reminder-` es el prefijo que el motor manda a su hora (sin
 * horario de atención) y el que cancelar y reagendar ya borran.
 */
export function elNodoDelCiclo(clave: ClaveDelRecordatorio): string {
    return `appt-reminder-ciclo-${clave}`;
}

/* ── Lo que escribe el cliente ─────────────────────────────────────────── */

/** Minúsculas, sin tildes, sin emojis ni signos, espacios simples. */
export function comoTextoPlano(texto: unknown): string {
    return String(texto ?? "")
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9ñ\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

const RESPUESTAS_SI = new Set([
    "si",
    "si confirmo",
    "confirmo",
    "si asistire",
    "si voy",
    "si ahi estare",
    "si alli estare",
    "si claro",
    "claro que si",
    "si señor",
    "si señora",
]);

const RESPUESTAS_NO = new Set([
    "no",
    "no puedo",
    "no podre",
    "no voy",
    "no asistire",
    "no podre asistir",
    "no puedo asistir",
    "no voy a poder",
    "no alcanzo",
]);

/**
 * La respuesta al «¿Confirmas tu asistencia?». Solo vale un mensaje que ES la
 * respuesta —el botón, o un «sí»/«no» escrito solo—. Un mensaje más largo
 * («sí, pero ¿puedo cambiar la hora?») no se interpreta: lo atiende el agente.
 */
export function laRespuestaDeAsistencia(texto: unknown): "si" | "no" | null {
    const t = comoTextoPlano(texto);
    if (!t) return null;
    if (RESPUESTAS_SI.has(t)) return "si";
    if (RESPUESTAS_NO.has(t)) return "no";
    return null;
}

/**
 * Las frases de un rechazo EXPLÍCITO. Literales: nada de tono, nada de
 * inferencias. «La voy a cancelar», «no llego a tiempo» o «mejor otro día» no
 * están —eso es reagendar, y Cancelada la decide una persona—.
 */
export const FRASES_DE_RECHAZO = [
    "no me interesa",
    "ya no me interesa",
    "no estoy interesado",
    "no estoy interesada",
    "ya no estoy interesado",
    "ya no estoy interesada",
    "no es lo que busco",
    "no es lo que buscaba",
    "no es lo que estoy buscando",
    "no es lo que estaba buscando",
    "no es lo que necesito",
    "no es lo que necesitaba",
] as const;

/** Lo que niega la frase que sigue («no es que no me interese…» no es un rechazo). */
const NEGACIONES_DE_LA_FRASE = ["no es que", "no digo que", "tampoco es que"];

/**
 * ¿El cliente rechazó la oferta de forma explícita y literal? Una pregunta
 * («¿y si no me interesa?») no cuenta.
 */
export function esUnRechazoLiteral(texto: unknown): boolean {
    const crudo = String(texto ?? "");
    if (crudo.includes("?") || crudo.includes("¿")) return false;
    const t = ` ${comoTextoPlano(crudo)} `;
    if (NEGACIONES_DE_LA_FRASE.some((n) => t.includes(` ${n} `))) return false;
    return FRASES_DE_RECHAZO.some((f) => t.includes(` ${f} `));
}

/** Desde qué estados un rechazo literal pasa la cita a Descartado. */
export const ESTADOS_QUE_SE_PUEDEN_DESCARTAR = ["PENDIENTE", "CONFIRMADA", "ATENDIDA", "NO_ASISTIDA"] as const;

export function sePuedeDescartar(estado: string): boolean {
    return (ESTADOS_QUE_SE_PUEDEN_DESCARTAR as readonly string[]).includes(estado);
}

/* ── La espera el día de la cita ───────────────────────────────────────── */

/** Al minuto 5 sin entrar, la IA de voz llama al prospecto. */
export const MINUTO_DE_LA_LLAMADA = 5;
/** Al minuto 10 sin entrar (o al final de la prórroga que pidió), No asistida. */
export const MINUTOS_DE_ESPERA = 10;
/** La prórroga más larga que se concede por teléfono. */
export const PRORROGA_MAXIMA_MIN = 30;
/** Si nadie pide minutos concretos («deme un momento»), los que se dan. */
export const PRORROGA_POR_DEFECTO_MIN = 10;
/**
 * Pasado este tiempo desde el inicio, la espera ya no hace nada. Es el freno
 * de un reloj que estuvo parado (un despliegue, un corte): al volver no pone
 * «No asistida» a las citas de ayer.
 */
export const VENTANA_DE_LA_ESPERA_MIN = 120;

/** Los estados que la espera puede mover. Los demás son de una persona. */
export const ESTADOS_EN_ESPERA = ["PENDIENTE", "CONFIRMADA"] as const;

export type DecisionDeLaLlamada = "entra" | "mas_tiempo" | "no_puede";

export type EstadoDeLaEspera = {
    estado: string;
    inicio: Date;
    /** Cuándo entró el prospecto a la videollamada (de verdad, no al abrir el enlace). */
    entroEn: Date | null;
    /** Lo que respondió al recordatorio de una hora antes. */
    asistencia: "si" | "no" | null;
    llamadaEn: Date | null;
    decision: DecisionDeLaLlamada | null;
    /** Hasta cuándo se espera por la prórroga que pidió (null = la espera normal). */
    esperaHasta: Date | null;
};

export type PasoDeLaEspera = "nada" | "esperar" | "atendida" | "llamar" | "no_asistida";

/** Hasta cuándo se espera: el minuto 10, o el final de la prórroga si es más tarde. */
export function elLimiteDeLaEspera(e: Pick<EstadoDeLaEspera, "inicio" | "esperaHasta">): Date {
    const normal = e.inicio.getTime() + MINUTOS_DE_ESPERA * 60_000;
    const prorroga = e.esperaHasta?.getTime() ?? 0;
    return new Date(Math.max(normal, prorroga));
}

/**
 * Qué toca hacer con una cita en este minuto. Una sola regla para el reloj:
 *
 * 1. Solo se mueven las citas Pendientes o Confirmadas.
 * 2. Si el prospecto entró → Atendida (también si entró antes de la hora).
 * 3. Antes de la hora, nada.
 * 4. Si en la llamada dijo que no puede → No asistida, nunca Cancelada.
 * 5. Llegado el límite (minuto 10 o su prórroga) sin entrar → No asistida.
 * 6. Al minuto 5, una llamada (una sola), salvo que ya dijera «No» al
 *    recordatorio: llamar a quien avisó que no viene no sirve de nada.
 */
export function queHacerEnLaEspera(e: EstadoDeLaEspera, ahora: Date = new Date()): PasoDeLaEspera {
    if (!(ESTADOS_EN_ESPERA as readonly string[]).includes(e.estado)) return "nada";
    const desdeElInicio = ahora.getTime() - e.inicio.getTime();
    if (desdeElInicio > VENTANA_DE_LA_ESPERA_MIN * 60_000) return "nada";
    if (e.entroEn) return "atendida";
    if (desdeElInicio < 0) return "nada";
    if (e.decision === "no_puede") return "no_asistida";
    if (ahora.getTime() >= elLimiteDeLaEspera(e).getTime()) return "no_asistida";
    if (!e.llamadaEn && e.asistencia !== "no" && desdeElInicio >= MINUTO_DE_LA_LLAMADA * 60_000) return "llamar";
    return "esperar";
}

export type DecisionLeida = { decision: DecisionDeLaLlamada; minutos: number | null };

/**
 * Lo que la herramienta de la llamada dice que decidió la persona. Lo que no se
 * entiende es `null` (y la espera sigue su curso normal).
 */
export function laDecisionDeLaLlamada(args: unknown): DecisionLeida | null {
    const a = (args && typeof args === "object" ? args : {}) as Record<string, unknown>;
    const d = comoTextoPlano(a.decision).replace(/\s+/g, "_");
    const decision: DecisionDeLaLlamada | null =
        d === "entra" || d === "va_a_entrar" ? "entra"
        : d === "mas_tiempo" ? "mas_tiempo"
        : d === "no_puede" || d === "no_asiste" ? "no_puede"
        : null;
    if (!decision) return null;
    if (decision !== "mas_tiempo") return { decision, minutos: null };
    const n = Number(a.minutos);
    const minutos = Number.isFinite(n) && n > 0 ? Math.min(Math.round(n), PRORROGA_MAXIMA_MIN) : PRORROGA_POR_DEFECTO_MIN;
    return { decision, minutos };
}

/** Hasta cuándo se espera tras pedir más tiempo: desde que lo pidió, nunca menos que el minuto 10. */
export function laEsperaConProrroga(inicio: Date, decididaEn: Date, minutos: number): Date {
    const pedida = decididaEn.getTime() + minutos * 60_000;
    return new Date(Math.max(pedida, inicio.getTime() + MINUTOS_DE_ESPERA * 60_000));
}

/* ── Los avisos ────────────────────────────────────────────────────────── */

export function laContestacionAlSi(nombre: string): string {
    const n = nombre.trim();
    return `¡Perfecto${n ? `, *${n}*` : ""}! Te esperamos a la hora de tu reunión. ✅`;
}

export function laContestacionAlNo(nombre: string, enlaceParaReagendar: string): string {
    const n = nombre.trim();
    return (
        `Gracias por avisarnos${n ? `, *${n}*` : ""}. ¿Quieres reagendar tu reunión para otro momento?` +
        (enlaceParaReagendar ? `\n\nPuedes elegir un nuevo horario aquí:\n\n👉 ${enlaceParaReagendar}` : "")
    );
}

export type MotivoDelCambio = "no_entro" | "dijo_que_no_puede" | "rechazo_literal" | "entro";

const POR_QUE: Record<MotivoDelCambio, string> = {
    no_entro: "no se conectó en el tiempo de espera",
    dijo_que_no_puede: "dijo en la llamada que no puede asistir",
    rechazo_literal: "escribió que no le interesa",
    entro: "entró a la reunión",
};

/** El aviso a la cuenta (su número de notificaciones) de un cambio que hizo el sistema. */
export function elAvisoDelCambio(input: {
    estado: "NO_ASISTIDA" | "DESCARTADO" | "ATENDIDA";
    nombreDelCliente: string;
    telefono: string;
    inicio: Date;
    zona: string;
    motivo: MotivoDelCambio;
    frase?: string | null;
}): string {
    const titulo =
        input.estado === "NO_ASISTIDA" ? "⚠️ *Cita No asistida*"
        : input.estado === "DESCARTADO" ? "🚫 *Cita Descartada*"
        : "✅ *Cita Atendida*";
    const frase = input.frase?.trim() ? `\n💬 «${input.frase.trim().slice(0, 200)}»` : "";
    return (
        `${titulo} (automático)\n\n` +
        `👤 *Nombre:* ${input.nombreDelCliente.trim() || "Cliente"}\n` +
        `📅 *Cita:* ${laFechaDeLaCita(input.inicio, laZonaDeLaCuenta(input.zona))}\n` +
        `📝 *Motivo:* ${POR_QUE[input.motivo]}${frase}\n` +
        (input.telefono ? `📱 *WhatsApp:* +${input.telefono.replace(/\D/g, "")}` : "")
    ).trim();
}
