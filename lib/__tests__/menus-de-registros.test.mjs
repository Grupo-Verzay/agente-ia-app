/**
 * Los cuatro menús del encargo, pintados por Radix con los componentes REALES.
 *
 *   1. El desplegable de estado de la ficha de la cita queda ENCIMA de la
 *      ficha: cada opción es lo que hay en su propio punto (`elementFromPoint`),
 *      «Confirmada» incluida.
 *   2. El diálogo de Registros lleva UNA sola ✕, la de su cabecera, entera
 *      dentro del diálogo.
 *   3. El menú de «+ Nuevo» nace pegado bajo su botón, con el filo derecho en
 *      el del botón, crece hacia la izquierda y no pasa del borde derecho del
 *      diálogo.
 *   4. El panel de la campanita acaba en el filo derecho de la barra de arriba,
 *      y nace a la MISMA altura que antes (no se le toca el punto de arranque).
 *
 * `MODO=roto` pinta el mismo arnés con los componentes de `ANTES_REF` y
 * afirma los fallos. Se levanta con `scripts/banco-menus-de-registros.sh`.
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
const HARNESS = join(AQUI, ".compilado", "menus-de-registros.js");
const CSS_FICHERO = process.env.CSS_DEL_BANCO;
const DIR_CSS = join(RAIZ, ".next", "static", "css");
const CSS = CSS_FICHERO
    ? fs.readFileSync(CSS_FICHERO, "utf8")
    : fs.existsSync(DIR_CSS)
      ? fs.readdirSync(DIR_CSS).filter((f) => f.endsWith(".css")).map((f) => fs.readFileSync(join(DIR_CSS, f), "utf8")).join("\n")
      : null;

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
                    `<style>html,body{margin:0;height:100%;overflow:hidden}</style>` +
                    // Un panel en movimiento no está en ningún sitio: se miden quietos.
                    `<style>*,*::before,*::after{animation:none !important;transition:none !important}</style>` +
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

async function abrir({ ventana, movil }) {
    const server = await levantar();
    const navegador = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined });
    const contexto = await navegador.newContext({
        viewport: { width: ventana, height: movil ? 844 : 900 },
        hasTouch: movil,
        isMobile: movil,
    });
    const page = await contexto.newPage();
    const errores = [];
    page.on("pageerror", (e) => errores.push(String(e)));
    await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: "load" });
    await page.waitForFunction("window.listo === true", { timeout: 20000 });
    await page.waitForTimeout(100);
    return {
        page,
        errores,
        async cerrar() {
            await navegador.close();
            server.close();
        },
    };
}

const caja = (page, sel) =>
    page.evaluate((s) => {
        const n = typeof s === "string" ? document.querySelector(s) : null;
        if (!n) return null;
        const r = n.getBoundingClientRect();
        return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
    }, sel);

const sin = !chromium || !CSS ? "sin playwright o sin CSS del build" : false;

for (const a of ANCHURAS) {
    test(`${a.ventana}: el estado de la cita se ve ENTERO, encima de la ficha`, { skip: sin }, async () => {
        const n = await abrir(a);
        try {
            const { page } = n;
            await page.click('button[title="Estado de cita"]');
            await page.waitForSelector('[role="combobox"]', { timeout: 5000 });
            await page.click('[role="combobox"]');
            await page.waitForSelector('[role="option"]', { timeout: 5000 });
            await page.waitForTimeout(80);
            // Un `Select` abierto pone `pointer-events: none` en todo lo de
            // fuera, y `elementFromPoint` se SALTA lo que no recibe el puntero:
            // la ficha que tapa las opciones no saldría y todo parecería
            // visible. Se devuelven los punteros solo para preguntar.
            await page.addStyleTag({ content: "*{pointer-events:auto !important}" });
            const opciones = await page.evaluate(() =>
                Array.from(document.querySelectorAll('[role="option"]')).map((o) => {
                    const r = o.getBoundingClientRect();
                    // Arriba, en medio y abajo: una opción CORTADA por la
                    // ficha puede tener el centro a la vista y el borde no.
                    const x = r.left + r.width / 2;
                    const visible = [r.top + 2, r.top + r.height / 2, r.bottom - 2].every((y) => {
                        const encima = document.elementFromPoint(x, y);
                        return !!encima && (o === encima || o.contains(encima));
                    });
                    return { texto: o.textContent.trim(), visible };
                }),
            );
            const tapadas = opciones.filter((o) => !o.visible).map((o) => o.texto);
            if (ROTO) {
                // Las primeras, las que caen sobre la ficha: «Pendiente» entera
                // y «Confirmada» a medias (depende de la altura de la ficha).
                assert.ok(tapadas.includes("Pendiente") && tapadas.includes("Confirmada"), `el «antes» tenía que tapar las primeras: ${JSON.stringify(opciones)}`);
            } else {
                assert.equal(opciones.length, 7);
                assert.deepEqual(tapadas, [], `opciones tapadas por la ficha: ${tapadas.join(", ")}`);
            }
        } finally {
            await n.cerrar();
        }
    });

    test(`${a.ventana}: Registros tiene UNA ✕, entera dentro, y «+ Nuevo» crece hacia dentro`, { skip: sin }, async () => {
        const n = await abrir(a);
        try {
            const { page } = n;
            await page.click("[data-abrir-registros]");
            await page.waitForSelector('[role="dialog"]', { timeout: 5000 });
            await page.waitForTimeout(80);
            const dialogo = await caja(page, '[role="dialog"]');
            const equis = await page.evaluate(() => {
                const d = document.querySelector('[role="dialog"]');
                return Array.from(d.querySelectorAll("button"))
                    .filter((b) => b.querySelector("svg.lucide-x"))
                    .map((b) => {
                        const r = b.getBoundingClientRect();
                        const st = getComputedStyle(b);
                        return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, w: r.width, visible: st.display !== "none" && st.visibility !== "hidden" && r.width > 0 };
                    })
                    .filter((b) => b.visible);
            });
            if (ROTO) {
                assert.ok(equis.length >= 2, `el «antes» tenía dos ✕: ${JSON.stringify(equis)}`);
            } else {
                assert.equal(equis.length, 1, `✕ visibles: ${JSON.stringify(equis)}`);
                const x = equis[0];
                assert.ok(x.left >= dialogo.left && x.right <= dialogo.right + 0.5 && x.top >= dialogo.top, `la ✕ sale del diálogo: ${JSON.stringify({ x, dialogo })}`);
            }

            // El «+ Nuevo».
            const boton = await page.evaluate(() => {
                const b = Array.from(document.querySelectorAll('[role="dialog"] button')).find((x) => x.textContent.trim() === "+ Nuevo");
                if (!b) return null;
                b.setAttribute("data-nuevo", "");
                const r = b.getBoundingClientRect();
                return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
            });
            assert.ok(boton, "no está el botón «+ Nuevo»");
            await page.click("[data-nuevo]");
            await page.waitForSelector('[role="menu"]', { timeout: 5000 });
            await page.waitForTimeout(80);
            const menu = await caja(page, '[role="menu"]');
            const r = (v) => Math.round(v);
            console.log(`  ${a.ventana}: dialogo ${r(dialogo.left)}→${r(dialogo.right)} · botón ${r(boton.left)}→${r(boton.right)} bajo ${r(boton.bottom)} · menú ${r(menu.left)}→${r(menu.right)} arriba ${r(menu.top)}`);
            if (ROTO) {
                // El «antes»: con hueco bajo el botón, y el diálogo con 8 px de
                // desbordamiento a lo ancho por la ✕ cortada de la esquina.
                assert.ok(Math.abs(menu.top - boton.bottom) > 0.5, `el «antes» no nacía pegado: ${menu.top} vs ${boton.bottom}`);
                const desborda = await page.evaluate(() => {
                    const d = document.querySelector('[role="dialog"]');
                    return d.scrollWidth - d.clientWidth;
                });
                assert.ok(desborda > 0, "el «antes» tenía el diálogo desbordando a lo ancho");
            } else {
                const desborda = await page.evaluate(() => {
                    const d = document.querySelector('[role="dialog"]');
                    return d.scrollWidth - d.clientWidth;
                });
                assert.equal(desborda, 0, "el diálogo desborda a lo ancho");
                assert.ok(Math.abs(menu.right - boton.right) <= 0.5, `filo derecho del menú (${menu.right}) ≠ el del botón (${boton.right})`);
                assert.ok(Math.abs(menu.top - boton.bottom) <= 0.5, `no nace pegado bajo el botón: ${menu.top} vs ${boton.bottom}`);
                assert.ok(menu.right <= dialogo.right + 0.5, `se sale por la derecha del diálogo`);
                assert.ok(menu.left >= dialogo.left - 0.5, `se sale por la izquierda del diálogo`);
                const opciones = await page.$$eval('[role="menuitem"]', (xs) => xs.map((x) => x.textContent.trim()));
                assert.ok(opciones.includes("Nueva Solicitud") && opciones.includes("Nuevo Producto"), JSON.stringify(opciones));
            }
            assert.deepEqual(n.errores, []);
        } finally {
            await n.cerrar();
        }
    });

    test(`${a.ventana}: la campanita acaba en el filo derecho de la barra y nace donde nacía`, { skip: sin }, async () => {
        const n = await abrir(a);
        try {
            const { page } = n;
            const barra = await caja(page, "[data-barra-de-arriba]");
            const boton = await caja(page, 'button[aria-label="Centro de notificaciones"]');
            // Donde nacía: bajo la barra medida más el hueco de siempre (4).
            // Se calcula igual que lo calculaba el código de antes, porque lo
            // que se afirma es que NO cambió.
            const nacia = boton.bottom + Math.max(0, Math.round(barra.bottom - boton.bottom)) + 4;
            await page.click('button[aria-label="Centro de notificaciones"]');
            await page.waitForSelector('[role="menu"]', { timeout: 5000 });
            await page.waitForTimeout(80);
            const panel = await caja(page, '[role="menu"]');
            console.log(`  ${a.ventana}: barra →${Math.round(barra.right)} bajo ${barra.bottom} · campana ${Math.round(panel.left)}→${Math.round(panel.right)} arriba ${panel.top} alto ${Math.round(panel.height)}`);
            // Nace a 4 px bajo la barra en los dos modos: eso NO se toca.
            assert.ok(Math.abs(panel.top - nacia) <= 0.5, `cambió el punto donde nace: ${panel.top} (nacía en ${nacia})`);
            // Y el alto tampoco: el tope sigue saliendo del hueco de verdad.
            const tope = await page.evaluate(() => document.querySelector('[role="menu"]').style.maxHeight);
            assert.ok(tope.includes("--radix-dropdown-menu-content-available-height"), `el tope de alto cambió: ${tope}`);
            if (ROTO) {
                assert.ok(barra.right - panel.right > 1, `el «antes» no llegaba al filo (${panel.right} de ${barra.right})`);
            } else {
                assert.ok(Math.abs(panel.right - barra.right) <= 0.5, `no acaba en el filo: ${panel.right} vs ${barra.right}`);
                assert.ok(panel.left >= -0.5, "se sale por la izquierda");
            }
        } finally {
            await n.cerrar();
        }
    });
}
