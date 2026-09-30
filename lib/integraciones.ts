/**
 * Las reglas de «Integrar URLs» (`/integraciones`): qué nombre y qué dirección
 * se aceptan para una app externa, cuántas caben y qué dirección se abre de
 * verdad. Puro, sin base ni red: lo usan la acción que guarda, la pantalla que
 * pinta la lista y las dos pantallas que la abren (la pestaña de Chats y el
 * iframe común).
 *
 * # Por qué existe
 *
 * La pantalla guardaba lo que se escribiera, tal cual:
 *
 * - **Una dirección `javascript:` se ejecutaba.** Esa dirección se pinta en un
 *   `<iframe>` (la pestaña de la app en Chats) y en un enlace («Abrir en nueva
 *   pestaña»), y el React que lleva Next 14 no bloquea `javascript:` —solo lo
 *   avisa en la consola—. Una app con esa dirección corría código dentro de la
 *   plataforma cada vez que alguien abría su pestaña.
 * - **Una dirección sin `https://` se abría DENTRO de la propia App.** El
 *   navegador la lee como una ruta relativa: «typebot.co/mi-bot» cargaba
 *   `/chats/typebot.co/mi-bot` en la pestaña, o sea la plataforma metida en sí
 *   misma, sin un solo error.
 * - **El «máx. 10» que se prometía no existía**: la pastilla decía «10
 *   disponibles menos las que tengas» y la acción aceptaba la undécima igual.
 *
 * Así que lo que se guarda pasa por aquí, y lo que se abre también: una fila
 * vieja que se guardó antes de estas reglas no puede ejecutar nada.
 */

/** Cuántas apps puede tener una cuenta. Es la cifra que la pantalla prometía. */
export const TOPE_DE_INTEGRACIONES = 10;

/**
 * El nombre es el rótulo de una pestaña de Chats: más largo no se lee, y la
 * tira de pestañas lo recortaría igual.
 */
export const LARGO_MAXIMO_DEL_NOMBRE = 40;

/** Lo que admite un navegador sin quejarse. Más es un pegado roto. */
export const LARGO_MAXIMO_DE_LA_URL = 2048;

export type Veredicto<T> = { ok: true; valor: T } | { ok: false; motivo: string };

/**
 * Un esquema delante: `https:`, `mailto:`, `javascript:`… Sin puntos, a
 * propósito: con ellos «typebot.co:8080» se leería como el esquema
 * «typebot.co» en vez de un dominio con su puerto.
 */
const CON_ESQUEMA = /^[a-z][a-z0-9+-]*:/i;

/** Espacios y caracteres de control, que una dirección no lleva. */
const ESPACIOS_O_CONTROL = /[\s\u0000-\u001f\u007f]/;

/**
 * La dirección que se GUARDA: la que se escribió, sin espacios alrededor y con
 * `https://` delante si no traía esquema —que es como se escribe casi siempre—.
 * Solo `http` y `https`, y con un dominio de verdad: con punto, o no es una
 * web («Mi Typebot» en el campo equivocado saldría como `https://mi typebot`).
 *
 * Se devuelve lo que se escribió y no el `href` normalizado: el `href` le pone
 * una barra al final a «https://ejemplo.com», y la fila diría otra cosa que lo
 * que la persona tecleó.
 */
export function comoUrlDeIntegracion(texto: unknown): Veredicto<string> {
    const limpio = typeof texto === "string" ? texto.trim() : "";
    if (!limpio) return { ok: false, motivo: "Escribe la dirección de la app." };
    if (limpio.length > LARGO_MAXIMO_DE_LA_URL) {
        return { ok: false, motivo: `La dirección pasa de ${LARGO_MAXIMO_DE_LA_URL} caracteres.` };
    }
    if (ESPACIOS_O_CONTROL.test(limpio)) {
        return { ok: false, motivo: "La dirección no puede llevar espacios." };
    }

    const conEsquema = CON_ESQUEMA.test(limpio) ? limpio : `https://${limpio}`;
    let url: URL;
    try {
        url = new URL(conEsquema);
    } catch {
        return { ok: false, motivo: "Esa dirección no es válida. Cópiala entera desde el navegador." };
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") {
        return { ok: false, motivo: "Solo se aceptan direcciones web, que empiecen por https:// o http://." };
    }
    // `localhost` es la única dirección de verdad sin punto, y dejarla fuera no
    // protegía nada: `http://127.0.0.1:3080` —la misma máquina— ya pasaba.
    // Con ella fuera, el copiloto local de las capturas de la guía de Copiloto
    // (`?u=http://localhost:3080`) caía en el de la plataforma y no se podía
    // volver a generar la guía.
    if (!url.hostname.includes(".") && url.hostname !== "localhost") {
        return { ok: false, motivo: "A esa dirección le falta el dominio (por ejemplo, typebot.co)." };
    }
    return { ok: true, valor: conEsquema };
}

