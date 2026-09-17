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
export function avisarDelPanelLateral(abierto: boolean): void {
    if (typeof document === "undefined") return;
    const raiz = document.documentElement;
    if (abierto) raiz.setAttribute("data-panel-lateral", "abierto");
    else raiz.removeAttribute("data-panel-lateral");
}
