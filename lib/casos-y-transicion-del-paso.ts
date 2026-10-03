/**
 * «Agregar caso» y «Agregar transición» de un paso del entrenamiento: cómo se
 * escriben en el prompt.
 *
 * Los dos son elementos del paso (`fn: "caso"` y `fn: "transicion"`), con los
 * campos de `CAMPOS_DEL_CASO` y `CAMPO_DE_LA_TRANSICION` —Escenario y
 * Respuesta; el paso al que se pasa—, y lo que inyectan dentro del bloque del paso es exactamente:
 *
 *     | Caso | Detección | Acción |
 *     |---|---|---|
 *     | A | <Escenario> | → <Respuesta> |
 *
 *     Si lo que dice el cliente no coincide con ningún Escenario declarado en
 *     la tabla, el agente repite el texto principal del paso y espera, sin
 *     inventar caso.
 *
 * y, al final del bloque:
 *
 *     ➡️ TRANSICIÓN: Completados los datos de este paso → `current_step = N`.
 *     Esperar respuesta del cliente antes de ejecutar el paso siguiente.
 *
 * ## Por qué vive aquí y no dentro del constructor
 *
 * Los constructores del prompt son DOS —`markdownBuilder` y
 * `buildSectionedPrompt`— y tienen que escribir lo mismo (la regla de la nota
 * interna). Con la tabla redactada en cada uno, el día que se afine una el
 * otro se queda atrás y el mismo paso se comporta distinto según por dónde se
 * armó el prompt. Es puro: entran elementos y salen líneas.
 *
 * ## Varios casos son UNA tabla
 *
 * Cada «Agregar caso» es una fila. La tabla se escribe una sola vez, donde
 * está el primer caso, con las letras en el orden en que se agregaron (A, B,
 * C…). Ese orden es el de evaluación: aplica el PRIMERO cuyo Escenario
 * coincida, y si ninguno coincide el agente repite el texto principal y
 * espera (`FRASE_SIN_CASO`).
 * Una tabla por caso serían tres tablas de una fila y tres frases de respaldo.
 *
 * ## La transición sin destino es el paso siguiente
 *
 * Igual que la plantilla «Ejecutar paso» (ruta por defecto `N+1`). En el
 * último paso no hay siguiente, así que sin destino no se escribe nada:
 * mandar al modelo a un paso que no existe es peor que no decir nada.
 *
 * ## Fuera de Inicio, la transición va a un paso de INICIO
 *
 * En Preguntas, Productos y Extras `current_step` sigue siendo un paso del
 * flujo de Inicio, así que el destino se busca en `pasosDelInicio` y NO hay
 * «siguiente»: una pregunta no tiene paso N+1. Sin destino, o con uno que ya
 * no existe en Inicio, no se escribe nada.
 */

/** Cómo se resuelve la transición: entre los pasos del bloque, o en Inicio. */
export type OpcionesDeLaTransicion = {
    /** Los pasos de Inicio, cuando el bloque NO es un paso de Inicio. */
    pasosDelInicio?: ReadonlyArray<unknown>;
};

export type ElementoCaso = {
    id: string;
    kind: "function";
    fn: "caso";
    escenario?: string | null;
    respuesta?: string | null;
};

export type ElementoTransicion = {
    id: string;
    kind: "function";
    fn: "transicion";
    /** El `id` del paso al que se pasa. `null` = el siguiente. */
    destino?: string | null;
};

export const FRASE_SIN_CASO =
    "Si lo que dice el cliente no coincide con ningún Escenario declarado en la tabla, el agente repite el texto principal del paso y espera, sin inventar caso.";

/**
 * Con DOS o más casos, el orden manda: se evalúan en el orden en que se
 * agregaron (A, B, C…) y aplica el primero que coincida. Con uno solo la
 * frase sobra, así que no se escribe y la tabla queda exactamente como el
 * formato pedido.
 */
export const FRASE_DEL_ORDEN =
    "Los casos se evalúan en el orden de la tabla (A, B, C…): aplica el primero cuyo Escenario coincida con lo dicho por el cliente; los siguientes no se evalúan.";

export function esCaso(el: unknown): el is ElementoCaso {
    const e = el as { kind?: unknown; fn?: unknown } | null;
    return e?.kind === "function" && e?.fn === "caso";
}

export function esTransicion(el: unknown): el is ElementoTransicion {
    const e = el as { kind?: unknown; fn?: unknown } | null;
    return e?.kind === "function" && e?.fn === "transicion";
}

/** A, B, … Z, AA, AB… */
export function letraDelCaso(i: number): string {
    let n = i;
    let s = "";
    do {
        s = String.fromCharCode(65 + (n % 26)) + s;
        n = Math.floor(n / 26) - 1;
    } while (n >= 0);
    return s;
}

/** Una celda no puede romper la tabla: sin `|` sueltos ni saltos de línea. */
function celda(s?: string | null): string {
    return (s ?? "").replace(/\r?\n+/g, " ").replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();
}

/**
 * La tabla de los casos y su frase de respaldo, o `null` si no hay ninguno
 * escrito. Un caso con los dos campos vacíos no es una fila.
 */
export function tablaDeCasos(casos: ReadonlyArray<{ escenario?: string | null; respuesta?: string | null }>): string | null {
    const filas = casos
        .map((c) => ({ escenario: celda(c.escenario), respuesta: celda(c.respuesta) }))
        .filter((c) => c.escenario || c.respuesta);
    if (filas.length === 0) return null;

    return [
        "| Caso | Detección | Acción |",
        "|---|---|---|",
        ...filas.map((f, i) => `| ${letraDelCaso(i)} | ${f.escenario} | → ${f.respuesta} |`),
        "",
        ...(filas.length > 1 ? [FRASE_DEL_ORDEN, ""] : []),
        FRASE_SIN_CASO,
    ].join("\n");
}

