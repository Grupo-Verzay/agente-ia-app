/**
 * Una conversación de Chats compartida en el chat del equipo.
 *
 * # Por qué es un DATO y no un enlace dentro del texto
 *
 * Hasta ahora, para que el equipo viera un caso de WhatsApp, el asesor copiaba
 * el texto a mano y lo explicaba. Lo que faltaba era poder señalar **la
 * conversación**, no contarla.
 *
 * Y la referencia viaja en columnas de la fila, no pegada dentro del mensaje.
 * Tres motivos:
 *
 * 1. **La burbuja pinta texto plano** (`whitespace-pre-wrap`). Una dirección
 *    escrita ahí no es pulsable, y ponerse a reconocer enlaces dentro del texto
 *    es la familia de fallo de la que va medio este proyecto.
 * 2. **Con el dato aparte, quien recibe puede comprobar el acceso ANTES de
 *    pintar el botón** y decir por qué no puede abrirlo, en vez de ofrecer un
 *    enlace que aterriza en una pantalla vacía.
 * 3. **El nombre y el número se COPIAN dentro**, como `autorNombre`: el mensaje
 *    sigue diciendo de quién se hablaba aunque después se borre el chat.
 *
 * Puro a propósito: de aquí tiran la pantalla de Chats, la del equipo y la
 * acción que publica. Es el mismo reparto de `canales-de-equipo` con
 * `chat-de-equipo-db`.
 */

/** Cuánto se deja escribir de contexto al compartir. */
export const TOPE_DEL_CONTEXTO = 500;

export type ChatCompartido = {
    /** La LÍNEA por la que va esa conversación. Nunca opcional, ver abajo. */
    linea: string;
    /** La identidad con la que se pide: la que se le devuelve a la pantalla. */
    jid: string;
    /**
     * Todas las identidades conocidas del contacto.
     *
     * La lista devuelve al contacto por la que Evolution dé esa vuelta, que no
     * tiene por qué ser la misma con la que se compartió. Preguntar por una
     * sola forma **devuelve correcto y vacío**, que es la regla de siempre de
     * Chats aplicada también aquí.
     */
    identidades: string[];
    /** Cómo se llama, copiado al compartir. */
    nombre: string | null;
    /**
     * Su teléfono, **copiado de lo que la pantalla ya sabe**.
     *
     * Nunca se deduce de un `@lid`: sus dígitos son un id de privacidad, no un
     * número, y fabricarlo daría un teléfono falso que además podría ser el de
     * otro contacto. Si no se sabe, va en nulo y no se enseña.
     */
    numero: string | null;
};

/**
 * A dónde lleva el botón.
 *
 * **La línea va dentro y no es opcional.** El mismo contacto tiene
 * conversación en dos líneas —le escribe a Ventas y a Atención, es lo normal—,
 * así que sin ella el aterrizaje elegiría «la primera fila que aparezca»: es
 * exactamente el fallo de `ownerForJid` y `lineaDelJid` que ya costó una sesión
 * con las marcas de borrado.
 *
 * La ruta ya existía (`?jid=` e `?instance=` en la página de Chats): esto no
 * inventa un camino nuevo, solo lo escribe en un sitio.
 */
export function aDondeLlevaElChat(ref: Pick<ChatCompartido, "linea" | "jid">): string {
    const jid = encodeURIComponent(ref.jid);
    const linea = encodeURIComponent(ref.linea);
    return `/chats?jid=${jid}&instance=${linea}`;
}

/**
 * Cómo se guarda lo que llega del navegador.
 *
 * Devuelve `null` cuando falta lo imprescindible —la línea o el jid—, y es
 * quien llama el que decide si eso es un error: aquí no se inventa ninguna de
 * las dos. Sin línea no hay a dónde llevar; sin jid no hay qué abrir.
 *
 * Las identidades se sanean y se deduplican **con la pedida delante**, porque
 * es la que se le devuelve a la pantalla.
 */
export function comoSeGuardaElChat(entra: {
    linea?: unknown;
    jid?: unknown;
    identidades?: unknown;
    nombre?: unknown;
    numero?: unknown;
}): ChatCompartido | null {
    const linea = texto(entra.linea);
    const jid = texto(entra.jid);
    if (!linea || !jid) return null;

    const otras = Array.isArray(entra.identidades)
        ? entra.identidades.map(texto).filter((v): v is string => Boolean(v))
        : [];

    return {
        linea,
        jid,
        identidades: Array.from(new Set([jid, ...otras])),
        nombre: texto(entra.nombre),
        numero: texto(entra.numero),
    };
}

function texto(v: unknown): string | null {
    if (typeof v !== "string") return null;
    const limpio = v.trim();
    return limpio || null;
}

/**
 * El número que se enseña, o nada.
 *
 * Un `@lid` **no se convierte**: se enseña solo lo que se copió al compartir.
 * Enseñar sus dígitos como si fueran un teléfono es peor que no enseñar nada,
 * porque parecen un número al que se puede llamar.
 */
export function elNumeroQueSeEnsena(ref: ChatCompartido): string | null {
    if (ref.numero) return ref.numero;

    // Se mira el DOMINIO, no la pinta de los dígitos. Un `@lid` y un grupo
    // (`@g.us`) también son dígitos, y solo se distinguen por ahí: fiarlo al
    // largo del número es que el día que un `@lid` tenga quince cifras se
    // enseñe como teléfono.
    const [digitos, dominio] = ref.jid.split("@");
    if (dominio !== "s.whatsapp.net" && dominio !== "c.us") return null;
    return /^\d{6,15}$/.test(digitos ?? "") ? digitos : null;
}
