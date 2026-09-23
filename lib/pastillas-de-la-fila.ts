/**
 * El relleno horizontal de las pastillas de la fila de una tarjeta de Chats
 * (estado, asignación, contadores y etiquetas).
 *
 * La barra de desplazamiento de la lista se queda su ancho (10 px con barras
 * clásicas), y con ella «Descartado» + «Asignar» + tres contadores + etiquetas
 * no cabía en una línea a 1024. El ancho se recupera aquí: **cada pastilla
 * pierde 2 px de relleno por lado, la MISMA cantidad todas** (un escalón de
 * Tailwind, 0.5 = 2 px), así que ninguna queda más apretada que otra. El texto,
 * el alto, los colores y el orden no se tocan.
 *
 * Solo la fila de Chats: los mismos componentes se pintan en el CRM y en
 * `/sessions` con su relleno de siempre, por eso llegan con `compacta`.
 *
 * | antes    | en la fila |
 * | -------- | ---------- |
 * | `px-2`   | `px-1.5`   |
 * | `px-1.5` | `px-1`     |
 * | `px-1`   | `px-0.5`   |
 */
export const MENOS_RELLENO_POR_LADO_PX = 2;

/** `px-2` (8 px) en el resto de la plataforma; en la fila, 6 px. */
export const RELLENO_DE_PX_2 = "px-1.5";
/** `px-1.5` (6 px) en el resto de la plataforma; en la fila, 4 px. */
export const RELLENO_DE_PX_1_5 = "px-1";
/** `px-1` (4 px) en el resto de la plataforma; en la fila, 2 px. */
export const RELLENO_DE_PX_1 = "px-0.5";
