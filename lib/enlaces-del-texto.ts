/**
 * Los enlaces que van dentro de un mensaje de texto.
 *
 * Puro: entra una cadena y salen trozos. No sabe de React ni toca el DOM, así
 * que lo que decide qué es un enlace —y, sobre todo, **qué NO lo es**— se puede
 * comprobar sin levantar nada.
 *
 * # Primero los enlaces, DESPUÉS el formato
 *
 * Es el orden, y no es indiferente. El lector de marcas de WhatsApp
 * (`lib/formato-whatsapp.ts`) interpreta `_` y `*`, y hay direcciones que los
 * llevan dentro. Pasando el formato primero, esas salen con un trozo en
 * cursiva y **sin los guiones**: un enlace que lleva a otro sitio y que en
 * pantalla parece perfectamente normal.
 *
 * Conviene ser exacto sobre cuáles, porque la primera versión de este
 * comentario exageraba y el banco la desmintió: `mi_cuenta_x` está **a salvo**,
 * porque el lector ya se niega a abrir una marca pegada a una letra o a un
 * número —es la protección del `snake_case`, que está escrita en su fichero—.
 * Lo que sí se rompe es la marca que empieza después de un signo:
 *
 * | dirección | qué pasa con el formato a solas |
 * | --- | --- |
 * | `…/panel/mi_cuenta_x` | a salvo |
 * | `…/a/_b_/c` | **se rompe** |
 * | `…/docs/_index_` | **se rompe** |
 * | `…/x?q=_a_&r=1` | **se rompe** |
 * | `…/*destacado*` | **se rompe** |
 *
 * Son menos de las que parecía y son reales, así que el orden se queda: se
 * parte por enlaces y el formato se aplica solo a lo que queda entre ellos.
 *
 * El precio, que se dice porque alguien lo notará: una marca que **cruza** un
 * enlace —`*mira https://x.com/a ahora*`— ya no se interpreta, porque sus dos
 * mitades caen en trozos distintos. Es lo mismo que hace WhatsApp, y es
 * preferible a romper la dirección.
 */

/** Un trozo de un mensaje: o es texto normal, o es una dirección. */
export type ParteDeTexto =
    | { tipo: "texto"; texto: string }
    /** `texto` es lo que se lee; `href` lo que se abre. No siempre coinciden. */
    | { tipo: "enlace"; texto: string; href: string };

/**
 * Lo que se reconoce como dirección.
 *
 * Dos formas y nada más: `http(s)://algo` y `www.algo`. Conservador a
 * propósito — reconocer `algo.com` a secas convertiría en enlace cualquier
 * frase con un punto pegado a una palabra («llego a las 3.30pm», «la versión
 * 2.0.rc1»), y un enlace que no lleva a ningún sitio es peor que un texto
 * plano.
 *
 * Y **sin retroceso catastrófico**: es un prefijo fijo seguido de una clase
 * negada con `+`, así que no hay dos cuantificadores que se solapen. Un mensaje
 * raro no puede bloquear la pestaña, y la conversación se repinta con cada
 * mensaje que entra.
 */
