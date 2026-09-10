/**
 * El formato de WhatsApp: negrilla, cursiva, tachado y monoespaciado.
 *
 * WhatsApp no manda formato: manda **marcas dentro del texto plano**
 * —`*negrilla*`, `_cursiva_`, `~tachado~`, ```monoespaciado```— y cada cliente
 * las pinta. O sea que enviar ya funcionaba solo; lo que faltaba de nuestro lado
 * era pintarlas, porque la burbuja sacaba el texto tal cual y el asesor veía los
 * asteriscos que su cliente sí ve en negrilla.
 *
 * OJO con copiar el editor de otras bandejas: Chatwoot y compañía escriben
 * **markdown** (`**negrilla**`, con dos asteriscos). Aquí no vale: con dos
 * asteriscos WhatsApp deja uno a la vista. La barra de botones
 * (`FormatoDeTexto.tsx`) escribe marcas de WhatsApp a propósito, y este lector
 * entiende esas mismas.
 *
 * Este fichero es **puro**: entra una cadena y salen nodos. No sabe de React ni
 * toca el DOM, así que se puede comprobar con un `node -e` de tres líneas.
 */

/** Un trozo de texto ya interpretado. */
export type NodoDeTexto =
    | { tipo: "texto"; texto: string }
    /** `mono` no lleva hijos: dentro no se interpreta nada, como en WhatsApp. */
    | { tipo: "mono"; texto: string }
    | { tipo: "negrilla" | "cursiva" | "tachado"; hijos: NodoDeTexto[] };

/** Las marcas que envuelven, con el nodo que produce cada una. */
const MARCAS = {
    "*": "negrilla",
    _: "cursiva",
    "~": "tachado",
} as const;

type Marca = keyof typeof MARCAS;

/**
 * Hasta dónde se anida.
 *
 * WhatsApp deja combinar (`*_las dos_*`) y con tres niveles se cubre cualquier
 * cosa que alguien escriba a mano. El tope está para que un mensaje raro
 * —cincuenta asteriscos seguidos— no se convierta en una recursión que bloquee
 * la pestaña: la conversación se repinta a cada mensaje que entra.
 */
const PROFUNDIDAD_MAXIMA = 3;

/**
 * A partir de aquí no se interpreta nada y se devuelve el texto tal cual.
 *
 * Un mensaje normal son doscientos caracteres; esto es para el pegote de veinte
 * mil que alguien reenvía. Vale más enseñarlo con sus asteriscos que dejar la
 * conversación pensando.
 */
const LARGO_MAXIMO = 20_000;

/** ¿Es letra o número? Se usa para no romper `snake_case` ni `2*3*4`. */
function esAlfanumerico(c: string | undefined): boolean {
    if (!c) return false;
    return /[\p{L}\p{N}]/u.test(c);
}

function esEspacio(c: string | undefined): boolean {
    if (!c) return true;
    return /\s/.test(c);
}

/**
 * ¿Abre aquí una marca, y dónde cierra?
 *
 * Las tres condiciones son las de WhatsApp, y cada una está por un caso real:
 *
 * 1. **Ni justo antes ni justo después puede haber letra o número.** Sin esto,
 *    `nombre_de_variable` sale en cursiva y `2*3*4` en negrilla. Es el fallo
 *    clásico de los lectores caseros de markdown.
 * 2. **Nada de espacio pegado por dentro.** `* hola *` en WhatsApp se ve con sus
 *    asteriscos, así que aquí igual.
 * 3. **El contenido no puede estar vacío.** `**` es dos asteriscos, no una
 *    negrilla de nada.
 */
function dondeCierra(texto: string, marca: Marca, inicio: number): number {
    if (esAlfanumerico(texto[inicio - 1])) return -1;
    if (esEspacio(texto[inicio + 1])) return -1;

    for (let j = inicio + 1; j < texto.length; j++) {
        if (texto[j] !== marca) continue;
        if (j === inicio + 1) return -1; // vacío
        if (esEspacio(texto[j - 1])) continue; // espacio pegado por dentro
        if (esAlfanumerico(texto[j + 1])) continue;
        return j;
    }
    return -1;
}

/** Dónde cierra el monoespaciado que abre en `inicio`, o -1. */
function dondeCierraMono(texto: string, inicio: number, largo: number): number {
    const cierre = texto.indexOf("`".repeat(largo), inicio + largo);
    if (cierre === -1) return -1;
    if (cierre === inicio + largo) return -1; // vacío
    return cierre;
}

