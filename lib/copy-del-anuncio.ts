/**
 * El COPY de un anuncio: el texto del post que acompaña a la imagen generada
 * en AI imágenes.
 *
 * La pantalla generaba la imagen y nada más: había que escribir el post a mano
 * en cada red. Lo que faltaba no era otra pantalla, era el texto — y el texto
 * **no es el mismo en las tres redes**, así que lo que decide cómo se pide y
 * cómo se lee vive aquí, puro, y no dentro de la acción.
 *
 * LA REGLA, y de ella cuelga el resto:
 *
 *   **La red sale del FORMATO de la vista previa, no de un selector nuevo.**
 *   `1:1` es un post de Instagram, `9:16` una historia de WhatsApp y `16:9` un
 *   post de Facebook — es lo que ya dice `AD_FORMATS` en la pantalla. Con un
 *   segundo mando, la imagen se vería en un formato y el copy hablaría de otra
 *   red, y eso no se ve como un error: se ve como un texto que no pega con lo
 *   que hay encima.
 *
 * Y la segunda, que es la que hace que la promesa sea cierta:
 *
 *   **Lo que una red no soporta se QUITA al leer, no solo se pide en el
 *   prompt.** WhatsApp no indexa hashtags: ahí son texto muerto. Pedirle al
 *   modelo que no los ponga es una instrucción que a veces se ignora, y
 *   entonces el copy de una historia sale con seis etiquetas que no llevan a
 *   ninguna parte. Se pide **y** se comprueba.
 */

/** Los tres formatos de la vista previa, tal cual los tiene la pantalla. */
export type FormatoDelAnuncio = "1:1" | "9:16" | "16:9";

export type RedDelCopy = "instagram" | "whatsapp" | "facebook";

export interface ReglaDeLaRed {
    /** Como se llama en la pantalla, para que el panel y la vista previa digan lo mismo. */
    nombre: string;
    /** Cuántos hashtags se le piden. **Cero es una decisión, no un olvido.** */
    hashtags: number;
    /** Lo que cabe sin que la red lo corte. */
    topeDeCaracteres: number;
    /** Qué clase de texto es, en las palabras con las que se le pide al modelo. */
    instruccion: string;
}

/**
 * Cero hashtags en WhatsApp no es un descuido: **WhatsApp no los indexa**, así
 * que ahí una etiqueta es una palabra con una almohadilla delante que no lleva
 * a ningún sitio. Facebook los admite y casi nadie los usa, así que van pocos;
 * Instagram es la única de las tres donde de verdad traen gente.
 */
export const LAS_REDES: Record<RedDelCopy, ReglaDeLaRed> = {
    instagram: {
        nombre: "Post Instagram",
        hashtags: 6,
        topeDeCaracteres: 700,
        instruccion:
            "Pie de un post de feed de Instagram. La PRIMERA línea es el gancho: es lo único que se lee antes del «… más», así que tiene que funcionar sola. Después 2 o 4 líneas cortas, separadas por saltos de línea, con emojis con medida (uno por línea como mucho).",
    },
    whatsapp: {
        nombre: "Story / WhatsApp",
        hashtags: 0,
        topeDeCaracteres: 320,
        instruccion:
            "Mensaje de estado de WhatsApp. Se lee en tres segundos y de pie: máximo 3 líneas muy cortas, sin párrafos. Tono de persona que escribe a un cliente, no de anuncio.",
    },
    facebook: {
        nombre: "Post Facebook",
        hashtags: 2,
        topeDeCaracteres: 900,
        instruccion:
            "Post de Facebook. Tono conversacional y algo más largo: un gancho, 2 o 3 frases que cuenten el beneficio y el cierre. Menos emojis que en Instagram.",
    },
};

const RED_DEL_FORMATO: Record<FormatoDelAnuncio, RedDelCopy> = {
    "1:1": "instagram",
    "9:16": "whatsapp",
    "16:9": "facebook",
};

