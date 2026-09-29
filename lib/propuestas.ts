/**
 * PROPUESTAS COMERCIALES: lo que se decide sin base ni navegador.
 *
 * Una propuesta es de una CUENTA y tiene una página pública propia en
 * `/propuesta/<token>`, que es lo que se le manda al cliente por WhatsApp. Aquí
 * vive lo que tiene que decir lo mismo en el panel, en el servidor y en la
 * página pública: qué se acepta al guardar, cuánto suma y cómo se escribe un
 * importe.
 *
 * # El token es la ÚNICA puerta de la página pública
 *
 * 32 caracteres de `base64url` (24 bytes, 192 bits) que genera el SERVIDOR. No
 * es el id de la fila ni sale de nada adivinable —ni del cliente, ni de la
 * fecha, ni de un contador—: quien no tiene el enlace no tiene forma de llegar
 * a una propuesta ajena. `base64url` y no `base64`: va en una URL y un `+` o un
 * `/` se escapan por el camino.
 *
 * # El enlace PERSONALIZADO es opcional, y el token no se va
 *
 * Quien administra la cuenta puede ponerle a una propuesta un texto corto y
 * legible (`slug`: «clinica-sonrisa»), como el de una landing. Tres cosas:
 *
 * 1. **Sin personalizar sigue siendo el token**: el enlace que se arma es el de
 *    los 32 caracteres, y nada cambia para quien no toca el campo.
 * 2. **Personalizado, el token SIGUE abriendo la propuesta.** El enlace que ya
 *    se mandó por WhatsApp no se rompe por ponerle un nombre bonito después.
 * 3. **Un slug nunca puede confundirse con un token**: va de 3 a
 *    `TOPE_DE_SLUG` (30) caracteres y un token tiene exactamente 32, así que
 *    un texto que alguien elige no puede tapar la puerta de otra propuesta.
 *    Es ÚNICO entre todas las propuestas de la plataforma (la URL es global).
 */

export const MONEDAS = ["COP", "USD", "EUR", "MXN", "PEN", "CLP", "ARS", "BRL", "GTQ", "DOP", "CRC", "BOB", "PYG", "UYU"] as const;
export type Moneda = (typeof MONEDAS)[number];
export const MONEDA_POR_DEFECTO: Moneda = "COP";

export const TOPE_DE_CLIENTE = 120;
export const TOPE_DE_SERVICIOS = 30;
export const TOPE_DE_NOMBRE_DE_SERVICIO = 150;
export const TOPE_DE_ALCANCE = 3000;
export const TOPE_DE_DESCRIPCION_DEL_MANTENIMIENTO = 1000;
export const TOPE_DE_CONDICIONES = 8000;
/** Un importe que no puede ser cierto de ninguna manera; evita un entero imposible. */
export const TOPE_DE_IMPORTE = 1_000_000_000_000;

export const TOPE_DE_EMPRESA = 120;
export const TOPE_DE_CORREO = 200;
export const TOPE_DE_NOTA = 4000;
export const TOPE_DE_METODO_DE_PAGO = 200;
export const TOPE_DE_MEDIO_DE_PAGO = 2000;
export const TOPE_DE_ESLOGAN = 120;
export const TOPE_DE_LINEA = 200;

/**
 * Qué se ofrece en la propuesta: la palabra del título de la sección. Lo elige
 * quien la crea, porque no todas las cuentas venden servicios. Lo que no sea de
 * la lista es «servicios», que es lo que decía siempre.
 */
export const TIPOS_DE_ITEMS = ["servicios", "productos"] as const;
export type TipoDeItems = (typeof TIPOS_DE_ITEMS)[number];
export const TIPO_DE_ITEMS_POR_DEFECTO: TipoDeItems = "servicios";

export function comoTipoDeItems(v: unknown): TipoDeItems {
    const t = typeof v === "string" ? v.trim().toLowerCase() : "";
    return (TIPOS_DE_ITEMS as readonly string[]).includes(t) ? (t as TipoDeItems) : TIPO_DE_ITEMS_POR_DEFECTO;
}

/** Cómo se nombra lo que se ofrece: una sola función para el panel y la página. */
export function losRotulosDeItems(tipo: TipoDeItems): { plural: string; singular: string } {
    return tipo === "productos" ? { plural: "Productos", singular: "producto" } : { plural: "Servicios", singular: "servicio" };
}

