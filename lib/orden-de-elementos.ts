/**
 * El orden de los elementos de un bloque: primero las acciones, después el texto.
 *
 * Un paso se ejecuta de arriba abajo. Si una acción —ejecutar un flujo, avisar
 * al asesor, leer una hoja— queda por debajo del REGLA/PARÁMETRO, el modelo
 * responde primero y ejecuta después, que es lo mismo que no ejecutarla: la
 * respuesta ya salió sin el dato. Desde fuera no parece un error de orden,
 * parece que la acción "no funciona".
 *
 * Y era facilísimo de provocar: el menú insertaba SIEMPRE al final
 * (`[...elements, el]`), así que bastaba con escribir la regla antes de agregar
 * la acción. Nadie tiene por qué saber que el orden importa.
 *
 * Por eso el orden no se pide, se impone, y en un solo sitio: lo usan el menú
 * al insertar, el arrastre al soltar, las plantillas al aplicarse y los
 * builders al cargar. Con la regla escrita dos veces, tarde o temprano una de
 * las dos se queda corta.
 */

/** Lo único que va detrás es el texto que el cliente recibe. */
function esTexto(elemento: unknown): boolean {
    return (elemento as { kind?: unknown } | null)?.kind === "text";
}

/**
 * Las acciones arriba, los textos abajo, respetando el orden que ya tuvieran
 * dentro de cada grupo.
 *
 * Devuelve **el mismo array** si ya estaba bien, para no obligar a React a
 * repintar ni a disparar un guardado por un cambio que no existe.
 *
 * Un elemento legado —los que el esquema conserva tal cual, sin `kind`— cuenta
 * como acción: se queda donde está en vez de caer al final, que es lo
 * conservador con algo que no sabemos qué es.
 */
export function ordenarElementos<T>(elementos: T[]): T[] {
    const primerTexto = elementos.findIndex(esTexto);
    if (primerTexto === -1) return elementos;

    const hayAccionDebajo = elementos.slice(primerTexto + 1).some((el) => !esTexto(el));
    if (!hayAccionDebajo) return elementos;

    return [...elementos.filter((el) => !esTexto(el)), ...elementos.filter(esTexto)];
}

/**
 * Dónde entra un elemento nuevo.
 *
 * Una acción entra detrás de la última acción —antes del primer texto—; un
 * texto, al final. Nunca depende de en qué orden se pulsaron los botones.
 */
export function insertarElementoEnOrden<T>(elementos: T[], nuevo: T): T[] {
    if (esTexto(nuevo)) return [...elementos, nuevo];

    const primerTexto = elementos.findIndex(esTexto);
    if (primerTexto === -1) return [...elementos, nuevo];

    return [...elementos.slice(0, primerTexto), nuevo, ...elementos.slice(primerTexto)];
}

/**
 * Lo mismo para una lista de pasos ya guardados.
 *
 * Se llama al cargar cada builder, así que un bloque que hoy tenga la acción
 * debajo se endereza solo al abrirlo. Devuelve los mismos objetos cuando no hay
 * nada que mover: el autosave compara por contenido y así no escribe una
 * versión nueva por el simple hecho de abrir la pantalla.
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
