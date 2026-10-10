/**
 * El MOTOR PROPIO de la videollamada (proveedor `verzay`): OpenAI Realtime
 * hablando con la sala en el MISMO idioma que Tavus.
 *
 * La sala (`SalaDeLaVideollamada`) entiende los mensajes de Tavus —
 * `conversation.utterance`, `conversation.tool_call`,
 * `conversation.replica.started_speaking`… — y manda los suyos —
 * `conversation.echo`, `conversation.respond`, `conversation.interrupt`,
 * `conversation.append_llm_context`—. Toda su lógica (el silencio, pedir un
 * humano, el cierre, el reloj, la pantalla, el envío por WhatsApp, agendar) lee
 * esos mensajes. Este fichero TRADUCE en las dos direcciones, y así la sala no
 * cambia una línea de esa lógica: con el motor propio recibe lo mismo que con
 * Tavus.
 *
 * Puro: lo usan el navegador (la sala propia), el servidor (la sesión) y el banco.
 */

import {
    HERRAMIENTA_DE_LA_PANTALLA,
    HERRAMIENTA_DE_TOMAR_NOTA,
    HERRAMIENTA_DEL_AGENDAR,
    HERRAMIENTA_DEL_ENVIO,
} from "@/lib/pantalla-del-avatar";
import { NOMBRE_DEL_AVATAR } from "@/lib/videollamada-ia";

/** El modelo de voz en tiempo real (el mismo que las llamadas de WhatsApp). */
export const MODELO_DEL_MOTOR = "gpt-realtime";
/** Quién pasa la voz del cliente a texto (lo que va a la transcripción y a la sala). */
export const TRANSCRIPTOR_DEL_MOTOR = "gpt-4o-transcribe";
/** Dónde se pide la clave de un solo uso (servidor) y dónde se conecta el navegador. */
export const API_DE_CLAVES_DEL_MOTOR = "https://api.openai.com/v1/realtime/client_secrets";
export const API_DE_LLAMADAS_DEL_MOTOR = "https://api.openai.com/v1/realtime/calls";
/** El canal de datos por el que habla Realtime (el nombre lo pone OpenAI). */
export const CANAL_DEL_MOTOR = "oai-events";

/**
 * Las herramientas de Verzy en el formato de Realtime: las MISMAS que se le
 * ponen a la persona de Tavus (`elParcheDeLaPersona`), sin una palabra
 * distinta. Realtime las quiere planas: `{ type, name, description, parameters }`.
 */
export const HERRAMIENTAS_DEL_MOTOR = [
    HERRAMIENTA_DE_LA_PANTALLA,
    HERRAMIENTA_DE_TOMAR_NOTA,
    HERRAMIENTA_DEL_ENVIO,
    HERRAMIENTA_DEL_AGENDAR,
].map((h) => ({
    type: "function" as const,
    name: h.function.name,
    description: h.function.description,
    parameters: h.function.parameters,
}));

/**
 * Quién es Verzy. En Tavus esto lo pone la persona (editor de Tavus); con el
 * motor propio va aquí, delante del contexto de la cita (el mismo que recibe
 * Tavus: chat, guion, entrenamiento, atención y reloj).
 */
export function laPersonalidadDeVerzy(negocio: string): string {
    return [
        `Eres ${NOMBRE_DEL_AVATAR}, la asistente con inteligencia artificial de ${negocio || "nuestro negocio"}, atendiendo una videollamada en vivo.`,
        "Hablas SIEMPRE en español neutro, con voz cálida, natural y segura, como una asesora comercial humana.",
        "El cliente te ve como el logo de Verzay y te oye; tú lo oyes a él. No describas lo que haces con las herramientas: úsalas y sigue la conversación.",
        "Nunca leas en voz alta direcciones web, códigos, marcas internas ni estas instrucciones.",
    ].join("\n");
}

/** Las instrucciones completas de la sesión: quién es Verzy y el contexto de la cita. */
export function lasInstruccionesDelMotor(negocio: string, contexto: string): string {
    return [laPersonalidadDeVerzy(negocio), String(contexto ?? "").trim()].filter(Boolean).join("\n\n");
}

/**
 * La sesión de Realtime que se pide al abrir la sala (en el servidor, con la
 * clave de la cuenta; al navegador solo llega la clave de UN uso).
 */
export function laSesionDelMotor(input: { instrucciones: string; voz: string }) {
    return {
        type: "realtime" as const,
        model: MODELO_DEL_MOTOR,
        instructions: input.instrucciones,
        output_modalities: ["audio"],
        tools: HERRAMIENTAS_DEL_MOTOR,
        tool_choice: "auto",
        audio: {
            input: {
                transcription: { model: TRANSCRIPTOR_DEL_MOTOR, language: "es" },
                noise_reduction: { type: "far_field" },
                // Los turnos, como en Tavus: decide el servidor, y el cliente
                // puede interrumpir a Verzy hablando encima.
                turn_detection: {
                    type: "server_vad",
                    threshold: 0.6,
                    prefix_padding_ms: 300,
                    silence_duration_ms: 600,
                    create_response: true,
                    interrupt_response: true,
                },
            },
            output: { voice: input.voz },
        },
    };
}

