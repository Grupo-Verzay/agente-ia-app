/**
 * Documentación interna: lo que decide cómo se guarda y cómo se lee, sin tocar
 * la base ni el navegador.
 *
 * Todo lo de aquí es **puro** —entra un objeto y sale un objeto—, que es lo que
 * permite probar en el banco las cuatro cosas de las que depende el módulo
 * entero: qué texto se indexa, qué menciones se sacan de un documento, qué se
 * puede pintar en cada vista y qué se hace con lo que llega del navegador.
 *
 * ## Se piensa desde el principio como módulo de CLIENTE
 *
 * No hay ni una constante de Verzay aquí dentro. Cada fila lleva su `cuentaId`,
 * la puerta vive en la acción (`lib/acceso-al-documento.ts`) y la ruta entra en
 * `navigationRoutes` sin montarse en ningún módulo, igual que `/cobros`. Eso es
 * lo que hace que ofrecérselo mañana a una cuenta cliente sea asignar una
 * pestaña, no reescribir nada.
 */

/* ─────────────────────────── Qué es cada cosa ───────────────────────────── */

/**
 * Las tres clases de documento, y son tres a propósito:
 *
 * - `documento` — texto. Un procedimiento, un acta, una guía.
 * - `lista` — filas. Es lo que se ve como tabla, tablero o calendario.
 * - `plantilla` — un documento que no se lee, se copia. Sale del listado normal
 *   y solo aparece al crear.
 *
 * Una `lista` **también tiene cuerpo**: la cabecera explica para qué es la
 * lista. Separarlas en dos tablas habría obligado a mezclar dos consultas cada
 * vez que se pinta un espacio.
 */
export const TIPOS_DE_DOCUMENTO = ["documento", "lista", "plantilla"] as const;
export type TipoDeDocumento = (typeof TIPOS_DE_DOCUMENTO)[number];

/**
 * Qué se puede mencionar dentro del texto.
 *
 * La lista es **cerrada**, y esa es la mitad que importa: la mención se guarda
 * en `doc_menciones` y de ahí sale el retroenlace, así que un `tipo` inventado
 * sería una fila que no se puede resolver nunca — un enlace que al pulsarlo no
 * lleva a ningún sitio y que nadie sabe de dónde salió.
 */
export const TIPOS_DE_MENCION = ["cliente", "tarea", "ticket", "documento"] as const;
export type TipoDeMencion = (typeof TIPOS_DE_MENCION)[number];

/** Cómo se llama cada cosa mencionable en la pantalla. */
export const NOMBRE_DEL_TIPO_DE_MENCION: Record<TipoDeMencion, string> = {
    cliente: "Cliente",
    tarea: "Tarea",
    ticket: "Ticket",
    documento: "Documento",
};

/**
 * Las tres vistas de una lista. **El dato es UNO**: lo que cambia es quién lo
 * pinta, nunca dónde está guardado.
 */
export const VISTAS = ["tabla", "tablero", "calendario"] as const;
export type Vista = (typeof VISTAS)[number];

export const NOMBRE_DE_LA_VISTA: Record<Vista, string> = {
    tabla: "Tabla",
    tablero: "Tablero",
    calendario: "Calendario",
};

/** Las columnas con las que nace una lista. Cada una puede cambiarlas. */
export const ESTADOS_POR_DEFECTO = ["Pendiente", "En curso", "Hecho"] as const;

/* ────────────────────────────── Los topes ───────────────────────────────── */

/**
 * Cuánto texto plano se guarda para buscar, en caracteres.
 *
 * **No es un tope de comodidad: es lo que impide que guardar falle.** El índice
 * es un GIN sobre `to_tsvector('spanish', "texto")`, y un `tsvector` de
 * Postgres **no puede pasar de 1 MB** — no se degrada, da error y tumba el
 * `INSERT`. O sea que sin este tope, un documento suficientemente largo no se
 * podría guardar, y el error saldría al escribir y no al buscar, que es donde
 * nadie lo relacionaría con la búsqueda.
 *
 * 100.000 caracteres son unas 40 páginas. El **contenido entero se guarda
 * igual** en `contenido`: lo único que se recorta es la copia que se indexa, y
 * eso se dice (`textoRecortado`).
 */
