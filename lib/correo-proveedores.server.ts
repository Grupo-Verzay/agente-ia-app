import "server-only";

import {
    elAsuntoDeLaRespuesta,
    elAsuntoDelReenvio,
    elCuerpoDelReenvio,
    elHtmlDeUnTexto,
    TOPE_DE_BYTES_DEL_ENVIO,
    type AdjuntoParaEnviar,
    esFaltaDePermiso,
    lasReferenciasDeLaRespuesta,
    losPermisosAlRenovar,
    MOTIVO_SIN_PERMISO_PARA_ORGANIZAR,
    partirRemitente,
    TAMANO_DE_PAGINA,
    idImapDelArchivo,
    partirIdImap,
    type AdjuntoDeCorreo,
    type CarpetaDeCorreo,
    type CorreoCompleto,
    type ProveedorConBoton,
    type ResumenDeCorreo,
} from "@/lib/correo";
import {
    actualizarLasCredenciales,
    marcarParaReconectar,
    type Buzon,
    type CredencialesImap,
    type CredencialesOAuth,
} from "@/lib/correo-db";

/**
 * Los tres proveedores detrás de UNA interfaz: bandeja, leer, marcar como
 * leído, eliminar, adjunto y responder. La pantalla y las acciones no saben cuál hay debajo, y eso es lo
 * que hace que las tres se comporten igual: lo que cambia es cómo se le
 * pregunta a cada uno, no lo que se enseña.
 *
 * Tres reglas comunes, escritas una vez:
 *
 * 1. **Traer el correo y marcarlo son DOS pasos, y el segundo es explícito.**
 *    `leer` no cambia nada (IMAP pide el cuerpo con `PEEK`, Gmail y Outlook con
 *    un GET): así la descarga de un adjunto o el preparar una respuesta, que
 *    también leen el original, no marcan nada por su cuenta. Lo que marca es
 *    `marcarComoLeido`, y solo lo llama la acción de ABRIR — igual en los tres.
 *    La bandeja se sigue abriendo en solo lectura; solo marcar y eliminar abren
 *    IMAP con escritura.
 *    Eliminar es mandar a la PAPELERA en los tres (Gmail `trash`, Outlook
 *    `deleteditems`, IMAP la carpeta `\Trash`): nunca un borrado definitivo,
 *    salvo un servidor IMAP que no tenga papelera, y eso se DICE.
 * 2. **Una autorización que el proveedor rechaza deja el buzón en «volver a
 *    conectar»** con su motivo, en vez de fallar en cada vuelta sin decir nada.
 * 3. **Nada de aquí escribe en la base un mensaje.** Solo credenciales.
 */

export class ErrorDeCorreo extends Error {
    constructor(
        message: string,
        /** El proveedor rechazó la autorización: hay que volver a conectar. */
        public readonly reconectar = false,
        /**
         * El token no tiene el permiso de ORGANIZAR (se conectó cuando solo se
         * pedía leer). Leer y responder siguen valiendo; marcar y eliminar no.
         */
        public readonly faltaPermiso = false,
    ) {
        super(message);
        this.name = "ErrorDeCorreo";
    }
}

/**
 * El total de un buzón tiene que ser un número de verdad. Lo que no lo sea
 * —un campo que el proveedor no mandó— es un fallo, NO un cero: un «0» junto a
 * una bandeja llena se lee como que está vacía. La acción lo convierte en «sin
 * número».
 */
export function comoTotal(valor: unknown): number {
    const n = typeof valor === "string" ? Number(valor) : valor;
    if (typeof n !== "number" || !Number.isInteger(n) || n < 0) throw new ErrorDeCorreo("El proveedor no dijo cuántos correos hay.");
    return n;
}

export interface Pagina {
    correos: ResumenDeCorreo[];
    /** Para pedir la página siguiente; `null` si no hay más. */
    siguiente: string | null;
}

/** Eliminar manda a la papelera en los tres; `false` solo si el servidor IMAP no tiene. */
export interface Eliminado {
    aLaPapelera: boolean;
}

/**
 * Archivar es SACARLO DE LA BANDEJA sin borrarlo, en los tres: Gmail le quita
 * la etiqueta `INBOX` (queda en «Todos»), Outlook lo mueve a su carpeta
 * «Archivo» (`archive`, la conocida), e IMAP a la carpeta marcada `\Archive`
 * —o la que se llame así—, y si el servidor no tiene ninguna, **se crea
 * «Archive»**, que es lo que hacen Thunderbird y Apple Mail. `carpeta` dice
 * adónde fue, para decirlo en pantalla.
 */
export interface Archivado {
    carpeta: string;
}

/** La carpeta de archivo de un servidor IMAP: la marcada `\Archive`, o la que se llame así. Pura. */
export function elArchivoImap(carpetas: { path?: string; specialUse?: string }[]): string | null {
    const marcada = carpetas.find((c) => c.specialUse === "\\Archive");
    if (marcada?.path) return marcada.path;
    const nombre = /^(inbox[./])?(archive|archives|archived|archivo|archivados|archivar)$/i;
    return carpetas.find((c) => c.path && nombre.test(c.path))?.path ?? null;
}

/** Los archivos de una respuesta o un reenvío, listos para nodemailer (Gmail e IMAP). */
function paraNodemailer(adjuntos: AdjuntoParaEnviar[]) {
    return adjuntos.map((a) => ({ filename: a.nombre, contentType: a.tipo, content: Buffer.from(a.base64, "base64") }));
}

/** Los mismos, para Microsoft Graph. */
function paraGraph(adjuntos: AdjuntoParaEnviar[]) {
    return adjuntos.map((a) => ({
        "@odata.type": "#microsoft.graph.fileAttachment",
        name: a.nombre,
        contentType: a.tipo,
        contentBytes: a.base64.replace(/\s+/g, ""),
    }));
}

/**
 * Los adjuntos del ORIGINAL, bajados, para reenviarlos con él. Gmail e IMAP no
 * tienen «reenviar» en su API: se compone un correo nuevo, y un reenvío sin
 * los archivos del original es un reenvío a medias. Con tope: lo que pase de
 * 25 MB no se manda recortado, se dice.
 */
