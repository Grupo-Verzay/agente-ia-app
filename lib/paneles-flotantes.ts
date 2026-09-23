/**
 * Dónde nace cada panel flotante. **Una sola decisión.**
 *
 * # Por qué esto no puede estar escrito en cada panel
 *
 * Había **once** paneles en Chats y cada uno traía su propio `align`, su
 * `side` y su `sideOffset` escritos a mano: `align="start"` en el de canales,
 * `align="end"` en el de asesores, `align="center"` en los de registros y
 * cita, y `side="top" align="start"` en el de asignar asesor. Puestos uno al
 * lado de otro no se leían como la misma pantalla, y varios se salían de su
 * columna: el de etiquetas —72 de ancho— se montaba sobre la conversación, y
 * los de la fila de un chat se iban por el borde de abajo.
 *
 * No era que ninguno estuviera mal por su cuenta: es que **nadie contestaba la
 * pregunta una sola vez**. Es la misma familia que `BarraDeAcciones` —cada
 * pantalla colocaba sus mandos donde le tocó— y que `lib/panel-lateral.ts`.
 *
 * El nombre no dice «de Chats» a propósito: la campanita vive en la barra de
 * arriba, que es la misma en todas las pantallas, y tenía el mismo defecto.
 *
 * # Las tres clases, y qué contesta cada una
 *
 * | clase | dónde nace | qué lo sostiene |
 * | --- | --- | --- |
 * | `columnaAncha` | un ancho COMÚN, pegado al filo izquierdo de la columna y bajo la fila de pastillas | son filtros de la lista: se abren en el mismo sitio y con el mismo tamaño |
 * | `columnaDerecha` | pegado al filo DERECHO de la columna, bajo su control | son de UNA fila: nacen donde se pulsó, y voltean arriba si no cabe |
 * | `cabecera` | con su filo derecho en el del PANEL DE CONVERSACIÓN (sin margen), creciendo hacia la izquierda, bajo la cabecera y con el ancho de la fila de Macros y Acciones | se pasa de uno a otro sin cerrar: ni saltan de altura, ni de tamaño, ni de filo |
 *
 * # Cómo se pinta eso con Radix, que es la parte que no se ve leyendo
 *
 * `alignOffset` entra en Floating UI como `offset({ alignmentAxis })`, y ahí el
 * signo **depende de la alineación** (`floating-ui/core`, middleware `offset`):
 *
 * ```
 * crossAxis = alignment === 'end' ? alignmentAxis * -1 : alignmentAxis
 * ```
 *
 * O sea: con `align="start"` un `alignOffset` positivo mueve a la DERECHA, y
 * con `align="end"` mueve a la IZQUIERDA. Escribirlo al revés no da ningún
 * error: deja el panel al otro lado, del doble de lejos. Por eso las dos
 * cuentas viven aquí y no en cada componente.
 *
 * Y `sideOffset` entra como `mainAxis`, que con `side="bottom"` suma hacia
 * abajo — así que la distancia de un panel fijado NO es un hueco: es
 * «desde el borde de abajo de su disparador hasta donde tiene que nacer».
 *
 * # Y el alto: se DESPLAZA por dentro, nunca desborda
 *
 * El tope es `min(<lo que se quiera>, var(--radix-…-content-available-height))`,
 * que es la misma receta que ya llevan los menús de «Acciones» y de la fila.
 * Esa variable la calcula Radix con el hueco de verdad —no con `vh`, que mide
 * la ventana y no lo que queda entre el panel y el borde—, y se recalcula al
 * voltear, así que vale en las dos direcciones.
 *
 * Puro y sin imports: lo usan componentes de cliente y son números y cadenas.
 */

/** El hueco de siempre entre un control y el panel que abre. */
export const HUECO_DEL_DISPARADOR = 4;

/** Lo que se le deja al borde de la ventana para que no quede pegado. */
export const MARGEN_DE_LA_VENTANA = 8;

