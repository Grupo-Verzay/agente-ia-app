/**
 * LOS ADJUNTOS DE UNA NOTA INTERNA en la pantalla real, en Chromium y sobre el
 * CSS del build: los componentes de VERDAD (`InternalNoteBubble`,
 * `ChatInputBar`) con las acciones mudas.
 *
 * La burbuja —lo que se ve al ABRIR la nota después—:
 *   1. imagen, video, audio y documento a la vista, cada uno con su visor;
 *   2. cada archivo con su enlace de descarga (nombre, peso, `download`);
 *   3. pulsar la imagen abre el visor, con su botón de descargar;
 *   4. una nota que es SOLO un archivo no pinta un párrafo vacío;
 *   5. a 390 de ancho nada se sale de la pantalla.
 *
 * La caja de escribir en modo nota:
 *   6. con un archivo y SIN texto se puede guardar la nota, y no sale al cliente
 *      (y mientras suben los archivos, guardar queda bloqueado);
 *   7. un documento o un audio se pintan con su icono —no con una foto rota—;
 *   8. el menú de adjuntar ofrece «Video» solo dentro de una nota;
 *   9. una grabación se ADJUNTA a la nota; al cliente sigue siendo «Enviar nota de voz».
 *
 * `MODO=roto` pinta los componentes de `ANTES_REF` y AFIRMA el fallo: la
 * burbuja no enseñaba ningún archivo y la caja no dejaba guardar una nota sin
 * texto, ni ofrecía video, ni sabía adjuntar la grabación.
 *
 * Se levanta con `scripts/banco-adjuntos-en-notas.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
let chromium = null;
try {
    ({ chromium } = require("playwright"));
} catch {
    // Sin navegador no se finge: se salta y se dice.
}

const ROTO = process.env.MODO === "roto";
const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..", "..");
const HARNESS = join(AQUI, ".compilado", "adjuntos-notas", "harness.js");
const cssDir = join(RAIZ, ".next", "static", "css");
const conNavegador = chromium && fs.existsSync(HARNESS) && fs.existsSync(cssDir) ? test : test.skip;

/* ── Los archivos que sirve el banco ── */

const PNG = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
);
function wav() {
    const muestras = 4410; // 0,1 s de silencio a 44,1 kHz
    const b = Buffer.alloc(44 + muestras * 2);
    b.write("RIFF", 0); b.writeUInt32LE(36 + muestras * 2, 4); b.write("WAVE", 8); b.write("fmt ", 12);
    b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(44100, 24);
    b.writeUInt32LE(88200, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write("data", 36);
    b.writeUInt32LE(muestras * 2, 40);
    return b;
}
const PDF = Buffer.from("%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 0/Kids[]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF");
const ARCHIVOS = {
    "/m/foto.png": ["image/png", PNG],
    "/m/clip.webm": ["video/webm", Buffer.from("no-es-un-video-de-verdad")],
    "/m/nota.wav": ["audio/wav", wav()],
    "/m/contrato.pdf": ["application/pdf", PDF],
};

async function abrir(que, datos, pintar, ancho = 1000) {
    const css = fs.readdirSync(cssDir).filter((f) => f.endsWith(".css")).map((f) => fs.readFileSync(join(cssDir, f), "utf8")).join("\n");
    const js = fs.readFileSync(HARNESS, "utf8");
    const srv = http.createServer((q, res) => {
        const f = ARCHIVOS[q.url.split("?")[0]];
        if (f) { res.setHeader("content-type", f[0]); res.end(f[1]); return; }
        // Todo lo que no es la página ni un archivo es un 404 (el lector de PDF
        // pide su worker): servirle la página como si fuera código lo rompería.
        if (q.url.split("?")[0] !== "/") { res.statusCode = 404; res.end(); return; }
        const base = `http://127.0.0.1:${srv.address().port}`;
        const json = JSON.stringify({ __que: que, __base: base, ...datos(base) }).replace(/</g, "\\u003c");
        res.setHeader("content-type", "text/html");
        res.end(
            `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head>` +
            `<body><div id="app"></div><script>window.process=window.process||{env:{}};Object.assign(window, ${json});</script>` +
            `<script type="module">${js}</script></body></html>`,
        );
    });
    await new Promise((ok) => srv.listen(0, ok));
    const nav = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined });
    try {
        const pag = await nav.newPage({ viewport: { width: ancho, height: 900 } });
        await pag.route(/^https?:\/\/(?!127\.0\.0\.1)/, (q) => q.abort());
        const errores = [];
        pag.on("pageerror", (e) => errores.push(String(e)));
        await pag.goto(`http://127.0.0.1:${srv.address().port}/`);
        await pag.waitForFunction(() => window.listo === true);
        await pag.waitForTimeout(300);
        await pintar(pag);
        assert.deepEqual(errores, [], "sin errores en la página");
        await pag.close();
    } finally {
        await nav.close();
        srv.close();
    }
}

