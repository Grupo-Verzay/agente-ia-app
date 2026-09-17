/**
 * El título corto de una tarea, y qué se enseña cuando no hay ninguno.
 *
 * Puro a propósito: lo usan la tarjeta del tablero (cliente) y las acciones
 * (servidor), y así se puede probar entero sin levantar nada.
 *
 * ## Por qué `tasks.title` es el TÍTULO y el detalle se va aparte
 *
 * Hasta ahora `title` guardaba el texto largo —lo que se pega ahí son varias
 * líneas, «Empresa: … Fecha: … Tarea: …»— y la tarjeta lo recortaba a dos
 * líneas, así que no se entendía a golpe de vista.
 *
 * La solución NO puede ser una columna nueva en `tasks`: esa tabla es del
 * BACKEND y añadirle columnas desde la App es lo que reventó el #360. Y entre
 * las dos formas que quedan, se elige la que arregla el fallo en todas partes:
 *
 * - **Lo que se hizo:** `title` pasa a ser el título corto y el texto largo se
 *   va a `task_details`, tabla nuestra. `title` es el campo que ya enseñan
 *   `/tareas`, la campanita, los avisos de tarea y los recordatorios, así que
 *   todas esas pantallas mejoran solas.
 * - **Lo que se descartó:** el título corto en la tabla lateral y el ladrillo
 *   en `title`. Habría arreglado la tarjeta y **dejado el ladrillo en todas
 *   las demás pantallas**, que es justo el fallo del que venimos.
 *
 * ## Y las tareas que ya existen
 *
 * Su `title` trae el texto largo, porque nacieron antes de esto. **No se toca
 * ni una fila**: la tarjeta enseña su PRIMERA LÍNEA, que ya se lee mucho mejor
 * que dos líneas recortadas de un ladrillo, y el texto entero sigue estando al
 * abrirla. En cuanto alguien la edite, le pone su título y queda como las
 * nuevas.
 *
 * Un backfill —cortar la primera línea a `title` y mover el resto— queda
 * descartado a propósito mientras nadie lo pida: es un `UPDATE` masivo sobre
 * una tabla del backend, reescribe datos reales de clientes y no se deshace.
 */

/** Lo que cabe en un título corto. Por encima, el texto va en el detalle. */
export const TOPE_DE_TITULO = 120;

/** Lo que cabe en el detalle. Generoso: ahí es donde se pega el ladrillo. */
export const TOPE_DE_DETALLE = 20_000;

/**
 * La primera línea con algo escrito, o cadena vacía.
 *
 * Se salta las líneas en blanco de arriba a propósito: un texto pegado suele
 * empezar con un salto, y devolver «» dejaría la tarjeta muda teniendo texto.
 */
export function primeraLinea(texto: string | null | undefined): string {
    if (!texto) return "";
    for (const linea of texto.split(/\r?\n/)) {
        const limpia = linea.trim();
        if (limpia) return limpia;
    }
    return "";
}

/**
 * Lo que se pinta en la tarjeta del tablero.
 *
 * **Una sola regla, sin mirar si la tarea es nueva o vieja.** En una nueva el
 * título ya es corto y de una línea, así que esto lo devuelve tal cual; en una
 * vieja corta el ladrillo por su primera línea. Preguntar antes «¿tiene
 * detalle?» sería una rama que solo se ejerce con datos viejos — la que nadie
 * prueba y la que se rompe.
 */
export function tituloDeLaTarjeta(title: string | null | undefined): string {
    return primeraLinea(title);
}

/**
 * El título tal y como se guarda: de una línea, sin bordes y acotado.
 *
 * Los saltos de línea se aplastan en vez de cortarse ahí: quien pega un texto
 * de varias líneas en el título quiere que se vea entero, no perder todo lo que
 * venía después del primer `Enter` sin que nadie se lo diga.
 */
export function limpiarTitulo(texto: string | null | undefined): string {
    return (texto ?? "")
        .replace(/[\r\n]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, TOPE_DE_TITULO);
}

/** El detalle tal y como se guarda. Vacío es «no hay detalle», no una cadena. */
export function limpiarDetalle(texto: string | null | undefined): string | null {
    const limpio = (texto ?? "").trim().slice(0, TOPE_DE_DETALLE);
    return limpio || null;
}

/**
 * El texto completo, para el tooltip de la tarjeta y para buscar.
 *
 * Con las dos partes: en una tarea vieja el detalle no existe y esto devuelve
 * lo de siempre, así que el tooltip sigue diciendo exactamente lo que decía.
 */
export function textoCompletoDeLaTarea(
    title: string | null | undefined,
    detalle: string | null | undefined,
): string {
    const arriba = (title ?? "").trim();
    const abajo = (detalle ?? "").trim();
    if (!abajo) return arriba;
    if (!arriba) return abajo;
    return `${arriba}\n\n${abajo}`;
}
