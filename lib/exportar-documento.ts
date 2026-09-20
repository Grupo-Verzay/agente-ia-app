/**
 * Un documento, en texto: markdown o plano. **Puro**, así que se prueba sin
 * levantar nada y lo pueden llamar la pantalla y el servidor.
 *
 * ## Por qué vive aquí y no en cada pantalla
 *
 * El walker de tiptap a markdown lo escribió Notas dentro de su editor
 * (`NotesEditor.extractMarkdown`) y Documentación necesitaba exactamente el
 * mismo —las dos pantallas usan `components/shared/EditorDeTexto.tsx`, o sea el
 * MISMO editor y el mismo JSON—. Copiarlo habría sido la segunda versión de una
 * cosa que ya existía: el día que se afine cómo sale una lista de tareas se
 * afina en una y la otra se queda atrás, y eso no se ve como un error sino como
 * «en Notas el .md sale distinto».
 *
 * ## Lo que este módulo sabe y el de Notas no sabía
 *
 * 1. **El nodo `mencion`.** Documentación mete clientes, tareas y tickets
 *    dentro del texto. Sin tratarlo, `node.content` está vacío y la mención
 *    **desaparecía del fichero exportado** sin decir nada — que es peor que
 *    salir fea: el documento exportado diría algo distinto del que se lee.
 * 2. **Las listas.** Un documento de tipo `lista` no tiene cuerpo: tiene filas
 *    en `doc_filas`. Exportar su `contenido` daría un fichero vacío, así que
 *    salen como una **tabla de markdown**, que es lo que un `.md` sabe pintar.
 *
 * ## El texto plano no es un markdown a medias
 *
 * Se genera del mismo árbol con las marcas apagadas, no quitándole los
 * asteriscos al markdown: un `**` dentro de un bloque de código es código y no
 * una marca, y a un reemplazo de texto le da igual.
 */

/* ───────────────────────────── El árbol del editor ──────────────────────── */

type Nodo = {
    type?: unknown;
    text?: unknown;
    attrs?: Record<string, unknown> | null;
    marks?: Array<{ type?: unknown }> | null;
    content?: unknown;
};

/** El nodo de mención de Documentación. Mismo nombre que `NODO_DE_MENCION`. */
const MENCION = "mencion";

/**
 * Tope de nodos que se recorren.
 *
 * El contenido llega **del navegador**, así que su forma no es de fiar. Es el
 * mismo presupuesto que `leerElContenido` y por el mismo motivo: un JSON hondo
 * no puede colgar la pestaña de quien pulsa «Exportar».
 */
export const TOPE_DE_NODOS_AL_EXPORTAR = 200_000;

function comoNodos(valor: unknown): Nodo[] {
    return Array.isArray(valor) ? (valor as Nodo[]) : [];
}

function laEtiquetaDeLaMencion(attrs: Record<string, unknown> | null | undefined): string {
    const etiqueta = String(attrs?.etiqueta ?? "").trim();
    // Sin etiqueta guardada queda el id, que al menos dice que ahí había algo.
    return etiqueta || String(attrs?.refId ?? "").trim();
}

/**
 * El cuerpo del editor como texto.
 *
 * `conMarcas` decide si se escriben `**`, `*` y `` ` ``: es la única diferencia
 * entre el `.md` y el `.txt`, y por eso son **una función con un interruptor** y
 * no dos recorridos que haya que mantener a la par.
 */
