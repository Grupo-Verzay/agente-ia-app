/**
 * Las reglas de Mis formularios (`/mis-formularios`), en un solo sitio y puras.
 *
 * Las usan la lista, el editor, los registros, el formulario público
 * (`/f/...`), las acciones del servidor y la guía (`lib/guia-formularios.ts`).
 * Estaban escritas a mano en cada pantalla, y por eso cada una decía una cosa:
 *
 * - **El enlace público** se armaba con el id de QUIEN MIRA
 *   (`/f/<persona>/<slug>`), así que el de alguien del equipo apuntaba a un
 *   formulario que no existe bajo su id. Y la tarjeta enseñaba
 *   `/f/<8 letras>.../slug`, que no se puede copiar. Ahora lo arma
 *   `elEnlaceDelFormulario`, con la cuenta DUEÑA del formulario y su URL
 *   personalizada si la tiene.
 * - **El slug** quitaba cada letra con tilde: «Encuesta de satisfacción» salía
 *   «encuesta-de-satisfaccin». Va con la regla del enlace del catálogo, que
 *   quita la tilde y deja la letra (`comoNombreDelEnlace`).
 * - **Las variables de WhatsApp** (`{{Pregunta}}`) se sustituían con una
 *   expresión regular armada con la pregunta TAL CUAL: con un «?» o un «(» la
 *   variable no se reemplazaba —el cliente recibía `{{¿Cuál es tu nombre?}}`—
 *   y con un paréntesis sin cerrar la expresión revienta y el envío se cae.
 *   `elMensajeDeWhatsapp` sustituye el texto literal.
 * - **La pestaña de Google Sheets** se buscaba comparando el nombre exacto, y
 *   Google no deja dos pestañas que solo se diferencian en mayúsculas: con el
 *   formulario «Proceso de atencion» y la pestaña «PROCESO DE ATENCION», cada
 *   registro fallaba con «A sheet with the name … already exists» (visto en
 *   producción). `laPestanaDelFormulario` la encuentra sin mirar mayúsculas.
 */
import { comoNombreDelEnlace, comoSeEscribeElNombre } from "@/lib/enlace-del-catalogo";

export type TipoDeCampo =
    | "text" | "textarea" | "select" | "radio" | "multiselect"
    | "checkbox" | "file" | "number" | "money" | "date" | "time"
    | "email" | "phone" | "url";

/**
 * Los tipos de campo, en el orden del desplegable del editor y con el nombre
 * que se ve. La guía los nombra desde aquí, así que un tipo nuevo sin su
 * nombre en la guía la pone en rojo.
 */
export const TIPOS_DE_CAMPO: ReadonlyArray<{ tipo: TipoDeCampo; nombre: string }> = [
    { tipo: "text", nombre: "Texto corto" },
    { tipo: "textarea", nombre: "Área de texto" },
    { tipo: "select", nombre: "Desplegable" },
    { tipo: "radio", nombre: "Selección simple" },
    { tipo: "multiselect", nombre: "Selección múltiple" },
    { tipo: "checkbox", nombre: "Aceptación (casilla)" },
    { tipo: "file", nombre: "Archivo / Documento" },
    { tipo: "number", nombre: "Número" },
    { tipo: "money", nombre: "Monto / Moneda" },
    { tipo: "date", nombre: "Fecha" },
    { tipo: "time", nombre: "Hora" },
    { tipo: "email", nombre: "Correo electrónico" },
    { tipo: "phone", nombre: "Teléfono" },
    { tipo: "url", nombre: "URL / Enlace" },
];

export const NOMBRE_DEL_TIPO = Object.fromEntries(
    TIPOS_DE_CAMPO.map((t) => [t.tipo, t.nombre]),
) as Record<TipoDeCampo, string>;

/** Los que se responden eligiendo de una lista: piden sus opciones. */
export const TIPOS_CON_OPCIONES: ReadonlyArray<TipoDeCampo> = ["select", "radio", "multiselect"];

export function esTipoDeCampo(valor: unknown): valor is TipoDeCampo {
    return typeof valor === "string" && TIPOS_DE_CAMPO.some((t) => t.tipo === valor);
}

