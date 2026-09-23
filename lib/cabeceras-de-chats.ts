/**
 * Las dos cabeceras de Chats —la de la columna de la lista y la del panel de
 * conversación— se escriben con estos números, y con ningún otro.
 *
 * # Por qué viven aquí y no en cada componente
 *
 * Cada cabecera traía los suyos: la columna `px-3 py-2` y `justify-center`, la
 * conversación `px-4` en la fila de iconos, `pr-4` en la de Macros y Acciones y
 * ningún relleno vertical. Medido en Chromium sobre la página servida, eso era:
 *
 * | | izquierda | derecha | arriba | abajo |
 * | --- | --- | --- | --- | --- |
 * | columna | 12 | 12 | 8 | 8 |
 * | conversación | 16 | 16 | 3 | 0 |
 *
 * Ninguno está mal por su cuenta; puestos uno al lado del otro, el avatar
 * arranca 4 px más adentro que el buscador y las filas no caen en la misma
 * línea (la primera, 3 px más arriba en la conversación). Con los números
 * escritos en cada fichero, el día que se afine uno el otro se queda atrás.
 *
 * # El número es el de la fila de botones
 *
 * `MARGEN_DE_LAS_CABECERAS` son 16 px: el margen interior que ya tenía la fila
 * de Macros y Acciones de la conversación, que es la que estaba bien. Va a los
 * cuatro lados de las dos cabeceras.
 *
 * # Y el alto sale de las filas, no se elige
 *
 * Las dos cabeceras tienen dos filas de la MISMA altura —`FILA_1` 36 px, que es
 * el avatar, y `FILA_2` 32 px, que son las pestañas y Macros/Acciones— con el
 * mismo hueco entre ellas. De ahí sale el alto: 16 + 36 + 8 + 32 + 16 más los
 * 2 px del borde de abajo, **110 px**. Con las filas del mismo alto y el mismo
 * relleno, lo que va dentro de cada una cae en la misma línea horizontal en las
 * dos columnas, se centre como se centre.
 *
 * Solo desde `md`: por debajo la conversación y la lista no conviven en la
 * pantalla y cada una tiene su cabecera de móvil, que no se toca.
 *
 * Puro y sin imports: lo lee el banco sin levantar React.
 */

/** El margen interior único de las dos cabeceras, en px. */
export const MARGEN_DE_LAS_CABECERAS = 16;

/** El alto de la primera fila (avatar / buscador), en px. */
export const ALTO_FILA_1 = 36;

/** El alto de la segunda fila (pestañas / pastillas), en px. */
export const ALTO_FILA_2 = 32;

/** El hueco entre las dos filas, en px. */
export const HUECO_ENTRE_FILAS = 8;

/** El borde de abajo de las dos cabeceras, en px. */
export const BORDE_DE_LA_CABECERA = 2;

/** El alto total de las dos cabeceras en escritorio, en px (110). */
export const ALTO_DE_LAS_CABECERAS =
    MARGEN_DE_LAS_CABECERAS * 2 + ALTO_FILA_1 + HUECO_ENTRE_FILAS + ALTO_FILA_2 + BORDE_DE_LA_CABECERA;

/**
 * Las clases, escritas una vez. Tailwind mira `lib/` (ver `tailwind.config.ts`),
 * así que se generan; y el banco comprueba que los números de las clases son los
 * de arriba.
 *
 * `md:h-[6.875rem]` son los 110 px (`box-sizing: border-box`: incluye relleno y
 * borde).
 */
export const CABECERA_ESCRITORIO = "md:h-[6.875rem] md:p-4 md:gap-2";
export const CABECERA_ESCRITORIO_MINIMA = "md:min-h-[6.875rem] md:p-4 md:gap-2";
export const CLASE_FILA_1 = "md:h-9";
export const CLASE_FILA_2 = "md:h-8";
