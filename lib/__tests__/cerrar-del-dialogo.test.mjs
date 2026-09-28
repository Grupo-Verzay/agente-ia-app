/**
 * La X de cerrar de TODOS los diálogos queda DENTRO del marco, a la misma
 * distancia del borde por arriba y por la derecha, tenga el diálogo el
 * relleno que tenga — y no se mueve al desplazar.
 *
 * La regla sin navegador (`lib/cerrar-del-dialogo.ts`) y los diálogos REALES
 * pintados en Chromium sobre el CSS de la App, a 1440/1280/1024/390.
 *
 * `MODO=roto` pinta el mismo arnés con el `dialog.tsx` y el visor de
 * `ANTES_REF` y afirma el fallo: en el visor de documentos de Chats la X queda
 * 8px por FUERA del borde, y en un diálogo `p-0 gap-0` el cuerpo sube 16px
 * y queda tapado por la cabecera. Se levanta con `scripts/banco-cerrar-del-dialogo.sh`.
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
const HARNESS = join(AQUI, ".compilado", "cerrar-del-dialogo.js");
const CSS = process.env.CSS_DEL_BANCO ? fs.readFileSync(process.env.CSS_DEL_BANCO, "utf8") : null;

// ── La regla, sin navegador ────────────────────────────────────────────────
const regla = await import(join(AQUI, ".compilado", "cerrar-del-dialogo.js.regla.mjs")).catch(() => null);

test("la regla: la X queda a la misma distancia del borde con cualquier relleno", { skip: !regla }, () => {
    const { desplazamientoDeLaX, DISTANCIA_DE_LA_X, comoPixeles } = regla;
    for (const relleno of [0, 8, 16, 24, 32]) {
        assert.equal(relleno + desplazamientoDeLaX(relleno), DISTANCIA_DE_LA_X);
    }
    assert.equal(desplazamientoDeLaX(24), -8, "p-6 queda donde estaba");
    assert.equal(desplazamientoDeLaX(Number.NaN), DISTANCIA_DE_LA_X);
    assert.equal(comoPixeles("24px"), 24);
    assert.equal(comoPixeles("normal"), 0);
    assert.equal(comoPixeles(undefined), 0);
});

// ── En Chromium ────────────────────────────────────────────────────────────
const ANCHURAS = [
    { ventana: 1440, movil: false },
    { ventana: 1280, movil: false },
    { ventana: 1024, movil: false },
    { ventana: 390, movil: true },
];

function levantar() {
    const bundle = fs.readFileSync(HARNESS);
    const server = http.createServer((req, res) => {
        const u = (req.url ?? "/").split("?")[0];
        if (u === "/") {
            res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
            res.end(
                `<!doctype html><html><head><meta charset="utf-8">` +
                    `<meta name="viewport" content="width=device-width, initial-scale=1">` +
                    `<style>${CSS ?? ""}</style>` +
                    `<style>*,*::before,*::after{animation:none !important;transition:none !important}</style>` +
                    `<script>window.process={env:{}}</script>` +
                    `</head><body><div id="app"></div><script type="module" src="/h.js"></script></body></html>`,
            );
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

let server = null;
let navegador = null;
async function abrir({ ventana, movil }, caso) {
    if (!server) server = await levantar();
    if (!navegador) navegador = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined });
    const contexto = await navegador.newContext({
        viewport: { width: ventana, height: movil ? 844 : 900 },
        hasTouch: movil,
        isMobile: movil,
    });
    const page = await contexto.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/?caso=${caso}`, { waitUntil: "load" });
    await page.waitForFunction("window.listo === true", { timeout: 20000 });
    await page.waitForSelector('[role="dialog"]', { timeout: 10000 });
    await page.waitForTimeout(150);
    return { page, cerrar: () => contexto.close() };
}

/** Las medidas de la X contra el borde de su diálogo (dentro del marco). */
const medir = (page) =>
    page.evaluate(() => {
        const d = document.querySelector('[role="dialog"]');
        const x = d.querySelector("[data-cerrar] button");
        const rd = d.getBoundingClientRect();
        const rx = x.getBoundingClientRect();
        const cs = getComputedStyle(d);
        const bt = parseFloat(cs.borderTopWidth) || 0;
        const br = parseFloat(cs.borderRightWidth) || 0;
        const cx = rx.left + rx.width / 2;
        const cy = rx.top + rx.height / 2;
        const quien = document.elementFromPoint(cx, cy);
        return {
            arriba: rx.top - (rd.top + bt),
            derecha: rd.right - br - rx.right,
            ancho: rx.width,
            alto: rx.height,
            dentro: rx.top >= rd.top && rx.right <= rd.right && rx.left >= rd.left && rx.bottom <= rd.bottom,
            seVe: !!quien && x.contains(quien),
            cy,
            rx: { left: rx.left, right: rx.right },
        };
    });

const sin = !chromium || !CSS ? "sin playwright o sin CSS del build" : false;
const cerca = (a, b, t = 0.6) => Math.abs(a - b) <= t;

