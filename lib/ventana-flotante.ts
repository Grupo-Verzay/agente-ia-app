/**
 * Dónde puede quedarse una ventana que flota encima de la plataforma.
 *
 * Lo usan las tres: la llamada del chat de equipo, la de WhatsApp en Chats y
 * el panel de una reunión. Es puro a propósito — el arrastre en sí son eventos
 * de puntero y no se prueba sin navegador, pero **dónde acaba** sí, y es lo
 * único que puede dejar una llamada inalcanzable.
 *
 * # Por qué no basta con acotar al arrastrar
 *
 * El manejador del arrastre ya acotaba, y aun así la ventana acababa fuera.
 * Acotar **al mover** solo cubre el mover; una ventana se sale sin que nadie la
 * arrastre:
 *
 * - **Crece donde está.** La tarjeta de llamada pasa de 22rem a 32rem al
 *   encenderse la cámara, y le aparece dentro un recuadro de video. Pegada al
 *   borde derecho, crece hacia fuera.
 * - **Encoge la ventana del navegador.** Girar un móvil o abrir el panel de
 *   herramientas deja una posición perfectamente válida fuera de la pantalla.
 * - **Se mide cuando no hay nada que medir.** Con un recuadro de 0×0 —sin
 *   maquetar todavía, o escondido— el tope sale contra un tamaño que no es el
 *   suyo, y la ventana se coloca casi entera fuera.
 *
 * De ahí que la decisión tenga **tres** salidas y no dos: hay un caso en el que
 * la posición guardada no se puede arreglar acotándola, y lo correcto es
 * **olvidarla** y devolver la ventana a su esquina de siempre.
 */

/**
 * Cuánto se deja siempre visible por cada borde.
 *
 * No es decoración: la ventana lleva dentro el botón de colgar. Dejarla salir
 * por un borde es dejar una llamada abierta sin forma de cortarla, y con el
 * micro encendido — que es lo peor que puede dejarse una función así.
 */
export const MARGEN_EN_PANTALLA = 8;

/**
 * Cuánto tiene que asomar para que cuente como «está en pantalla».
 *
 * Un par de píxeles asomando **no es** estar: no hay dónde agarrar y no se
 * puede leer nada, así que a efectos de quien mira la ventana se perdió igual.
 * Treinta y dos son un dedo.
 */
export const MINIMO_VISIBLE = 32;

export type Punto = { x: number; y: number };
export type Tamano = { ancho: number; alto: number };

/**
 * Qué hacer con una posición ya guardada.
 *
 * - `dejar`: está entera dentro, no se toca.
 * - `acotar`: asoma por un borde y se mete, que es lo de siempre.
 * - `olvidar`: no se puede arreglar — vuelve a su esquina por defecto.
 */
export type QueHacerConLaVentana =
    | { que: "dejar" }
    | { que: "acotar"; x: number; y: number }
    | { que: "olvidar" };

/** Si un número sirve para calcular una posición. */
function sirve(n: number): boolean {
    return Number.isFinite(n);
}

/**
 * Mete una posición dentro de la pantalla.
 *
 * El suelo de cada eje es el **margen**, no el máximo: en una ventana más
 * estrecha que la tarjeta —un móvil con la tarjeta desplegada— el máximo sale
 * negativo, y sin ese suelo la tarjeta se iría hacia arriba y hacia la
 * izquierda, fuera de la pantalla, justo donde peor se está.
 */
export function dentroDeLaPantalla(
    x: number,
    y: number,
    ancho: number,
    alto: number,
    ventana: Tamano,
    margen: number = MARGEN_EN_PANTALLA,
): Punto {
    const topeX = Math.max(margen, ventana.ancho - ancho - margen);
    const topeY = Math.max(margen, ventana.alto - alto - margen);
    return {
        x: Math.min(Math.max(x, margen), topeX),
        y: Math.min(Math.max(y, margen), topeY),
    };
}

/**
 * Qué hacer con la posición que la ventana traía guardada.
 *
 * Se pregunta **siempre** que algo pueda haberla invalidado: al agarrarla, al
 * cambiar el tamaño de la ventana del navegador y al cambiar el tamaño de la
 * propia tarjeta. No solo al arrastrar, que es lo que fallaba.
 */
export function queHacerConLaVentana(
    pos: Punto,
    caja: Tamano,
    ventana: Tamano,
    margen: number = MARGEN_EN_PANTALLA,
    minimoVisible: number = MINIMO_VISIBLE,
): QueHacerConLaVentana {
    // Con números que no sirven no se acota: se olvida. Quedarse con la
    // posición es justo lo que deja la ventana perdida, y acotar contra un
    // tamaño de 0×0 la coloca casi entera fuera — el tope de cada eje saldría
    // pegado al borde contrario como si la caja no ocupara nada.
    if (!sirve(pos.x) || !sirve(pos.y)) return { que: "olvidar" };
    if (!sirve(caja.ancho) || !sirve(caja.alto) || caja.ancho <= 0 || caja.alto <= 0) {
        return { que: "olvidar" };
    }
    if (!sirve(ventana.ancho) || !sirve(ventana.alto) || ventana.ancho <= 0 || ventana.alto <= 0) {
        return { que: "olvidar" };
    }

    // Cuánto asoma de verdad por cada eje.
    const visibleX = Math.min(pos.x + caja.ancho, ventana.ancho) - Math.max(pos.x, 0);
    const visibleY = Math.min(pos.y + caja.alto, ventana.alto) - Math.max(pos.y, 0);

    // Lo que no se puede ver no se puede recuperar arrastrando. Y el mínimo se
    // compara contra lo que la caja mide, no contra un número fijo: una caja
    // más pequeña que el mínimo —o una pantalla más pequeña que ella— nunca
    // llegaría a ese umbral y se olvidaría siempre, quedándose clavada en la
    // esquina por mucho que alguien la moviera.
    const pideX = Math.min(minimoVisible, caja.ancho, ventana.ancho);
    const pideY = Math.min(minimoVisible, caja.alto, ventana.alto);
    if (visibleX < pideX || visibleY < pideY) return { que: "olvidar" };

    const metida = dentroDeLaPantalla(pos.x, pos.y, caja.ancho, caja.alto, ventana, margen);
    if (metida.x === pos.x && metida.y === pos.y) return { que: "dejar" };
    return { que: "acotar", x: metida.x, y: metida.y };
}
