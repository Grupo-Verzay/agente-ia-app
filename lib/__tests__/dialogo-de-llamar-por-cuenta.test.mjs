/**
 * El diálogo de Llamar de CRM › Llamadas, en Chromium y con el componente REAL:
 * Radix monta el diálogo y el popover del «Vía:» en portales y solo al abrirlos,
 * así que sin navegador los `onClick` no se ejecutan nunca.
 *
 * `MODO=roto` monta el `DialogoDeLlamar` de ANTES (pinchado a un commit) y
 * afirma el fallo: no hay «Vía:», y los dos botones llaman SIN cuenta — o sea,
 * siempre con la de quien mira.
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
} catch {}

const ROTO = process.env.MODO === "roto";
const AQUI = dirname(fileURLToPath(import.meta.url));
const HARNESS = join(AQUI, ".compilado", "harness-dialogo-de-llamar.js");

const OPCIONES = [
    { id: "madre", nombre: "Grupo Verzay", esLaPropia: true, instanceName: null, motivo: null },
    { id: "pruebas", nombre: "Verzay Pruebas", esLaPropia: false, instanceName: "PRUEBAS", motivo: "Sin número de llamadas vinculado" },
    { id: "ventas", nombre: "Verzay Ventas", esLaPropia: false, instanceName: "VENTAS", motivo: null },
];

async function abrir() {
    const bundle = fs.readFileSync(HARNESS);
    const server = http.createServer((req, res) => {
        const u = (req.url ?? "/").split("?")[0];
        if (u === "/") {
            res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
            res.end(`<!doctype html><html><head><meta charset="utf-8"></head><body><div id="raiz"></div><script type="module" src="/h.js"></script></body></html>`);
        } else if (u === "/h.js") {
            res.writeHead(200, { "Content-Type": "application/javascript" });
            res.end(bundle);
        } else {
            res.writeHead(404);
            res.end();
        }
    });
    await new Promise((r) => server.listen(0, r));
    const navegador = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined });
    const page = await (await navegador.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
    const errores = [];
    page.on("pageerror", (e) => errores.push(String(e)));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.evaluate((o) => { window.__opcionesDeLlamada = o; }, OPCIONES);
    await page.waitForFunction("window.listo === true", { timeout: 20000 });
    await page.evaluate(() => window.pintar());
    await page.click('[data-boton="abrir-llamar"]');
    await page.waitForSelector('[data-dialogo="llamar"]');
    await page.fill('input[aria-label="Número al que llamar"]', "573001112233");
    return { page, errores, cerrar: async () => { await navegador.close(); server.close(); } };
}

const llamadas = (page) => page.evaluate(() => window.__llamadas ?? []);

test("el diálogo ofrece las cuentas y viene elegida la propia", { skip: !chromium && "sin playwright" }, async () => {
    const { page, errores, cerrar } = await abrir();
    try {
        if (ROTO) {
            assert.equal(await page.$('[data-selector="via"]'), null, "el modo roto no tiene selector de cuenta");
            return;
        }
        await page.waitForSelector('[data-selector="via"]');
        assert.match(await page.textContent('[data-selector="via"]'), /Vía:\s*Grupo Verzay/);
        await page.click('[data-boton="via"]');
        const ofrecidas = await page.$$eval("[data-opcion-via]", (els) => els.map((e) => [e.getAttribute("data-opcion-via"), e.disabled]));
        assert.deepEqual(ofrecidas, [["madre", false], ["pruebas", true], ["ventas", false]]);
        assert.deepEqual(errores, []);
    } finally {
        await cerrar();
    }
});

test("con la propia, los dos botones llaman sin línea (como antes)", { skip: !chromium && "sin playwright" }, async () => {
    const { page, cerrar } = await abrir();
    try {
        await page.click('[data-boton="llamar-ia"]');
        await page.click('[data-boton="abrir-llamar"]');
        await page.fill('input[aria-label="Número al que llamar"]', "573001112233");
        await page.click('[data-boton="llamar"]');
        const l = await llamadas(page);
        assert.equal(l.length, 2);
        for (const x of l) assert.ok(x.linea === null || x.linea === undefined, `se llamó con ${x.linea}`);
    } finally {
        await cerrar();
    }
});

test("elegida Ventas, Llamar IA y Llamar salen por la línea de Ventas", { skip: !chromium && "sin playwright" }, async () => {
    const { page, cerrar } = await abrir();
    try {
        if (ROTO) {
            await page.click('[data-boton="llamar-ia"]');
            const l = await llamadas(page);
            assert.equal(l.at(-1).linea, undefined, "el modo roto tiene que llamar sin cuenta — siempre la de quien mira");
            return;
        }
        await page.click('[data-boton="via"]');
        await page.click('[data-opcion-via="ventas"]');
        assert.match(await page.textContent('[data-selector="via"]'), /Verzay Ventas/);
        await page.click('[data-boton="llamar-ia"]');
        // Al reabrir vuelve a venir la propia; se elige Ventas otra vez.
        await page.click('[data-boton="abrir-llamar"]');
        await page.waitForFunction(() => document.querySelector('[data-selector="via"]')?.textContent?.includes("Grupo Verzay"));
        await page.fill('input[aria-label="Número al que llamar"]', "573001112233");
        await page.click('[data-boton="via"]');
        await page.click('[data-opcion-via="ventas"]');
        await page.click('[data-boton="llamar"]');
        assert.deepEqual(await llamadas(page), [
            { cual: "ia", linea: "VENTAS" },
            { cual: "llamar", linea: "VENTAS" },
        ]);
    } finally {
        await cerrar();
    }
});

test("una cuenta sin número no se puede elegir y no llama", { skip: (!chromium && "sin playwright") || (ROTO && "no existe en el roto") }, async () => {
    const { page, cerrar } = await abrir();
    try {
        await page.click('[data-boton="via"]');
        await page.click('[data-opcion-via="pruebas"]', { force: true }).catch(() => {});
        assert.match(await page.textContent('[data-selector="via"]'), /Grupo Verzay/, "se eligió una cuenta sin número");
    } finally {
        await cerrar();
    }
});