/** El tope de un panel que nace fijado: no se come la pantalla entera. */
export const TOPE_FIJADO = "70vh";

/**
 * El ancho COMÚN de los cinco paneles de la columna de la lista.
 *
 * Nacen al filo izquierdo y bajo las pastillas —eso no cambia— pero ya no
 * miden la columna entera. Con el ancho de la columna (384 px a 1440) un panel
 * de cuatro palabras deja un desierto entre el texto y su número de la
 * derecha, y encima **cada uno saltaba de tamaño**: la columna mide 384, 352 o
 * 390 según la anchura, así que el mismo panel cambiaba de ancho al cambiar de
 * ventana sin que nadie hubiera pedido nada.
 *
 * Son 18 rem, que es el escalón más pequeño de `--ancho-lateral` y el ancho
 * que ya pedía el más grande de los cinco (el de etiquetas, `w-72`): así
 * ninguno se queda más estrecho de lo que estaba y todos miden lo mismo.
 *
 * **No se toca el tamaño de letra de lo que va dentro.** Lo que junta el texto
 * con su número es el ancho, no la tipografía; achicar la letra sería arreglar
 * la sensación y empeorar la lectura.
 */
export const ANCHO_DE_LOS_FILTROS = 288;

/**
 * El suelo del ancho de un panel de la cabecera, y es un GUARDA, no un diseño.
 *
 * El ancho de esos paneles sale de medir la fila de Macros y Acciones (ver
 * `cabecera`), que en las anchuras reales da unos 200 px. Este número solo
 * existe para que una maqueta rara —la fila sin pintar todavía, un Macros de
 * ancho cero— no produzca un panel de treinta píxeles, que no se lee como un
 * ancho pequeño: se lee como un panel roto.
 */
export const ANCHO_MINIMO_DE_LA_CABECERA = 176;

/** El tope de un panel de una fila, que además puede voltear. */
export const TOPE_DE_FILA = "60vh";

/**
 * La separación entre un menú y la línea de la que nace: **ninguna**.
 *
 * Los de la cabecera nacen pegados al borde de abajo de la cabecera; los
 * filtros, pegados al de la fila de pastillas; los de una fila, pegados a su
 * control. Fueron 4 px en unos y 0 en otros, y el #917 los llevó a 10 con una
 * flecha: lo que se pidió es que queden pegados, sin hueco, y el mismo en todos.
 */
export const SEPARACION_DEL_MENU = 0;

/**
 * El ancho COMÚN de los menús de una fila de la lista (temperatura, asignar
 * asesor, el «⋯» de la fila). Cada uno traía el suyo —sin ancho, `w-52`,
 * `w-56`— y abrir uno tras otro cambiaba el tamaño. Acotado por la columna
 * medida, igual que los filtros: nunca se monta sobre la conversación.
 */
export const ANCHO_DE_UNA_FILA = 240;

/**
 * El relleno COMÚN de todo menú de Chats. Convivían `p-1`, `p-2`, `p-3` y
 * ninguno; puestos uno al lado de otro no se leían como la misma pantalla.
 */
export const RELLENO_DEL_MENU = "p-2";

/** Lo que se le deja a cada lado al medir y al voltear (ver `Geometria`). */
export type Relleno = number | { top: number; right: number; bottom: number; left: number };

/**
 * El estilo en línea del panel.
 *
 * Se declara aquí en vez de usar `React.CSSProperties` para que el módulo siga
 * sin un solo import: así lo puede cargar el banco sin levantar React.
 */
export type EstiloDelPanel = {
    width?: string;
    maxWidth?: string;
    maxHeight?: string;
};

/**
 * La capa de todo lo flotante de Chats: POR ENCIMA de los botones del borde.
 *
 * La pareja del copiloto y el chat del equipo (`BotonesDelBorde`) vive fija en
 * el borde derecho, a media altura y en `z-[60]`; los menús de Radix nacen en
 * `z-50`. Así que un menú que llegaba al borde derecho a media pantalla —el de
 * un mensaje largo a 1024, el de Acciones— quedaba con una esquina TAPADA por
 * esos botones: el banco lo cazó con `elementFromPoint`. Un menú abierto es lo
 * que se está usando; va encima. `z-[70]` y no más: la sala de reunión es
 * `z-[99]` y un menú suyo no puede quedar por encima de ella.
 */
