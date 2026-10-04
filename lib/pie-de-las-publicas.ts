// El pie de las tres pantallas públicas —la landing principal, la página de un
// plan y la propuesta comercial— dice lo MISMO, con el año del sistema.
//
// Escrito una vez: con el texto en cada pantalla, una decía «© 2026 Agente IA.
// Todos los derechos reservados.», otra «© 2026 <marca>» y la propuesta ni lo
// decía. Y el año sale del reloj, nunca escrito: las tres páginas son
// `force-dynamic`, así que cambia solo el 1 de enero.

export const MARCA_DEL_PIE = "Agente IA";

export function elTextoDeLosDerechos(anio: number = new Date().getFullYear()): string {
    return `© ${anio} ${MARCA_DEL_PIE}. Todos los derechos reservados.`;
}

/**
 * La línea de más de la propuesta: quién la preparó, y que se hizo con Agente
 * IA. El nombre es el del negocio que la manda (`negocio.nombre`); sin nombre,
 * o si el negocio ya se llama como la plataforma, no se repite.
 */
export function elTextoDePreparadaPor(nombre: string | null | undefined): string {
    const limpio = (nombre ?? "").trim();
    if (!limpio || limpio.toLowerCase() === MARCA_DEL_PIE.toLowerCase()) {
        return `Propuesta preparada por ${MARCA_DEL_PIE}`;
    }
    return `Propuesta preparada por ${limpio}, ${MARCA_DEL_PIE}`;
}

/**
 * Lo que mide la raya y lo que hay debajo, igual en las tres. La raya va DENTRO
 * del contenedor del contenido (nunca de lado a lado de la pantalla) y el aire
 * de ENCIMA lo pone cada pantalla con su propio espacio entre bloques: así la
 * separación entre el último bloque y la raya es la misma que entre dos bloques.
 */
export const LINEA_DEL_PIE = "border-t py-6";

export const COLORES_DEL_PIE = {
    // La landing y la página de un plan son oscuras siempre.
    oscuro: { linea: "border-white/10", texto: "text-slate-500" },
    // La propuesta sigue el tema del dispositivo (`--plan-*`).
    propuesta: { linea: "border-plan-borde", texto: "text-plan-tenue" },
} as const;

export type TemaDelPie = keyof typeof COLORES_DEL_PIE;

/**
 * El aire ENCIMA del pie de cada pantalla, para que «último bloque → raya»
 * mida lo mismo que «bloque → bloque»:
 *
 * - landing: sus bloques son `py-6` (24 + 24 = 48), y el último deja 24 debajo;
 * - un plan: sus bloques son `py-8 sm:py-10` (64/80), y el último deja 32/40;
 * - la propuesta: sus bloques van `mt-8` (32) y el último no deja nada debajo.
 */
export const AIRE_ENCIMA_DEL_PIE = {
    landing: "pt-6",
    plan: "pt-8 sm:pt-10",
    propuesta: "mt-8",
} as const;