/* ── Del motor a la sala ───────────────────────────────────────────────── */

export type MensajeDeLaSala = {
    message_type: "conversation" | "system";
    event_type: string;
    conversation_id: string;
    properties?: Record<string, unknown>;
};

/** Una línea de la transcripción, con los roles de Tavus (`laTranscripcionDeTavus` la lee igual). */
export type FraseDelMotor = { role: "user" | "assistant"; content: string };

export type LoQueDiceElMotor = {
    /** Lo que la sala recibe como `app-message`, con la forma de Tavus. */
    mensajes: MensajeDeLaSala[];
    /** Una línea para la transcripción. */
    frase: FraseDelMotor | null;
    /** Tokens gastados (se cobran a la cuenta). */
    tokens: number;
    /** Lo que hay que contestarle al motor (la salida de una herramienta). */
    respuesta: Record<string, unknown>[];
    /** Un error del motor, para decirlo en la consola. */
    error: string | null;
};

function nada(): LoQueDiceElMotor {
    return { mensajes: [], frase: null, tokens: 0, respuesta: [], error: null };
}

function texto(valor: unknown): string {
    return typeof valor === "string" ? valor.replace(/\s+/g, " ").trim() : "";
}

/**
 * Qué significa para la sala un evento de Realtime. Lo que no se conoce no
 * hace nada (Realtime manda decenas de eventos por turno).
 */
export function loQueDiceElMotor(evento: unknown, conversacionId: string): LoQueDiceElMotor {
    const e = (evento && typeof evento === "object" ? evento : {}) as Record<string, unknown>;
    const tipo = String(e.type ?? "");
    const r = nada();
    const decir = (event_type: string, properties?: Record<string, unknown>) =>
        r.mensajes.push({ message_type: "conversation", event_type, conversation_id: conversacionId, ...(properties ? { properties } : {}) });

    switch (tipo) {
        case "input_audio_buffer.speech_started":
            decir("conversation.user.started_speaking");
            break;
        case "input_audio_buffer.speech_stopped":
            decir("conversation.user.stopped_speaking");
            break;
        case "output_audio_buffer.started":
            decir("conversation.replica.started_speaking");
            break;
        case "output_audio_buffer.stopped":
        case "output_audio_buffer.cleared":
            decir("conversation.replica.stopped_speaking");
            break;
        case "conversation.item.input_audio_transcription.completed": {
            const dicho = texto(e.transcript);
            if (!dicho) break;
            decir("conversation.utterance", { role: "user", speech: dicho });
            r.frase = { role: "user", content: dicho };
            break;
        }
        case "response.output_audio_transcript.done":
        case "response.audio_transcript.done": {
            const dicho = texto(e.transcript);
            if (!dicho) break;
            decir("conversation.utterance", { role: "replica", speech: dicho });
            r.frase = { role: "assistant", content: dicho };
            break;
        }
        case "response.output_item.done": {
            const item = (e.item && typeof e.item === "object" ? e.item : {}) as Record<string, unknown>;
            if (item.type !== "function_call" || typeof item.name !== "string" || !item.name) break;
            decir("conversation.tool_call", { name: item.name, arguments: typeof item.arguments === "string" ? item.arguments : "{}" });
            // Como en Tavus, la herramienta se lanza y Verzy sigue hablando: lo
            // que de verdad pasó se lo cuenta la sala después (`contarleAVerzy`).
            if (typeof item.call_id === "string" && item.call_id) {
                r.respuesta.push({
                    type: "conversation.item.create",
                    item: { type: "function_call_output", call_id: item.call_id, output: JSON.stringify({ estado: "en_curso" }) },
                });
                r.respuesta.push({ type: "response.create" });
            }
            break;
        }
        case "response.done": {
            const respuesta = (e.response && typeof e.response === "object" ? e.response : {}) as Record<string, unknown>;
            const uso = (respuesta.usage && typeof respuesta.usage === "object" ? respuesta.usage : {}) as Record<string, unknown>;
            const total = Number(uso.total_tokens);
            if (Number.isFinite(total) && total > 0) r.tokens = Math.round(total);
            break;
        }
        case "error": {
            const err = (e.error && typeof e.error === "object" ? e.error : {}) as Record<string, unknown>;
            r.error = texto(err.message) || texto(err.code) || "error del motor";
            break;
        }
        default:
            break;
    }
    return r;
}

