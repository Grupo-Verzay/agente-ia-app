/**
 * En qué idioma escribe el cliente de una conversación.
 *
 * # Esta regla vive DOS veces, idéntica, a propósito
 *
 * `lib/idioma-del-cliente.ts` en la App y
 * `src/modules/ai-agent/idioma-del-cliente.ts` en el backend. La App la usa
 * para decidir si traduce lo que entra y lo que sale; el backend, para decirle
 * a la IA en qué idioma contestar. Si discreparan, la IA contestaría en inglés
 * a un cliente al que el panel trata como hispanohablante —o al revés—, y eso
 * no da ningún error. El banco de la App compara los dos ficheros byte a byte.
 *
 * # Sin IA, y por qué
 *
 * Decidir el idioma se hace en cada mensaje y en cada conversación abierta: con
 * un modelo sería un cobro por mirar. Es una cuenta de palabras frecuentes y de
 * alfabetos, gratis y determinista: el mismo texto da siempre el mismo idioma,
 * en la App y en el backend.
 *
 * # «Desde su primer mensaje», y un saludo suelto NO decide
 *
 * Se leen los primeros mensajes del cliente EN ORDEN y se acumula la cuenta; en
 * cuanto un idioma saca ventaja clara, ese es el de la conversación y ya no se
 * mueve aunque el cliente cambie después. Un «Hi» o un «ok» solos no bastan
 * (`VENTAJA_MINIMA`): un hispanohablante que saluda en inglés no puede recibir
 * la conversación entera en inglés. Hasta que haya certeza, **no hay idioma**, y
 * sin idioma la conversación sigue exactamente como hoy.
 */

export type Idioma =
    | "es" | "en" | "pt" | "fr" | "it" | "de" | "nl" | "tr"
    | "ru" | "uk" | "el" | "ar" | "he" | "hi" | "th" | "zh" | "ja" | "ko";

export const IDIOMA_DEL_PANEL: Idioma = "es";

/** Cómo se nombra cada idioma en pantalla y en las instrucciones a la IA. */
export const NOMBRE_DEL_IDIOMA: Record<Idioma, string> = {
    es: "español",
    en: "inglés",
    pt: "portugués",
    fr: "francés",
    it: "italiano",
    de: "alemán",
    nl: "neerlandés",
    tr: "turco",
    ru: "ruso",
    uk: "ucraniano",
    el: "griego",
    ar: "árabe",
    he: "hebreo",
    hi: "hindi",
    th: "tailandés",
    zh: "chino",
    ja: "japonés",
    ko: "coreano",
};

/** Cuántos mensajes del cliente se miran como mucho para decidir. */
export const MENSAJES_PARA_DECIDIR = 6;

/** Puntos de ventaja sobre el segundo idioma para darlo por decidido. */
export const VENTAJA_MINIMA = 2;

