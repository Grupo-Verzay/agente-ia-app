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

/**
 * # La FORMA de toda pastilla de la fila
 *
 * Una pastilla de esta fila es `rounded-full` y mide 24 px de alto. Con el
 * ancho libre, la que lleva poco dentro —el avatar de dos iniciales, un «+1»—
 * sale **más estrecha que alta**, y `rounded-full` sobre una caja así no es
 * una pastilla: es un **óvalo de pie**. Medido en la fila de Chats antes de
 * esto: el círculo del asesor **20,9 × 24** y el «+N» **18 × 24**, al lado de
 * pastillas de 42 y 87 px de ancho. Desde fuera no se lee como un ancho: se
 * lee como una fila descuadrada.
 *
 * El suelo es el propio alto (`min-w-6`): en su forma más estrecha una
 * pastilla es un **círculo**, nunca un óvalo. Y `justify-center`, que es lo que
 * centra el contenido cuando ese suelo entra en juego; con el contenido más
 * ancho no hace nada.
 *
 * **Se escribe una vez.** Con las medidas a mano en cada componente vuelve a
 * pasar lo de siempre: una queda un par de píxeles distinta de la de al lado y
 * nadie sabe por qué.
 */
export const FORMA_DE_LA_PASTILLA =
    "inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full";

/**
 * La anatomía de una pastilla CONTADORA: un icono y un número.
 *
 * Son cuatro y tienen que verse iguales —la espera de un asesor, los
 * recordatorios, las etiquetas y el «+N» de lo que no cupo—. Lo único suyo es
 * el color, que cada una pone con sus clases literales (Tailwind solo genera
 * lo que ve escrito, así que un tono compuesto en tiempo de ejecución no
 * existiría en el CSS).
 */
export const PASTILLA_CONTADORA = `${FORMA_DE_LA_PASTILLA} gap-1 border ${RELLENO_DE_PX_1_5}`;

/** El icono de una pastilla contadora. */
export const GLIFO_DE_LA_PASTILLA = "h-3 w-3 shrink-0";

/**
 * Su número. `tabular-nums` para que 1 y 7 midan lo mismo: sin él la pastilla
 * cambia de ancho al subir el contador y la fila se mueve sola.
 */
export const NUMERO_DE_LA_PASTILLA = "text-[10px] font-bold leading-none tabular-nums";

/**
 * El avatar del asesor en la fila: un CÍRCULO de verdad, no una pastilla.
 *
 * Fuera de la fila ya era `h-7 w-7` —redondo—; aquí iba `h-6` con relleno y
 * sin ancho, así que dos iniciales de 10 px dejaban una caja de 20,9 × 24. El
 * ancho es el alto y el relleno sobra: las iniciales son dos caracteres como
 * mucho (`initials`) y caben de sobra en 24 px.
 */
export const CIRCULO_DEL_ASESOR = "h-6 w-6";
