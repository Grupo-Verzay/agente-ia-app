/**
 * El selector de la barra de arriba que alterna entre Chats y Correos sin pasar
 * por el menú. Puro, para poder probarlo sin navegador.
 *
 * Dos reglas:
 * 1. **Sale en TODAS las pantallas**, y marca la activa solo en Chats o en
 *    Correos; en cualquier otra no marca ninguna.
 * 2. **Y solo si la persona tiene LAS DOS en su menú.** Ofrecer Correos a quien
 *    no lo tiene es un enlace que lleva a una puerta cerrada; con una sola no
 *    hay nada que elegir.
 */
export const BANDEJAS = [
    { clave: "chats", ruta: "/chats", nombre: "Chats" },
    { clave: "correo", ruta: "/correo", nombre: "Correos" },
] as const;

export type ClaveDeBandeja = (typeof BANDEJAS)[number]["clave"];

function esLaRuta(pathname: string, ruta: string): boolean {
    return pathname === ruta || pathname.startsWith(ruta + "/");
}

/** Cuál de las dos se está mirando, o `null` si ninguna. */
export function laBandejaActiva(pathname: string | null | undefined): ClaveDeBandeja | null {
    if (!pathname) return null;
    return BANDEJAS.find((b) => esLaRuta(pathname, b.ruta))?.clave ?? null;
}

/**
 * ¿Se pinta el selector? `rutas` son las del menú de la persona. La pantalla
 * no importa: sale en todas (solo decide cuál se marca, `laBandejaActiva`).
 */
export function seVeLaBarritaDeBandejas(rutas: (string | null | undefined)[]): boolean {
    const tiene = new Set(rutas.filter((r): r is string => typeof r === "string").map((r) => r.replace(/\/+$/, "")));
    return BANDEJAS.every((b) => tiene.has(b.ruta));
}

// ─── Dónde va el selector ────────────────────────────────────────────────
//
// Vive en la barra de arriba, pero se CENTRA en la columna de la lista de
// conversaciones (la de Chats o la de Correos), no en la barra. Fuera de esas
// pantallas no hay columna: se centra donde estaría (el mismo ancho,
// `--ancho-lateral`, desde el borde izquierdo del contenido).
//
// Nunca puede montarse sobre la casita y el menú (a su izquierda) ni sobre los
// botones de la derecha. Si centrado con sus palabras no cabe, prueba solo con
// los iconos —también centrado—; y si ni así, se queda lo más cerca posible.

/** Ancho de una pestaña con su palabra: `w-[5.5rem]`. */
export const ANCHO_DE_PESTANA_PX = 88;
/** Ancho de una pestaña solo con su icono: `w-8`. */
export const ANCHO_DE_PESTANA_COMPACTA_PX = 32;
/** Borde (1+1), relleno `p-px` (1+1) y el hueco `gap-0.5` entre las dos. */
export const RELLENO_DEL_SELECTOR_PX = 6;

export function elAnchoDelSelector(compacto: boolean): number {
    const pestana = compacto ? ANCHO_DE_PESTANA_COMPACTA_PX : ANCHO_DE_PESTANA_PX;
    return pestana * BANDEJAS.length + RELLENO_DEL_SELECTOR_PX;
}

/**
 * Medidas en píxeles, relativas al borde izquierdo de la barra.
 * `minimo`: donde acaba lo de la izquierda (casita y menú) más su hueco.
 * `maximo`: donde empieza lo de la derecha menos su hueco.
 */
export function dondeVaElSelector(entrada: {
    columna: { izquierda: number; ancho: number };
    minimo: number;
    maximo: number;
}): { izquierda: number; compacto: boolean } {
    const { columna, minimo, maximo } = entrada;
    const centro = columna.izquierda + columna.ancho / 2;
    for (const compacto of [false, true]) {
        const ancho = elAnchoDelSelector(compacto);
        const x = centro - ancho / 2;
        if (x >= minimo && x + ancho <= maximo) return { izquierda: Math.round(x), compacto };
    }
    const ancho = elAnchoDelSelector(true);
    const x = Math.max(minimo, Math.min(centro - ancho / 2, maximo - ancho));
    return { izquierda: Math.round(x), compacto: true };
}
