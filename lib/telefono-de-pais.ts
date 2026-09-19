/**
 * Armar un número de WhatsApp con su indicativo, **sin repetirlo**.
 *
 * Es **puro** y no importa nada: lo usan la ficha pública —que corre en el
 * navegador de alguien que no tiene cuenta— y la acción que guarda el ticket.
 * Las dos tienen que llegar al mismo número, y por eso es una sola función y no
 * una comprobación en cada lado.
 *
 * # El problema, con el caso que lo define
 *
 * La persona elige su país en el selector y después escribe el número **como lo
 * tiene guardado en el teléfono**, que muchas veces ya trae el indicativo
 * dentro. Si se pega el indicativo delante sin mirar, sale un número imposible
 * —`5757300…`— y el aviso de «resuelto» se va al vacío meses después, que es
 * cuando peor se arregla.
 *
 * Y recortar «si empieza por el indicativo» **no basta**, porque hay países que
 * comparten el suyo y se distinguen por el **código de área**:
 *
 * | escrito | con `+1809` elegido | qué es |
 * | --- | --- | --- |
 * | `18091234567` | recorta `1809` | el número entero |
 * | `8091234567` | recorta `809` | sin el `1` de delante |
 * | `8291234567` | **cambia a `+1829`** y recorta `829` | otra área dominicana |
 * | `1234567` | no recorta nada | el nacional pelado |
 *
 * Por eso se decide por **longitud esperada del país y por código de área**, no
 * por «empieza por el indicativo».
 *
 * # La regla que no se puede ablandar: en la duda, NO se recorta
 *
 * Un recorte de más produce un número **perfectamente creíble** que le
 * pertenece a otra persona; uno de menos produce uno que rebota, que se ve. Así
 * que solo se recorta cuando lo que queda **encaja con una longitud conocida**;
 * si ninguna encaja, se deja lo escrito tal cual y se dice que no cuadra.
 *
 * Y encima de eso, **la pantalla enseña el número final antes de enviar**. Es
 * la mitad que de verdad protege: una regla que se equivoca en silencio es la
 * familia del «999999999 de -1 créditos».
 */

/** El indicativo tal y como lo ofrece el selector, con su `+`. */
export type IndicativoDisponible = string;

/**
 * Cuántos dígitos van **después** del indicativo, por país.
 *
 * La llave es el indicativo sin `+`, o sea la misma cadena que ofrece el
 * selector de países (`actions/get-country-action`). Los que traen varias
 * longitudes las traen porque de verdad conviven —Brasil con 10 y 11, Alemania
 * con 10 y 11—, no por si acaso.
 *
 * Lo que NO está aquí cae en `LARGOS_POR_DEFECTO`, que es a propósito
 * permisivo: inventarle una longitud a un país que no se ha comprobado es
 * rechazar números buenos, y eso se ve como que la ficha no funciona.
 */