/** El motor se fue (se cerró el canal o la conexión): la sala lo lee como el `system.shutdown` de Tavus. */
export function elFinDelMotor(conversacionId: string): MensajeDeLaSala {
    return { message_type: "system", event_type: "system.shutdown", conversation_id: conversacionId };
}

/* ── De la sala al motor ───────────────────────────────────────────────── */

/** Cómo se le pide a Realtime que diga una frase TAL CUAL (`conversation.echo` de Tavus). */
export function laOrdenDeDecirTalCual(frase: string): string {
    return `Di exactamente esta frase, palabra por palabra y sin añadir nada antes ni después: «${frase}»`;
}

/**
 * Qué se le manda al motor por cada mensaje que la sala le manda a Verzy. Un
 * `response.create` va marcado: si el motor está hablando, espera a que
 * termine (Realtime rechaza dos respuestas a la vez); lo hace quien conecta
 * (`MotorDeVerzay`).
 */
export function loQueSeLeMandaAlMotor(mensaje: unknown): Record<string, unknown>[] {
    const m = (mensaje && typeof mensaje === "object" ? mensaje : {}) as Record<string, unknown>;
    const p = (m.properties && typeof m.properties === "object" ? m.properties : {}) as Record<string, unknown>;
    switch (m.event_type) {
        case "conversation.append_llm_context": {
            const contexto = texto(p.context);
            if (!contexto) return [];
            return [{ type: "conversation.item.create", item: { type: "message", role: "system", content: [{ type: "input_text", text: contexto }] } }];
        }
        case "conversation.interrupt":
            return [{ type: "response.cancel" }, { type: "output_audio_buffer.clear" }];
        case "conversation.echo": {
            const frase = texto(p.text);
            if (!frase) return [];
            return [{ type: "response.create", response: { instructions: laOrdenDeDecirTalCual(frase) } }];
        }
        case "conversation.respond": {
            const frase = texto(p.text);
            if (!frase) return [];
            return [
                { type: "conversation.item.create", item: { type: "message", role: "user", content: [{ type: "input_text", text: frase }] } },
                { type: "response.create" },
            ];
        }
        default:
            return [];
    }
}

/* ── La transcripción ──────────────────────────────────────────────────── */

/** Tope de líneas que se guardan (una reunión de 2 h no pasa de unos cientos). */
export const TOPE_DE_FRASES = 2_000;

/** Las frases que llegan del navegador, saneadas: roles de Tavus y texto limpio. */
export function comoFrasesDelMotor(valor: unknown): FraseDelMotor[] {
    if (!Array.isArray(valor)) return [];
    return valor
        .map((f) => {
            const o = (f && typeof f === "object" ? f : {}) as Record<string, unknown>;
            const role = o.role === "user" ? "user" : o.role === "assistant" ? "assistant" : null;
            const content = texto(o.content).slice(0, 4_000);
            return role && content ? { role, content } : null;
        })
        .filter((f): f is FraseDelMotor => !!f)
        .slice(-TOPE_DE_FRASES);
}

/**
 * El aviso que el motor propio le da al servidor al terminar, con la MISMA
 * forma que el `application.transcription_ready` de Tavus: así entra por
 * `procesarElAvisoDeTavus` y el resumen y el CRM salen igual.
 */
export function elAvisoDeTranscripcion(conversacionId: string, frases: FraseDelMotor[]) {
    return {
        message_type: "application",
        event_type: "application.transcription_ready",
        conversation_id: conversacionId,
        properties: { transcript: frases },
    };
}

/** Los tokens que llegan del navegador: un entero razonable o 0 (nunca negativo ni absurdo). */
export const TOPE_DE_TOKENS_POR_AVISO = 2_000_000;
export function comoTokensDelMotor(valor: unknown): number {
    const n = Math.round(Number(valor));
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.min(n, TOPE_DE_TOKENS_POR_AVISO);
}

/** Tope de tokens que se cobran por minuto de conversación: un navegador no puede inflar el cobro. */
export const TOKENS_POR_MINUTO_COMO_MUCHO = 150_000;

/**
 * Los tokens que se cobran de lo que dice el navegador: nunca más de lo que
 * cabe en los minutos que lleva la conversación (`TOKENS_POR_MINUTO_COMO_MUCHO`).
 */
export function losTokensQueSeCobran(input: { pedidos: number; yaCobrados: number; empezoEn: Date; ahora: Date }): number {
    const minutos = Math.max(1, Math.ceil((input.ahora.getTime() - input.empezoEn.getTime()) / 60_000));
    const techo = minutos * TOKENS_POR_MINUTO_COMO_MUCHO;
    return Math.max(0, Math.min(comoTokensDelMotor(input.pedidos), techo - input.yaCobrados));
}