// ─── El slug y el enlace ─────────────────────────────────────────────────────

/** El slug MIENTRAS se escribe: no junta guiones, para no pelear con quien teclea. */
export function comoSeEscribeElSlug(texto: string): string {
    return comoSeEscribeElNombre(texto);
}

/**
 * El slug que se GUARDA: minúsculas, sin tildes (la letra se queda), y lo que
 * no sea letra, número o guion pasa a guion. La misma regla en la pantalla y
 * en el servidor: con dos, el enlace que se ve y el que queda guardado podrían
 * no coincidir. Vacío = no hay slug que guardar.
 */
export function elSlugDelFormulario(texto: string): string {
    return comoNombreDelEnlace(texto);
}

/**
 * La RUTA pública de un formulario: la personalizada (`/f/<nombre>`) si la
 * tiene, y si no la de siempre (`/f/<cuenta>/<slug>`). La cuenta es la DUEÑA
 * del formulario, nunca quien mira.
 */
export function elEnlaceDelFormulario(f: { userId: string; slug: string; publicSlug?: string | null }): string {
    const propio = (f.publicSlug ?? "").trim();
    return propio ? `/f/${propio}` : `/f/${f.userId}/${f.slug}`;
}

// ─── Leer una respuesta ──────────────────────────────────────────────────────

/**
 * Cómo se LEE una respuesta: una lista separada por comas, una casilla como
 * «Sí»/«No», y lo que falta como vacío. La usan el registro, el CSV, la fila
 * de Google Sheets y el mensaje de WhatsApp: con cuatro copias, el mismo
 * «true» salía como «Sí» en Sheets y como «true» en el CSV.
 */
export function comoSeLeeLaRespuesta(valor: unknown): string {
    if (valor === null || valor === undefined) return "";
    if (Array.isArray(valor)) return valor.map((v) => comoSeLeeLaRespuesta(v)).filter(Boolean).join(", ");
    if (typeof valor === "boolean") return valor ? "Sí" : "No";
    if (typeof valor === "object") {
        const url = (valor as { url?: unknown }).url;
        return typeof url === "string" ? url : "";
    }
    return String(valor);
}

/** La fila de un registro para Google Sheets: id, fecha y una columna por campo, en su orden. */
export function laFilaDelRegistro(
    campos: ReadonlyArray<{ id: string }>,
    data: Record<string, unknown>,
    id: string,
    fecha: string,
): string[] {
    return [id, fecha, ...campos.map((c) => comoSeLeeLaRespuesta(data[c.id]))];
}

export function laCabeceraDeLaHoja(campos: ReadonlyArray<{ label: string }>): string[] {
    return ["ID", "Fecha", ...campos.map((c) => c.label)];
}

// ─── WhatsApp ────────────────────────────────────────────────────────────────

/** La variable de una pregunta tal como se escribe en la plantilla. */
export function laVariable(pregunta: string): string {
    return `{{${pregunta}}}`;
}

/**
 * El mensaje de WhatsApp con cada `{{Pregunta}}` sustituida por su respuesta
 * —o, sin respuestas, por `[Pregunta]`, que es la vista previa del editor—.
 *
 * Sustituye el TEXTO literal (`split`/`join`), no una expresión regular armada
 * con la pregunta: una pregunta lleva «¿», «?», «(» y «.» con toda normalidad,
 * y en una expresión regular esos caracteres significan otra cosa.
 */
export function elMensajeDeWhatsapp(
    plantilla: string,
    campos: ReadonlyArray<{ id: string; label: string }>,
    respuestas?: Record<string, unknown> | null,
): string {
    let mensaje = plantilla;
    for (const campo of campos) {
        const valor = respuestas ? comoSeLeeLaRespuesta(respuestas[campo.id]) : `[${campo.label}]`;
        mensaje = mensaje.split(laVariable(campo.label)).join(valor);
    }
    return mensaje;
}

