/**
 * Reenviar, en Chromium y con los componentes REALES: la burbuja (las dos
 * caras) y el panel de elegir conversaciones.
 *
 * Lo que solo se contesta aquí: que el botón está donde se ve y mide lo que
 * Responder, que el «⋯» —que Radix pinta en un portal y solo al abrirlo— lo
 * ofrece, y que el panel busca, marca varias, topa en cinco y entrega lo
 * elegido. `MODO=roto` monta la burbuja de `ANTES_REF` y AFIRMA que no había
 * ninguna forma de reenviar.
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
const COMP = join(AQUI, ".compilado", "reenviar-mensaje");
const CSS = fs.readFileSync(process.env.CSS_DEL_BANCO, "utf8");

function levantar(bundle) {
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
            res.end(fs.readFileSync(bundle));
            return;
        }
        res.writeHead(404);
        res.end();
    });
    return new Promise((r) => server.listen(0, () => r(server)));
}

async function abrir(bundle, ancho = 1280) {
    const server = await levantar(bundle);
    const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined });
    const page = await browser.newPage({ viewport: { width: ancho, height: 900 } });
    const errores = [];
    page.on("pageerror", (e) => errores.push(String(e)));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForFunction(() => window.listo === true, null, { timeout: 15000 }).catch(() => {});
    assert.deepEqual(errores, [], "la maqueta se pinta sin errores");
    return { page, cerrar: async () => { await browser.close(); server.close(); } };
}

for (const id of ["propia", "ajena"]) {
    test(`burbuja ${id}: ${ROTO ? "ANTES no hay forma de reenviar" : "Reenviar al lado de Responder, y en el «⋯»"}`, async () => {
        const { page, cerrar } = await abrir(join(COMP, "burbuja.js"));
        try {
            const caja = page.locator(`[data-burbuja="${id}"]`);
            await caja.hover();
            const reenviar = caja.locator('button[aria-label="Reenviar"]');
            if (ROTO) {
                assert.equal(await reenviar.count(), 0, "ANTES: la burbuja no tiene botón de reenviar");
                await caja.locator('[data-menu-del-mensaje]').click();
                const menu = page.locator('[data-panel-del-mensaje]');
                await menu.waitFor();
                assert.doesNotMatch(await menu.innerText(), /Reenviar/, "ANTES: el «⋯» no lo ofrece");
                return;
            }
            assert.equal(await reenviar.count(), 1);
            const responder = caja.locator('button[aria-label="Responder"]');
            const a = await responder.boundingBox();
            const b = await reenviar.boundingBox();
            assert.equal(Math.round(b.width), Math.round(a.width), "mismo ancho que Responder");
            assert.equal(Math.round(b.height), Math.round(a.height), "mismo alto que Responder");
            assert.equal(Math.round(b.y), Math.round(a.y), "en la misma línea");
            // Pegados: Responder y después Reenviar, en las dos caras.
            assert.ok(b.x > a.x && b.x - (a.x + a.width) <= 8, `Reenviar va justo después de Responder (${a.x}→${b.x})`);
            const opacidad = await reenviar.evaluate((n) => getComputedStyle(n).opacity);
            assert.equal(opacidad, "1", "al pasar el ratón se ve");
            await reenviar.click();
            assert.deepEqual(await page.evaluate(() => window.log), [`reenviar:${id}`]);

            await caja.locator('[data-menu-del-mensaje]').click();
            const item = page.locator('[data-reenviar-del-menu]');
            await item.waitFor();
            await item.click();
            assert.deepEqual(await page.evaluate(() => window.log), [`reenviar:${id}`, `reenviar:${id}`]);
        } finally {
            await cerrar();
        }
    });
}

if (!ROTO) {
    for (const ancho of [1440, 1024, 390]) {
        test(`panel a ${ancho}: busca, marca varias, topa en 5 y entrega lo elegido`, async () => {
            const { page, cerrar } = await abrir(join(COMP, "panel.js"), ancho);
            try {
                await page.evaluate(() => window.abrir());
                const panel = page.locator("[data-panel-reenviar]");
                await panel.waitFor();
                assert.equal(await page.locator("[data-destino-reenvio]").count(), 8);
                assert.match(await page.locator("[data-vista-reenvio]").innerText(), /cotización/);

                const buscar = page.locator("[data-buscar-reenvio]");
                await buscar.fill("maria");
                assert.equal(await page.locator("[data-destino-reenvio]").count(), 1, "sin acentos encuentra a María");
                await buscar.fill("1119999");
                assert.deepEqual(await page.locator("[data-destino-reenvio]").allInnerTexts().then((t) => t.map((x) => x.split("\n")[0])), ["Tienda El Sol"]);
                await buscar.fill("");

                const boton = page.locator("[data-confirmar-reenvio]");
                assert.equal(await boton.isDisabled(), true, "sin nada elegido no se puede confirmar");
                const filas = page.locator("[data-destino-reenvio]");
                for (let i = 0; i < 6; i++) {
                    const f = filas.nth(i);
                    if (!(await f.isDisabled())) await f.click();
                }
                assert.equal(await page.locator('[data-destino-reenvio][aria-selected="true"]').count(), 5, "tope de cinco");
                assert.equal(await filas.nth(5).isDisabled(), true, "la sexta se apaga");
                assert.equal(await page.locator("[data-contador-reenvio]").innerText(), "5/5");
                // Desmarcar una deja volver a marcar.
                await filas.nth(0).click();
                assert.equal(await filas.nth(5).isDisabled(), false);
                await filas.nth(5).click();

                // El pie: Cancelar a la izquierda, Reenviar a la derecha.
                const cancelar = page.getByRole("button", { name: "Cancelar" });
                const c = await cancelar.boundingBox();
                const r = await boton.boundingBox();
                assert.ok(c.x < r.x, "Cancelar a la izquierda de Reenviar");
                assert.match(await boton.innerText(), /Reenviar \(5\)/);

                // Nada desborda a lo ancho.
                const desborda = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
                assert.equal(desborda, false);

                await boton.click();
                await page.waitForFunction(() => window.enviados.length === 1);
                const enviados = await page.evaluate(() => window.enviados[0].map((d) => d.nombre));
                assert.deepEqual(enviados, ["Pedro Gómez", "Ana Ruiz", "Carlos Díaz", "Lucía Mora", "Jorge Vega"]);
            } finally {
                await cerrar();
            }
        });
    }
}
