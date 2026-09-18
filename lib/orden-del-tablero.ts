/**
 * El orden de las tarjetas DENTRO de una columna, en los dos tableros que hay:
 * el de un proyecto y el de tickets.
 *
 * Puro a propósito: entra una lista y un mapa de posiciones, y sale la columna
 * colocada. Así se prueba entero sin levantar nada, que es lo que hace falta
 * para las trampas de esto —que no se ven mirando la pantalla— y que están
 * explicadas una por una más abajo.
 *
 * ## Por qué la llave es el TABLERO y no la cuenta
 *
 * Y aquí está la diferencia con `lib/orden-de-las-tarjetas.ts`, que es la
 * rejilla de Proyectos y Diagramas. Allí la posición es de la pareja **cuenta +
 * cosa**, porque un proyecto compartido sale en las dos pantallas y cada cuenta
 * lo coloca donde quiera.
 *
 * Aquí es al revés: un proyecto compartido es **UN tablero** que abren las dos
 * cuentas, con las mismas tarjetas —«un proyecto, un juego de tareas»—. Con la
 * cuenta en la llave, la dueña y la invitada verían el mismo tablero ordenado
 * de dos maneras distintas, que es justo lo contrario de «el orden es del
 * tablero, igual para todo el equipo».
 *
 * ## El número es del TABLERO; la comparación, de la COLUMNA
 *
 * Cada tarjeta guarda un entero y **solo se compara con las de su columna**.
 * Eso deja «entrar al final» en una sola cuenta y sin saber nada de columnas:
 * `máximo del tablero + 1` es, por definición, mayor que el máximo de
 * cualquiera de sus columnas. Lo usan las tres puertas por las que una tarjeta
 * llega a una columna: crearla, moverla de columna y —en tickets— abrirla.
 */

/** id de la tarjeta → su posición. Lo que no esté aquí no se ha colocado nunca. */
export type PosicionesDelTablero = Record<string, number>;

/** Los dos tableros que tienen esto. La lista es cerrada a propósito. */
export const TIPOS_DE_TABLERO = ["proyecto", "tickets"] as const;
export type TipoDeTablero = (typeof TIPOS_DE_TABLERO)[number];

/**
 * Lo que llega de fuera pasa por la lista, en el servidor. Un tipo inventado
 * escribiría filas que ningún tablero lee y que nadie sabría de dónde salieron.
 */
export function comoTipoDeTablero(valor: unknown): TipoDeTablero | null {
    const texto = String(valor ?? "").trim();
    return (TIPOS_DE_TABLERO as readonly string[]).includes(texto)
        ? (texto as TipoDeTablero)
        : null;
}

/** Cuántas tarjetas se guardan de una vez. Una columna no tiene más. */
export const TOPE_DE_TARJETAS_DE_COLUMNA = 1000;

/**
 * La columna colocada.
 *
 * **Lo que NO tiene posición va PRIMERO**, en el orden en que llegó, y detrás
 * lo colocado a mano. Suena al revés y es lo que hace falta:
 *
 * - Una columna que nadie ha tocado **no tiene ni una posición guardada**, así
 *   que sale exactamente como salía antes. Esto no cambió ningún tablero hasta
 *   que alguien arrastró la primera tarjeta.
 * - Y una tarjeta **nueva SÍ trae posición** —se la pone quien la crea, con el
 *   máximo del tablero más uno—, así que cae en el grupo de las colocadas y
 *   queda la última de su columna. Que es el encargo: nunca arriba, para no
 *   pisar el orden que puso una persona a mano.
 *
 * Entre dos colocadas manda el número; si dos comparten número —no debería,
 * pero una fila a mano puede—, se queda el orden de llegada en vez de decidirlo
 * el azar del `sort`.
 */
export function ordenarLaColumna<T>(
    tarjetas: T[],
    posiciones: PosicionesDelTablero,
    idDe: (t: T) => string,
): T[] {
    const sinColocar: T[] = [];
    const colocadas: Array<{ t: T; pos: number; llegada: number }> = [];

    tarjetas.forEach((t, llegada) => {
        const pos = posiciones[idDe(t)];
        if (typeof pos === "number" && Number.isFinite(pos)) colocadas.push({ t, pos, llegada });
        else sinColocar.push(t);
    });

    colocadas.sort((a, b) => (a.pos === b.pos ? a.llegada - b.llegada : a.pos - b.pos));
    return [...sinColocar, ...colocadas.map((c) => c.t)];
}

/**
 * Mover una tarjeta encima de otra, dentro de la misma columna.
 *
 * Se calcula sobre la columna **entera y ya ordenada**, que es lo que se acaba
 * de pintar. Devuelve la lista nueva; si alguna de las dos no está, se devuelve
 * igual: mejor que no pase nada a colocarla en un sitio inventado.
 */
export function moverEnLaColumna(
    idsDeLaColumna: string[],
    arrastrada: string,
    soltadaSobre: string,
): string[] {
    if (arrastrada === soltadaSobre) return idsDeLaColumna;

    const desde = idsDeLaColumna.indexOf(arrastrada);
    const hasta = idsDeLaColumna.indexOf(soltadaSobre);
    if (desde < 0 || hasta < 0) return idsDeLaColumna;

    const copia = [...idsDeLaColumna];
    copia.splice(desde, 1);
    copia.splice(hasta, 0, arrastrada);
    return copia;
}