const PALABRAS: Record<"es" | "en" | "pt" | "fr" | "it" | "de" | "nl" | "tr", string[]> = {
    es: [
        "hola", "buenos", "buenas", "días", "dias", "tardes", "noches", "gracias", "quiero", "quisiera",
        "necesito", "cuanto", "cuánto", "cuesta", "cuestan", "precio", "precios", "favor", "el", "los",
        "las", "qué", "y", "un", "una", "es", "con", "mi", "tengo", "tiene", "tienen", "cómo", "está",
        "estoy", "información", "informacion", "donde", "dónde", "puedo", "usted", "ustedes", "hay",
        "pero", "más", "muy", "bien", "soy", "del", "al", "le", "les", "su", "sus", "este", "esta",
        "ese", "eso", "todo", "también", "ya", "cuando", "porque", "señor", "señora", "disculpe",
        "saludos", "ayuda", "algo", "hacer", "sobre", "venden", "envío", "envios", "pedido",
    ],
    en: [
        "hi", "hello", "hey", "good", "morning", "afternoon", "evening", "thanks", "thank", "you",
        "please", "i", "i'm", "im", "want", "need", "would", "like", "how", "much", "what", "is", "are",
        "the", "an", "and", "to", "of", "for", "my", "can", "could", "do", "does", "have", "has",
        "price", "prices", "information", "info", "where", "when", "it", "this", "that", "with", "your",
        "about", "we", "yes", "not", "am", "be", "get", "know", "just", "there", "any", "some", "order",
        "shipping", "help", "buy", "cost", "available",
    ],
    pt: [
        "olá", "oi", "bom", "boa", "dia", "tarde", "noite", "obrigado", "obrigada", "quero", "preciso",
        "quanto", "custa", "preço", "você", "voce", "vocês", "não", "nao", "sim", "é", "eu", "meu",
        "minha", "tem", "têm", "estou", "informação", "informações", "onde", "posso", "mais", "muito",
        "bem", "do", "dos", "das", "na", "um", "uma", "com", "pra", "e", "os",
        "também", "gostaria", "então", "tudo", "ajuda",
    ],
    fr: [
        "bonjour", "bonsoir", "salut", "merci", "je", "voudrais", "veux", "besoin", "combien", "prix",
        "s'il", "vous", "plaît", "plait", "le", "les", "des", "du", "et", "est", "une", "avec", "mon",
        "ma", "oui", "non", "pas", "comment", "où", "c'est", "j'ai", "avez", "êtes", "suis",
        "très", "aussi", "informations", "quel", "quelle", "pour", "nous", "aide",
    ],
    it: [
        "ciao", "buongiorno", "buonasera", "grazie", "voglio", "vorrei", "bisogno", "quanto", "costa",
        "prezzo", "per", "favore", "il", "gli", "di", "è", "con", "mio", "mia", "sì", "non", "come",
        "sono", "sei", "dove", "posso", "molto", "bene", "anche", "informazioni", "che", "della",
        "aiuto",
    ],
    de: [
        "hallo", "guten", "tag", "morgen", "abend", "danke", "bitte", "ich", "möchte", "moechte",
        "brauche", "wie", "viel", "kostet", "preis", "der", "die", "das", "und", "ist", "ein", "eine",
        "mit", "für", "fuer", "mein", "meine", "ja", "nein", "nicht", "wo", "kann", "sehr", "gut",
        "auch", "sie", "haben", "hilfe",
    ],
    nl: [
        "hallo", "hoi", "goedemorgen", "dank", "bedankt", "alstublieft", "ik", "wil", "graag", "hoeveel",
        "kost", "prijs", "het", "een", "is", "van", "met", "voor", "mijn", "ja", "nee", "niet",
        "hoe", "waar", "kan", "heel", "goed", "ook", "jullie", "u",
    ],
    tr: [
        "merhaba", "selam", "teşekkürler", "tesekkurler", "teşekkür", "lütfen", "lutfen", "ben",
        "istiyorum", "kadar", "fiyat", "bir", "bu", "için", "icin", "var", "yok", "evet",
        "hayır", "nasıl", "nerede",
    ],
};

/** Letras que solo un idioma escribe (o casi): valen más que una palabra. */
const LETRAS_PROPIAS: Array<{ idioma: keyof typeof PALABRAS; patron: RegExp; puntos: number }> = [
    { idioma: "es", patron: /[ñ¿¡]/, puntos: 2 },
    { idioma: "pt", patron: /[ãõ]|ção|ções/, puntos: 2 },
    { idioma: "de", patron: /ß/, puntos: 2 },
    { idioma: "tr", patron: /[şğı]/, puntos: 2 },
];

/** Los alfabetos que por sí solos dicen el idioma. */
const ALFABETOS: Array<{ idioma: Idioma; patron: RegExp }> = [
    { idioma: "ja", patron: /[぀-ヿ]/g },
    { idioma: "ko", patron: /[가-힯ᄀ-ᇿ]/g },
    { idioma: "zh", patron: /[一-鿿]/g },
    { idioma: "ar", patron: /[؀-ۿ]/g },
    { idioma: "he", patron: /[֐-׿]/g },
    { idioma: "el", patron: /[Ͱ-Ͽ]/g },
    { idioma: "hi", patron: /[ऀ-ॿ]/g },
    { idioma: "th", patron: /[฀-๿]/g },
    { idioma: "ru", patron: /[Ѐ-ӿ]/g },
];

const CONJUNTOS = Object.fromEntries(
    Object.entries(PALABRAS).map(([k, v]) => [k, new Set(v)]),
) as Record<keyof typeof PALABRAS, Set<string>>;

