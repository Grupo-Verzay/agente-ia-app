/**
 * Las reglas de la pantalla de Mis notas (`/notas`) que se pueden decidir sin
 * pintar nada. Puro: lo usan la pantalla y las acciones, y el banco lo prueba
 * sin base ni navegador (`scripts/banco-notas.sh`).
 *
 * Cada una arregla algo que la pantalla hacía mal sin decir nada:
 *
 *   - `alPulsarUnaCarpeta`: la primera pulsación en una carpeta la
 *     seleccionaba Y la plegaba, así que había que pulsar dos veces para ver
 *     sus notas.
 *   - `elPatronDeBusqueda`: el buscador solo encontraba por el TÍTULO. La
 *     búsqueda en el cuerpo (`string_contains` sobre la raíz del JSON) nunca
 *     encontraba nada, porque el cuerpo de una nota es un árbol, no una cadena.
 *   - `contarPalabras`: el pie contaba las claves del JSON («type», «doc»,
 *     «paragraph»…), no las palabras escritas.
 *   - `elMensajeDeLaListaVacia`: una lista vacía decía «Sin notas aquí» tanto
 *     si no había notas como si la búsqueda no casaba con ninguna.
 *   - `laNotaSigueEnLaVista`: una nota solo entraba en una carpeta si se CREABA
 *     con esa carpeta abierta. No había forma de mover a una carpeta una nota
 *     que ya existía, así que lo escrito antes de crear la carpeta se quedaba
 *     suelto para siempre.
 */

/** Las vistas del panel de la izquierda. */
export type VistaDeNotas = "todas" | "sueltas" | "compartidas" | "archivo" | "carpeta";

export const COMPARTIDAS = "__shared__";
export const ARCHIVO = "__archived__";

/**
 * Qué vista es un `activeFolderId` de la pantalla: `undefined` son todas,
 * `null` las que no tienen carpeta, y dos valores especiales para Compartidas y
 * Archivo; cualquier otro es el id de una carpeta.
 */
export function laVista(activeFolderId: string | null | undefined): VistaDeNotas {
    if (activeFolderId === undefined) return "todas";
    if (activeFolderId === null) return "sueltas";
    if (activeFolderId === COMPARTIDAS) return "compartidas";
    if (activeFolderId === ARCHIVO) return "archivo";
    return "carpeta";
}

/**
 * Qué hace pulsar una carpeta del panel. Una carpeta que no es la abierta se
 * ABRE desplegada —es para lo que se pulsa: ver sus notas—; pulsar la que ya
 * está abierta solo la pliega o la despliega, sin volver a pedir sus notas.
 *
 * Lo de antes alternaba el plegado en CADA pulsación, también en la primera, y
 * como una carpeta nace desplegada, abrirla la dejaba plegada: había que
 * pulsar otra vez para ver lo que tenía dentro.
 */
export function alPulsarUnaCarpeta(p: { esLaActiva: boolean; estaPlegada: boolean }): {
    seleccionar: boolean;
    plegada: boolean;
} {
    if (!p.esLaActiva) return { seleccionar: true, plegada: false };
    return { seleccionar: false, plegada: !p.estaPlegada };
}

/**
 * Las letras con tilde que el buscador trata como si no la llevaran, y en qué
 * se convierten. Es UNA lista y la usan los dos lados: la consulta (con
 * `translate` de Postgres, que no necesita ninguna extensión) y lo que se
 * teclea (`sinTildes`). Con dos listas, un día «cafe» encontraría «Café» en el
 * título y no en el cuerpo.
 */
export const LETRAS_CON_TILDE = "áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ";
export const LETRAS_SIN_TILDE = "aaaaaeeeeiiiiooooouuuuncaaaaaeeeeiiiiooooouuuunc";

/** Quita las tildes con la MISMA lista que la consulta, y pasa a minúsculas. */
export function sinTildes(texto: string): string {
    let fuera = "";
    for (const c of texto) {
        const i = LETRAS_CON_TILDE.indexOf(c);
        fuera += i >= 0 ? LETRAS_SIN_TILDE[i] : c;
    }
    return fuera.toLowerCase();
}

/**
 * El patrón `LIKE` de lo que se busca, o `null` si no hay nada que buscar.
 *
 * Se escapan `\`, `%` y `_`: quien busca «50%» busca eso, no «50 y lo que
 * venga». Sin escapar, un `_` suelto casaría con cualquier letra.
 */