async function losAdjuntosDelOriginal(
    proveedor: { adjunto: (b: Buzon, id: string, adjuntoId: string) => Promise<AdjuntoDescargado> },
    buzon: Buzon,
    original: CorreoCompleto,
    yaOcupado: number,
): Promise<AdjuntoParaEnviar[]> {
    const lista: AdjuntoParaEnviar[] = [];
    let bytes = yaOcupado;
    for (const a of original.adjuntos) {
        const bajado = await proveedor.adjunto(buzon, original.id, a.id);
        bytes += bajado.bytes.length;
        if (bytes > TOPE_DE_BYTES_DEL_ENVIO) {
            throw new ErrorDeCorreo("Con los archivos del correo original, el reenvío pasa de 25 MB: es el tope de un correo.");
        }
        lista.push({ nombre: bajado.nombre, tipo: bajado.tipo, base64: bajado.bytes.toString("base64") });
    }
    return lista;
}

/**
 * La papelera de un servidor IMAP: la carpeta marcada `\Trash` (RFC 6154), y
 * si el servidor no marca ninguna, la que se llame como una papelera. Pura.
 */
export function laPapeleraImap(carpetas: { path?: string; specialUse?: string }[]): string | null {
    const marcada = carpetas.find((c) => c.specialUse === "\\Trash");
    if (marcada?.path) return marcada.path;
    const nombre = /^(inbox[./])?(trash|papelera|deleted( items| messages)?|elementos eliminados|bin)$/i;
    return carpetas.find((c) => c.path && nombre.test(c.path))?.path ?? null;
}

export interface AdjuntoDescargado {
    nombre: string;
    tipo: string;
    bytes: Buffer;
}

/* ── OAuth: el intercambio y la renovación ────────────────────────────────── */

const TOKEN: Record<ProveedorConBoton, string> = {
    gmail: "https://oauth2.googleapis.com/token",
    outlook: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
};

function lasLlaves(proveedor: ProveedorConBoton): { id: string; secreto: string } {
    const id = proveedor === "gmail" ? process.env.GOOGLE_OAUTH_CLIENT_ID : process.env.MICROSOFT_OAUTH_CLIENT_ID;
    const secreto =
        proveedor === "gmail" ? process.env.GOOGLE_OAUTH_CLIENT_SECRET : process.env.MICROSOFT_OAUTH_CLIENT_SECRET;
    if (!id || !secreto) throw new ErrorDeCorreo(`Falta configurar la conexión con ${proveedor === "gmail" ? "Google" : "Microsoft"}.`);
    return { id, secreto };
}

async function pedirToken(proveedor: ProveedorConBoton, cuerpo: Record<string, string>) {
    const { id, secreto } = lasLlaves(proveedor);
    const r = await fetch(TOKEN[proveedor], {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ client_id: id, client_secret: secreto, ...cuerpo }),
    });
    const datos = (await r.json().catch(() => ({}))) as Record<string, any>;
    if (!r.ok || !datos.access_token) {
        const motivo = String(datos.error_description || datos.error || `HTTP ${r.status}`);
        // `invalid_grant` = revocado, caducado o contraseña cambiada: no se
        // arregla reintentando, solo volviendo a autorizar.
        throw new ErrorDeCorreo(motivo, datos.error === "invalid_grant");
    }
    return datos as { access_token: string; refresh_token?: string; expires_in?: number };
}

export async function cambiarElCodigo(
    proveedor: ProveedorConBoton,
    codigo: string,
    vuelta: string,
): Promise<CredencialesOAuth> {
    const t = await pedirToken(proveedor, { grant_type: "authorization_code", code: codigo, redirect_uri: vuelta });
    if (!t.refresh_token) {
        // Sin refresh_token el buzón se cae a la hora y nadie sabría por qué.
        throw new ErrorDeCorreo("El proveedor no entregó un permiso duradero. Vuelve a intentarlo.");
    }
    return {
        tipo: "oauth",
        accessToken: t.access_token,
        refreshToken: t.refresh_token,
        expiraEn: Date.now() + (t.expires_in ?? 3600) * 1000,
    };
}

/** Quién es el dueño del buzón recién autorizado. */
export async function laDireccionAutorizada(
    proveedor: ProveedorConBoton,
    accessToken: string,
): Promise<{ direccion: string; nombre: string | null }> {
    if (proveedor === "gmail") {
        const p = await pedir<{ emailAddress?: string }>(
            "https://gmail.googleapis.com/gmail/v1/users/me/profile",
            accessToken,
        );
        if (!p.emailAddress) throw new ErrorDeCorreo("Google no devolvió la dirección del correo.");
        return { direccion: p.emailAddress, nombre: null };
    }
    const yo = await pedir<{ mail?: string; userPrincipalName?: string; displayName?: string }>(
        "https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName,displayName",
        accessToken,
    );
    const direccion = yo.mail || yo.userPrincipalName;
    if (!direccion) throw new ErrorDeCorreo("Microsoft no devolvió la dirección del correo.");
    return { direccion, nombre: yo.displayName ?? null };
}

/**
 * El token de acceso, renovado si hace falta. Microsoft entrega un
 * refresh_token NUEVO en cada renovación y el viejo deja de valer pronto: por
 * eso se guarda el que venga, no solo el acceso.
 */
async function elTokenVigente(buzon: Buzon, proveedor: ProveedorConBoton): Promise<string> {
    const c = buzon.credenciales;
    if (!c || c.tipo !== "oauth") throw new ErrorDeCorreo("Este correo hay que volver a conectarlo.", true);
    if (c.expiraEn - 60_000 > Date.now()) return c.accessToken;
    try {
        const cuerpo: Record<string, string> = { grant_type: "refresh_token", refresh_token: c.refreshToken };
        if (proveedor === "outlook") cuerpo.scope = losPermisosAlRenovar("outlook");
        const t = await pedirToken(proveedor, cuerpo);
        const nuevas: CredencialesOAuth = {
            tipo: "oauth",
            accessToken: t.access_token,
            refreshToken: t.refresh_token || c.refreshToken,
            expiraEn: Date.now() + (t.expires_in ?? 3600) * 1000,
        };
        await actualizarLasCredenciales(buzon.personaId, buzon.id, nuevas);
        buzon.credenciales = nuevas;
        return nuevas.accessToken;
    } catch (error) {
        if (error instanceof ErrorDeCorreo && error.reconectar) {
            await marcarParaReconectar(buzon.personaId, buzon.id, "El proveedor retiró el permiso. Vuelve a conectar este correo.");
        }
        throw error;
    }
}

