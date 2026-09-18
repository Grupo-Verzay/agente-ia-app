/**
 * Buscar en el chat de equipo, y citar un mensaje anterior.
 *
 * Todo lo de aquí es **puro** —entra texto y sale texto—, que es lo que permite
 * probar en el banco las dos cosas que de verdad deciden si esto funciona:
 * cómo se traduce lo que alguien teclea a una consulta de Postgres, y qué se
 * copia en la fila de una respuesta para que la cita no dependa del original.
 */

/* ────────────────────────────── Buscar ──────────────────────────────────── */

/** Lo que hace falta escribir para que valga la pena buscar. */
export const MINIMO_PARA_BUSCAR = 2;

/** Cuántos resultados se devuelven. Se busca para encontrar, no para leer. */
export const TOPE_DE_RESULTADOS = 40;

/** Cuántas palabras se le pasan al motor de búsqueda. */
const TOPE_DE_TERMINOS = 8;

/**
 * Lo que se teclea, traducido a una consulta de Postgres.
 *
 * **No se interpola texto de nadie dentro de `to_tsquery`.** Esa función tiene
 * su propia sintaxis —`&`, `|`, `!`, `:*`, paréntesis— y un texto con un `!`
 * suelto no es una búsqueda rara: **revienta la consulta entera** con un error
 * de sintaxis. Así que de lo que llega solo se conservan letras y números, y
 * los operadores los pone esta función.
 *
 * Se podría usar `plainto_tsquery`, que escapa solo, y **no vale**: convierte
 * la frase en términos completos, así que escribir «factu» no encuentra
 * «factura». En una caja de búsqueda eso se lee como que no hay resultados
 * cuando sí los hay.
 *
 * Por eso el **último** término lleva `:*` —el que se está tecleando— y los
 * anteriores no: quien ya escribió «factura pendiente» quiere las dos palabras
 * enteras, no todo lo que empiece por «pendiente».
 */
export function comoConsultaDeBusqueda(texto: string): string | null {
    const terminos = (texto || "")
        .toLowerCase()
        // Solo letras y números. `\p{L}` incluye los acentos y la eñe: con
        // `[a-z0-9]` a secas, «pequeño» se partiría en «peque» y «o».
        .split(/[^\p{L}\p{N}]+/u)
        .filter(Boolean)
        .slice(0, TOPE_DE_TERMINOS);

    if (terminos.length === 0) return null;
    // El largo se mide sobre lo que queda DESPUÉS de limpiar: escribir «??» son
    // dos caracteres y ni un término, y buscar eso es recorrer para nada.
    if (terminos.join("").length < MINIMO_PARA_BUSCAR) return null;

    const ultimo = terminos.length - 1;
    return terminos.map((t, i) => (i === ultimo ? `${t}:*` : t)).join(" & ");
}

/* ────────────────────────────── Citar ───────────────────────────────────── */

/**
 * Cuánto del original se copia en la respuesta.
 *
 * Es «las primeras líneas», no el mensaje entero: un recuadro de cita con
 * cuatro párrafos dentro tapa la respuesta, que es lo que se viene a leer.
 */
export const TOPE_DEL_EXTRACTO = 180;

/** Cuántas líneas del original entran en el recuadro. */
const LINEAS_DEL_EXTRACTO = 3;

/**
 * El trozo del original que se copia en la fila de la respuesta.
 *
 * **Se copia, no se referencia**, y esa es la decisión entera de la cita: el
 * recuadro se pinta con lo que hay en la propia fila de la respuesta, sin
 * mirar el original para nada. Es el mismo criterio con el que `autorNombre`
 * ya se copia en cada mensaje —para que el hilo siga diciendo quién escribió
 * aunque esa persona salga del equipo—, aplicado al texto.
 */
export function comoExtractoDeCita(texto: string | null | undefined): string {
    const limpio = (texto ?? "").replace(/\r\n/g, "\n").trim();
    if (!limpio) return "";

    const lineas = limpio.split("\n").slice(0, LINEAS_DEL_EXTRACTO);
    const junto = lineas.join("\n");
    if (junto.length <= TOPE_DEL_EXTRACTO) {
        // Se avisa de que hay más aunque quepan las tres líneas: si el mensaje
        // tenía cinco, el recuadro estaría enseñando un trozo sin decirlo.
        return lineas.length < limpio.split("\n").length ? `${junto}…` : junto;
    }
    return `${junto.slice(0, TOPE_DEL_EXTRACTO).trimEnd()}…`;
}

/**
 * La cita, tal y como viaja dentro de un mensaje.
 *
 * Los tres campos salen de la **fila de la respuesta**, no de una consulta al
 * original. `id` solo sirve para saltar; si el original ya no está, los otros
 * dos siguen ahí y el recuadro se pinta igual.
 */
export type CitaDeMensaje = {
    /** El mensaje citado. Es a lo que se salta al pulsar el recuadro. */
    id: string;
    /** Quién lo escribió, copiado. */
    autorNombre: string | null;
    /** Las primeras líneas, copiadas. */
    extracto: string;
    /**
     * ¿Sigue existiendo el original?
     *
     * **No es una columna**: se pregunta al leer, con un `IN` sobre la clave
     * primaria. Guardarlo como marca obligaría a que cada camino que borre un
     * mensaje se acordara de ponerla, y el día que alguien borre por otro lado
     * la marca se queda mintiendo. Preguntarlo siempre acierta.
     */
    sigueAhi: boolean;
};

/** Un resultado de la búsqueda. */
export type ResultadoDeBusqueda = {
    id: string;
    canalId: string;
    /** Cómo se llama ese canal, para no tener que buscarlo al pintar. */
    canalNombre: string;
    autorNombre: string | null;
    texto: string;
    creadoEn: string;
};

/**
 * Un id que llega del navegador, saneado.
 *
 * Los ids de esta tabla son `randomUUID()`, así que lo que traiga otra cosa no
 * puede ser uno. Se acota además el largo: sin eso, un id de un mega viaja
 * hasta la consulta para no encontrar nada.
 */
export function comoIdDeMensaje(valor: unknown): string | null {
    // Solo una cadena. Con `String(valor)`, un `7` se convertía en `"7"` y
    // pasaba el filtro: no llega a hacer daño —ese mensaje no existe y la
    // acción lo rechaza— pero es aceptar un tipo que nunca puede ser un id, y
    // eso es lo que hace que un día entre algo que sí importa.
    if (typeof valor !== "string") return null;
    const texto = valor.trim();
    if (!texto || texto.length > 64) return null;
    return /^[A-Za-z0-9_-]+$/.test(texto) ? texto : null;
}