export const LARGOS_NACIONALES: Record<string, readonly number[]> = {
    // América
    "1": [10],
    "1809": [7], "1829": [7], "1849": [7], // República Dominicana
    "1876": [7], // Jamaica
    "1787": [7], "1939": [7], // Puerto Rico
    "52": [10], // México
    "57": [10], // Colombia
    "58": [10], // Venezuela
    "51": [9], // Perú
    "56": [9], // Chile
    "54": [10], // Argentina
    "55": [10, 11], // Brasil
    "593": [9], // Ecuador
    "591": [8], // Bolivia
    "595": [9], // Paraguay
    "598": [8], // Uruguay
    "502": [8], "503": [8], "504": [8], "505": [8], "506": [8], "507": [8],
    "53": [8], // Cuba
    "509": [8], // Haití
    // Europa
    "34": [9], "33": [9], "351": [9], "31": [9], "32": [9], "41": [9],
    "43": [10], "39": [9, 10], "49": [10, 11], "44": [10], "353": [9],
    "46": [9], "47": [8], "45": [8], "358": [9], "48": [9], "40": [9],
    "30": [10], "420": [9], "421": [9], "36": [9], "359": [9], "385": [9],
    "381": [9], "387": [8], "355": [9], "380": [9], "375": [9], "370": [8],
    // Asia, África y Oceanía
    "7": [10], "90": [10], "86": [11], "81": [10], "82": [9, 10], "91": [10],
    "62": [9, 10, 11], "63": [10], "66": [9], "84": [9], "60": [9, 10],
    "65": [8], "61": [9], "64": [8, 9], "27": [9], "20": [10], "212": [9],
    "234": [10], "254": [9], "971": [9], "966": [9], "972": [9], "92": [10],
    "880": [10], "98": [10], "964": [10], "962": [9], "961": [8], "965": [8],
    "968": [8], "973": [8], "974": [8], "886": [9], "94": [9], "95": [9, 10],
    "977": [10], "998": [9], "994": [9], "995": [9], "93": [9], "213": [9],
    "216": [8], "218": [9], "221": [9], "233": [9], "237": [9], "243": [9],
    "249": [9], "251": [9], "255": [9], "256": [9], "258": [9], "263": [9],
    "967": [9], "963": [9], "855": [8, 9],
};

/**
 * Lo que se admite cuando el país no está en la tabla.
 *
 * Ancho a propósito: un número nacional del mundo real cae entre seis y doce
 * dígitos, y estrechar esto por pulcritud es rechazar a alguien que sí existe.
 */
export const LARGOS_POR_DEFECTO: readonly number[] = [6, 7, 8, 9, 10, 11, 12];

/** Solo dígitos. La gente escribe espacios, guiones, paréntesis y un `+`. */
export function soloDigitos(valor: string | null | undefined): string {
    return String(valor ?? "").replace(/\D+/g, "");
}

function largosDe(codigo: string): readonly number[] {
    return LARGOS_NACIONALES[codigo] ?? LARGOS_POR_DEFECTO;
}

/**
 * El indicativo de un número ya armado: el **más largo** de la lista con el que
 * empieza.
 *
 * El más largo y no el primero: `18091234567` empieza por `1` y por `1809`, y
 * quedarse con `1` diría «Estados Unidos» de un número dominicano. Es la misma
 * trampa que el `.find(Boolean)` de las marcas de borrado, por otra puerta.
 */
export function elIndicativoDeUnNumero(
    numero: string | null | undefined,
    indicativos: readonly IndicativoDisponible[],
): string | null {
    const digitos = soloDigitos(numero);
    if (!digitos) return null;

    let mejor: string | null = null;
    for (const opcion of indicativos) {
        const codigo = soloDigitos(opcion);
        if (!codigo || !digitos.startsWith(codigo)) continue;
        // Y que lo que queda sea un nacional plausible: sin esto, un número
        // corto que empieza por `1` se leería como de Estados Unidos.
        if (!largosDe(codigo).includes(digitos.length - codigo.length)) continue;
        if (!mejor || codigo.length > soloDigitos(mejor).length) mejor = `+${codigo}`;
    }
    return mejor;
}

export type NumeroArmado = {
    /** Lo que se guarda y por donde se avisa: solo dígitos, con indicativo. */
    e164: string;
    /** Cómo se enseña antes de enviar: `+57 3001234567`. */
    comoSeVe: string;
    /**
     * El indicativo que de verdad se usó. Puede **no** ser el elegido: escribir
     * un `829…` con `+1809` puesto lo corrige a `+1829`.
     */
    indicativo: string;
    /** Lo que se quitó de delante, si se quitó algo. Para poder decirlo. */
    recortado: string | null;
    /** Por qué no vale. `null` = vale. */
    problema: string | null;
};

/**
 * El número final, a partir del indicativo elegido y de lo que se escribió.
 *
 * `indicativos` son todos los que ofrece el selector: hacen falta para
 * reconocer un **área hermana** —`+1829` cuando está puesto `+1809`— y para
 * saber qué parte del indicativo es el código de país y cuál el área.
 */