export function cuerpoComoTexto(contenido: unknown, conMarcas: boolean): string {
    const raiz = contenido as Nodo | null | undefined;
    const primeros = comoNodos(raiz?.content);
    if (primeros.length === 0) return "";

    /** Una hoja: no se le piden hijos. */
    const esAtomo = (nodo: Nodo) => nodo.type === "text" || nodo.type === MENCION;

    const comoHoja = (nodo: Nodo): string => {
        if (nodo.type === MENCION) return laEtiquetaDeLaMencion(nodo.attrs);
        const texto = typeof nodo.text === "string" ? nodo.text : "";
        if (!conMarcas || !Array.isArray(nodo.marks)) return texto;
        let salida = texto;
        const tiene = (marca: string) => nodo.marks?.some((m) => m?.type === marca);
        if (tiene("bold")) salida = `**${salida}**`;
        if (tiene("italic")) salida = `*${salida}*`;
        if (tiene("code")) salida = `\`${salida}\``;
        return salida;
    };

    /**
     * Un nodo con sus hijos YA convertidos a texto.
     *
     * Las listas necesitan cada hijo por separado —su marca va delante de cada
     * uno—, y por eso llegan como arreglo y no pegados.
     *
     * Y ojo con una asimetría a propósito: en texto plano se pierden las
     * almohadillas de un encabezado y las comillas de una cita —eso es marcado,
     * y sin `#` el título se lee igual— pero **se conservan los guiones de una
     * lista**, porque sin ellos cinco puntos seguidos se leen como un párrafo
     * y no como una lista.
     */
    const ensamblar = (nodo: Nodo, hijos: string[]): string => {
        const dentro = hijos.join("");
        switch (nodo.type) {
            case "heading": {
                const nivel = Number(nodo.attrs?.level ?? 1);
                const almohadillas = "#".repeat(Math.min(Math.max(nivel, 1), 6));
                return conMarcas ? `${almohadillas} ${dentro}` : dentro;
            }
            case "bulletList":
                return hijos.map((li) => `- ${li}`).join("\n");
            case "orderedList":
                return hijos.map((li, i) => `${i + 1}. ${li}`).join("\n");
            case "taskList": {
                const crudos = comoNodos(nodo.content);
                return hijos
                    .map((li, i) => `- [${crudos[i]?.attrs?.checked ? "x" : " "}] ${li}`)
                    .join("\n");
            }
            case "blockquote":
                return conMarcas ? `> ${dentro}` : dentro;
            case "codeBlock":
                return conMarcas ? `\`\`\`\n${dentro}\n\`\`\`` : dentro;
            case "horizontalRule":
                return conMarcas ? "---" : "";
            default:
                return dentro;
        }
    };

    /**
     * El recorrido es ITERATIVO, nunca recursivo.
     *
     * El contenido llega del navegador, así que su hondura no es de fiar, y
     * con recursión un árbol hondo revienta la pestaña de quien pulsa
     * «Exportar» con un `Maximum call stack size exceeded` que no explica nada.
     * Es la misma decisión —y el mismo motivo— que `leerElContenido`, que lee
     * este mismo árbol para indexarlo. **Lo cazó el banco** con 5.000 niveles:
     * la primera versión era recursiva y se caía.
     */
    const leer = (raizDelBloque: Nodo, quedan: { nodos: number }): string => {
        type Marco = { nodo: Nodo; hijos: string[]; siguiente: number };
        const pila: Marco[] = [{ nodo: raizDelBloque, hijos: [], siguiente: 0 }];
        let hecho: string | null = null;

        while (pila.length > 0) {
            const marco = pila[pila.length - 1];
            if (hecho !== null) {
                marco.hijos.push(hecho);
                hecho = null;
            }

            const hijos = comoNodos(marco.nodo.content);
            const agotado = quedan.nodos <= 0;
            if (!esAtomo(marco.nodo) && !agotado && marco.siguiente < hijos.length) {
                quedan.nodos -= 1;
                pila.push({ nodo: hijos[marco.siguiente++], hijos: [], siguiente: 0 });
                continue;
            }

            pila.pop();
            hecho = esAtomo(marco.nodo) ? comoHoja(marco.nodo) : ensamblar(marco.nodo, marco.hijos);
        }

        return hecho ?? "";
    };

    // El presupuesto es del documento entero, no de cada bloque: con uno por
    // bloque, mil párrafos gastarían mil veces el tope.
    const quedan = { nodos: TOPE_DE_NODOS_AL_EXPORTAR };
    return primeros.map((nodo) => leer(nodo, quedan)).join("\n\n");
}

