/**
 * Leads y CRM › Llamadas, simétricas. Las dos tablas de VERDAD pintadas en la
 * misma página, sobre el CSS del build, y comparadas entre sí: nada de números
 * escritos a mano, lo que manda es cómo se ve Leads.
 *
 *   1. Nombre, Fecha y Detalle de Llamadas: el MISMO peso y el mismo color que
 *      el nombre de Leads. Sin negrilla añadida.
 *   2. Resultado: sin resultado —también en la llamada de una cuenta hija— sale
 *      el desplegable «Marcar resultado» con sus siete opciones; con resultado,
 *      su pastilla.
 *   3. Las flechas de Llamadas siguen donde estaban: todas menos Acciones.
 *   4. Leads lleva flecha en WhatsApp, Nombre y Etiquetas, con el mismo estilo
 *      que su «Sesión» de siempre, y ordenan (Etiquetas, por cantidad).
 *
 * `MODO=roto` pinta las dos tablas de `ANTES_REF` y AFIRMA los fallos.
 * Se levanta con `scripts/banco-leads-y-llamadas-simetricas.sh`.
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
const RAIZ = join(AQUI, "..", "..");
const HARNESS = join(AQUI, ".compilado", "harness-leads-y-llamadas.js");
const DIR_CSS = join(RAIZ, ".next", "static", "css");
const CSS = fs.existsSync(DIR_CSS)
    ? fs.readdirSync(DIR_CSS).filter((f) => f.endsWith(".css")).map((f) => fs.readFileSync(join(DIR_CSS, f), "utf8")).join("\n")
    : null;

const RESULTADOS = ["Interesado", "Agendó", "Volver a llamar", "No contesta", "Buzón de voz", "No interesado", "Número equivocado"];

async function abrir(ancho = 1440) {
    const bundle = fs.readFileSync(HARNESS);
    const server = http.createServer((req, res) => {
        const u = (req.url ?? "/").split("?")[0];
        if (u === "/") {
            res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
            res.end(
                `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">` +
                    `<style>${CSS ?? ""} *{animation:none!important;transition:none!important}</style></head>` +
                    `<body style="margin:0"><div class="app-module-content" style="width:${ancho - 280}px">` +
                    `<div id="leads"></div><div id="llamadas"></div></div>` +
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
    const page = await (await navegador.newContext({ viewport: { width: ancho, height: 1400 } })).newPage();
    const errores = [];
    page.on("pageerror", (e) => errores.push(String(e)));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForFunction("window.listo === true", null, { timeout: 20000 });
    await page.evaluate(() => {
        window.pintarLeads();
        window.pintarLlamadas();
    });
    await page.waitForFunction(
        () =>
            document.querySelectorAll("#leads tbody tr").length >= 3 &&
            document.querySelectorAll("#llamadas tbody tr").length >= 3,
        null,
        { timeout: 20000 },
    );
    assert.equal(errores.join(" | "), "", "la pantalla reventó");
    return { page, cerrar: async () => { await navegador.close(); server.close(); } };
}

/** Las cabeceras de una tabla: su texto y si llevan flecha de ordenar. */
function cabeceras(page, sel) {
    return page.evaluate((sel) =>
        [...document.querySelectorAll(`${sel} thead th`)].map((th) => {
            const btn = th.querySelector("button");
            const svg = btn?.querySelector("svg");
            const cs = btn ? getComputedStyle(btn) : getComputedStyle(th.firstElementChild ?? th);
            return {
                texto: th.innerText.trim(),
                flecha: !!svg,
                estilo: btn
                    ? {
                          fontSize: cs.fontSize,
                          fontWeight: cs.fontWeight,
                          color: cs.color,
                          flecha: svg ? `${svg.getBoundingClientRect().width}x${svg.getBoundingClientRect().height}` : null,
                      }
                    : null,
            };
        }), sel);
}

test("1. Nombre, Fecha y Detalle de Llamadas pesan y se pintan COMO el nombre de Leads", async (t) => {
    if (!chromium) return t.skip("sin playwright");
    if (!CSS) return t.skip("sin el CSS del build");
    const { page, cerrar } = await abrir();
    try {
        const m = await page.evaluate(() => {
            const nombreLeads = document.querySelector("#leads tbody tr td:nth-child(2) span.truncate");
            const ref = getComputedStyle(nombreLeads);
            const tabla = document.querySelector("#llamadas table");
            const heads = [...tabla.querySelectorAll("thead th")].map((th) => th.innerText.trim());
            const fila = tabla.querySelector("tbody tr");
            const celda = (n) => fila.children[heads.indexOf(n)];
            const texto = (td) => {
                // El nodo que lleva el texto: la hoja más honda con contenido.
                const hojas = [...td.querySelectorAll("*")].filter((e) => e.children.length === 0 && e.textContent.trim());
                return hojas[0] ?? td;
            };
            const de = (n) => {
                const cs = getComputedStyle(texto(celda(n)));
                return { peso: cs.fontWeight, color: cs.color, texto: texto(celda(n)).textContent.trim() };
            };
            return {
                ref: { peso: ref.fontWeight, color: ref.color },
                nombre: de("Nombre"),
                fecha: de("Fecha"),
                detalle: de("Detalle"),
            };
        });
        if (ROTO) {
            const conPesoDeMas = ["nombre", "fecha", "detalle"].filter((k) => m[k].peso !== m.ref.peso);
            assert.equal(conPesoDeMas.length, 3, `el roto no reproduce: ${JSON.stringify(m)}`);
            return;
        }
        for (const k of ["nombre", "fecha", "detalle"]) {
            assert.equal(m[k].peso, m.ref.peso, `${k}: peso ${m[k].peso}, Leads ${m.ref.peso}`);
            assert.equal(m[k].color, m.ref.color, `${k}: color ${m[k].color}, Leads ${m.ref.color}`);
        }
        assert.equal(m.ref.peso, "400", "el nombre de Leads no lleva negrilla añadida");
    } finally {
        await cerrar();
    }
});

