/**
 * Reuniones › Grabaciones: la pestaña propia, la miniatura y ampliar.
 *
 *   1. La decisión, pura: lista plana con el título de su reunión, la más
 *      reciente arriba, y el filtro de alcance fila a fila.
 *   2. La pantalla PINTADA en Chromium, sobre el CSS del build y con el
 *      `ReunionesClient` de verdad (solo sus acciones son de mentira):
 *      - ninguna fila de reunión lleva un video ni un audio dentro;
 *      - la pestaña «Grabaciones» sale junto a Abiertas y Pasadas, con su
 *        contador, y la lista de reuniones no se desplaza por culpa de nada;
 *      - cada grabación es una miniatura PEQUEÑA dentro de su fila, con la hora,
 *        el peso, quién la grabó, Descargar y Transcribir con sus créditos;
 *      - ampliar abre el video grande, y al cerrar vuelve a su miniatura.
 *
 * `MODO=roto` pinta el `ReunionesClient` de `ANTES_REF` y AFIRMA el fallo: el
 * video dentro de la fila de la reunión, a un tamaño que empuja la lista, y
 * ninguna pestaña de grabaciones. Se levanta con
 * `scripts/banco-grabaciones-de-reuniones.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

import {
    lasGrabacionesEnLista,
    lasQueAlcanza,
} from "./.compilado/grabaciones-de-reuniones/entrada-de-grabaciones-de-reuniones.js";

const require = createRequire(import.meta.url);
let chromium = null;
try {
    ({ chromium } = require("playwright"));
} catch {}

const ROTO = process.env.MODO === "roto";
const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..", "..");
const PANTALLA = join(AQUI, ".compilado", "grabaciones-de-reuniones", "pantalla.js");
const DIR_CSS = join(RAIZ, ".next", "static", "css");
const CSS = fs.existsSync(DIR_CSS)
    ? fs.readdirSync(DIR_CSS).filter((f) => f.endsWith(".css")).map((f) => fs.readFileSync(join(DIR_CSS, f), "utf8")).join("\n")
    : null;

// ── 1. La decisión ─────────────────────────────────────────────────────────

test("la lista es plana, con el título de su reunión, y la más reciente arriba", () => {
    const g = (id, creadaEn) => ({ id, creadaEn });
    const lista = lasGrabacionesEnLista(
        {
            a: [g("a1", "2026-09-01T10:00:00Z"), g("a2", "2026-09-20T10:00:00Z")],
            b: [g("b1", "2026-09-10T10:00:00Z")],
            huerfana: [g("h1", "2026-09-15T10:00:00Z")],
        },
        [
            { id: "a", titulo: "Demo", cuentaNombre: "Ventas" },
            { id: "b", titulo: "  ", cuentaNombre: null },
        ],
    );
    assert.deepEqual(lista.map((x) => x.id), ["a2", "h1", "b1", "a1"]);
    assert.equal(lista[0].reunionTitulo, "Demo");
    assert.equal(lista[0].cuentaNombre, "Ventas");
    assert.equal(lista[0].salaId, "a");
    // Un título vacío o una reunión que no está en la pantalla no tiran la
    // grabación: sale con el título genérico.
    assert.equal(lista.find((x) => x.id === "b1").reunionTitulo, "Reunión");
    assert.equal(lista.find((x) => x.id === "h1").reunionTitulo, "Reunión");
});

test("el alcance se mira fila a fila, contra la cuenta de la GRABACIÓN", () => {
    const filas = [{ cuentaId: "madre" }, { cuentaId: "hija" }, { cuentaId: "hermana" }];
    assert.deepEqual(lasQueAlcanza(filas, ["madre", "hija"]).map((f) => f.cuentaId), ["madre", "hija"]);
    assert.deepEqual(lasQueAlcanza(filas, ["hija"]).map((f) => f.cuentaId), ["hija"]);
    assert.deepEqual(lasQueAlcanza(filas, []), []);
});

// ── 2. La pantalla ─────────────────────────────────────────────────────────

async function abrir(ancho, alto = 900) {
    const bundle = fs.readFileSync(PANTALLA);
    const server = http.createServer((req, res) => {
        const u = (req.url ?? "/").split("?")[0];
        if (u === "/") {
            res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
            res.end(
                `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">` +
                    `<style>${CSS ?? ""} *{animation:none!important;transition:none!important}</style></head>` +
                    // El hueco de la pantalla: la ventana menos el menú lateral, y el
                    // alto fijo que le da el armazón (la lista se desplaza por dentro).
                    `<body style="margin:0"><div id="pantalla" style="width:${ancho >= 768 ? ancho - 256 : ancho}px;height:${alto - 60}px"></div>` +
                    `<script type="module" src="/h.js"></script></body></html>`,
            );
            return;
        }
        if (u === "/h.js") {
            res.writeHead(200, { "Content-Type": "application/javascript" });
            res.end(bundle);
            return;
        }
        res.writeHead(404);
        res.end();
    });
    await new Promise((r) => server.listen(0, r));
    const navegador = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined });
    const page = await (await navegador.newContext({ viewport: { width: ancho, height: alto } })).newPage();
    const errores = [];
    page.on("pageerror", (e) => errores.push(String(e)));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForFunction("window.listo === true", { timeout: 20000 });
    await page.evaluate(() => window.pintar());
    await page.waitForFunction(() => document.body.innerText.includes("Demo con el cliente"), { timeout: 20000 });
    // Las grabaciones llegan en un efecto, después del primer pintado.
    await page.waitForTimeout(300);
    assert.equal(errores.join(" | "), "", "la pantalla reventó");
    return { page, cerrar: async () => { await navegador.close(); server.close(); } };
}

const pestanas = (page) =>
    page.evaluate(() =>
        [...document.querySelectorAll("button[aria-pressed]")].map((b) => b.textContent.replace(/\s+/g, "")),
    );

for (const [ancho, alto] of [[1440, 900], [1280, 800], [1024, 768], [390, 844]]) {
    test(`a ${ancho}: las reuniones no llevan video y Grabaciones es su propia pestaña`, async (t) => {
        if (!chromium) return t.skip("sin playwright");
        if (!CSS) return t.skip("sin el CSS del build");
        const { page, cerrar } = await abrir(ancho, alto);
        try {
            const enAbiertas = await page.evaluate(() => {
                const lista = document.querySelector("#pantalla .overflow-y-auto");
                const medios = [...lista.querySelectorAll("video, audio")].map((v) => {
                    const r = v.getBoundingClientRect();
                    return { ancho: r.width, alto: r.height };
                });
                return {
                    medios,
                    reunionesVisibles: [...lista.querySelectorAll("p")]
                        .filter((p) => /Demo con el cliente|Seguimiento semanal/.test(p.innerText))
                        .map((p) => p.getBoundingClientRect())
                        .filter((r) => r.top >= 0 && r.bottom <= window.innerHeight).length,
                };
            });
            const tabs = await pestanas(page);

            if (ROTO) {
                assert.ok(enAbiertas.medios.length > 0, "el roto no reproduce: no había video en la fila de la reunión");
                const grande = Math.max(...enAbiertas.medios.filter((m) => m.alto > 0).map((m) => m.ancho));
                // Más grande que cualquier miniatura, y dentro de la fila de la reunión:
                // a 1440 mide lo que mide la fila entera.
                assert.ok(grande > 128, `el roto no reproduce: el video no era más grande que una miniatura (${grande}px)`);
                assert.ok(!tabs.some((x) => x.startsWith("Grabaciones")), "el roto no reproduce: ya había pestaña de grabaciones");
                return;
            }

            assert.deepEqual(enAbiertas.medios, [], "una reunión lleva un video o un audio dentro");
            assert.equal(enAbiertas.reunionesVisibles, 2, "las dos reuniones abiertas no se ven enteras");
            assert.deepEqual(tabs, ["Abiertas2", "Pasadas1", "Grabaciones3"]);

            // En «Pasadas» tampoco hay medios.
            await page.getByRole("button", { name: /^Pasadas/ }).click();
            const enPasadas = await page.evaluate(
                () => document.querySelectorAll("#pantalla .overflow-y-auto video, #pantalla .overflow-y-auto audio").length,
            );
            assert.equal(enPasadas, 0, "una reunión pasada lleva un medio dentro");

            // La pestaña de grabaciones: una fila por grabación, miniatura pequeña.
            await page.getByRole("button", { name: /^Grabaciones/ }).click();
            const filas = await page.evaluate(() =>
                [...document.querySelectorAll("[data-grabacion]")].map((fila) => {
                    const mini = fila.querySelector("[data-miniatura]").getBoundingClientRect();
                    const r = fila.getBoundingClientRect();
                    const texto = fila.innerText.replace(/\s+/g, " ");
                    return {
                        id: fila.getAttribute("data-grabacion"),
                        mini: { ancho: mini.width, alto: mini.height, dentro: mini.left >= r.left && mini.right <= r.right },
                        altoDeLaFila: r.height,
                        texto,
                        ampliar: !!fila.querySelector('[aria-label="Ampliar la grabación"]'),
                        desborda: fila.scrollWidth > fila.clientWidth + 1,
                    };
                }),
            );
            assert.deepEqual(filas.map((f) => f.id), ["g2", "g1", "g3"], "la más reciente arriba");
            for (const f of filas) {
                assert.ok(f.mini.ancho > 0 && f.mini.ancho <= 128, `${f.id}: miniatura de ${f.mini.ancho}px de ancho`);
                assert.ok(f.mini.alto > 0 && f.mini.alto <= 72, `${f.id}: miniatura de ${f.mini.alto}px de alto`);
                assert.ok(f.mini.dentro, `${f.id}: la miniatura se sale de su fila`);
                assert.ok(f.altoDeLaFila <= 140, `${f.id}: la fila mide ${f.altoDeLaFila}px`);
                assert.ok(f.ampliar, `${f.id}: sin botón de ampliar`);
                assert.match(f.texto, /23,8 MB/, `${f.id}: sin el peso`);
                assert.match(f.texto, /la grabó Yair/, `${f.id}: sin quién la grabó`);
                assert.match(f.texto, /\d{2}:\d{2}/, `${f.id}: sin la hora`);
                assert.match(f.texto, /Descargar/, `${f.id}: sin Descargar`);
                assert.match(f.texto, /Transcribir \(62 créditos\)/, `${f.id}: sin Transcribir con sus créditos`);
                assert.equal(f.desborda, false, `${f.id}: la fila desborda`);
            }
            assert.match(filas[0].texto, /Demo con el cliente/);
            assert.match(filas[2].texto, /Reunión de cierre/);

            // Ampliar: el video se abre grande; al cerrar, vuelve la miniatura.
            await page.locator('[data-grabacion="g2"] [aria-label="Ampliar la grabación"]').click();
            await page.waitForSelector("[data-grabacion-ampliada] video", { timeout: 5000 });
            const grande = await page.evaluate(() => {
                const v = document.querySelector("[data-grabacion-ampliada] video");
                const r = v.getBoundingClientRect();
                return { ancho: r.width, src: v.getAttribute("src") };
            });
            assert.equal(grande.src, "/g/g2-v.webm", "se amplió otra grabación");
            assert.ok(grande.ancho > (ancho >= 768 ? 400 : 300), `el video ampliado mide ${grande.ancho}px`);

            await page.keyboard.press("Escape");
            await page.waitForSelector("[data-grabacion-ampliada]", { state: "detached", timeout: 5000 });
            const despues = await page.evaluate(() => {
                const mini = document.querySelector('[data-grabacion="g2"] [data-miniatura]').getBoundingClientRect();
                return { ancho: mini.width, videosSueltos: document.querySelectorAll("body > [role=dialog] video").length };
            });
            assert.ok(despues.ancho <= 128, "al cerrar no volvió a la miniatura");
            assert.equal(despues.videosSueltos, 0, "el video grande sigue montado al cerrar");

            const desbordaLaPagina = await page.evaluate(
                () => document.documentElement.scrollWidth > window.innerWidth + 1,
            );
            assert.equal(desbordaLaPagina, false, "la página desborda a lo ancho");
        } finally {
            await cerrar();
        }
    });
}
