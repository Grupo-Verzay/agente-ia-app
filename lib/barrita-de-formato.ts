/**
 * Dónde se pone la barrita de formato que sale al seleccionar texto.
 *
 * # Por qué DEBAJO de la selección y no encima
 *
 * Es la decisión del encargo y no es de gusto. En un móvil, iOS y Android
 * pintan su propio menú de selección —«Copiar / Pegar / Seleccionar todo»—
 * **encima** de lo seleccionado, y ese menú no es DOM: no se puede medir, ni
 * mover, ni saber cuánto ocupa. Poniendo la nuestra encima se pelean por el
 * mismo sitio y gana el del sistema, que la tapa entera; poniéndola debajo no
 * compiten nunca.
 *
 * Y cuando debajo **no cabe** —la última línea del cuadro, que está pegada al
 * borde de abajo de la pantalla— se pone encima. Ese es justo el caso en que el
 * sistema se lleva su menú abajo, así que siguen sin coincidir.
 *
 * Una sola regla, no dos. Con una en escritorio y otra en móvil habría dos
 * comportamientos que mantener a la par, y el que no se prueba es el que se
 * rompe.
 *
 * # Y el ancho manda sobre el sitio
 *
 * La barrita se acota a la ventana antes de colocarse. Sin eso, seleccionar
 * una palabra al final de una línea larga la saca por el borde derecho — que es
 * exactamente el fallo que este cambio entero viene a quitar de los paneles.
 *
 * Puro y sin imports: lo prueba el banco sin navegador.
 */

/** Lo que se le deja al borde de la ventana. */
export const MARGEN = 8;

/** El hueco entre la selección y la barrita. */
export const HUECO = 6;

export type Rect = { left: number; top: number; right: number; bottom: number };

export type Sitio = {
    left: number;
    top: number;
    /** `true` cuando hubo que ponerla encima porque abajo no cabía. */
    encima: boolean;
};

/**
 * Dónde va la barrita, en coordenadas de la ventana (`position: fixed`).
 *
 * Se centra sobre la selección y se mete dentro de la ventana; si la barrita
 * fuera más ancha que la ventana entera, se pega al margen izquierdo — que es
 * el lado desde el que se lee.
 */
export function dondeVaLaBarrita(
    seleccion: Rect,
    barra: { ancho: number; alto: number },
    ventana: { ancho: number; alto: number },
): Sitio {
    const abajo = seleccion.bottom + HUECO;
    const cabeAbajo = abajo + barra.alto <= ventana.alto - MARGEN;
    const encima = !cabeAbajo;
    const top = encima
        ? Math.max(MARGEN, seleccion.top - HUECO - barra.alto)
        : abajo;

    const centrada = (seleccion.left + seleccion.right) / 2 - barra.ancho / 2;
    const tope = ventana.ancho - MARGEN - barra.ancho;
    const left = tope < MARGEN ? MARGEN : Math.min(Math.max(MARGEN, centrada), tope);

    return { left: Math.round(left), top: Math.round(top), encima };
}

/** Las tres marcas de la barrita, en el orden en que se usan. */
export const MARCAS_DE_LA_BARRITA = [
    { marca: "*", nombre: "Negrilla", atajo: "Ctrl+B" },
    { marca: "_", nombre: "Cursiva", atajo: "Ctrl+I" },
    { marca: "~", nombre: "Tachado", atajo: "Ctrl+Shift+X" },
] as const;
