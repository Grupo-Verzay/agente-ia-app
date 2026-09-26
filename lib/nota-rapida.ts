/**
 * La nota rápida: lo que decide qué se guarda, cuándo y cómo sale de aquí.
 * **Puro**, para poder probarlo sin base y sin navegador.
 *
 * # Qué es, y qué NO es
 *
 * Es **una sola nota por persona**, en texto plano, que se guarda sola y sigue
 * ahí mañana. Un sitio donde apuntar el dato que te acaban de decir por
 * teléfono sin salir de la conversación que tienes delante.
 *
 * No es el módulo de Notas: ahí una nota tiene título, carpeta, emoji, color,
 * se comparte y se escribe con el editor de texto. Esto es el papel de al lado
 * del teclado, y por eso va en **texto plano y no en el editor de la casa**:
 *
 * - Lo que se guarda es una cadena, así que el guardado automático —que corre
 *   mientras se escribe— manda unos bytes y no el árbol entero del documento.
 * - Y no hay que pasar por `comoJsonPlano`: lo que sale de tiptap lleva dentro
 *   objetos con `Object.create(null)` y **no se puede mandar a una acción de
 *   servidor** sin aplanarlo antes. Ese arreglo existe y está escrito, pero es
 *   una trampa menos que tener.
 *
 * Lo que sí hace falta es poder **ascenderla**: cuando lo apuntado deja de ser
 * un recado y pasa a ser algo que se guarda, un botón la manda a Notas como
 * nota formal. De ahí `elTituloDeLaNota` y `comoContenidoDeNota`, que son la
 * traducción del papel al documento.
 */

/**
 * Lo que se espera después de la última tecla antes de guardar.
 *
 * Ni tan corto que cada letra sea una petición, ni tan largo que cerrar la
 * pestaña se lleve una frase entera. Y no es lo único que guarda: al cerrar el
 * panel, al esconderse la pestaña y al irse la página se vuelca lo que haya
 * sin esperar a este reloj.
 */
export const MS_ANTES_DE_GUARDAR = 900;

/**
 * El tope de lo que se guarda, en caracteres.
 *
 * No es una limitación de la base —es una columna de texto— sino de lo que
 * tiene sentido llevar en un papel: pasado eso, lo que se está escribiendo es
 * un documento y su sitio es Notas. Se recorta al guardar y **se dice**: un
 * texto que se corta en silencio se lee como que la App pierde lo que
 * escribes.
 */
export const TOPE_DE_LA_NOTA = 20000;

/** Lo que cabe en el título de la nota formal que sale de aquí. */
export const TOPE_DEL_TITULO = 60;

/**
 * Cómo se guarda lo que llega del navegador.
 *
 * Lo que no sea una cadena vale por vacío —nunca por `null`, que en la columna
 * significaría otra cosa— y lo que pase del tope se recorta. Los saltos de
 * línea se conservan: son el contenido.
 */
export function comoTextoDeLaNota(valor: unknown): string {
    if (typeof valor !== "string") return "";
    return valor.length > TOPE_DE_LA_NOTA ? valor.slice(0, TOPE_DE_LA_NOTA) : valor;
}

/** `true` si el texto llegó recortado, para poder decirlo. */
export function seRecorto(valor: unknown): boolean {
    return typeof valor === "string" && valor.length > TOPE_DE_LA_NOTA;
}

/**
 * Si hay algo que guardar.
 *
 * Se compara contra **lo último que el servidor confirmó**, no contra lo
 * último que se mandó: así un guardado que falló se vuelve a intentar con la
 * tecla siguiente en vez de darse por hecho. Y sin cambios no se escribe: esto
 * corre cada vez que se deja de teclear, y una escritura por pausa sobre una
 * nota que no cambió es una petición para no cambiar nada.
 */
export function hayQueGuardar(guardado: string, actual: string): boolean {
    return guardado !== actual;
}

/** En qué anda el guardado. Lo pinta el pie del panel. */
export type EstadoDeLaNota = "inactivo" | "guardando" | "guardado" | "fallo";

/**
 * Si se puede mandar al módulo de Notas.
 *
 * Solo con algo escrito: una nota formal en blanco es una fila que alguien
 * tendrá que ir a borrar. El botón se apaga —no se esconde— porque su sitio no
 * puede bailar según lo que haya escrito.
 */
export function sePuedeMandarAlModulo(texto: string): boolean {
    return texto.trim().length > 0;
}

/**
 * El título de la nota formal: la PRIMERA línea con algo escrito.
 *
 * No la primera línea a secas: quien empieza con un salto tendría una nota sin
 * título. Y recortado, porque en Notas el título es una línea de una lista —el
 * texto entero se conserva igual en el cuerpo, así que no se pierde nada—.
 *
 * Sin nada escrito devuelve cadena vacía y quien llama decide; hoy no llega
 * ahí, porque `sePuedeMandarAlModulo` ya lo impide.
 */
export function elTituloDeLaNota(texto: string): string {
    const primera = texto.split("\n").map((l) => l.trim()).find((l) => l.length > 0) ?? "";
    if (primera.length <= TOPE_DEL_TITULO) return primera;
    return `${primera.slice(0, TOPE_DEL_TITULO - 1).trimEnd()}…`;
}

/**
 * El texto, en el documento que entiende el editor de Notas.
 *
 * Un párrafo por línea. Una línea vacía es un párrafo **sin contenido** y no
 * uno con una cadena vacía dentro: tiptap rechaza un nodo de texto vacío, y
 * una nota que no se puede abrir es peor que una nota fea.
 *
 * **El texto entero entra, sin recortar por el título.** La primera línea sale
 * arriba y también se queda en el cuerpo: quien asciende un recado espera
 * encontrarlo tal cual lo escribió, no una versión a la que le falta el
 * principio.
 */
export function comoContenidoDeNota(texto: string): object {
    const lineas = texto.replace(/\r\n/g, "\n").split("\n");
    return {
        type: "doc",
        content: lineas.map((linea) =>
            linea.length > 0
                ? { type: "paragraph", content: [{ type: "text", text: linea }] }
                : { type: "paragraph" },
        ),
    };
}