export const ENCIMA_DEL_BORDE = "z-[70]";

/**
 * Lo que hace que un panel que no cabe **se desplace por dentro**.
 *
 * Lleva además `ENCIMA_DEL_BORDE`: lo usan todos los flotantes de Chats, y es
 * el único sitio donde ponerla sin repetirla en cada uno.
 *
 * El tope de alto sin esto no desplaza: recorta. Y `overscroll-contain` es lo
 * que evita que al llegar al final del panel el gesto siga y arrastre la lista
 * de chats que hay debajo.
 */
export const PANEL_QUE_SE_DESPLAZA = `overflow-y-auto overscroll-contain ${ENCIMA_DEL_BORDE}`;

/** Con qué primitiva se pinta, que es lo único que cambia el nombre de la variable. */
export type Primitiva = "popover" | "menu";

/** Los bordes que hacen falta de un rectángulo ya medido. */
export type Caja = { left: number; right: number; bottom: number };

/** La variable de Radix con el hueco de verdad que le queda al panel. */
export function alturaDisponible(primitiva: Primitiva): string {
    return primitiva === "popover"
        ? "var(--radix-popover-content-available-height)"
        : "var(--radix-dropdown-menu-content-available-height)";
}

/** Lo que se le pasa a Radix para colocar un panel. */
export type Geometria = {
    side: "bottom" | "top";
    /**
     * Lo que se le deja al borde de la ventana al medir y al voltear.
     *
     * No es decoración: entra en `detectOverflow`, así que es también lo que
     * descuenta `--radix-…-available-height`. Sin él un panel que llega justo
     * al borde se queda pegado a él y su última fila no se lee.
     *
     * Un menú de fila lo lleva por lados: arriba, el borde de abajo de las
     * pastillas, para que volteado no suba sobre la búsqueda ni los filtros.
     */
    collisionPadding: Relleno;
    align: "start" | "end";
    alignOffset: number;
    sideOffset: number;
    /**
     * `false` en los fijados y `true` en los de una fila.
     *
     * No es un gusto: con `avoidCollisions` Radix puede **voltear** el panel
     * arriba del disparador, y un panel de filtro fijado bajo las pastillas
     * volteado se pone encima de ellas — que es justo lo que hay que evitar.
     * En un panel de fila voltear es lo correcto: la fila puede estar abajo.
     */
    avoidCollisions: boolean;
    estilo: EstiloDelPanel;
};

/**
 * Un ancho COMÚN, pegado al filo izquierdo de la columna, bajo las pastillas.
 *
 * Tres cosas que hay que mantener:
 *
 * 1. **El ancho es `ANCHO_DE_LOS_FILTROS`, acotado por la columna medida.** Los
 *    cinco miden lo mismo, así que abrir uno y otro no cambia el tamaño de lo
 *    que hay delante. Y la cota sigue siendo la columna MEDIDA y no
 *    `--ancho-lateral`: en un móvil la columna ocupa la pantalla entera y esa
 *    variable no la describe, y el `<aside>` lleva además un `max-w-[700px]`.
 * 2. **Nace bajo las PASTILLAS, no bajo su disparador.** Los cuatro controles
 *    viven en la fila de arriba, así que un panel pegado a su disparador tapa
 *    «Mías / Todos / Sin leer / En espera», que es el mando que dice qué se
 *    está mirando.
 * 3. **`avoidCollisions: false`.** Ver arriba: volteado, el panel sube sobre
 *    las pastillas.
 */
