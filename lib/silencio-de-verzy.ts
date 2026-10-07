/**
 * «Verzy, yo sigo desde aquí»: el asesor toma la palabra y el avatar se calla.
 *
 * Esto NO puede ir solo en el prompt. El modelo recibe lo que dijo el cliente
 * cuando el cliente TERMINA su turno, y no tiene forma de cortar su propia voz:
 * aunque entienda la orden, lo que ya estaba diciendo sigue saliendo y su
 * respuesta siguiente suele ser «claro, te dejo», o sea hablar otra vez.
 *
 * Así que lo hace la sala, que sí oye cada frase transcrita: al reconocer la
 * orden manda `conversation.interrupt` (corta lo que esté diciendo), deja el
 * audio del avatar en silencio y cualquier intento de volver a hablar se corta
 * igual, hasta que alguien lo llame otra vez por su nombre.
 *
 * Una herramienta («silenciar_agente») también funcionaría, pero llega tarde
 * —depende de que el modelo la llame al terminar el turno— y registrarla en la
 * persona de Tavus puede rebotar con 409 `maker_changes`. Por eso se decide aquí.
 */

/** Cómo transcribe Tavus el nombre: «Verzy», «Verzi», «Bersi»… */
const NOMBRE = "(?:v|b)(?:e|a)r?(?:z|s)(?:y|i|ay|ai|ei|ey)";

const ORDEN_DE_CALLARSE = [
    new RegExp(`\\b${NOMBRE}\\b.{0,12}\\byo sigo\\b`),
    /\byo sigo desde aqui\b/,
    /\byo continuo desde aqui\b/,
];

const LO_LLAMAN = new RegExp(`\\b${NOMBRE}\\b`);

/** Minúsculas, sin tildes ni signos: la misma comparación para todo. */
export function normalizar(texto: string): string {
    return texto
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[\u00a1!\u00bf?.,;:"\u00ab\u00bb()-]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

export function esLaOrdenDeCallarse(texto: string): boolean {
    const t = normalizar(texto);
    return ORDEN_DE_CALLARSE.some((r) => r.test(t));
}

/** ¿Lo vuelven a llamar por su nombre? (y no es la propia orden de callarse) */
export function loVuelvenALlamar(texto: string): boolean {
    const t = normalizar(texto);
    return LO_LLAMAN.test(t) && !esLaOrdenDeCallarse(texto);
}

export type QueHacerConElSilencio = "silenciar" | "reanudar" | null;

/** Lee un mensaje de Tavus: solo cuenta lo que dijo el CLIENTE. */
export function loQueHaceConElSilencio(mensaje: unknown, silenciado: boolean): QueHacerConElSilencio {
    const m = (mensaje ?? {}) as { event_type?: unknown; properties?: { role?: unknown; speech?: unknown } };
    if (m.event_type !== "conversation.utterance" || m.properties?.role !== "user") return null;
    const habla = typeof m.properties?.speech === "string" ? m.properties.speech : "";
    if (!habla) return null;
    if (esLaOrdenDeCallarse(habla)) return silenciado ? null : "silenciar";
    if (silenciado && loVuelvenALlamar(habla)) return "reanudar";
    return null;
}

/** Lo que se le cuenta a Verzy al callarlo. */
export const AL_CALLARSE =
    "Un asesor humano tomó la conversación («yo sigo desde aquí»). Quédate en silencio absoluto: no respondas, no confirmes, no te despidas. Solo vuelve a hablar si alguien te llama otra vez por tu nombre, Verzy.";

/** Lo que se le cuenta a Verzy cuando lo vuelven a llamar. */
export const AL_LLAMARLO_DE_NUEVO =
    "Te volvieron a llamar por tu nombre: ya puedes hablar. Responde a lo último que te dijeron, sin saludar otra vez.";
