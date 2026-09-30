/**
 * La ficha SIMÉTRICA, en Chromium sobre el CSS de la App, con el diálogo REAL
 * de «Configurar campos de la ficha» y la ficha REAL abierta:
 *
 *   - en el diálogo, TODAS las filas tienen la misma anatomía —asa,
 *     interruptor encendido, ícono, etiqueta, sección— y caen en las mismas
 *     columnas; Nombre y Teléfono arriba y Notas abajo, bloqueados: el asa y
 *     el interruptor apagados, su sección real y un candado donde va la
 *     papelera;
 *   - Notas queda la última aunque se agreguen campos;
 *   - en la ficha abierta, Nombre y Teléfono muestran el nombre y el número
 *     REALES del contacto y Notas es el último campo, más alto que los demás y
 *     con la manija de la esquina para estirarlo.
 *
 * `MODO=roto` monta el diálogo y la ficha de `ANTES_REF` y AFIRMA el fallo.
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
const DIR = join(AQUI, ".compilado", "ficha-simetrica");
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

const F = (key, label, extra = {}) => ({ key, label, section: "Datos de negocio", icon: "Building2", enabled: true, order: 0, custom: true, ...extra });
const CAMPOS = [
    F("empresa", "Empresa", { order: 0 }),
    F("correo", "Correo", { section: "Contacto", icon: "Mail", order: 1 }),
    F("apodo", "Apodo", { section: "Libre", icon: "Tag", order: 2, enabled: false }),
];

let server, browser;
const errores = [];
test.before(async () => {
    server = await levantar();
    browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined });
});
test.after(async () => { await browser?.close(); server?.close(); });

async function abrir(ancho, que, campos) {
    const page = await browser.newPage({ viewport: { width: ancho, height: 900 } });
    page.on("pageerror", (e) => errores.push(String(e)));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForFunction(() => window.listo === true, null, { timeout: 20000 }).catch(() => {
        throw new Error("la maqueta no cargó: " + errores.join(" | "));
    });
    await page.evaluate(([q, c]) => (q === "dialogo" ? window.pintarDialogo(c) : window.pintarFicha(c)), [que, campos]);
    return page;
}

/** Cada fila del diálogo, en orden, con la x de cada columna y sus mandos. */
const lasFilas = (page) => page.evaluate(() => {
    const dlg = document.querySelector('[role="dialog"]');
    const x = (e) => (e ? Math.round(e.getBoundingClientRect().left) : null);
    const etiquetas = [...dlg.querySelectorAll("input")].filter((i) => i.placeholder !== "Sección" && !i.hasAttribute("list"));
    return etiquetas.map((i) => {
        const fila = i.parentElement;
        const asa = fila.querySelector("svg.lucide-grip-vertical")?.closest("button") ?? null;
        const interruptor = fila.querySelector('[role="switch"]');
        const seccion = fila.querySelector('input[placeholder="Sección"]');
        const papelera = fila.querySelector('button[title="Eliminar campo"]');
        return {
            label: i.value,
            fija: fila.hasAttribute("data-campo-fijo"),
            alto: Math.round(fila.getBoundingClientRect().height),
            xAsa: x(asa), xInterruptor: x(interruptor), xEtiqueta: x(i), xSeccion: x(seccion),
            asaActiva: asa ? !asa.disabled : null,
            encendido: interruptor ? interruptor.getAttribute("aria-checked") === "true" : null,
            interruptorActivo: interruptor ? !interruptor.disabled : null,
            opacidadInterruptor: interruptor ? getComputedStyle(interruptor).opacity : null,
            seccion: seccion?.value ?? null,
            candado: !!fila.querySelector("svg.lucide-lock"),
            papelera: !!papelera,
            dice: fila.textContent.trim(),
        };
    });
});

