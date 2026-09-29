/**
 * «Configurar campos de la ficha», el diálogo REAL en Chromium sobre el CSS de
 * la App (Tailwind compilado del repo), a 1440, 1024 y 390:
 *   - arriba, Nombre y Teléfono, FIJOS: sin arrastre, sin interruptor, sin
 *     papelera, con candado; y sus etiquetas en la MISMA columna que las demás;
 *   - una cuenta sin campos ve solo esos dos y, debajo, «Agregar campo»;
 *   - un campo que era de fábrica (Empresa) se borra como uno propio;
 *   - guardar la lista vacía guarda vacío.
 *
 * `MODO=roto` monta el diálogo de `ANTES_REF` y AFIRMA el fallo: no había
 * filas fijas, la papelera de Empresa estaba apagada y no dejaba guardar vacío.
 */
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const ROTO = process.env.MODO === "roto";
const AQUI = dirname(fileURLToPath(import.meta.url));
const DIR = join(AQUI, ".compilado", "campos-de-la-ficha");
const HARNESS = join(DIR, ROTO ? "harness-antes.js" : "harness.js");
const CSS = join(DIR, "app.css");

function levantar() {
    const bundle = fs.readFileSync(HARNESS);
    const css = fs.readFileSync(CSS);
    const server = http.createServer((req, res) => {
        const u = (req.url ?? "/").split("?")[0];
        if (u === "/") {
            res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
            res.end(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
                `<link rel="stylesheet" href="/app.css"><script>window.process={env:{}}</script></head>` +
                `<body><div id="app"></div><script type="module" src="/h.js"></script></body></html>`);
            return;
        }
        if (u === "/h.js") { res.writeHead(200, { "Content-Type": "application/javascript" }); res.end(bundle); return; }
        if (u === "/app.css") { res.writeHead(200, { "Content-Type": "text/css" }); res.end(css); return; }
        res.writeHead(404); res.end();
    });
    return new Promise((r) => server.listen(0, () => r(server)));
}

const F = (key, label, extra = {}) => ({ key, label, section: "Datos de negocio", icon: "Building2", enabled: true, order: 0, ...extra });
// Lo que lee una cuenta migrada: Empresa era de fábrica.
const MIGRADA = [F("empresa", "Empresa", { custom: true }), F("mio", "Mi campo", { custom: true, order: 1 })];
// En el «antes», Empresa llegaba como de fábrica (custom false).
const DE_ANTES = [F("empresa", "Empresa", { custom: false }), F("mio", "Mi campo", { custom: true, order: 1 })];

let server, browser;
const errores = [];
test.before(async () => {
    server = await levantar();
    browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined });
});
test.after(async () => { await browser?.close(); server?.close(); });

async function abrir(ancho, campos) {
    const page = await browser.newPage({ viewport: { width: ancho, height: 900 } });
    page.on("pageerror", (e) => errores.push(String(e)));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForFunction(() => window.listo === true, null, { timeout: 20000 }).catch(() => {
        throw new Error("la maqueta no cargó: " + errores.join(" | "));
    });
    await page.evaluate((c) => window.pintar(c), campos);
    await page.waitForSelector('[role="dialog"]');
    return page;
}

/** Cada fila del diálogo, en orden: su etiqueta, su x, y qué mandos lleva. */
const lasFilas = (page) => page.evaluate(() => {
    const dlg = document.querySelector('[role="dialog"]');
    return [...dlg.querySelectorAll("input:not([list])")].filter((i) => i.placeholder !== "Sección").map((i) => {
        const fila = i.parentElement;
        const papelera = fila.querySelector('button[title="Eliminar campo"], button[title^="Los campos base"]');
        return {
            label: i.value,
            x: Math.round(i.getBoundingClientRect().left),
            fija: fila.hasAttribute("data-campo-fijo"),
            interruptor: !!fila.querySelector('[role="switch"]'),
            arrastre: !!fila.querySelector('button[title="Arrastrar"]'),
            candado: !!fila.querySelector("svg[class*=lucide-lock]"),
            papelera: papelera ? !papelera.disabled : null,
        };
    });
});