export const TOPE_DEL_TEXTO_INDEXADO = 100_000;

/**
 * Cuántos nodos se recorren antes de rendirse al aplanar un documento.
 *
 * El contenido llega **del navegador**, así que su forma no es de fiar: un JSON
 * hondo o enorme recorrido a lo bruto es un servidor colgado. Por eso el
 * recorrido es **iterativo con presupuesto**, nunca recursivo — con recursión,
 * un documento anidado lo bastante hondo revienta la pila y el fallo sale como
 * un 500 sin explicación.
 */
export const TOPE_DE_NODOS = 200_000;

/** Cuántas menciones distintas se guardan de un documento. */
export const TOPE_DE_MENCIONES = 500;

/** Cuántas versiones se conservan de un documento. */
export const TOPE_DE_VERSIONES = 100;

/** El título es corto a propósito: es lo que se lee en el árbol del espacio. */
export const TOPE_DEL_TITULO = 200;

/** Cuántos documentos devuelve una búsqueda. Se busca para encontrar. */
export const TOPE_DE_RESULTADOS = 40;

/** Cuántas filas admite una lista. */
export const TOPE_DE_FILAS = 2_000;

/* ──────────────────────── Lo que llega de fuera ─────────────────────────── */

export function comoTipoDeDocumento(valor: unknown): TipoDeDocumento | null {
    if (typeof valor !== "string") return null;
    const v = valor.trim().toLowerCase() as TipoDeDocumento;
    return (TIPOS_DE_DOCUMENTO as readonly string[]).includes(v) ? v : null;
}

export function comoTipoDeMencion(valor: unknown): TipoDeMencion | null {
    if (typeof valor !== "string") return null;
    const v = valor.trim().toLowerCase() as TipoDeMencion;
    return (TIPOS_DE_MENCION as readonly string[]).includes(v) ? v : null;
}

export function comoVista(valor: unknown): Vista | null {
    if (typeof valor !== "string") return null;
    const v = valor.trim().toLowerCase() as Vista;
    return (VISTAS as readonly string[]).includes(v) ? v : null;
}

/**
 * Un título saneado, o `null`.
 *
 * Los saltos se **aplastan**, no se corta por el primero: quien pega un texto
 * de varias líneas en el título quiere que se vea entero, y cortar por el
 * primer `Enter` es tirar lo que acaba de escribir sin decírselo. Es la misma
 * regla que ya rige en el título de una tarea.
 */
export function comoTitulo(valor: unknown): string | null {
    if (typeof valor !== "string") return null;
    const limpio = valor.replace(/\s+/g, " ").trim();
    if (!limpio) return null;
    return limpio.length > TOPE_DEL_TITULO
        ? `${limpio.slice(0, TOPE_DEL_TITULO - 1)}…`
        : limpio;
}

/**
 * Un id que llega de fuera, comprobando que sea una CADENA.
 *
 * `String(7)` da `"7"` y pasaría un filtro que solo mirase el largo: no llega a
 * hacer daño —ese documento no existe— pero es aceptar un tipo que nunca puede
 * ser un id, y eso ya lo cazó el banco una vez en las citas del chat de equipo.
 */
export function comoId(valor: unknown): string | null {
    if (typeof valor !== "string") return null;
    const v = valor.trim();
    return v && v.length <= 200 ? v : null;
}

/* ──────────────────── El contenido: aplanar y mencionar ─────────────────── */

/** Una mención, tal y como se guarda en `doc_menciones`. */
export type Mencion = {
    tipo: TipoDeMencion;
    refId: string;
    /**
     * El nombre con el que se escribió, COPIADO.
     *
     * Es el mismo criterio que `autorNombre` en el chat de equipo: el documento
     * sigue diciendo de quién se hablaba aunque después se borre el cliente o
     * la tarea. Sin la copia, un retroenlace a algo borrado sale como un hueco.
     */
    etiqueta: string;
};

/** El nodo de mención dentro del contenido. Lo escribe el editor. */
export const NODO_DE_MENCION = "mencion";