/**
 * Un formato que no se reconoce cae en Instagram, que es el que la vista previa
 * enseña por defecto. **Nunca se queda sin red**: sin ella no habría copy que
 * generar, y un panel vacío se lee como que la función no existe.
 */
export function laRedDelFormato(formato: string | undefined | null): RedDelCopy {
    if (formato && formato in RED_DEL_FORMATO) return RED_DEL_FORMATO[formato as FormatoDelAnuncio];
    return "instagram";
}

/**
 * La llave con la que se guardan la imagen y su copy.
 *
 * Es UNA función y no la plantilla escrita en cada sitio: **el copy que se ve
 * tiene que ser el de la imagen que se ve**, y con dos formas de construir la
 * llave el día que una cambie el panel enseñaría el texto de otra vista sin dar
 * ningún error.
 */
export function laLlaveDeLaVista(plantilla: string, formato: string): string {
    return `${plantilla}_${formato}`;
}

export interface DatosDelCopy {
    formato: string;
    /** La estructura de marketing elegida (hero, oferta, cta…), con su descripción. */
    plantilla?: string;
    /** El estilo visual, para que el tono del texto no contradiga a la imagen. */
    estilo?: string;
    /** «Detalles específicos del anuncio»: lo único donde el dueño pone datos duros. */
    detalles?: string;
    /** El ADN visual. */
    adn?: string;
}

/** Lo que se le pide al modelo. Puro, para poder leerlo sin levantar nada. */
export function instruccionesDelCopy(datos: DatosDelCopy): string {
    const red = laRedDelFormato(datos.formato);
    const regla = LAS_REDES[red];

    const conHashtags =
        regla.hashtags > 0
            ? `Cierra con ${regla.hashtags} hashtags como máximo, todos juntos en la última línea.`
            : "NO escribas hashtags: en WhatsApp no llevan a ninguna parte y solo ensucian el mensaje.";

    const contexto = [
        datos.plantilla ? `- Etapa del embudo: ${datos.plantilla}` : "",
        datos.estilo ? `- Estilo visual de la pieza: ${datos.estilo}` : "",
        datos.adn ? `- Ambiente de la imagen: ${datos.adn}` : "",
        datos.detalles ? `- Datos del anuncio que dio el anunciante: ${datos.detalles}` : "",
    ]
        .filter(Boolean)
        .join("\n");

    return `Eres redactor publicitario. Escribe el TEXTO del post que acompaña a la imagen que te adjunto.

RED: ${regla.nombre}.
${regla.instruccion}

${contexto || "- No hay datos adicionales del anunciante."}

REGLAS:
- Español neutro de Colombia. Habla del producto que se ve EN LA IMAGEN.
- Termina con un llamado a la acción claro y en una línea propia.
- ${conHashtags}
- No pases de ${regla.topeDeCaracteres} caracteres en total.
- NO inventes precios, descuentos, plazos de envío, garantías ni testimonios: solo los que estén escritos arriba. Si no hay ninguno, el llamado a la acción invita a escribir por el chat.
- Devuelve ÚNICAMENTE el texto del post, listo para pegar. Sin comillas, sin títulos, sin explicaciones y sin decir cuál es el gancho.`;
}

/** Quita las comillas o las vallas de código con las que el modelo a veces envuelve el texto. */
function sinEnvoltura(texto: string): string {
    let limpio = texto.trim();

    const valla = limpio.match(/^```[a-z]*\n([\s\S]*?)\n?```$/i);
    if (valla) limpio = valla[1].trim();

    if (limpio.length > 1) {
        const abre = limpio[0];
        const cierra = limpio[limpio.length - 1];
        const comillas = ['"', "'", "«", "“"];
        const cierres = ['"', "'", "»", "”"];
        const i = comillas.indexOf(abre);
        if (i >= 0 && cierra === cierres[i] && !limpio.slice(1, -1).includes("\n\n")) {
            limpio = limpio.slice(1, -1).trim();
        }
    }

    return limpio;
}