for (const ancho of [1440, 1024, 390]) {
    test(`${ancho}: todas las filas con la misma anatomía y en las mismas columnas`, { skip: ROTO }, async () => {
        const page = await abrir(ancho, "dialogo", CAMPOS);
        await page.waitForSelector('[role="dialog"]');
        const filas = await lasFilas(page);
        assert.deepEqual(filas.map((f) => f.label), ["Nombre", "Teléfono", "Empresa", "Correo", "Apodo", "Notas"]);
        for (const col of ["xAsa", "xInterruptor", "xEtiqueta", "xSeccion"]) {
            assert.equal(new Set(filas.map((f) => f[col])).size, 1, `${col} distinto: ${JSON.stringify(filas.map((f) => [f.label, f[col]]))}`);
        }
        assert.equal(new Set(filas.map((f) => f.alto)).size, 1, `altos distintos: ${JSON.stringify(filas.map((f) => [f.label, f.alto]))}`);
        const fijas = filas.filter((f) => f.fija);
        assert.deepEqual(fijas.map((f) => [f.label, f.seccion]), [["Nombre", "Contacto"], ["Teléfono", "Contacto"], ["Notas", "Libre"]]);
        for (const f of fijas) {
            assert.equal(f.asaActiva, false, `${f.label}: el asa está pero no arrastra`);
            assert.equal(f.encendido, true, `${f.label}: el interruptor está encendido`);
            assert.equal(f.interruptorActivo, false, `${f.label}: y no se puede apagar`);
            assert.equal(f.opacidadInterruptor, "1", `${f.label}: se ve encendido, no apagado a medias`);
            assert.equal(f.candado, true, `${f.label}: lleva candado`);
            assert.equal(f.papelera, false, `${f.label}: no se borra`);
            assert.ok(!/\bFijo\b/.test(f.dice), `${f.label}: no dice «Fijo»`);
        }
        for (const f of filas.filter((f) => !f.fija)) {
            assert.equal(f.asaActiva, true);
            assert.equal(f.interruptorActivo, true);
            assert.equal(f.papelera, true);
        }
        const desborda = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
        assert.equal(desborda, false, "no desborda a lo ancho");
        await page.close();
    });
}

test("agregar campos no mueve a Notas del último sitio, y guardar no la mete en la lista", { skip: ROTO }, async () => {
    const page = await abrir(1280, "dialogo", CAMPOS);
    await page.waitForSelector('[role="dialog"]');
    for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Agregar campo" }).click();
    const filas = await lasFilas(page);
    assert.equal(filas.at(-1).label, "Notas");
    assert.equal(filas.length, 9);
    await page.getByRole("button", { name: "Guardar" }).click();
    await page.waitForFunction(() => window.guardado !== null);
    const guardado = await page.evaluate(() => window.guardado);
    assert.ok(!guardado.some((f) => ["nombre", "telefono", "notas"].includes(f.key)));
    assert.equal(guardado.length, 6);
    await page.close();
});

/** Los campos de la ficha abierta, en orden de pantalla. */
const losCampos = (page) => page.evaluate(() =>
    [...document.querySelectorAll("[data-campo-de-la-ficha]")].map((c) => {
        const e = c.querySelector("input, textarea");
        const r = e.getBoundingClientRect();
        return {
            key: c.getAttribute("data-campo-de-la-ficha"),
            label: c.querySelector("label").textContent.trim(),
            valor: e.value, soloLectura: e.readOnly, etiqueta: e.tagName,
            alto: Math.round(r.height), resize: getComputedStyle(e).resize, overflowY: getComputedStyle(e).overflowY, filas: e.rows, top: Math.round(r.top),
        };
    }));

