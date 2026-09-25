/**
 * El prompt maestro PROPIO de una cuenta. Puro, sin base.
 *
 * El maestro global son las filas `SystemMessage` (TRAINING) de la cuenta de
 * la plataforma, y el backend lo pone delante del entrenamiento de TODAS las
 * cuentas (`PromptService.getPromptMaestro`, api-webhook). Una cuenta puede
 * tener además el suyo: **si tiene texto, sustituye al global; si está vacío,
 * la cuenta recibe el global exactamente como hasta ahora.**
 *
 * Solo lo escribe el dueño de la plataforma (`esSuperAdminDeVerdad`), desde
 * Panel › Clientes. El cliente no lo ve ni lo edita.
 *
 * El backend lleva su copia de esta regla (`prompt-maestro.ts`) con el MISMO
 * criterio de vacío: sin eso, un texto de solo espacios se guardaría aquí como
 * «tiene prompt» y allí se leería como vacío.
 */

/**
 * Tope de caracteres. No es un límite del modelo: es lo que impide que un
 * pegado accidental de un documento entero se meta delante de CADA respuesta
 * del agente de esa cuenta.
 */
export const TOPE_DEL_PROMPT_MAESTRO = 100_000;

/** Vacío o solo espacios es `null`: «esta cuenta usa el global». */
export function comoPromptMaestroPropio(texto: unknown): string | null {
    if (typeof texto !== "string") return null;
    return texto.trim() ? texto : null;
}

/** El maestro que recibe la cuenta: el propio si lo hay, si no el global. */
export function elPromptMaestroQueToca(propio: unknown, global: string): string {
    return comoPromptMaestroPropio(propio) ?? global;
}
