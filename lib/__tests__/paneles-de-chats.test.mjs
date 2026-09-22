/**
 * Los paneles de Chats: UNO a la vez, todos por la DERECHA, y los menús de la
 * cabecera colgando de SU botón.
 *
 * Los tres fallos de las capturas del 22-09:
 *
 * 1. La ficha de Contacto y «Nueva tarea» abiertas a la vez. La ficha no
 *    estaba en la exclusión de los paneles laterales, y una regla de CSS la
 *    ponía ENCIMA de la conversación mientras hubiera un panel abierto: se veía
 *    a la izquierda de la conversación y la tarea a la derecha.
 * 2. El menú de Acciones y el panel de Registros del lead cruzando la
 *    conversación de lado a lado. `ChatHeader` pinta Macros DOS veces —la fila
 *    del móvil y la de escritorio— y la medida cogía la primera, que en
 *    escritorio está escondida (0×0 en el origen): el ancho salía de la
 *    cabecera entera.
 * 3. Y aun con el ancho bien, el panel se llevaba al filo derecho de la
 *    cabecera, no al de su botón.
 *
 * `MODO=roto` construye el arnés con el código de `ANTES_REF` y AFIRMA los
 * fallos. Se levanta con `scripts/banco-paneles-de-chats.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
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
const ANTES_REF = process.env.ANTES_REF || "bd7f636";
const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..", "..");
const HARNESS = join(AQUI, ".compilado", "harness-paneles-de-chats.js");
const DIR_CSS = join(RAIZ, ".next", "static", "css");
const CSS = fs.existsSync(DIR_CSS)
    ? fs.readdirSync(DIR_CSS).filter((f) => f.endsWith(".css")).map((f) => fs.readFileSync(join(DIR_CSS, f), "utf8")).join("\n")
    : "";

/** El fichero tal como está en el modo que toca: el árbol, o ANTES_REF. */
function leer(fichero) {
    if (!ROTO) return fs.readFileSync(join(RAIZ, fichero), "utf8");
    return execFileSync("git", ["show", `${ANTES_REF}:${fichero}`], { cwd: RAIZ, encoding: "utf8" });
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. El barrido del código real
// ─────────────────────────────────────────────────────────────────────────────

test("la ficha de Contacto entra en la exclusión, sin reservar la franja", () => {
    const main = leer("app/(root)/chats/_components/chat-main.tsx");
    const entra = /usePanelLateral\(\s*PANEL_DE_LA_FICHA[\s\S]*?reservar:\s*false/.test(main);
    if (ROTO) {
        assert.equal(entra, false, "el «antes» no tenía la ficha en la exclusión");
        return;
    }
    assert.ok(entra, "chat-main tiene que llamar a usePanelLateral(PANEL_DE_LA_FICHA, …, { reservar: false })");
});

test("«Enviar al equipo» es un panel lateral, no un modal", () => {
    const f = leer("components/chat-equipo/CompartirConElEquipo.tsx");
    const esPanel = /<PanelLateral[\s\S]*?PANEL_DE_ENVIAR_AL_EQUIPO/.test(f);
    const esModal = /<Dialog\b/.test(f);
    if (ROTO) {
        assert.ok(esModal && !esPanel, "el «antes» era un Dialog centrado");
        return;
    }
    assert.ok(esPanel, "tiene que ser un PanelLateral con su id");
    assert.ok(!esModal, "y sin Dialog: dos formas de abrirse es una de más");
});

test("ninguna regla de CSS pone la ficha encima de la conversación", () => {
    const css = leer("app/globals.css");
    const superpone = /data-panel-lateral="abierto"\]\s*\[data-ficha-de-contacto\]/.test(css);
    if (ROTO) {
        assert.ok(superpone, "el «antes» la superponía: salía a la IZQUIERDA de la conversación");
        return;
    }
    assert.ok(!superpone, "con esa regla la ficha sale por la izquierda y el panel por la derecha");
});

// ─────────────────────────────────────────────────────────────────────────────
// 2 y 3. En Chromium
// ─────────────────────────────────────────────────────────────────────────────

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

async function abrirNavegador(ventana) {
    const server = await levantar();
    const navegador = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined });
    const page = await navegador.newPage({ viewport: { width: ventana, height: 900 } });
    const errores = [];
    page.on("pageerror", (e) => errores.push(String(e)));
    await page.goto(`http://127.0.0.1:${server.address().port}/${ROTO ? "?modo=roto" : ""}`);
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

