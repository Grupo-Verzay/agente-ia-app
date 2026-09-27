/**
 * Reenviar un mensaje: la DECISIÓN y un barrido del código, sin navegador.
 *
 * La decisión es `lib/reenviar-mensaje.ts` (pura): qué se reenvía de cada
 * burbuja, qué dirección de archivo sirve, a quién y cuántos, y qué se dice al
 * terminar. El barrido comprueba lo que la decisión sola no dice: que la
 * pantalla la USA, que cada destino sale por el `sendText` de SU línea —no por
 * un camino nuevo— y que los dos envíos que firman se saltan la firma en un
 * reenvío.
 *
 * `MODO=roto` lee los ficheros de `ANTES_REF` con `git show` y AFIRMA el
 * fallo: no había ninguna forma de reenviar un mensaje.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROTO = process.env.MODO === "roto";
const ANTES = process.env.ANTES_REF || "2017da3";
const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..", "..");

function leer(ruta) {
    if (!ROTO) return fs.existsSync(join(RAIZ, ruta)) ? fs.readFileSync(join(RAIZ, ruta), "utf8") : null;
    try {
        return execFileSync("git", ["show", `${ANTES}:${ruta}`], { cwd: RAIZ, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    } catch {
        return null;
    }
}

const BURBUJA = "app/(root)/chats/_components/MessageBubble.tsx";
const MENU = "app/(root)/chats/_components/MessageContextMenu.tsx";
const LISTA = "app/(root)/chats/_components/ChatMessageList.tsx";
const BANDEJA = "app/(root)/chats/_components/chats-client.tsx";
const PANEL = "components/chats/ReenviarMensaje.tsx";

if (ROTO) {
    test("ANTES: la burbuja no tiene botón de reenviar", () => {
        assert.doesNotMatch(leer(BURBUJA), /onForward|Reenviar/);
    });
    test("ANTES: el menú «⋯» no ofrece Reenviar", () => {
        assert.doesNotMatch(leer(MENU), /Reenviar/);
    });
    test("ANTES: no existe el panel de elegir conversaciones", () => {
        assert.equal(leer(PANEL), null);
    });
    test("ANTES: la bandeja no sabe reenviar", () => {
        assert.doesNotMatch(leer(BANDEJA), /reenviar/i);
    });
} else {
    const r = await import("./.compilado/reenviar-mensaje/reenviar-mensaje.js");

    test("un texto se reenvía tal cual, sin firma", () => {
        const lo = r.loQueSeReenvia({ id: "1", content: "  Hola, ¿qué tal?  " });
        assert.deepEqual(lo, { kind: "text", text: "Hola, ¿qué tal?" });
        assert.deepEqual(r.elPayloadDelReenvio(lo), { kind: "text", text: "Hola, ¿qué tal?", reenviado: true });
    });

    test("una imagen conserva su archivo, su pie y su tipo", () => {
        const lo = r.loQueSeReenvia({
            id: "2",
            content: "la foto",
            media: { type: "image", url: "data:image/png;base64,AAAA", mimeType: "image/png", caption: "Precio 20k" },
        });
        const p = r.elPayloadDelReenvio(lo);
        assert.equal(p.kind, "media");
        assert.equal(p.mediatype, "image");
        assert.equal(p.mediaUrl, "data:image/png;base64,AAAA");
        assert.equal(p.caption, "Precio 20k", "el pie de la burbuja manda sobre el texto");
        assert.equal(p.ptt, false);
        assert.equal(p.reenviado, true);
    });

    test("una nota de voz sale como NOTA DE VOZ; un mp3 adjunto, como archivo", () => {
        const nota = r.loQueSeReenvia({ id: "3", media: { type: "audio", url: "https://s3.x/a.ogg", mimeType: "audio/ogg; codecs=opus" } });
        assert.equal(nota.ptt, true);
        const mp3 = r.loQueSeReenvia({ id: "4", media: { type: "audio", url: "https://s3.x/a.mp3", mimeType: "audio/mpeg" } });
        assert.equal(mp3.ptt, false);
    });

    test("no se ofrece reenviar lo que no es un mensaje", () => {
        for (const m of [
            { id: "a", kind: "call", content: "Llamada" },
            { id: "b", kind: "reaction", content: "👍" },
            { id: "c", kind: "sticker", media: { type: "image", url: "https://s3.x/s.webp" } },
            { id: "d", content: "Mensaje eliminado" },
            { id: "e", content: "hola", clientDeleted: true },
            { id: "f", content: "nota", esNota: true },
            { id: "g", content: "   " },
            { id: "h", media: { type: "location", url: "x" } },
        ]) {
            assert.equal(r.sePuedeReenviar(m), false, JSON.stringify(m));
        }
        assert.equal(r.sePuedeReenviar(null), false);
    });

    test("la dirección de WhatsApp va CIFRADA: no se manda, se pide el archivo", () => {
        assert.equal(r.laUrlSirve("https://mmg.whatsapp.net/v/t62.7118-24/abc.enc?oh=1"), false);
        assert.equal(r.laUrlSirve("https://cdn.x.com/archivo.enc"), false);
        assert.equal(r.laUrlSirve("/v/t62.7118-24/abc"), false, "un directPath no es una dirección");
        assert.equal(r.laUrlSirve("blob:http://x/1"), false);
        assert.equal(r.laUrlSirve("https://s3.verzay.com/b/a.ogg"), true);
        assert.equal(r.laUrlSirve("data:image/jpeg;base64,/9j/4"), true);
        assert.equal(r.laUrlSirve(""), false);
        const lo = r.loQueSeReenvia({ id: "5", media: { type: "image", url: "https://mmg.whatsapp.net/x.enc", mimeType: "image/jpeg" } });
        assert.equal(r.elPayloadDelReenvio(lo), null, "sin archivo que sirva no hay payload");
        const conArchivo = r.elPayloadDelReenvio(lo, "data:image/jpeg;base64,/9j/4");
        assert.equal(conArchivo.mediaUrl, "data:image/jpeg;base64,/9j/4");
    });

    test("los destinos: sin repetidos, sin el origen, y como mucho cinco", () => {
        const d = (linea, n) => ({ linea, remoteJid: `57300${n}@s.whatsapp.net`, nombre: `N${n}` });
        const salida = r.losDestinosDelReenvio(
            [d("V", 1), d("V", 1), d("A", 1), d("V", 0), d("V", 2), d("V", 3), d("V", 4), d("V", 5), d("V", 6)],
            { linea: "V", remoteJid: "573000@s.whatsapp.net" },
        );
        assert.equal(salida.length, r.TOPE_DE_DESTINOS);
        assert.deepEqual(salida.map(r.llaveDelDestino), [
            "V::573001@s.whatsapp.net",
            "A::573001@s.whatsapp.net", // el mismo número en otra línea es OTRA conversación
            "V::573002@s.whatsapp.net",
            "V::573003@s.whatsapp.net",
            "V::573004@s.whatsapp.net",
        ]);
        assert.deepEqual(r.losDestinosDelReenvio([{ linea: "", remoteJid: "x", nombre: "sin línea" }]), []);
    });

    test("buscar: por nombre sin acentos y por número solo dígitos", () => {
        const maria = { linea: "V", remoteJid: "573001234567@s.whatsapp.net", nombre: "María López", numero: "+57 300 1234567" };
        assert.equal(r.pasaLaBusqueda(maria, "maria"), true);
        assert.equal(r.pasaLaBusqueda(maria, "LÓPEZ"), true);
        assert.equal(r.pasaLaBusqueda(maria, "300 123"), true);
        assert.equal(r.pasaLaBusqueda(maria, "pedro"), false);
        assert.equal(r.pasaLaBusqueda(maria, "999"), false);
        assert.equal(r.pasaLaBusqueda(maria, "  "), true);
    });

    test("el resumen nombra lo que no salió", () => {
        const d = (nombre) => ({ linea: "V", remoteJid: nombre, nombre });
        assert.equal(r.elResumenDelReenvio([{ destino: d("Ana"), ok: true }]).texto, "Reenviado a Ana.");
        assert.equal(r.elResumenDelReenvio([{ destino: d("Ana"), ok: true }, { destino: d("Luis"), ok: true }]).texto, "Reenviado a 2 conversaciones.");
        const parcial = r.elResumenDelReenvio([{ destino: d("Ana"), ok: true }, { destino: d("Luis"), ok: false, motivo: "sin conexión" }]);
        assert.equal(parcial.tono, "parcial");
        assert.match(parcial.texto, /1 de 2.*Luis: sin conexión/);
        assert.equal(r.elResumenDelReenvio([{ destino: d("Luis"), ok: false }]).tono, "error");
        assert.equal(r.elResumenDelReenvio([]).tono, "error");
    });

    // ── El barrido: que la pantalla USE la decisión ──────────────────────
    test("la burbuja pone Reenviar AL LADO de Responder, con su misma forma, en las dos caras", () => {
        const s = leer(BURBUJA);
        const forma = (nombre) => new RegExp(`const ${nombre} = [^]*?className="([^"]+)"`).exec(s)?.[1];
        assert.ok(forma("forwardBtn"), "hay botón de reenviar");
        assert.equal(forma("forwardBtn"), forma("replyBtn"), "misma forma que Responder");
        assert.match(s, /\{isUserMessage && replyBtn\}\s*\{isUserMessage && forwardBtn\}\s*\{isUserMessage && contextMenu\}/);
        assert.match(s, /\{!isUserMessage && replyBtn\}\s*\{!isUserMessage && forwardBtn\}\s*\{!isUserMessage && contextMenu\}/);
    });

    test("el menú «⋯» ofrece Reenviar (para el táctil)", () => {
        assert.match(leer(MENU), /onForward && \([^]*?Reenviar/);
    });

    test("la lista solo lo ofrece en lo que se puede reenviar", () => {
        assert.match(leer(LISTA), /onForwardMessage && sePuedeReenviar\(message\)/);
    });

    test("la bandeja envía por el sendText de la línea DESTINO, no por un camino nuevo", () => {
        const s = leer(BANDEJA);
        const cuerpo = /const reenviarA = useCallback\(([^]*?)\n  \}, \[/.exec(s)?.[1] ?? "";
        assert.ok(cuerpo, "existe reenviarA");
        assert.match(cuerpo, /find\(\(j\) => j\.instanceName === destino\.linea\)/);
        assert.match(cuerpo, /juego\.sendText\(/);
        assert.doesNotMatch(cuerpo, /sendAnyAction|salidaDeLaConversacion/, "nunca por la línea de la conversación abierta");
        assert.match(s, /<ReenviarMensaje[^]*?onReenviar=\{reenviarA\}/);
    });

    test("los dos envíos que firman se saltan la firma en un reenvío", () => {
        assert.match(fs.readFileSync(join(RAIZ, "actions/chat-manual-actions.ts"), "utf8"), /payload\.kind === "text" && !payload\.reenviado/);
        assert.match(fs.readFileSync(join(RAIZ, "actions/waha-chat-actions.ts"), "utf8"), /payload\.reenviado === true\s*\?\s*escrito/);
    });

    test("es un PanelLateral con su id, como «Enviar al equipo»", () => {
        const s = leer(PANEL);
        assert.match(s, /<PanelLateral[^]*?id=\{PANEL_DE_REENVIAR\}/);
        assert.match(fs.readFileSync(join(RAIZ, "lib/panel-lateral.ts"), "utf8"), /PANEL_DE_REENVIAR = "panel-reenviar-mensaje"/);
    });
}