async function pedir<T>(url: string, token: string, init: RequestInit = {}): Promise<T> {
    const r = await fetch(url, {
        ...init,
        headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
    });
    if (r.status === 202 || r.status === 204) return {} as T;
    const datos = (await r.json().catch(() => ({}))) as any;
    if (!r.ok) {
        const motivo = String(datos?.error?.message || datos?.error?.code || datos?.error_description || datos?.error || `HTTP ${r.status}`);
        // Un 403 por falta de permiso no es «revocado»: el buzón sigue leyendo.
        // Se dice qué hacer (volver a conectar) en vez de un inglés técnico.
        if (r.status === 403 && (esFaltaDePermiso(motivo) || esFaltaDePermiso(String(datos?.error?.code ?? "")))) {
            throw new ErrorDeCorreo(MOTIVO_SIN_PERMISO_PARA_ORGANIZAR, true, true);
        }
        throw new ErrorDeCorreo(motivo, r.status === 401);
    }
    return datos as T;
}

/* ── Gmail ────────────────────────────────────────────────────────────────── */

const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";

/** Lo archivado en Gmail: lo que ya no tiene `INBOX` y no es papelera, spam, enviado ni borrador. */
export const GMAIL_ARCHIVO = "-in:inbox -in:trash -in:spam -in:sent -in:drafts -in:chats";

type ParteGmail = {
    partId?: string;
    mimeType?: string;
    filename?: string;
    headers?: { name: string; value: string }[];
    body?: { size?: number; data?: string; attachmentId?: string };
    parts?: ParteGmail[];
};

function cabecera(headers: { name: string; value: string }[] | undefined, nombre: string): string {
    return headers?.find((h) => h.name.toLowerCase() === nombre.toLowerCase())?.value ?? "";
}

