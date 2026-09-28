/**
 * Los dos pasos de menú del creador de flujos:
 *
 * - `menu`             → «Menú de opciones»: opciones numeradas en TEXTO.
 * - `menu-interactivo` → «Menú con botones»: las mismas opciones como lista
 *                         desplegable (o botones) de WhatsApp, vía WAHA.
 *
 * Son el MISMO paso con dos formas de entregarse, y comparten todo: pregunta,
 * opciones (una por línea, tope 10), ramas (`opt-N`), reintentos, aviso y qué
 * pasa al agotarlos. Por eso el editor pinta los dos con el mismo bloque.
 *
 * Esta regla tiene que ser LA MISMA que la del backend
 * (`src/modules/workflow/menu-de-opciones.ts` en api-webhook), porque de ella
 * salen cosas que deben cuadrar: los conectores que se dibujan en el editor y
 * las ramas que el motor elige; lo que la vista previa enseña y lo que le
 * llega al cliente. Si aquí saliera una opción de más, esa rama se podría
 * conectar en pantalla y no llevaría a ningún sitio.
 */

export const TIPO_MENU = "menu";
export const TIPO_MENU_INTERACTIVO = "menu-interactivo";

export function esNodoDeMenu(tipo?: string | null): boolean {
    const t = (tipo ?? "").trim().toLowerCase();
    return t === TIPO_MENU || t === TIPO_MENU_INTERACTIVO;
}

export function esMenuInteractivo(tipo?: string | null): boolean {
    return (tipo ?? "").trim().toLowerCase() === TIPO_MENU_INTERACTIVO;
}

/**
 * Tope de opciones, el mismo en los dos pasos. Coincide con el máximo de filas
 * de una lista de WhatsApp (10), así que ninguna opción se queda fuera.
 */
export const MAX_OPCIONES_MENU = 10;

/** Los topes de WhatsApp: fila de lista 24, botón 20, botón de la lista 20. */
export const TOPE_TITULO_DE_FILA = 24;
export const TOPE_TEXTO_DE_BOTON = 20;
export const TOPE_BOTON_DE_LISTA = 20;
export const TOPE_TITULO_DE_LISTA = 60;
/** WhatsApp no admite más de 3 botones de respuesta. */
export const TOPE_DE_BOTONES = 3;
export const TEXTO_DEL_BOTON_POR_DEFECTO = "Ver opciones";

export type EstiloDeMenu = "lista" | "botones";
export type RendicionDeMenu = "rama" | "ia";

/** Lo que no se entienda cae en «lista», que funciona con 1 a 10 opciones. */
export function comoEstiloDeMenu(raw?: string | null): EstiloDeMenu {
    return (raw ?? "").trim().toLowerCase() === "botones" ? "botones" : "lista";
}

/** Lo que no se entienda cae en «rama», como se comportaba el menú siempre. */
export function comoRendicion(raw?: string | null): RendicionDeMenu {
    return (raw ?? "").trim().toLowerCase() === "ia" ? "ia" : "rama";
}

export function comoTextoDelBoton(raw?: string | null): string {
    const t = (raw ?? "").trim();
    return recortar(t || TEXTO_DEL_BOTON_POR_DEFECTO, TOPE_BOTON_DE_LISTA);
}

export function parseMenuOptions(raw?: string | null): string[] {
    if (!raw) return [];
    return raw
        .split("\n")
        .map((linea) => linea.trim())
        .filter((linea) => linea.length > 0)
        .slice(0, MAX_OPCIONES_MENU);
}

/**
 * El identificador del conector de la opción N (empezando en 1).
 *
 * Es el `sourceHandle` que se guarda en la arista y el que el motor busca al
 * decidir por dónde seguir. En el menú con botones es además el `rowId` de la
 * fila, así que tocar una opción ya dice la rama.
 */
export function menuOptionHandle(numero: number): string {
    return `opt-${numero}`;
}

/** Cómo se le va a ver al cliente el menú de texto, para la vista previa. */
export function buildMenuPreview(pregunta: string, opciones: string[]): string {
    const lista = opciones.map((opcion, i) => `${i + 1}) ${opcion}`).join("\n");
    const encabezado = pregunta.trim();
    return encabezado ? `${encabezado}\n\n${lista}` : lista;
}

export function recortar(texto: string, tope: number): string {
    const t = (texto ?? "").trim();
    if (t.length <= tope) return t;
    return `${t.slice(0, Math.max(1, tope - 1)).trimEnd()}…`;
}

const normalizar = (v: string) =>
    (v ?? "")
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();

/**
 * Los rótulos que ve el cliente en cada fila o botón: recortados al tope de
 * WhatsApp y, si dos recortados quedan iguales, numerados todos. Misma regla
 * que el backend: lo que enseña la vista previa es lo que le llega.
 */
export function rotulosDeLasOpciones(opciones: string[], tope: number): string[] {
    const sueltos = opciones.map((o) => recortar(o, tope));
    const vistos = new Set(sueltos.map(normalizar));
    if (vistos.size === sueltos.length) return sueltos;
    return opciones.map((o, i) => recortar(`${i + 1}. ${o}`, tope));
}

/** La forma en que va a salir: botones solo si se pidieron y caben. */
export function formaDelMenuInteractivo(estilo: EstiloDeMenu, opciones: string[]): EstiloDeMenu {
    return estilo === "botones" && opciones.length <= TOPE_DE_BOTONES ? "botones" : "lista";
}

/**
 * `intentionMaxAttempts` guarda INTENTOS —el primero cuenta— y la pantalla
 * enseña REINTENTOS: con 2 reintentos el cliente tiene 3 oportunidades. De 0 a
 * 5 reintentos (1 a 6 intentos). El backend usa el mismo tope.
 */
export const MAX_REINTENTOS_MENU = 5;

export function reintentosDeIntentos(intentos: unknown): number {
    const n = Math.floor(Number(intentos));
    if (!Number.isFinite(n) || n < 1) return 2;
    return Math.min(n, MAX_REINTENTOS_MENU + 1) - 1;
}

export function intentosDeReintentos(reintentos: unknown): number {
    const n = Math.floor(Number(reintentos));
    if (!Number.isFinite(n) || n < 0) return 3;
    return Math.min(n, MAX_REINTENTOS_MENU) + 1;
}

/**
 * Los conectores de salida de un paso, en orden. La usan el lienzo —para
 * conectar solo un paso nuevo al primero libre— y el nodo —para dibujarlos—,
 * así no pueden discrepar: un conector que el nodo no dibuja es una conexión
 * que nadie ve y el motor no sigue.
 */
export function conectoresDeSalida(
    nodo?: { tipo?: string | null; menuOptions?: string | null; menuFallback?: string | null } | null,
): string[] {
    const tipo = (nodo?.tipo ?? "").trim().toLowerCase();
    if (tipo === "intention") return ["yes", "no"];
    if (esNodoDeMenu(tipo)) {
        const opciones = parseMenuOptions(nodo?.menuOptions).map((_, i) => menuOptionHandle(i + 1));
        return comoRendicion(nodo?.menuFallback) === "rama" ? [...opciones, "no"] : opciones;
    }
    return ["out"];
}