const adjuntosDe = (b) => [
    { url: `${b}/m/foto.png`, nombre: "foto-del-local.png", mime: "image/png", tamano: 204800, tipo: "image" },
    { url: `${b}/m/clip.webm`, nombre: "recorrido.webm", mime: "video/webm", tamano: 3145728, tipo: "video" },
    { url: `${b}/m/nota.wav`, nombre: "nota-de-voz.wav", mime: "audio/wav", tamano: 8800, tipo: "audio" },
    { url: `${b}/m/contrato.pdf`, nombre: "contrato.pdf", mime: "application/pdf", tamano: 51200, tipo: "document" },
];

/* ── La burbuja: lo que se ve al abrir la nota ── */

conNavegador("la burbuja enseña imagen, video, audio y documento, cada uno con su descarga", { skip: ROTO }, async () => {
    await abrir("burbujas", (b) => ({
        __burbujas: [
            { content: "Revisa el contrato y la foto del local", adjuntos: adjuntosDe(b) },
            { content: "", adjuntos: [adjuntosDe(b)[0]] },
        ],
    }), async (pag) => {
        const primera = pag.locator("[data-burbuja='0']");
        assert.deepEqual(
            await primera.locator("[data-nota-adjunto]").evaluateAll((ns) => ns.map((n) => n.getAttribute("data-nota-adjunto"))),
            ["image", "video", "audio", "document"],
            "los cuatro tipos, en el orden en que se adjuntaron",
        );
        assert.ok(await primera.getByText("Revisa el contrato y la foto del local").isVisible(), "el texto de la nota sigue ahí");

        const img = primera.locator("[data-nota-adjunto='image'] img");
        await img.waitFor({ state: "visible" });
        assert.ok(await img.evaluate((i) => i.complete && i.naturalWidth > 0), "la imagen CARGÓ de verdad");
        const video = primera.locator("[data-nota-adjunto='video'] video");
        assert.ok(await video.isVisible(), "el video se ve");
        assert.equal(await video.getAttribute("src"), `${await pag.evaluate(() => window.__base)}/m/clip.webm`);
        assert.equal(await video.evaluate((v) => v.controls), true, "con sus mandos");
        const audio = primera.locator("[data-nota-adjunto='audio']");
        assert.ok(await audio.isVisible(), "el audio se ve");
        assert.ok(await audio.locator("button, audio").count() > 0, "y se puede reproducir");
        assert.ok(await primera.locator("[data-nota-adjunto='document']").getByText("contrato.pdf").first().isVisible(), "el documento dice cómo se llama");

        // La descarga: a la vista, con el nombre y el peso, y apuntando al archivo.
        const enlaces = primera.locator("a[data-nota-descargar]");
        assert.equal(await enlaces.count(), 4);
        const lo = await enlaces.evaluateAll((as) => as.map((a) => ({
            href: a.getAttribute("href"), download: a.getAttribute("download"), texto: a.textContent.trim(),
            visible: !!(a.offsetWidth && a.offsetHeight), blanco: a.target, rel: a.rel,
        })));
        const base = await pag.evaluate(() => window.__base);
        assert.deepEqual(lo.map((x) => x.href), [`${base}/m/foto.png`, `${base}/m/clip.webm`, `${base}/m/nota.wav`, `${base}/m/contrato.pdf`]);
        assert.deepEqual(lo.map((x) => x.download), ["foto-del-local.png", "recorrido.webm", "nota-de-voz.wav", "contrato.pdf"]);
        assert.ok(lo.every((x) => x.visible), "los cuatro enlaces se ven");
        assert.ok(lo.every((x) => x.blanco === "_blank" && /noopener/.test(x.rel)), "se abren fuera, sin darle la ventana a nadie");
        assert.match(lo[0].texto, /foto-del-local\.png/);
        assert.match(lo[0].texto, /200 KB/);
        assert.match(lo[1].texto, /3 MB/);
    });
});