function interpretar(texto: string, profundidad: number): NodoDeTexto[] {
    const nodos: NodoDeTexto[] = [];
    let suelto = "";

    const soltarTexto = () => {
        if (suelto) {
            nodos.push({ tipo: "texto", texto: suelto });
            suelto = "";
        }
    };

    for (let i = 0; i < texto.length; i++) {
        const c = texto[i];

        if (c === "`") {
            // Tres para el bloque de WhatsApp, uno para el de toda la vida.
            const largo = texto.startsWith("```", i) ? 3 : 1;
            const cierre = dondeCierraMono(texto, i, largo);
            if (cierre !== -1) {
                soltarTexto();
                nodos.push({ tipo: "mono", texto: texto.slice(i + largo, cierre) });
                i = cierre + largo - 1;
                continue;
            }
            suelto += c;
            continue;
        }

        const tipo = MARCAS[c as Marca];
        if (tipo && profundidad < PROFUNDIDAD_MAXIMA) {
            const cierre = dondeCierra(texto, c as Marca, i);
            if (cierre !== -1) {
                soltarTexto();
                nodos.push({
                    tipo,
                    hijos: interpretar(texto.slice(i + 1, cierre), profundidad + 1),
                });
                i = cierre;
                continue;
            }
        }

        suelto += c;
    }

    soltarTexto();
    return nodos;
}

/**
 * El texto de un mensaje, partido en trozos con su formato.
 *
 * Lo que no case con una marca completa se queda como estaba: un mensaje
 * cortado a la mitad —la burbuja recorta a 250 caracteres hasta que se pulsa
 * «Ver más»— puede dejar una marca sin cerrar, y entonces se ve el asterisco,
 * que es justo lo que hace WhatsApp.
 */
export function leerFormatoDeWhatsapp(texto: string): NodoDeTexto[] {
    if (!texto) return [];
    if (texto.length > LARGO_MAXIMO) return [{ tipo: "texto", texto }];
    return interpretar(texto, 0);
}

/** ¿Vale la pena interpretar esto? Sirve para no montar nodos de más. */
export function pareceLlevarFormato(texto: string): boolean {
    return /[*_~`]/.test(texto);
}

/** Lo que hay que dejar en el cuadro de texto después de pulsar un botón. */
export type SeleccionEnvuelta = {
    texto: string;
    /** Dónde queda la selección después, para no perder de vista lo escrito. */
    inicio: number;
    fin: number;
};

/**
 * Envuelve lo seleccionado con una marca, o se la quita si ya la tenía.
 *
 * Es lo que hacen los cuatro botones de la barra y los atajos de teclado. Se
 * queda aquí, fuera del componente, porque es puro manejo de cadenas y porque
 * así los dos caminos —ratón y teclado— no pueden acabar haciendo cosas
 * distintas.
 *
 * Tres detalles que parecen menores y no lo son:
 *
 * 1. **Los espacios de los bordes se quedan fuera.** Al seleccionar una palabra
 *    con doble clic el navegador suele llevarse el espacio de después, y
 *    `*hola *` en WhatsApp se ve con el asterisco puesto (ver `dondeCierra`).
 * 2. **Vuelve a pulsar y se quita.** Sin esto, marcar dos veces deja
 *    `**hola**`, que es markdown y en WhatsApp deja los asteriscos a la vista.
 * 3. **Sin nada seleccionado se abre el par y el cursor queda en medio**, para
 *    escribir ya dentro.
 */
export function envolverSeleccion(
    texto: string,
    inicio: number,
    fin: number,
    marca: string,
): SeleccionEnvuelta {
    const desde = Math.max(0, Math.min(inicio, fin));
    const hasta = Math.min(texto.length, Math.max(inicio, fin));

    if (desde === hasta) {
        return {
            texto: texto.slice(0, desde) + marca + marca + texto.slice(hasta),
            inicio: desde + marca.length,
            fin: desde + marca.length,
        };
    }

    const crudo = texto.slice(desde, hasta);
    const izquierda = crudo.length - crudo.trimStart().length;
    const derecha = crudo.length - crudo.trimEnd().length;
    const nucleo = crudo.slice(izquierda, crudo.length - derecha);

    // Solo espacios: no hay nada que marcar.
    if (!nucleo) return { texto, inicio: desde, fin: hasta };

    const sangriaIzq = crudo.slice(0, izquierda);
    const sangriaDer = crudo.slice(crudo.length - derecha);

    // ¿Ya estaba marcado? Puede estar dentro de la selección (`*hola*`) o justo
    // fuera de ella (se seleccionó `hola` y en el texto pone `*hola*`).
    const dentro =
        nucleo.length > marca.length * 2 &&
        nucleo.startsWith(marca) &&
        nucleo.endsWith(marca);
    if (dentro) {
        const limpio = nucleo.slice(marca.length, nucleo.length - marca.length);
        return {
            texto: texto.slice(0, desde) + sangriaIzq + limpio + sangriaDer + texto.slice(hasta),
            inicio: desde + sangriaIzq.length,
            fin: desde + sangriaIzq.length + limpio.length,
        };
    }

    const antes = texto.slice(0, desde + izquierda);
    const despues = texto.slice(hasta - derecha);
    const fuera = antes.endsWith(marca) && despues.startsWith(marca);
    if (fuera) {
        const nuevo = antes.slice(0, antes.length - marca.length) + nucleo + despues.slice(marca.length);
        return {
            texto: nuevo,
            inicio: desde + izquierda - marca.length,
            fin: desde + izquierda - marca.length + nucleo.length,
        };
    }

    const nuevo = antes + marca + nucleo + marca + despues;
    return {
        texto: nuevo,
        inicio: desde + izquierda + marca.length,
        fin: desde + izquierda + marca.length + nucleo.length,
    };
}