const ENLACE = /(?:https?:\/\/|\bwww\.)[^\s<>"'`]+/gi;

/**
 * A partir de aquí no se busca nada y el texto sale tal cual.
 *
 * El mismo tope que el lector de formato y por el mismo motivo: esto es para el
 * pegote de veinte mil caracteres que alguien reenvía, no para un mensaje.
 */
const LARGO_MAXIMO = 20_000;

/**
 * La puntuación que se le devuelve al texto cuando queda pegada al final.
 *
 * «Míralo en https://ia-app.com.» — ese punto es de la frase, no de la
 * dirección, y metido dentro del enlace lo rompe. Igual con el paréntesis de
 * «(ver https://ia-app.com)».
 *
 * El de cierre se devuelve **solo si no hay uno de apertura dentro**: hay
 * direcciones que los llevan de verdad —las de Wikipedia son el caso clásico—
 * y recortarlas ahí las deja apuntando a otro sitio.
 */
function sinLaPuntuacionDeLaFrase(url: string): string {
    let fin = url.length;
    while (fin > 0) {
        const c = url[fin - 1];
        if (".,;:!?»'\"".includes(c)) {
            fin--;
            continue;
        }
        if (c === ")" || c === "]" || c === "}") {
            const abre = c === ")" ? "(" : c === "]" ? "[" : "{";
            const trozo = url.slice(0, fin);
            const abiertos = trozo.split(abre).length - 1;
            const cerrados = trozo.split(c).length - 1;
            if (cerrados > abiertos) {
                fin--;
                continue;
            }
        }
        break;
    }
    return url.slice(0, fin);
}

/** Partir un texto en trozos, separando las direcciones de lo demás. */
export function partirPorEnlaces(texto: string): ParteDeTexto[] {
    if (!texto) return [];
    if (texto.length > LARGO_MAXIMO) return [{ tipo: "texto", texto }];

    const partes: ParteDeTexto[] = [];
    let desde = 0;
    // `lastIndex` se reinicia a mano: la expresión es global y vive en el
    // módulo, así que sin esto la segunda llamada empezaría donde acabó la
    // primera y se saltaría enlaces **de otro mensaje**. Es el clásico de una
    // `RegExp` con `g` reutilizada, y aquí se notaría como «a veces el enlace
    // no se puede pulsar».
    ENLACE.lastIndex = 0;

    for (let m = ENLACE.exec(texto); m; m = ENLACE.exec(texto)) {
        const crudo = sinLaPuntuacionDeLaFrase(m[0]);
        if (!crudo) continue;
        if (m.index > desde) {
            partes.push({ tipo: "texto", texto: texto.slice(desde, m.index) });
        }
        partes.push({
            tipo: "enlace",
            texto: crudo,
            // `www.` sin esquema no es una dirección para el navegador: puesta
            // tal cual en un `href` se lee como ruta relativa y lleva a
            // `/chat-equipo/www.ia-app.com`.
            href: /^www\./i.test(crudo) ? `https://${crudo}` : crudo,
        });
        desde = m.index + crudo.length;
        // Y `lastIndex` se retrocede a donde acaba el enlace YA recortado: si
        // no, la puntuación que se le devolvió al texto se perdería por el
        // camino y «https://x.com.» saldría sin su punto final.
        ENLACE.lastIndex = desde;
    }
    if (desde < texto.length) {
        partes.push({ tipo: "texto", texto: texto.slice(desde) });
    }
    return partes;
}

/** Si un texto lleva alguna dirección dentro. Barato, para no partir de más. */
export function pareceLlevarEnlaces(texto: string): boolean {
    if (!texto || texto.length > LARGO_MAXIMO) return false;
    ENLACE.lastIndex = 0;
    return ENLACE.test(texto);
}

/**
 * Si una dirección es de esta misma plataforma, y por dónde se entra.
 *
 * Devuelve la **ruta** —lo que se le pasa a `Link`— o `null` si es de fuera.
 * Que devuelva la ruta en vez de un booleano no es comodidad: quien llama
 * necesita justo eso, y calcularlo dos veces es la forma de que un día no
 * coincidan.
 *
 * Tres cosas:
 *
 * 1. **Una ruta relativa (`/panel`) es siempre de dentro.** No hay otra cosa
 *    que pueda ser. Pero `//otro.com` **no**: es una dirección absoluta sin
 *    esquema, y tratarla como ruta llevaría a navegar fuera creyendo ir dentro.
 * 2. **Se compara el ORIGEN entero**, no el dominio suelto: `ia-app.com` y
 *    `ia-app.com.otrositio.net` comparten el principio y no son lo mismo. Dar
 *    el segundo por interno sería abrirlo sin las protecciones de un enlace de
 *    fuera.
 * 3. **Sin origen no hay interno.** En el servidor no se sabe cuál es el
 *    dominio; equivocarse hacia «de fuera» solo abre una pestaña de más,
 *    equivocarse hacia «de dentro» manda a una ruta que no existe.
 */
/**
 * `/api/...` no es una página, así que no es navegación interna.
 *
 * Va aparte porque el motivo no es de enrutado: en Chats el texto lo escribe un
 * contacto de WhatsApp, o sea cualquiera, y `/api/logout` es un GET que cierra
 * la sesión. Tratado como enlace de dentro, bastaría con que el mensaje
 * estuviera en pantalla —el enrutador precarga— para echar al asesor de la App.
 * Sale como enlace de fuera: abre una pestaña, con la dirección a la vista, y
 * solo si alguien la pulsa.
 */
function esUnaRutaDeApi(ruta: string): boolean {
    return ruta === "/api" || ruta.startsWith("/api/") || ruta.startsWith("/api?");
}

export function laRutaDeLaPlataforma(href: string, origen: string): string | null {
    const limpio = (href ?? "").trim();
    if (!limpio) return null;
    if (limpio.startsWith("//")) return null;
    if (limpio.startsWith("/")) return esUnaRutaDeApi(limpio) ? null : limpio;
    if (!origen) return null;
    try {
        const u = new URL(limpio);
        const base = new URL(origen);
        if (u.origin !== base.origin) return null;
        const ruta = `${u.pathname}${u.search}${u.hash}`;
        return esUnaRutaDeApi(ruta) ? null : ruta;
    } catch {
        return null;
    }
}

/** El código de una reunión, si esa dirección lleva a una de las nuestras. */
export function elCodigoDeLaReunion(href: string, origen: string): string | null {
    const ruta = laRutaDeLaPlataforma(href, origen);
    if (!ruta) return null;
    const m = /^\/reunion\/([^/?#]+)/.exec(ruta);
    if (!m) return null;
    // Decodificado: el código va en `base64url` y no lleva nada que se escape,
    // pero una dirección copiada a mano puede traer un `%2D` por el camino.
    try {
        return decodeURIComponent(m[1]) || null;
    } catch {
        return m[1] || null;
    }
}

/**
 * Sacar del texto las direcciones de reunión, y devolver sus códigos.
 *
 * Es lo que permite que una reunión se vea como una **tarjeta** y no como una
 * dirección cruda de ochenta caracteres. La dirección no se enseña: la tarjeta
 * dice de qué reunión es y lleva el botón, que es lo que alguien va a pulsar.
 *
 * Y se limpia lo que queda: quitar la dirección de en medio de una frase deja
 * dos espacios pegados, y quitarla de su propio renglón deja un renglón vacío
 * colgando al final del mensaje.
 */
export function apartarLasReuniones(
    texto: string,
    origen: string,
): { texto: string; codigos: string[] } {
    if (!texto || !origen || !pareceLlevarEnlaces(texto)) {
        return { texto: texto ?? "", codigos: [] };
    }
    const codigos: string[] = [];
    const quedan: string[] = [];
    for (const parte of partirPorEnlaces(texto)) {
        if (parte.tipo === "enlace") {
            const codigo = elCodigoDeLaReunion(parte.href, origen);
            if (codigo) {
                if (!codigos.includes(codigo)) codigos.push(codigo);
                continue;
            }
        }
        quedan.push(parte.texto);
    }
    const limpio = quedan
        .join("")
        // Espacios que quedaron pegados al quitar la dirección de en medio.
        // `[^\S\r\n]` es «espacio que no es salto de línea»: con `\s+` a secas
        // se aplastarían los renglones del mensaje, que sí son del autor.
        .replace(/[^\S\r\n]{2,}/g, " ")
        // Y renglones que se quedaron vacíos al quitarla de su propia línea.
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    return { texto: limpio, codigos };
}

/**
 * Recorta un mensaje sin partir un enlace por la mitad.
 *
 * La burbuja de Chats enseña 250 caracteres y un «Ver más». Con los enlaces ya
 * pulsables eso deja de ser inofensivo: **un enlace cortado sigue pareciendo un
 * enlace y lleva a otro sitio**. No es el asterisco de una marca de formato sin
 * cerrar, que se ve y se entiende; es una dirección que miente sobre a dónde
 * va, y la escribió un contacto de WhatsApp que puede ser cualquiera.
 *
 * Así que si el corte cae dentro de una dirección, se corta **antes de que
 * empiece**. Se pierde un trozo de texto que se recupera con «Ver más», y a
 * cambio no hay ni un enlace a medias.
 *
 * Lo que NO se hace es dejar de enlazar el texto recortado. Sería lo fácil, y
 * deja sin pulsar el caso más común: un mensaje largo con su enlace dentro, que
 * es justo lo que se viene a pulsar.
 */
export function recortarSinPartirEnlaces(texto: string, tope: number): string {
    if (texto.length <= tope) return texto;

    ENLACE.lastIndex = 0;
    let corte = tope;
    for (const m of texto.matchAll(ENLACE)) {
        const desde = m.index ?? 0;
        const hasta = desde + m[0].length;
        // Solo el que cruza el corte. Los de antes caben enteros y los de
        // después ni se ven.
        if (desde < tope && hasta > tope) {
            corte = desde;
            break;
        }
    }

    // Si el enlace empieza en el carácter cero no hay nada que enseñar antes de
    // él: se recorta como siempre. Es preferible un enlace a medias —que sigue
    // sin ser pulsable, porque `partirPorEnlaces` lo vuelve a leer sobre el
    // texto ya recortado— a una burbuja vacía con un «Ver más».
    return texto.slice(0, corte > 0 ? corte : tope);
}
