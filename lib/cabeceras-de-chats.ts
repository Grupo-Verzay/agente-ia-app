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
 * # Apretadas al mínimo, nunca más gruesas
 *
 * `MARGEN_DE_LAS_CABECERAS` son 6 px a los cuatro lados de las dos cabeceras.
 * Fue 16 (#909) y así las cabeceras pasaron de 82 a 110 px: se unificó el
 * margen hacia arriba, que es justo lo que no se pedía. 6 y no 4: con 4 la caja
 * del buscador y los botones quedan pegados al borde.
 *
 * # Y el alto sale de las filas, no se elige
 *
 * Las dos cabeceras tienen dos filas de la MISMA altura —`FILA_1` 32 px, que es
 * el avatar y el buscador, y `FILA_2` 28 px, que son las pestañas, las
 * pastillas y Macros/Acciones— con el mismo hueco entre ellas. De ahí sale el
 * alto: 6 + 32 + 4 + 28 + 6 más los 2 px del borde de abajo, **78 px**. Con las
 * filas del mismo alto y el mismo relleno, lo que va dentro de cada una cae en
 * la misma línea horizontal en las dos columnas, se centre como se centre.
 *
 * # Los controles de icono: UNA caja
 *
 * El embudo medía 24 px y era redondo; asesores y grupos, 28 en móvil y 32
 * desde `sm`; en la conversación casi todos 28 y la ficha 32. Puestos uno al
 * lado de otro no se leían simétricos. Todos van con `CONTROL_DE_ICONO` —28 px
 * de alto y 28 de ancho como mínimo— y el glifo con `GLIFO_DE_CONTROL`. Lo que
 * lleva un número dentro (asesores, grupos, recordatorios) crece a lo ancho
 * desde esos 28, nunca en alto. La forma y el color son de cada uno.
 *
 * Solo desde `md`: por debajo la conversación y la lista no conviven en la
 * pantalla y cada una tiene su cabecera de móvil, que no se toca.
 *
 * Puro y sin imports: lo lee el banco sin levantar React.
 */

/** El margen interior único de las dos cabeceras, en px. */
export const MARGEN_DE_LAS_CABECERAS = 6;

/** El alto de la primera fila (avatar / buscador), en px. */
export const ALTO_FILA_1 = 32;

/** El alto de la segunda fila (pestañas / pastillas), en px. */
export const ALTO_FILA_2 = 28;

/** El hueco entre las dos filas, en px. */
export const HUECO_ENTRE_FILAS = 4;

/** El borde de abajo de las dos cabeceras, en px. */
export const BORDE_DE_LA_CABECERA = 2;

/** El alto total de las dos cabeceras en escritorio, en px (78). */
export const ALTO_DE_LAS_CABECERAS =
    MARGEN_DE_LAS_CABECERAS * 2 + ALTO_FILA_1 + HUECO_ENTRE_FILAS + ALTO_FILA_2 + BORDE_DE_LA_CABECERA;

/**
 * Las clases, escritas una vez. Tailwind mira `lib/` (ver `tailwind.config.ts`),
 * así que se generan; y el banco comprueba que los números de las clases son los
 * de arriba.
 *
 * `md:h-[4.875rem]` son los 78 px (`box-sizing: border-box`: incluye relleno y
 * borde).
 */
export const CABECERA_ESCRITORIO = "md:h-[4.875rem] md:p-1.5 md:gap-1";
export const CABECERA_ESCRITORIO_MINIMA = "md:min-h-[4.875rem] md:p-1.5 md:gap-1";
export const CLASE_FILA_1 = "md:h-8";
export const CLASE_FILA_2 = "md:h-7";

/** El lado de la caja de un control de icono, en px. */
export const LADO_DEL_CONTROL = 28;
/** La caja común de los controles de icono de las dos cabeceras (28 px). */
export const CONTROL_DE_ICONO = "h-7 min-w-7";
/** El glifo dentro de esa caja (14 px). */
export const GLIFO_DE_CONTROL = "h-3.5 w-3.5";

/**
 * La cabecera de un PANEL LATERAL: la misma caja que la de la conversación,
 * sin el `md:`.
 *
 * Los paneles de la derecha —contacto, contexto del lead, recordatorio, tarea,
 * enviar al equipo, copiloto y chat del equipo— se leen en Chats como la
 * TERCERA columna, así que su cabecera tiene que medir lo que las otras dos:
 * 78 px, dos filas de 32 y 28 con 4 entre ellas, 6 de margen y 2 de borde.
 * Tenían la suya (`px-4 py-3`, ~57 px, una sola fila y el borde a otra
 * altura), y la línea que separa la cabecera del cuerpo caía unos 20 px más
 * arriba que la de la conversación.
 *
 * Sin `md:` porque un panel es un panel en cualquier anchura (en un móvil
 * ocupa la pantalla, pero sigue siendo esta cabecera). Los números son los de
 * arriba: el banco comprueba que las dos cadenas dicen lo mismo.
 */
export const CABECERA_DEL_PANEL =
    "flex shrink-0 flex-col justify-center overflow-hidden border-b-2 border-border h-[4.875rem] p-1.5 gap-1";
/** La primera fila del panel: el título y sus iconos de cabecera (32 px). */
export const FILA_1_DEL_PANEL = "flex h-8 min-w-0 shrink-0 items-center gap-2";
/** La segunda fila del panel: sus propios controles (28 px). */
export const FILA_2_DEL_PANEL = "flex h-7 min-w-0 shrink-0 items-center gap-1";