/** El enlace de WhatsApp, o `null` si falta el número o la plantilla. */
export function elEnlaceDeWhatsapp(
    numero: string | null | undefined,
    plantilla: string | null | undefined,
    campos: ReadonlyArray<{ id: string; label: string }>,
    respuestas?: Record<string, unknown> | null,
): string | null {
    const digitos = (numero ?? "").replace(/\D/g, "");
    if (!digitos || !(plantilla ?? "").trim()) return null;
    const texto = elMensajeDeWhatsapp(plantilla as string, campos, respuestas);
    return `https://api.whatsapp.com/send?phone=${digitos}&text=${encodeURIComponent(texto)}`;
}

// ─── Google Sheets ───────────────────────────────────────────────────────────

/** Google no admite más de 100 caracteres en el nombre de una pestaña. */
export const TOPE_DEL_NOMBRE_DE_PESTANA = 100;

/**
 * La pestaña donde caen los registros: la que ya exista con ese nombre SIN
 * MIRAR MAYÚSCULAS (Google no deja crear otra que solo se diferencie en eso),
 * o una nueva con el título recortado al tope de Google.
 */
export function laPestanaDelFormulario(
    titulo: string,
    pestanas: ReadonlyArray<string>,
): { nombre: string; existe: boolean } {
    const buscado = titulo.trim().slice(0, TOPE_DEL_NOMBRE_DE_PESTANA) || "Registros";
    const clave = buscado.toLocaleLowerCase("es");
    const hallada = pestanas.find((p) => p.trim().toLocaleLowerCase("es") === clave);
    return hallada !== undefined ? { nombre: hallada, existe: true } : { nombre: buscado, existe: false };
}

/**
 * El rango A1 de una pestaña: entre comillas simples y con cada comilla simple
 * del nombre duplicada. Sin eso, un formulario llamado «Registro d'Anna» rompe
 * el rango y el registro no se guarda en la hoja.
 */
export function elRangoDeLaPestana(nombre: string, celdas: string): string {
    return `'${nombre.replace(/'/g, "''")}'!${celdas}`;
}

// ─── Lo que se guarda de un envío ────────────────────────────────────────────

/** Una respuesta de texto no pasa de aquí: un envío no es un sitio donde guardar un libro. */
export const TOPE_DE_LA_RESPUESTA = 5000;

type CampoParaGuardar = { id: string; label: string; type: TipoDeCampo | string; required: boolean; options?: ReadonlyArray<{ value: string }> | null };

/**
 * Lo que se GUARDA de un envío del formulario público, y si se puede guardar.
 *
 * Quien lo manda no tiene cuenta, así que nada de lo que llega se da por
 * bueno:
 * - solo se guardan las claves que son campos del formulario (lo demás se
 *   ignora);
 * - una respuesta de texto se recorta a `TOPE_DE_LA_RESPUESTA`;
 * - un archivo tiene que ser uno subido a ESTE formulario (`prefijoDeArchivos`):
 *   si no, el registro enlazaría a donde dijera quien lo manda;
 * - los obligatorios se comprueban aquí también, no solo en la pantalla.
 */
export function lasRespuestasQueSeGuardan(
    campos: ReadonlyArray<CampoParaGuardar>,
    data: unknown,
    prefijoDeArchivos: string,
): { ok: true; respuestas: Record<string, unknown> } | { ok: false; error: string } {
    const entrada = data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>) : {};
    const respuestas: Record<string, unknown> = {};

    for (const campo of campos) {
        const crudo = entrada[campo.id];
        let valor: unknown = "";

        if (campo.type === "checkbox") {
            valor = crudo === true || crudo === "true";
        } else if (campo.type === "multiselect") {
            const lista = Array.isArray(crudo) ? crudo : [];
            valor = lista
                .filter((v): v is string => typeof v === "string")
                .map((v) => v.slice(0, TOPE_DE_LA_RESPUESTA));
        } else if (campo.type === "file") {
            const url = typeof crudo === "string" ? crudo.trim() : "";
            if (url && (!prefijoDeArchivos || !url.startsWith(prefijoDeArchivos) || url.includes(".."))) {
                return { ok: false, error: `El archivo de «${campo.label}» no es válido. Vuelve a adjuntarlo.` };
            }
            valor = url;
        } else if (typeof crudo === "string" || typeof crudo === "number") {
            valor = String(crudo).slice(0, TOPE_DE_LA_RESPUESTA);
        }

        const vacio =
            valor === false ||
            (Array.isArray(valor) && valor.length === 0) ||
            (typeof valor === "string" && valor.trim() === "");
        if (campo.required && vacio) {
            return { ok: false, error: `Falta responder «${campo.label}».` };
        }
        respuestas[campo.id] = valor;
    }

    return { ok: true, respuestas };
}