test("2. Resultado: «Marcar resultado» también en la llamada de una hija; con resultado, su pastilla", async (t) => {
    if (!chromium) return t.skip("sin playwright");
    if (!CSS) return t.skip("sin el CSS del build");
    const { page, cerrar } = await abrir();
    try {
        const celdas = await page.evaluate(() => {
            const tabla = document.querySelector("#llamadas table");
            const heads = [...tabla.querySelectorAll("thead th")].map((th) => th.innerText.trim());
            const i = heads.indexOf("Resultado");
            return [...tabla.querySelectorAll("tbody tr")].map((tr) => ({
                texto: tr.children[i].innerText.trim(),
                boton: !!tr.children[i].querySelector("button"),
                marca: !!tr.querySelector("[data-insignia-de-linea]"),
            }));
        });
        // c1 propia con resultado, c2 propia sin él, c3 de la hija sin él.
        assert.equal(celdas.length, 3);
        assert.equal(celdas[0].texto, "Interesado");
        assert.ok(celdas[0].boton, "la llamada con resultado sigue con su pastilla");
        assert.equal(celdas[1].texto, "Marcar resultado");
        assert.ok(celdas[2].marca, "la tercera fila tiene que ser la de la cuenta hija");
        if (ROTO) {
            assert.equal(celdas[2].texto, "—", "el roto no reproduce: la fila de la hija no pintaba un guion");
            assert.equal(celdas[2].boton, false);
            return;
        }
        assert.equal(celdas[2].texto, "Marcar resultado", "la fila de la hija pinta un guion suelto");
        assert.ok(celdas[2].boton);

        // Y el desplegable de la hija ofrece las siete, igual que el de la propia.
        const filas = page.locator("#llamadas tbody tr");
        await filas.nth(2).getByRole("button", { name: "Marcar resultado" }).click();
        const opciones = await page.getByRole("menuitem").allInnerTexts();
        assert.deepEqual(opciones.map((o) => o.trim()), RESULTADOS);
    } finally {
        await cerrar();
    }
});

test("3. Las flechas de Llamadas siguen donde estaban: todas menos Acciones", async (t) => {
    if (!chromium) return t.skip("sin playwright");
    if (!CSS) return t.skip("sin el CSS del build");
    const { page, cerrar } = await abrir();
    try {
        const cab = await cabeceras(page, "#llamadas");
        assert.deepEqual(
            cab.map((c) => [c.texto, c.flecha]),
            [
                ["WhatsApp", true],
                ["Nombre", true],
                ["Duración", true],
                ["Fecha", true],
                ["Detalle", true],
                ["Resultado", true],
                ["Acciones", false],
            ],
        );
    } finally {
        await cerrar();
    }
});

test("4. Leads: flecha en WhatsApp, Nombre y Etiquetas, con el mismo estilo, y ordenan", async (t) => {
    if (!chromium) return t.skip("sin playwright");
    if (!CSS) return t.skip("sin el CSS del build");
    const { page, cerrar } = await abrir();
    try {
        const cab = await cabeceras(page, "#leads");
        const con = Object.fromEntries(cab.map((c) => [c.texto, c]));
        const NUEVAS = ["WhatsApp", "Nombre", "Etiquetas"];
        if (ROTO) {
            for (const n of NUEVAS) assert.equal(con[n].flecha, false, `el roto no reproduce: ${n} ya tenía flecha`);
            return;
        }
        for (const n of NUEVAS) {
            assert.ok(con[n].flecha, `${n} sin flecha`);
            // El estilo es el de la flecha que Leads ya tenía («Sesión»).
            assert.deepEqual(con[n].estilo, con["Sesión"].estilo, `${n} no se ve como «Sesión»`);
        }
        assert.equal(con["Acciones"].flecha, false, "Acciones no ordena, igual que en Llamadas");

        // Y la flecha mide lo mismo que la de Llamadas.
        const deLlamadas = (await cabeceras(page, "#llamadas")).find((c) => c.texto === "WhatsApp");
        assert.equal(con["WhatsApp"].estilo.flecha, deLlamadas.estilo.flecha);

        const nombres = () =>
            page.evaluate(() =>
                [...document.querySelectorAll("#leads tbody tr td:nth-child(2) span.truncate")].map((s) => s.textContent.trim()),
            );
        const pulsar = (n) => page.locator("#leads thead th").filter({ hasText: n }).getByRole("button").click();

        await pulsar("WhatsApp");
        assert.deepEqual(await nombres(), ["Carla", "Bruno", "Ana"], "WhatsApp: por el número que se ve");
        await pulsar("Nombre");
        assert.deepEqual(await nombres(), ["Ana", "Bruno", "Carla"], "Nombre: alfabético");
        await pulsar("Etiquetas");
        assert.deepEqual(await nombres(), ["Ana", "Carla", "Bruno"], "Etiquetas: por cantidad (0, 1, 3)");
        await pulsar("Etiquetas");
        assert.deepEqual(await nombres(), ["Bruno", "Carla", "Ana"], "Etiquetas: y al revés");
    } finally {
        await cerrar();
    }
});
