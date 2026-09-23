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
 * | `cabecera` | colgando de SU botón —su filo derecho es el del botón y crece hacia la izquierda—, bajo la cabecera, con el ancho de la fila de Macros y Acciones | se pasa de uno a otro sin cerrar: ni saltan de altura ni de tamaño |
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
 * Lo que hace que un panel que no cabe **se desplace por dentro**.
 *
 * El tope de alto sin esto no desplaza: recorta. Y `overscroll-contain` es lo
 * que evita que al llegar al final del panel el gesto siga y arrastre la lista
 * de chats que hay debajo.
 */
export const PANEL_QUE_SE_DESPLAZA = "overflow-y-auto overscroll-contain";

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
    side: "bottom";
    /**
     * Lo que se le deja al borde de la ventana al medir y al voltear.
     *
     * No es decoración: entra en `detectOverflow`, así que es también lo que
     * descuenta `--radix-…-available-height`. Sin él un panel que llega justo
     * al borde se queda pegado a él y su última fila no se lee.
     */
    collisionPadding: number;
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
        // «Bajo las pastillas» son las pastillas MÁS el hueco de siempre: el
        // «⋯» vive DENTRO de esa fila, así que sin el hueco su panel nacería
        // pegado a ella y los cuatro no saldrían a la misma altura.
        sideOffset:
            Math.max(0, Math.round(bajoLasPastillas - disparador.bottom)) + HUECO_DEL_DISPARADOR,
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
 * El ancho no se fija —cada uno tiene el suyo— pero sí se **acota** al de la
 * columna: es lo que impide que el panel de etiquetas, que pide 18rem, se monte
 * sobre la conversación cuando la columna mide menos.
 */
export function columnaDerecha(
    columna: Caja,
    disparador: Caja,
    primitiva: Primitiva,
): Geometria {
    const ancho = Math.max(0, columna.right - columna.left);
    return {
        side: "bottom",
        align: "end",
        collisionPadding: MARGEN_DE_LA_VENTANA,
        // Con `align="end"` un positivo mueve a la IZQUIERDA, y hay que mover a
        // la derecha hasta el filo de la columna: sale negativo o cero.
        alignOffset: Math.round(disparador.right - columna.right),
        sideOffset: HUECO_DEL_DISPARADOR,
        avoidCollisions: true,
        estilo: {
            maxWidth: `${Math.round(ancho - MARGEN_DE_LA_VENTANA)}px`,
            maxHeight: `min(${TOPE_DE_FILA}, ${alturaDisponible(primitiva)})`,
        },
    };
}

/**
 * Colgando de SU botón —filo derecho con filo derecho, creciendo hacia la
 * izquierda—, bajo la cabecera entera, y con el ancho de la fila de Macros y
 * Acciones.
 *
 * Dos cosas, y cada una arregla un fallo distinto:
 *
 * 1. **Los seis nacen a la misma ALTURA.** Es lo que permite pasar de uno a
 *    otro sin cerrar primero: no salta nada de sitio. Y esa altura es el borde
 *    de abajo de la cabecera, así que la fila de Macros y Acciones —que es su
 *    última fila— no se tapa nunca. Con `avoidCollisions` un panel alto
 *    volteaba arriba y se comía la cabecera entera.
 * 2. **Y los seis miden lo MISMO**: del borde izquierdo de Macros al filo
 *    derecho, que es el ancho que ya tenían Acciones y Registros. Antes cada
 *    uno traía el suyo —el de etiquetas se pasaba de ancho, el de la cita se
 *    quedaba corto— así que además de no saltar de sitio hacía falta que no
 *    saltaran de tamaño. Con el ancho fijo, un texto largo se acomoda en
 *    varias líneas: **el panel crece hacia abajo, nunca hacia los lados.**
 *
 * `desde` es el borde izquierdo de Macros, MEDIDO —no `--ancho-lateral` ni una
 * constante—: esa fila cambia de sitio con el ancho de la conversación, que
 * depende de la lista, de la ficha de contacto y de los paneles laterales.
 *
 * Y sin `desde` se queda **exactamente como estaba**: cada componente con su
 * `w-*` de siempre, acotado por la cabecera. Es el caso de fuera de Chats —el
 * combobox de etiquetas lo pintan además el CRM y `/sessions`, y el de asesores
 * otras pantallas—, donde no hay ninguna fila de Macros contra la que medir.
 * Inventarles un ancho a dos pantallas que nadie pidió tocar es peor que no
 * unificar.
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
    // ella el ancho salía de la cabecera entera y el menú de Acciones cruzaba
    // la pantalla de lado a lado. Se trata como si no hubiera fila que medir.
    const desdeValido =
        desde !== undefined &&
        Number.isFinite(desde) &&
        desde > cabeceraCaja.left &&
        desde < cabeceraCaja.right
            ? desde
            : undefined;
    // El panel CUELGA DE SU BOTÓN, SIEMPRE por el filo derecho: su borde
    // derecho es el del botón y crece hacia la IZQUIERDA (`colgarDelFiloDerecho`).
    // Antes se elegía el lado mirando en qué mitad de la cabecera caía el
    // botón, y la cita agendada —en la mitad izquierda con la ficha de
    // contacto o un panel lateral abierto— crecía hacia la derecha desde el
    // centro de la conversación.
    //
    // El ancho lo pide la fila (del filo de Macros al filo derecho); el suelo
    // es un GUARDA (ver `ANCHO_MINIMO_DE_LA_CABECERA`) y la cabecera entera es
    // el techo.
    const deseado =
        desdeValido === undefined
            ? undefined
            : Math.max(ANCHO_MINIMO_DE_LA_CABECERA, Math.round(cabeceraCaja.right - desdeValido));
    return colgarDelFiloDerecho(cabeceraCaja, disparador, deseado, primitiva, anchoDeLaVentana);
}

/**
 * El menú del botón verde de llamar: colgado de SU icono como todos los de la
 * conversación —filo derecho con filo derecho, creciendo hacia la izquierda— y
 * nacido bajo la cabecera entera.
 *
 * No lleva el ancho de la fila de Macros: son dos opciones cortas y mide lo que
 * ocupan. Nacía con su borde IZQUIERDO en el del icono; se pasó al derecho
 * porque «todos los menús de la conversación crecen hacia la izquierda» es una
 * regla, y con una excepción deja de serlo.
 *
 * Y la altura es la de los otros: **bajo la cabecera entera**. Pegado al icono
 * (`sideOffset` de 4) caía sobre la segunda fila y **tapaba Macros**.
 * `avoidCollisions: false` por lo mismo: volteado subiría sobre la cabecera.
 */
