/**
 * Un servidor IMAP de mentira. Los mensajes son FUENTES RFC 822 de verdad, así
 * que lo que se prueba del lado de la plataforma —mailparser, los adjuntos, las
 * cabeceras de la respuesta— es el código de producción. Lo único fingido es el
 * socket.
 *
 * Apunta si la bandeja se abrió en solo lectura: leer en la plataforma no puede
 * marcar nada como leído en el buzón.
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
                flags: new Set(m.leido ? ["\\Seen"] : []),
                envelope: m.envelope,
                bodyStructure: m.conAdjunto ? { childNodes: [{ disposition: "attachment" }] } : { type: "text/plain" },
            };
        }
    }
    async fetchOne(uid: string) {
        const m = g.__imap.mensajes.find((x: any) => String(x.uid) === String(uid));
        return m ? { uid: m.uid, source: Buffer.from(m.fuente) } : false;
    }
    async logout() {}
    close() {}
}
