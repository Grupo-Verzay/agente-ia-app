/**
 * Correo: las reglas PURAS del canal.
 *
 * Correo es un canal aparte de Chats y **de una sola persona**: la que conectó
 * el buzón. Nada de aquí dentro sabe de leads, de sesiones, de líneas ni de
 * reparto de asesores — y eso es a propósito, ver `lib/correo-db.ts`.
 *
 * Aquí vive lo que se puede decidir sin red y sin base: qué proveedor es cada
 * cosa, qué campos exige un buzón de dominio propio, cómo se arma el asunto y
 * las cabeceras de una respuesta, y cómo se envuelve el HTML de un correo para
 * poder enseñarlo sin que ejecute nada. Lo prueba `lib/__tests__/correo.test.mjs`.
 */

export const PROVEEDORES_DE_CORREO = ["gmail", "outlook", "imap"] as const;
export type ProveedorDeCorreo = (typeof PROVEEDORES_DE_CORREO)[number];

/** Los dos que se conectan con un botón de autorización (OAuth). */
export const PROVEEDORES_CON_BOTON = ["gmail", "outlook"] as const;
export type ProveedorConBoton = (typeof PROVEEDORES_CON_BOTON)[number];

export const NOMBRE_DEL_PROVEEDOR: Record<ProveedorDeCorreo, string> = {
    gmail: "Gmail",
    outlook: "Outlook",
    imap: "Dominio propio",
};

/** Lo que no sea uno de los tres no es un proveedor: `null`, nunca un respaldo. */
export function comoProveedor(valor: unknown): ProveedorDeCorreo | null {
    return typeof valor === "string" && (PROVEEDORES_DE_CORREO as readonly string[]).includes(valor)
        ? (valor as ProveedorDeCorreo)
        : null;
}

export function comoProveedorConBoton(valor: unknown): ProveedorConBoton | null {
    return typeof valor === "string" && (PROVEEDORES_CON_BOTON as readonly string[]).includes(valor)
        ? (valor as ProveedorConBoton)
        : null;
}

/**
 * Las variables que necesita cada botón. **Sin ellas el botón no se ofrece
 * como si funcionara**: se pinta apagado y dice qué falta. Un botón que lleva a
 * una pantalla de error de Google no dice por qué.
 */
export const VARIABLES_DEL_PROVEEDOR: Record<ProveedorConBoton, [string, string]> = {
    gmail: ["GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET"],
    outlook: ["MICROSOFT_OAUTH_CLIENT_ID", "MICROSOFT_OAUTH_CLIENT_SECRET"],
};

export function hayLlavesDe(
    proveedor: ProveedorConBoton,
    entorno: Record<string, string | undefined>,
): boolean {
    return VARIABLES_DEL_PROVEEDOR[proveedor].every((v) => Boolean(entorno[v]?.trim()));
}

/**
 * Los permisos que se piden: leer, organizar (marcar como leído y mover a la
 * papelera) y enviar. Ni uno más.
 *
 * - Gmail: `gmail.modify` es el MÁS ESTRECHO que deja quitar la etiqueta
 *   «sin leer» y mandar a la papelera. **No** es `mail.google.com`, que deja
 *   borrar para siempre sin pasar por la papelera: eso no se pide.
 * - Microsoft: `Mail.ReadWrite` es lo mismo del otro lado (`isRead` y mover a
 *   «Elementos eliminados»).
 *
 * Un buzón conectado cuando se pedía solo leer sigue leyendo y respondiendo;
 * marcar y eliminar le contestan con `MOTIVO_SIN_PERMISO_PARA_ORGANIZAR`, que
 * dice qué hacer (volver a conectar), en vez de fallar callado.
 */
export const PERMISOS_DEL_PROVEEDOR: Record<ProveedorConBoton, string[]> = {
    gmail: [
        "openid",
        "email",
        "https://www.googleapis.com/auth/gmail.modify",
        "https://www.googleapis.com/auth/gmail.send",
    ],
    outlook: ["openid", "email", "offline_access", "User.Read", "Mail.ReadWrite", "Mail.Send"],
};

/** Los de Microsoft que se repiten al renovar el token: los mismos, sin los de identidad. */
export function losPermisosAlRenovar(proveedor: ProveedorConBoton): string {
    return PERMISOS_DEL_PROVEEDOR[proveedor].filter((p) => p !== "openid" && p !== "email").join(" ");
}

/**
 * ¿El proveedor dijo «a este token le falta permiso»? Google lo dice con
 * `insufficient authentication scopes` / `ACCESS_TOKEN_SCOPE_INSUFFICIENT`, y
 * Microsoft con `ErrorAccessDenied` / «Access is denied».
 */
export function esFaltaDePermiso(motivo: string | null | undefined): boolean {
    return /insufficient.*(scope|permission)|ACCESS_TOKEN_SCOPE_INSUFFICIENT|ErrorAccessDenied|Access is denied/i.test(motivo ?? "");
}

export const MOTIVO_SIN_PERMISO_PARA_ORGANIZAR =
    "Este correo se conectó cuando la plataforma solo pedía permiso para leer. Vuelve a conectarlo para poder marcar como leído y eliminar correos.";

/** Adónde vuelve el proveedor. Tiene que coincidir CARÁCTER A CARÁCTER con la registrada. */
export function laDireccionDeVuelta(origen: string, proveedor: ProveedorConBoton): string {
    return `${origen.replace(/\/+$/, "")}/api/correo/oauth/${proveedor}`;
}