/**
 * Quién puede leer la nota: `interna` solo el panel (el asesor); `publica`
 * también la página del cliente. Lo que no se entienda es interna: equivocarse
 * hacia «pública» le enseña al cliente algo que se escribió para el equipo.
 */
export const VISIBILIDADES_DE_NOTA = ["interna", "publica"] as const;
export type VisibilidadDeNota = (typeof VISIBILIDADES_DE_NOTA)[number];

export function comoVisibilidadDeNota(v: unknown): VisibilidadDeNota {
    return v === "publica" ? "publica" : "interna";
}

export const LARGO_DEL_TOKEN = 32;
const FORMA_DEL_TOKEN = /^[A-Za-z0-9_-]{32}$/;

export const MINIMO_DE_SLUG = 3;
/** Por DEBAJO del largo del token a propósito: un slug nunca tiene su forma. */
export const TOPE_DE_SLUG = 30;
const FORMA_DEL_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * El enlace personalizado como lo teclea una persona: «Clínica Sonrisa 2026»
 * pasa a «clinica-sonrisa-2026» —minúsculas, sin acentos, lo demás en guiones—,
 * la MISMA normalización que el slug de una landing. `""` es «sin
 * personalizar»; `null`, que lo escrito no da un enlace válido (menos de 3 o
 * más de 30 caracteres después de limpiarlo).
 */
export function comoSlug(v: unknown): string | null {
    if (typeof v !== "string") return "";
    const crudo = v.trim();
    if (!crudo) return "";
    const limpio = crudo
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
    if (limpio.length < MINIMO_DE_SLUG || limpio.length > TOPE_DE_SLUG) return null;
    return limpio;
}

export function esSlugValido(v: unknown): v is string {
    return typeof v === "string" && v.length >= MINIMO_DE_SLUG && v.length <= TOPE_DE_SLUG && FORMA_DEL_SLUG.test(v);
}

/** Lo que va detrás de `/propuesta/`: el slug si se personalizó, si no el token. */
export function laLlaveDelEnlace(p: { token: string; slug?: string | null }): string {
    return p.slug && esSlugValido(p.slug) ? p.slug : p.token;
}

export type ServicioDePropuesta = {
    nombre: string;
    alcance: string;
    inversion: number;
};

export type DatosDePropuesta = {
    cliente: string;
    /** Día natural, `YYYY-MM-DD`: una propuesta tiene fecha, no hora. */
    fecha: string;
    moneda: Moneda;
    servicios: ServicioDePropuesta[];
    /** `null` = sin mantenimiento. Cero SÍ es un dato («mantenimiento incluido»). */
    mantenimientoMensual: number | null;
    mantenimientoDescripcion: string;
    condiciones: string;
    tipoDeItems: TipoDeItems;
    /** Empresa del cliente, además de su nombre. Vacía = no se dice. */
    empresa: string;
    /** Solo dígitos, con indicativo de país. Vacío = sin WhatsApp. */
    whatsapp: string;
    /** El `instanceName` de la línea de ESTA cuenta por la que se envía. */
    linea: string;
    correo: string;
    /** Día natural hasta el que vale la propuesta, o `null`. */
    vigencia: string | null;
    nota: string;
    notaVisibilidad: VisibilidadDeNota;
    metodoPago: string;
    medioPago: string;
    /** El enlace personalizado; `""` = sin personalizar (se usa el token). */
    slug: string;
};

export type Propuesta = DatosDePropuesta & {
    id: string;
    token: string;
    creadaEn: string;
    actualizadaEn: string;
    vecesAbierta: number;
    ultimaVezAbierta: string | null;
};

/**
 * Lo que llega a la página pública: sin id, sin cuenta y sin contadores. Y sin
 * los datos de CONTACTO del cliente ni la línea: son para enviar, no para
 * enseñar. La nota solo viaja si es pública (`laNotaQueSeEnsena`).
 */
export type PropuestaPublica = Omit<
    Propuesta,
    "id" | "vecesAbierta" | "ultimaVezAbierta" | "creadaEn" | "whatsapp" | "linea" | "correo" | "notaVisibilidad" | "slug"
