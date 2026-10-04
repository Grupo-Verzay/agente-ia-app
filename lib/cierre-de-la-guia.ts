/**
 * Las TARJETAS DE CIERRE de la cuadrícula de secciones de una guía pública.
 *
 * La cuadrícula es de 1 columna en un teléfono, 2 en tableta (`sm`) y 3 en
 * escritorio (`lg`). Con un número de secciones que no llena la última fila
 * quedaría un hueco, y la regla es que una guía se ve simétrica tenga las
 * secciones que tenga:
 *
 * | huecos en la última fila | qué se añade |
 * | --- | --- |
 * | 1 | «Contáctanos» |
 * | 2 | «Contáctanos» y «Ver el vídeo de nuevo», una en cada hueco |
 * | 0 | «Contáctanos» en una fila nueva, a todo el ancho |
 *
 * En un teléfono no hay huecos: «Contáctanos» va siempre al final, como una
 * tarjeta más.
 *
 * Sin «Contáctanos» (`conContacto: false`, la guía dentro de una propuesta),
 * «Ver el vídeo de nuevo» ocupa su sitio con la misma regla: nunca un hueco.
 *
 * Se decide POR ANCHURA y no una vez: la misma guía de 7 secciones deja 2
 * huecos en escritorio y 1 en tableta. Como la página se pinta en el servidor
 * (no sabe la anchura), la decisión se traduce a clases con prefijo de
 * anchura; la tarjeta es UNA y cambia de ancho con CSS. Esto es puro y no sabe
 * de ninguna guía: vale para cualquier módulo que se documente mañana.
 *
 * Las clases van ESCRITAS literales en las tablas de abajo: Tailwind solo
 * genera lo que ve escrito, y una clase compuesta con el número de columnas no
 * existiría en el CSS (con el build en verde).
 */

export type Anchura = "movil" | "tableta" | "escritorio";

export const COLUMNAS: Record<Anchura, number> = { movil: 1, tableta: 2, escritorio: 3 };

export type TarjetaDeCierre = { tipo: "contacto" | "video"; ocupa: number };

/** Cuántos huecos deja `n` tarjetas en una cuadrícula de `columnas`. */
export function losHuecos(n: number, columnas: number): number {
    const total = Math.max(0, Math.floor(n));
    if (columnas <= 1) return 0;
    return (columnas - (total % columnas)) % columnas;
}

/**
 * Opciones del cierre. `conContacto: false` es la guía desplegada DENTRO de una
 * propuesta (`sinSalidas`): ahí «Contáctanos» no se ofrece —saca al cliente de
 * la propuesta—, así que el sitio que dejaba lo llena «Ver el vídeo de nuevo».
 * Sin esto quedaba un hueco donde iba el contacto.
 */
export type OpcionesDelCierre = { conContacto?: boolean };

/** Qué tarjetas de cierre van detrás de `n` secciones con `columnas` columnas. */
export function elCierre(n: number, columnas: number, { conContacto = true }: OpcionesDelCierre = {}): TarjetaDeCierre[] {
    if (!conContacto) return elCierreSinContacto(n, columnas);
    if (columnas <= 1) return [{ tipo: "contacto", ocupa: 1 }];
    const huecos = losHuecos(n, columnas);
    if (huecos === 0) return [{ tipo: "contacto", ocupa: columnas }];
    if (huecos === 1) return [{ tipo: "contacto", ocupa: 1 }];
    // Dos o más huecos: contacto y vídeo; si sobraran más (cuadrículas de 4+),
    // el vídeo se estira para cerrar la fila.
    return [
        { tipo: "contacto", ocupa: 1 },
        { tipo: "video", ocupa: huecos - 1 },
    ];
}

/**
 * Sin «Contáctanos», el vídeo es la ÚNICA tarjeta de cierre y ocupa todo lo que
 * aquella ocupaba: en un teléfono, una más al final; con la última fila llena,
 * una fila nueva entera; y si no, todos los huecos de la última fila.
 */
function elCierreSinContacto(n: number, columnas: number): TarjetaDeCierre[] {
    if (columnas <= 1) return [{ tipo: "video", ocupa: 1 }];
    const huecos = losHuecos(n, columnas);
    return [{ tipo: "video", ocupa: huecos === 0 ? columnas : huecos }];
}

const OCUPA_EN_TABLETA: Record<number, string> = { 1: "sm:col-span-1", 2: "sm:col-span-2" };
const OCUPA_EN_ESCRITORIO: Record<number, string> = { 1: "lg:col-span-1", 2: "lg:col-span-2", 3: "lg:col-span-3" };

/**
 * Las clases de cada tarjeta de cierre, para las tres anchuras a la vez.
 * `null` = esa tarjeta no se pinta en ninguna anchura.
 */
export function lasClasesDelCierre(n: number, opciones: OpcionesDelCierre = {}): { contacto: string | null; video: string | null } {
    const porAnchura = (a: Anchura) => elCierre(n, COLUMNAS[a], opciones);
    const ocupa = (a: Anchura, tipo: TarjetaDeCierre["tipo"]) => porAnchura(a).find((t) => t.tipo === tipo)?.ocupa ?? 0;

    if (opciones.conContacto === false) {
        // El vídeo sale en las tres anchuras, ocupando lo que ocupaba el contacto.
        const video = [
            "flex col-span-1",
            OCUPA_EN_TABLETA[ocupa("tableta", "video")],
            OCUPA_EN_ESCRITORIO[ocupa("escritorio", "video")],
        ]
            .filter(Boolean)
            .join(" ");
        return { contacto: null, video };
    }

    const contacto = ["col-span-1", OCUPA_EN_TABLETA[ocupa("tableta", "contacto")], OCUPA_EN_ESCRITORIO[ocupa("escritorio", "contacto")]]
        .filter(Boolean)
        .join(" ");

    const enTableta = ocupa("tableta", "video");
    const enEscritorio = ocupa("escritorio", "video");
    if (!enTableta && !enEscritorio) return { contacto, video: null };
    const video = [
        "hidden",
        enTableta ? `sm:flex ${OCUPA_EN_TABLETA[enTableta]}` : "sm:hidden",
        enEscritorio ? `lg:flex ${OCUPA_EN_ESCRITORIO[enEscritorio]}` : "lg:hidden",
    ].join(" ");
    return { contacto, video };
}

/**
 * La prueba de simetría: con las secciones y el cierre, cada fila de cada
 * anchura queda llena. La usa el banco; se deja aquí para que la regla y su
 * comprobación no puedan separarse.
 */
export function lasFilasQuedanLlenas(n: number, opciones: OpcionesDelCierre = {}): boolean {
    return (Object.keys(COLUMNAS) as Anchura[]).every((a) => {
        const cols = COLUMNAS[a];
        const celdas = n + elCierre(n, cols, opciones).reduce((s, t) => s + t.ocupa, 0);
        return celdas % cols === 0;
    });
}