type Nodo = {
    type?: unknown;
    text?: unknown;
    attrs?: Record<string, unknown> | null;
    content?: unknown;
};

/**
 * Los tipos de nodo que separan párrafos. Sin esto, dos párrafos seguidos se
 * pegarían —«…del clienteEl siguiente paso…»— y esa palabra inventada entra al
 * índice y no la encuentra nadie.
 */
const NODOS_DE_BLOQUE = new Set([
    "paragraph",
    "heading",
    "listItem",
    "taskItem",
    "blockquote",
    "codeBlock",
    "horizontalRule",
    "tableRow",
]);

/**
 * El contenido recorrido una sola vez: sale el texto plano y las menciones.
 *
 * **Van juntos a propósito.** Son dos preguntas sobre el mismo árbol, y
 * recorrerlo dos veces es pagar dos veces por lo mismo en el camino más
 * caliente que tiene esto —cada guardado de cada documento—. Y hay una razón
 * más fuerte: si un día una se recorta por el presupuesto y la otra no,
 * el documento quedaría indexado hasta la mitad y con menciones de la otra
 * mitad, que es un estado que nadie sabría explicar.
 */
export type LecturaDelContenido = {
    /** El texto plano, ya recortado a `TOPE_DEL_TEXTO_INDEXADO`. */
    texto: string;
    /** Si hubo que recortarlo. La pantalla lo dice; no se calla. */
    textoRecortado: boolean;
    /** Las menciones, sin repetidos y en el orden en que aparecen. */
    menciones: Mencion[];
    /** Si se agotó el presupuesto de nodos. También se dice. */
    seQuedoCorto: boolean;
};

