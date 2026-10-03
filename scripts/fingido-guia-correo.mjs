/**
 * El GMAIL de la guía de Correos, servido dentro de `next start`.
 *
 * La pantalla lee los buzones del proveedor en cada vista (`lib/correo-
 * proveedores.server.ts`): la App no guarda ni un correo. Este equipo no sale a
 * internet y, aunque saliera, una guía pública no puede enseñar el correo de
 * nadie. Así que este fichero se carga ANTES que Next (`NODE_OPTIONS=--import`,
 * lo pone `generar-guia.sh` cuando existe `fingido-guia-<modulo>.mjs`, el mismo
 * mecanismo que el Gemini fingido de AI Imágenes) y contesta en lugar de Gmail,
 * con los correos de `guia-correo-datos.mjs`.
 *
 * Lleva su ESTADO en memoria: marcar como leído, destacar, archivar y eliminar
 * cambian lo que contesta la vuelta siguiente, como en Gmail. Enviar no manda
 * nada a nadie: se apunta y se contesta bien.
 *
 * Pone además las llaves de ejemplo de Google y Microsoft, para que los botones
 * «Conectar Gmail» y «Conectar Outlook» salgan encendidos en las capturas. Las
 * capturas no los siguen: la vuelta llevaría a Google.
 *
 * Solo toca `gmail.googleapis.com`; cualquier otra dirección sigue su camino.
 */
import { statSync } from "node:fs";
import { BUZONES, CORREOS } from "./guia-correo-datos.mjs";

process.env.GOOGLE_OAUTH_CLIENT_ID ||= "guia-ejemplo.apps.googleusercontent.com";
process.env.GOOGLE_OAUTH_CLIENT_SECRET ||= "guia-ejemplo";
process.env.MICROSOFT_OAUTH_CLIENT_ID ||= "00000000-0000-0000-0000-000000000000";
process.env.MICROSOFT_OAUTH_CLIENT_SECRET ||= "guia-ejemplo";

/**
 * La semilla deja aquí la hora en que se sembró: las capturas marcan, archivan
 * y envían, y antes del vídeo se vuelve a sembrar. Al ver una hora nueva, el
 * Gmail fingido vuelve a sus correos de partida (y el reloj de sus «hace»).
 */
export const MARCA_DE_REINICIO = "/tmp/guia-correo-reinicio";

let ARRANQUE = Date.now();
let marcaVista = 0;

/** Por access token: los correos del buzón, con sus etiquetas vivas. */
const ESTADO = new Map();
function reiniciar() {
    ARRANQUE = Date.now();
    ESTADO.clear();
    for (const b of BUZONES) {
        ESTADO.set(b.token, { buzon: b, correos: (CORREOS[b.clave] ?? []).map((c) => ({ ...c, etiquetas: new Set(c.etiquetas) })) });
    }
}
reiniciar();
function siSeVolvioASembrar() {
    try {
        const m = statSync(MARCA_DE_REINICIO).mtimeMs;
        if (m !== marcaVista) {
            if (marcaVista) reiniciar();
            marcaVista = m;
        }
    } catch {
        /* sin marca: la semilla no la ha escrito todavía */
    }
}

/** Lo que se «envió»: no sale a ninguna parte, pero se puede contar. */
export const ENVIADOS = [];

const b64url = (b) => Buffer.from(b).toString("base64url");
const json = (datos, status = 200) =>
    new Response(JSON.stringify(datos), { status, headers: { "content-type": "application/json; charset=utf-8" } });

const fragmento = (texto) => texto.replace(/\s+/g, " ").trim().slice(0, 140);
const fecha = (c) => ARRANQUE - c.hace * 1000;

function cabeceras(estado, c) {
    const conAdjuntos = Boolean(c.adjuntos?.length);
    return [
        { name: "From", value: c.de },
        { name: "To", value: estado.buzon.direccion },
        { name: "Subject", value: c.asunto },
        { name: "Date", value: new Date(fecha(c)).toUTCString() },
        { name: "Message-ID", value: `<${c.id}@guia.minegocio.co>` },
        { name: "Content-Type", value: conAdjuntos ? 'multipart/mixed; boundary="guia"' : 'multipart/alternative; boundary="guia"' },
    ];
}

function cuerpoHtml(texto) {
    const parrafos = texto
        .split(/\n{2,}/)
        .map((p) => `<p style="margin:0 0 12px">${p.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br>")}</p>`)
        .join("");
    return `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#1f2937">${parrafos}</div>`;
}

