/**
 * Los botones del grabador de audio, simétricos a lo ancho de su caja en las
 * tres etapas. Se levanta con `scripts/banco-grabador-simetrico.sh`.
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
const C = join(AQUI, ".compilado");
const ANCHOS = [274, 360, 520];
const ETAPAS = {
    inactivo: ["grabar"],
    grabando: ["pausar", "detener", "descartar"],
    pausado: ["reanudar", "detener", "descartar"],
    lista: ["usar", "grabar-otra", "descartar"],
};

function levantar() {
    const bundle = fs.readFileSync(join(C, "grabador-simetrico.arnes.js"));
    const css = fs.readFileSync(join(C, "grabador-simetrico.css"), "utf8");
    const server = http.createServer((req, res) => {
        const u = (req.url ?? "/").split("?")[0];
        if (u === "/") {
            res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
            res.end(
                `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">` +
                    `<style>${css}</style><script>window.process={env:{}}</script></head>` +
                    `<body><div id="app"></div><script type="module" src="/h.js"></script></body></html>`,
            );
        } else if (u === "/h.js") {
            res.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8" });
            res.end(bundle);
        } else {
            res.writeHead(404);
            res.end();
        }
    });
    return new Promise((r) => server.listen(0, "127.0.0.1", () => r(server)));
}

/** Cómo quedan los botones dentro de su caja, medido en píxeles. */
const medir = (page) =>
    page.evaluate(() => {
        const caja = document.querySelector("[data-caja]").getBoundingClientRect();
        const botones = [...document.querySelectorAll("[data-mando]")].map((b) => {
            const r = b.getBoundingClientRect();
            const hijos = [...b.children].map((h) => h.getBoundingClientRect());
            return {
                mando: b.getAttribute("data-mando"),
                left: r.left,
                right: r.right,
                top: r.top,
                width: r.width,
                height: r.height,
                // Nada de dentro (icono, rótulo) se sale del botón.
                seSale: hijos.some((h) => h.left < r.left - 0.5 || h.right > r.right + 0.5) || b.scrollWidth > b.clientWidth + 1,
            };
        });
        return {
            caja: { left: caja.left, right: caja.right, width: caja.width },
            botones,
            desborda: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        };
    });

function comprobar(m, etapa, ancho) {
    const b = m.botones;
    const donde = `${etapa} a ${ancho}px`;
    assert.deepEqual(b.map((x) => x.mando), ETAPAS[etapa], `${donde}: el orden no cambia`);
    const izq = b[0].left - m.caja.left;
    const der = m.caja.right - b[b.length - 1].right;
    if (ROTO) return { izq, der };
    assert.ok(Math.abs(izq) <= 1, `${donde}: pegado al borde izquierdo (${izq.toFixed(1)})`);
    assert.ok(Math.abs(der) <= 1, `${donde}: sin hueco a la derecha (${der.toFixed(1)})`);
    for (const x of b) {
        assert.ok(Math.abs(x.top - b[0].top) <= 1, `${donde}: una sola fila`);
        assert.ok(Math.abs(x.width - b[0].width) <= 1, `${donde}: ${x.mando} mide lo mismo (${x.width} vs ${b[0].width})`);
        assert.ok(Math.abs(x.height - b[0].height) <= 1, `${donde}: mismo alto`);
        assert.ok(!x.seSale, `${donde}: ${x.mando} no se recorta`);
    }
    for (let i = 1; i < b.length - 1; i++) {
        const g1 = b[i].left - b[i - 1].right;
        const g2 = b[i + 1].left - b[i].right;
        assert.ok(Math.abs(g1 - g2) <= 1, `${donde}: huecos iguales (${g1} / ${g2})`);
    }
    assert.ok(!m.desborda, `${donde}: la página no desborda`);
    return { izq, der };
}

for (const ancho of ANCHOS) {
    test(`a ${ancho}px: las tres etapas ${ROTO ? "dejan hueco (antes)" : "llenan la caja, simétricas"}`, { timeout: 60000 }, async () => {
        const server = await levantar();
        const browser = await chromium.launch({
            executablePath: process.env.CHROME_BIN || undefined,
            args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
        });
        try {
            const ctx = await browser.newContext({ permissions: ["microphone"], viewport: { width: 1280, height: 800 } });
            const page = await ctx.newPage();
            const errores = [];
            page.on("pageerror", (e) => errores.push(String(e)));
            await page.goto(`http://127.0.0.1:${server.address().port}/?w=${ancho}`);
            await page.waitForFunction(() => window.listo === true);
            await page.waitForSelector("[data-mando]");

            const huecos = {};
            huecos.inactivo = comprobar(await medir(page), "inactivo", ancho);
            await page.click('[data-mando="grabar"]');
            await page.waitForSelector('[data-grabador="grabando"]');
            huecos.grabando = comprobar(await medir(page), "grabando", ancho);
            await page.click('[data-mando="pausar"]');
            await page.waitForSelector('[data-grabador="pausado"]');
            huecos.pausado = comprobar(await medir(page), "pausado", ancho);
            await page.click('[data-mando="detener"]');
            await page.waitForSelector('[data-grabador="lista"]');
            huecos.lista = comprobar(await medir(page), "lista", ancho);
            if (ROTO) {
                // Antes: pegados a la izquierda, con la derecha vacía.
                assert.ok(huecos.inactivo.der > 40, `antes: hueco a la derecha de «Grabar audio» (${huecos.inactivo.der})`);
                assert.ok(huecos.grabando.der > 10 || huecos.lista.der > 10, "antes: hueco a la derecha al grabar o al terminar");
            }
            assert.deepEqual(errores, []);
        } finally {
            await browser.close();
            server.close();
        }
    });
}

test("el CSS del build trae la consulta de contenedor", { skip: ROTO && "en el «antes» no existía" }, () => {
    const css = fs.readFileSync(join(C, "grabador-simetrico.css"), "utf8");
    assert.match(css, /container-type:\s*inline-size/);
    assert.match(css, /@container\s*\(max-width:\s*24rem\)/);
});
