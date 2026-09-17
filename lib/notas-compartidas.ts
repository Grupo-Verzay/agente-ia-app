/**
 * Bajo qué identidades le LLEGA a alguien una nota compartida.
 *
 * Es una pregunta distinta de «¿de quién son estas notas?», y mezclarlas es lo
 * que rompería la regla que ya costó un incidente:
 *
 * - **De quién son** lo decide `elDuenoDeLasNotas`, y es SIEMPRE quien mira.
 *   Las notas son de la PERSONA, no de la cuenta: si eso devolviera la cuenta,
 *   un `agente` abriría `/notas` y vería todas las notas privadas de su dueño.
 *   Eso no se toca.
 * - **A quién le llega un compartido** es esto, y sí mira la cuenta. Compartir
 *   se hace **con una cuenta** —el selector ofrece cuentas, y `note_shares`
 *   guarda el id de esa cuenta—, así que si solo se busca por el id de la
 *   persona, quien entra con su propia identidad no encuentra nada.
 *
 * El caso real: se comparte una nota desde Grupo Verzay con la cuenta
 * «Verzay | Atencion» en modo lectura. El dueño de esa cuenta la ve —su id ES
 * el de la fila—, pero su administrador entra con el suyo, `note_shares` no lo
 * conoce y la lista le sale vacía. No hay error, no hay aviso: simplemente no
 * está.
 *
 * ## Quién hereda y quién no
 *
 * Solo el **administrador**, que es el mismo reparto de `cuentaQueManda` y de
 * `canManageWorkspace`: la mano derecha del dueño actúa por la cuenta. Un
 * **`agente` no**: participa en lo que le asignen, y una nota compartida con la
 * cuenta no se le asignó a él.
 *
 * ## Por qué es puro y no `cuentaQueManda`
 *
 * `cuentaQueManda` es `async` y va a la base a leer el ROL de la cuenta, que
 * aquí no hace falta: lo único que se necesita es su id, y ese ya viaja en la
 * sesión. Es el mismo motivo por el que `rolQueAbrePuertas` se escribió puro
 * al lado del suyo.
 */

export type QuienRecibe = {
    id?: string | null;
    /** La cuenta de la que cuelga esta persona, si cuelga de alguna. */
    ownerId?: string | null;
    /** Su papel dentro de esa cuenta: `administrador` o `agente`. */
    advisorRole?: string | null;
};

/**
 * Las identidades bajo las que a esta persona le llega algo compartido, sin
 * repetidos y con la suya SIEMPRE primero.
 *
 * La suya va primero porque es la que decide cuando hay dos filas para la misma
 * nota —una compartida con ella y otra con su cuenta—: entre dos permisos gana
 * el más alto, pero para todo lo demás manda el suyo.
 */
export function identidadesQueRecibenCompartidos(persona: QuienRecibe): string[] {
    const propia = persona?.id?.trim();
    if (!propia) return [];

    const cuenta = persona.ownerId?.trim();
    // Sin cuenta no hay nada que heredar. Y `ownerId === id` es el caso de las
    // cuentas vinculadas: ahí `currentUser()` ya devuelve la fila de la cuenta,
    // así que añadirla sería repetir la propia.
    if (!cuenta || cuenta === propia) return [propia];

    // Un agente se queda como estaba, a propósito.
    if (persona.advisorRole !== "administrador") return [propia];

    return [propia, cuenta];
}

/** ¿Le llega a esta persona por su cuenta y no por sí misma? Para los avisos. */
export function recibePorSuCuenta(persona: QuienRecibe): boolean {
    return identidadesQueRecibenCompartidos(persona).length > 1;
}