export function laDireccionDeAutorizacion(
    proveedor: ProveedorConBoton,
    datos: { clientId: string; vuelta: string; estado: string },
): string {
    const permisos = PERMISOS_DEL_PROVEEDOR[proveedor].join(" ");
    if (proveedor === "gmail") {
        const q = new URLSearchParams({
            client_id: datos.clientId,
            redirect_uri: datos.vuelta,
            response_type: "code",
            scope: permisos,
            // Sin `offline` no hay refresh_token, y sin él el buzón se
            // desconecta solo a la hora. Y sin `consent`, Google no lo vuelve a
            // dar a quien ya había autorizado antes.
            access_type: "offline",
            prompt: "consent",
            include_granted_scopes: "true",
            state: datos.estado,
        });
        return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
    }
    const q = new URLSearchParams({
        client_id: datos.clientId,
        redirect_uri: datos.vuelta,
        response_type: "code",
        response_mode: "query",
        scope: permisos,
        prompt: "select_account",
        state: datos.estado,
    });
    return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${q}`;
}

/* ── Dominio propio (IMAP + SMTP) ─────────────────────────────────────────── */

export interface DatosDeImap {
    direccion: string;
    usuario: string;
    contrasena: string;
    imapHost: string;
    imapPuerto: number;
    imapSeguro: boolean;
    smtpHost: string;
    smtpPuerto: number;
    smtpSeguro: boolean;
}

const HOST_VALIDO = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;
const CORREO_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function comoPuerto(valor: unknown, porDefecto: number): number | null {
    // `Number("")` es 0 y `Number(null)` también: «no hay valor» no es un puerto.
    if (valor === undefined || valor === null || valor === "") return porDefecto;
    const n = Number(valor);
    return Number.isInteger(n) && n > 0 && n < 65536 ? n : null;
}

/**
 * El formulario de dominio propio, validado **en el servidor**. Devuelve los
 * datos listos o el motivo — nunca un buzón a medias: uno guardado sin host de
 * salida se ve bien en la bandeja y falla la primera vez que alguien responde.
 *
 * El usuario, si no se escribe, es la dirección (es lo normal en casi todos
 * los proveedores). El SMTP, si no se escribe, es el mismo host que el IMAP.
 * Y el cifrado se deduce del puerto cuando no se dice: 993 y 465 van con TLS
 * directo; 143 y 587 con STARTTLS.
 */
export function comoDatosDeImap(
    raw: Record<string, unknown>,
): { ok: true; datos: DatosDeImap } | { ok: false; motivo: string } {
    const texto = (v: unknown) => (typeof v === "string" ? v.trim() : "");
    const direccion = texto(raw.direccion).toLowerCase();
    if (!CORREO_VALIDO.test(direccion)) return { ok: false, motivo: "Escribe una dirección de correo válida." };

    const contrasena = typeof raw.contrasena === "string" ? raw.contrasena : "";
    if (!contrasena) return { ok: false, motivo: "Falta la contraseña del correo." };

    const imapHost = texto(raw.imapHost).toLowerCase();
    if (!HOST_VALIDO.test(imapHost)) return { ok: false, motivo: "El servidor de entrada (IMAP) no es válido." };
    const smtpHost = (texto(raw.smtpHost) || imapHost).toLowerCase();
    if (!HOST_VALIDO.test(smtpHost)) return { ok: false, motivo: "El servidor de salida (SMTP) no es válido." };

    const imapPuerto = comoPuerto(raw.imapPuerto, 993);
    if (imapPuerto === null) return { ok: false, motivo: "El puerto de entrada no es válido." };
    const smtpPuerto = comoPuerto(raw.smtpPuerto, 465);
    if (smtpPuerto === null) return { ok: false, motivo: "El puerto de salida no es válido." };

    return {
        ok: true,
        datos: {
            direccion,
            usuario: texto(raw.usuario) || direccion,
            contrasena,
            imapHost,
            imapPuerto,
            imapSeguro: typeof raw.imapSeguro === "boolean" ? raw.imapSeguro : imapPuerto === 993,
            smtpHost,
            smtpPuerto,
            smtpSeguro: typeof raw.smtpSeguro === "boolean" ? raw.smtpSeguro : smtpPuerto === 465,
        },
    };
}

/* ── Lo que se enseña ─────────────────────────────────────────────────────── */

export interface ResumenDeCorreo {
    id: string;
    de: string;
    deDireccion: string;
    asunto: string;
    fragmento: string;
    fecha: string | null;
    sinLeer: boolean;
    conAdjuntos: boolean;
    /**
     * Destacado en el PROPIO buzón: la estrella de Gmail (`STARRED`), la
     * bandera de Outlook (`flag.flagStatus`) y `\Flagged` en IMAP. Es del
     * proveedor y no de la plataforma: marcarlo aquí se ve igual en el móvil de
     * la persona, y al revés. Opcional por los resúmenes de antes: sin el campo
     * es `false`.
     */
    destacado?: boolean;
}

export interface AdjuntoDeCorreo {
    id: string;
    nombre: string;
    tipo: string;
    tamano: number | null;
}

export interface CorreoCompleto {
    id: string;
    de: string;
    deDireccion: string;
    para: string;
    cc: string;
    asunto: string;
    fecha: string | null;
    html: string | null;
    texto: string | null;
    adjuntos: AdjuntoDeCorreo[];
    /** El `Message-ID` del correo: lo que la respuesta cita en `In-Reply-To`. */
    idDeMensaje: string | null;
    referencias: string | null;
    hilo: string | null;
    /** A quién va la respuesta (`Reply-To` si lo hay, si no el remitente). */
    responderA: string;
}

export const TAMANO_DE_PAGINA = 25;

/**
 * Un correo de la bandeja con el buzón del que llegó. Con la bandeja unificada
 * la lista mezcla varios buzones, y **el id de un correo solo es único dentro
 * de SU buzón**: un UID de IMAP es un número pequeño y dos buzones pueden
 * tener los dos el «7». Por eso todo lo que busca un correo en la lista lo
 * busca por su llave (`laLlaveDelCorreo`), que lleva el buzón delante.
 */
export interface CorreoDeLaBandeja extends ResumenDeCorreo {
    buzonId: string;
}

/** Sin buzón (una lista de un solo buzón, o un resumen suelto) la llave es el id. */
export function laLlaveDelCorreo(c: { id: string; buzonId?: string | null }): string {
    return c.buzonId ? `${c.buzonId}::${c.id}` : c.id;
}

/**
 * Cómo queda la lista al ABRIR un correo: sin el punto de «sin leer». Se pinta
 * al momento, antes de que el proveedor conteste, y si contesta que no se pudo
 * se deshace con `conSinLeer` — la misma regla que al eliminar un chat.
 *
 * `llave` es `laLlaveDelCorreo`: con buzón delante en la bandeja unificada,
 * el id a secas en una lista de un solo buzón.
 */
export function conLeido<T extends ResumenDeCorreo & { buzonId?: string }>(correos: T[], llave: string, sinLeer = false): T[] {
    return correos.map((c) => (laLlaveDelCorreo(c) === llave && c.sinLeer !== sinLeer ? { ...c, sinLeer } : c));
}

/** La lista sin un correo, y dónde estaba: para devolverlo a SU sitio si el proveedor dice que no. */
export function sinElCorreo<T extends ResumenDeCorreo & { buzonId?: string }>(
    correos: T[],
    llave: string,
): { lista: T[]; quitado: T | null; posicion: number } {
    const posicion = correos.findIndex((c) => laLlaveDelCorreo(c) === llave);
    if (posicion < 0) return { lista: correos, quitado: null, posicion: -1 };
    return { lista: [...correos.slice(0, posicion), ...correos.slice(posicion + 1)], quitado: correos[posicion], posicion };
}

/** Devolver un correo a la posición de la que se quitó (acotada, por si la lista cambió mientras). */
export function devolverElCorreo<T extends ResumenDeCorreo & { buzonId?: string }>(correos: T[], correo: T, posicion: number): T[] {
    const llave = laLlaveDelCorreo(correo);
    if (correos.some((c) => laLlaveDelCorreo(c) === llave)) return correos;
    const i = Math.max(0, Math.min(posicion, correos.length));
    return [...correos.slice(0, i), correo, ...correos.slice(i)];
}

/* ── La bandeja unificada ─────────────────────────────────────────────────── */

/** El valor de «Todas las bandejas» en el selector. No puede ser el id de un buzón (esos son uuid). */
export const BANDEJA_UNIFICADA = "todas";

/** Lo cargado de un buzón: sus correos, y el cursor de la página siguiente (`null`: no hay más). */
export interface LoCargadoDeUnBuzon {
    correos: CorreoDeLaBandeja[];
    siguiente: string | null;
}

function laHora(c: { fecha: string | null }): number {
    const t = c.fecha ? Date.parse(c.fecha) : Number.NaN;
    return Number.isFinite(t) ? t : Number.NEGATIVE_INFINITY;
}

/**
 * La bandeja de varios buzones en UNA lista, la más reciente arriba.
 *
 * Lo delicado es la página siguiente. Cada buzón trae su primera página, y un
 * buzón con poco correo puede traer en ella correos de hace un mes mientras
 * otro, con mucho, solo ha llegado a ayer. Enseñándolo todo, la lista pintaría
 * lo de hace un mes **y al pulsar «Cargar más» metería correos de anteayer por
 * ENCIMA de ellos**: la lista cambiaría de orden debajo del dedo, y lo que se
 * estaba mirando se iría de sitio.
 *
 * Así que hay un HORIZONTE: el máximo, entre los buzones que todavía tienen
 * página siguiente, de la hora de su correo más viejo cargado. Por
 * debajo de esa hora todavía puede entrar algo de ese buzón, así que lo de
 * debajo se guarda (`ocultos`) y sale al cargar más. Por encima, la lista ya
 * es definitiva: cargar más solo añade por abajo.
 *
 * Un buzón sin página siguiente no pone horizonte (ya no le falta nada), y uno
 * que la tiene pero no trajo ningún correo tampoco (no hay hora que poner).
 * Un correo sin fecha va al final y cuenta como el más viejo.
 */
export function laBandejaUnificada(porBuzon: Record<string, LoCargadoDeUnBuzon>): {
    visibles: CorreoDeLaBandeja[];
    ocultos: number;
    hayMas: boolean;
} {
    const todos: CorreoDeLaBandeja[] = [];
    let horizonte = Number.NEGATIVE_INFINITY;
    let hayMas = false;
    for (const cargado of Object.values(porBuzon)) {
        todos.push(...cargado.correos);
        if (cargado.siguiente) {
            hayMas = true;
            if (cargado.correos.length) {
                const masViejo = Math.min(...cargado.correos.map(laHora));
                if (masViejo > horizonte) horizonte = masViejo;
            }
        }
    }
    // `sort` es estable: a igual hora se conserva el orden en que llegaron.
    const ordenados = todos.map((c, i) => ({ c, i })).sort((a, b) => laHora(b.c) - laHora(a.c) || a.i - b.i).map((x) => x.c);
    const visibles = ordenados.filter((c) => laHora(c) >= horizonte);
    return { visibles, ocultos: ordenados.length - visibles.length, hayMas };
}

/**
 * La palabra corta con que se dice de qué buzón llegó un correo: la parte de
 * antes de la arroba («ana@verzay.com» → «ana»). Si otro buzón conectado tiene
 * la misma —ana@gmail.com y ana@verzay.com—, la palabra sola no los distingue y
 * se usa el dominio sin su terminación («gmail», «verzay»). Y si ni así, la
 * dirección entera: la marca existe para distinguir, y dos iguales no lo hacen.
 */
export function laPalabraDelBuzon(direccion: string, todas: string[]): string {
    const [local = "", dominio = ""] = (direccion ?? "").toLowerCase().split("@");
    const locales = todas.map((d) => (d ?? "").toLowerCase().split("@")[0]);
    if (locales.filter((l) => l === local).length <= 1) return local || direccion;
    const nombreDelDominio = (d: string) => (d.split("@")[1] ?? "").split(".")[0];
    const miDominio = dominio.split(".")[0];
    const mismosLocales = todas.map((d) => (d ?? "").toLowerCase()).filter((d) => d.split("@")[0] === local);
    const conMiDominio = mismosLocales.filter((d) => nombreDelDominio(d) === miDominio);
    return miDominio && conMiDominio.length <= 1 ? miDominio : direccion;
}

/* ── El filtro de leído ───────────────────────────────────────────────────── */

export const FILTROS_DE_LEIDO = ["todos", "sinLeer", "leidos"] as const;
export type FiltroDeLeido = (typeof FILTROS_DE_LEIDO)[number];

export const NOMBRE_DEL_FILTRO: Record<FiltroDeLeido, string> = {
    todos: "Todos",
    sinLeer: "Sin leer",
    leidos: "Leídos",
};

/** Lo que no se reconozca es «todos»: un filtro raro no puede dejar la bandeja vacía. */
export function comoFiltroDeLeido(valor: unknown): FiltroDeLeido {
    return typeof valor === "string" && (FILTROS_DE_LEIDO as readonly string[]).includes(valor) ? (valor as FiltroDeLeido) : "todos";
}

export function pasaElFiltroDeLeido(c: { sinLeer: boolean }, filtro: FiltroDeLeido): boolean {
    if (filtro === "sinLeer") return c.sinLeer;
    if (filtro === "leidos") return !c.sinLeer;
    return true;
}

/**
 * Los números de las tres pastillas del filtro, sobre lo CARGADO.
 *
 * Un contador es un `COUNT`, no un `length` — y aquí no hay `COUNT`: el
 * proveedor no dice cuántos correos hay en total. Así que cuando quedan
 * páginas sin traer (`hayMas`) el número lleva un «+» detrás: dice «al menos
 * esto», que es lo cierto. Por encima de 99, «99+», como «Sin leer» en Chats.
 * En cero no hay número (la pastilla no pinta insignia en cero).
 */
export function losNumerosDelFiltro(
    correos: { sinLeer: boolean }[],
    hayMas: boolean,
): Record<FiltroDeLeido, string | undefined> {
    const sinLeer = correos.filter((c) => c.sinLeer).length;
    const numero = (n: number): string | undefined => {
        if (n <= 0) return undefined;
        if (n > 99) return "99+";
        return hayMas ? `${n}+` : String(n);
    };
    return { todos: numero(correos.length), sinLeer: numero(sinLeer), leidos: numero(correos.length - sinLeer) };
}

/** Qué dice la confirmación de eliminar, según adónde va el correo en cada proveedor. */
export function laAdvertenciaDeEliminar(proveedor: ProveedorDeCorreo): string {
    if (proveedor === "gmail") return "Se mueve a la papelera de Gmail. Desde ahí se puede recuperar durante 30 días.";
    if (proveedor === "outlook") return "Se mueve a «Elementos eliminados» de Outlook. Desde ahí se puede recuperar.";
    return "Se mueve a la papelera de tu servidor de correo. Si tu servidor no tiene papelera, se elimina definitivamente.";
}

/** «Ana Pérez <ana@x.com>» → { nombre, direccion }. Un nombre vacío cae en la dirección. */
export function partirRemitente(valor: string | null | undefined): { nombre: string; direccion: string } {
    const v = (valor ?? "").trim();
    const m = v.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
    if (m) {
        const direccion = m[2].trim();
        return { nombre: m[1].trim() || direccion, direccion };
    }
    return { nombre: v, direccion: v };
}

/**
 * El asunto de una respuesta: «Re: » delante, **una sola vez**. Responder a un
 * «Re: Re: RE: Cotización» y sacar otro «Re:» delante es lo que convierte un
 * hilo en una escalera. Se reconocen también «RE:», «Rv:», «Fw:» y «AW:»
 * (Outlook en alemán) al quitar, y siempre se pone uno solo.
 */
export function elAsuntoDeLaRespuesta(asunto: string | null | undefined): string {
    let base = (asunto ?? "").trim();
    const prefijo = /^(re|rv|aw|fw|fwd)\s*:\s*/i;
    while (prefijo.test(base)) base = base.replace(prefijo, "");
    return base ? `Re: ${base}` : "Re:";
}

/**
 * Las `References` de la respuesta: las del original más su propio id. Sin
 * esto el cliente de correo del otro lado no la engancha al hilo y la pinta
 * como una conversación nueva.
 */
export function lasReferenciasDeLaRespuesta(
    referencias: string | null | undefined,
    idDeMensaje: string | null | undefined,
): string | null {
    const partes = (referencias ?? "").split(/\s+/).filter(Boolean);
    if (idDeMensaje && !partes.includes(idDeMensaje)) partes.push(idDeMensaje);
    return partes.length ? partes.join(" ") : null;
}

export const TOPE_DE_LA_RESPUESTA = 20_000;

/** Lo que se escribe para responder. Vacío o solo espacios no se manda. */
export function comoTextoDeLaRespuesta(valor: unknown): string | null {
    if (typeof valor !== "string") return null;
    const texto = valor.replace(/\r\n/g, "\n").trim();
    if (!texto) return null;
    return texto.slice(0, TOPE_DE_LA_RESPUESTA);
}

function escaparHtml(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function elHtmlDeUnTexto(texto: string): string {
    return escaparHtml(texto).replace(/\n/g, "<br>");
}

/**
 * La política de lo que un correo puede hacer al pintarse. Va DENTRO del
 * documento del iframe, y el iframe además va con `sandbox` sin
 * `allow-scripts`: son dos cerrojos y hace falta que fallen los dos para que un
 * correo ejecute algo en la plataforma. `default-src 'none'` deja fuera
 * scripts, formularios, marcos, fuentes y conexiones; las imágenes remotas se
 * permiten porque sin ellas casi ningún correo se lee.
 */
export const POLITICA_DEL_CORREO =
    "default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; font-src data:; form-action 'none'; base-uri 'none'";

/**
 * El documento que se mete en el `srcdoc` del iframe. Un correo de texto
 * plano se escapa —nunca se interpreta como HTML—, y cualquier `<base>` que
 * trajera el correo queda por detrás del nuestro, que abre los enlaces fuera.
 */
export function elDocumentoDelCorreo(correo: { html: string | null; texto: string | null }): string {
    const cuerpo = correo.html?.trim()
        ? correo.html
        : `<pre style="white-space:pre-wrap;font:14px/1.5 system-ui,sans-serif;margin:0">${escaparHtml(correo.texto ?? "")}</pre>`;
    return [
        "<!doctype html><html><head><meta charset=\"utf-8\">",
        `<meta http-equiv="Content-Security-Policy" content="${POLITICA_DEL_CORREO}">`,
        '<base target="_blank">',
        "<style>body{margin:0;padding:16px;font:14px/1.5 system-ui,sans-serif;color:#111;background:#fff;word-wrap:break-word}img{max-width:100%;height:auto}</style>",
        "</head><body>",
        cuerpo,
        "</body></html>",
    ].join("");
}

/** 1536 → «1,5 KB». Para el tamaño de un adjunto. */
export function elTamanoLegible(bytes: number | null | undefined): string {
    if (bytes === null || bytes === undefined || !Number.isFinite(bytes) || bytes < 0) return "";
    if (bytes < 1024) return `${bytes} B`;
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(kb < 10 ? 1 : 0).replace(".", ",")} KB`;
    const mb = kb / 1024;
    return `${mb.toFixed(mb < 10 ? 1 : 0).replace(".", ",")} MB`;
}

