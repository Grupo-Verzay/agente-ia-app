/**
 * La forma de un panel lateral. **Una sola**, para toda la plataforma.
 *
 * El copiloto y el chat del equipo tenían cada uno su copia de estas clases, y
 * la ficha de Contacto de Chats una tercera con otro ancho. Copiadas, el día
 * que se afina una las otras se quedan atrás — y eso no se ve como un error,
 * se ve como dos paneles que no parecen del mismo sitio.
 *
 * Las dos medidas vienen de CSS y no de aquí:
 *
 * - **`--ancho-lateral`**: la escala de la lista de Chats (18/20/22/24 rem),
 *   que es el ancho de todos los paneles de la App.
 * - **`--alto-de-la-barra`**: lo que mide la barra de arriba, medido en vivo
 *   por `MedidaDeLaBarra`. Los paneles arrancan **debajo** de ella: el
 *   buscador y la campanita no se tapan nunca.
 *
 * Puro y sin imports: lo usan componentes de cliente, y son cadenas.
 */

/** La franja donde vive el panel en escritorio: pegada a la derecha, bajo la barra. */
export const FRANJA_LATERAL =
    "pointer-events-none fixed right-0 z-50 hidden sm:block " +
    "top-[var(--alto-de-la-barra)] h-[calc(100dvh-var(--alto-de-la-barra))] " +
    "w-[var(--ancho-lateral)]";

/**
 * La misma franja en móvil: de lado a lado, también bajo la barra.
 *
 * `inset-x-0 bottom-0` con el `top` de la barra, y no `inset-0`: con `inset-0`
 * el panel arrancaba en el borde de arriba y **tapaba la barra entera**, que
 * es justo lo que no puede pasar.
 */
export const FRANJA_LATERAL_MOVIL =
    "pointer-events-none fixed inset-x-0 bottom-0 z-50 sm:hidden " +
    "top-[var(--alto-de-la-barra)]";

/** La hoja que se desliza dentro de la franja. */
export const HOJA_LATERAL =
    "pointer-events-auto flex flex-col overflow-hidden bg-background " +
    "shadow-2xl shadow-black/10 transition-transform duration-500 " +
    "[transition-timing-function:cubic-bezier(0.17,0.61,0.54,0.9)] " +
    "absolute right-0 top-0 h-full w-full rounded-l-lg border border-r-0";

/** La hoja en móvil: ocupa la franja entera, sin bordes ni sombra. */
export const HOJA_LATERAL_MOVIL =
    "pointer-events-auto flex flex-col overflow-hidden bg-background " +
    "transition-transform duration-500 " +
    "[transition-timing-function:cubic-bezier(0.17,0.61,0.54,0.9)] " +
    "absolute inset-0 h-full w-full border-0 shadow-none";

/**
 * La franja de un panel, **en un solo nodo**, con el móvil por punto de corte.
 *
 * `FRANJA_LATERAL` y `FRANJA_LATERAL_MOVIL` son dos cajas, así que quien las
 * usa pinta su panel **dos veces** y solo esconde una con `display:none`. React
 * monta las dos: dos juegos de estado y dos veces los efectos. En un hilo de
 * chat eso ya significa dos relojes de 5 s con el panel abierto; en un
 * FORMULARIO significa dos formularios, y quien cruza el punto de corte a
 * media faena se encuentra el otro, vacío.
 *
 * Así que lo que se monta es uno y las dos formas se piden con `sm:`. Las dos
 * medidas siguen saliendo de CSS, como arriba.
 */
export const FRANJA_DEL_PANEL =
    "pointer-events-none fixed z-50 inset-x-0 bottom-0 " +
    "top-[var(--alto-de-la-barra)] " +
    "sm:inset-x-auto sm:right-0 sm:bottom-auto " +
    "sm:h-[calc(100dvh-var(--alto-de-la-barra))] sm:w-[var(--ancho-lateral)]";

/** La hoja de ese mismo panel: a pantalla completa abajo, con borde y sombra arriba. */
export const HOJA_DEL_PANEL =
    "pointer-events-auto flex flex-col overflow-hidden bg-background " +
    "transition-transform duration-500 " +
    "[transition-timing-function:cubic-bezier(0.17,0.61,0.54,0.9)] " +
    "absolute inset-0 h-full w-full border-0 shadow-none " +
    "sm:inset-auto sm:right-0 sm:top-0 sm:rounded-l-lg sm:border sm:border-r-0 " +
    "sm:shadow-2xl sm:shadow-black/10";

/**
 * Lo que tarda la hoja en entrar y en salir.
 *
 * **Tiene que coincidir con el `duration-500` de las clases de arriba.** Lo lee
 * el marco para no desmontar lo de dentro antes de que la hoja acabe de salir:
 * desmontándolo al instante, lo que se ve deslizarse es una hoja en blanco.
 */
export const MS_DEL_DESLIZAMIENTO = 500;