export function elPatronDeBusqueda(q: string | null | undefined): string | null {
    const limpio = (q ?? "").trim();
    if (!limpio) return null;
    const escapado = sinTildes(limpio).replace(/[\\%_]/g, (m) => `\\${m}`);
    return `%${escapado}%`;
}

/** Cuántas palabras tiene un texto ya aplanado. */
export function contarPalabras(texto: string): number {
    const palabras = texto.trim().split(/\s+/).filter(Boolean);
    return palabras.length;
}

/** El pie de la nota: «1 palabra», no «1 palabras». */
export function elRotuloDePalabras(n: number): string {
    return n === 1 ? "1 palabra" : `${n} palabras`;
}

/** Qué dice una lista vacía: por qué está vacía, no solo que lo está. */
export function elMensajeDeLaListaVacia(p: { vista: VistaDeNotas; busqueda?: string | null }): string {
    const q = (p.busqueda ?? "").trim();
    if (q) return `Ninguna nota coincide con «${q}».`;
    switch (p.vista) {
        case "todas":
            return "Aún no tienes notas.";
        case "sueltas":
            return "No tienes notas sin carpeta.";
        case "carpeta":
            return "Esta carpeta está vacía.";
        case "archivo":
            return "No tienes notas archivadas.";
        case "compartidas":
            return "Aún no te han compartido notas.";
    }
}

/**
 * Con una búsqueda puesta NO se reordena. Arrastrar guarda la posición de las
 * notas que se VEN (0, 1, 2…), así que con la lista filtrada las que quedaron
 * escondidas se quedarían con su número de antes y, al quitar la búsqueda,
 * saldrían revueltas con las que se acaban de colocar. Es la misma regla que
 * los tableros: con un filtro puesto no se reordena la columna.
 */
export function sePuedeReordenar(busqueda: string | null | undefined): boolean {
    return !(busqueda ?? "").trim();
}

export const AVISO_SIN_REORDENAR = "Quita la búsqueda para reordenar las notas";

/** Lo que se lee en una nota vacía: no promete atajos que el editor no tiene. */
export const PLACEHOLDER_DE_LA_NOTA = "Escribe tu nota aquí…";

/**
 * El «⋯» de una fila sale al pasar el ratón, y también con el foco del teclado
 * y en una pantalla táctil, donde no hay ratón que pasar. Solo con
 * `group-hover`, en un móvil no había forma de fijar ni eliminar una nota
 * desde la lista, ni de editar una carpeta.
 */
export const MANDO_QUE_APARECE_AL_PASAR =
    "invisible group-hover:visible group-focus-within:visible data-[state=open]:visible [@media(hover:none)]:visible";

/**
 * El nombre de un contacto en «Vincular contacto»: el puesto a mano manda
 * sobre el de WhatsApp, que es el mismo criterio de la bandeja. Antes solo se
 * miraba el de WhatsApp, así que un contacto renombrado salía con otro nombre
 * aquí que en Chats.
 */
export function nombreDelContacto(s: { customName?: string | null; pushName?: string | null }): string {
    return s.customName?.trim() || s.pushName?.trim() || "Sin nombre";
}

/** La lista vacía se ve IGUAL en las cinco vistas. */
export const CLASE_DE_LA_LISTA_VACIA = "px-4 py-6 text-center text-xs text-muted-foreground";

/**
 * Si una nota que se acaba de mover a `carpetaNueva` (`null` = sin carpeta)
 * sigue en la lista que se está mirando. Todas y Archivo enseñan las notas
 * estén en la carpeta que estén; Sueltas, solo las que no tienen; una carpeta,
 * solo las suyas. Sin esto, mover una nota fuera de la carpeta abierta la
 * dejaba pintada en ella hasta recargar.
 */
export function laNotaSigueEnLaVista(activeFolderId: string | null | undefined, carpetaNueva: string | null): boolean {
    const vista = laVista(activeFolderId);
    if (vista === "todas" || vista === "archivo") return true;
    if (vista === "sueltas") return carpetaNueva === null;
    if (vista === "compartidas") return false;
    return carpetaNueva === activeFolderId;
}

/** Lo que se dice al mover: A DÓNDE fue, que es lo único que no se ve. */
export function elAvisoDeMover(nombreDeLaCarpeta: string | null): string {
    return nombreDeLaCarpeta ? `Nota movida a «${nombreDeLaCarpeta}»` : "Nota movida a Sueltas";
}