function deBase64Url(s: string | undefined): Buffer {
    return Buffer.from(String(s ?? "").replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function fechaIso(valor: string | number | Date | null | undefined): string | null {
    if (valor === null || valor === undefined || valor === "") return null;
    const d = valor instanceof Date ? valor : new Date(valor);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Recorre las partes de un mensaje de Gmail: el cuerpo HTML, el de texto y los adjuntos. */
export function lasPartesDeGmail(raiz: ParteGmail): { html: string | null; texto: string | null; adjuntos: AdjuntoDeCorreo[] } {
    let html: string | null = null;
    let texto: string | null = null;
    const adjuntos: AdjuntoDeCorreo[] = [];
    // Iterativo: un mensaje hondo no puede tumbar la pila.
    const pila: ParteGmail[] = [raiz];
    while (pila.length) {
        const p = pila.shift()!;
        if (p.parts?.length) {
            pila.unshift(...p.parts);
            continue;
        }
        if (p.filename && (p.body?.attachmentId || p.body?.data)) {
            adjuntos.push({
                // El `attachmentId` de Gmail CAMBIA en cada lectura: el id
                // estable es la posición de la parte.
                id: p.partId ?? String(adjuntos.length),
                nombre: p.filename,
                tipo: p.mimeType || "application/octet-stream",
                tamano: p.body?.size ?? null,
            });
            continue;
        }
        if (p.mimeType === "text/html" && html === null && p.body?.data) html = deBase64Url(p.body.data).toString("utf8");
        else if (p.mimeType === "text/plain" && texto === null && p.body?.data) texto = deBase64Url(p.body.data).toString("utf8");
    }
    return { html, texto, adjuntos };
}

const gmail = {
    /** Cuántos correos hay en la bandeja de entrada: el `messagesTotal` de la etiqueta `INBOX`. */
    async total(buzon: Buzon): Promise<number> {
        const token = await elTokenVigente(buzon, "gmail");
        const l = await pedir<{ messagesTotal?: number }>(`${GMAIL}/labels/INBOX`, token);
        return comoTotal(l.messagesTotal);
    },

    /** Cuántos SIN LEER hay en la bandeja de entrada: el `messagesUnread` de `INBOX`. */
    async sinLeer(buzon: Buzon): Promise<number> {
        const token = await elTokenVigente(buzon, "gmail");
        const l = await pedir<{ messagesUnread?: number }>(`${GMAIL}/labels/INBOX`, token);
        return comoTotal(l.messagesUnread);
    },

    async bandeja(buzon: Buzon, cursor: string | null, carpeta: CarpetaDeCorreo = "entrada"): Promise<Pagina> {
        const token = await elTokenVigente(buzon, "gmail");
        // El archivo de Gmail no es una etiqueta: es lo que salió de `INBOX`
        // sin ir a la papelera, al spam ni ser propio (enviados, borradores).
        const q = new URLSearchParams(
            carpeta === "archivo"
                ? { q: GMAIL_ARCHIVO, maxResults: String(TAMANO_DE_PAGINA) }
                : { labelIds: "INBOX", maxResults: String(TAMANO_DE_PAGINA) },
        );
        if (cursor) q.set("pageToken", cursor);
        const lista = await pedir<{ messages?: { id: string }[]; nextPageToken?: string }>(`${GMAIL}/messages?${q}`, token);
        const ids = (lista.messages ?? []).map((m) => m.id);
        const meta = new URLSearchParams({ format: "metadata" });
        for (const h of ["From", "Subject", "Date", "Content-Type"]) meta.append("metadataHeaders", h);
        // `allSettled`: un mensaje que no se puede leer no se lleva la página.
        const leidos = await Promise.allSettled(
            ids.map((id) =>
                pedir<{ id: string; snippet?: string; labelIds?: string[]; internalDate?: string; payload?: ParteGmail }>(
                    `${GMAIL}/messages/${id}?${meta}`,
                    token,
                ),
            ),
        );
        const correos: ResumenDeCorreo[] = [];
        for (const r of leidos) {
            if (r.status !== "fulfilled") continue;
            const m = r.value;
            const de = partirRemitente(cabecera(m.payload?.headers, "From"));
            correos.push({
                id: m.id,
                de: de.nombre,
                deDireccion: de.direccion,
                asunto: cabecera(m.payload?.headers, "Subject"),
                fragmento: m.snippet ?? "",
                fecha: fechaIso(m.internalDate ? Number(m.internalDate) : cabecera(m.payload?.headers, "Date")),
                sinLeer: (m.labelIds ?? []).includes("UNREAD"),
                conAdjuntos: /multipart\/mixed/i.test(cabecera(m.payload?.headers, "Content-Type")),
                destacado: (m.labelIds ?? []).includes("STARRED"),
            });
        }
        return { correos, siguiente: lista.nextPageToken ?? null };
    },

    async leer(buzon: Buzon, id: string): Promise<CorreoCompleto> {
        const token = await elTokenVigente(buzon, "gmail");
        const m = await pedir<{ id: string; threadId?: string; internalDate?: string; payload?: ParteGmail }>(
            `${GMAIL}/messages/${encodeURIComponent(id)}?format=full`,
            token,
        );
        const h = m.payload?.headers;
        const de = partirRemitente(cabecera(h, "From"));
        const partes = lasPartesDeGmail(m.payload ?? {});
        return {
            id: m.id,
            de: de.nombre,
            deDireccion: de.direccion,
            para: cabecera(h, "To"),
            cc: cabecera(h, "Cc"),
            asunto: cabecera(h, "Subject"),
            fecha: fechaIso(m.internalDate ? Number(m.internalDate) : cabecera(h, "Date")),
            ...partes,
            idDeMensaje: cabecera(h, "Message-ID") || cabecera(h, "Message-Id") || null,
            referencias: cabecera(h, "References") || null,
            hilo: m.threadId ?? null,
            responderA: cabecera(h, "Reply-To") || cabecera(h, "From"),
        };
    },

    async marcarComoLeido(buzon: Buzon, id: string): Promise<void> {
        const token = await elTokenVigente(buzon, "gmail");
        await pedir(`${GMAIL}/messages/${encodeURIComponent(id)}/modify`, token, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ removeLabelIds: ["UNREAD"] }),
        });
    },

    async marcarComoNoLeido(buzon: Buzon, id: string): Promise<void> {
        await gmail.etiquetas(buzon, id, { addLabelIds: ["UNREAD"] });
    },

    async destacar(buzon: Buzon, id: string, destacado: boolean): Promise<void> {
        await gmail.etiquetas(buzon, id, destacado ? { addLabelIds: ["STARRED"] } : { removeLabelIds: ["STARRED"] });
    },

    async archivar(buzon: Buzon, id: string): Promise<Archivado> {
        // Archivar en Gmail es quitarle `INBOX`: sigue en «Todos los mensajes».
        // Sobre uno ya archivado no cambia nada: `removeLabelIds` de algo que no tiene.
        await gmail.etiquetas(buzon, id, { removeLabelIds: ["INBOX"] });
        return { carpeta: "Todos los mensajes" };
    },

    /** Las tres de arriba son la misma llamada: `modify` con lo que se pone o se quita. */
    async etiquetas(buzon: Buzon, id: string, cambio: { addLabelIds?: string[]; removeLabelIds?: string[] }): Promise<void> {
        const token = await elTokenVigente(buzon, "gmail");
        await pedir(`${GMAIL}/messages/${encodeURIComponent(id)}/modify`, token, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(cambio),
        });
    },

    async eliminar(buzon: Buzon, id: string): Promise<Eliminado> {
        const token = await elTokenVigente(buzon, "gmail");
        // `trash`, nunca `delete`: se recupera desde la papelera de Gmail.
        await pedir(`${GMAIL}/messages/${encodeURIComponent(id)}/trash`, token, { method: "POST" });
        return { aLaPapelera: true };
    },

    async adjunto(buzon: Buzon, id: string, adjuntoId: string): Promise<AdjuntoDescargado> {
        const token = await elTokenVigente(buzon, "gmail");
        const m = await pedir<{ payload?: ParteGmail }>(`${GMAIL}/messages/${encodeURIComponent(id)}?format=full`, token);
        const pila: ParteGmail[] = [m.payload ?? {}];
        let parte: ParteGmail | null = null;
        while (pila.length && !parte) {
            const p = pila.shift()!;
            if (p.partId === adjuntoId && p.filename) parte = p;
            else if (p.parts) pila.push(...p.parts);
        }
        if (!parte) throw new ErrorDeCorreo("Ese adjunto ya no está en el correo.");
        let datos = parte.body?.data;
        if (!datos && parte.body?.attachmentId) {
            const a = await pedir<{ data?: string }>(
                `${GMAIL}/messages/${encodeURIComponent(id)}/attachments/${encodeURIComponent(parte.body.attachmentId)}`,
                token,
            );
            datos = a.data;
        }
        return { nombre: parte.filename || "adjunto", tipo: parte.mimeType || "application/octet-stream", bytes: deBase64Url(datos) };
    },

    async responder(buzon: Buzon, original: CorreoCompleto, texto: string, adjuntos: AdjuntoParaEnviar[] = []): Promise<void> {
        const token = await elTokenVigente(buzon, "gmail");
        const crudo = await componerLaRespuesta(buzon.direccion, original, texto, adjuntos);
        await pedir(`${GMAIL}/messages/send`, token, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ raw: crudo.toString("base64url"), threadId: original.hilo ?? undefined }),
        });
    },

    async reenviar(buzon: Buzon, original: CorreoCompleto, para: string[], texto: string, adjuntos: AdjuntoParaEnviar[] = []): Promise<void> {
        const token = await elTokenVigente(buzon, "gmail");
        const ocupado = adjuntos.reduce((n, a) => n + Buffer.byteLength(a.base64, "base64"), 0);
        const delOriginal = await losAdjuntosDelOriginal(gmail, buzon, original, ocupado);
        const crudo = await componerElReenvio(buzon.direccion, original, para, texto, [...delOriginal, ...adjuntos]);
        await pedir(`${GMAIL}/messages/send`, token, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ raw: crudo.toString("base64url") }),
        });
    },
};

/* ── Outlook (Microsoft Graph) ───────────────────────────────────────────── */