for (const ventana of [1440, 1280, 1024]) {
    test(`a ${ventana}: la ficha y la tarea no se quedan abiertas a la vez, y salen por la derecha`, async (t) => {
        if (faltaNavegador(t)) return;
        const { page, cerrar } = await abrirNavegador(ventana);
        try {
            await page.evaluate(() => window.abrir("ficha", true));
            await page.waitForTimeout(60);
            const ficha = await caja(page, "[data-ficha-de-contacto]");
            assert.ok(ficha, "la ficha se abre");

            await page.evaluate(() => window.abrir("tarea", true));
            await page.waitForTimeout(700);
            const estado = await page.evaluate(() => window.estado());
            const hoja = await caja(page, `[data-panel="panel-nueva-tarea"]`);

            if (ROTO) {
                assert.deepEqual(estado, { ficha: true, tarea: true }, "el «antes» dejaba las dos abiertas");
                return;
            }
            assert.deepEqual(estado, { ficha: false, tarea: true }, "abrir la tarea tiene que cerrar la ficha");
            assert.equal(hoja.right, ventana, "la tarea sale pegada al borde derecho");
            assert.equal(ficha.right, ventana, "y la ficha salía por el mismo lado");

            // Y al revés: abrir la ficha cierra la tarea.
            await page.evaluate(() => window.abrir("ficha", true));
            await page.waitForTimeout(700);
            assert.deepEqual(await page.evaluate(() => window.estado()), { ficha: true, tarea: false });
            const reservada = await page.evaluate(() => document.documentElement.getAttribute("data-panel-lateral"));
            assert.equal(reservada, null, "la ficha es un hermano del flex: no reserva la franja");
        } finally {
            await cerrar();
        }
    });

    for (const [id, nombre] of [["acciones", "Acciones"], ["registros", "Registros del lead"]]) {
        test(`a ${ventana}: el panel de ${nombre} cuelga de SU botón y crece hacia la izquierda`, async (t) => {
            if (faltaNavegador(t)) return;
            const { page, cerrar } = await abrirNavegador(ventana);
            try {
                const boton = await caja(page, `#${id}`);
                const cabecera = await caja(page, "[data-cabecera-de-chat]");
                const macros = await caja(page, "#macros");
                await page.click(`#${id}`);
                await page.waitForSelector(`[data-panel-del-banco="${id}"]`);
                await page.waitForTimeout(80);
                const panel = await caja(page, `[data-panel-del-banco="${id}"]`);
                t.diagnostic(`${id}: botón ${boton.left}→${boton.right}, panel ${panel.left}→${panel.right}, cabecera ${cabecera.left}→${cabecera.right}`);

                if (ROTO) {
                    // Las capturas: el panel cruzaba la conversación entera.
                    assert.ok(
                        panel.width > (cabecera.right - cabecera.left) * 0.8,
                        `el «antes» cruzaba la cabecera; midió ${panel.width}`,
                    );
                    return;
                }
                assert.ok(Math.abs(panel.right - boton.right) <= 1, `su filo derecho es el del botón (${panel.right} vs ${boton.right})`);
                assert.ok(panel.left >= cabecera.left, `no se sale de la conversación (${panel.left} < ${cabecera.left})`);
                assert.ok(panel.left < boton.left, "crece hacia la izquierda");
                // El ancho de la fila de Macros y Acciones, con su suelo de
                // guarda (`ANCHO_MINIMO_DE_LA_CABECERA`, 176) — no la cabecera.
                const esperado = Math.max(176, cabecera.right - macros.left);
                assert.ok(
                    Math.abs(panel.width - esperado) <= 1,
                    `mide la fila de Macros y Acciones (${panel.width} vs ${esperado}), no la cabecera entera`,
                );
                assert.ok(panel.top >= cabecera.bottom - 1, "nace bajo la cabecera");
            } finally {
                await cerrar();
            }
        });
    }
}