/**
 * El número del paso al que se pasa: el elegido si existe y no es el propio;
 * si no, el siguiente. `null` cuando no hay a dónde ir (último paso sin
 * destino).
 */
export function elPasoDeDestino(
    pasos: ReadonlyArray<unknown>,
    indice: number,
    destino?: string | null,
): number | null {
    if (destino) {
        const i = pasos.findIndex((p) => (p as { id?: unknown } | null)?.id === destino);
        if (i !== -1 && i !== indice) return i + 1;
    }
    return indice + 1 < pasos.length ? indice + 2 : null;
}

/** El número del paso de Inicio al que se pasa, o `null` (sin «siguiente»). */
export function elPasoDelInicio(pasosDelInicio: ReadonlyArray<unknown>, destino?: string | null): number | null {
    if (!destino) return null;
    const i = pasosDelInicio.findIndex((p) => (p as { id?: unknown } | null)?.id === destino);
    return i === -1 ? null : i + 1;
}

function elDestino(
    pasos: ReadonlyArray<unknown>,
    indice: number,
    destino: string | null | undefined,
    op?: OpcionesDeLaTransicion,
): number | null {
    return op?.pasosDelInicio ? elPasoDelInicio(op.pasosDelInicio, destino) : elPasoDeDestino(pasos, indice, destino);
}

export function lineaDeTransicion(paso: number): string {
    return `➡️ TRANSICIÓN: Completados los datos de este paso → \`current_step = ${paso}\`. Esperar respuesta del cliente antes de ejecutar el paso siguiente.`;
}

/** ¿Escribe algo este paso por sus casos o su transición? */
export function escribeCasosOTransicion(
    elementos: ReadonlyArray<unknown>,
    pasos: ReadonlyArray<unknown>,
    indice: number,
    op?: OpcionesDeLaTransicion,
): boolean {
    if (tablaDeCasos(elementos.filter(esCaso)) !== null) return true;
    const t = (elementos as ReadonlyArray<unknown>).find(esTransicion);
    return !!t && elDestino(pasos, indice, t.destino, op) !== null;
}

/**
 * Las líneas de los elementos de un paso, con los casos y la transición en su
 * sitio. `normal` escribe cualquier otro elemento con su número; el número
 * cuenta solo esos, así que un prompt sin casos ni transición sale idéntico
 * al de siempre.
 */
export function lineasDelPaso<E>(
    elementos: ReadonlyArray<E>,
    pasos: ReadonlyArray<unknown>,
    indice: number,
    normal: (el: E, k: number) => string[],
    op?: OpcionesDeLaTransicion,
): string[] {
    const out: string[] = [];
    const tabla = tablaDeCasos((elementos as ReadonlyArray<unknown>).filter(esCaso));
    let tablaPuesta = false;
    let k = 0;

    for (const el of elementos) {
        if (esCaso(el)) {
            if (!tablaPuesta && tabla) out.push(tabla);
            tablaPuesta = true;
            continue;
        }
        if (esTransicion(el)) continue;
        k += 1;
        out.push(...normal(el, k));
    }

    const t = (elementos as ReadonlyArray<unknown>).find(esTransicion);
    if (t) {
        const destino = elDestino(pasos, indice, t.destino, op);
        if (destino !== null) out.push(lineaDeTransicion(destino));
    }
    return out;
}

// ── Los campos de las dos tarjetas del editor ──────────────────────────────
// Vivían en `lib/maqueta-del-paso.ts`, con la maqueta que se publicó en
// `/ia/maqueta`. La maqueta se quitó: las maquetas se enseñan en el hilo,
// nunca en el dominio real. Los rótulos son los de las tarjetas de verdad.

/** Los campos de la tarjeta «Caso». */
export const CAMPOS_DEL_CASO = {
    titulo: "CASO",
    escenario: { rotulo: "Escenario", placeholder: "¿Cuándo aplica este caso?" },
    respuesta: { rotulo: "Respuesta", placeholder: "El texto que se envía si este caso aplica" },
} as const;

/** El campo de la tarjeta «Transición». */
export const CAMPO_DE_LA_TRANSICION = {
    titulo: "TRANSICIÓN",
    pregunta: "¿A qué paso pasa cuando se completen los datos de este paso?",
    vacio: "Elegir paso…",
    ayuda: "Si no eliges ninguno, pasa al paso siguiente.",
    /** En Preguntas, Productos y Extras: el destino es un paso de Inicio y no hay «siguiente». */
    preguntaFueraDeInicio: "¿A qué paso de Inicio pasa la conversación después de esto?",
    ayudaFueraDeInicio: "Elige un paso de Inicio. Si no eliges ninguno, no se agrega transición.",
} as const;

/**
 * Los pasos que ofrece la lista de la transición: los ya creados, por su
 * nombre y en su orden, menos el propio (pasar a sí mismo no es avanzar). Un
 * paso sin título se nombra por su número para que se pueda elegir igual.
 */
export function pasosParaLaTransicion(
    pasos: ReadonlyArray<{ id: string; titulo?: string | null }>,
    actual: string,
): Array<{ id: string; nombre: string }> {
    return pasos
        .map((p, i) => ({ id: p.id, nombre: (p.titulo ?? "").trim() || `Paso ${i + 1}` }))
        .filter((p) => p.id !== actual);
}
