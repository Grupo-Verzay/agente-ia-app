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

/**
 * # El hueco entre los controles de la fila: UNO, y el mismo en toda ella
 *
 * La fila de arriba de la cabecera de la conversación son tres cosas: el bloque
 * del contacto (avatar, nombre y su línea de estado), la tira de controles que
 * se desplaza, y la ficha de contacto —que va FUERA de la tira a propósito, o
 * con la conversación estrecha se iría por la derecha (ver `ChatHeader`)—.
 *
 * Y el hueco entre los controles salía de DOS sitios: la tira lo declaraba
 * (`gap-1.5`, 6 px) y el que separa la tira de la ficha lo ponía el `gap-3` de
 * la fila, que está ahí para despegar el bloque del contacto. Medido en
 * Chromium sobre el CSS del build, con la cabecera real, a 1440, 1280 y 1024:
 *
 * ```
 *  6 px  Llamar → asesor → recordatorio → cita → tarea → registros → contexto
 *  6 px  contexto → etapa → etiquetas
 * 12 px  etiquetas → ficha de contacto     ← el hueco de más
 * ```
 *
 * Nueve controles a 6 px y el último a 12: desde fuera se lee como que el
 * último no es del grupo. Y no estaba escrito en ninguna parte como una
 * decisión: es el gap de la fila asomando por el único sitio donde la fila
 * separa dos controles en vez de dos bloques.
 *
 * Así que la tira y la ficha van dentro de una caja con **este** hueco, y el
 * `gap-3` de la fila se queda para lo único que separa: el bloque del contacto
 * de los controles. Con el número escrito en los dos sitios, el día que se
 * afine uno el otro se queda atrás y vuelve un hueco que nadie declaró.
 */
export const HUECO_ENTRE_CONTROLES = 6;
/** La clase de ese hueco (6 px). La llevan la tira y la caja que la envuelve. */
export const CLASE_HUECO_ENTRE_CONTROLES = "gap-1.5";

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

/**
 * # El nombre y su línea de estado, dentro de la FILA 1
 *
 * Debajo del nombre del contacto va una línea con lo que está haciendo
 * —«escribiendo…», «grabando audio…», «en línea», «últ. vez…»— o, si no hay
 * nada de eso, el anuncio del que llegó. Las dos van dentro de los 32 px de
 * `ALTO_FILA_1`, y **no caben por casualidad: caben por estos dos números**.
 *
 * Al apretar la cabecera de 110 a 78 px el bloque del nombre pasó de 36 a 32 px
 * y la línea **dejó de verse sin desaparecer del código**: dentro de
 * `.app-module-content` un `.text-sm` vale 16/24 y un `.text-xs` 14/20, y el
 * lápiz de editar (28 px) fijaba el alto de la fila del nombre. 28 + 20 = 48 en
 * una caja de 32 con `overflow-hidden`: la línea quedaba recortada debajo.
 *
 * Tres cosas que hay que mantener:
 *
 * 1. **El nombre conserva su letra y solo aprieta el interlineado** (18 px), con
 *    `!` porque `.app-module-content .text-sm` pisa un `leading-*` suelto.
 * 2. **La línea de estado NO usa `text-xs`**: esa clase vale 14/20 dentro del
 *    módulo. Va con tamaño propio, más pequeño que el nombre: 12/14. Fue 11/14
 *    y se leía demasiado pequeña; 12 cabe en los mismos 14 porque se recorta
 *    solo a lo ancho (`RECORTE_A_LO_ANCHO`), así que un acento o una «g» que
 *    asomen medio píxel no se cortan. Subirla más exige quitarle interlineado
 *    al nombre, y eso no se hace.
 * 3. **El lápiz sigue midiendo 28×28, pero no fija el alto de su fila**
 *    (margen vertical negativo). Asoma 5 px por arriba y por abajo de los 18 px
 *    del nombre, así que el bloque y la fila recortan solo en horizontal
 *    (`overflow-x-clip`): con `overflow-hidden` se le cortaría el fondo al pasar
 *    el ratón. Cabe dentro de los 6 px de margen de la cabecera.
 *
 * `ALTO_LINEA_DEL_NOMBRE + ALTO_LINEA_DEL_ESTADO === ALTO_FILA_1`: lo comprueba
 * el banco (`scripts/banco-estado-en-la-cabecera.sh`).
 */