function elMensaje(estado, c, formato) {
    const base = {
        id: c.id,
        threadId: `hilo-${c.id}`,
        snippet: fragmento(c.texto),
        labelIds: [...c.etiquetas],
        internalDate: String(fecha(c)),
    };
    if (formato === "metadata") return { ...base, payload: { headers: cabeceras(estado, c) } };
    const alternativa = {
        partId: "0",
        mimeType: "multipart/alternative",
        parts: [
            { partId: "0.0", mimeType: "text/plain", body: { size: c.texto.length, data: b64url(c.texto) } },
            { partId: "0.1", mimeType: "text/html", body: { data: b64url(cuerpoHtml(c.texto)) } },
        ],
    };
    const adjuntos = (c.adjuntos ?? []).map((a, i) => ({
        partId: String(i + 1),
        mimeType: a.tipo,
        filename: a.nombre,
        body: { size: a.bytes.length, attachmentId: `adj-${c.id}-${i + 1}` },
    }));
    return {
        ...base,
        payload: { mimeType: adjuntos.length ? "multipart/mixed" : "multipart/alternative", headers: cabeceras(estado, c), parts: [alternativa, ...adjuntos] },
    };
}

/** Del más nuevo al más viejo, como Gmail. */
const ordenados = (lista) => [...lista].sort((a, b) => a.hace - b.hace);

async function contestar(url, init, estado) {
    const ruta = url.pathname.replace(/^\/gmail\/v1\/users\/me/, "");
    const metodo = (init?.method || "GET").toUpperCase();
    const cuerpo = () => {
        try {
            return JSON.parse(String(init?.body ?? "{}"));
        } catch {
            return {};
        }
    };

    if (ruta === "/labels/INBOX") {
        const entrada = estado.correos.filter((c) => c.etiquetas.has("INBOX"));
        return json({ id: "INBOX", messagesTotal: entrada.length, messagesUnread: entrada.filter((c) => c.etiquetas.has("UNREAD")).length });
    }

    if (ruta === "/messages" && metodo === "GET") {
        const q = url.searchParams.get("q");
        const lista = ordenados(
            estado.correos.filter((c) => (q ? !c.etiquetas.has("INBOX") && !c.etiquetas.has("TRASH") : c.etiquetas.has("INBOX"))),
        );
        return json({ messages: lista.map((c) => ({ id: c.id, threadId: `hilo-${c.id}` })), resultSizeEstimate: lista.length });
    }

    if (ruta === "/messages/send" && metodo === "POST") {
        const datos = cuerpo();
        ENVIADOS.push({ buzon: estado.buzon.direccion, crudo: Buffer.from(String(datos.raw ?? ""), "base64url").toString("utf8") });
        return json({ id: `enviado-${ENVIADOS.length}`, threadId: datos.threadId ?? `hilo-enviado-${ENVIADOS.length}`, labelIds: ["SENT"] });
    }

    const m = /^\/messages\/([^/]+)(\/.*)?$/.exec(ruta);
    if (!m) return json({ error: { code: 404, message: "Not Found" } }, 404);
    const id = decodeURIComponent(m[1]);
    const resto = m[2] ?? "";
    const c = estado.correos.find((x) => x.id === id);
    if (!c) return json({ error: { code: 404, message: "Requested entity was not found." } }, 404);

    if (!resto && metodo === "GET") return json(elMensaje(estado, c, url.searchParams.get("format") ?? "full"));

    if (resto === "/modify" && metodo === "POST") {
        const { addLabelIds = [], removeLabelIds = [] } = cuerpo();
        for (const e of addLabelIds) c.etiquetas.add(e);
        for (const e of removeLabelIds) c.etiquetas.delete(e);
        return json({ id: c.id, labelIds: [...c.etiquetas] });
    }

    if (resto === "/trash" && metodo === "POST") {
        c.etiquetas.delete("INBOX");
        c.etiquetas.add("TRASH");
        return json({ id: c.id, labelIds: [...c.etiquetas] });
    }

    const adj = /^\/attachments\/adj-[^-]+-(\d+)$/.exec(resto);
    if (adj) {
        const a = c.adjuntos?.[Number(adj[1]) - 1];
        if (!a) return json({ error: { code: 404, message: "Not Found" } }, 404);
        return json({ size: a.bytes.length, data: b64url(a.bytes) });
    }

    return json({ error: { code: 404, message: "Not Found" } }, 404);
}

const original = globalThis.fetch;
globalThis.fetch = async function fetchDeLaGuia(entrada, init) {
    const texto = typeof entrada === "string" ? entrada : entrada instanceof URL ? entrada.href : entrada?.url;
    if (!texto || !texto.startsWith("https://gmail.googleapis.com/")) return original(entrada, init);
    const cabecera =
        init?.headers instanceof Headers ? init.headers.get("Authorization") : init?.headers?.Authorization ?? init?.headers?.authorization;
    const token = String(cabecera ?? "").replace(/^Bearer\s+/i, "");
    siSeVolvioASembrar();
    const estado = ESTADO.get(token);
    // Un poco de espera, como una consulta de verdad.
    await new Promise((r) => setTimeout(r, 120));
    if (!estado) return json({ error: { code: 401, message: "Invalid Credentials" } }, 401);
    return contestar(new URL(texto), init, estado);
};