conNavegador("pulsar la imagen abre el visor, y el visor deja descargar", { skip: ROTO }, async () => {
    await abrir("burbujas", (b) => ({ __burbujas: [{ content: "foto", adjuntos: [adjuntosDe(b)[0]] }] }), async (pag) => {
        await pag.locator("[data-nota-adjunto='image'] img").click();
        const descargar = pag.getByRole("button", { name: "Descargar archivo" });
        await descargar.waitFor({ state: "visible", timeout: 5000 });
        assert.ok(await descargar.isVisible(), "el visor trae su botón de descargar");
        await pag.keyboard.press("Escape");
    });
});

conNavegador("una nota que es SOLO un archivo no pinta un párrafo vacío", { skip: ROTO }, async () => {
    await abrir("burbujas", (b) => ({ __burbujas: [{ content: "", adjuntos: [adjuntosDe(b)[3]] }] }), async (pag) => {
        assert.equal(await pag.locator("[data-burbuja='0'] p").count(), 0, "sin texto no hay párrafo");
        assert.ok(await pag.locator("[data-burbuja='0'] [data-nota-adjunto='document']").isVisible());
    });
});

conNavegador("a 390 de ancho la nota con sus cuatro archivos no se sale de la pantalla", { skip: ROTO }, async () => {
    await abrir("burbujas", (b) => ({ __burbujas: [{ content: "con todo", adjuntos: adjuntosDe(b) }] }), async (pag) => {
        const { scroll, ancho } = await pag.evaluate(() => ({ scroll: document.documentElement.scrollWidth, ancho: window.innerWidth }));
        assert.ok(scroll <= ancho, `se sale: ${scroll} > ${ancho}`);
    }, 390);
});

conNavegador("MODO=roto: la burbuja de antes no enseñaba ningún archivo", { skip: !ROTO }, async () => {
    await abrir("burbujas", (b) => ({ __burbujas: [{ content: "Revisa el contrato", adjuntos: adjuntosDe(b) }] }), async (pag) => {
        assert.equal(await pag.locator("[data-nota-adjunto]").count(), 0, "el fallo: la nota guardaba el archivo y no se veía");
        assert.equal(await pag.locator("a[data-nota-descargar]").count(), 0, "el fallo: ni una descarga");
    });
});

/* ── La caja de escribir, en modo nota ── */

const documento = { mediatype: "document", dataUrl: "data:application/pdf;base64,JVBERg==", mimeType: "application/pdf", fileName: "contrato.pdf" };
const audio = { mediatype: "audio", dataUrl: "data:audio/webm;base64,GkXfow==", mimeType: "audio/webm", fileName: "audio-7.webm" };
const grabado = { base64Pure: "GkXfow==", dataUrlWithPrefix: "data:audio/webm;base64,GkXfow==", mimetype: "audio/webm", durationSecs: 4 };

conNavegador("con un archivo y SIN texto la nota se puede guardar, y no sale al cliente", { skip: ROTO }, async () => {
    await abrir("caja", () => ({ __caja: { noteMode: true, media: [documento, audio] } }), async (pag) => {
        const guardar = pag.getByRole("button", { name: "Guardar nota" });
        assert.equal(await guardar.isDisabled(), false, "con archivos la nota se puede guardar sin texto");
        assert.equal(
            await pag.getByLabel("Escribe tu mensaje").getAttribute("placeholder"),
            "Texto de la nota (opcional)...",
            "no dice «pie de foto»: esto es una nota",
        );
        await guardar.click();
        const eventos = await pag.evaluate(() => window.__eventos);
        assert.deepEqual(eventos, [{ tipo: "guardar-nota", texto: "", archivos: ["contrato.pdf", "audio-7.webm"] }]);
    });
});

conNavegador("mientras los archivos suben, guardar queda bloqueado (un segundo clic no guarda otra nota)", { skip: ROTO }, async () => {
    await abrir("caja", () => ({ __caja: { noteMode: true, media: [documento], enviando: true } }), async (pag) => {
        assert.equal(await pag.getByRole("button", { name: "Guardar nota" }).isDisabled(), true);
    });
});

conNavegador("sin texto y sin archivos la nota NO se puede guardar", { skip: ROTO }, async () => {
    await abrir("caja", () => ({ __caja: { noteMode: true, media: [] } }), async (pag) => {
        assert.equal(await pag.getByRole("button", { name: "Guardar nota" }).isDisabled(), true);
    });
});