> & {
    negocio: { nombre: string; logo: string | null; eslogan: string };
};

/** La nota que ve el cliente: la pública tal cual; la interna, nada. */
export function laNotaQueSeEnsena(p: Pick<DatosDePropuesta, "nota" | "notaVisibilidad">): string {
    return p.notaVisibilidad === "publica" ? p.nota : "";
}

/**
 * Un WhatsApp como lo teclea una persona: «+57 300 123 4567», «(57) 300-123».
 * Se queda con los dígitos. `""` es «sin WhatsApp»; `null`, que lo escrito no
 * puede ser un número (menos de 8 o más de 15 cifras, el tope de E.164).
 */
export function comoWhatsapp(v: unknown): string | null {
    if (typeof v !== "string" && typeof v !== "number") return "";
    const crudo = String(v).trim();
    if (!crudo) return "";
    if (!/^[\d\s()+.-]+$/.test(crudo)) return null;
    const digitos = crudo.replace(/\D/g, "");
    return digitos.length >= 8 && digitos.length <= 15 ? digitos : null;
}

/** La identidad de WhatsApp de un número: la que usa el envío desde el chat. */
export function elJidDelWhatsapp(digitos: string): string {
    return `${digitos}@s.whatsapp.net`;
}

const FORMA_DEL_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Una línea de la cuenta desde la que se puede ENVIAR un WhatsApp: la misma
 * regla que el despachador (`canDispatchWhatsApp`). Por QR (Evolution, sin
 * tipo o Waha) o Meta del canal WhatsApp; Telegram, Facebook e Instagram no.
 */
export function esLineaParaEnviar(i: { instanceType?: string | null; metaChannel?: string | null }): boolean {
    const t = i.instanceType?.trim().toLowerCase();
    if (t === "meta") return !i.metaChannel || i.metaChannel.trim().toLowerCase() === "whatsapp";
    return !t || t === "whatsapp" || t === "waha" || t === "evolution";
}

export function esTokenValido(token: unknown): token is string {
    return typeof token === "string" && FORMA_DEL_TOKEN.test(token);
}

function texto(v: unknown, tope: number): string {
    if (typeof v !== "string") return "";
    return v.replace(/\r\n?/g, "\n").trim().slice(0, tope);
}

/** Una línea: sin saltos. El nombre del cliente o de un servicio va en un título. */
function linea(v: unknown, tope: number): string {
    return texto(v, tope * 2).replace(/\s+/g, " ").trim().slice(0, tope);
}

/**
 * Un importe como lo teclea una persona: «1.500.000», «1,500,000.50», «2500».
 *
 * La coma o el punto final seguido de 1-2 cifras es el decimal; cualquier otro
 * punto o coma es separador de miles. Lo que no se entiende es `null` —«no se
 * sabe»—, **nunca cero**: un importe inventado en una propuesta comercial es un
 * precio que alguien va a cobrar.
 */
export function comoImporte(v: unknown): number | null {
    if (typeof v === "number") return Number.isFinite(v) && v >= 0 && v <= TOPE_DE_IMPORTE ? Math.round(v * 100) / 100 : null;
    if (typeof v !== "string") return null;
    const s = v.trim().replace(/[\s$€]/g, "");
    if (!s) return null;
    if (!/^[\d.,]+$/.test(s)) return null;
    const decimal = s.match(/[.,](\d{1,2})$/);
    let entero = s;
    let dec = "";
    // «1.500» es mil quinientos, no uno y medio: solo 1-2 cifras detrás del
    // último separador son decimales; tres nunca lo son.
    if (decimal) {
        entero = s.slice(0, s.length - decimal[0].length);
        dec = decimal[1]!;
    }
    entero = entero.replace(/[.,]/g, "");
    if (!/^\d*$/.test(entero) || (!entero && !dec)) return null;
    const n = Number(`${entero || "0"}.${dec || "0"}`);
    if (!Number.isFinite(n) || n < 0 || n > TOPE_DE_IMPORTE) return null;
    return Math.round(n * 100) / 100;
}

export function comoMoneda(v: unknown): Moneda {
    const m = typeof v === "string" ? v.trim().toUpperCase() : "";
    return (MONEDAS as readonly string[]).includes(m) ? (m as Moneda) : MONEDA_POR_DEFECTO;
}