export function columnaAncha(
    columna: Caja,
    disparador: Caja,
    bajoLasPastillas: number,
    primitiva: Primitiva,
): Geometria {
    // El ancho COMÚN, acotado por la columna: en una columna estrecha manda
    // ella, que es lo que impide que el panel se monte sobre la conversación.
    const hueco = Math.max(0, columna.right - columna.left);
    const ancho = Math.min(ANCHO_DE_LOS_FILTROS, Math.max(0, hueco - MARGEN_DE_LA_VENTANA));
    return {
        side: "bottom",
        align: "start",
        collisionPadding: MARGEN_DE_LA_VENTANA,
        // Positivo mueve a la derecha con `align="start"`, y la columna empieza
        // a la IZQUIERDA del disparador: sale negativo.
        alignOffset: Math.round(columna.left - disparador.left),
        // «Bajo las pastillas» es el borde de abajo de esa fila, sin hueco
        // (`SEPARACION_DEL_MENU`). El «⋯» vive DENTRO de ella, así que se mide
        // la fila y no su botón: los cinco salen a la misma altura.
        sideOffset:
            Math.max(0, Math.round(bajoLasPastillas - disparador.bottom)) + SEPARACION_DEL_MENU,
        avoidCollisions: false,
        estilo: {
            width: `${Math.round(ancho)}px`,
            maxWidth: `${Math.round(ancho)}px`,
            maxHeight: `min(${TOPE_FIJADO}, ${alturaDisponible(primitiva)})`,
        },
    };
}

/**
 * Pegado al filo DERECHO de la columna, bajo su control, volteando si no cabe.
 *
 * Los tres miden `ANCHO_DE_UNA_FILA`, acotado por la columna: es lo que impide
 * que se monten sobre la conversación. Y si voltean arriba, el techo es el
 * borde de abajo de las pastillas (`bajoLasPastillas`): nunca tapan la
 * búsqueda ni los filtros.
 */
export function columnaDerecha(
    columna: Caja,
    disparador: Caja,
    primitiva: Primitiva,
    bajoLasPastillas?: number,
): Geometria {
    const hueco = Math.max(0, columna.right - columna.left);
    // El ancho COMÚN de una fila, acotado por la columna: nunca sobre la
    // conversación.
    const ancho = Math.min(ANCHO_DE_UNA_FILA, Math.max(0, hueco - MARGEN_DE_LA_VENTANA));
    // Volteado arriba, no sube sobre la búsqueda ni las pastillas.
    const techo =
        bajoLasPastillas === undefined || !Number.isFinite(bajoLasPastillas)
            ? MARGEN_DE_LA_VENTANA
            : Math.max(MARGEN_DE_LA_VENTANA, Math.round(bajoLasPastillas));
    return {
        side: "bottom",
        align: "end",
        collisionPadding: {
            top: techo,
            right: MARGEN_DE_LA_VENTANA,
            bottom: MARGEN_DE_LA_VENTANA,
            left: MARGEN_DE_LA_VENTANA,
        },
        // Con `align="end"` un positivo mueve a la IZQUIERDA, y hay que mover a
        // la derecha hasta el filo de la columna: sale negativo o cero.
        alignOffset: Math.round(disparador.right - columna.right),
        sideOffset: SEPARACION_DEL_MENU,
        avoidCollisions: true,
        estilo: {
            width: `${Math.round(ancho)}px`,
            maxWidth: `${Math.round(ancho)}px`,
            maxHeight: `min(${TOPE_DE_FILA}, ${alturaDisponible(primitiva)})`,
        },
    };
}

/**
 * El margen de TODO menú de la conversación respecto al filo derecho del panel
 * de conversación: **ninguno**.
 *
 * Fueron 16 px (el `pr-4` de la fila de Macros y Acciones), y así los menús
 * quedaban flotando dentro del recuadro blanco que envuelve la conversación,
 * a 16 px de su borde. Lo que se pide es que queden PEGADOS a ese borde: el
 * menú se lee como algo que sale del recuadro, no como una tarjeta suelta
 * encima de la conversación. El banco (`probar-margenes-de-chats.mjs`) lo mide
 * sobre la página servida.
 */