// Un banco que no arranca se parece muchísimo a uno que pasa: sin navegador o
// sin CSS, esto se cae con estruendo en vez de dar 24 pruebas saltadas.
test("el banco de navegador se ejerce", () => {
    assert.ok(chromium, "no se encontró playwright (NODE_PATH)");
    assert.ok(CSS, "falta CSS_DEL_BANCO");
});

test.after(async () => {
    await navegador?.close();
    server?.close();
});

for (const a of ANCHURAS) {
    for (const caso of ["visor-pdf", "visor-doc"]) {
        test(`${a.ventana} · ${caso}: la X queda dentro, centrada en la barra y simétrica con Descargar`, { skip: sin }, async () => {
            const n = await abrir(a, caso);
            try {
                const m = await medir(n.page);
                if (ROTO) {
                    assert.ok(!m.dentro, `antes la X tenía que salirse: ${JSON.stringify(m)}`);
                    assert.ok(m.derecha < 0 && m.arriba < 0, `antes quedaba medio afuera: ${JSON.stringify(m)}`);
                    return;
                }
                assert.ok(m.dentro && m.seVe, `la X no está dentro o está tapada: ${JSON.stringify(m)}`);
                assert.ok(cerca(m.derecha, 16), `a la derecha ${m.derecha}`);
                const bajar = await n.page.evaluate(() => {
                    const b = document.querySelector('[aria-label="Descargar archivo"]').getBoundingClientRect();
                    return { cy: b.top + b.height / 2, right: b.right };
                });
                assert.ok(cerca(m.cy, bajar.cy, 1), `la X no está centrada en la barra: ${m.cy} vs ${bajar.cy}`);
                assert.ok(cerca(m.rx.left - bajar.right, m.derecha, 1), `hueco Descargar→X ${m.rx.left - bajar.right} vs X→borde ${m.derecha}`);
            } finally {
                await n.cerrar();
            }
        });
    }

    for (const caso of ["normal", "px-0", "sin-relleno"]) {
        test(`${a.ventana} · ${caso}: la X a 16px del borde por arriba y por la derecha`, { skip: sin }, async () => {
            const n = await abrir(a, caso);
            try {
                const m = await medir(n.page);
                const cab = await n.page.evaluate(() => {
                    const d = document.querySelector('[role="dialog"]');
                    const c = d.querySelector("[data-cabecera]").getBoundingClientRect();
                    const rd = d.getBoundingClientRect();
                    const cs = getComputedStyle(d);
                    const cuerpo = d.querySelector("[data-cuerpo]");
                    return {
                        arriba: c.top - rd.top - (parseFloat(cs.borderTopWidth) || 0) - (parseFloat(cs.paddingTop) || 0),
                        // Lo que el cuerpo se mete por DEBAJO de la cabecera (0 = pegado, sin taparse).
                        solape: cuerpo ? c.bottom - cuerpo.getBoundingClientRect().top : 0,
                    };
                });
                if (ROTO && caso === "sin-relleno") {
                    assert.ok(!m.dentro, `antes la X tenía que salirse: ${JSON.stringify(m)}`);
                    assert.ok(cab.solape >= 8, `antes el cuerpo subía 16px y quedaba tapado por la cabecera: ${JSON.stringify(cab)}`);
                    return;
                }
                if (ROTO && caso === "px-0") {
                    assert.ok(m.derecha < 0, `antes la X se salía por la derecha: ${JSON.stringify(m)}`);
                    return;
                }
                assert.ok(m.dentro && m.seVe, `la X no está dentro: ${JSON.stringify(m)}`);
                assert.ok(cerca(m.arriba, 16) && cerca(m.derecha, 16), `no es simétrica: ${JSON.stringify(m)}`);
                assert.ok(cerca(cab.arriba, 0), `la cabecera no arranca en su relleno: ${JSON.stringify(cab)}`);
                assert.ok(cerca(cab.solape, 0), `el cuerpo queda tapado por la cabecera: ${JSON.stringify(cab)}`);
            } finally {
                await n.cerrar();
            }
        });
    }

    test(`${a.ventana} · largo: al desplazar, la X no se mueve y sigue a la vista`, { skip: sin }, async () => {
        const n = await abrir(a, "largo");
        try {
            const antes = await medir(n.page);
            const desplazado = await n.page.evaluate(() => {
                const d = document.querySelector('[role="dialog"]');
                d.scrollTop = d.scrollHeight;
                return d.scrollTop;
            });
            assert.ok(desplazado > 100, "el diálogo largo no desplaza");
            await n.page.waitForTimeout(50);
            const despues = await medir(n.page);
            assert.ok(despues.dentro && despues.seVe, `al desplazar la X se pierde: ${JSON.stringify(despues)}`);
            assert.ok(cerca(antes.arriba, despues.arriba) && cerca(antes.derecha, despues.derecha), `la X se movió: ${antes.arriba}→${despues.arriba}`);
            if (!ROTO) assert.ok(cerca(despues.arriba, 16) && cerca(despues.derecha, 16), JSON.stringify(despues));
        } finally {
            await n.cerrar();
        }
    });
}
