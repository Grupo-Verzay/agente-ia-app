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
/**
 * El ancho mínimo de una pastilla CONTADORA, el mismo para las cinco. El
 * porqué y los números están en `PASTILLA_CONTADORA`, justo debajo.
 */
export const ANCHO_DE_LA_CONTADORA = "min-w-9";

/**
 * El mismo ancho, en píxeles, para quien tiene que CONTAR con él antes de que
 * exista el nodo: el reparto del renglón necesita saber lo que va a ocupar el
 * «+N» para decidir cuántas pastillas caben, y el «+N» es una contadora más.
 *
 * Los dos valores dicen lo mismo y tienen que seguir diciéndolo —`min-w-9` es
 * `2.25rem`, o sea 36 px con la raíz por defecto—, así que el banco lo
 * comprueba midiendo el «+N» pintado contra este número en vez de darlo por
 * bueno. Y no decide nada por su cuenta: en cuanto el «+N» existe se mide de
 * verdad, y cuando no existe es porque caben todas, que se contesta sin mirar
 * su ancho.
 */
export const ANCHO_DE_LA_CONTADORA_PX = 36;

/**
 * # Todas las contadoras miden LO MISMO
 *
 * Son cinco —flujos, seguimientos, la cita, las notas y las etiquetas— y hasta
 * ahora medían cinco anchos distintos. Medido en la columna de verdad, con la
 * misma fila:
 *
 * | pastilla                | antes      |
 * | ----------------------- | ---------- |
 * | notas (solo el candado) | **24,0**   |
 * | etiquetas «2»           | **31,7**   |
 * | recordatorios «3»       | 32,1       |
 * | cita                    | 34,0       |
 * | seguimientos «2»        | **34,9**   |
 *
 * La de etiquetas era de las más estrechas, y `rounded-full` sobre la más
 * estrecha del renglón es lo que se lee como «esa se ve más redonda que las
 * otras». Y no era solo el ancho: flujos y seguimientos iban con el relleno y
 * la letra de una pastilla de TEXTO —6 px por lado, número de 12— mientras las
 * demás llevaban los de una contadora —4 px, número de 10— y un punto de 8 px
 * donde las otras tienen un glifo de 12. Tres anatomías para la misma cosa.
 *
 * > **Una contadora es un glifo de 12, un hueco de 4 y un número de 10, con
 * > 4 px de relleno por lado; y su ancho mínimo es el mismo para todas.**
 *
 * `min-w-9` (36 px) no es un número elegido a ojo: es lo que mide la más ancha
 * del grupo con **dos cifras** —los recordatorios con «12», 35,5 px—, así que
 * de una cifra a dos ninguna cambia de ancho y las cinco salen exactamente
 * iguales. Con tres caracteres («99+») crece, y crece **igual en todas**,
 * porque la regla es una. El banco lo mide contra la pastilla de al lado en
 * vez de darlo por bueno.
 */
export const PASTILLA_CONTADORA = `${FORMA_DE_LA_PASTILLA} gap-1 border ${RELLENO_DE_PX_1_5} ${ANCHO_DE_LA_CONTADORA}`;

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

/**
 * La anatomía de una pastilla de TEXTO de la fila: la calificación del lead, la
 * etapa del embudo y el mando de asignar.
 *
 * Las tres llevan una palabra dentro y se leen seguidas, así que tienen que
 * medir la letra igual y respirar igual. La de asignar no lo hacía: iba con
 * `text-[10px]` y 2 px de relleno por lado —dos escalones por debajo de sus
 * vecinas— porque tenía que hacerle sitio a un icono de persona que no
 * informaba de nada. Sin el icono, la palabra se lee sola y la pastilla puede
 * ser una más.
 */
export const PASTILLA_DE_TEXTO = `${FORMA_DE_LA_PASTILLA} gap-1 border text-xs font-medium ${RELLENO_DE_PX_2}`;