/**
 * El nombre con el que se descarga un adjunto. Llega del remitente, así que no
 * se le deja meter una ruta, ni comillas, ni saltos que partan la cabecera
 * `Content-Disposition`.
 */
export function elNombreSeguroDelAdjunto(nombre: string | null | undefined): string {
    const limpio = (nombre ?? "")
        .replace(/[\r\n"\\/]/g, "_")
        .replace(/[\u0000-\u001f]/g, "")
        .trim()
        .slice(0, 180);
    return limpio || "adjunto";
}

/**
 * Por qué no se pudo conectar un buzón de Google o Microsoft, **en palabras que
 * digan qué hacer**. Lo que devuelven sus APIs viene en inglés y nombra cosas
 * que quien pulsa «Conectar» no puede tocar: «Gmail API has not been used in
 * project 821244703851 before or it is disabled» no es un fallo de esa persona,
 * es un ajuste de la PLATAFORMA en Google Cloud, y tiene que decirlo así.
 *
 * Lo que no se reconoce se devuelve tal cual: inventarse un motivo es peor que
 * enseñar el de verdad.
 */
export function elMotivoLegible(proveedor: ProveedorConBoton, motivo: string): string {
    const m = motivo ?? "";
    const quien = proveedor === "gmail" ? "Google" : "Microsoft";
    if (/has not been used in project|is disabled|SERVICE_DISABLED|accessNotConfigured/i.test(m)) {
        const api = proveedor === "gmail" ? "la API de Gmail" : "la API de correo";
        return `${quien} tiene apagada ${api} en el proyecto de la plataforma. Quien administra la plataforma tiene que activarla en ${
            proveedor === "gmail" ? "Google Cloud (APIs y servicios › Gmail API › Habilitar)" : "Azure"
        }; después, vuelve a pulsar «Conectar».`;
    }
    if (/insufficient.*(scope|permission)|ACCESS_TOKEN_SCOPE_INSUFFICIENT/i.test(m)) {
        return `No se concedieron los permisos de correo (leer, organizar y enviar). Vuelve a pulsar «Conectar» y, en la pantalla de ${quien}, marca las casillas de correo.`;
    }
    if (/redirect_uri_mismatch/i.test(m)) {
        return `La dirección de vuelta no está registrada en ${quien}. Quien administra la plataforma tiene que añadirla.`;
    }
    if (/invalid_client|unauthorized_client/i.test(m)) {
        return `${quien} rechazó las credenciales de la plataforma. Quien administra la plataforma tiene que revisarlas.`;
    }
    return m || "No se pudo conectar el correo.";
}

/* ── Lo que se le hace a UN correo ────────────────────────────────────────── */

/**
 * Cómo queda la lista al DESTACAR (o quitar la marca) un correo. Se pinta al
 * momento y, si el proveedor dice que no, se deshace con el valor contrario —
 * la misma regla que marcar como leído.
 */
export function conDestacado<T extends ResumenDeCorreo & { buzonId?: string }>(correos: T[], llave: string, destacado: boolean): T[] {
    return correos.map((c) => (laLlaveDelCorreo(c) === llave && Boolean(c.destacado) !== destacado ? { ...c, destacado } : c));
}

/**
 * Un correo ANCLADO: lo que la persona quiere tener arriba de la lista.
 *
 * Ningún proveedor tiene esto —Gmail tiene estrella, Outlook bandera, IMAP
 * `\Flagged`, y eso es «Destacar»—, así que vive en la plataforma
 * (`correo_anclados`, de la PERSONA). Y guarda **una foto** del correo al
 * anclarlo: un anclado tiene que salir arriba aunque sea de hace un mes y no
 * esté en la página cargada, que es justo para lo que se ancla.
 */
export interface CorreoAnclado {
    buzonId: string;
    id: string;
    de: string;
    deDireccion: string;
    asunto: string;
    fragmento: string;
    fecha: string | null;
    conAdjuntos: boolean;
    /** Milisegundos. El último anclado va el primero. */
    ancladoEn: number;
}

/**
 * La lista con los ANCLADOS ARRIBA, como en Chats.
 *
 * - El anclado que también está en lo cargado se pinta con los datos DE LO
 *   CARGADO (si está sin leer, si está destacado), no con la foto: la foto es
 *   para cuando no está.
 * - Y no sale dos veces: arriba, y quitado de su sitio de abajo.
 * - `soloDe`: en la vista de UN buzón solo sus anclados; en la unificada, todos.
 */
export function conLosAncladosArriba(
    correos: CorreoDeLaBandeja[],
    anclados: CorreoAnclado[],
    soloDe: string | null,
): { arriba: CorreoDeLaBandeja[]; resto: CorreoDeLaBandeja[] } {
    const deLaVista = anclados.filter((a) => !soloDe || a.buzonId === soloDe).sort((a, b) => b.ancladoEn - a.ancladoEn);
    const porLlave = new Map(correos.map((c) => [laLlaveDelCorreo(c), c]));
    const llaves = new Set<string>();
    const arriba: CorreoDeLaBandeja[] = [];
    for (const a of deLaVista) {
        const llave = laLlaveDelCorreo(a);
        if (llaves.has(llave)) continue;
        llaves.add(llave);
        const cargado = porLlave.get(llave);
        arriba.push(
            cargado ?? {
                id: a.id,
                buzonId: a.buzonId,
                de: a.de,
                deDireccion: a.deDireccion,
                asunto: a.asunto,
                fragmento: a.fragmento,
                fecha: a.fecha,
                conAdjuntos: a.conAdjuntos,
                // De la foto no se sabe: se enseña como leído, que es lo que no llama la atención de más.
                sinLeer: false,
            },
        );
    }
    return { arriba, resto: correos.filter((c) => !llaves.has(laLlaveDelCorreo(c))) };
}

/** Anclar o desanclar en la lista de anclados, al momento. */
export function conElAnclado(anclados: CorreoAnclado[], correo: CorreoAnclado | null, llave: string): CorreoAnclado[] {
    const sin = anclados.filter((a) => laLlaveDelCorreo(a) !== llave);
    return correo ? [correo, ...sin] : sin;
}

/** La foto que se guarda al anclar, sacada del correo YA leído del proveedor. */
export function laFotoDelAnclado(
    buzonId: string,
    c: { id: string; de: string; deDireccion: string; asunto: string; fecha: string | null; texto?: string | null; fragmento?: string | null; adjuntos?: unknown[]; conAdjuntos?: boolean },
    ahora: number,
): CorreoAnclado {
    const fragmento = (c.fragmento ?? c.texto ?? "").replace(/\s+/g, " ").trim().slice(0, 160);
    return {
        buzonId,
        id: String(c.id),
        de: (c.de ?? "").slice(0, 200),
        deDireccion: (c.deDireccion ?? "").slice(0, 320),
        asunto: (c.asunto ?? "").slice(0, 300),
        fragmento,
        fecha: c.fecha ?? null,
        conAdjuntos: Boolean(c.conAdjuntos ?? (Array.isArray(c.adjuntos) && c.adjuntos.length > 0)),
        ancladoEn: ahora,
    };
}

/* ── El buscador por campo ────────────────────────────────────────────────── */

/**
 * El buscador de la barra busca en TODO lo que se ve de un correo, y se le
 * puede decir que mire solo el REMITENTE (nombre y dirección) o solo el
 * ASUNTO. Es el mismo buscador con un campo elegido —como el de Clientes—, no
 * un segundo cuadro: dos cajas de búsqueda una al lado de otra son una
 * pregunta sobre cuál manda.
 */
export const CAMPOS_DE_BUSQUEDA = ["todo", "remitente", "asunto"] as const;
export type CampoDeBusqueda = (typeof CAMPOS_DE_BUSQUEDA)[number];

export const NOMBRE_DEL_CAMPO: Record<CampoDeBusqueda, string> = {
    todo: "Todo",
    remitente: "Remitente",
    asunto: "Asunto",
};

/** El `placeholder` dice dónde se está buscando: un campo escondido que no se ve es un buscador que «a veces no encuentra». */
export const TEXTO_DEL_BUSCADOR: Record<CampoDeBusqueda, string> = {
    todo: "Buscar en lo cargado",
    remitente: "Buscar por remitente",
    asunto: "Buscar por asunto",
};

export function comoCampoDeBusqueda(valor: unknown): CampoDeBusqueda {
    return typeof valor === "string" && (CAMPOS_DE_BUSQUEDA as readonly string[]).includes(valor) ? (valor as CampoDeBusqueda) : "todo";
}

/** Sin acentos y sin mayúsculas: quien teclea «cotizacion» tiene que encontrar «Cotización». */
function plano(s: string): string {
    return (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function pasaLaBusqueda(
    c: { de: string; deDireccion: string; asunto: string; fragmento: string },
    texto: string,
    campo: CampoDeBusqueda,
): boolean {
    const q = plano(texto.trim());
    if (!q) return true;
    const donde =
        campo === "remitente" ? `${c.de} ${c.deDireccion}` : campo === "asunto" ? c.asunto : `${c.de} ${c.deDireccion} ${c.asunto} ${c.fragmento}`;
    return plano(donde).includes(q);
}

/* ── Reenviar ─────────────────────────────────────────────────────────────── */

export const TOPE_DE_DESTINATARIOS = 20;

/**
 * A quién se reenvía. Aquí SÍ llega del navegador —reenviar es elegir a quién—,
 * así que se valida en el servidor: direcciones de verdad, sin repetir y con
 * tope. Separadas por coma, punto y coma o espacio.
 */
export function comoDestinatarios(valor: unknown): { ok: true; lista: string[] } | { ok: false; motivo: string } {
    const crudo = Array.isArray(valor) ? valor.join(",") : typeof valor === "string" ? valor : "";
    const partes = crudo
        .split(/[\s,;]+/)
        .map((p) => p.trim().replace(/^<|>$/g, "").toLowerCase())
        .filter(Boolean);
    if (!partes.length) return { ok: false, motivo: "Escribe a quién reenviarlo." };
    const malas = partes.filter((p) => !CORREO_VALIDO.test(p));
    if (malas.length) return { ok: false, motivo: `No es una dirección válida: ${malas[0]}` };
    const lista = [...new Set(partes)];
    if (lista.length > TOPE_DE_DESTINATARIOS) return { ok: false, motivo: `Como mucho ${TOPE_DE_DESTINATARIOS} destinatarios.` };
    return { ok: true, lista };
}

/** «Fwd: » delante, una sola vez: la misma regla que el «Re:» de una respuesta. */
export function elAsuntoDelReenvio(asunto: string | null | undefined): string {
    let base = (asunto ?? "").trim();
    const prefijo = /^(re|rv|aw|fw|fwd)\s*:\s*/i;
    while (prefijo.test(base)) base = base.replace(prefijo, "");
    return base ? `Fwd: ${base}` : "Fwd:";
}

/**
 * El cuerpo de un reenvío: lo que escribió la persona, y debajo el original con
 * su cabecera («De», «Fecha», «Asunto», «Para»), como lo hacen Gmail y Outlook.
 * El texto de la persona se ESCAPA; el HTML del original va tal cual, porque se
 * manda a otro buzón, no se pinta aquí.
 */
export function elCuerpoDelReenvio(
    original: { de: string; deDireccion: string; para: string; asunto: string; fecha: string | null; html: string | null; texto: string | null },
    escrito: string,
): { texto: string; html: string } {
    const de = original.de && original.de !== original.deDireccion ? `${original.de} <${original.deDireccion}>` : original.deDireccion || original.de;
    const fecha = original.fecha ? new Date(original.fecha).toUTCString() : "";
    const cabecera = [
        "---------- Mensaje reenviado ----------",
        `De: ${de}`,
        fecha ? `Fecha: ${fecha}` : "",
        `Asunto: ${original.asunto}`,
        original.para ? `Para: ${original.para}` : "",
    ].filter(Boolean);
    const cuerpoTexto = original.texto ?? (original.html ? original.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : "");
    const texto = [escrito.trim(), "", ...cabecera, "", cuerpoTexto].join("\n").replace(/^\n+/, "");
    const html = [
        escrito.trim() ? `<div>${elHtmlDeUnTexto(escrito.trim())}</div><br>` : "",
        `<div>${cabecera.map(escaparHtml).join("<br>")}</div><br>`,
        original.html?.trim() ? original.html : `<pre style="white-space:pre-wrap">${escaparHtml(original.texto ?? "")}</pre>`,
    ].join("");
    return { texto, html };
}

/* ── Adjuntar a una respuesta o a un reenvío ──────────────────────────────── */

/** El tope de lo que viaja en un correo: el de Gmail y Outlook, 25 MB. */
export const TOPE_DE_BYTES_DEL_ENVIO = 25 * 1024 * 1024;
export const TOPE_DE_ADJUNTOS = 10;

export interface AdjuntoParaEnviar {
    nombre: string;
    tipo: string;
    /** Base64 sin el prefijo `data:`. */
    base64: string;
}

/** Los bytes que ocupa un base64 una vez decodificado, sin decodificarlo. */
export function losBytesDeUnBase64(b64: string): number {
    const limpio = b64.replace(/\s+/g, "");
    const relleno = limpio.endsWith("==") ? 2 : limpio.endsWith("=") ? 1 : 0;
    return Math.max(0, Math.floor((limpio.length * 3) / 4) - relleno);
}

/**
 * Los archivos que se adjuntan, validados EN EL SERVIDOR: una lista, cada uno
 * con su nombre seguro, base64 de verdad, y el total por debajo del tope. Lo
 * que no cumple **no se manda a medias**: se dice por qué.
 */
export function comoAdjuntosParaEnviar(
    valor: unknown,
    yaOcupado = 0,
): { ok: true; lista: AdjuntoParaEnviar[]; bytes: number } | { ok: false; motivo: string } {
    if (valor === undefined || valor === null) return { ok: true, lista: [], bytes: 0 };
    if (!Array.isArray(valor)) return { ok: false, motivo: "Los adjuntos no llegaron bien." };
    if (valor.length > TOPE_DE_ADJUNTOS) return { ok: false, motivo: `Como mucho ${TOPE_DE_ADJUNTOS} archivos por correo.` };
    const lista: AdjuntoParaEnviar[] = [];
    let bytes = yaOcupado;
    for (const a of valor) {
        const x = (a ?? {}) as Record<string, unknown>;
        let base64 = typeof x.base64 === "string" ? x.base64 : typeof x.dataUrl === "string" ? x.dataUrl : "";
        base64 = base64.replace(/^data:[^;,]*;base64,/, "");
        if (!base64 || !/^[A-Za-z0-9+/=\s]+$/.test(base64)) return { ok: false, motivo: "Un adjunto no llegó bien." };
        bytes += losBytesDeUnBase64(base64);
        if (bytes > TOPE_DE_BYTES_DEL_ENVIO) return { ok: false, motivo: "Los adjuntos pasan de 25 MB: es el tope de un correo." };
        const tipo = typeof x.tipo === "string" && /^[\w.+-]+\/[\w.+-]+$/.test(x.tipo) ? x.tipo : "application/octet-stream";
        lista.push({ nombre: elNombreSeguroDelAdjunto(typeof x.nombre === "string" ? x.nombre : null), tipo, base64 });
    }
    return { ok: true, lista, bytes };
}

/* ── La firma ─────────────────────────────────────────────────────────────── */

export const TOPE_DE_LA_FIRMA = 1000;

/** La firma de un buzón. En blanco es «sin firma»: `null`, nunca una cadena vacía guardada. */
export function comoFirma(valor: unknown): string | null {
    if (typeof valor !== "string") return null;
    const f = valor.replace(/\r\n/g, "\n").trim();
    return f ? f.slice(0, TOPE_DE_LA_FIRMA) : null;
}

/**
 * La firma se añade AL FINAL de lo que se manda, con el separador estándar
 * de los correos («-- » y salto): los clientes de correo lo reconocen y la
 * pliegan en las respuestas. Sin firma, el texto va tal cual. La añade el
 * SERVIDOR al enviar, leyendo la del buzón: así el navegador no puede mandar
 * una firma que no es la guardada, y se aplica igual al responder y al
 * reenviar.
 */
export function conLaFirma(texto: string, firma: string | null | undefined, activa: boolean): string {
    const f = activa ? comoFirma(firma) : null;
    if (!f) return texto;
    return `${texto.replace(/\s+$/, "")}\n\n-- \n${f}`;
}

/* ── La sugerencia de la IA ───────────────────────────────────────────────── */

export const TOPE_DEL_CORREO_PARA_LA_IA = 6000;

/** El texto del correo que se le pasa a la IA: sin etiquetas y recortado. */
export function elTextoParaLaIa(c: { texto: string | null; html: string | null }): string {
    const base = c.texto?.trim()
        ? c.texto
        : (c.html ?? "")
              .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
              .replace(/<br\s*\/?>/gi, "\n")
              .replace(/<\/p>/gi, "\n")
              .replace(/<[^>]+>/g, " ")
              .replace(/&nbsp;/g, " ")
              .replace(/&amp;/g, "&")
              .replace(/&lt;/g, "<")
              .replace(/&gt;/g, ">");
    return base.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, TOPE_DEL_CORREO_PARA_LA_IA);
}