export const MARGEN_INTERIOR_DE_LA_CONVERSACION = 0;

/**
 * Bajo la cabecera entera y con el ancho de la fila de Macros y Acciones, con
 * su filo derecho en el FILO DERECHO DEL PANEL DE CONVERSACIÓN.
 *
 * Tres cosas, y cada una arregla un fallo distinto:
 *
 * 1. **Los seis nacen a la misma ALTURA**: el borde de abajo de la cabecera.
 *    Así no tapan la fila de Macros y Acciones y se pasa de uno a otro sin que
 *    nada salte en vertical. Con `avoidCollisions` un panel alto volteaba
 *    arriba y se comía la cabecera entera.
 * 2. **Y el mismo FILO DERECHO**, el del panel de conversación, sin margen
 *    (`MARGEN_INTERIOR_DE_LA_CONVERSACION`). No el del botón que los abre: con
 *    cada menú colgando de su botón, abrir la cita, luego Registros y luego
 *    Acciones movía el borde derecho de un sitio a otro, que es justo lo que
 *    se reportó. Ver `alFiloDeLaConversacion`.
 * 3. **Y miden LO MISMO**: del borde izquierdo de Macros a ese filo, que es el
 *    ancho de la fila de Macros y Acciones. Con el ancho fijo, un texto largo
 *    se acomoda en varias líneas: el panel crece hacia abajo, nunca hacia los
 *    lados.
 *
 * `cabeceraCaja` ES el panel de conversación: el `data-cabecera-de-chat` es el
 * primer hijo de la columna de la conversación y mide su ancho entero. No se
 * mide la fila interna de iconos, que lleva su propio relleno y se desplaza en
 * horizontal.
 *
 * `desde` es el borde izquierdo de Macros, MEDIDO: esa fila cambia de sitio con
 * el ancho de la conversación. Y sin `desde` no se inventa ningún ancho —cada
 * componente conserva su `w-*`—: es el caso de fuera de Chats, donde el
 * combobox de etiquetas lo pintan además el CRM y `/sessions`.
 */
export function cabecera(
    cabeceraCaja: Caja,
    disparador: Caja,
    primitiva: Primitiva,
    desde?: number,
    anchoDeLaVentana: number = Number.POSITIVE_INFINITY,
): Geometria {
    // Un `desde` fuera de la cabecera no es una medida: es la copia de Macros
    // de la fila del MÓVIL, que va `md:hidden` y mide 0×0 en el origen. Con
    // ella el menú de Acciones cruzaba la pantalla de lado a lado.
    const desdeValido =
        desde !== undefined &&
        Number.isFinite(desde) &&
        desde > cabeceraCaja.left &&
        desde < cabeceraCaja.right
            ? desde
            : undefined;
    const filo = elFiloDeLaConversacion(cabeceraCaja, anchoDeLaVentana);
    // El ancho lo pide la fila (del filo de Macros al filo compartido); el
    // suelo es un GUARDA (ver `ANCHO_MINIMO_DE_LA_CABECERA`).
    const deseado =
        desdeValido === undefined
            ? undefined
            : Math.max(ANCHO_MINIMO_DE_LA_CABECERA, Math.round(filo - desdeValido));
    return alFiloDeLaConversacion(cabeceraCaja, disparador, deseado, primitiva, anchoDeLaVentana);
}

/**
 * El menú del botón verde de llamar, que vive en la fila de iconos: el mismo
 * filo derecho que todos los de la conversación y bajo la cabecera entera.
 *
 * No lleva el ancho de la fila de Macros: son dos opciones cortas y mide lo que
 * ocupan (`w-max`). Pegado al icono (`sideOffset` de 4) caía sobre la segunda
 * fila y tapaba Macros; `avoidCollisions: false` por lo mismo.
 */