conNavegador("un documento y un audio se pintan con su icono, no con una foto rota", { skip: ROTO }, async () => {
    await abrir("caja", () => ({ __caja: { noteMode: true, media: [documento, audio] } }), async (pag) => {
        const caja = pag.locator("[data-caja]");
        assert.ok(await caja.getByText("contrato.pdf").isVisible());
        assert.ok(await caja.getByText("audio-7.webm").isVisible());
        assert.equal(await caja.locator("img[alt='contrato.pdf'], img[alt='audio-7.webm']").count(), 0, "ni una <img> para lo que no es foto");
    });
});

conNavegador("«Video» se ofrece dentro de una nota y no al cliente", { skip: ROTO }, async () => {
    await abrir("caja", () => ({ __caja: { noteMode: true, media: [] } }), async (pag) => {
        const opciones = async () => {
            await pag.getByRole("button", { name: "Adjuntar" }).click();
            const items = await pag.locator("[role='dialog'] button, [data-radix-popper-content-wrapper] button").allInnerTexts();
            await pag.keyboard.press("Escape");
            return items.map((t) => t.trim()).filter(Boolean);
        };
        const enNota = await opciones();
        assert.ok(enNota.includes("Video"), `en una nota debe haber Video: ${enNota}`);
        assert.ok(enNota.includes("Imagen") && enNota.includes("Documento") && enNota.some((t) => t.startsWith("Audio")), enNota.join("|"));

        await pag.getByRole("button", { name: "Nota interna" }).click(); // vuelve a escribir al cliente
        const alCliente = await opciones();
        assert.ok(!alCliente.includes("Video"), `al cliente no se ofrece Video: ${alCliente}`);
    });
});

conNavegador("elegir un video lo deja en la caja de la nota", { skip: ROTO }, async () => {
    await abrir("caja", () => ({ __caja: { noteMode: true, media: [] } }), async (pag) => {
        await pag.setInputFiles("input[type='file'][accept='video/*']", { name: "recorrido.mp4", mimeType: "video/mp4", buffer: Buffer.from("video") });
        await pag.locator("[data-caja]").getByText("recorrido.mp4").waitFor({ state: "visible" });
        assert.equal(await pag.getByRole("button", { name: "Guardar nota" }).isDisabled(), false);
    });
});

conNavegador("una grabación se ADJUNTA a la nota; escribiendo al cliente sigue siendo «Enviar nota de voz»", { skip: ROTO }, async () => {
    await abrir("caja", () => ({ __caja: { noteMode: true, media: [], recordedAudio: grabado } }), async (pag) => {
        assert.equal(await pag.getByRole("button", { name: "Enviar nota de voz" }).count(), 0, "dentro de una nota no se manda al cliente");
        const adjuntar = pag.getByRole("button", { name: "Adjuntar el audio a la nota" });
        await adjuntar.click();
        await pag.locator("[data-caja]").getByText("audio-1.webm").waitFor({ state: "visible" });
        assert.deepEqual(await pag.evaluate(() => window.__eventos), [{ tipo: "adjuntar-audio" }]);
    });
    await abrir("caja", () => ({ __caja: { noteMode: false, media: [], recordedAudio: grabado } }), async (pag) => {
        assert.equal(await pag.getByRole("button", { name: "Enviar nota de voz" }).count(), 1);
        assert.equal(await pag.getByRole("button", { name: "Adjuntar el audio a la nota" }).count(), 0);
    });
});

conNavegador("MODO=roto: la caja de antes no dejaba guardar una nota sin texto, ni ofrecía video, ni adjuntaba la grabación", { skip: !ROTO }, async () => {
    await abrir("caja", () => ({ __caja: { noteMode: true, media: [documento] } }), async (pag) => {
        assert.equal(await pag.getByRole("button", { name: "Guardar nota" }).isDisabled(), true, "el fallo: con un archivo y sin texto no se guardaba");
        await pag.getByRole("button", { name: "Adjuntar" }).click();
        const items = await pag.locator("[data-radix-popper-content-wrapper] button").allInnerTexts();
        assert.ok(!items.map((t) => t.trim()).includes("Video"), "el fallo: no había Video");
        await pag.keyboard.press("Escape");
    });
    await abrir("caja", () => ({ __caja: { noteMode: true, media: [], recordedAudio: grabado } }), async (pag) => {
        assert.equal(await pag.getByRole("button", { name: "Adjuntar el audio a la nota" }).count(), 0, "el fallo: la grabación solo podía salir al cliente");
        assert.equal(await pag.getByRole("button", { name: "Enviar nota de voz" }).count(), 1);
    });
});