export function leerElContenido(contenido: unknown): LecturaDelContenido {
    const trozos: string[] = [];
    let largo = 0;
    let textoRecortado = false;
    let seQuedoCorto = false;

    const menciones: Mencion[] = [];
    const vistas = new Set<string>();

    // Iterativo y con presupuesto, nunca recursivo: ver `TOPE_DE_NODOS`.
    const pila: unknown[] = [contenido];
    let nodos = 0;

    while (pila.length > 0) {
        if (nodos++ > TOPE_DE_NODOS) {
            seQuedoCorto = true;
            break;
        }

        const actual = pila.pop();
        if (!actual || typeof actual !== "object") continue;

        if (Array.isArray(actual)) {
            // Al revés, porque se saca por el final: así el texto sale en el
            // orden en que está escrito y no del revés.
            for (let i = actual.length - 1; i >= 0; i--) pila.push(actual[i]);
            continue;
        }

        const nodo = actual as Nodo;
        const tipo = typeof nodo.type === "string" ? nodo.type : "";

        if (tipo === "text" && typeof nodo.text === "string") {
            if (largo < TOPE_DEL_TEXTO_INDEXADO) {
                trozos.push(nodo.text);
                largo += nodo.text.length;
            } else {
                textoRecortado = true;
            }
            continue;
        }

        if (tipo === NODO_DE_MENCION) {
            const mencion = comoMencion(nodo.attrs);
            if (mencion) {
                const llave = `${mencion.tipo}:${mencion.refId}`;
                if (!vistas.has(llave) && menciones.length < TOPE_DE_MENCIONES) {
                    vistas.add(llave);
                    menciones.push(mencion);
                }
                // **La etiqueta entra en el texto que se indexa.** Sin esto,
                // buscar el nombre de un cliente no encontraría el documento
                // que lo nombra — que es justo lo que la mención viene a hacer
                // posible, y el fallo se leería como «el buscador no funciona».
                if (largo < TOPE_DEL_TEXTO_INDEXADO) {
                    trozos.push(mencion.etiqueta);
                    largo += mencion.etiqueta.length;
                } else {
                    textoRecortado = true;
                }
            }
            continue;
        }

        if (NODOS_DE_BLOQUE.has(tipo)) trozos.push("\n");

        if (nodo.content) pila.push(nodo.content);
    }

    const texto = trozos
        .join("")
        .replace(/[ \t]+/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .trim();

    return {
        texto:
            texto.length > TOPE_DEL_TEXTO_INDEXADO
                ? texto.slice(0, TOPE_DEL_TEXTO_INDEXADO)
                : texto,
        textoRecortado: textoRecortado || texto.length > TOPE_DEL_TEXTO_INDEXADO,
        menciones,
        seQuedoCorto,
    };
}

/** Los atributos de un nodo de mención, comprobados uno por uno. */
function comoMencion(attrs: Record<string, unknown> | null | undefined): Mencion | null {
    if (!attrs) return null;
    const tipo = comoTipoDeMencion(attrs.tipo);
    const refId = comoId(attrs.refId);
    if (!tipo || !refId) return null;

    const etiqueta = typeof attrs.etiqueta === "string" ? attrs.etiqueta.trim() : "";
    return {
        tipo,
        refId,
        // Sin etiqueta se usa el id, que es feo pero cierto. Dejarla vacía
        // pintaría una pastilla en blanco dentro del texto.
        etiqueta: (etiqueta || refId).slice(0, TOPE_DEL_TITULO),
    };
}

/**
 * Un documento vacío, en la forma que espera el editor.
 *
 * Es una función y no una constante porque el objeto se **muta** al editarlo:
 * una constante compartida acabaría con el contenido de un documento dentro de
 * otro, y eso solo se ve el día que alguien crea dos seguidos.
 */
export function documentoVacio(): { type: "doc"; content: unknown[] } {
    return { type: "doc", content: [{ type: "paragraph" }] };
}

/* ─────────────────────────── El trozo que se enseña ─────────────────────── */

/** Cuánto texto se enseña de un resultado de búsqueda. */
export const TOPE_DEL_EXTRACTO = 220;

/**
 * El trozo del documento donde aparece lo que se buscó.
 *
 * **Alrededor del acierto, no las primeras líneas.** Un resultado que enseña
 * siempre el principio del documento no dice por qué ha salido, y con veinte
 * resultados iguales la lista no ayuda a elegir. Si no se encuentra el término
 * —porque casó por la raíz, «facturas» contra «factura»— se cae al principio,
 * que es mejor que un hueco.
 */
export function extractoConLoBuscado(texto: string, consulta: string): string {
    const limpio = (texto || "").replace(/\s+/g, " ").trim();
    if (!limpio) return "";

    const termino = (consulta || "")
        .split(/[^\p{L}\p{N}]+/u)
        .filter(Boolean)
        .sort((a, b) => b.length - a.length)[0];

    let desde = 0;
    if (termino) {
        const donde = limpio.toLowerCase().indexOf(termino.toLowerCase());
        // Un poco antes del acierto, para que se lea la frase y no media
        // palabra.
        if (donde > 0) desde = Math.max(0, donde - 60);
    }

    const trozo = limpio.slice(desde, desde + TOPE_DEL_EXTRACTO);
    return `${desde > 0 ? "…" : ""}${trozo}${
        desde + TOPE_DEL_EXTRACTO < limpio.length ? "…" : ""
    }`;
}

/* ──────────────────────────── Las tres vistas ───────────────────────────── */

/** Una fila de una lista. Es el ÚNICO dato: las tres vistas pintan esto. */
export type FilaDeLista = {
    id: string;
    documentoId: string;
    titulo: string;
    estado: string;
    /** Lo que usa el calendario. Nula a propósito: no todo tiene fecha. */
    fecha: Date | null;
    asignadoId: string | null;
    asignadoNombre: string | null;
    notas: string | null;
    creadoEn: Date;
};

/**
 * Lo que el calendario puede pintar, y **lo que deja fuera**.
 *
 * Las dos mitades hacen falta. Una fila sin fecha no cabe en un calendario, eso
 * no tiene vuelta; lo que no puede pasar es que desaparezca **en silencio**:
 * con sesenta filas y veinte fechas, el calendario enseña veinte y desde fuera
 * se lee como que se perdieron cuarenta. Es la misma regla que ya rige en el
 * reparto del trabajo —*si no suma, se dice*— y en la bandeja topada de Chats.
 */
export function loQueCabeEnElCalendario(filas: FilaDeLista[]): {
    conFecha: FilaDeLista[];
    sinFecha: number;
} {
    const conFecha = filas.filter((f) => f.fecha instanceof Date && !isNaN(f.fecha.getTime()));
    return { conFecha, sinFecha: filas.length - conFecha.length };
}

/**
 * Las filas repartidas en las columnas del tablero.
 *
 * Una fila cuyo estado ya no es ninguna columna —alguien renombró la columna,
 * o la fila viene de antes— **no se pierde**: cae en la primera. Dejarla fuera
 * sería borrarla de la vista sin borrarla de la base, que es la peor de las dos
 * cosas: no está y sigue contando.
 */
export function repartirEnColumnas(
    filas: FilaDeLista[],
    estados: string[],
): Array<{ estado: string; filas: FilaDeLista[] }> {
    const columnas = estados.length > 0 ? estados : [...ESTADOS_POR_DEFECTO];
    const porEstado = new Map<string, FilaDeLista[]>(columnas.map((e) => [e, []]));

    for (const fila of filas) {
        const donde = porEstado.get(fila.estado) ?? porEstado.get(columnas[0]);
        donde?.push(fila);
    }

    return columnas.map((estado) => ({ estado, filas: porEstado.get(estado) ?? [] }));
}

/**
 * Los estados de una lista, saneados.
 *
 * Sin columnas no hay tablero, así que una lista que llegue con la lista vacía
 * —a mano, o de antes de esta comprobación— se queda con las de por defecto en
 * vez de pintar un tablero sin ninguna columna donde soltar nada.
 */
export function comoEstados(valor: unknown): string[] {
    if (!Array.isArray(valor)) return [...ESTADOS_POR_DEFECTO];
    const limpios = valor
        .filter((v): v is string => typeof v === "string")
        .map((v) => v.replace(/\s+/g, " ").trim())
        .filter(Boolean)
        .slice(0, 12);
    // Sin repetidos: dos columnas con el mismo nombre son dos sitios para lo
    // mismo y la segunda no recibe nunca una fila.
    const unicos = Array.from(new Set(limpios));
    return unicos.length > 0 ? unicos : [...ESTADOS_POR_DEFECTO];
}

/* ─────────────────────── La arroba que se está escribiendo ──────────────── */

/**
 * La mención que se está tecleando, si es que hay una.
 *
 * **La arroba tiene que ABRIR palabra** —ni justo detrás de una letra ni de un
 * número—, que es exactamente la misma condición con la que el chat de equipo
 * decide que `hola@verzay.com` no es una mención. Aquí importa por el mismo
 * motivo: si el selector ofreciera algo que luego no se guarda como mención, el
 * retroenlace no aparecería y no habría ningún error que mirar.
 */
export function laArrobaQueSeEscribe(
    texto: string,
    cursor: number,
): { desde: number; consulta: string } | null {
    const hasta = Math.max(0, Math.min(cursor, texto.length));
    const antes = texto.slice(0, hasta);

    const arroba = antes.lastIndexOf("@");
    if (arroba < 0) return null;

    // Ni una letra ni un número justo delante.
    if (arroba > 0 && /[\p{L}\p{N}]/u.test(antes[arroba - 1])) return null;

    const consulta = antes.slice(arroba + 1);
    // Un salto de línea cierra la mención: nadie escribe un nombre en dos
    // líneas, y sin esto la arroba de hace tres párrafos seguiría abierta.
    if (/[\n\r]/.test(consulta)) return null;
    if (consulta.length > 60) return null;

    return { desde: arroba, consulta };
}

/**
 * Lo que el selector ofrece, filtrado por lo que se lleva escrito.
 *
 * Se compara **sin acentos y sin mayúsculas**: quien teclea «atencion» tiene
 * que encontrar «Verzay | Atención». Sin esto el selector sale vacío y se lee
 * como que esa cosa no se puede mencionar.
 */
export function loQueOfreceElSelector<T extends { etiqueta: string }>(
    candidatos: T[],
    consulta: string,
    tope = 8,
): T[] {
    const buscado = sinAcentos(consulta);
    if (!buscado) return candidatos.slice(0, tope);
    return candidatos.filter((c) => sinAcentos(c.etiqueta).includes(buscado)).slice(0, tope);
}

function sinAcentos(texto: string): string {
    return (texto || "")
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .trim();
}