export const ALTO_LINEA_DEL_NOMBRE = 18;
export const ALTO_LINEA_DEL_ESTADO = 14;
/** El interlineado del nombre (18 px); la letra no se toca. */
export const LINEA_DEL_NOMBRE = "!leading-[1.125rem]";
/** La línea de debajo del nombre: 12 px sobre 14 de interlineado. */
export const LETRA_DEL_ESTADO = 12;
export const LINEA_DEL_ESTADO = "text-[0.75rem] leading-[0.875rem]";
/** Lo que el lápiz sobresale de la línea del nombre, a cada lado: (28 − 18) / 2. */
export const LAPIZ_SIN_ALTO = "-my-[0.3125rem]";

/**
 * La cabecera de una COLUMNA lateral —la lista de Chats y la de Correo—, y sus
 * dos filas. Vivía escrita a mano dentro de `chat-sidebar`, y Correo se hizo
 * la suya con `BarraDeAcciones`: una fila de lado a lado, con el buscador
 * estirado y el filtro metido dentro de él con otro tamaño. Puestas una al
 * lado de otra no se leían como la misma plataforma.
 *
 * Ahora las dos pintan con estas clases: la cabecera va DENTRO de la columna
 * (así mide su ancho y el buscador sale angosto), con 82 px en un móvil y los
 * 78 de `CABECERA_ESCRITORIO` en computador —los mismos que la cabecera de la
 * conversación y la del correo abierto, así la raya cae en el mismo píxel—.
 */
export const CABECERA_DE_LA_COLUMNA =
    "sticky top-0 z-10 flex flex-col justify-center gap-1.5 border-b-2 border-border bg-background/80 px-2 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/60 sm:gap-2 sm:px-3";
/** El alto fijo de esa cabecera (82 px; en computador lo baja `CABECERA_ESCRITORIO`). */
export const ALTO_DE_LA_CABECERA_DE_LA_COLUMNA = "h-[5.125rem] overflow-hidden";
/** El alto como MÍNIMO, para cuando debajo aparece una barra de acciones. */
export const ALTO_MINIMO_DE_LA_CABECERA_DE_LA_COLUMNA = "min-h-[5.125rem]";

/**
 * La fila de arriba: el buscador se lleva lo que sobra y los iconos van
 * detrás, cada uno lo que mide. Es una rejilla que crea una columna `auto` por
 * icono (`grid-flow-col`), así vale con dos iconos o con cuatro sin dejar
 * huecos: con las columnas escritas a mano, un icono que no se pinta dejaba
 * su `gap` al final.
 */
export const FILA_1_DE_LA_COLUMNA =
    "grid shrink-0 min-w-0 grid-flow-col grid-cols-[minmax(0,1fr)] auto-cols-auto items-center gap-2";
/** La fila de abajo, la de las pastillas. */
export const FILA_2_DE_LA_COLUMNA = "flex shrink-0 items-center";
/**
 * Las pastillas dentro de su fila: una sola fila, `justify-between` y el
 * `gap-1` como mínimo. El porqué está escrito en `ChatTabBar`.
 */
export const PASTILLAS_DE_LA_COLUMNA = "flex w-full items-center justify-between gap-1 overflow-hidden";

/** El selector y el buscador, juntos: se llevan lo que sobra de la fila. */
export const GRUPO_DEL_BUSCADOR = "flex min-w-0 flex-1 items-center gap-1 sm:gap-2";
/** El título de la columna cuando no hay selector («Chats», «Correo»). */
export const TITULO_DE_LA_COLUMNA = "shrink-0 text-sm font-bold tracking-tight text-foreground";

/** Un icono de la fila de arriba (asesores, grupos, actualizar, «⋯»). */
export const BOTON_DE_LA_COLUMNA =
    "relative inline-flex shrink-0 items-center justify-center gap-1 rounded-md border px-1.5 transition-colors h-7 min-w-7";
export const BOTON_DE_LA_COLUMNA_INACTIVO =
    "border-input bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground";
export const BOTON_DE_LA_COLUMNA_ACTIVO = "border-primary bg-primary/10 text-primary";

/** El FILTRO de la fila de arriba: el mismo tamaño, y redondo. */
export const FILTRO_DE_LA_COLUMNA =
    "relative flex shrink-0 items-center justify-center rounded-full border transition-colors h-7 min-w-7";
export const FILTRO_DE_LA_COLUMNA_INACTIVO = "border-border text-muted-foreground hover:bg-accent hover:text-foreground";
export const FILTRO_DE_LA_COLUMNA_ACTIVO = "border-primary bg-primary/10 text-primary";