const GRAPH = "https://graph.microsoft.com/v1.0/me";

type Persona = { emailAddress?: { name?: string; address?: string } };
const comoTexto = (p: Persona | undefined) =>
    p?.emailAddress ? (p.emailAddress.name ? `${p.emailAddress.name} <${p.emailAddress.address}>` : p.emailAddress.address ?? "") : "";

const outlook = {
    /** Cuántos correos hay en la bandeja de entrada: el `totalItemCount` de `inbox`. */
    async total(buzon: Buzon): Promise<number> {
        const token = await elTokenVigente(buzon, "outlook");
        const f = await pedir<{ totalItemCount?: number }>(`${GRAPH}/mailFolders/inbox?$select=totalItemCount`, token);
        return comoTotal(f.totalItemCount);
    },

    /** Cuántos SIN LEER hay en la bandeja de entrada: el `unreadItemCount` de `inbox`. */
    async sinLeer(buzon: Buzon): Promise<number> {
        const token = await elTokenVigente(buzon, "outlook");
        const f = await pedir<{ unreadItemCount?: number }>(`${GRAPH}/mailFolders/inbox?$select=unreadItemCount`, token);
        return comoTotal(f.unreadItemCount);
    },

    async bandeja(buzon: Buzon, cursor: string | null, carpeta: CarpetaDeCorreo = "entrada"): Promise<Pagina> {
        const token = await elTokenVigente(buzon, "outlook");
        // `archive` es la carpeta conocida de «Archivo»: la misma a la que va archivar.
        const carpetaDeGraph = carpeta === "archivo" ? "archive" : "inbox";
        const salto = Math.max(0, Number.parseInt(cursor ?? "0", 10) || 0);
        const q = new URLSearchParams({
            $top: String(TAMANO_DE_PAGINA),
            $skip: String(salto),
            $orderby: "receivedDateTime desc",
            $select: "id,subject,from,receivedDateTime,bodyPreview,isRead,hasAttachments,flag",
        });
        const r = await pedir<{ value?: any[]; "@odata.nextLink"?: string }>(`${GRAPH}/mailFolders/${carpetaDeGraph}/messages?${q}`, token);
        const correos: ResumenDeCorreo[] = (r.value ?? []).map((m) => ({
            id: m.id,
            de: m.from?.emailAddress?.name || m.from?.emailAddress?.address || "",
            deDireccion: m.from?.emailAddress?.address || "",
            asunto: m.subject ?? "",
            fragmento: m.bodyPreview ?? "",
            fecha: fechaIso(m.receivedDateTime),
            sinLeer: m.isRead === false,
            conAdjuntos: Boolean(m.hasAttachments),
            destacado: m.flag?.flagStatus === "flagged",
        }));
        return { correos, siguiente: r["@odata.nextLink"] ? String(salto + correos.length) : null };
    },

    async leer(buzon: Buzon, id: string): Promise<CorreoCompleto> {
        const token = await elTokenVigente(buzon, "outlook");
        const sel = "id,subject,from,toRecipients,ccRecipients,replyTo,receivedDateTime,body,internetMessageId,conversationId,hasAttachments";
        const m = await pedir<any>(`${GRAPH}/messages/${encodeURIComponent(id)}?$select=${sel}`, token);
        let adjuntos: AdjuntoDeCorreo[] = [];
        if (m.hasAttachments) {
            const a = await pedir<{ value?: any[] }>(
                `${GRAPH}/messages/${encodeURIComponent(id)}/attachments?$select=id,name,contentType,size,isInline`,
                token,
            );
            adjuntos = (a.value ?? []).map((x) => ({
                id: x.id,
                nombre: x.name || "adjunto",
                tipo: x.contentType || "application/octet-stream",
                tamano: typeof x.size === "number" ? x.size : null,
            }));
        }
        const de = partirRemitente(comoTexto(m.from));
        const esHtml = String(m.body?.contentType ?? "").toLowerCase() === "html";
        return {
            id: m.id,
            de: de.nombre,
            deDireccion: de.direccion,
            para: (m.toRecipients ?? []).map(comoTexto).join(", "),
            cc: (m.ccRecipients ?? []).map(comoTexto).join(", "),
            asunto: m.subject ?? "",
            fecha: fechaIso(m.receivedDateTime),
            html: esHtml ? m.body?.content ?? null : null,
            texto: esHtml ? null : m.body?.content ?? null,
            adjuntos,
            idDeMensaje: m.internetMessageId ?? null,
            referencias: null,
            hilo: m.conversationId ?? null,
            responderA: comoTexto(m.replyTo?.[0]) || comoTexto(m.from),
        };
    },

    async marcarComoLeido(buzon: Buzon, id: string): Promise<void> {
        const token = await elTokenVigente(buzon, "outlook");
        await pedir(`${GRAPH}/messages/${encodeURIComponent(id)}`, token, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ isRead: true }),
        });
    },

    async marcarComoNoLeido(buzon: Buzon, id: string): Promise<void> {
        await outlook.cambiar(buzon, id, { isRead: false });
    },

    async destacar(buzon: Buzon, id: string, destacado: boolean): Promise<void> {
        // La «bandera» de Outlook es su destacado: la misma que se ve en su app.
        await outlook.cambiar(buzon, id, { flag: { flagStatus: destacado ? "flagged" : "notFlagged" } });
    },

    async cambiar(buzon: Buzon, id: string, cambio: Record<string, unknown>): Promise<void> {
        const token = await elTokenVigente(buzon, "outlook");
        await pedir(`${GRAPH}/messages/${encodeURIComponent(id)}`, token, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(cambio),
        });
    },

    async archivar(buzon: Buzon, id: string): Promise<Archivado> {
        const token = await elTokenVigente(buzon, "outlook");
        // `archive` es la carpeta conocida de «Archivo»: la misma que su botón.
        await pedir(`${GRAPH}/messages/${encodeURIComponent(id)}/move`, token, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ destinationId: "archive" }),
        });
        return { carpeta: "Archivo" };
    },

    async eliminar(buzon: Buzon, id: string): Promise<Eliminado> {
        const token = await elTokenVigente(buzon, "outlook");
        // Mover a «Elementos eliminados», nunca DELETE: se recupera desde ahí.
        await pedir(`${GRAPH}/messages/${encodeURIComponent(id)}/move`, token, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ destinationId: "deleteditems" }),
        });
        return { aLaPapelera: true };
    },

    async adjunto(buzon: Buzon, id: string, adjuntoId: string): Promise<AdjuntoDescargado> {
        const token = await elTokenVigente(buzon, "outlook");
        const a = await pedir<any>(
            `${GRAPH}/messages/${encodeURIComponent(id)}/attachments/${encodeURIComponent(adjuntoId)}`,
            token,
        );
        if (!a.contentBytes) throw new ErrorDeCorreo("Ese adjunto no es un archivo que se pueda descargar.");
        return { nombre: a.name || "adjunto", tipo: a.contentType || "application/octet-stream", bytes: Buffer.from(a.contentBytes, "base64") };
    },

    async responder(buzon: Buzon, original: CorreoCompleto, texto: string, adjuntos: AdjuntoParaEnviar[] = []): Promise<void> {
        const token = await elTokenVigente(buzon, "outlook");
        // `reply` engancha la respuesta al hilo y la deja en Enviados: es lo
        // mismo que hacen las cabeceras a mano en los otros dos. Los archivos
        // van en `message.attachments`, que `reply` admite junto al `comment`.
        const cuerpo: Record<string, unknown> = { comment: elHtmlDeUnTexto(texto) };
        if (adjuntos.length) cuerpo.message = { attachments: paraGraph(adjuntos) };
        await pedir(`${GRAPH}/messages/${encodeURIComponent(original.id)}/reply`, token, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(cuerpo),
        });
    },

    async reenviar(buzon: Buzon, original: CorreoCompleto, para: string[], texto: string, adjuntos: AdjuntoParaEnviar[] = []): Promise<void> {
        const token = await elTokenVigente(buzon, "outlook");
        // `forward` lleva solo los archivos del original: no hay que bajarlos.
        const cuerpo: Record<string, unknown> = {
            comment: elHtmlDeUnTexto(texto),
            toRecipients: para.map((address) => ({ emailAddress: { address } })),
        };
        if (adjuntos.length) cuerpo.message = { attachments: paraGraph(adjuntos) };
        await pedir(`${GRAPH}/messages/${encodeURIComponent(original.id)}/forward`, token, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(cuerpo),
        });
    },
};