/**
 * Un hashtag es una almohadilla con **al menos una letra** detrás.
 *
 * Sin esa condición, quitar los hashtags de una historia de WhatsApp se
 * llevaría por delante el «#1» de «el #1 en ventas», que no es una etiqueta:
 * es parte de la frase.
 */
const UN_HASHTAG = /#(?=[\p{L}\p{N}_]*\p{L})[\p{L}\p{N}_]+/gu;

/** Corta sin partir una palabra por la mitad: un texto cortado a hueso se lee como un fallo. */
export function recortarSinPartirPalabras(texto: string, tope: number): string {
    if (texto.length <= tope) return texto;
    const corte = texto.slice(0, tope);
    const ultimo = Math.max(corte.lastIndexOf(" "), corte.lastIndexOf("\n"));
    return (ultimo > tope * 0.6 ? corte.slice(0, ultimo) : corte).trimEnd();
}

/**
 * Lo que de verdad se enseña: el texto del modelo pasado por las reglas de su
 * red. Se aplica **al leer** y no solo al pedir, porque una instrucción del
 * prompt el modelo la cumple casi siempre y «casi» no basta.
 */
export function comoSeLeeElCopy(crudo: string | null | undefined, formato: string): string {
    if (!crudo) return "";
    const regla = LAS_REDES[laRedDelFormato(formato)];

    let texto = sinEnvoltura(String(crudo));

    if (regla.hashtags === 0) {
        texto = texto.replace(UN_HASHTAG, "").replace(/[ \t]{2,}/g, " ");
    }

    texto = texto
        .split("\n")
        .map((linea) => linea.replace(/[ \t]+$/, ""))
        .join("\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();

    return recortarSinPartirPalabras(texto, regla.topeDeCaracteres);
}

/** Cuánto le queda al copy antes de pasarse de lo que la red admite. */
export function loQueCabeTodavia(texto: string, formato: string): number {
    return LAS_REDES[laRedDelFormato(formato)].topeDeCaracteres - texto.length;
}

/* ── Lo que le pasó a Gemini ─────────────────────────────────────────────── */

export type CausaDeGemini = "sin_clave" | "clave_rechazada" | "cuota" | "desconocida";

/**
 * Por qué falló una llamada a Gemini, en palabras que se puedan usar.
 *
 * Está aquí y no dentro de cada llamador porque la pregunta es UNA y la hacen
 * dos: el ciclo que genera las imágenes y el que genera el copy. Con la lista
 * copiada en cada sitio, el día que Google cambie el texto de un rechazo uno de
 * los dos seguiría diciendo «error desconocido» sobre una clave caducada.
 *
 * Y **lo que no se reconoce NO es mudo**: devuelve su propio mensaje con el
 * detalle dentro. Un fallo sin mensaje se ve como una imagen que no salió y
 * nadie sabe por qué — que es como estaba el ciclo de imágenes antes de esto.
 */
export function porQueFalloGemini(error: unknown): { causa: CausaDeGemini; mensaje: string; detiene: boolean } {
    const crudo = String((error as Error)?.message ?? error ?? "");
    const texto = crudo.toLowerCase();

    if (texto.includes("falta la api key de gemini")) {
        return {
            causa: "sin_clave",
            mensaje: "No tienes una API key de Google configurada. Ve a Mi Perfil para agregarla.",
            detiene: true,
        };
    }
    if (
        texto.includes("permission_denied") ||
        texto.includes("unregistered callers") ||
        texto.includes("api key should be set") ||
        texto.includes("api key not valid")
    ) {
        return {
            causa: "clave_rechazada",
            mensaje: "Google rechazó la API key. Verifica que sea válida en Mi Perfil → Configurar proveedor.",
            detiene: true,
        };
    }
    if (texto.includes("429") || texto.includes("quota") || texto.includes("resource_exhausted")) {
        return {
            causa: "cuota",
            mensaje: "Límite de cuota de Google alcanzado.",
            detiene: true,
        };
    }

    return {
        causa: "desconocida",
        mensaje: crudo.trim() ? `Google no respondió: ${crudo.trim()}` : "Google no respondió.",
        detiene: false,
    };
}
