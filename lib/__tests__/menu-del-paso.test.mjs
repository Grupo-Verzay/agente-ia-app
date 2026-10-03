/**
 * El MENÚ DEL PASO, en Chromium, en las cuatro pestañas REALES del
 * entrenamiento: Inicio, Preguntas, Productos y Extras.
 *
 * Lo que aquí se mide no se ve leyendo el código: Radix pinta el menú en un
 * portal y solo al abrirlo, así que «qué ofrece Agregar acción» y «qué tarjeta
 * sale al pulsar» se contestan abriéndolo. Se exige que las cuatro pestañas
 * digan EXACTAMENTE lo mismo:
 *   - el menú: los mismos grupos, las mismas opciones y en el mismo orden, con
 *     «Agregar caso» y «Agregar transición» dentro;
 *   - «Agregar caso» pone la misma tarjeta con los mismos campos;
 *   - «Agregar transición» pone la misma tarjeta con su campo de destino, y
 *     después desaparece del menú (una por paso);
 *   - fuera de Inicio el destino es un paso de Inicio.
 *
 * `MODO=roto` monta las pestañas de `ANTES_FUERA_REF` (antes de #1102) y
 * AFIRMA el fallo: Inicio ofrecía caso y transición y las otras tres no.
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
const HARNESS = join(AQUI, ".compilado", "menu-del-paso", "harness.js");
const PESTANAS = ["inicio", "preguntas", "productos", "extras"];

function levantar() {
    const bundle = fs.readFileSync(HARNESS);
    const server = http.createServer((req, res) => {
        const u = (req.url ?? "/").split("?")[0];
        if (u === "/") {
            res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
            res.end(
                `<!doctype html><html><head><meta charset="utf-8">` +
                    `<script>window.process={env:{}}</script></head>` +
                    `<body><div id="app"></div><script type="module" src="/h.js"></script></body></html>`,
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

let server, browser, page;
const errores = [];
test.before(async () => {
    server = await levantar();
    browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined });
    page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.on("pageerror", (e) => errores.push(String(e)));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForFunction(() => window.listo === true, null, { timeout: 20000 }).catch(() => {
        throw new Error("la maqueta no llegó a cargar: " + errores.join(" | "));
    });
});
test.after(async () => {
    await browser?.close();
    server?.close();
});

/** Monta una pestaña y deja su único elemento abierto, con «Agregar acción» a la vista. */
async function montar(pestana) {
    await page.evaluate((p) => window.pintar(p), pestana);
    const boton = page.getByRole("button", { name: "Agregar acción" });
    const expandir = page.getByRole("button", { name: /Expandir todo/ });
    // Espera a que la pestaña pinte algo: o el elemento abierto o su «Expandir todo».
    await boton.or(expandir).first().waitFor({ state: "visible", timeout: 10000 });
    // Si el elemento nace plegado, se despliega con «Expandir todo».
    if ((await boton.count()) === 0) await expandir.first().click();
    await boton.first().waitFor({ state: "visible", timeout: 10000 });
    return boton.first();
}

/** Abre el menú y lo lee: grupos con sus opciones, en orden y sin el emoji. */
async function leerMenu(pestana) {
    const boton = await montar(pestana);
    await boton.click();
    const menu = page.locator("[cmdk-list]").last();
    await menu.waitFor({ state: "visible" });
    const grupos = await menu.locator("[cmdk-group]").evaluateAll((gs) =>
        gs.map((g) => ({
            titulo: g.querySelector("[cmdk-group-heading]")?.textContent?.trim() ?? "",
            opciones: [...g.querySelectorAll("[cmdk-item]")].map((i) =>
                (i.textContent ?? "").replace(/^[^\p{L}]+/u, "").trim(),
            ),
        })),
    );
    return grupos;
}

async function cerrarMenu() {
    await page.keyboard.press("Escape");
}

/** Pulsa una opción del menú (lo abre si hace falta). */
async function elegir(opcion) {
    if ((await page.locator("[cmdk-list]").count()) === 0) {
        await page.getByRole("button", { name: "Agregar acción" }).first().click();
    }
    await page.locator("[cmdk-item]", { hasText: opcion }).first().click();
}

