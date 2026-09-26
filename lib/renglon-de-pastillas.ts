/**
 * Cuántas pastillas de la fila de la lista de Chats caben en su renglón, y
 * cuáles se van al «+N».
 *
 * # El fallo
 *
 * El tope era un número escrito a mano, `MAX_BADGES = 6`, y eso se equivoca
 * por los DOS lados a la vez:
 *
 *   - **Esconde lo que sí cabía.** Con seis pastillas cortas sobra ancho y la
 *     séptima se iba al «+N» igual, así que la fila resumía sin necesidad.
 *   - **Y aun así se partía en dos líneas.** Medido en la columna de verdad
 *     (348 px a 1440, con la barra de la lista a la vista): una fila con la
 *     espera, la etapa, la calificación, el asesor, los recordatorios, los
 *     seguimientos y las etiquetas pide **360,8 px** con el tope YA aplicado.
 *     El renglón iba `flex-wrap`, así que lo que no cabía bajaba a una segunda
 *     línea —y la lista estima el alto de cada fila con un número fijo, así
 *     que una fila más alta descuadra además la virtualización—.
 *
 * Un tope en unidades de «cuántas» no puede contestar una pregunta que es de
 * ANCHO: las pastillas no miden lo mismo —«Contactado» mide 86,7 px y una
 * contadora 36—, así que seis pastillas son 150 px o 300 según cuáles.
 *
 * > **El renglón MIDE su hueco y entran las que quepan.** Al «+N» va solo lo
 * > que de verdad no entra, y **nunca hay una segunda línea**: la fila va
 * > `flex-nowrap` con `overflow-hidden`, que es la red de seguridad para el
 * > primer pintado y para un navegador sin `ResizeObserver` —no la solución:
 * > lo que evita el corte es el reparto—.
 *
 * Es pura: entran las medidas y sale el reparto. Quien mide es
 * `useRenglonDePastillas`.
 *
 * # Tres cosas que hay que mantener
 *
 * 1. **Sin medidas no se decide.** Un hueco que no es un número, o un ancho que
 *    falta, devuelve TODAS: un reparto calculado con ceros escondería la fila
 *    entera detrás de un «+N» en el primer pintado.
 * 2. **El «+N» se reserva solo cuando va a existir.** Con todas dentro no se
 *    descuenta su hueco; si se descontara, una fila que cabe justa escondería
 *    una pastilla para hacerle sitio a un «+N» que no hacía falta.
 * 3. **Lo que no reparte ocupa igual.** La pastilla de etiquetas no entra en el
 *    reparto —ya es un resumen con su propio número, ver `ChatContactItem`—
 *    pero sí ocupa ancho, así que entra como `fijas`. Sin eso, el reparto
 *    dejaría entrar una pastilla de más y la fila se cortaría por la derecha
 *    justo donde están las etiquetas.
 */

/** La separación entre pastillas del renglón, en píxeles (`gap-1`). */
export const SEPARACION_DEL_RENGLON_PX = 4;

/**
 * Las clases del renglón.
 *
 * `flex-nowrap` y `overflow-hidden` son lo que hace **imposible** la segunda
 * línea, decida lo que decida la medida. El `gap-1` de aquí es el que
 * `SEPARACION_DEL_RENGLON_PX` cuenta: si se cambia uno, se cambia el otro o el
 * reparto deja de cuadrar con lo que se ve.
 */
export const RENGLON_DE_PASTILLAS = "mt-1 flex flex-nowrap items-center gap-1 overflow-hidden";

function esMedida(n: number) {
    return Number.isFinite(n) && n >= 0;
}

/**
 * Cuántas de `anchos` se ven. El resto va al «+N».
 *
 * @param anchos      Las que reparten, en el orden en que se pintan.
 * @param fijas       Las que van siempre (la de etiquetas), solo para restar su ancho.
 * @param anchoDelMas Lo que ocupa el «+N» cuando existe.
 * @param hueco       El ancho del renglón, medido.
 * @param separacion  El `gap` entre pastillas.
 */
export function repartirLasPastillas(
    anchos: readonly number[],
    fijas: readonly number[],
    anchoDelMas: number,
    hueco: number,
    separacion: number = SEPARACION_DEL_RENGLON_PX,
): number {
    const n = anchos.length;
    if (n === 0) return 0;
    // Sin medidas no se decide: se pintan todas y manda el `overflow-hidden`.
    if (!Number.isFinite(hueco) || hueco <= 0) return n;
    if (!anchos.every(esMedida) || !fijas.every(esMedida) || !esMedida(anchoDelMas)) return n;

    const sep = esMedida(separacion) ? separacion : 0;
    const anchoFijo = fijas.reduce((s, a) => s + a, 0);

    /** Lo que ocupa el renglón con `k` de las que reparten y, quizá, el «+N». */
    const ocupa = (suma: number, k: number, conMas: boolean) => {
        const piezas = k + fijas.length + (conMas ? 1 : 0);
        if (piezas === 0) return 0;
        return suma + anchoFijo + (conMas ? anchoDelMas : 0) + (piezas - 1) * sep;
    };

    const total = anchos.reduce((s, a) => s + a, 0);
    if (ocupa(total, n, false) <= hueco) return n;

    let suma = 0;
    let k = 0;
    while (k < n && ocupa(suma + anchos[k], k + 1, true) <= hueco) {
        suma += anchos[k];
        k += 1;
    }
    // `k` puede ser 0: ni una cabe al lado del «+N», y entonces el «+N» las
    // lleva todas. Es lo correcto —el resumen sigue siendo alcanzable— y no
    // puede confundirse con «caben todas», que ya se contestó arriba.
    return k;
}
