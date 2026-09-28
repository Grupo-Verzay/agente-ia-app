/**
 * «Reagendar» en Chromium, con los componentes REALES: la ficha de la cita de
 * la cabecera del chat (`ChatAppointmentStatusButton`) y el diálogo que abre.
 *
 * Lo que no se contesta leyendo el código: que en el desplegable de estado sale
 * «Reagendar» (Radix lo monta en un portal y solo al abrirlo), que elegirlo NO
 * guarda un estado sino que abre el selector de fecha y hora, que los huecos se
 * piden a la agenda de la cuenta DUEÑA con la duración de la cita, y que al
 * confirmar se manda el hueco elegido. Solo se fingen las acciones de servidor.
 *
 * Se levanta con `scripts/banco-reagendar-cita.sh` (después de `npm run build`).
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
    /* sin navegador se dice y se salta */
}

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..", "..");
const HARNESS = join(AQUI, ".compilado", "reagendar", "harness-reagendar.js");
const DIR_CSS = join(RAIZ, ".next", "static", "css");
const CSS = fs.existsSync(DIR_CSS)
    ? fs.readdirSync(DIR_CSS).filter((f) => f.endsWith(".css")).map((f) => fs.readFileSync(join(DIR_CSS, f), "utf8")).join("\n")
    : null;

function levantar() {
    const bundle = fs.readFileSync(HARNESS);
    const server = http.createServer((req, res) => {
        const u = (req.url ?? "/").split("?")[0];
        if (u === "/") {
            res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
            res.end(`<!doctype html><html><head><meta charset="utf-8"><style>${CSS ?? ""}</style><script>window.process={env:{}}</script></head><body style="margin:0"><div id="raiz" style="padding:40px 400px"></div><script type="module" src="/h.js"></script></body></html>`);
            return;
        }
        if (u === "/h.js") {
            res.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8" });
            res.end(bundle);
            return;
        }
        res.writeHead(404);
        res.end();
    });
    return new Promise((r) => server.listen(0, () => r(server)));
}

test("en la cabecera del chat: Reagendar abre el selector, pide los huecos de la cuenta dueña y guarda el elegido", async (t) => {
    if (!chromium || !CSS) return t.skip("sin playwright o sin el CSS del build");
    const server = await levantar();
    const navegador = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined });
    try {
        const page = await (await navegador.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
        const errores = [];
        page.on("pageerror", (e) => errores.push(String(e)));
        await page.goto(`http://127.0.0.1:${server.address().port}/`);
        await page.waitForFunction("window.listo === true", { timeout: 20000 });

        await page.click('button[title="Estado de cita"]');
        await page.click('button[role="combobox"]');
        await page.waitForSelector("[data-opcion-reagendar]", { timeout: 5000 });
        await page.click("[data-opcion-reagendar]");

        await page.waitForSelector("[data-dialogo-reagendar]", { timeout: 5000 });
        const estados = await page.evaluate(() => window.__estados ?? []);
        assert.deepEqual(estados, [], "elegir Reagendar no guarda ningún estado");

        const dia = "2026-10-12";
        await page.fill("[data-selector-fecha]", dia);
        await page.waitForSelector("[data-hueco]", { timeout: 5000 });
        const pedidos = await page.evaluate(() => window.__huecosPedidos);
        assert.deepEqual(pedidos.at(-1), { userId: "cuenta-duena", ymd: dia, duracion: 90, zona: "America/Bogota" });

        const confirmar = page.locator("[data-confirmar-reagendar]");
        assert.equal(await confirmar.isDisabled(), true, "sin hueco elegido no se puede confirmar");
        const huecos = await page.$$eval("[data-hueco]", (b) => b.map((x) => x.getAttribute("data-hueco")));
        await page.click(`[data-hueco="${huecos[1]}"]`);
        await confirmar.click();
        await page.waitForFunction("(window.__reagendadas ?? []).length === 1", { timeout: 5000 });
        const r = await page.evaluate(() => window.__reagendadas[0]);
        assert.equal(r.id, "cita-1");
        assert.equal(r.startTime, huecos[1]);
        assert.equal(new Date(r.endTime).getTime() - new Date(r.startTime).getTime(), 90 * 60_000, "conserva la duración");
        await page.waitForSelector("[data-dialogo-reagendar]", { state: "detached", timeout: 5000 });

        assert.deepEqual(errores, []);
    } finally {
        await navegador.close();
        server.close();
    }
});