/* ── Dominio propio (IMAP + SMTP) ─────────────────────────────────────────── */

function lasCredencialesImap(buzon: Buzon): CredencialesImap {
    const c = buzon.credenciales;
    if (!c || c.tipo !== "imap") throw new ErrorDeCorreo("Este correo hay que volver a conectarlo.", true);
    return c;
}

/**
 * Una conexión por petición, y se cierra pase lo que pase. En solo lectura
 * salvo que se pida `escribir`: solo marcar y eliminar lo piden.
 */
async function conImap<T>(
    buzon: Buzon,
    hacer: (cliente: any) => Promise<T>,
    { escribir = false, enArchivo = false, sinArchivo }: { escribir?: boolean; enArchivo?: boolean; sinArchivo?: () => T } = {},
): Promise<T> {
    const c = lasCredencialesImap(buzon);
    const { ImapFlow } = await import("imapflow");
    const cliente = new ImapFlow({
        host: c.imapHost,
        port: c.imapPuerto,
        secure: c.imapSeguro,
        auth: { user: c.usuario, pass: c.contrasena },
        logger: false,
        socketTimeout: 30_000,
    } as any);
    try {
        await cliente.connect();
    } catch (error: any) {
        const autenticacion = Boolean(error?.authenticationFailed) || /auth/i.test(String(error?.responseText ?? error?.message ?? ""));
        if (autenticacion) {
            await marcarParaReconectar(buzon.personaId, buzon.id, "El servidor rechazó el usuario o la contraseña.");
            throw new ErrorDeCorreo("El servidor rechazó el usuario o la contraseña.", true);
        }
        throw new ErrorDeCorreo(`No se pudo conectar con ${c.imapHost}: ${error?.message ?? error}`);
    }
    try {
        // Solo lectura para traer: pedir el cuerpo no marca nada por su cuenta.
        // Un correo del ARCHIVO se abre en SU carpeta: el UID es de ella.
        let carpeta = "INBOX";
        if (enArchivo) {
            const archivo = elArchivoImap(await cliente.list().catch(() => []));
            if (!archivo) {
                if (sinArchivo) return sinArchivo();
                throw new ErrorDeCorreo("Tu servidor no tiene carpeta de archivo.");
            }
            carpeta = archivo;
        }
        await cliente.mailboxOpen(carpeta, { readOnly: !escribir });
        return await hacer(cliente);
    } finally {
        await cliente.logout().catch(() => cliente.close?.());
    }
}

function tieneAdjuntos(estructura: any): boolean {
    const pila = [estructura];
    while (pila.length) {
        const n = pila.pop();
        if (!n) continue;
        if (String(n.disposition ?? "").toLowerCase() === "attachment") return true;
        if (n.childNodes) pila.push(...n.childNodes);
    }
    return false;
}

async function elCorreoImap(cliente: any, uid: string) {
    const { simpleParser } = await import("mailparser");
    const m = await cliente.fetchOne(uid, { source: true, uid: true }, { uid: true });
    if (!m?.source) throw new ErrorDeCorreo("Ese correo ya no está en la bandeja.");
    return simpleParser(m.source);
}

function direccionesDe(valor: any): string {
    const lista = Array.isArray(valor) ? valor : valor ? [valor] : [];
    return lista.map((v: any) => v?.text ?? "").filter(Boolean).join(", ");
}

