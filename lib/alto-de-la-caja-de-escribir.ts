/**
 * Cuánto mide la caja donde se escribe un mensaje, y dónde deja de crecer.
 *
 * # Qué pasaba
 *
 * En Chats la caja crecía hasta **160 px** y ahí se paraba
 * (`Math.min(el.scrollHeight, 160)`). Un tope en píxeles no es un tope en
 * líneas: **el mismo número da un número de renglones distinto en cada
 * pantalla**, porque el interlineado no es el mismo. Medido en Chromium sobre
 * el CSS del build, con las clases del propio componente
 * (`text-base sm:text-sm leading-relaxed`):
 *
 * | | interlineado | lo que cabían en 160 px |
 * | --- | --- | --- |
 * | escritorio (`text-sm`) | 20 px | **7 renglones** |
 * | móvil (`text-base`) | 26 px | **5,4 renglones** |
 *
 * Cinco renglones y medio es exactamente la caja de la captura: media
 * conversación tapada por el sitio donde se escribe.
 *
 * Y debajo había un segundo fallo, el que este repositorio ya documenta en la
 * barra del chat de equipo: **los bordes van aparte**. `box-sizing` es
 * `border-box` —la altura los incluye— y `scrollHeight` **no los cuenta**, así
 * que poniendo el `scrollHeight` pelado la caja se queda **dos píxeles corta**
 * y sale una barra de desplazamiento donde no hace falta. Medido antes del
 * arreglo: a 390 px con **una sola línea** dentro, la caja medía 42 px y ya
 * tenía barra; a 1440 con tres líneas, 76 px cuando hacían falta 78.
 *
 * # La regla
 *
 * > **El tope se cuenta en LÍNEAS y se traduce a píxeles con el interlineado
 * > que de verdad tiene esa caja**, más su relleno y sus bordes. Así son tres
 * > renglones en un teléfono y tres en un monitor, digan lo que digan las
 * > clases de tipografía.
 *
 * Es pura a propósito: lo que decide el alto se prueba sin navegador, y lo que
 * el navegador aporta son cuatro medidas que él es el único que sabe.
 */

/** Cuántos renglones se ven antes de que la caja deje de crecer. */
export const LINEAS_VISIBLES = 3;

/** Lo que solo sabe el navegador. Todo en píxeles. */
export type MedidasDeLaCaja = {
    /**
     * `scrollHeight` con la altura en `auto`: el texto más el relleno, **sin**
     * los bordes.
     */
    contenido: number;
    /** El `line-height` computado. */
    interlineado: number;
    /** El `font-size` computado. Solo se usa si el interlineado no sirve. */
    fuente: number;
    /** `paddingTop + paddingBottom`. */
    relleno: number;
    /** `offsetHeight - clientHeight`: los bordes, que `scrollHeight` no cuenta. */
    bordes: number;
};

export type AltoDeLaCaja = {
    /** Lo que hay que escribirle a `style.height`, en píxeles. */
    alto: number;
    /** Dónde deja de crecer, en píxeles. */
    tope: number;
    /** Si el texto ya no cabe y toca barra de deslizar dentro de la caja. */
    desborda: boolean;
};

/**
 * Cuánto mide un renglón.
 *
 * Con `line-height: normal` —o con cualquier cosa que no sea un número de
 * píxeles— `parseFloat` devuelve `NaN`, y de ahí saldría un tope `NaN` que en
 * `Math.min` deja pasar cualquier alto: **volvería el fallo entero, sin un solo
 * error**. Así que hay respaldo, y es el de siempre para un texto: una vez y
 * media la fuente. Equivocarse ahí cuesta unos píxeles de alto; no tener tope
 * cuesta la conversación.
 */
function alturaDeUnRenglon(m: MedidasDeLaCaja): number {
    if (Number.isFinite(m.interlineado) && m.interlineado > 0) return m.interlineado;
    if (Number.isFinite(m.fuente) && m.fuente > 0) return m.fuente * 1.5;
    return 20;
}

function numero(valor: number): number {
    return Number.isFinite(valor) && valor > 0 ? valor : 0;
}

/**
 * El alto que le toca a la caja con el texto que tiene dentro.
 *
 * `contenido` llega **sin bordes** —es lo que devuelve `scrollHeight`— así que
 * se le suman aquí, una sola vez, y el tope los lleva también: los dos lados de
 * la comparación tienen que medir lo mismo.
 */
export function altoDeLaCaja(m: MedidasDeLaCaja): AltoDeLaCaja {
    const bordes = numero(m.bordes);
    const relleno = numero(m.relleno);
    const tope = LINEAS_VISIBLES * alturaDeUnRenglon(m) + relleno + bordes;
    const conBordes = numero(m.contenido) + bordes;
    return {
        alto: Math.min(conBordes, tope),
        tope,
        desborda: conBordes > tope,
    };
}