/* ─────────────────────────────── Una lista ──────────────────────────────── */

export type FilaExportable = {
    titulo: string;
    estado: string;
    fecha?: Date | string | null;
    asignadoNombre?: string | null;
    notas?: string | null;
};

/** El día de una fila, sin la hora. Vacío si no tiene. */
function elDia(fecha: Date | string | null | undefined): string {
    if (!fecha) return "";
    const d = fecha instanceof Date ? fecha : new Date(fecha);
    return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

/**
 * Una barra vertical dentro de una celda parte la tabla en columnas que nadie
 * pidió, y un salto de línea la parte en filas. Se escapan las dos.
 */
function celda(valor: string | null | undefined): string {
    return String(valor ?? "")
        .replace(/\|/g, "\\|")
        .replace(/\r?\n/g, " ");
}

/** Las filas de una lista como tabla de markdown. Vacía, no se escribe nada. */
export function filasComoTabla(filas: FilaExportable[]): string {
    if (filas.length === 0) return "";
    const cabecera = "| Título | Estado | Fecha | Asignado | Notas |";
    const separador = "| --- | --- | --- | --- | --- |";
    const cuerpo = filas.map(
        (f) =>
            `| ${celda(f.titulo)} | ${celda(f.estado)} | ${celda(elDia(f.fecha))} ` +
            `| ${celda(f.asignadoNombre)} | ${celda(f.notas)} |`,
    );
    return [cabecera, separador, ...cuerpo].join("\n");
}

/* ────────────────────────── El documento completo ───────────────────────── */

export type DocumentoExportable = {
    titulo: string;
    contenido?: unknown;
    /** Solo en un documento de tipo `lista`. */
    filas?: FilaExportable[];
};

/**
 * El fichero entero.
 *
 * El título va **dentro** del contenido y no solo en el nombre del fichero: un
 * `.md` que empieza sin encabezado no dice de qué es en cuanto alguien lo
 * renombra o lo pega en otro sitio.
 */
export function comoMarkdown(doc: DocumentoExportable): string {
    const partes = [`# ${doc.titulo}`.trim()];
    const cuerpo = cuerpoComoTexto(doc.contenido, true).trim();
    if (cuerpo) partes.push(cuerpo);
    const tabla = filasComoTabla(doc.filas ?? []);
    if (tabla) partes.push(tabla);
    return `${partes.join("\n\n")}\n`;
}

export function comoTextoPlano(doc: DocumentoExportable): string {
    const partes = [doc.titulo.trim()];
    const cuerpo = cuerpoComoTexto(doc.contenido, false).trim();
    if (cuerpo) partes.push(cuerpo);
    // En texto plano la tabla se queda con sus barras: es lo único que mantiene
    // las columnas alineadas de un vistazo, y quitarlas dejaría cinco valores
    // pegados sin forma de saber dónde acaba cada uno.
    const tabla = filasComoTabla(doc.filas ?? []);
    if (tabla) partes.push(tabla);
    return `${partes.join("\n\n")}\n`;
}

/**
 * Cómo se llama el fichero que se baja.
 *
 * Se limpia a `[a-z0-9-]` **y se topa**: un título largo pegado como nombre de
 * fichero pasa del límite de algunos sistemas y la descarga falla sin decir por
 * qué. Y nunca vacío: un documento titulado solo con emojis daría `.md` a
 * secas, que el navegador guarda como un fichero sin nombre.
 */
export function nombreDeArchivo(titulo: string, extension: "md" | "txt"): string {
    const limpio = titulo
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^a-zA-Z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80)
        .toLowerCase();
    return `${limpio || "documento"}.${extension}`;
}
