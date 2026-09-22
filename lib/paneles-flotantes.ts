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
 * | `columnaAncha` | el ancho ENTERO de la columna, pegado a su filo izquierdo, bajo la fila de pastillas | son filtros de la lista: lo que eligen se aplica a la columna entera |
 * | `columnaDerecha` | pegado al filo DERECHO de la columna, bajo su control | son de UNA fila: nacen donde se pulsó, y voltean arriba si no cabe |
 * | `cabecera` | pegado al filo derecho del área de conversación, bajo la cabecera | se pasa de uno a otro sin cerrar: todos a la misma altura |
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
 * El ancho ENTERO de la columna, pegado a su filo izquierdo, bajo las pastillas.
 *
 * Tres cosas que hay que mantener:
 *
 * 1. **El ancho es el de la columna medido, no `--ancho-lateral`.** En un móvil
 *    la columna ocupa la pantalla entera y esa variable no la describe; y el
 *    `<aside>` lleva además un `max-w-[700px]`. Se mide, como el alto de la
 *    barra de arriba.
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
    const ancho = Math.max(0, columna.right - columna.left);
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
 * Pegado al filo derecho del área de conversación, bajo la cabecera entera.
 *
 * Los seis paneles de la fila de iconos nacen **a la misma altura**, que es lo
 * que permite pasar de uno a otro sin cerrar primero: no salta nada de sitio.
 * Y esa altura es el borde de abajo de la cabecera, así que la fila de Macros y
 * Acciones —que es su última fila— no se tapa nunca. Con `avoidCollisions` un
 * panel alto volteaba arriba y se comía la cabecera entera.
 */
export function cabecera(
    cabeceraCaja: Caja,
    disparador: Caja,
    primitiva: Primitiva,
): Geometria {
    return {
        side: "bottom",
        align: "end",
        collisionPadding: MARGEN_DE_LA_VENTANA,
        alignOffset: Math.round(disparador.right - cabeceraCaja.right),
        sideOffset: Math.max(0, Math.round(cabeceraCaja.bottom - disparador.bottom)),
        avoidCollisions: false,
        estilo: {
            maxWidth: `${Math.round(Math.max(0, cabeceraCaja.right - cabeceraCaja.left) - MARGEN_DE_LA_VENTANA)}px`,
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
