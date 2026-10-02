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
