/**
 * Los tutoriales viven DENTRO de la landing, como sección anclada
 * (`/inicio#tutoriales`), igual que Preguntas frecuentes. Esto decide el ancla
 * de cada vista y a dónde mandan las direcciones viejas (`/tutoriales`,
 * `/tutoriales/<categoria>`), que ya no son páginas aparte: redirigen aquí.
 *
 * Puro: lo usan la sección (navegador) y las redirecciones (servidor).
 */
import { laCategoria } from "@/lib/centro-de-ayuda";

/** La ruta de la landing. El logo y las redirecciones vuelven aquí. */
export const RUTA_DE_LA_LANDING = "/inicio";

/** El `id` de la sección. El menú lleva a `#tutoriales`. */
export const ANCLA_DE_TUTORIALES = "tutoriales";

/** El `id` del principio de la landing: a donde lleva el logo. */
export const ANCLA_DEL_INICIO = "inicio";

/** El ancla de una categoría: `#tutoriales/<slug>`. */
export function elAnclaDeLaCategoria(slug: string): string {
    return `#${ANCLA_DE_TUTORIALES}/${slug}`;
}

/**
 * Qué vista pide un ancla:
 * - `undefined`: el ancla no es de los tutoriales (`#faq`, nada…), no se toca.
 * - `null`: la portada, con las diez categorías (`#tutoriales`, o una
 *   categoría que no existe: se ve de más, nunca una sección vacía).
 * - un slug: esa categoría.
 */
export function laCategoriaDelAncla(hash: string | null | undefined): string | null | undefined {
    const limpio = (hash ?? "").replace(/^#/, "");
    let texto = limpio;
    try {
        texto = decodeURIComponent(limpio);
    } catch {
        // Un `%` suelto: se lee tal cual.
    }
    if (texto === ANCLA_DE_TUTORIALES) return null;
    if (!texto.startsWith(`${ANCLA_DE_TUTORIALES}/`)) return undefined;
    const slug = texto.slice(ANCLA_DE_TUTORIALES.length + 1).replace(/\/+$/, "");
    return laCategoria(slug) ? slug : null;
}

/** A dónde manda una dirección vieja de tutoriales: la landing, con su ancla. */
export function elEnlaceDeTutoriales(slug?: string | null): string {
    const ancla = slug && laCategoria(slug) ? elAnclaDeLaCategoria(slug) : `#${ANCLA_DE_TUTORIALES}`;
    return `${RUTA_DE_LA_LANDING}${ancla}`;
}

/**
 * La vista entera que pide un ancla, también cuando se abre UNA GUÍA dentro de
 * la landing (antes «Ver» sacaba a `/guia/<modulo>`, sin la barra de arriba):
 *
 *   #tutoriales                                  → la portada
 *   #tutoriales/<categoria>                      → sus guías
 *   #tutoriales/<categoria>/<modulo>             → el índice de esa guía
 *   #tutoriales/<categoria>/<modulo>/<seccion>   → una sección de la guía
 *
 * La categoría va delante para que «volver» desde la guía caiga en SU lista.
 * `guias` dice qué módulos y secciones existen: un módulo de otra categoría o
 * que no existe se queda en la categoría (se ve de más, nunca una guía vacía),
 * y una sección que no existe se queda en el índice de la guía.
 *
 * `undefined`: el ancla no es de los tutoriales; no se toca nada.
 */
export type VistaDeTutoriales = {
    categoria: string | null;
    modulo: string | null;
    seccion: string | null;
};

export type GuiaDelAncla = { modulo: string; categoria: string | null; secciones: readonly { slug: string }[] };

export function laVistaDelAncla(
    hash: string | null | undefined,
    guias: readonly GuiaDelAncla[],
): VistaDeTutoriales | undefined {
    const limpio = (hash ?? "").replace(/^#/, "");
    let texto = limpio;
    try {
        texto = decodeURIComponent(limpio);
    } catch {
        // Un `%` suelto: se lee tal cual.
    }
    const portada: VistaDeTutoriales = { categoria: null, modulo: null, seccion: null };
    if (texto === ANCLA_DE_TUTORIALES) return portada;
    if (!texto.startsWith(`${ANCLA_DE_TUTORIALES}/`)) return undefined;
    const [cat, modulo, seccion] = texto.slice(ANCLA_DE_TUTORIALES.length + 1).split("/").filter(Boolean);
    if (!cat || !laCategoria(cat)) return portada;
    const guia = modulo ? guias.find((g) => g.modulo === modulo && g.categoria === cat) : undefined;
    if (!guia) return { categoria: cat, modulo: null, seccion: null };
    const sec = seccion && guia.secciones.some((s) => s.slug === seccion) ? seccion : null;
    return { categoria: cat, modulo: guia.modulo, seccion: sec };
}

/** El ancla de una vista: la inversa de `laVistaDelAncla`. */
export function elAnclaDeLaVista(v: VistaDeTutoriales): string {
    if (!v.categoria) return `#${ANCLA_DE_TUTORIALES}`;
    const partes = [ANCLA_DE_TUTORIALES, v.categoria, v.modulo, v.modulo ? v.seccion : null].filter(Boolean);
    return `#${partes.join("/")}`;
}
