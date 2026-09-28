/**
 * Entrenamiento › Cotizaciones, PINTADA en Chromium sobre el CSS de la App.
 *
 * Lo que no se contesta leyendo el código:
 *
 * - que la pestaña se llama «Cotizaciones» y va DESPUÉS de las siete de
 *   siempre, sin moverlas;
 * - que nace APAGADA y que el interruptor guarda al pulsarlo;
 * - que el cuadro de texto guarda al salir de él y con el botón Guardar;
 * - que su cabecera mide y se escribe igual que la de la pestaña vecina
 *   (misma letra, mismo peso, mayúsculas);
 * - que no desborda a lo ancho en computador ni en un teléfono.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
let chromium = null;
try {
    ({ chromium } = require("playwright"));
} catch {
    // Sin navegador no se finge: el banco se cae abajo.
}

const AQUI = dirname(fileURLToPath(import.meta.url));
const HARNESS = join(AQUI, ".compilado", "cotizacion-ia-nav", "harness.js");
const CSS = fs.readFileSync(process.env.CSS_DEL_BANCO, "utf8");

function levantar() {
    const bundle = fs.readFileSync(HARNESS);
    const server = http.createServer((req, res) => {
        const u = (req.url ?? "/").split("?")[0];
        if (u === "/") {
            res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
            res.end(
                `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${CSS}</style></head>` +
                    `<body style="margin:0"><div id="pestana"></div><script>window.process={env:{}}</script>` +
                    `<script type="module" src="/harness.js"></script></body></html>`,
            );
            return;
        }
        if (u === "/harness.js") {
            res.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8" });
            res.end(bundle);
            return;
        }
        res.writeHead(404);
        res.end();
    });
    return new Promise((r) => server.listen(0, () => r(server)));
}

async function abrir(ancho) {
    const server = await levantar();
    const navegador = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined });
    const page = await (await navegador.newContext({ viewport: { width: ancho, height: 900 } })).newPage();
    const reventones = [];
    page.on("pageerror", (e) => reventones.push(String(e)));
    await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: "load" });
    await page.waitForFunction("window.listo === true", { timeout: 20000 }).catch(() => {});
    assert.deepEqual(reventones, [], "la pestaña reventó al pintarse");
    await page.waitForSelector("[data-pestana=cotizaciones]");
    return { page, cerrar: async () => { await navegador.close(); server.close(); } };
}

test("hay navegador", () => assert.ok(chromium, "sin playwright no se prueba nada: el banco NO puede salir verde"));

test("la pestaña se llama Cotizaciones y va DESPUÉS de las siete de siempre", async () => {
    const { page, cerrar } = await abrir(1440);
    try {
        const etiquetas = await page.evaluate(() => window.etiquetas);
        assert.deepEqual(etiquetas, ["Perfil", "Inicio", "Preguntas", "Productos", "Extras", "Palabras clave", "Gestion", "Cotizaciones"]);
    } finally {
        await cerrar();
    }
});

test("nace apagada; el interruptor guarda al pulsarlo y el texto al salir y con Guardar", async () => {
    const { page, cerrar } = await abrir(1440);
    try {
        const sw = page.getByRole("switch", { name: "Activar cotizaciones automáticas" });
        assert.equal(await sw.getAttribute("aria-checked"), "false");
        assert.deepEqual(await page.evaluate(() => window.__guardados ?? []), [], "no puede guardar nada sin que nadie toque");

        await sw.click();
        await page.waitForFunction(() => (window.__guardados ?? []).length === 1);
        assert.equal(await sw.getAttribute("aria-checked"), "true");
        let g = await page.evaluate(() => window.__guardados);
        assert.deepEqual(g[0], { cuentaId: "cuenta-banco", ajustes: { activa: true, instrucciones: "" } });

        const caja = page.locator("#cotizaciones-instrucciones");
        await caja.fill("Validez de 15 días.\nPago 50% anticipo.");
        await page.locator("body").click({ position: { x: 5, y: 5 } });
        await page.waitForFunction(() => (window.__guardados ?? []).length === 2);
        g = await page.evaluate(() => window.__guardados);
        assert.deepEqual(g[1].ajustes, { activa: true, instrucciones: "Validez de 15 días.\nPago 50% anticipo." });

        // Guardar sin cambios no manda nada; con cambios, sí.
        await page.evaluate(() => window.guardarConElBoton());
        assert.equal((await page.evaluate(() => window.__guardados)).length, 2);
        await caja.fill("Validez de 30 días.");
        await page.evaluate(() => window.guardarConElBoton());
        await page.waitForFunction(() => (window.__guardados ?? []).length === 3);
        assert.equal((await page.evaluate(() => window.__guardados))[2].ajustes.instrucciones, "Validez de 30 días.");
    } finally {
        await cerrar();
    }
});

for (const ancho of [1440, 1280, 1024, 390]) {
    test(`a ${ancho}: la cabecera se escribe igual que la vecina y nada desborda`, async () => {
        const { page, cerrar } = await abrir(ancho);
        try {
            const m = await page.evaluate(() => {
                const estilo = (el) => {
                    const s = getComputedStyle(el);
                    return { size: s.fontSize, weight: s.fontWeight, transform: s.textTransform };
                };
                const titulos = [...document.querySelectorAll("h3, [class*='text-base']")].filter((e) => /uppercase/.test(e.className));
                const vecina = titulos.find((e) => e.textContent === "Palabras clave");
                const nuestra = titulos.find((e) => e.textContent === "Cotizaciones");
                const card = document.querySelector("[data-pestana=cotizaciones]").getBoundingClientRect();
                return {
                    vecina: vecina ? estilo(vecina) : null,
                    nuestra: nuestra ? estilo(nuestra) : null,
                    desborda: document.documentElement.scrollWidth > window.innerWidth,
                    ancho: card.width,
                };
            });
            assert.ok(m.vecina && m.nuestra, "no se encontraron las dos cabeceras");
            assert.deepEqual(m.nuestra, m.vecina);
            assert.equal(m.nuestra.transform, "uppercase");
            assert.equal(m.desborda, false, "la página se desplaza a lo ancho");
            assert.ok(m.ancho > 0 && m.ancho <= ancho, `la tarjeta mide ${m.ancho}`);
        } finally {
            await cerrar();
        }
    });
}
