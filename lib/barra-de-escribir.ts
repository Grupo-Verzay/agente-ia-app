/**
 * La forma de una barra de escribir, escrita UNA vez.
 *
 * Las dos barras de la plataforma —la de Chats y la del chat de equipo— son el
 * mismo patrón: un botón «+» a la izquierda que despliega las herramientas en
 * una columna flotante por encima de la caja, la caja ocupando todo el ancho
 * que queda, y a la derecha el micrófono —que despliega su propia columna con
 * el dictado y la nota de voz— o el botón redondo de enviar en cuanto hay algo
 * que mandar.
 *
 * Copiadas a mano en los dos sitios, el día que se afine el radio, el hueco o
 * el color de un botón se afina en una barra y la otra se queda atrás. Eso no
 * se ve como un error: se ve como dos pantallas de la misma plataforma que no
 * se parecen, y nadie sabe cuál es la buena.
 *
 * Va en `lib/` y **por eso `tailwind.config.ts` tiene que mirar `lib/`** —lo
 * mira, con su explicación al lado—. Sin ese glob estas clases no generan ni
 * una regla y los botones salen sin forma, con el build limpio. Se comprueba
 * buscando la DECLARACIÓN en el CSS del build, no la clase en el código.
 */

/**
 * La columna flotante que sale del «+», por ENCIMA de la caja.
 *
 * Hacia arriba y no hacia abajo: debajo está el borde de la ventana, y en un
 * panel lateral no hay sitio para desplegar nada ahí.
 */
export const COLUMNA_DE_HERRAMIENTAS =
    "absolute bottom-full left-0 mb-2 z-50 flex flex-col items-center gap-1 rounded-xl border border-border bg-popover p-2 shadow-lg";

/** La misma columna, anclada a la derecha: la del micrófono. */
export const COLUMNA_DE_VOZ =
    "absolute bottom-full right-0 mb-2 z-50 flex flex-col items-center gap-1 rounded-xl border border-border bg-popover p-2 shadow-lg";

/** Un botón de la columna de herramientas (el «+» incluido). */
export const BOTON_DE_HERRAMIENTA = "h-8 w-8 rounded-full shrink-0 transition-colors";

/** Los botones redondos de la derecha, dentro de la caja. */
export const BOTON_REDONDO = "h-7 w-7 rounded-full shrink-0";

/** El de enviar: el azul con la flecha. */
export const BOTON_DE_ENVIAR = "bg-[#4F7FE8] hover:bg-[#426FD4]";

/** Un botón redondo en reposo (micrófono, dictado). */
export const BOTON_REDONDO_EN_REPOSO =
    "bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-700 dark:hover:bg-zinc-600";

/** Y grabando, que tiene que verse sin leer nada. */
export const BOTON_REDONDO_GRABANDO = "bg-red-500 hover:bg-red-600";