/**
 * La tarjeta que se está arrastrando, buscada **por su id**.
 *
 * # Por qué por el id y no por un objeto colgado del arrastre
 *
 * Antes viajaba en `data.current` (`useDraggable({ id, data: { task } })`), y
 * al pasar la tarjeta a `useSortable` ese `data` se quedó por el camino. Los
 * dos tableros seguían leyéndolo, así que **dejaron de moverse las tarjetas en
 * los dos** —ni cambiar de columna ni reordenar— y **sin un solo error**: el
 * manejador se iba por su `if (!task) return` antes de llegar a decidir nada.
 *
 * El `id` es el único canal que no se puede perder: sin él dnd-kit no arrastra.
 * Un segundo canal que solo sirve para transportar es lo que un refactor se
 * deja, y su pérdida no la nota nadie hasta que alguien lo prueba en pantalla.
 *
 * Se compara **como texto en los dos lados**: en Proyectos el id de la tarea es
 * un número y el de dnd-kit siempre llega como cadena, así que `===` en crudo
 * no casaría nunca — y sería este mismo fallo otra vez, igual de mudo.
 */
export function laTarjetaArrastrada<T>(
    idArrastrado: string | number,
    tarjetas: T[],
    idDe: (t: T) => string | number,
): T | null {
    const buscado = String(idArrastrado ?? "").trim();
    if (!buscado) return null;
    return tarjetas.find((t) => String(idDe(t)) === buscado) ?? null;
}

/**
 * Qué significa haber soltado una tarjeta. Es lo único que los dos tableros
 * tienen que decidir, y se decide aquí para que decidan igual.
 */
export type ResultadoDelArrastre =
    | { que: "nada" }
    | { que: "otra-columna"; columna: string }
    | { que: "reordenar"; columna: string; ids: string[] };

/**
 * `over.id` de dnd-kit es **o una columna o una tarjeta**, y de ahí salen los
 * tres casos. Las reglas, en el orden en que se aplican:
 *
 * 1. **Soltada sobre una columna** —el hueco vacío de abajo—: si es la suya, no
 *    pasa nada; si es otra, cambia de columna.
 * 2. **Soltada sobre una tarjeta de OTRA columna**: cambia de columna, y entra
 *    **al final**, no en el sitio donde se soltó. Es lo pedido, y además evita
 *    la pregunta imposible: el orden de la columna de destino lo puso alguien a
 *    mano y meterse en mitad de él sin querer sería pisarlo.
 * 3. **Soltada sobre una tarjeta de la SUYA**: se reordena. Si el resultado es
 *    el mismo que había —soltarla donde estaba—, no pasa nada: sin eso, cada
 *    pulsación con un temblor escribiría una vuelta al servidor.
 */
export function resolverElArrastre(args: {
    arrastrada: string;
    soltadaSobre: string;
    columnaDeLaArrastrada: string;
    columnas: readonly string[];
    /** Los ids de cada columna, en el orden en que están pintados. */
    idsPorColumna: Record<string, string[]>;
}): ResultadoDelArrastre {
    const { arrastrada, soltadaSobre, columnaDeLaArrastrada, columnas, idsPorColumna } = args;
    if (!arrastrada || !soltadaSobre || arrastrada === soltadaSobre) return { que: "nada" };

    if (columnas.includes(soltadaSobre)) {
        return soltadaSobre === columnaDeLaArrastrada
            ? { que: "nada" }
            : { que: "otra-columna", columna: soltadaSobre };
    }

    const columnaDestino = columnas.find((c) => (idsPorColumna[c] ?? []).includes(soltadaSobre));
    // Soltada sobre algo que no está en ninguna columna: no se inventa un sitio.
    if (!columnaDestino) return { que: "nada" };
    if (columnaDestino !== columnaDeLaArrastrada) {
        return { que: "otra-columna", columna: columnaDestino };
    }

    const actuales = idsPorColumna[columnaDestino] ?? [];
    const nuevos = moverEnLaColumna(actuales, arrastrada, soltadaSobre);
    if (nuevos === actuales) return { que: "nada" };
    return { que: "reordenar", columna: columnaDestino, ids: nuevos };
}

/**
 * De una lista de ids al mapa que se guarda: `0, 1, 2…`
 *
 * **Se escribe la columna ENTERA**, no solo la tarjeta que se movió. Guardando
 * una sola posición habría que hacerle sitio corriendo a las demás, y dos
 * administradores moviendo a la vez dejarían la columna con dos tarjetas en el
 * mismo hueco o con un salto. Con la columna entera cada escritura es una foto
 * completa y coherente: gana la última, pero **gana entera**, que es lo que
 * garantiza que el resultado sea el orden que vio alguien y no una mezcla de
 * dos que no eligió nadie.
 *
 * Los ids repetidos se descartan: dos veces la misma fila en un mismo `INSERT`
 * y Postgres rechaza el comando entero.
 */
export function posicionesDeLaColumna(ids: string[]): Array<{ id: string; orden: number }> {
    const vistos = new Set<string>();
    const limpios: string[] = [];
    for (const id of ids) {
        const texto = String(id ?? "").trim();
        if (!texto || vistos.has(texto)) continue;
        vistos.add(texto);
        limpios.push(texto);
    }
    return limpios.slice(0, TOPE_DE_TARJETAS_DE_COLUMNA).map((id, orden) => ({ id, orden }));
}