function lasPalabras(texto: string): string[] {
    return texto
        .toLowerCase()
        .replace(/https?:\/\/\S+/g, " ")
        .split(/[^\p{L}']+/u)
        .map((p) => p.replace(/^'+|'+$/g, ""))
        .filter(Boolean);
}

/** Cuántas letras tiene el texto: sin letras no hay idioma que mirar. */
export function cuantasLetras(texto: string): number {
    return (String(texto ?? "").match(/\p{L}/gu) ?? []).length;
}

/**
 * Los puntos de un texto suelto para cada idioma. Si un alfabeto no latino
 * domina, gana ese sin discusión (y se devuelve con ventaja de sobra).
 */
export function lasCuentasDelTexto(texto: string): Partial<Record<Idioma, number>> {
    const t = String(texto ?? "");
    const letras = cuantasLetras(t);
    if (letras === 0) return {};

    for (const { idioma, patron } of ALFABETOS) {
        const n = (t.match(patron) ?? []).length;
        if (n >= 2 && n * 2 >= letras) {
            // El cirílico ucraniano tiene letras que el ruso no usa.
            if (idioma === "ru" && /[іїєґ]/i.test(t)) return { uk: 10 };
            return { [idioma]: 10 };
        }
    }

    const cuentas: Partial<Record<Idioma, number>> = {};
    const sumar = (i: Idioma, p: number) => {
        cuentas[i] = (cuentas[i] ?? 0) + p;
    };
    for (const palabra of lasPalabras(t)) {
        for (const idioma of Object.keys(CONJUNTOS) as Array<keyof typeof PALABRAS>) {
            if (CONJUNTOS[idioma].has(palabra)) sumar(idioma, 1);
        }
    }
    const minusculas = t.toLowerCase();
    for (const { idioma, patron, puntos } of LETRAS_PROPIAS) {
        if (patron.test(minusculas)) sumar(idioma, puntos);
    }
    return cuentas;
}

/** El ganador de unas cuentas, solo si saca `VENTAJA_MINIMA` al segundo. */
export function elGanador(cuentas: Partial<Record<Idioma, number>>): Idioma | null {
    const orden = (Object.entries(cuentas) as Array<[Idioma, number]>)
        .filter(([, n]) => n > 0)
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    if (!orden.length) return null;
    const [primero, segundo] = orden;
    if (primero[1] < VENTAJA_MINIMA) return null;
    if (segundo && primero[1] - segundo[1] < VENTAJA_MINIMA) return null;
    return primero[0];
}

/** El idioma de UN texto suelto, o `null` si no se puede decir con certeza. */
export function elIdiomaDelTexto(texto: string): Idioma | null {
    return elGanador(lasCuentasDelTexto(texto));
}

/**
 * El idioma de la conversación, leyendo los primeros mensajes del cliente en
 * el orden en que llegaron. Se acumula mensaje a mensaje y se decide en el
 * primero en que hay ventaja clara; lo que venga después no lo mueve.
 */
export function elIdiomaDeLaConversacion(primerosMensajes: string[]): Idioma | null {
    const cuentas: Partial<Record<Idioma, number>> = {};
    let mirados = 0;
    for (const m of primerosMensajes) {
        if (mirados >= MENSAJES_PARA_DECIDIR) break;
        if (cuantasLetras(m) === 0) continue;
        mirados++;
        for (const [idioma, n] of Object.entries(lasCuentasDelTexto(m)) as Array<[Idioma, number]>) {
            cuentas[idioma] = (cuentas[idioma] ?? 0) + n;
        }
        const ganador = elGanador(cuentas);
        if (ganador) return ganador;
    }
    return null;
}

/** ¿Hace falta traducir? Solo si hay idioma y no es el del panel. */
export function esOtroIdioma(idioma: Idioma | null | undefined): idioma is Idioma {
    return Boolean(idioma) && idioma !== IDIOMA_DEL_PANEL;
}

/** Lo que se lee para un código de idioma que llega de fuera. */
export function comoIdioma(valor: unknown): Idioma | null {
    return typeof valor === "string" && valor in NOMBRE_DEL_IDIOMA ? (valor as Idioma) : null;
}