for (const ancho of [1440, 1024, 390]) {
    test(`${ancho}: Nombre y Teléfono fijos arriba, alineados, y debajo solo «Agregar campo»`, { skip: ROTO }, async () => {
        const page = await abrir(ancho, []);
        const filas = await lasFilas(page);
        assert.deepEqual(filas.map((f) => f.label), ["Nombre", "Teléfono"]);
        for (const f of filas) {
            assert.equal(f.fija, true);
            assert.equal(f.interruptor, false, `${f.label} no se oculta`);
            assert.equal(f.arrastre, false, `${f.label} no se mueve`);
            assert.equal(f.papelera, null, `${f.label} no se borra`);
            assert.equal(f.candado, true, `${f.label} lleva candado`);
        }
        // Debajo de los dos fijos, lo siguiente que hay es el botón de agregar.
        const siguiente = await page.evaluate(() => {
            const dlg = document.querySelector('[role="dialog"]');
            const fijas = [...dlg.querySelectorAll("[data-campo-fijo]")];
            const abajo = fijas.at(-1).getBoundingClientRect().bottom;
            const cosas = [...dlg.querySelectorAll("button, input")]
                .filter((e) => e.getBoundingClientRect().top >= abajo && e.offsetParent)
                .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
            return cosas[0]?.textContent?.trim();
        });
        assert.equal(siguiente, "Agregar campo");
        const desborda = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
        assert.equal(desborda, false, "no desborda a lo ancho");
        await page.close();
    });

    test(`${ancho}: las etiquetas fijas y las editables caen en la misma columna`, { skip: ROTO }, async () => {
        const page = await abrir(ancho, MIGRADA);
        const filas = await lasFilas(page);
        assert.deepEqual(filas.map((f) => f.label), ["Nombre", "Teléfono", "Empresa", "Mi campo"]);
        const xs = new Set(filas.map((f) => f.x));
        assert.equal(xs.size, 1, `columnas distintas: ${JSON.stringify(filas.map((f) => [f.label, f.x]))}`);
        await page.close();
    });
}

test("un campo que era de fábrica se borra, y guardar deja la lista sin él", { skip: ROTO }, async () => {
    const page = await abrir(1280, MIGRADA);
    const empresa = (await lasFilas(page)).find((f) => f.label === "Empresa");
    assert.equal(empresa.papelera, true, "la papelera de Empresa se puede pulsar");
    await page.locator('[role="dialog"] input[value="Empresa"]').locator("xpath=ancestor::div[contains(@class,'rounded-md')][1]")
        .locator('button[title="Eliminar campo"]').click();
    await page.getByRole("button", { name: "Guardar" }).click();
    await page.waitForFunction(() => window.guardado !== null);
    const guardado = await page.evaluate(() => window.guardado);
    assert.deepEqual(guardado.map((f) => f.key), ["mio"]);
    await page.close();
});

test("guardar con la lista vacía guarda vacío (antes no dejaba)", { skip: ROTO }, async () => {
    const page = await abrir(1280, []);
    await page.getByRole("button", { name: "Guardar" }).click();
    await page.waitForFunction(() => window.guardado !== null, null, { timeout: 5000 });
    assert.deepEqual(await page.evaluate(() => window.guardado), []);
    await page.close();
});

// ── El «antes», pinchado ──
test("ANTES: no había filas fijas, y la papelera de Empresa estaba apagada", { skip: !ROTO }, async () => {
    const page = await abrir(1280, DE_ANTES);
    const filas = await lasFilas(page);
    assert.equal(filas.some((f) => f.fija), false, "ninguna fila fija");
    assert.ok(!filas.some((f) => f.label === "Nombre"), "Nombre no salía en el diálogo");
    assert.equal(filas.find((f) => f.label === "Empresa").papelera, false, "Empresa no se podía borrar");
    await page.close();
});

test("ANTES: con la lista vacía no dejaba guardar", { skip: !ROTO }, async () => {
    const page = await abrir(1280, []);
    await page.getByRole("button", { name: "Guardar" }).click();
    await page.waitForTimeout(800);
    assert.equal(await page.evaluate(() => window.guardado), null);
    await page.close();
});
