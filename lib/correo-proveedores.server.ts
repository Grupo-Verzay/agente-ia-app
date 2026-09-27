import "server-only";

import {
    elAsuntoDeLaRespuesta,
    elHtmlDeUnTexto,
    lasReferenciasDeLaRespuesta,
    partirRemitente,
    TAMANO_DE_PAGINA,
    type AdjuntoDeCorreo,
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
 * Los tres proveedores detrás de UNA interfaz: bandeja, leer, adjunto y
 * responder. La pantalla y las acciones no saben cuál hay debajo, y eso es lo
 * que hace que las tres se comporten igual: lo que cambia es cómo se le
 * pregunta a cada uno, no lo que se enseña.
 *
 * Tres reglas comunes, escritas una vez:
 *
 * 1. **Leer no cambia nada en el buzón.** Ni marca como leído, ni mueve, ni
 *    archiva. Gmail va con `gmail.readonly` (no podría aunque quisiera), así
 *    que para que las tres digan lo mismo, Outlook e IMAP tampoco lo hacen:
 *    IMAP abre la bandeja en solo lectura y pide el cuerpo con `PEEK`.
 * 2. **Una autorización que el proveedor rechaza deja el buzón en «volver a
 *    conectar»** con su motivo, en vez de fallar en cada vuelta sin decir nada.
 * 3. **Nada de aquí escribe en la base un mensaje.** Solo credenciales.
 */

export class ErrorDeCorreo extends Error {
    constructor(
        message: string,
        /** El proveedor rechazó la autorización: hay que volver a conectar. */
        public readonly reconectar = false,
    ) {
        super(message);
        this.name = "ErrorDeCorreo";
    }
}

export interface Pagina {
    correos: ResumenDeCorreo[];
    /** Para pedir la página siguiente; `null` si no hay más. */
    siguiente: string | null;
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
        if (proveedor === "outlook") cuerpo.scope = "offline_access User.Read Mail.Read Mail.Send";
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
        const motivo = String(datos?.error?.message || datos?.error_description || datos?.error || `HTTP ${r.status}`);
        throw new ErrorDeCorreo(motivo, r.status === 401);
    }
    return datos as T;
}

/* ── Gmail ────────────────────────────────────────────────────────────────── */

const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";

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
    async bandeja(buzon: Buzon, cursor: string | null): Promise<Pagina> {
        const token = await elTokenVigente(buzon, "gmail");
        const q = new URLSearchParams({ labelIds: "INBOX", maxResults: String(TAMANO_DE_PAGINA) });
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

    async responder(buzon: Buzon, original: CorreoCompleto, texto: string): Promise<void> {
        const token = await elTokenVigente(buzon, "gmail");
        const crudo = await componerLaRespuesta(buzon.direccion, original, texto);
        await pedir(`${GMAIL}/messages/send`, token, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ raw: crudo.toString("base64url"), threadId: original.hilo ?? undefined }),
        });
    },
};

/* ── Outlook (Microsoft Graph) ───────────────────────────────────────────── */

const GRAPH = "https://graph.microsoft.com/v1.0/me";

type Persona = { emailAddress?: { name?: string; address?: string } };
const comoTexto = (p: Persona | undefined) =>
    p?.emailAddress ? (p.emailAddress.name ? `${p.emailAddress.name} <${p.emailAddress.address}>` : p.emailAddress.address ?? "") : "";

