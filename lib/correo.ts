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
 * Los permisos que se piden, y ni uno más: leer y enviar. `gmail.readonly` no
 * deja borrar ni mover nada, y en Microsoft `Mail.Read` + `Mail.Send` es lo
 * mismo. Pedir de más es lo que hace que la pantalla de consentimiento asuste.
 */
export const PERMISOS_DEL_PROVEEDOR: Record<ProveedorConBoton, string[]> = {
    gmail: [
        "openid",
        "email",
        "https://www.googleapis.com/auth/gmail.readonly",
        "https://www.googleapis.com/auth/gmail.send",
    ],
    outlook: ["openid", "email", "offline_access", "User.Read", "Mail.Read", "Mail.Send"],
};

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