/** Los campos de una tarjeta: sus rótulos, sus cajas y su ayuda. */
async function campos(selector) {
    const t = page.locator(selector).first();
    await t.waitFor({ state: "visible", timeout: 5000 });
    return t.evaluate((n) => ({
        rotulos: [...n.querySelectorAll("label")].map((l) => l.textContent.trim()),
        cajas: [...n.querySelectorAll("textarea, input, button[role=combobox]")].map(
            (c) => c.getAttribute("data-campo") || c.getAttribute("aria-label") || c.tagName,
        ),
    }));
}

if (ROTO) {
    test("ROTO: Inicio ofrecía caso y transición y las otras tres pestañas no", async () => {
        const inicio = (await leerMenu("inicio")).flatMap((g) => g.opciones);
        await cerrarMenu();
        assert.ok(inicio.includes("Agregar caso") && inicio.includes("Agregar transición"), inicio.join(" | "));
        for (const p of ["preguntas", "productos", "extras"]) {
            const o = (await leerMenu(p)).flatMap((g) => g.opciones);
            await cerrarMenu();
            assert.ok(!o.includes("Agregar caso"), `${p}: ${o.join(" | ")}`);
            assert.ok(!o.includes("Agregar transición"), `${p}: ${o.join(" | ")}`);
        }
    });
} else {
    const menus = {};

    test("el menú de Inicio: ACCIONES y CONVERSACIÓN con las cuatro en su orden", async () => {
        menus.inicio = await leerMenu("inicio");
        await cerrarMenu();
        assert.deepEqual(menus.inicio, [
            { titulo: "ACCIONES", opciones: ["Ejecutar flujo", "Notificar asesor", "Leer Google Sheets"] },
            {
                titulo: "CONVERSACIÓN",
                opciones: ["Agregar caso", "Agregar respuesta", "Agregar transición", "Agregar nota interna"],
            },
        ]);
    });

    for (const p of ["preguntas", "productos", "extras"]) {
        test(`${p}: el MISMO menú que Inicio, opción por opción y en el mismo orden`, async () => {
            const m = await leerMenu(p);
            await cerrarMenu();
            assert.deepEqual(m, menus.inicio);
        });
    }

    const tarjetas = {};
    for (const p of PESTANAS) {
        test(`${p}: «Agregar caso» y «Agregar transición» ponen sus tarjetas, y la transición es una por paso`, async () => {
            await montar(p);
            await elegir("Agregar caso");
            await elegir("Agregar transición");
            const caso = await campos("[data-tarjeta-caso]");
            const trans = await campos("[data-tarjeta-transicion]");
            tarjetas[p] = { caso, trans };
            // Una transición por paso: ya no se ofrece.
            await page.getByRole("button", { name: "Agregar acción" }).first().click();
            const opciones = await page.locator("[cmdk-item]").allTextContents();
            await cerrarMenu();
            assert.ok(opciones.some((o) => o.includes("Agregar caso")), "el caso se puede repetir");
            assert.ok(!opciones.some((o) => o.includes("Agregar transición")), "una sola transición por paso");
            if (p !== "inicio") {
                // El destino se elige entre los pasos de Inicio.
                await page.locator("[data-tarjeta-transicion] [data-campo='destino']").click();
                const destinos = await page.getByRole("option").allTextContents();
                await page.keyboard.press("Escape");
                assert.deepEqual(destinos.map((d) => d.trim().toUpperCase()), ["BIENVENIDA", "CALIFICAR", "CERRAR VENTA"]);
            }
        });
    }

    test("las tarjetas de caso y de transición tienen los MISMOS campos en las cuatro pestañas", () => {
        for (const p of ["preguntas", "productos", "extras"]) {
            assert.deepEqual(tarjetas[p].caso, tarjetas.inicio.caso, `${p}: caso`);
            assert.deepEqual(tarjetas[p].trans.cajas, tarjetas.inicio.trans.cajas, `${p}: transición`);
            assert.equal(tarjetas[p].trans.rotulos.length, tarjetas.inicio.trans.rotulos.length, `${p}: transición`);
        }
        assert.ok(tarjetas.inicio.caso.cajas.length >= 2, JSON.stringify(tarjetas.inicio.caso));
    });

    test("no hubo errores en la página", () => {
        assert.deepEqual(errores, []);
    });
}