const outlook = {
    async bandeja(buzon: Buzon, cursor: string | null): Promise<Pagina> {
        const token = await elTokenVigente(buzon, "outlook");
        const salto = Math.max(0, Number.parseInt(cursor ?? "0", 10) || 0);
        const q = new URLSearchParams({
            $top: String(TAMANO_DE_PAGINA),
            $skip: String(salto),
            $orderby: "receivedDateTime desc",
            $select: "id,subject,from,receivedDateTime,bodyPreview,isRead,hasAttachments",
        });
        const r = await pedir<{ value?: any[]; "@odata.nextLink"?: string }>(`${GRAPH}/mailFolders/inbox/messages?${q}`, token);
        const correos: ResumenDeCorreo[] = (r.value ?? []).map((m) => ({
            id: m.id,
            de: m.from?.emailAddress?.name || m.from?.emailAddress?.address || "",
            deDireccion: m.from?.emailAddress?.address || "",
            asunto: m.subject ?? "",
            fragmento: m.bodyPreview ?? "",
            fecha: fechaIso(m.receivedDateTime),
            sinLeer: m.isRead === false,
            conAdjuntos: Boolean(m.hasAttachments),
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

    async adjunto(buzon: Buzon, id: string, adjuntoId: string): Promise<AdjuntoDescargado> {
        const token = await elTokenVigente(buzon, "outlook");
        const a = await pedir<any>(
            `${GRAPH}/messages/${encodeURIComponent(id)}/attachments/${encodeURIComponent(adjuntoId)}`,
            token,
        );
        if (!a.contentBytes) throw new ErrorDeCorreo("Ese adjunto no es un archivo que se pueda descargar.");
        return { nombre: a.name || "adjunto", tipo: a.contentType || "application/octet-stream", bytes: Buffer.from(a.contentBytes, "base64") };
    },

    async responder(buzon: Buzon, original: CorreoCompleto, texto: string): Promise<void> {
        const token = await elTokenVigente(buzon, "outlook");
        // `reply` engancha la respuesta al hilo y la deja en Enviados: es lo
        // mismo que hacen las cabeceras a mano en los otros dos.
        await pedir(`${GRAPH}/messages/${encodeURIComponent(original.id)}/reply`, token, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ comment: elHtmlDeUnTexto(texto) }),
        });
    },
};

/* ── Dominio propio (IMAP + SMTP) ─────────────────────────────────────────── */

function lasCredencialesImap(buzon: Buzon): CredencialesImap {
    const c = buzon.credenciales;
    if (!c || c.tipo !== "imap") throw new ErrorDeCorreo("Este correo hay que volver a conectarlo.", true);
    return c;
}

/** Una conexión por petición, y se cierra pase lo que pase. */
async function conImap<T>(buzon: Buzon, hacer: (cliente: any) => Promise<T>): Promise<T> {
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
        // Solo lectura: abrir un correo aquí no lo marca como leído allí.
        await cliente.mailboxOpen("INBOX", { readOnly: true });
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
    async bandeja(buzon: Buzon, cursor: string | null): Promise<Pagina> {
        return conImap(buzon, async (cliente) => {
            const uids: number[] = ((await cliente.search({ all: true }, { uid: true })) || []).sort((a: number, b: number) => b - a);
            const salto = Math.max(0, Number.parseInt(cursor ?? "0", 10) || 0);
            const pagina = uids.slice(salto, salto + TAMANO_DE_PAGINA);
            const correos: ResumenDeCorreo[] = [];
            if (pagina.length) {
                for await (const m of cliente.fetch(pagina.join(","), { uid: true, envelope: true, flags: true, bodyStructure: true }, { uid: true })) {
                    const f = m.envelope?.from?.[0];
                    correos.push({
                        id: String(m.uid),
                        de: f?.name || f?.address || "",
                        deDireccion: f?.address || "",
                        asunto: m.envelope?.subject ?? "",
                        fragmento: "",
                        fecha: fechaIso(m.envelope?.date),
                        sinLeer: !(m.flags instanceof Set ? m.flags.has("\\Seen") : false),
                        conAdjuntos: tieneAdjuntos(m.bodyStructure),
                    });
                }
            }
            correos.sort((a, b) => Number(b.id) - Number(a.id));
            return { correos, siguiente: salto + TAMANO_DE_PAGINA < uids.length ? String(salto + TAMANO_DE_PAGINA) : null };
        });
    },

    async leer(buzon: Buzon, id: string): Promise<CorreoCompleto> {
        return conImap(buzon, async (cliente) => {
            const c = await elCorreoImap(cliente, id);
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
        });
    },

    async adjunto(buzon: Buzon, id: string, adjuntoId: string): Promise<AdjuntoDescargado> {
        return conImap(buzon, async (cliente) => {
            const c = await elCorreoImap(cliente, id);
            const a = (c.attachments ?? [])[Number(adjuntoId)];
            if (!a) throw new ErrorDeCorreo("Ese adjunto ya no está en el correo.");
            return { nombre: a.filename || "adjunto", tipo: a.contentType || "application/octet-stream", bytes: a.content };
        });
    },

    async responder(buzon: Buzon, original: CorreoCompleto, texto: string): Promise<void> {
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
                to: original.responderA,
                subject: elAsuntoDeLaRespuesta(original.asunto),
                text: texto,
                inReplyTo: original.idDeMensaje ?? undefined,
                references: lasReferenciasDeLaRespuesta(original.referencias, original.idDeMensaje) ?? undefined,
            });
        } catch (error: any) {
            if (error?.code === "EAUTH") {
                await marcarParaReconectar(buzon.personaId, buzon.id, "El servidor de salida rechazó el usuario o la contraseña.");
                throw new ErrorDeCorreo("El servidor de salida rechazó el usuario o la contraseña.", true);
            }
            throw new ErrorDeCorreo(`No se pudo enviar: ${error?.message ?? error}`);
        }
    },
};

/** El MIME de una respuesta, para Gmail. Lo arma nodemailer, que codifica bien los acentos del asunto. */
async function componerLaRespuesta(desde: string, original: CorreoCompleto, texto: string): Promise<Buffer> {
    const { default: MailComposer } = (await import("nodemailer/lib/mail-composer")) as any;
    const mensaje = new MailComposer({
        from: desde,
        to: original.responderA,
        subject: elAsuntoDeLaRespuesta(original.asunto),
        text: texto,
        inReplyTo: original.idDeMensaje ?? undefined,
        references: lasReferenciasDeLaRespuesta(original.referencias, original.idDeMensaje) ?? undefined,
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
