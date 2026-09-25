/**
 * Etiquetas y respuestas rápidas PERSONALES de un asesor: las reglas, puras.
 *
 * Las filas siguen siendo de la CUENTA (`Tag.userId`, `rr.userId`): así las
 * asigna, las lista y las comprueba todo lo que ya existe, sin un camino
 * aparte. Lo único nuevo es una marca al lado —«esta es de esta persona»—, en
 * una tabla de la App (`lib/personales-db.ts`).
 *
 * # Quién la crea decide si es personal
 *
 * Lo que crea quien NO manda en la cuenta (un agente) es suyo. Lo que crean el
 * dueño o un administrador es de la cuenta, como siempre. No hay casilla que
 * marcar: el asesor las crea en sus pantallas de siempre —Etiquetas y
 * Respuestas rápidas— y ya son suyas.
 *
 * Lo que ya existía antes de esto se queda como de la cuenta: no hay forma de
 * saber quién creó cada fila vieja, y adivinarlo sería esconderle a alguien una
 * etiqueta que hoy usa.
 *
 * # Quién la ve
 *
 * Su dueña, el dueño de la cuenta y los administradores. Los demás asesores no.
 */

export type QuienVe = { personaId: string; manda: boolean };

/**
 * ¿Ve esta fila? `personal` es la persona dueña de la marca, o nada si la fila
 * es de la cuenta.
 */
export function laVe(personal: string | null | undefined, quien: QuienVe): boolean {
    if (!personal) return true;
    if (quien.manda) return true;
    return personal === quien.personaId;
}

/** ¿Puede editar o borrar esta fila? De la cuenta: quien manda. Personal: su dueña y quien manda. */
export function laPuedeTocar(personal: string | null | undefined, quien: QuienVe): boolean {
    if (quien.manda) return true;
    return Boolean(personal) && personal === quien.personaId;
}

/** Lo que crea quien no manda es suyo. */
export function naceSuya(quien: QuienVe): boolean {
    return !quien.manda;
}

/**
 * El slug de una etiqueta personal lleva a su persona dentro.
 *
 * `Tag` es única por `(userId, slug)` y `userId` es la cuenta: sin esto, dos
 * asesores de la misma cuenta no podrían tener cada uno su «Llamar tarde», y el
 * segundo recibiría «ya existe» por una etiqueta que ni siquiera puede ver.
 */
export function slugPersonal(base: string, personaId: string): string {
    const persona = personaId.toLowerCase().replace(/[^a-z0-9]/g, "");
    return `${base}--p-${persona}`;
}

/** Cómo se agrupa una fila para quien mira. */
export type Grupo = "mias" | "de-asesores" | "de-la-cuenta";

export function elGrupo(personal: string | null | undefined, quien: QuienVe): Grupo {
    if (!personal) return "de-la-cuenta";
    return personal === quien.personaId ? "mias" : "de-asesores";
}

export const TITULO_DEL_GRUPO: Record<Grupo, string> = {
    mias: "Mis etiquetas",
    "de-asesores": "De los asesores",
    "de-la-cuenta": "De la cuenta",
};

/** El orden en que se enseñan los grupos: lo propio primero. */
export const ORDEN_DE_LOS_GRUPOS: readonly Grupo[] = ["mias", "de-asesores", "de-la-cuenta"];

/**
 * Reparte una lista en sus grupos, en su orden, sin grupos vacíos. Si todo es de
 * la cuenta devuelve UN grupo sin título: donde nadie tiene nada personal, la
 * lista se ve exactamente como antes.
 */
export function enGrupos<T extends { grupo?: Grupo }>(
    filas: readonly T[],
    titulos: Record<Grupo, string> = TITULO_DEL_GRUPO,
): Array<{ grupo: Grupo; titulo: string | null; filas: T[] }> {
    const porGrupo = new Map<Grupo, T[]>();
    for (const f of filas) {
        const g = f.grupo ?? "de-la-cuenta";
        porGrupo.set(g, [...(porGrupo.get(g) ?? []), f]);
    }
    const hayPersonales = Array.from(porGrupo.keys()).some((g) => g !== "de-la-cuenta");
    return ORDEN_DE_LOS_GRUPOS.filter((g) => porGrupo.has(g)).map((g) => ({
        grupo: g,
        titulo: hayPersonales ? titulos[g] : null,
        filas: porGrupo.get(g) ?? [],
    }));
}

export const TITULO_DE_LAS_RESPUESTAS: Record<Grupo, string> = {
    mias: "Mis respuestas",
    "de-asesores": "De los asesores",
    "de-la-cuenta": "De la cuenta",
};
