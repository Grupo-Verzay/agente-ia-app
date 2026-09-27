/**
 * Un servidor IMAP de mentira. Los mensajes son FUENTES RFC 822 de verdad, así
 * que lo que se prueba del lado de la plataforma —mailparser, los adjuntos, las
 * cabeceras de la respuesta— es el código de producción. Lo único fingido es el
 * socket.
 *
 * Apunta si la bandeja se abrió en solo lectura, qué marcas se pusieron y
 * adónde se movió un correo: traer no marca nada; marcar y eliminar sí, y son
 * los únicos que abren con escritura.
 */
const g = globalThis as any;
export class ImapFlow {
    constructor(private opciones: any) {
        g.__imap ??= { aperturas: [] as any[], mensajes: [] as any[] };
    }
    async connect() {
        const esperado = g.__imap.contrasena ?? "buena";
        if (this.opciones?.auth?.pass !== esperado) {
            const e: any = new Error("Authentication failed");
            e.authenticationFailed = true;
            throw e;
        }
    }
    async mailboxOpen(ruta: string, opciones: any) {
        g.__imap.aperturas.push({ ruta, readOnly: Boolean(opciones?.readOnly) });
        return { path: ruta, exists: g.__imap.mensajes.length };
    }
    async search() {
        return g.__imap.mensajes.map((m: any) => m.uid);
    }
    async *fetch(rango: string) {
        const uids = rango.split(",").map(Number);
        for (const m of g.__imap.mensajes) {
            if (!uids.includes(m.uid)) continue;
            yield {
                uid: m.uid,
                flags: new Set([...(m.leido ? ["\\Seen"] : []), ...(m.destacado ? ["\\Flagged"] : [])]),
                envelope: m.envelope,
                bodyStructure: m.conAdjunto ? { childNodes: [{ disposition: "attachment" }] } : { type: "text/plain" },
            };
        }
    }
    async fetchOne(uid: string) {
        const m = g.__imap.mensajes.find((x: any) => String(x.uid) === String(uid));
        return m ? { uid: m.uid, source: Buffer.from(m.fuente) } : false;
    }
    async messageFlagsAdd(uid: string, flags: string[]) {
        (g.__imap.marcas ??= []).push({ uid: String(uid), flags });
        const m = g.__imap.mensajes.find((x: any) => String(x.uid) === String(uid));
        if (m && flags.includes("\\Seen")) m.leido = true;
        if (m && flags.includes("\\Flagged")) m.destacado = true;
        return true;
    }
    async messageFlagsRemove(uid: string, flags: string[]) {
        (g.__imap.quitadas ??= []).push({ uid: String(uid), flags });
        const m = g.__imap.mensajes.find((x: any) => String(x.uid) === String(uid));
        if (m && flags.includes("\\Seen")) m.leido = false;
        if (m && flags.includes("\\Flagged")) m.destacado = false;
        return true;
    }
    async mailboxCreate(ruta: string) {
        (g.__imap.creadas ??= []).push(ruta);
        g.__imap.carpetas = [...(g.__imap.carpetas ?? [{ path: "INBOX", specialUse: "\\Inbox" }]), { path: ruta }];
        return { path: ruta, created: true };
    }
    async list() {
        return g.__imap.carpetas ?? [{ path: "INBOX", specialUse: "\\Inbox" }, { path: "Papelera", specialUse: "\\Trash" }];
    }
    async messageMove(uid: string, destino: string) {
        (g.__imap.movidos ??= []).push({ uid: String(uid), destino });
        g.__imap.mensajes = g.__imap.mensajes.filter((x: any) => String(x.uid) !== String(uid));
        return { destination: destino };
    }
    async messageDelete(uid: string) {
        (g.__imap.borrados ??= []).push(String(uid));
        g.__imap.mensajes = g.__imap.mensajes.filter((x: any) => String(x.uid) !== String(uid));
        return true;
    }
    async logout() {}
    close() {}
}