export function colgadoDelIcono(
    cabeceraCaja: Caja,
    disparador: Caja,
    primitiva: Primitiva,
    anchoDeLaVentana: number = Number.POSITIVE_INFINITY,
): Geometria {
    return alFiloDeLaConversacion(cabeceraCaja, disparador, undefined, primitiva, anchoDeLaVentana);
}

/**
 * Dónde cae el filo derecho COMPARTIDO: el del panel de conversación, y nunca
 * más allá del borde de la ventana (la conversación
 * llega al borde de la pantalla en casi todas las anchuras, pero no se da por
 * hecho).
 */
export function elFiloDeLaConversacion(
    cabeceraCaja: Caja,
    anchoDeLaVentana: number = Number.POSITIVE_INFINITY,
): number {
    // Contra el borde de la VENTANA, no contra su margen: el filo es el del
    // recuadro, que en escritorio acaba antes que la pantalla. Solo si el
    // recuadro llegara más allá de la ventana manda la ventana.
    return Math.round(
        Math.min(cabeceraCaja.right - MARGEN_INTERIOR_DE_LA_CONVERSACION, anchoDeLaVentana),
    );
}

/**
 * **Una sola regla para todo menú de la conversación**: su filo derecho en el
 * filo derecho del panel de conversación —sin margen—, creciendo
 * hacia la IZQUIERDA, bajo la cabecera entera. **No depende del botón que lo
 * abre**: abrir uno tras otro no mueve el borde derecho ni un píxel.
 *
 * # Por qué no colgaba de su botón
 *
 * Fue la regla anterior (#905): filo derecho del menú con filo derecho de SU
 * botón. Cada uno nacía en un sitio —la cita a media cabecera, Registros un
 * poco más allá, Acciones en el filo— y al pasar de uno a otro el borde
 * derecho saltaba. Y antes todavía se acotaba contra el borde de la cabecera
 * interna, que corría la cita +103 px con la ficha abierta.
 *
 * # Cómo se le dice a Radix
 *
 * Radix ancla al disparador, no a la conversación, así que se le da el filo
 * como desplazamiento: con `align="end"` la caja base pone el filo derecho del
 * panel en el del botón, y Floating UI le suma `crossAxis = -alignOffset`. Para
 * que acabe en `filo` hace falta `alignOffset = disparador.right - filo`, que
 * sale NEGATIVO (mueve a la derecha) para todo botón que no esté ya en el filo.
 * Escribirlo al revés no da error: deja el panel al otro lado del botón.
 *
 * Y el ancho se acota para que el borde IZQUIERDO no se salga de la ventana:
 * a la izquierda de la conversación está la columna de chats, que es pantalla,
 * así que un menú puede pasar por encima de ella, pero no por fuera.
 */
export function alFiloDeLaConversacion(
    cabeceraCaja: Caja,
    disparador: Caja,
    ancho: number | undefined,
    primitiva: Primitiva,
    anchoDeLaVentana: number = Number.POSITIVE_INFINITY,
): Geometria {
    const filo = elFiloDeLaConversacion(cabeceraCaja, anchoDeLaVentana);
    // Lo más ancho que cabe entre el filo y el margen izquierdo de la ventana.
    const cabe = Math.max(0, filo - MARGEN_DE_LA_VENTANA);
    const mide = ancho === undefined ? undefined : Math.min(ancho, cabe);
    return {
        side: "bottom",
        align: "end",
        collisionPadding: MARGEN_DE_LA_VENTANA,
        alignOffset: Math.round(disparador.right - filo),
        sideOffset:
            Math.max(0, Math.round(cabeceraCaja.bottom - disparador.bottom)) + SEPARACION_DEL_MENU,
        avoidCollisions: false,
        estilo: {
            ...(mide === undefined ? {} : { width: `${mide}px` }),
            maxWidth: `${mide ?? cabe}px`,
            maxHeight: `min(${TOPE_FIJADO}, ${alturaDisponible(primitiva)})`,
        },
    };
}

