/**
 * La cabecera de la conversación y el «Contexto del lead», PINTADOS.
 *
 * Tres cosas que no se contestan leyendo el código:
 *
 * 1. **Macros y Acciones se ven siempre**, a cualquier ancho de cabecera. Lo
 *    que cede son las pestañas, que se pliegan en «Más». El «antes» era una
 *    sola caja con `overflow-x-auto`: al estrecharse, Macros y Acciones se iban
 *    por la derecha detrás de un desplazamiento sin barra.
 * 2. **El menú de la cita agendada cuelga de SU botón y crece hacia la
 *    izquierda**, también cuando el botón cae en la mitad izquierda de la
 *    cabecera. El «antes» elegía el lado por esa mitad y crecía hacia la
 *    derecha desde el centro.
 * 3. **El panel «Contexto del lead» real**: sus bloques en el orden pedido, los
 *    tres de arriba sin texto de más, y la síntesis editándose y guardándose
 *    AHÍ MISMO —actualizando el seguimiento que ya tiene, o creando una manual
 *    cuando no hay—, sin ninguna ventana emergente.
 *
 * `MODO=roto` construye el arnés con el código de ANTES_REF y AFIRMA los
 * fallos. Se levanta con `scripts/banco-cabecera-del-chat.sh`.
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

const ROTO = process.env.MODO === "roto";
const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..", "..");
const HARNESS = join(AQUI, ".compilado", "harness-cabecera-del-chat.js");
const DIR_CSS = join(RAIZ, ".next", "static", "css");
const CSS = fs.existsSync(DIR_CSS)
    ? fs.readdirSync(DIR_CSS).filter((f) => f.endsWith(".css")).map((f) => fs.readFileSync(join(DIR_CSS, f), "utf8")).join("\n")
    : "";

function levantar() {
    const bundle = fs.readFileSync(HARNESS);
    const server = http.createServer((req, res) => {
        const u = (req.url ?? "/").split("?")[0];
        if (u === "/") {
            res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
            res.end(
                `<!doctype html><html><head><meta charset="utf-8">` +
                    `<meta name="viewport" content="width=device-width, initial-scale=1">` +
                    `<style>${CSS}</style>` +
                    `<style>:root{--alto-de-la-barra:64px}html,body{margin:0;height:100%;overflow:hidden}` +
                    `*,*::before,*::after{animation:none !important;transition:none !important}</style>` +
                    `</head><body><div id="app"></div><script type="module" src="/h.js"></script></body></html>`,
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
    return new Promise((r) => server.listen(0, () => r(server)));
}

async function abrir(sintesis) {
    const server = await levantar();
    const navegador = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined });
    const page = await navegador.newPage({ viewport: { width: 1440, height: 900 } });
    const errores = [];
    page.on("pageerror", (e) => errores.push(String(e)));
    await page.addInitScript((s) => {
        window.__sintesis = s;
        window.__llamadas = [];
    }, sintesis ?? null);
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForFunction("window.listo === true", { timeout: 20000 });
    await page.waitForTimeout(80);
    assert.deepEqual(errores, [], "el arnés tiene que pintarse sin errores");
    return { page, cerrar: async () => { await navegador.close(); server.close(); } };
}

const caja = (page, sel) =>
    page.evaluate((s) => {
        const n = document.querySelector(s);
        if (!n) return null;
        const r = n.getBoundingClientRect();
        return { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom), width: Math.round(r.width) };
    }, sel);

const faltaNavegador = (t) => {
    if (chromium && fs.existsSync(HARNESS) && CSS) return false;
    t.skip("falta el navegador, el arnés o el CSS del build");
    return true;
};

// ─────────────────────────────────────────────────────────────────────────────
// 1. Macros y Acciones, siempre a la vista
// ─────────────────────────────────────────────────────────────────────────────

// La cabecera medida en producción: 1056 a 1440 sin paneles, ~700 con la ficha
// de contacto, ~520 con la ficha y un panel lateral, y las de un portátil.
const ANCHOS = [1056, 760, 620, 520, 440];

test("Macros y Acciones se ven enteros a cualquier ancho; lo que se pliega son las pestañas", async (t) => {
    if (faltaNavegador(t)) return;
    const { page, cerrar } = await abrir();
    try {
        let alguna = false;
        for (const ancho of ANCHOS) {
            await page.evaluate((a) => window.ancho(a), ancho);
            await page.waitForTimeout(120);
            const fila = await caja(page, "[data-fila]");
            const macros = await caja(page, "#macros");
            const acciones = await caja(page, "#acciones");
            const plegadas = await page.evaluate(() => Boolean(document.querySelector("[data-mas-pestanas]")));
            const visibles = await page.evaluate(() =>
                Array.from(document.querySelectorAll("[data-pestana-del-chat]")).map((n) => {
                    const r = n.getBoundingClientRect();
                    return { id: n.getAttribute("data-pestana-del-chat"), right: Math.round(r.right) };
                }),
            );
            const dentro = (c) => c.left >= fila.left && c.right <= fila.right;
            t.diagnostic(
                `${ancho}: fila ${fila.left}→${fila.right} · Macros ${macros.left}→${macros.right} · Acciones ${acciones.left}→${acciones.right} · pestañas ${visibles.length}${plegadas ? " + Más" : ""}`,
            );

            if (ROTO) {
                if (!dentro(acciones)) alguna = true;
                continue;
            }
            assert.ok(dentro(macros), `a ${ancho} Macros se sale de la fila (${macros.left}→${macros.right})`);
            assert.ok(dentro(acciones), `a ${ancho} Acciones se sale de la fila (${acciones.left}→${acciones.right})`);
            for (const p of visibles) {
                assert.ok(p.right <= macros.left, `a ${ancho} la pestaña ${p.id} se monta sobre Macros`);
            }
            assert.ok(
                visibles.some((p) => p.id === "messages"),
                `a ${ancho} la pestaña ABIERTA se ve siempre`,
            );
            if (ancho <= 520) {
                assert.ok(plegadas, `a ${ancho} no caben las cinco: tiene que salir «Más»`);
                alguna = true;
            }
            if (ancho === 1056) assert.ok(!plegadas, "con sitio de sobra no hay «Más»");
        }
        if (ROTO) assert.ok(alguna, "el «antes» dejaba Acciones fuera de la fila en algún ancho");
        else assert.ok(alguna, "algún ancho tiene que ejercer el plegado");
    } finally {
        await cerrar();
    }
});

test("«Más» lleva a las pestañas plegadas, y la elegida sigue a la vista", async (t) => {
    if (faltaNavegador(t)) return;
    if (ROTO) {
        t.skip("el «antes» no tenía «Más»: lo afirma el test de arriba");
        return;
    }
    const { page, cerrar } = await abrir();
    try {
        await page.evaluate(() => window.ancho(440));
        await page.waitForTimeout(150);
        await page.click("[data-mas-pestanas]");
        await page.waitForSelector("[data-pestana-plegada]");
        const plegadas = await page.$$eval("[data-pestana-plegada]", (ns) => ns.map((n) => n.getAttribute("data-pestana-plegada")));
        assert.ok(plegadas.includes("web"), `la última va plegada: ${plegadas}`);

        // El menú cuelga de SU botón: filo derecho con filo derecho.
        const boton = await caja(page, "[data-mas-pestanas]");
        const menu = await caja(page, "[role=menu]");
        const cabecera = await caja(page, "[data-cabecera-de-chat]");
        assert.ok(menu.left >= cabecera.left, "el menú no se sale de la cabecera");
        assert.ok(menu.right >= boton.right - 1, "no crece hacia la derecha desde el botón");

        await page.click('[data-pestana-plegada="web"]');
        await page.waitForTimeout(150);
        assert.equal(await page.evaluate(() => window.activa()), "web");
        const vistas = await page.$$eval("[data-pestana-del-chat]", (ns) => ns.map((n) => n.getAttribute("data-pestana-del-chat")));
        assert.ok(vistas.includes("web"), `la pestaña elegida tiene que verse: ${vistas}`);
    } finally {
        await cerrar();
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. La cita agendada cuelga de SU botón
// ─────────────────────────────────────────────────────────────────────────────

for (const izquierda of [false, true]) {
    test(`la cita agendada ${izquierda ? "en la mitad IZQUIERDA" : "a la derecha"}: filo derecho con su botón, crece hacia la izquierda`, async (t) => {
        if (faltaNavegador(t)) return;
        const { page, cerrar } = await abrir();
        try {
            await page.evaluate((i) => window.citaALaIzquierda(i), izquierda);
            await page.waitForTimeout(80);
            const boton = await caja(page, "#cita");
            const cabecera = await caja(page, "[data-cabecera-de-chat]");
            const centro = (boton.left + boton.right) / 2;
            assert.equal(centro < (cabecera.left + cabecera.right) / 2, izquierda, "la maqueta pone el botón donde se pide");
            await page.click("#cita");
            await page.waitForSelector('[data-panel-del-banco="cita"]');
            await page.waitForTimeout(80);
            const panel = await caja(page, '[data-panel-del-banco="cita"]');
            t.diagnostic(`botón ${boton.left}→${boton.right}, panel ${panel.left}→${panel.right}`);

            if (ROTO && izquierda) {
                // La captura: crecía hacia la DERECHA desde el botón.
                assert.ok(Math.abs(panel.left - boton.left) <= 1, "el «antes» nacía en el filo izquierdo del botón");
                assert.ok(panel.right > boton.right + 20, "y crecía hacia la derecha");
                return;
            }
            if (ROTO) return;
            assert.ok(Math.abs(panel.right - boton.right) <= 1, `su filo derecho es el del botón (${panel.right} vs ${boton.right})`);
            assert.ok(panel.left < boton.left, "crece hacia la izquierda");
            assert.ok(panel.left >= cabecera.left, "sin salirse de la conversación");
            assert.ok(panel.top >= cabecera.bottom - 1, "nace bajo la cabecera");
        } finally {
            await cerrar();
        }
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. El «Contexto del lead» real
// ─────────────────────────────────────────────────────────────────────────────

async function abrirElContexto(page) {
    await page.click('button[title="Ver contexto del lead"]');
    await page.waitForSelector('[data-panel="panel-contexto-del-lead"]');
    await page.waitForTimeout(250);
}

test("el panel: los bloques en su orden y los tres de arriba sin texto de más", async (t) => {
    if (faltaNavegador(t)) return;
    const { page, cerrar } = await abrir({ id: "fu-1", texto: "Quiere el plan anual." });
    try {
        await abrirElContexto(page);
        const panel = '[data-panel="panel-contexto-del-lead"]';
        const titulos = await page.$$eval(`${panel} h3`, (ns) => ns.map((n) => n.textContent.trim()));
        const texto = await page.$eval(panel, (n) => n.textContent);
        t.diagnostic(`títulos: ${titulos.join(" · ")}`);

        const orden = ["Puntuación IA", "Estado del lead", "Etiquetas", "Follow-ups pendientes", "Síntesis IA", "Playbook de venta"];
        const posiciones = orden.map((o) => titulos.findIndex((x) => x.includes(o)));

        if (ROTO) {
            assert.notDeepEqual(
                posiciones,
                [...posiciones].sort((a, b) => a - b),
                "el «antes» no seguía el orden pedido",
            );
            assert.ok(texto.includes("PARRAFO_EXPLICATIVO_DEL_ESTADO"), "el «antes» pintaba el párrafo del estado");
            assert.ok(/3 pendientes/.test(texto), "el «antes» repetía «pendientes» debajo del título");
            return;
        }
        assert.ok(posiciones.every((p) => p >= 0), `faltan bloques: ${titulos}`);
        assert.deepEqual(posiciones, [...posiciones].sort((a, b) => a - b), `el orden no es el pedido: ${titulos}`);
        assert.ok(!texto.includes("PARRAFO_EXPLICATIVO_DEL_ESTADO"), "el estado va sin su párrafo explicativo");
        assert.ok(!/pendiente(s)?\s*$/m.test(texto.replace("Follow-ups pendientes", "")), "«pendiente» no se repite");

        // Estado: solo la etiqueta. Follow-ups: el número a la DERECHA del título.
        const estado = await page.$eval(`${panel} [data-bloque="estado"]`, (n) => n.textContent.trim());
        assert.equal(estado, "Estado del leadCaliente");
        const titulo = await caja(page, `${panel} [data-bloque="seguimientos"] h3`);
        const numero = await caja(page, `${panel} [data-numero-de-seguimientos]`);
        const bloque = await caja(page, `${panel} [data-bloque="seguimientos"]`);
        assert.equal(await page.$eval(`${panel} [data-numero-de-seguimientos]`, (n) => n.textContent), "3");
        assert.ok(numero.left > titulo.right, "el número va a la derecha del título");
        assert.ok(Math.abs(numero.right - bloque.right) <= 1, "alineado al borde derecho");
        assert.ok(Math.abs(numero.top - titulo.top) <= 6, "en la misma línea");
        // Etiquetas: solo las etiquetas.
        const etiquetas = await page.$eval(`${panel} [data-bloque="etiquetas"]`, (n) => n.textContent.trim());
        assert.equal(etiquetas, "EtiquetasVIP");
    } finally {
        await cerrar();
    }
});

for (const caso of [
    { nombre: "con seguimiento: ACTUALIZA el suyo", sintesis: { id: "fu-9", texto: "Texto viejo" }, espera: ["actualizar", "fu-9", "Texto nuevo"] },
    { nombre: "sin seguimiento: CREA una manual", sintesis: null, espera: ["crear", 77, "Texto nuevo"] },
]) {
    test(`la síntesis se edita y se guarda en el propio panel — ${caso.nombre}`, async (t) => {
        if (faltaNavegador(t)) return;
        const { page, cerrar } = await abrir(caso.sintesis);
        try {
            await abrirElContexto(page);
            const panel = '[data-panel="panel-contexto-del-lead"]';
            const editar = await page.$(`${panel} [data-editar-sintesis]`);
            if (ROTO) {
                assert.equal(editar, null, "el «antes» no dejaba editar la síntesis en el panel");
                return;
            }
            assert.ok(editar, "hay un botón de editar la síntesis");
            await editar.click();
            await page.fill(`${panel} [data-texto-sintesis]`, "   ");
            assert.ok(
                await page.$eval(`${panel} [data-guardar-sintesis]`, (b) => b.disabled),
                "vacía no se guarda",
            );
            await page.fill(`${panel} [data-texto-sintesis]`, "Texto nuevo");
            await page.click(`${panel} [data-guardar-sintesis]`);
            await page.waitForTimeout(200);
            const llamadas = await page.evaluate(() => window.__llamadas.filter((l) => l[0] !== "leer"));
            assert.deepEqual(llamadas, [caso.espera]);
            const texto = await page.$eval(`${panel} [data-bloque="sintesis"]`, (n) => n.textContent);
            assert.ok(texto.includes("Texto nuevo"), "tras guardar se ve lo guardado");
            assert.equal(await page.$(`${panel} [data-texto-sintesis]`), null, "y se cierra la edición");
            assert.equal(await page.$("[role=dialog]:not([data-panel])"), null, "sin ninguna ventana emergente");
        } finally {
            await cerrar();
        }
    });
}