/** La carpeta del bucket de un formulario: lo que se sube ahí es SUYO. */
export function laCarpetaDelFormulario(formId: string): string {
    return `formularios/${formId}/`;
}

/**
 * La extensión que se guarda de un archivo subido: solo letras y números, y
 * corta. La pone el navegador de quien sube, así que no se da por buena.
 */
export function laExtensionDelArchivo(nombre: string): string {
    const m = /\.([A-Za-z0-9]{1,8})$/.exec(nombre.trim());
    return m ? `.${m[1].toLowerCase()}` : "";
}

// ─── Registros ───────────────────────────────────────────────────────────────

export type EstadoDeSincronizacion = "SYNCED" | "PENDING" | "ERROR";

/**
 * Las cuatro cifras de la pantalla de registros, desde el `groupBy` del
 * servidor y no desde lo cargado: la lista trae como mucho 500, y un contador
 * es un COUNT, no un `length`.
 */
export function losConteosDeRegistros(
    grupos: ReadonlyArray<{ syncStatus: string; _count: number }>,
): { total: number; sincronizados: number; pendientes: number; conError: number } {
    const de = (s: EstadoDeSincronizacion) => grupos.filter((g) => g.syncStatus === s).reduce((n, g) => n + g._count, 0);
    return {
        total: grupos.reduce((n, g) => n + g._count, 0),
        sincronizados: de("SYNCED"),
        pendientes: de("PENDING"),
        conError: de("ERROR"),
    };
}

/**
 * El resumen de un registro en su fila: las tres primeras respuestas, en el
 * orden de los campos y leídas como se leen. Antes salía `Object.values` del
 * JSON, o sea en el orden en que se guardaron y con los campos borrados dentro.
 */
export function elResumenDelRegistro(campos: ReadonlyArray<{ id: string }>, data: Record<string, unknown>): string {
    const valores = campos.map((c) => comoSeLeeLaRespuesta(data[c.id])).filter((v) => v.trim() !== "");
    return valores.slice(0, 3).join(" | ") + (valores.length > 3 ? " | …" : "");
}

// ─── La lista ────────────────────────────────────────────────────────────────

/** Los tres filtros de la barra: son las pastillas Total, Activos e Inactivos. */
export type FiltroDeEstado = "todos" | "activos" | "inactivos";

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Los formularios que enseña la lista: los del filtro de estado y los que
 * casan con la búsqueda —en el título, el enlace o la descripción—, SIN MIRAR
 * TILDES. Antes buscar «inscripcion» no encontraba «Inscripción», que es
 * justo como se teclea deprisa.
 */
export function losFormulariosQueSeVen<
    F extends { title: string; slug: string; publicSlug?: string | null; description?: string | null; isActive: boolean },
>(formularios: ReadonlyArray<F>, busqueda: string, filtro: FiltroDeEstado = "todos"): F[] {
    const q = sinTildes(busqueda.trim());
    return formularios.filter((f) => {
        if (filtro === "activos" && !f.isActive) return false;
        if (filtro === "inactivos" && f.isActive) return false;
        if (!q) return true;
        return [f.title, f.slug, f.publicSlug ?? "", f.description ?? ""].some((t) => sinTildes(t).includes(q));
    });
}

/**
 * El filtro de la pantalla de registros: son sus cuatro pastillas. Lo que
 * llega del navegador se valida aquí; lo que no se entiende es «todos».
 */
export type FiltroDeSincronizacion = "todos" | EstadoDeSincronizacion;

export function comoFiltroDeSincronizacion(valor: unknown): FiltroDeSincronizacion {
    return valor === "SYNCED" || valor === "PENDING" || valor === "ERROR" ? valor : "todos";
}
