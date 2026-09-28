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
// Y los tres de la izquierda van SIMÉTRICOS: casita → menú → selector con el
// MISMO hueco (`HUECO_DE_LA_BARRA_PX`). Las dos cosas a la vez se consiguen
// eligiendo el ANCHO: el selector arranca a un hueco del menú y se estira lo
// justo para que su centro caiga en el de la columna —o sea, dos veces lo que
// hay del menú al centro—. Por eso el ancho no es fijo: sale de medir.
//
// Si así se saliera por la derecha (un teléfono, donde la columna es toda la
// pantalla) se conserva el hueco y se acorta; nunca pisa la casita, el menú ni
// los botones de la derecha. Con poco ancho enseña solo los iconos.

/** El hueco entre la casita, el menú y el selector: `gap-2`. */
export const HUECO_DE_LA_BARRA_PX = 8;
/** Borde (1+1), relleno `p-px` (1+1) y el hueco `gap-0.5` entre las dos. */
export const RELLENO_DEL_SELECTOR_PX = 6;
/** Una pestaña con su icono y su palabra («Correos») cabe desde aquí. */
export const PESTANA_CON_PALABRA_PX = 88;
/** Una pestaña solo con su icono: el alto de la barra, un cuadrado. */
export const PESTANA_SOLO_ICONO_PX = 36;
/** Más ancho no dice nada más: el selector deja de crecer aquí. */
export const PESTANA_MAXIMA_PX = 124;

const anchoCon = (pestana: number) => pestana * BANDEJAS.length + RELLENO_DEL_SELECTOR_PX;
export const ANCHO_MINIMO_DEL_SELECTOR = anchoCon(PESTANA_SOLO_ICONO_PX);
export const ANCHO_CON_PALABRAS = anchoCon(PESTANA_CON_PALABRA_PX);
export const ANCHO_MAXIMO_DEL_SELECTOR = anchoCon(PESTANA_MAXIMA_PX);

/**
 * Medidas en píxeles, relativas al borde izquierdo de la barra.
 * `minimo`: donde acaba lo de la izquierda (el menú) MÁS el hueco.
 * `maximo`: donde empieza lo de la derecha menos su hueco.
 */
export function dondeVaElSelector(entrada: {
    columna: { izquierda: number; ancho: number };
    minimo: number;
    maximo: number;
}): { izquierda: number; ancho: number; compacto: boolean; centrado: boolean } {
    const { columna, minimo, maximo } = entrada;
    const inicio = Math.round(minimo);
    const centro = Math.round(columna.izquierda + columna.ancho / 2);
    const cabe = (ancho: number) => inicio + ancho <= maximo;
    const con = (izquierda: number, ancho: number, centrado: boolean) => ({
        izquierda,
        ancho,
        compacto: ancho < ANCHO_CON_PALABRAS,
        centrado,
    });

    // Lo normal: a un hueco del menú y centrado, a la vez.
    const simetrico = 2 * (centro - inicio);
    if (simetrico >= ANCHO_MINIMO_DEL_SELECTOR && simetrico <= ANCHO_MAXIMO_DEL_SELECTOR && cabe(simetrico)) {
        return con(inicio, simetrico, true);
    }
    // Una columna tan ancha que no hace falta estirarlo tanto: centrado.
    if (simetrico > ANCHO_MAXIMO_DEL_SELECTOR) {
        const izquierda = centro - ANCHO_MAXIMO_DEL_SELECTOR / 2;
        if (izquierda + ANCHO_MAXIMO_DEL_SELECTOR <= maximo) return con(Math.round(izquierda), ANCHO_MAXIMO_DEL_SELECTOR, true);
    }
    // No cabe centrado: se conserva el hueco del menú y se acorta.
    const ancho = Math.max(
        ANCHO_MINIMO_DEL_SELECTOR,
        Math.min(simetrico, ANCHO_MAXIMO_DEL_SELECTOR, Math.floor(maximo - inicio)),
    );
    return con(inicio, ancho, false);
}
