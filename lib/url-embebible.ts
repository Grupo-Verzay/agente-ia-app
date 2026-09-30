/**
 * Qué DIRECCIÓN se puede abrir dentro de la plataforma —en un `<iframe>` o en
 * un enlace— sin que se convierta en código nuestro. Puro: lo usan
 * `IframeRenderer` (el marco de Copiloto, Canva, las integraciones de Chats,
 * las herramientas y Evo), las acciones que guardan una integración y la lista
 * de Integraciones.
 *
 * # Por qué existe
 *
 * `/copiloto?u=javascript:alert(document.domain)` EJECUTABA ese código en la
 * plataforma: `?u=` va tal cual al `src` del `<iframe>`, y un `src` con
 * `javascript:` corre en el origen de quien lo pinta —con su sesión, sus
 * cookies y sus datos—. Bastaba con que alguien pulsara un enlace. Lo mismo
 * con `/canva?u=` y con una integración guardada con esa dirección, que además
 * se pintaba como enlace en `/integraciones` y como pestaña en Chats.
 *
 * # La regla
 *
 * Solo `http:` y `https:`. Una dirección RELATIVA (`/algo`) es de la propia
 * plataforma y se deja pasar: el navegador la resuelve contra la página, nunca
 * como un esquema. Todo lo demás —`javascript:`, `data:`, `blob:`, `vbscript:`,
 * `file:`— se rechaza, y no con una lista negra: con una lista blanca de dos.
 *
 * Se decide con `new URL`, que es el MISMO lector que usa el navegador: quita
 * los espacios y los caracteres de control del principio y los tabuladores y
 * saltos de línea de dentro (`java\tscript:` es `javascript:`), así que lo que
 * aquí se ve es lo que el navegador ejecutaría.
 */

const ESQUEMAS_QUE_SE_ABREN = new Set(["http:", "https:"]);

/** El motivo, con las palabras que se le dicen a quien la escribió. */
export const MOTIVO_URL_NO_VALIDA = "La dirección tiene que empezar por http:// o https://.";

/** Tope de largo: una dirección de verdad no pasa de aquí, y una fila no se llena de basura. */
export const TOPE_DE_LA_URL = 2048;

/**
 * La dirección que se puede meter en un `<iframe>` o en un `href`, o `null`
 * si no. Absoluta con `http(s)`, o relativa a la plataforma. Devuelve el
 * MISMO texto, sin los espacios de alrededor: no se reescribe lo que alguien
 * guardó. Es seguro porque el navegador lee ese texto con el mismo lector que
 * aquí lo aprobó.
 */
export function laUrlQueSePuedeAbrir(cruda: unknown): string | null {
    if (typeof cruda !== "string") return null;
    const texto = cruda.trim();
    if (!texto || texto.length > TOPE_DE_LA_URL) return null;
    let absoluta: URL | null = null;
    try {
        absoluta = new URL(texto);
    } catch {
        absoluta = null;
    }
    if (absoluta) return ESQUEMAS_QUE_SE_ABREN.has(absoluta.protocol) ? texto : null;
    // Sin esquema es relativa: se resuelve contra la página, nunca como código.
    // Se comprueba igual contra una base, por si el texto no es ni eso.
    try {
        const relativa = new URL(texto, "https://plataforma.invalid/");
        return ESQUEMAS_QUE_SE_ABREN.has(relativa.protocol) ? texto : null;
    } catch {
        return null;
    }
}

/**
 * La dirección con la que se GUARDA una integración: absoluta y `http(s)`.
 * Una integración es otra web embebida, así que una relativa no tiene sentido
 * ahí. Devuelve la dirección (sin espacios alrededor), o `null`.
 */
export function comoUrlDeIntegracion(cruda: unknown): string | null {
    const url = laUrlQueSePuedeAbrir(cruda);
    if (!url) return null;
    try {
        return ESQUEMAS_QUE_SE_ABREN.has(new URL(url).protocol) ? url : null;
    } catch {
        return null;
    }
}