/**
 * Los paneles laterales que hay abiertos ahora mismo.
 *
 * # Por qué es un REGISTRO y no un booleano
 *
 * Eran dos paneles y ahora son cinco —el copiloto, el chat del equipo, el
 * contexto del lead, el recordatorio y la tarea—, así que dos pueden estar
 * montados a la vez durante la transición: el que se cierra desmonta su efecto
 * **después** de que el que se abre haya montado el suyo. Con un booleano ese
 * cierre borraba el atributo que el otro acababa de poner, y la conversación
 * volvía a meterse debajo del panel abierto sin que nadie hubiera cerrado nada.
 *
 * Con un conjunto, el atributo se quita solo cuando no queda ninguno.
 *
 * # Y lo que entra aquí es la INSTANCIA, no el panel
 *
 * El mismo panel puede estar montado más de una vez —la cabecera de Chats
 * pinta el recordatorio dos veces, una por fila, y la tarea sale de tres
 * sitios—. Registrando el id del panel, la instancia cerrada borraría lo que
 * acaba de apuntar la abierta. Quien llama pone su `useId`; el id del panel es
 * otra cosa y sirve para otra (la exclusión).
 *
 * Vive en el módulo y no en un estado de React a propósito: los paneles cuelgan
 * de sitios distintos del árbol —el layout y la cabecera de Chats— y lo que se
 * escribe es un atributo de la raíz del documento, no una prop.
 */
const abiertos = new Set<string>();

/**
 * Le dice a Chats que hay un panel abierto, para que acomode la conversación.
 *
 * Fuera de Chats no hace nada: la regla de CSS que lo lee está acotada a
 * `[data-chat-view]`, que es el contenedor de la bandeja. En el resto de la
 * plataforma el panel se abre **encima** y no empuja ni encoge nada, que es lo
 * que se pidió.
 *
 * Es un atributo en la raíz y no un estado de React a propósito: los paneles
 * cuelgan del layout y Chats vive dentro de `children`; pasarle una prop
 * obligaría a un contexto que atraviesa media App para mover un padding.
 */
export function avisarDelPanelLateral(instancia: string, abierto: boolean): void {
    if (typeof document === "undefined") return;
    if (abierto) abiertos.add(instancia);
    else abiertos.delete(instancia);
    const raiz = document.documentElement;
    if (abiertos.size > 0) raiz.setAttribute("data-panel-lateral", "abierto");
    else raiz.removeAttribute("data-panel-lateral");
}

/**
 * ¿Hay otro panel lateral abierto que no sea esta instancia?
 *
 * Es lo que distingue ABRIR de RELEVAR: con la franja vacía, el panel entra
 * deslizándose; con otro ya puesto, lo sustituye en su sitio (ver
 * `comoSeMueveLaHoja`).
 */
export function hayOtroPanelAbierto(instancia: string): boolean {
    for (const otra of abiertos) if (otra !== instancia) return true;
    return false;
}

/**
 * Cómo se mueve la hoja en este cambio. **Dos respuestas y ninguna más.**
 *
 * - `desliza`: la franja estaba vacía (o se queda vacía): entra de derecha a
 *   izquierda, o sale de izquierda a derecha, en `MS_DEL_DESLIZAMIENTO` y con
 *   la curva de `HOJA_DEL_PANEL`.
 * - `relevo`: otro panel ocupa ya la franja y este lo SUSTITUYE, o este se va
 *   porque otro lo sustituye. Sin transición: el que entra aparece ya puesto y
 *   el que sale desaparece en el mismo fotograma.
 *
 * # Por qué el relevo no anima
 *
 * Con los dos animando, el que sale se desliza hacia fuera mientras el que
 * entra se desliza hacia dentro en el mismo sitio: la franja se «vacía» y se
 * «llena» a la vez, y eso es exactamente el reinicio y el tirón que se viene a
 * quitar. Un relevo tiene que leerse como UN contenedor que cambia de
 * contenido. La conversación no se mueve en ningún caso: el registro de
 * `abiertos` mantiene la franja reservada durante el relevo.
 */
export type MovimientoDeLaHoja = "desliza" | "relevo";

export function comoSeMueveLaHoja({
    abriendo,
    hayOtroAbierto,
    loCierraOtro,
}: {
    /** `true` al abrirse; `false` al cerrarse. */
    abriendo: boolean;
    /** Al abrirse: si otro panel ocupaba ya la franja. */
    hayOtroAbierto: boolean;
    /** Al cerrarse: si lo cierra la exclusión porque se abrió otro. */
    loCierraOtro: boolean;
}): MovimientoDeLaHoja {
    if (abriendo) return hayOtroAbierto ? "relevo" : "desliza";
    return loCierraOtro ? "relevo" : "desliza";
}

/**
 * La clase que apaga la transición de la hoja durante un relevo. Va DESPUÉS de
 * las clases de la hoja en un `cn()`: `tailwind-merge` deja la última.
 */
export const HOJA_SIN_TRANSICION = "transition-none";

