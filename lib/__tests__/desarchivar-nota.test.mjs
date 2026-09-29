/**
 * DESARCHIVAR en la barra REAL del editor de Mis notas, en Chromium.
 *
 * El `onClick` del botón es código que sin navegador no se ejecuta, así que lo
 * que se pregunta aquí es qué le PIDE la barra a la pantalla al pulsarlo:
 *   - con una nota ACTIVA: archivar (`onToggleArchive(id, false)`), icono de caja;
 *   - con una nota ARCHIVADA: desarchivar (`onToggleArchive(id, true)`), otro
 *     icono y otro título, en el MISMO sitio de la barra.
 *
 * `MODO=roto` monta el `NotesEditor` de `ANTES_REF` y AFIRMA el fallo: con la
 * nota archivada el botón sigue diciendo «Archivar nota» y lo único que pide es
 * archivarla otra vez; no hay nada que diga «desarchivar».
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
const HARNESS = join(AQUI, ".compilado", "desarchivar-nota", "harness.js");

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
    page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
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

/** Pinta la nota y devuelve el botón de archivo: el que lleva el icono de caja. */
async function elBoton(archivada) {
    await page.evaluate((a) => {
        window.llamadas.length = 0;
        window.pintar(a);
    }, archivada);
    await page.waitForSelector("svg.lucide-archive, svg.lucide-archive-restore");
    const svg = page.locator("svg.lucide-archive, svg.lucide-archive-restore");
    assert.equal(await svg.count(), 1, "un solo botón de archivo en la barra");
    const boton = svg.locator("xpath=ancestor::button[1]");
    return {
        boton,
        titulo: await boton.getAttribute("title"),
        icono: (await svg.getAttribute("class")) ?? "",
        caja: await boton.boundingBox(),
    };
}

async function pulsar(boton) {
    await boton.click();
    return page.evaluate(() => window.llamadas.slice());
}

if (ROTO) {
    test("ANTES: con la nota ARCHIVADA el botón seguía diciendo «Archivar nota»", async () => {
        const { boton, titulo, icono } = await elBoton(true);
        assert.equal(titulo, "Archivar nota");
        assert.match(icono, /lucide-archive(?!-restore)/);
        const llamadas = await pulsar(boton);
        assert.deepEqual(llamadas, [["onArchive", "archivada"]], "lo único que pedía era archivarla otra vez");
        assert.equal(await page.locator('[title*="esarchivar"]').count(), 0, "nada decía desarchivar");
    });
} else {
    test("nota ACTIVA: el botón archiva", async () => {
        const { boton, titulo, icono } = await elBoton(false);
        assert.equal(titulo, "Archivar nota");
        assert.match(icono, /lucide-archive(?!-restore)/);
        assert.deepEqual(await pulsar(boton), [["onToggleArchive", "activa", false]]);
    });

    test("nota ARCHIVADA: el MISMO botón desarchiva, con otro icono y otro título", async () => {
        const { boton, titulo, icono } = await elBoton(true);
        assert.equal(titulo, "Desarchivar nota");
        assert.equal(await boton.getAttribute("aria-label"), "Desarchivar nota");
        assert.match(icono, /lucide-archive-restore/);
        assert.deepEqual(await pulsar(boton), [["onToggleArchive", "archivada", true]]);
    });

    test("simetría: los dos ocupan el mismo sitio y la misma forma en la barra", async () => {
        const a = await elBoton(false);
        const b = await elBoton(true);
        assert.deepEqual(
            { x: Math.round(a.caja.x), y: Math.round(a.caja.y), w: Math.round(a.caja.width), h: Math.round(a.caja.height) },
            { x: Math.round(b.caja.x), y: Math.round(b.caja.y), w: Math.round(b.caja.width), h: Math.round(b.caja.height) },
        );
        const antes = await page.evaluate(() => [...document.querySelectorAll("button[title]")].map((b) => b.title));
        const i = antes.indexOf("Desarchivar nota");
        assert.ok(antes[i - 1]?.startsWith("Fijar") || antes[i - 1]?.startsWith("Desfijar"), "va justo tras fijar, como archivar");
        assert.equal(antes[i + 1], "Eliminar nota", "y justo antes de eliminar");
    });
}
