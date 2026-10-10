/**
 * Cuándo se corta sola la videollamada con Verzy. Puro: lo usan la sala y el
 * banco.
 *
 * 1. **Una despedida corta la llamada**, venga de quien venga. Si se despide
 *    el cliente, Verzy contesta su despedida y, cuando termina de hablar, se
 *    cuelga. Si se despide Verzy, se cuelga cuando termina de hablar.
 * 2. **Si Verzy se va de la sala** (Tavus cerró la conversación) se cuelga,
 *    tras una gracia por si solo fue un corte.
 * 3. **Tavus avisa del fin** con `system.shutdown` o `conversation.ended`.
 */

/** Lo que tarda en colgar desde que Verzy acaba su despedida. */
export const ESPERA_TRAS_LA_DESPEDIDA_MS = 1_500;
/** Si nunca llega el «terminó de hablar», se cuelga igual pasado esto. */
export const TOPE_DE_LA_DESPEDIDA_MS = 12_000;
/** Si Verzy sale de la sala y no vuelve en este rato, se cuelga. */
export const GRACIA_SI_VERZY_SALE_MS = 8_000;

const DESPEDIDAS = [
    /\badi[oó]s\b/,
    /\bchao\b/,
    /\bchau\b/,
    /\bhasta (luego|pronto|la pr[oó]xima|ma[nñ]ana|otra)\b/,
    /\bnos vemos\b/,
    /\bnos hablamos\b/,
    /\bque (tengas|tenga|est[eé]s) (un )?(buen|bonito|excelente|lindo) (d[ií]a|tarde|noche)\b/,
    /\bme despido\b/,
    /\bbye\b/,
];

/** ¿Este texto es una despedida? Solo mira el final: «hola, adiós» no es mitad de frase. */
export function esUnaDespedida(texto: unknown): boolean {
    if (typeof texto !== "string") return false;
    const limpio = texto.toLowerCase().replace(/[¡!¿?.,;:]+/g, " ").replace(/\s+/g, " ").trim();
    if (!limpio) return false;
    // La despedida va al final de lo dicho: se miran las últimas palabras.
    const final = limpio.split(" ").slice(-12).join(" ");
    return DESPEDIDAS.some((r) => r.test(final));
}

export type LoQueTerminaLaLlamada =
    | { tipo: "fin" }
    | { tipo: "despedida"; quien: "cliente" | "verzy" }
    | { tipo: "verzy_termino_de_hablar" }
    | null;

/** Lee un `app-message` de Daily (formato Tavus) y dice si toca al fin de la llamada. */
export function loQueTerminaLaLlamada(mensaje: unknown): LoQueTerminaLaLlamada {
    if (!mensaje || typeof mensaje !== "object") return null;
    const m = mensaje as { event_type?: unknown; properties?: { role?: unknown; speech?: unknown } };
    if (m.event_type === "system.shutdown" || m.event_type === "conversation.ended") return { tipo: "fin" };
    if (m.event_type === "conversation.replica.stopped_speaking") return { tipo: "verzy_termino_de_hablar" };
    if (m.event_type === "conversation.utterance" && esUnaDespedida(m.properties?.speech)) {
        return { tipo: "despedida", quien: m.properties?.role === "replica" ? "verzy" : "cliente" };
    }
    return null;
}

/** Lo que se le cuenta a Verzy cuando el cliente se despide. */
export const AL_DESPEDIRSE_EL_CLIENTE =
    "El cliente se está despidiendo. Despídete en una sola frase corta y amable; la llamada se cerrará al terminar.";

/**
 * Lo que espera Tavus a que el cliente VUELVA si se le cae la conexión
 * (`participant_left_timeout`), en segundos. Ese rato Tavus lo cobra: con 180
 * eran tres minutos pagados tras cada llamada. Un minuto deja volver a quien
 * se le cortó la red sin pagar de más.
 */
export const ESPERA_SI_SE_CAE_S = 60;

/**
 * ¿Al colgar se le dice a Tavus que la conversación TERMINÓ (y deja de
 * cobrar al momento)? Sí cuando se cuelga A PROPÓSITO («Salir», la
 * despedida, el límite de minutos, Verzy que se fue) y no queda nadie más en
 * la sala. No si Tavus ya la terminó, ni si otra persona sigue dentro (el
 * asesor que sale no le corta la llamada al cliente). Una caída de la red no
 * pasa por aquí: ahí Tavus espera `ESPERA_SI_SE_CAE_S`.
 */
export function terminaLaConversacionAlColgar(input: { porque: string; quedanOtrasPersonas: boolean }): boolean {
    if (input.porque === "fin-de-tavus") return false;
    return !input.quedanOtrasPersonas;
}