/**
 * Bajo la BARRA DE ARRIBA de la plataforma y dentro de la ventana.
 *
 * Es el panel de la campanita, y no es de Chats —la barra es la misma en todas
 * las pantallas—, pero la pregunta es exactamente la de arriba: nace pegado a
 * su botón y ese botón vive DENTRO de una barra más alta que él, así que un
 * `sideOffset` de 4 lo deja montado sobre ella. Se mide la barra, como se mide
 * la cabecera de la conversación.
 *
 * Y el ancho se acota a la ventana: el panel pide `min(92vw, 380px)` y con
 * `align="end"` su filo derecho cae en el del botón; acotado además por la
 * ventana no puede cortarse por ningún lado en ninguna anchura.
 */
export function bajoLaBarraDeArriba(
    barra: Caja,
    disparador: Caja,
    anchoDeLaVentana: number,
    primitiva: Primitiva,
): Geometria {
    // Positivo mueve a la IZQUIERDA con `align="end"`: solo se usa si el botón
    // llegara a quedar pegado al borde, que hoy no pasa (la barra lleva `pr-3`).
    const seSale = disparador.right - (anchoDeLaVentana - MARGEN_DE_LA_VENTANA);
    return {
        side: "bottom",
        align: "end",
        collisionPadding: MARGEN_DE_LA_VENTANA,
        alignOffset: Math.round(Math.max(0, seSale)),
        sideOffset:
            Math.max(0, Math.round(barra.bottom - disparador.bottom)) + HUECO_DEL_DISPARADOR,
        avoidCollisions: false,
        estilo: {
            maxWidth: `${Math.round(anchoDeLaVentana - MARGEN_DE_LA_VENTANA * 2)}px`,
            maxHeight: `min(${TOPE_FIJADO}, ${alturaDisponible(primitiva)})`,
        },
    };
}

/**
 * La geometría de siempre: la que tenía cada panel antes de que esto existiera.
 *
 * Hace falta porque los paneles son **compartidos**: `SessionTagsCombobox` lo
 * pinta también el kanban de `/tags`, y `AdvisorAssignBadge` la lista de
 * asesores de otras pantallas. Sin un valor por defecto, unificar Chats les
 * cambiaría la colocación a pantallas que nadie pidió tocar.
 */
export function comoSiempre(
    align: "start" | "end" | "center",
    side: "bottom" | "top" = "bottom",
): {
    side: "bottom" | "top";
    align: "start" | "end" | "center";
    alignOffset: number;
    sideOffset: number;
    avoidCollisions: boolean;
    collisionPadding: number;
    estilo: EstiloDelPanel;
} {
    return {
        side,
        align,
        alignOffset: 0,
        sideOffset: HUECO_DEL_DISPARADOR,
        avoidCollisions: true,
        collisionPadding: MARGEN_DE_LA_VENTANA,
        estilo: {},
    };
}

/**
 * # La regla común: se mide el hueco ANTES de abrir y se elige el lado que cabe
 *
 * Todo lo que se abre flotando en Chats cumple las tres cosas, venga por la
 * clase que venga:
 *
 * 1. **Va en un portal** (Radix), así que ningún `overflow` de la lista, del
 *    hilo o de la cabecera lo recorta. El menú de un mensaje era un `div`
 *    absoluto DENTRO del hilo que se desplaza: abría hacia arriba y, con el
 *    mensaje pegado al borde de arriba del hilo, la fila de reacciones quedaba
 *    fuera del área visible y no se podía pulsar. A zoom 80 % cabía y a 100 %
 *    no: eso delata un recorte, no un fallo de datos.
 * 2. **Elige el lado donde cabe completo** (`avoidCollisions`: Floating UI
 *    mide el hueco de los dos lados y voltea al que cabe; si no cabe en
 *    ninguno se queda con el que más tiene) y **se corre de costado** lo justo
 *    para no salirse (el `shift` de Radix va en el eje de la alineación).
 * 3. **Y si ni así cabe, se desplaza por dentro**: el tope de alto es el hueco
 *    de VERDAD (`--radix-…-available-height`), nunca `vh`.
 *
 * Las clases fijadas de arriba (`columnaAncha`, `cabecera`, `barraDeArriba`)
 * no voltean a propósito —volteadas taparían las pastillas o la cabecera—,
 * pero cumplen lo mismo por otra vía: nacen justo debajo de su fila, su ancho
 * se acota a la ventana y su alto al hueco, así que tampoco pueden salirse.
 */

