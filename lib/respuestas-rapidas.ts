/**
 * Las reglas de las respuestas rápidas que se pueden decidir sin pintar nada.
 *
 * Puro, sin imports de servidor: lo usan la pantalla (`/auto-replies`), las
 * acciones (`actions/rr-actions.ts`) y los tres sitios de Chats que ofrecen una
 * respuesta —la barra «/», el panel de Atajos y «Nueva conversación»—. Con la
 * regla escrita en cada uno, el día que se afine una las otras se quedan atrás,
 * y eso no se ve como un error: se ve como una respuesta que en un sitio sale y
 * en otro no.
 *
 * # Hay DOS clases de respuesta, y se distinguen por el flujo
 *
 * | | qué guarda | qué hace al usarla |
 * | --- | --- | --- |
 * | de **texto** | un mensaje, y opcionalmente un atajo | manda ese texto |
 * | de **flujo** | un flujo del creador de flujos, y un nombre | ejecuta el flujo |
 *
 * Lo que las separa es `workflowId`, y nada más: el nombre se escribe distinto
 * en cada una (ver `elNombreQueSeGuarda`).
 */

import { sinTildes } from "@/lib/pantalla-de-notas";

export type TipoDeRespuesta = "texto" | "flujo";

type ConFlujo = { workflowId?: string | null };

/** De qué clase es una respuesta. Un flujo vacío no es un flujo. */
export function elTipoDeLaRespuesta(respuesta: ConFlujo): TipoDeRespuesta {
    return String(respuesta.workflowId ?? "").trim() ? "flujo" : "texto";
}

/**
 * El atajo de una respuesta de texto, como se guarda y como se teclea en Chats.
 *
 * En Chats se escribe «/» y lo que siga: una palabra, en minúsculas y sin
 * espacios. Así que el atajo es eso mismo, venga como venga:
 *
 * - **sin la barra delante**: la pone quien teclea. Guardada, en Chats salía
 *   «//bienvenida» — hay una fila así en producción.
 * - **en minúsculas**: la tarjeta lo PASABA A MAYÚSCULAS al editarlo mientras
 *   el formulario de crear lo pasaba a minúsculas, así que el mismo atajo se
 *   guardaba de dos formas según por dónde se tocara.
 * - **sin espacios**: con un espacio dentro no se puede teclear, porque el
 *   espacio corta la sugerencia de la barra.
 *
 * Devuelve `""` cuando no queda nada: un atajo vacío es «sin atajo».
 */
export function comoAtajo(texto: string | null | undefined): string {
    return String(texto ?? "")
        .replace(/^\/+/, "")
        .replace(/\s+/g, "")
        .toLowerCase()
        .slice(0, TOPE_DEL_ATAJO);
}

/** Lo más largo que puede ser un atajo. Nadie teclea más que esto tras la «/». */
export const TOPE_DEL_ATAJO = 40;

/** Lo más largo que puede ser el nombre de una respuesta de flujo. */
export const TOPE_DEL_NOMBRE = 80;

/**
 * El nombre que se guarda, según la clase de respuesta.
 *
 * En una de texto es el ATAJO (`comoAtajo`); en una de flujo es un nombre libre
 * —«Bienvenida al cliente»— que solo se recorta. Devuelve `null` cuando no queda
 * nada, para que se pueda QUITAR el nombre: con `undefined` Prisma no toca la
 * columna, y borrar el atajo en la tarjeta no borraba nada.
 */
export function elNombreQueSeGuarda(nombre: string | null | undefined, tipo: TipoDeRespuesta): string | null {
    const limpio =
        tipo === "texto"
            ? comoAtajo(nombre)
            : String(nombre ?? "").trim().replace(/\s+/g, " ").slice(0, TOPE_DEL_NOMBRE);
    return limpio || null;
}

/**
 * Cómo se ENSEÑA el nombre: «/atajo» en una de texto, el nombre tal cual en una
 * de flujo. `null` si no tiene. Es lo mismo que pinta Chats en su barra «/»,
 * para que lo que se lee aquí sea lo que se teclea allí.
 */