/**
 * El nombre que se guarda: sin espacios de más, y con tope. Los espacios del
 * medio se juntan en uno porque dos nombres que solo se diferencian en eso se
 * leen igual en la pestaña.
 */
export function comoNombreDeIntegracion(texto: unknown): Veredicto<string> {
    const limpio = typeof texto === "string" ? texto.replace(/\s+/g, " ").trim() : "";
    if (!limpio) return { ok: false, motivo: "Escribe un nombre para la app." };
    if (limpio.length > LARGO_MAXIMO_DEL_NOMBRE) {
        return { ok: false, motivo: `El nombre admite hasta ${LARGO_MAXIMO_DEL_NOMBRE} caracteres.` };
    }
    return { ok: true, valor: limpio };
}

/** Cómo se comparan dos nombres: sin mayúsculas ni tildes, que en la pestaña se leen igual. */
export function laLlaveDelNombre(nombre: string): string {
    return nombre
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
}

/**
 * ¿Ya hay otra app con ese nombre? Dos pestañas iguales en Chats no se
 * distinguen, y no hay forma de saber cuál abre qué. `exceptoId` es la propia,
 * al editar.
 */
export function yaExisteElNombre(
    items: ReadonlyArray<{ id: string; name: string }>,
    nombre: string,
    exceptoId?: string,
): boolean {
    const llave = laLlaveDelNombre(nombre);
    return items.some((i) => i.id !== exceptoId && laLlaveDelNombre(i.name) === llave);
}

/** ¿Cabe una más? Las que ya pasaban del tope antes de que existiera se quedan. */
export function cabeOtra(cuantas: number): boolean {
    return cuantas < TOPE_DE_INTEGRACIONES;
}

/**
 * La dirección que se ABRE —en la pestaña de Chats o en «Abrir en nueva
 * pestaña»—, o `null` si no se puede abrir. Pasa por la misma regla que al
 * guardar, así que una fila vieja sin `https://` se abre bien y una con
 * `javascript:` no se abre nunca.
 */
export function laUrlQueSeAbre(url: string | null | undefined): string | null {
    const v = comoUrlDeIntegracion(url);
    return v.ok ? v.valor : null;
}

/**
 * La red de abajo del `<iframe>` común (`IframeRenderer`), que pintan también
 * Evo, Copiloto, Canva y las herramientas: ahí las direcciones las pone la
 * casa, así que se admite también una ruta de la propia App («/algo»). Lo único
 * que se cierra es un esquema que no sea web: `javascript:`, `data:`,
 * `vbscript:`… Se decide con el mismo analizador que usa el navegador, así que
 * «java\tscript:» o un espacio delante no se cuelan.
 */
export function sePuedeIncrustar(url: string | null | undefined): boolean {
    if (typeof url !== "string" || !url.trim()) return false;
    try {
        const u = new URL(url, "https://base.invalid");
        return u.protocol === "https:" || u.protocol === "http:";
    } catch {
        return false;
    }
}

/**
 * La lista de ids para reordenar, saneada: cadenas, sin repetir y con tope.
 * Un id repetido en el mismo reparto le daría dos posiciones a la misma fila.
 */
export function comoListaDeIds(ids: unknown): string[] {
    if (!Array.isArray(ids)) return [];
    const vistos = new Set<string>();
    for (const id of ids) {
        if (typeof id === "string" && id && !vistos.has(id)) vistos.add(id);
        if (vistos.size >= 200) break;
    }
    return [...vistos];
}
