/**
 * Texto guardado dos veces codificado («mojibake»), y cómo deshacerlo.
 *
 * En pantalla se ve así: `cÃ¡lculo` en vez de `cálculo`, `informaciÃ³n` en vez
 * de `información`, `â€"` en vez de `—`. Son los bytes UTF-8 del texto bueno
 * leídos como si fueran de un juego de un byte, y vueltos a guardar como UTF-8.
 *
 * **Esto no se arregla en la conexión ni en las cabeceras.** El daño ya está en
 * los caracteres: para la base, para la API y para el navegador, `Ã¡` son dos
 * letras perfectamente válidas y todos las transportan bien. Lo único que se
 * puede hacer es volver a los bytes originales.
 *
 * Y no es cosmético: la descripción de cada herramienta se le pasa al modelo
 * tal cual (`description: cfg.toolDescription`, en `ai-agent.service.ts` del
 * backend), así que el agente venía leyendo eso.
 *
 * El módulo es **puro**: entra una cadena y sale otra. Lo usan la reparación de
 * la base y el guardado, para que los dos apliquen exactamente la misma regla.
 */

/**
 * Con qué juego se leyó mal.
 *
 * Los acentos vuelven con `latin-1`, pero los **emojis solo vuelven con
 * `cp1252`**: su forma rota lleva `Å¸`, `â€œ` y compañía, que latin-1 ni
 * siquiera puede representar.
 *
 * Y hay un tercer caso, que es el que aparece de verdad en los emojis
 * compuestos: **cp1252 dejando pasar los caracteres de control** (0x80-0x9F).
 * Un `🧑‍💼` lleva dentro un separador invisible (ZWJ) cuyos bytes incluyen
 * `0x8D`, que cp1252 no tiene y latin-1 sí. Una misma línea acaba mezclando los
 * dos, así que ningún juego puro la puede deshacer entera. Se prueban los tres,
 * de más específico a menos.
 */
const JUEGOS = ["cp1252+c1", "cp1252", "latin-1"] as const;

/**
 * Señales de que ESTE texto puede estar roto.
 *
 * Es un filtro previo, no la prueba: sirve para no intentar reparar los miles
 * de textos sanos que se leen en cada pasada. Quien decide es el viaje de ida y
 * vuelta de más abajo.
 */
const PISTAS = /Ã.|â€|Â[¡¿ªº°»«]|ðŸ|Ãƒ/;

/** El carácter de sustitución. Si aparece, la reparación empeoró el texto. */
const EMPEORO = /�/;

/** Lo que cp1252 pone en 0x80-0x9F y latin-1 no tiene. */
const CP1252_ALTOS: Record<number, number> = {
    0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85,
    0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a,
    0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92,
    0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
    0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c,
    0x017e: 0x9e, 0x0178: 0x9f,
};

function unByte(c: number, juego: (typeof JUEGOS)[number]): number | null {
    if (juego === "latin-1") return c <= 0xff ? c : null;
    if (c in CP1252_ALTOS) return CP1252_ALTOS[c];
    // En cp1252 puro, el rango 0x80-0x9F solo lo ocupan los de arriba: un
    // carácter suelto ahí no puede venir de ese juego. Con `+c1` sí: es el
    // mismo byte, y es lo que hace que los emojis compuestos se puedan deshacer.
    if (c >= 0x80 && c <= 0x9f) return juego === "cp1252+c1" ? c : null;
    return c <= 0xff ? c : null;
}

function aBytes(texto: string, juego: (typeof JUEGOS)[number]): Uint8Array | null {
    const bytes = new Uint8Array(texto.length);
    for (let i = 0; i < texto.length; i++) {
        const b = unByte(texto.charCodeAt(i), juego);
        if (b === null) return null;
        bytes[i] = b;
    }
    return bytes;
}

/**
 * Devuelve el texto reparado, o `null` si no hacía falta (o si no se puede).
 *
 * La prueba es objetiva y conservadora: solo se repara lo que **vuelve a ser un
 * UTF-8 válido y distinto**. Un texto sano no la pasa y se queda como está, que
 * es justo lo que se quiere, porque esto se ejecuta sobre datos de clientes.
 */
export function repararTextoDoblementeCodificado(texto: string): string | null {
    if (!texto || !PISTAS.test(texto)) return null;

    for (const juego of JUEGOS) {
        const bytes = aBytes(texto, juego);
        if (!bytes) continue;
        let salida: string;
        try {
            salida = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
        } catch {
            continue;
        }
        if (salida !== texto && !EMPEORO.test(salida)) return salida;
    }
    return null;
}

/** El texto ya reparado, o el mismo si no lo necesitaba. Para usar al vuelo. */
export function textoLimpio<T extends string | null | undefined>(texto: T): T {
    if (typeof texto !== "string") return texto;
    return (repararTextoDoblementeCodificado(texto) ?? texto) as T;
}