/**
 * El aviso con el que un panel lateral dice que acaba de abrirse.
 *
 * Los cinco viven **en el mismo sitio** —la franja de la derecha—, así que dos
 * abiertos a la vez son uno tapando al otro sin decir cuál está delante. La
 * exclusión se hacía a mano y solo entre dos (el copiloto y el equipo); con
 * cinco, escribirla a mano es garantizar que a la pareja número diez se le
 * olvide.
 *
 * Va por un evento del navegador y no por un contexto de React, que es el
 * mismo camino que ya siguen `abrirLlamadaAqui`, `abrirLaReunionAqui` y
 * `chat-equipo:leido`: quien abre puede estar en cualquier pantalla y quien
 * escucha cuelga del layout, así que un contexto obligaría a envolver media
 * App para apagar un panel.
 */
export const AVISO_DE_PANEL_LATERAL = "panel-lateral:abierto";

/**
 * Los cinco que hay, con su nombre escrito en UN sitio.
 *
 * El id es lo que distingue a un panel de otro en el registro y en la
 * exclusión, así que dos paneles con el mismo se cerrarían entre ellos y uno
 * con el id mal escrito no cerraría a nadie — y ninguna de las dos cosas da un
 * error: se ven como dos paneles abiertos a la vez, de vez en cuando.
 */
export const PANEL_DEL_COPILOTO = "panel-copiloto";
export const PANEL_DEL_EQUIPO = "panel-chat-equipo";
export const PANEL_DEL_CONTEXTO = "panel-contexto-del-lead";
export const PANEL_DEL_RECORDATORIO = "panel-crear-recordatorio";
export const PANEL_DE_LA_TAREA = "panel-nueva-tarea";
/**
 * La ficha de Contacto. Es un `PanelLateral` como los demás: misma franja,
 * mismo deslizamiento, misma exclusión y reserva la franja igual.
 *
 * Fue un hermano del flex de Chats que se montaba y desmontaba de golpe —sin
 * deslizarse, empujando la conversación en un fotograma— y al alternar con los
 * otros cinco se notaba el salto.
 */
export const PANEL_DE_LA_FICHA = "panel-ficha-de-contacto";
export const PANEL_DE_ENVIAR_AL_EQUIPO = "panel-enviar-al-equipo";

/**
 * # En Chats, el panel es la TERCERA COLUMNA y no una hoja sobre la ventana
 *
 * La franja se coloca contra la VENTANA: arranca justo bajo la barra y llega
 * al borde derecho de la pantalla. La bandeja, en cambio, vive dentro de la
 * caja del módulo, que tiene su relleno (`sm:p-1`) y su borde. Así que con un
 * panel abierto:
 *
 * - el panel **subía** más que la lista y la conversación (el relleno y el
 *   borde de la caja: 5 px), y con él su cabecera entera quedaba descolgada;
 * - y entre la conversación y el panel quedaba un **hueco** —el relleno, el
 *   borde redondeado de la caja y la sombra del panel— donde entre la lista y
 *   la conversación hay una raya de 1 px.
 *
 * La respuesta no es restar variables: la caja se MIDE (`MedidaDeChats`) y la
 * franja se pone exactamente sobre la franja que la bandeja ya le reserva por
 * la derecha (`padding-right: var(--ancho-lateral)`). Arriba y abajo, los de la
 * bandeja; a la derecha, el de la bandeja. Y la hoja pierde lo que la hacía
 * «flotar» —redondeo, sombra y bordes— y se queda con un borde izquierdo de
 * 1 px del color de la raya de la lista: **el mismo separador en los dos
 * puntos** (`app/globals.css`, bajo `data-chats-medidos`).
 *
 * Solo de `lg` para arriba, que es donde la bandeja reserva la franja; por
 * debajo el panel se sigue abriendo encima, como en el resto de la plataforma.
 */

/** La marca de la franja (la caja fija). La leen la regla de CSS y el banco. */
export const MARCA_DE_FRANJA = "data-franja-lateral";
/** La marca de la hoja (lo que se desliza dentro). */
export const MARCA_DE_HOJA = "data-hoja-lateral";

/** Lo que se publica en la raíz, medido de la bandeja. En px. */
export type MedidaDeLaBandeja = { arriba: number; alto: number; derecha: number };

/**
 * De la caja medida de la bandeja a los tres números de la franja.
 *
 * `derecha` es lo que queda entre el borde derecho de la bandeja y el de la
 * ventana (el relleno y el borde de la caja del módulo). Redondeado a medio
 * píxel hacia fuera no: se deja tal cual, porque el borde de la caja puede caer
 * en un píxel fraccionario y redondear abriría una raya de fondo de 1 px.
 */
export function laFranjaDeLaBandeja(
    caja: { top: number; right: number; height: number },
    anchoDeLaVentana: number,
): MedidaDeLaBandeja {
    return {
        arriba: caja.top,
        alto: caja.height,
        derecha: Math.max(0, anchoDeLaVentana - caja.right),
    };
}
