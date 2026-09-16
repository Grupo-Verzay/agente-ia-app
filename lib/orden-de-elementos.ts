/**
 * El orden de los elementos de un bloque: acciones, respuestas y, al final, la
 * nota interna.
 *
 * Un paso se ejecuta de arriba abajo. Si una acción —ejecutar un flujo, avisar
 * al asesor, leer una hoja— queda por debajo de la RESPUESTA, el modelo
 * responde primero y ejecuta después, que es lo mismo que no ejecutarla: la
 * respuesta ya salió sin el dato. Desde fuera no parece un error de orden,
 * parece que la acción "no funciona".
 *
 * Y era facilísimo de provocar: el menú insertaba SIEMPRE al final
 * (`[...elements, el]`), así que bastaba con escribir la respuesta antes de
 * agregar la acción. Nadie tiene por qué saber que el orden importa.
 *
 * Por eso el orden no se pide, se impone, y en un solo sitio: lo usan el menú
 * al insertar, el arrastre al soltar, las plantillas al aplicarse y los
 * builders al cargar. Con la regla escrita dos veces, tarde o temprano una de
 * las dos se queda corta.
 *
 * ## Son TRES niveles, no dos
 *
 * La **nota interna** no es una acción: no ejecuta nada y no aporta ningún dato
 * que la respuesta necesite. Es una instrucción sobre el paso, y su sitio es el
 * último, detrás de todas las respuestas. Se probó al revés —arriba, porque
 * `kind` es `"function"` y caía con las acciones— y el paso se lee del revés:
 * lo primero que aparece es un recuadro con candado que el cliente no va a ver
 * nunca, y la respuesta, que es de lo que trata el paso, queda debajo.
 *
 * El argumento de entonces —«el modelo tiene que haberla leído antes de
 * redactar»— no se sostiene: el prompt le llega entero de una vez, así que
 * estar tres líneas más arriba o más abajo no cambia lo que lee. Lo que sí
 * cambia es cómo se lee el paso en la pantalla.
 *
 * Los dos constructores de prompt escriben los elementos en el orden del
 * array, así que esto ordena las dos cosas a la vez y no hay dos órdenes que
 * mantener a la par.
 */

/** Acciones primero, respuestas después, la nota interna al final. */
function nivel(elemento: unknown): number {
    const el = elemento as { kind?: unknown; fn?: unknown } | null;
    // La nota se mira ANTES que el `kind`: es `kind: "function"`, así que
    // preguntando por el kind caería con las acciones, que es justo el fallo.
    if (el?.kind === "function" && el?.fn === "nota_interna") return 2;
    if (el?.kind === "text") return 1;
    // Un elemento legado —los que el esquema conserva tal cual, sin `kind`—
    // cuenta como acción: se queda arriba en vez de caer al final, que es lo
    // conservador con algo que no sabemos qué es.
    return 0;
}

/**
 * Cada cosa en su nivel, respetando el orden que ya tuviera dentro de cada uno.
 *
 * Devuelve **el mismo array** si ya estaba bien, para no obligar a React a
 * repintar ni a disparar un guardado por un cambio que no existe.
 */
export function ordenarElementos<T>(elementos: T[]): T[] {
    let anterior = 0;
    let yaEstaBien = true;

    for (const el of elementos) {
        const n = nivel(el);
        if (n < anterior) {
            yaEstaBien = false;
            break;
        }
        anterior = n;
    }

    if (yaEstaBien) return elementos;

    return [
        ...elementos.filter((el) => nivel(el) === 0),
        ...elementos.filter((el) => nivel(el) === 1),
        ...elementos.filter((el) => nivel(el) === 2),
    ];
}

/**
 * Dónde entra un elemento nuevo.
 *
 * Delante del primero que esté en un nivel más abajo que el suyo: una acción
 * entra detrás de la última acción, una respuesta detrás de la última
 * respuesta —pero por encima de la nota—, y la nota siempre al final. Nunca
 * depende de en qué orden se pulsaron los botones.
 */
export function insertarElementoEnOrden<T>(elementos: T[], nuevo: T): T[] {
    const suyo = nivel(nuevo);
    const corte = elementos.findIndex((el) => nivel(el) > suyo);
    if (corte === -1) return [...elementos, nuevo];

    return [...elementos.slice(0, corte), nuevo, ...elementos.slice(corte)];
}

/**
 * Lo mismo para una lista de pasos ya guardados.
 *
 * Se llama al cargar cada builder, así que un bloque que hoy tenga la acción
 * debajo —o la nota arriba— se endereza solo al abrirlo, y no hace falta
 * ninguna migración. Devuelve los mismos objetos cuando no hay nada que mover:
 * el autosave compara por contenido y así no escribe una versión nueva por el
 * simple hecho de abrir la pantalla.
 */
export function ordenarElementosDeLosPasos<T extends { elements?: unknown[] }>(pasos: T[]): T[] {
    let cambio = false;

    const ordenados = pasos.map((paso) => {
        const elementos = paso.elements;
        if (!Array.isArray(elementos)) return paso;

        const nuevos = ordenarElementos(elementos);
        if (nuevos === elementos) return paso;

        cambio = true;
        return { ...paso, elements: nuevos };
    });

    return cambio ? ordenados : pasos;
}
