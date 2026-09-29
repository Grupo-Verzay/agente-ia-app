/**
 * La tarjeta de ubicación en Chromium, sobre el CSS de Tailwind, con las
 * burbujas REALES armadas por `toUIMessages`.
 *
 * Lo que solo se contesta aquí: que se pinta con el MISMO marco y el MISMO
 * ancho que la tarjeta de un documento, que el pin cae en el centro del mapa,
 * que el enlace abre las coordenadas (y no el `url` que trae el mensaje) en otra
 * pestaña, y que nada desborda en un teléfono. `MODO=roto` pinta las burbujas de
 * `ANTES_REF` y AFIRMA el fallo: «[Mensaje locationMessage]» y ningún mapa.
 */
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = (() => { for (const p of [undefined, ...(process.env.NODE_PATH ?? "").split(":").filter(Boolean)]) { try { return p ? require(require.resolve("playwright", { paths: [p] })) : require("playwright"); } catch {} } throw new Error("no se encontró playwright"); })();

const ROTO = process.env.MODO === "roto";
const AQUI = dirname(fileURLToPath(import.meta.url));
const BUNDLE = join(AQUI, ".compilado", "ubicacion-compartida", "burbujas.js");
const CSS = fs.readFileSync(process.env.CSS_DEL_BANCO, "utf8");
// Un píxel de un gris claro en PNG: las teselas se sirven desde aquí, sin red.
const TESELA = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==", "base64");

function levantar() {
    const server = http.createServer((req, res) => {
        const u = (req.url ?? "/").split("?")[0];
        if (u === "/") {
            res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
            res.end(
                `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">` +
                    `<style>${CSS}</style><style>*,*::before,*::after{animation:none !important;transition:none !important}</style>` +
                    `<script>window.process={env:{}}</script>` +
                    `</head><body><div id="app"></div><script type="module" src="/h.js"></script></body></html>`,
            );
            return;
        }
        if (u === "/h.js") {
            res.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8" });
            res.end(fs.readFileSync(BUNDLE));
            return;
        }
        res.writeHead(404);
        res.end();
    });
    return new Promise((r) => server.listen(0, () => r(server)));
}

async function abrir(ancho) {
    const server = await levantar();
    const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined });
    const context = await browser.newContext({ viewport: { width: ancho, height: 900 } });
    const pedidas = [];
    // Playwright mira las rutas de la ÚLTIMA registrada a la primera: el corte
    // general va antes, o se comería también las teselas.
    await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => route.abort());
    await context.route("https://tile.openstreetmap.org/**", (route) => {
        pedidas.push(route.request().url());
        route.fulfill({ status: 200, contentType: "image/png", body: TESELA });
    });
    const page = await context.newPage();
    const errores = [];
    page.on("pageerror", (e) => errores.push(String(e)));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForFunction(() => window.listo === true, null, { timeout: 15000 });
    assert.deepEqual(errores, [], "las burbujas se pintan sin errores");
    return { page, pedidas, cerrar: async () => { await browser.close(); server.close(); } };
}

if (ROTO) {
    test("ANTES: la ubicación sale como «[Mensaje locationMessage]», sin mapa ni enlace", async () => {
        const { page, cerrar } = await abrir(1280);
        try {
            const b = await page.evaluate(() => window.burbujas);
            const ubic = b.find((x) => x.id === "ubicacion");
            assert.match(ubic.content, /\[Mensaje locationMessage\]/, "ANTES: el nombre crudo del tipo");
            assert.equal(ubic.ubicacion, false);
            assert.match(await page.locator('[data-burbuja="ubicacion"]').innerText(), /\[Mensaje locationMessage\]/);
            assert.equal(await page.locator("[data-tarjeta-de-ubicacion]").count(), 0, "ANTES: ninguna tarjeta de mapa");
            assert.equal(await page.locator('[data-burbuja="ubicacion"] a[href*="maps"]').count(), 0, "ANTES: nada que abrir");
        } finally {
            await cerrar();
        }
    });
} else {
    for (const ancho of [1440, 1024, 390]) {
        test(`a ${ancho}: la ubicación es una tarjeta con mapa, del tamaño de la de un documento`, async () => {
            const { page, pedidas, cerrar } = await abrir(ancho);
            try {
                const b = await page.evaluate(() => window.burbujas);
                assert.deepEqual(
                    b.filter((x) => x.id !== "documento").map((x) => [x.id, x.content, x.ubicacion]),
                    [["ubicacion", "", true], ["envivo", "", true]],
                    "sin texto crudo: lo dice la tarjeta",
                );

                const tarjeta = page.locator('[data-burbuja="ubicacion"] [data-tarjeta-de-ubicacion]');
                assert.equal(await tarjeta.count(), 1);
                const documento = page.locator('[data-burbuja="documento"] .rounded-md.overflow-hidden.border').first();
                const t = await tarjeta.boundingBox();
                const d = await documento.boundingBox();
                assert.equal(Math.round(t.width), Math.round(d.width), `mismo ancho que un documento (${t.width} / ${d.width})`);
                const marco = (loc) => loc.evaluate((n) => { const s = getComputedStyle(n); return [s.borderTopWidth, s.borderRadius, s.overflow]; });
                assert.deepEqual(await marco(tarjeta), await marco(documento), "el mismo marco");

                // El pin: su punta en el centro exacto del mapa.
                const m = await tarjeta.locator("[data-mapa]").boundingBox();
                const pin = await tarjeta.locator("[data-pin]").boundingBox();
                assert.ok(Math.abs(pin.x + pin.width / 2 - (m.x + m.width / 2)) <= 1, "el pin centrado en horizontal");
                assert.ok(Math.abs(pin.y + pin.height - (m.y + m.height / 2)) <= 1, "la punta del pin en el centro vertical");
                assert.equal(Math.round(m.height), 150, "el alto de la miniatura de un documento");

                // Las teselas se pidieron (perezosas, pero están a la vista) y cubren el mapa.
                await page.waitForFunction(() => document.querySelectorAll("[data-mapa] img").length > 0 && [...document.querySelectorAll("[data-mapa] img")].every((i) => i.complete && i.naturalWidth > 0));
                assert.ok(pedidas.some((p) => /\/15\/\d+\/\d+\.png$/.test(p)), "se pidieron teselas del zoom 15");

                // El enlace: las coordenadas, en otra pestaña, nunca el `url` del mensaje.
                const a = tarjeta.locator("a");
                assert.equal(await a.getAttribute("href"), "https://www.google.com/maps/search/?api=1&query=10.987800,-74.788900");
                assert.equal(await a.getAttribute("target"), "_blank");
                assert.match(await a.getAttribute("rel"), /noopener/);
                const texto = await tarjeta.innerText();
                assert.match(texto, /Tienda El Sol/);
                assert.match(texto, /Cra 53 #75-20, Barranquilla/);

                // La ubicación en vivo lo dice.
                assert.match(await page.locator('[data-burbuja="envivo"] [data-tarjeta-de-ubicacion]').innerText(), /Ubicación en vivo/);

                const desborda = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
                assert.equal(desborda, false, "nada desborda a lo ancho");
            } finally {
                await cerrar();
            }
        });
    }
}
