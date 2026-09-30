/**
 * La INTRODUCCIÓN de una guía pública (el bloque de título, subtítulo y
 * descripción del índice), editable desde Documentación › Administrador guías.
 *
 * Lo que se guarda es lo que se CAMBIÓ: un campo vacío vuelve al texto escrito
 * en el código de la guía (`lib/guia-<modulo>.ts`). Así una guía nueva sale
 * con su texto sin que nadie tenga que sembrar nada, y «Restaurar» es guardar
 * vacío.
 *
 * Puro: lo usan la acción que guarda, la página pública que lo pinta y el
 * banco.
 */

export type Introduccion = { titulo: string; subtitulo: string; descripcion: string };

/** Los módulos con guía pública. La llave de la tabla y el `/guia/<modulo>`. */
export const MODULOS_CON_GUIA = ["leads", "catalogo", "diagramas", "reuniones", "notas"] as const;
export type ModuloConGuia = (typeof MODULOS_CON_GUIA)[number];

/** Cómo se llama cada guía para una persona: el mismo nombre que su menú. */
export const NOMBRE_DE_LA_GUIA: Record<ModuloConGuia, string> = {
    leads: "Leads",
    catalogo: "Catálogo",
    diagramas: "Diagramas",
    reuniones: "Reuniones",
    notas: "Mis notas",
};

/** El nombre de una guía; lo que no se reconoce se enseña tal cual. */
export function elNombreDeLaGuia(modulo: string): string {
    return esModuloConGuia(modulo) ? NOMBRE_DE_LA_GUIA[modulo] : modulo;
}

export const TOPES: Record<keyof Introduccion, number> = {
    titulo: 80,
    subtitulo: 160,
    descripcion: 1200,
};

export function esModuloConGuia(m: unknown): m is ModuloConGuia {
    return typeof m === "string" && (MODULOS_CON_GUIA as readonly string[]).includes(m);
}

const limpio = (v: unknown) => (typeof v === "string" ? v.replace(/\r\n/g, "\n").trim() : "");

/** Lo que llega del navegador, saneado. Lo que pasa del tope se RECHAZA, no se recorta. */
export function comoIntroduccion(
    v: unknown,
): { ok: true; valor: Introduccion } | { ok: false; motivo: string } {
    const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
    const valor: Introduccion = {
        titulo: limpio(o.titulo).replace(/\s+/g, " "),
        subtitulo: limpio(o.subtitulo).replace(/\s+/g, " "),
        descripcion: limpio(o.descripcion),
    };
    for (const k of ["titulo", "subtitulo", "descripcion"] as const) {
        if (valor[k].length > TOPES[k]) {
            return { ok: false, motivo: `El ${k === "titulo" ? "título" : k} pasa de ${TOPES[k]} caracteres.` };
        }
    }
    return { ok: true, valor };
}

/** Lo que se enseña: lo guardado donde tenga texto, y si no, el del código. */
export function laIntroduccionQueSeEnsena(guardada: Partial<Introduccion> | null, porDefecto: Introduccion): Introduccion {
    const elegir = (k: keyof Introduccion) => (guardada?.[k]?.trim() ? guardada[k]!.trim() : porDefecto[k]);
    return { titulo: elegir("titulo"), subtitulo: elegir("subtitulo"), descripcion: elegir("descripcion") };
}

/** La descripción en párrafos: una línea en blanco separa dos. */
export function losParrafos(texto: string): string[] {
    return texto
        .split(/\n\s*\n/)
        .map((p) => p.replace(/\s*\n\s*/g, " ").trim())
        .filter(Boolean);
}
