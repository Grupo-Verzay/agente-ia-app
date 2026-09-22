/**
 * Cómo se guarda la síntesis del lead que se edita en el panel «Contexto del
 * lead».
 *
 * Es el MISMO comportamiento que tenía la ventana emergente que se quitó de la
 * barra (`SintesisEditDialog`), escrito una vez y sin React para poder
 * probarlo:
 *
 * - Si el lead ya tiene un seguimiento, la síntesis es su `summarySnapshot` y
 *   se ACTUALIZA sobre ese seguimiento (`updateFollowUpSummarySnapshot`).
 * - Si no tiene ninguno, se CREA una síntesis manual
 *   (`createManualSynthesis`), que es la que deja constancia del contexto.
 * - Vacía —o solo espacios— **no se guarda**: el botón sale apagado, como en la
 *   ventana. Guardar una cadena vacía borraría lo que había sin decirlo.
 */
export type ComoSeGuardaLaSintesis =
    | { accion: "actualizar"; followUpId: string; texto: string }
    | { accion: "crear"; texto: string }
    | { accion: "nada" };

export function comoSeGuardaLaSintesis(
    followUpId: string | null | undefined,
    texto: string,
): ComoSeGuardaLaSintesis {
    if (!texto.trim()) return { accion: "nada" };
    if (followUpId) return { accion: "actualizar", followUpId, texto };
    return { accion: "crear", texto };
}

/**
 * El orden de los bloques del panel, de arriba abajo. Lo pinta el panel en este
 * orden y lo comprueba el banco leyendo el componente.
 */
export const ORDEN_DEL_CONTEXTO = [
    "puntuacion",
    "estado",
    "etiquetas",
    "seguimientos",
    "sintesis",
    "playbook",
] as const;