export function elNombreQueSeVe(nombre: string | null | undefined, tipo: TipoDeRespuesta): string | null {
    const guardado = elNombreQueSeGuarda(nombre, tipo);
    if (!guardado) return null;
    return tipo === "texto" ? `/${guardado}` : guardado;
}

// ── Lo que se ofrece en Chats ────────────────────────────────────────────────

type OpcionDeChats = {
    name: string | null;
    message: string;
    workflowId: string | null;
    workflowName: string | null;
};

/**
 * Lo que dice una respuesta en una lista de Chats: su mensaje, o qué flujo
 * ejecuta. Una de flujo no tiene mensaje, y pintada tal cual salía como una
 * fila en blanco.
 */
export function loQueDiceLaRespuesta(opcion: OpcionDeChats): string {
    const mensaje = opcion.message.trim();
    if (mensaje) return mensaje;
    if (elTipoDeLaRespuesta(opcion) === "flujo") {
        return opcion.workflowName ? `Ejecuta el flujo «${opcion.workflowName}»` : "Ejecuta un flujo";
    }
    return "";
}

/**
 * ¿Sale en la barra «/» de Chats al teclear `consulta`?
 *
 * Solo las de TEXTO con atajo: elegir una en la barra PONE su mensaje en la caja
 * de escribir, y una de flujo no tiene mensaje que poner — dejaría la caja vacía
 * y se leería como que la sugerencia no hizo nada. Las de flujo se lanzan desde
 * el panel de Atajos (⚡), que las ejecuta.
 */
export function seSugiereConLaBarra(opcion: OpcionDeChats, consulta: string): boolean {
    if (elTipoDeLaRespuesta(opcion) !== "texto" || !opcion.message.trim()) return false;
    const atajo = comoAtajo(opcion.name);
    return Boolean(atajo) && atajo.startsWith(comoAtajo(consulta));
}

/**
 * ¿Se le puede ofrecer esta respuesta a Chats? Una de texto necesita su mensaje
 * y una de flujo su flujo. Antes se exigía el MENSAJE a las dos, así que una
 * respuesta de flujo no salía en ningún sitio de Chats — que es justo donde se
 * usa.
 */
export function seOfreceEnChats(respuesta: { mensaje?: string | null; workflowId?: string | null }): boolean {
    if (elTipoDeLaRespuesta(respuesta) === "flujo") return true;
    return Boolean(String(respuesta.mensaje ?? "").trim());
}

// ── La pantalla: filtros y búsqueda ──────────────────────────────────────────

export type FiltroDeTipo = "todas" | TipoDeRespuesta;

/** «Todas las categorías». No es una categoría: es no filtrar por ella. */
export const TODAS_LAS_CATEGORIAS = "todas";

export type Filtros = { tipo: FiltroDeTipo; categoria: string; busqueda: string };

export const SIN_FILTROS: Filtros = { tipo: "todas", categoria: TODAS_LAS_CATEGORIAS, busqueda: "" };

type Fila = { name?: string | null; mensaje?: string | null; workflowId?: string | null; category?: string | null };

/**
 * ¿Pasa esta fila la búsqueda? Mira el nombre, el mensaje, el flujo que ejecuta
 * y su categoría, **sin tildes y sin mayúsculas**: quien teclea «envio» tiene
 * que encontrar «Envío». Es la misma función de Mis notas, no una copia.
 */
export function pasaLaBusqueda(
    fila: Fila,
    busqueda: string,
    nombreDelFlujo: string,
    etiquetaDeLaCategoria: string,
): boolean {
    const consulta = sinTildes(busqueda.trim());
    if (!consulta) return true;
    const texto = sinTildes(
        [fila.name ?? "", fila.mensaje ?? "", nombreDelFlujo, etiquetaDeLaCategoria].join(" "),
    );
    return texto.includes(consulta);
}