for (const ancho of [1440, 1024, 390]) {
    test(`${ancho}: en la ficha, Nombre y Teléfono reales arriba y Notas la última, más grande`, { skip: ROTO }, async () => {
        const page = await abrir(ancho, "ficha", CAMPOS);
        await page.waitForSelector("[data-notas]", { timeout: 10000 });
        const campos = await losCampos(page);
        assert.deepEqual(campos.map((c) => c.key), ["nombre", "telefono", "correo", "empresa", "notas"]);
        assert.equal(campos[0].valor, "Yair Silvera", "Nombre muestra el nombre real");
        assert.equal(campos[1].valor, "+57 300 111 2233", "Teléfono muestra el número real");
        assert.equal(campos[1].soloLectura, true, "el número no se reescribe aquí");
        const notas = campos.at(-1);
        assert.equal(notas.etiqueta, "TEXTAREA");
        assert.equal(notas.resize, "vertical", "Notas lleva la manija de la esquina");
        assert.equal(notas.filas, 3, "Notas abre con 3 líneas");
        assert.ok(notas.alto >= 50 && notas.alto <= 80, `Notas abre con 3 líneas visibles: ${notas.alto}px`);
        assert.ok(["auto", "scroll"].includes(notas.overflowY), `Notas se desplaza si es más largo: ${notas.overflowY}`);
        const otros = Math.max(...campos.slice(0, -1).map((c) => c.alto));
        assert.ok(notas.alto > otros * 2, `Notas (${notas.alto}) más alta que los demás (${otros})`);
        for (const c of campos.slice(0, -1)) assert.notEqual(c.resize, "vertical", `${c.key} no se estira`);
        await page.close();
    });
}

test("la manija de Notas la estira arrastrando la esquina", { skip: ROTO }, async () => {
    const page = await abrir(1280, "ficha", []);
    const notas = page.locator("[data-notas]");
    await notas.waitFor({ timeout: 10000 });
    await notas.scrollIntoViewIfNeeded();
    const r0 = await notas.boundingBox();
    await page.mouse.move(r0.x + r0.width - 3, r0.y + r0.height - 3);
    await page.mouse.down();
    await page.mouse.move(r0.x + r0.width - 3, r0.y + r0.height + 120, { steps: 8 });
    await page.mouse.up();
    const r1 = await notas.boundingBox();
    assert.ok(r1.height > r0.height + 60, `antes ${r0.height}, después ${r1.height}`);
    // Y en una ficha sin campos: solo Nombre, Teléfono y Notas.
    assert.deepEqual((await losCampos(page)).map((c) => c.key), ["nombre", "telefono", "notas"]);
    await page.close();
});

// ── El «antes», pinchado ──
test("ANTES: las filas fijas decían «Fijo», sin asa ni interruptor, y no había Notas", { skip: !ROTO }, async () => {
    const page = await abrir(1280, "dialogo", CAMPOS);
    await page.waitForSelector('[role="dialog"]');
    const filas = await lasFilas(page);
    const fijas = filas.filter((f) => f.fija);
    assert.deepEqual(fijas.map((f) => f.label), ["Nombre", "Teléfono"]);
    for (const f of fijas) {
        assert.equal(f.xAsa, null, `${f.label}: sin asa`);
        assert.equal(f.encendido, null, `${f.label}: sin interruptor`);
        assert.equal(f.seccion, null, `${f.label}: sin sección real`);
        assert.ok(/\bFijo\b/.test(f.dice), `${f.label}: decía «Fijo»`);
    }
    assert.ok(!filas.some((f) => f.label === "Notas"), "no había Notas");
    await page.close();
});

test("ANTES: la ficha abierta no tenía ni Nombre, ni Teléfono, ni Notas", { skip: !ROTO }, async () => {
    const page = await abrir(1280, "ficha", CAMPOS);
    await page.waitForTimeout(1500);
    const hay = await page.evaluate(() => ({
        notas: !!document.querySelector("textarea"),
        labels: [...document.querySelectorAll("label")].map((l) => l.textContent.trim()),
        pintada: document.body.innerText.includes("Agente IA"),
    }));
    assert.equal(hay.pintada, true, "la ficha de antes sí se pintó: lo que falta, falta de verdad");
    assert.equal(hay.notas, false);
    assert.ok(!hay.labels.includes("Notas") && !hay.labels.includes("Nombre"), JSON.stringify(hay.labels));
    await page.close();
});
