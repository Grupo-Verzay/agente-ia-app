/**
 * El selector de la barra de arriba que alterna entre Chats, Correos y Llamadas sin pasar
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
    { clave: "llamadas", ruta: "/crm/llamadas", nombre: "Llamadas" },
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
    return tiene.has("/chats") && tiene.has("/correo");
}

/** Las bandejas que se pintan: Chats y Correos siempre; Llamadas solo si está en el menú. */
export function lasBandejasQueSeVen(rutas: (string | null | undefined)[]) {
    const tiene = new Set(rutas.filter((r): r is string => typeof r === "string").map((r) => r.replace(/\/+$/, "")));
    return BANDEJAS.filter((b) => b.clave !== "llamadas" || tiene.has(b.ruta));
}

// ─── Dónde va el selector ────────────────────────────────────────────────
//
// Vive en la barra de arriba, pero se CENTRA en la columna de la lista de
// conversaciones (la de Chats o la de Correos), no en la barra. Fuera de esas
// pantallas no hay columna: se centra donde estaría (el mismo ancho,
// `--ancho-lateral`, desde el borde izquierdo del contenido).
//
// Y va SIMÉTRICO: a un hueco del menú (`HUECO_DE_LA_BARRA_PX`), el mismo que
// hay entre los botones de la derecha. Las dos cosas a la vez —el hueco y el
// centro— se consiguen eligiendo el ANCHO: el selector arranca a un hueco del
// menú y se estira lo justo para que su centro caiga en el de la columna —o
// sea, dos veces lo que hay del menú al centro—. Por eso el ancho no es fijo:
// sale de medir. Y por eso quitar la casita NO lo corrió a la izquierda: el
// centro es el de la columna, lo que ganó fue ancho.
//
// Si así se saliera por la derecha (un teléfono, donde la columna es toda la
// pantalla) se conserva el hueco y se acorta; nunca pisa el menú ni los
// botones de la derecha. Con poco ancho enseña solo los iconos (y sus números,
// encima del icono).

/** El hueco entre el menú y el selector: `gap-2`, el de los botones de la derecha. */
export const HUECO_DE_LA_BARRA_PX = 8;
/** Borde (1+1), relleno `p-px` (1+1) y el hueco `gap-0.5` entre las dos. */
export const RELLENO_DEL_SELECTOR_PX = 6;
/**
 * Una pestaña con su icono, su palabra («Correos») y su número («99+») cabe
 * desde aquí: 12 de relleno, 16 de icono, 58 de «Correos» en Poppins y 26 del
 * número con su hueco, más un margen.
 */
export const PESTANA_CON_PALABRA_PX = 116;
/** Una pestaña solo con su icono: el alto de la barra, un cuadrado. */
export const PESTANA_SOLO_ICONO_PX = 36;
/**
 * Más ancho no dice nada más: el selector deja de crecer aquí. Da para la
 * columna más ancha (`--ancho-lateral`, 24rem) con el menú de primero, así el
 * selector llega a un hueco del menú y centrado a la vez en todas.
 */
export const PESTANA_MAXIMA_PX = 160;

const anchoCon = (pestana: number, cuantas: number = BANDEJAS.length) => pestana * cuantas + RELLENO_DEL_SELECTOR_PX;
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
    /** Cuántas pestañas se pintan (2 o 3). */
    cuantas?: number;
}): { izquierda: number; ancho: number; compacto: boolean; centrado: boolean } {
    const { columna, minimo, maximo } = entrada;
    const cuantas = entrada.cuantas ?? BANDEJAS.length;
    const ANCHO_MINIMO_DEL_SELECTOR = anchoCon(PESTANA_SOLO_ICONO_PX, cuantas);
    const ANCHO_CON_PALABRAS = anchoCon(PESTANA_CON_PALABRA_PX, cuantas);
    const ANCHO_MAXIMO_DEL_SELECTOR = anchoCon(PESTANA_MAXIMA_PX, cuantas);
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
    // No cabe centrado: se conserva el hueco del menú y se acorta. Nunca pisa
    // el menú: si ni con dos iconos cabe, se queda a su hueco igual.
    const ancho = Math.max(
        ANCHO_MINIMO_DEL_SELECTOR,
        Math.min(simetrico, ANCHO_MAXIMO_DEL_SELECTOR, Math.floor(maximo - inicio)),
    );
    return con(inicio, ancho, false);
}

// ─── Los sin leer de cada una ─────────────────────────────────────────────

/**
 * Qué número lleva cada pestaña: los sin leer de Chats (la pastilla «Sin
 * leer») y de Correos (el contador del proveedor). Es EL MISMO número y la
 * misma regla que el numerito del menú lateral (`elTextoDelContador`, por la
 * ruta): cero y «no se sabe» no se pintan, y más de 99 es «99+».
 */
export type SinLeerDeLasBandejas = Partial<Record<ClaveDeBandeja, number | null>>;