function esFechaValida(v: unknown): v is string {
    if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
    const d = new Date(`${v}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

export type Veredicto = { ok: true; datos: DatosDePropuesta } | { ok: false; motivo: string };

/**
 * Lo que se guarda, a partir de lo que llega del navegador.
 *
 * Se comprueba en el SERVIDOR aunque el formulario ya lo haga: una acción de
 * servidor es un endpoint y lo que llegue puede ser cualquier cosa. Un servicio
 * sin nombre no es un servicio, y una propuesta sin servicios no es una
 * propuesta: las dos cosas se rechazan con su motivo en vez de guardarse a
 * medias.
 */
export function comoPropuesta(raw: unknown): Veredicto {
    const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;

    const cliente = linea(r.cliente, TOPE_DE_CLIENTE);
    if (!cliente) return { ok: false, motivo: "Escribe el nombre del cliente." };

    const fecha = typeof r.fecha === "string" ? r.fecha.trim() : "";
    if (!esFechaValida(fecha)) return { ok: false, motivo: "La fecha no es válida." };

    if (typeof r.moneda === "string" && r.moneda.trim() && !(MONEDAS as readonly string[]).includes(r.moneda.trim().toUpperCase())) {
        return { ok: false, motivo: "Esa moneda no está en la lista." };
    }
    const moneda = comoMoneda(r.moneda);

    const tipoDeItems = comoTipoDeItems(r.tipoDeItems);
    const cosa = losRotulosDeItems(tipoDeItems).singular;
    const crudos = Array.isArray(r.servicios) ? r.servicios : [];
    // Una fila en blanco —la que el formulario deja para añadir otra— no cuenta.
    const llenos = crudos.filter((s) => {
        const o = (s ?? {}) as Record<string, unknown>;
        return Boolean(linea(o.nombre, 10) || texto(o.alcance, 10) || String(o.inversion ?? "").trim());
    });
    if (llenos.length === 0) return { ok: false, motivo: `Añade al menos un ${cosa}.` };
    if (llenos.length > TOPE_DE_SERVICIOS) return { ok: false, motivo: `Como mucho ${TOPE_DE_SERVICIOS} ${cosa}s.` };

    const servicios: ServicioDePropuesta[] = [];
    for (let i = 0; i < llenos.length; i++) {
        const o = (llenos[i] ?? {}) as Record<string, unknown>;
        const nombre = linea(o.nombre, TOPE_DE_NOMBRE_DE_SERVICIO);
        if (!nombre) return { ok: false, motivo: `El ${cosa} ${i + 1} no tiene nombre.` };
        const inversion = comoImporte(o.inversion);
        if (inversion === null) return { ok: false, motivo: `La inversión de «${nombre}» no es un importe válido.` };
        servicios.push({ nombre, alcance: texto(o.alcance, TOPE_DE_ALCANCE), inversion });
    }

    let mantenimientoMensual: number | null = null;
    const crudoMant = r.mantenimientoMensual;
    if (crudoMant !== null && crudoMant !== undefined && String(crudoMant).trim() !== "") {
        mantenimientoMensual = comoImporte(crudoMant);
        if (mantenimientoMensual === null) return { ok: false, motivo: "El mantenimiento mensual no es un importe válido." };
    }

    const whatsapp = comoWhatsapp(r.whatsapp);
    if (whatsapp === null) {
        return { ok: false, motivo: "El WhatsApp del cliente no es válido: escríbelo con su indicativo de país." };
    }

    const correo = linea(r.correo, TOPE_DE_CORREO);
    if (correo && !FORMA_DEL_CORREO.test(correo)) return { ok: false, motivo: "El correo de contacto no es válido." };

    let vigencia: string | null = null;
    const crudaVig = typeof r.vigencia === "string" ? r.vigencia.trim() : "";
    if (crudaVig) {
        if (!esFechaValida(crudaVig)) return { ok: false, motivo: "La fecha de vigencia no es válida." };
        if (crudaVig < fecha) return { ok: false, motivo: "La vigencia no puede ser anterior a la fecha de la propuesta." };
        vigencia = crudaVig;
    }

    const slug = comoSlug(r.slug);
    if (slug === null) {
        return {
            ok: false,
            motivo: `El enlace personalizado tiene que tener entre ${MINIMO_DE_SLUG} y ${TOPE_DE_SLUG} letras, números o guiones.`,
        };
    }

    return {
        ok: true,
        datos: {
            cliente,
            fecha,
            moneda,
            servicios,
            mantenimientoMensual,
            mantenimientoDescripcion: texto(r.mantenimientoDescripcion, TOPE_DE_DESCRIPCION_DEL_MANTENIMIENTO),
            condiciones: texto(r.condiciones, TOPE_DE_CONDICIONES),
            tipoDeItems,
            empresa: linea(r.empresa, TOPE_DE_EMPRESA),
            whatsapp,
            linea: linea(r.linea, TOPE_DE_LINEA),
            correo,
            vigencia,
            nota: texto(r.nota, TOPE_DE_NOTA),
            notaVisibilidad: comoVisibilidadDeNota(r.notaVisibilidad),
            metodoPago: linea(r.metodoPago, TOPE_DE_METODO_DE_PAGO),
            medioPago: texto(r.medioPago, TOPE_DE_MEDIO_DE_PAGO),
            slug,
        },
    };
}

/** La inversión total, sin el mantenimiento (que es mensual y va aparte). */
export function elTotal(servicios: readonly Pick<ServicioDePropuesta, "inversion">[]): number {
    const suma = servicios.reduce((a, s) => a + (Number.isFinite(s.inversion) ? s.inversion : 0), 0);
    return Math.round(suma * 100) / 100;
}

/** Un importe como se lee en la propuesta: «$ 1.500.000 COP», «US$ 2,500.00». */
export function comoSeLeeElImporte(monto: number, moneda: string): string {
    const m = comoMoneda(moneda);
    // Un importe redondo no lleva «,00»: en una propuesta se lee como ruido.
    const decimales = Number.isInteger(monto) ? 0 : 2;
    try {
        return new Intl.NumberFormat("es-CO", {
            style: "currency",
            currency: m,
            currencyDisplay: "narrowSymbol",
            minimumFractionDigits: decimales,
            maximumFractionDigits: 2,
        }).format(monto) + ` ${m}`;
    } catch {
        return `${monto.toLocaleString("es-CO")} ${m}`;
    }
}

/** La fecha de la propuesta como se lee: «28 de septiembre de 2026». */
export function comoSeLeeLaFecha(fecha: string): string {
    if (!esFechaValida(fecha)) return fecha;
    const d = new Date(`${fecha}T12:00:00Z`);
    return d.toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

/** Hoy, en el día de quien mira: el valor por defecto del campo de fecha. */
export function hoyComoFecha(ahora = new Date()): string {
    const y = ahora.getFullYear();
    const m = String(ahora.getMonth() + 1).padStart(2, "0");
    const d = String(ahora.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

export function laRutaPublica(token: string): string {
    return `/propuesta/${token}`;
}

export function elEnlacePublico(origen: string, token: string): string {
    return `${origen.replace(/\/+$/, "")}${laRutaPublica(token)}`;
}

/** El enlace que se copia y se manda: el personalizado si lo hay, si no el del token. */
export function elEnlaceDeLaPropuesta(origen: string, p: { token: string; slug?: string | null }): string {
    return elEnlacePublico(origen, laLlaveDelEnlace(p));
}

/** El texto que se abre en WhatsApp para mandar el enlace. */
export function elMensajeDeWhatsapp(cliente: string, enlace: string): string {
    const saludo = cliente ? `Hola ${cliente}, ` : "Hola, ";
    return `${saludo}te comparto la propuesta comercial: ${enlace}`;
}

/** El eslogan de la cuenta: una línea, opcional. */
export function comoEslogan(v: unknown): string {
    return linea(v, TOPE_DE_ESLOGAN);
}

export function elEnlaceDeWhatsapp(mensaje: string): string {
    return `https://wa.me/?text=${encodeURIComponent(mensaje)}`;
}

/** Las iniciales del negocio, cuando no hay logo que enseñar. */
export function lasIniciales(nombre: string): string {
    const partes = nombre.replace(/[^\p{L}\p{N}\s]/gu, " ").trim().split(/\s+/).filter(Boolean);
    const ini = partes.slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");
    return ini || "·";
}