/** ¿Pasa los filtros de tipo y categoría? La categoría llega ya normalizada. */
export function pasaLosFiltros(fila: Fila, filtros: Pick<Filtros, "tipo" | "categoria">, categoria: string): boolean {
    if (filtros.tipo !== "todas" && elTipoDeLaRespuesta(fila) !== filtros.tipo) return false;
    if (filtros.categoria !== TODAS_LAS_CATEGORIAS && categoria !== filtros.categoria) return false;
    return true;
}

/** Cuántas hay de cada tipo, para las pastillas. Salen de la lista entera, no de la filtrada. */
export function losNumerosPorTipo(filas: readonly Fila[]): Record<FiltroDeTipo, number> {
    let texto = 0;
    let flujo = 0;
    for (const fila of filas) {
        if (elTipoDeLaRespuesta(fila) === "flujo") flujo += 1;
        else texto += 1;
    }
    return { todas: filas.length, texto, flujo };
}

/** ¿Hay algún filtro puesto? Entonces la lista no se puede ordenar. */
export function hayFiltroPuesto(filtros: Filtros): boolean {
    return (
        filtros.tipo !== "todas" ||
        filtros.categoria !== TODAS_LAS_CATEGORIAS ||
        filtros.busqueda.trim().length > 0
    );
}

/**
 * Por qué no se puede arrastrar ahora, o `null` si se puede.
 *
 * Con un filtro o una búsqueda puestos, la lista que se ve es un TROZO de la de
 * verdad: moviendo una fila ahí no hay forma de saber entre qué dos escondidas
 * cae. Antes se arrastraba igual y se guardaba el trozo numerado desde cero, así
 * que las escondidas perdían su sitio y saltaban al quitar el filtro — que es
 * cuando ya nadie relaciona las dos cosas. Es la regla de los tableros de esta
 * casa: con un filtro puesto no se reordena, y se dice.
 */
export function porQueNoSePuedeOrdenar(filtros: Filtros): string | null {
    return hayFiltroPuesto(filtros) ? "Quita la búsqueda y los filtros para reordenar la lista." : null;
}

// ── El orden ─────────────────────────────────────────────────────────────────

/**
 * El orden nuevo de la lista ENTERA, dejando en su sitio lo que no se movió.
 *
 * `completa` son todas las respuestas de la cuenta en su orden de ahora; `pedida`
 * es la lista que quien arrastró tiene delante, ya reordenada. Quien no manda en
 * la cuenta no ve las respuestas personales de sus compañeros, así que su lista
 * es más corta que la de verdad: guardarla numerada desde cero dejaría las
 * escondidas en cualquier sitio.
 *
 * Así que se hace al revés: los HUECOS que ocupan en `completa` las que se ven
 * se reparten en el orden de `pedida`, y lo que no se ve se queda exactamente
 * donde estaba. Un id de `pedida` que no está en `completa` se ignora — no es
 * una fila de esta cuenta.
 */
export function elOrdenConLasDemasEnSuSitio(completa: readonly number[], pedida: readonly number[]): number[] {
    const enLaCuenta = new Set(completa);
    const vistos = new Set<number>();
    const nuevas: number[] = [];
    for (const id of pedida) {
        if (enLaCuenta.has(id) && !vistos.has(id)) {
            vistos.add(id);
            nuevas.push(id);
        }
    }
    let siguiente = 0;
    return completa.map((id) => (vistos.has(id) ? nuevas[siguiente++] : id));
}

/**
 * El número de orden de una respuesta recién creada: por delante de todas.
 *
 * Nacía con el 0 de la columna, empatada con la primera o perdida en medio, y
 * con miles de respuestas el empate lo deshacía la base a su antojo. Crear algo
 * y no verlo se lee como que no se creó, así que sale la primera — y el orden
 * de las demás, entre ellas, no se mueve.
 */
export function elOrdenDeUnaNueva(ordenes: readonly number[]): number {
    const validos = ordenes.filter((n) => Number.isFinite(n));
    return validos.length === 0 ? 0 : Math.min(...validos) - 1;
}