/**
 * Lo que se abre DESDE UN MENSAJE del hilo: la barra de reacciones y el menú
 * de Copiar, Editar y Eliminar.
 *
 * - Prefiere ARRIBA —que es como se abría: el mensaje no se tapa a sí mismo—,
 *   y **voltea abajo si arriba no cabe entero**.
 * - El límite no es la ventana: es **el HILO** (`hilo`, que el hook pasa como
 *   `collisionBoundary`). Arriba del hilo está la cabecera de la conversación
 *   con Macros y Acciones; un menú que se sale del hilo por arriba no «cabe»,
 *   tapa la cabecera. Y abajo está la barra de escribir.
 * - Se alinea con el lado del mensaje (`end` los propios, `start` los del
 *   contacto), y el `shift` lo mete dentro del hilo si se sale por un costado.
 * - Nunca más ancho que el hilo, nunca más alto que el hueco.
 */
export function enElHilo(
    hilo: Caja,
    alineado: "start" | "end",
    primitiva: Primitiva,
): Geometria {
    const ancho = Math.max(0, hilo.right - hilo.left - MARGEN_DE_LA_VENTANA * 2);
    return {
        side: "top",
        align: alineado,
        alignOffset: 0,
        sideOffset: HUECO_DEL_DISPARADOR,
        collisionPadding: MARGEN_DE_LA_VENTANA,
        avoidCollisions: true,
        estilo: {
            maxWidth: `${Math.round(ancho)}px`,
            maxHeight: `min(${TOPE_DE_FILA}, ${alturaDisponible(primitiva)})`,
        },
    };
}

/**
 * Un panel SUELTO: el que no cuelga de ninguna fila de Chats que haga falta
 * medir —los menús de la barra de acciones en lote, los participantes, el
 * selector de automatizaciones, los emojis y el clip de la barra de escribir,
 * los submenús—. No necesita hook: la ventana es su límite y Radix la conoce.
 *
 * Lo único que cambia con `comoSiempre` es el TOPE de alto: sin él, un menú con
 * treinta asesores dentro (el lote) se salía de la pantalla por mucho que
 * voltease, porque ninguno de los dos lados tiene treinta filas de hueco.
 */
export function suelto(
    primitiva: Primitiva,
    side: "top" | "bottom" = "bottom",
    align: "start" | "end" | "center" = "start",
): {
    side: "top" | "bottom";
    align: "start" | "end" | "center";
    sideOffset: number;
    avoidCollisions: true;
    collisionPadding: number;
    style: EstiloDelPanel;
} {
    return {
        side,
        align,
        sideOffset: HUECO_DEL_DISPARADOR,
        avoidCollisions: true,
        collisionPadding: MARGEN_DE_LA_VENTANA,
        style: { maxHeight: `min(${TOPE_FIJADO}, ${alturaDisponible(primitiva)})` },
    };
}

/**
 * Lo de un SUBMENÚ (Transferir a…, Asignar asesor…). Radix ya lo voltea de la
 * derecha a la izquierda cuando no cabe; lo que faltaba es el margen con el
 * borde y el tope de alto, que son los mismos de todos.
 */
export function deSubmenu(): {
    collisionPadding: number;
    avoidCollisions: true;
    style: EstiloDelPanel;
} {
    return {
        collisionPadding: MARGEN_DE_LA_VENTANA,
        avoidCollisions: true,
        style: { maxHeight: `min(${TOPE_DE_FILA}, ${alturaDisponible("menu")})` },
    };
}