export function colgadoDelIcono(
    cabeceraCaja: Caja,
    disparador: Caja,
    primitiva: Primitiva,
    anchoDeLaVentana: number = Number.POSITIVE_INFINITY,
): Geometria {
    // Sin ancho escrito: el menú mide lo que ocupan sus dos entradas (`w-max`).
    // `ANCHO_DEL_MENU_CORTO` solo decide si hace falta correrlo para que no se
    // salga por la izquierda cuando el icono está pegado a ese borde.
    const g = colgarDelFiloDerecho(
        cabeceraCaja,
        disparador,
        ANCHO_DEL_MENU_CORTO,
        primitiva,
        anchoDeLaVentana,
    );
    const { width: _sinAncho, ...estilo } = g.estilo;
    return { ...g, estilo };
}

/**
 * Lo que se da por ancho del menú de llamar para decidir si cabe a la
 * izquierda de su icono. Sus dos entradas («Llamar», «Llamar IA») miden unos
 * 140 px; se redondea hacia arriba, porque equivocarse hacia de más solo lo
 * corre un poco a la derecha, y hacia de menos lo sacaría de la cabecera.
 */
export const ANCHO_DEL_MENU_CORTO = 176;

/**
 * **Una sola regla para todo menú de la conversación**: colgado de SU botón,
 * con el filo derecho en el filo derecho del botón y creciendo hacia la
 * IZQUIERDA, bajo la cabecera entera.
 *
 * `ancho` es lo que el panel pide (`undefined` = el suyo, sin tocar).
 *
 * # Lo que acota es la PANTALLA, no la cabecera
 *
 * Esto medía «¿cabe a la izquierda del botón?» contra el borde izquierdo de la
 * CABECERA. Con la ficha de contacto o un panel lateral abierto la
 * conversación se queda en 260 px, el panel pide 219 y la cita, Registros del
 * lead y Macros —que caen lejos del filo derecho— se corrían 50-100 px a la
 * derecha para no pasar de ese borde: el menú dejaba de colgar de su botón y
 * nacía debajo de otro. Medido sobre la página servida a 1024 px, con la ficha
 * abierta: cita +103 px, Macros +93, Registros +47. Y como el corrimiento se
 * calcula una vez al abrir, cualquier cambio de ancho posterior lo dejaba
 * además desfasado.
 *
 * A la izquierda de la cabecera está la columna de chats, que es PANTALLA: un
 * menú puede pasar por encima de ella sin salirse de nada. Así que solo se
 * corre cuando se saldría de la VENTANA, y lo justo para quedar a
 * `MARGEN_DE_LA_VENTANA` de su borde. En el caso normal el corrimiento es 0 y
 * Radix lo mantiene pegado al botón aunque la cabecera cambie de ancho con el
 * menú abierto.
 *
 * `alignOffset` negativo: con `align="end"` un positivo mueve a la izquierda y
 * un negativo a la derecha; al revés no da error, deja el panel al otro lado.
 * **Nunca pasa a `align="start"` ni a `"center"`**: eso es lo que hacía que la
 * cita naciera en el centro o hacia la derecha.
 */
export function colgarDelFiloDerecho(
    cabeceraCaja: Caja,
    disparador: Caja,
    ancho: number | undefined,
    primitiva: Primitiva,
    anchoDeLaVentana: number = Number.POSITIVE_INFINITY,
): Geometria {
    // Lo más ancho que cabe en la ventana, con su margen a cada lado.
    const cabeEnLaVentana = Math.max(0, anchoDeLaVentana - MARGEN_DE_LA_VENTANA * 2);
    // Lo que hay del filo del botón al borde izquierdo de la VENTANA.
    const aLaIzquierda = Math.max(0, disparador.right - MARGEN_DE_LA_VENTANA);
    const mide = ancho === undefined ? undefined : Math.min(ancho, cabeEnLaVentana);
    const corrimiento = mide !== undefined && mide > aLaIzquierda ? Math.round(mide - aLaIzquierda) : 0;
    return {
        side: "bottom",
        align: "end",
        collisionPadding: MARGEN_DE_LA_VENTANA,
        alignOffset: corrimiento === 0 ? 0 : -corrimiento,
        sideOffset: Math.max(0, Math.round(cabeceraCaja.bottom - disparador.bottom)),
        avoidCollisions: false,
        estilo: {
            ...(mide === undefined ? {} : { width: `${mide}px` }),
            maxWidth: `${mide ?? Math.round(Math.min(aLaIzquierda, cabeEnLaVentana))}px`,
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