const imap = {
    /** Cuántos correos hay en `INBOX`: el `STATUS … (MESSAGES)` del servidor. */
    async total(buzon: Buzon): Promise<number> {
        return conImap(buzon, async (cliente) => comoTotal((await cliente.status("INBOX", { messages: true }))?.messages));
    },

    /** Cuántos SIN LEER hay en `INBOX`: el `STATUS … (UNSEEN)` del servidor. */
    async sinLeer(buzon: Buzon): Promise<number> {
        return conImap(buzon, async (cliente) => comoTotal((await cliente.status("INBOX", { unseen: true }))?.unseen));
    },

    async bandeja(buzon: Buzon, cursor: string | null, carpeta: CarpetaDeCorreo = "entrada"): Promise<Pagina> {
        const enArchivo = carpeta === "archivo";
        // Sin carpeta de archivo no hay nada archivado todavía: una lista vacía, no un error.
        return conImap(buzon, async (cliente) => {
            const uids: number[] = ((await cliente.search({ all: true }, { uid: true })) || []).sort((a: number, b: number) => b - a);
            const salto = Math.max(0, Number.parseInt(cursor ?? "0", 10) || 0);
            const pagina = uids.slice(salto, salto + TAMANO_DE_PAGINA);
            const correos: ResumenDeCorreo[] = [];
            if (pagina.length) {
                for await (const m of cliente.fetch(pagina.join(","), { uid: true, envelope: true, flags: true, bodyStructure: true }, { uid: true })) {
                    const marcas: Set<string> = m.flags instanceof Set ? m.flags : new Set();
                    const f = m.envelope?.from?.[0];
                    correos.push({
                        id: enArchivo ? idImapDelArchivo(m.uid) : String(m.uid),
                        de: f?.name || f?.address || "",
                        deDireccion: f?.address || "",
                        asunto: m.envelope?.subject ?? "",
                        fragmento: "",
                        fecha: fechaIso(m.envelope?.date),
                        sinLeer: !marcas.has("\\Seen"),
                        conAdjuntos: tieneAdjuntos(m.bodyStructure),
                        destacado: marcas.has("\\Flagged"),
                    });
                }
            }
            correos.sort((a, b) => Number(partirIdImap(b.id).uid) - Number(partirIdImap(a.id).uid));
            return { correos, siguiente: salto + TAMANO_DE_PAGINA < uids.length ? String(salto + TAMANO_DE_PAGINA) : null };
        }, { enArchivo, sinArchivo: () => ({ correos: [], siguiente: null }) });
    },

    async leer(buzon: Buzon, id: string): Promise<CorreoCompleto> {
        const { enArchivo, uid } = partirIdImap(id);
        return conImap(buzon, async (cliente) => {
            const c = await elCorreoImap(cliente, uid);
            const from = c.from?.value?.[0];
            const replyTo = c.replyTo?.value?.[0];
            return {
                id,
                de: from?.name || from?.address || "",
                deDireccion: from?.address || "",
                para: direccionesDe(c.to),
                cc: direccionesDe(c.cc),
                asunto: c.subject ?? "",
                fecha: fechaIso(c.date),
                html: typeof c.html === "string" ? c.html : null,
                texto: c.text ?? null,
                adjuntos: (c.attachments ?? []).map((a: any, i: number) => ({
                    id: String(i),
                    nombre: a.filename || "adjunto",
                    tipo: a.contentType || "application/octet-stream",
                    tamano: typeof a.size === "number" ? a.size : null,
                })),
                idDeMensaje: c.messageId ?? null,
                referencias: Array.isArray(c.references) ? c.references.join(" ") : c.references ?? null,
                hilo: null,
                responderA: replyTo ? (replyTo.name ? `${replyTo.name} <${replyTo.address}>` : replyTo.address ?? "") : c.from?.text ?? "",
            };
        }, { enArchivo });
    },

    async marcarComoLeido(buzon: Buzon, id: string): Promise<void> {
        const { enArchivo, uid } = partirIdImap(id);
        await conImap(
            buzon,
            async (cliente) => {
                await cliente.messageFlagsAdd(uid, ["\\Seen"], { uid: true });
            },
            { escribir: true, enArchivo },
        );
    },

    async marcarComoNoLeido(buzon: Buzon, id: string): Promise<void> {
        const { enArchivo, uid } = partirIdImap(id);
        await conImap(
            buzon,
            async (cliente) => {
                await cliente.messageFlagsRemove(uid, ["\\Seen"], { uid: true });
            },
            { escribir: true, enArchivo },
        );
    },

    async destacar(buzon: Buzon, id: string, destacado: boolean): Promise<void> {
        const { enArchivo, uid } = partirIdImap(id);
        await conImap(
            buzon,
            async (cliente) => {
                if (destacado) await cliente.messageFlagsAdd(uid, ["\\Flagged"], { uid: true });
                else await cliente.messageFlagsRemove(uid, ["\\Flagged"], { uid: true });
            },
            { escribir: true, enArchivo },
        );
    },

    async archivar(buzon: Buzon, id: string): Promise<Archivado> {
        const { enArchivo, uid } = partirIdImap(id);
        // Uno que ya está en el archivo no se mueve a ninguna parte.
        if (enArchivo) throw new ErrorDeCorreo("Ese correo ya está archivado.");
        return conImap(
            buzon,
            async (cliente) => {
                const existe = await cliente.fetchOne(uid, { uid: true }, { uid: true });
                if (!existe) throw new ErrorDeCorreo("Ese correo ya no está en la bandeja.");
                let archivo = elArchivoImap(await cliente.list().catch(() => []));
                if (!archivo) {
                    // Sin carpeta de archivo, se crea «Archive»: es lo que hacen
                    // Thunderbird y Apple Mail, y así archivar nunca borra.
                    await cliente.mailboxCreate("Archive");
                    archivo = "Archive";
                }
                await cliente.messageMove(uid, archivo, { uid: true });
                return { carpeta: archivo };
            },
            { escribir: true },
        );
    },

    async eliminar(buzon: Buzon, id: string): Promise<Eliminado> {
        const { enArchivo, uid } = partirIdImap(id);
        return conImap(
            buzon,
            async (cliente) => {
                const existe = await cliente.fetchOne(uid, { uid: true }, { uid: true });
                if (!existe) throw new ErrorDeCorreo("Ese correo ya no está en la bandeja.");
                const papelera = laPapeleraImap(await cliente.list().catch(() => []));
                if (papelera) {
                    await cliente.messageMove(uid, papelera, { uid: true });
                    return { aLaPapelera: true };
                }
                // Sin papelera no hay adónde moverlo: se borra, y la acción lo DICE.
                await cliente.messageDelete(uid, { uid: true });
                return { aLaPapelera: false };
            },
            { escribir: true, enArchivo },
        );
    },

    async adjunto(buzon: Buzon, id: string, adjuntoId: string): Promise<AdjuntoDescargado> {
        const { enArchivo, uid } = partirIdImap(id);
        return conImap(buzon, async (cliente) => {
            const c = await elCorreoImap(cliente, uid);
            const a = (c.attachments ?? [])[Number(adjuntoId)];
            if (!a) throw new ErrorDeCorreo("Ese adjunto ya no está en el correo.");
            return { nombre: a.filename || "adjunto", tipo: a.contentType || "application/octet-stream", bytes: a.content };
        }, { enArchivo });
    },

    async responder(buzon: Buzon, original: CorreoCompleto, texto: string, adjuntos: AdjuntoParaEnviar[] = []): Promise<void> {
        await enviarPorSmtp(buzon, {
            to: original.responderA,
            subject: elAsuntoDeLaRespuesta(original.asunto),
            text: texto,
            inReplyTo: original.idDeMensaje ?? undefined,
            references: lasReferenciasDeLaRespuesta(original.referencias, original.idDeMensaje) ?? undefined,
            attachments: paraNodemailer(adjuntos),
        });
    },

    async reenviar(buzon: Buzon, original: CorreoCompleto, para: string[], texto: string, adjuntos: AdjuntoParaEnviar[] = []): Promise<void> {
        const ocupado = adjuntos.reduce((n, a) => n + Buffer.byteLength(a.base64, "base64"), 0);
        const delOriginal = await losAdjuntosDelOriginal(imap, buzon, original, ocupado);
        const cuerpo = elCuerpoDelReenvio(original, texto);
        await enviarPorSmtp(buzon, {
            to: para.join(", "),
            subject: elAsuntoDelReenvio(original.asunto),
            text: cuerpo.texto,
            html: cuerpo.html,
            attachments: paraNodemailer([...delOriginal, ...adjuntos]),
        });
    },
};