export function armarElNumero(entrada: {
    indicativo: string;
    escrito: string;
    indicativos: readonly IndicativoDisponible[];
}): NumeroArmado {
    const elegido = soloDigitos(entrada.indicativo);
    const digitos = soloDigitos(entrada.escrito);

    const vacio = (problema: string): NumeroArmado => ({
        e164: "",
        comoSeVe: "",
        indicativo: elegido ? `+${elegido}` : "",
        recortado: null,
        problema,
    });

    if (!elegido) return vacio("Elige el país.");
    if (!digitos) return vacio("Escribe tu número de WhatsApp.");

    const todos = Array.from(
        new Set(entrada.indicativos.map(soloDigitos).filter(Boolean)),
    );
    if (!todos.includes(elegido)) todos.push(elegido);

    // La RAÍZ del indicativo elegido: el código de país propiamente dicho. Es
    // el más corto de la lista que sea prefijo estricto suyo — para `1809` es
    // `1`, y para `57` no hay ninguno, así que la raíz es él mismo.
    const raiz = todos
        .filter((c) => c.length < elegido.length && elegido.startsWith(c))
        .sort((a, b) => a.length - b.length)[0] ?? elegido;

    // Las hermanas: los demás indicativos de la misma raíz. Para `+1809` son el
    // resto de áreas del `+1`, y son las que hacen falta para corregir a quien
    // eligió una y escribió otra.
    const hermanas = todos.filter((c) => c !== raiz && c.startsWith(raiz));

    /** Cada forma en que puede venir escrito un prefijo, y con qué se queda. */
    const candidatos: Array<{ prefijo: string; indicativo: string }> = [];
    for (const codigo of [elegido, ...hermanas]) {
        // El indicativo entero: `1809`.
        candidatos.push({ prefijo: codigo, indicativo: codigo });
        // Y solo su área: `809`, que es como lo tiene guardado casi todo el
        // mundo en su propio país.
        const area = codigo.slice(raiz.length);
        if (area) candidatos.push({ prefijo: area, indicativo: codigo });
    }
    // La raíz sola va la ÚLTIMA y con el indicativo elegido: es el prefijo más
    // corto y el que más fácil se come un dígito bueno.
    candidatos.push({ prefijo: raiz, indicativo: elegido });

    // De más largo a más corto: `1809` antes que `809`, y `809` antes que `1`.
    // Al revés, quitar el `1` dejaría `8091234567` como nacional dominicano de
    // diez dígitos, que no existe.
    candidatos.sort((a, b) => b.prefijo.length - a.prefijo.length);

    const armar = (codigo: string, nacional: string, recortado: string | null): NumeroArmado => ({
        e164: `${codigo}${nacional}`,
        comoSeVe: `+${codigo} ${nacional}`,
        indicativo: `+${codigo}`,
        recortado,
        problema: null,
    });

    for (const { prefijo, indicativo } of candidatos) {
        if (prefijo.length >= digitos.length) continue;
        if (!digitos.startsWith(prefijo)) continue;
        const resto = digitos.slice(prefijo.length);
        if (!largosDe(indicativo).includes(resto.length)) continue;
        return armar(indicativo, resto, prefijo);
    }

    // Nada encajaba recortando. Si lo escrito ya es un nacional de la longitud
    // del país, es que venía pelado y no había nada que quitar.
    if (largosDe(elegido).includes(digitos.length)) return armar(elegido, digitos, null);

    // Y si tampoco, **no se recorta a ojo**: se dice que no cuadra, con la
    // longitud que se esperaba. Un recorte adivinado da un número de otra
    // persona, y eso no se nota hasta que el aviso no llega.
    const esperado = largosDe(elegido);
    return {
        e164: "",
        comoSeVe: "",
        indicativo: `+${elegido}`,
        recortado: null,
        problema:
            esperado === LARGOS_POR_DEFECTO
                ? "Ese número no parece completo. Revísalo."
                : `Para ese país el número lleva ${esperado.join(" o ")} dígitos después del indicativo.`,
    };
}