/** Mandar por el SMTP del buzón: responder y reenviar salen por aquí, con el mismo trato del error. */
async function enviarPorSmtp(buzon: Buzon, mensaje: Record<string, unknown>): Promise<void> {
    const c = lasCredencialesImap(buzon);
    const nodemailer = await import("nodemailer");
    const transporte = nodemailer.createTransport({
        host: c.smtpHost,
        port: c.smtpPuerto,
        secure: c.smtpSeguro,
        auth: { user: c.usuario, pass: c.contrasena },
    });
    try {
        await transporte.sendMail({
            from: buzon.nombre ? { name: buzon.nombre, address: buzon.direccion } : buzon.direccion,
            ...mensaje,
        });
    } catch (error: any) {
        if (error?.code === "EAUTH") {
            await marcarParaReconectar(buzon.personaId, buzon.id, "El servidor de salida rechazó el usuario o la contraseña.");
            throw new ErrorDeCorreo("El servidor de salida rechazó el usuario o la contraseña.", true);
        }
        throw new ErrorDeCorreo(`No se pudo enviar: ${error?.message ?? error}`);
    }
}

/** El MIME de una respuesta, para Gmail. Lo arma nodemailer, que codifica bien los acentos del asunto. */
async function componerLaRespuesta(desde: string, original: CorreoCompleto, texto: string, adjuntos: AdjuntoParaEnviar[] = []): Promise<Buffer> {
    const { default: MailComposer } = (await import("nodemailer/lib/mail-composer")) as any;
    const mensaje = new MailComposer({
        from: desde,
        to: original.responderA,
        subject: elAsuntoDeLaRespuesta(original.asunto),
        text: texto,
        inReplyTo: original.idDeMensaje ?? undefined,
        references: lasReferenciasDeLaRespuesta(original.referencias, original.idDeMensaje) ?? undefined,
        attachments: paraNodemailer(adjuntos),
    });
    return mensaje.compile().build();
}

/** El MIME de un reenvío, para Gmail: el original debajo de lo escrito, con sus archivos. */
async function componerElReenvio(
    desde: string,
    original: CorreoCompleto,
    para: string[],
    texto: string,
    adjuntos: AdjuntoParaEnviar[],
): Promise<Buffer> {
    const { default: MailComposer } = (await import("nodemailer/lib/mail-composer")) as any;
    const cuerpo = elCuerpoDelReenvio(original, texto);
    const mensaje = new MailComposer({
        from: desde,
        to: para.join(", "),
        subject: elAsuntoDelReenvio(original.asunto),
        text: cuerpo.texto,
        html: cuerpo.html,
        attachments: paraNodemailer(adjuntos),
    });
    return mensaje.compile().build();
}

export const PROVEEDORES = { gmail, outlook, imap } as const;

export function elProveedorDe(buzon: Buzon) {
    return PROVEEDORES[buzon.proveedor];
}

/** Probar un buzón de dominio propio ANTES de guardarlo: el de entrada y el de salida. */
export async function probarImap(c: CredencialesImap): Promise<void> {
    // No pasa por `conImap`: ese marcaría para reconectar un buzón que todavía
    // no existe. Aquí el motivo se devuelve tal cual, para enseñarlo.
    const { ImapFlow } = await import("imapflow");
    const cliente = new ImapFlow({
        host: c.imapHost, port: c.imapPuerto, secure: c.imapSeguro,
        auth: { user: c.usuario, pass: c.contrasena }, logger: false, socketTimeout: 20_000,
    } as any);
    try {
        await cliente.connect();
        await cliente.mailboxOpen("INBOX", { readOnly: true });
    } catch (error: any) {
        throw new ErrorDeCorreo(`El servidor de entrada no aceptó la conexión: ${error?.responseText || error?.message || error}`);
    } finally {
        await cliente.logout().catch(() => cliente.close?.());
    }
    const nodemailer = await import("nodemailer");
    const t = nodemailer.createTransport({
        host: c.smtpHost, port: c.smtpPuerto, secure: c.smtpSeguro,
        auth: { user: c.usuario, pass: c.contrasena },
    });
    try {
        await t.verify();
    } catch (error: any) {
        throw new ErrorDeCorreo(`El servidor de salida no aceptó la conexión: ${error?.message || error}`);
    }
}
