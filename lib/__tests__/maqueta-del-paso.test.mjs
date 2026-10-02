/**
 * La MAQUETA del paso (`/ia/maqueta`) con dos acciones nuevas —«Agregar caso»
 * y «Transición»— antes de construir su lógica.
 *
 * Lo que se comprueba:
 *
 *   1. **El orden de arriba abajo** es el del encargo: plantilla, ejecutar
 *      flujo, respuesta o casos, transición, nota interna. En la regla y en lo
 *      que la pantalla PINTA (medido en píxeles, no leído).
 *   2. **El menú** ofrece las de hoy más las dos nuevas, marcadas «Nuevo».
 *   3. **Los campos**: un caso tiene Escenario («¿Cuándo aplica este caso?») y
 *      Respuesta; la transición, la pregunta y una lista con los pasos ya
 *      creados por nombre, sin el propio.
 *   4. **Es solo maqueta**: el editor de verdad (menú real, guardado, prompt)
 *      no sabe nada de esto.
 *
 * `MODO=roto` lee `ANTES_REF` y afirma que no había maqueta ni acciones.
 * Se levanta con `scripts/banco-maqueta-del-paso.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROTO = process.env.MODO === "roto";
const ANTES = process.env.ANTES_REF ?? "7a0d1ac";
const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..", "..");

const MAQUETA = "app/(root)/ia/maqueta/MaquetaDelPaso.tsx";
const MENU_REAL = "app/(root)/ai/_components/FunctionSelector.tsx";
const RENDERER = "app/(root)/ai/_components/action-steeps/ElementRenderer.tsx";
const BUILDERS = "app/(root)/ai/_components/helpers/actionsBuilders.ts";

const leer = (rel) => {
    if (!ROTO) return fs.existsSync(join(RAIZ, rel)) ? fs.readFileSync(join(RAIZ, rel), "utf8") : "";
    try {
        return execSync(`git show ${ANTES}:${JSON.stringify(rel)}`, { cwd: RAIZ, stdio: ["ignore", "pipe", "ignore"] }).toString();
    } catch {
        return "";
    }
};

if (ROTO) {
    test("ROTO: en el «antes» no existía la maqueta ni las acciones", () => {
        assert.equal(leer(MAQUETA), "", "la maqueta ya existía");
        assert.equal(leer("lib/maqueta-del-paso.ts"), "");
        assert.equal(leer("app/(root)/ai/_components/action-steeps/CasoCard.tsx"), "");
        assert.equal(leer("app/(root)/ai/_components/action-steeps/TransicionCard.tsx"), "");
        assert.doesNotMatch(leer(MENU_REAL), /Agregar caso|Transición/);
    });
} else {
    const m = await import("./.compilado/maqueta-del-paso.mjs");

    test("el orden: plantilla, flujo, respuesta o casos, transición, nota", () => {
        assert.deepEqual(
            m.ORDEN_DE_LA_MAQUETA.map((s) => s.elementos),
            [["plantilla"], ["ejecutar_flujo"], ["respuesta", "caso"], ["transicion"], ["nota_interna"]],
        );
        assert.deepEqual(m.ORDEN_DE_LA_MAQUETA.map((s) => s.puesto), [1, 2, 3, 4, 5]);
        assert.equal(m.puestoDe("caso"), m.puestoDe("respuesta"));
    });

    test("un caso nuevo cae debajo de los otros casos y encima de la transición", () => {
        const lista = [
            { id: "a", tipo: "ejecutar_flujo" },
            { id: "b", tipo: "caso" },
            { id: "c", tipo: "transicion" },
            { id: "d", tipo: "nota_interna" },
        ];
        const r = m.insertarEnSuPuesto(lista, { id: "x", tipo: "caso" });
        assert.deepEqual(r.map((e) => e.id), ["a", "b", "x", "c", "d"]);
        // Una transición en un paso que solo tiene nota: antes de la nota.
        assert.deepEqual(
            m.insertarEnSuPuesto([{ id: "n", tipo: "nota_interna" }], { id: "t", tipo: "transicion" }).map((e) => e.id),
            ["t", "n"],
        );
        // Al final si no hay nada detrás.
        assert.deepEqual(m.insertarEnSuPuesto([], { id: "f", tipo: "ejecutar_flujo" }).map((e) => e.id), ["f"]);
    });

    test("respuesta y casos se excluyen; transición, una por paso", () => {
        assert.equal(m.quitaAlAgregar("caso"), "respuesta");
        assert.equal(m.quitaAlAgregar("respuesta"), "caso");
        assert.equal(m.quitaAlAgregar("transicion"), null);
        assert.equal(m.esUnica("transicion"), true);
        assert.equal(m.esUnica("caso"), false, "los casos se repiten");
    });

    test("el menú: las cinco de hoy y las dos nuevas, marcadas", () => {
        const todas = m.MENU_DE_LA_MAQUETA.flatMap((g) => g.opciones);
        assert.deepEqual(
            todas.filter((o) => !o.nueva).map((o) => o.rotulo),
            ["Ejecutar flujo", "Notificar asesor", "Leer Google Sheets", "Agregar respuesta", "Agregar nota interna"],
        );
        assert.deepEqual(todas.filter((o) => o.nueva).map((o) => o.rotulo), ["Transición", "Agregar caso"]);
        // Las de hoy dicen lo mismo que el menú real.
        const real = leer(MENU_REAL);
        for (const o of todas.filter((x) => !x.nueva)) assert.match(real, new RegExp(`${o.icono} ${o.rotulo}`), o.rotulo);
    });

    test("los campos: Escenario y Respuesta; la pregunta de la transición", () => {
        assert.equal(m.CAMPOS_DEL_CASO.escenario.rotulo, "Escenario");
        assert.equal(m.CAMPOS_DEL_CASO.escenario.placeholder, "¿Cuándo aplica este caso?");
        assert.equal(m.CAMPOS_DEL_CASO.respuesta.rotulo, "Respuesta");
        assert.equal(m.CAMPO_DE_LA_TRANSICION.pregunta, "¿A qué paso pasa cuando se completen los datos de este paso?");
    });

    test("la lista de la transición: los pasos por nombre, sin el propio", () => {
        const r = m.pasosParaLaTransicion(
            [{ id: "a", titulo: "Bienvenida" }, { id: "b", titulo: "Datos" }, { id: "c", titulo: "  " }],
            "b",
        );
        assert.deepEqual(r, [{ id: "a", nombre: "Bienvenida" }, { id: "c", nombre: "Paso 3" }]);
    });

    test("es solo maqueta: el editor de verdad no sabe nada de esto", () => {
        for (const f of [MENU_REAL, RENDERER, BUILDERS]) {
            const t = leer(f);
            assert.ok(t.length > 0, f);
            assert.doesNotMatch(t, /maqueta-del-paso|CasoCard|TransicionCard/, `${f} no puede usar la maqueta`);
        }
        assert.doesNotMatch(leer(MAQUETA), /@\/actions\//, "la maqueta no llama a ninguna acción");
    });

    // ── La pantalla pintada ──────────────────────────────────────────────
    let chromium = null;
    try {
        ({ chromium } = require("playwright"));
    } catch {}
    const DIR_CSS = join(RAIZ, ".next", "static", "css");
    const CSS = fs.existsSync(DIR_CSS)
        ? fs.readdirSync(DIR_CSS).filter((f) => f.endsWith(".css")).map((f) => fs.readFileSync(join(DIR_CSS, f), "utf8")).join("\n")
        : null;
    const HARNESS = join(AQUI, ".compilado", "harness-maqueta-del-paso.js");

    async function abrir(ancho) {
        const bundle = fs.readFileSync(HARNESS);
        const server = http.createServer((req, res) => {
            if ((req.url ?? "/").startsWith("/harness.js")) {
                res.writeHead(200, { "Content-Type": "application/javascript" });
                return res.end(bundle);
            }
            res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
            res.end(
                `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">` +
                    `<style>${CSS} *{animation:none!important;transition:none!important}html,body{margin:0;height:100%}` +
                    `#pantalla{display:flex;flex-direction:column;height:100vh}</style></head>` +
                    `<body><div id="pantalla"></div><script>window.process={env:{}}</script>` +
                    `<script type="module" src="/harness.js"></script></body></html>`,
            );
        });
        await new Promise((r) => server.listen(0, r));
        const navegador = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined });
        const page = await (await navegador.newContext({ viewport: { width: ancho, height: 900 } })).newPage();
        const errores = [];
        page.on("pageerror", (e) => errores.push(String(e)));
        await page.goto(`http://127.0.0.1:${server.address().port}/`);
        await page.waitForFunction("window.listo === true", { timeout: 20000 }).catch((e) => {
            throw new Error(`${e.message}\n${errores.join(" | ")}`);
        });
        await page.waitForSelector("[data-bloque='p3'] [data-elemento='caso']");
        assert.equal(errores.join(" | "), "");
        return { page, cerrar: async () => (await navegador.close(), server.close()) };
    }

    const puede = (t) => {
        if (!chromium || !CSS) {
            t.skip("sin playwright o sin el CSS del build");
            return false;
        }
        return true;
    };

    for (const ancho of [1440, 1024, 390]) {
        test(`pintado a ${ancho}: el orden de arriba abajo, en píxeles`, async (t) => {
            if (!puede(t)) return;
            const { page, cerrar } = await abrir(ancho);
            try {
                for (const [paso, esperado] of [
                    ["p2", ["plantilla", "ejecutar_flujo", "respuesta", "transicion", "nota_interna"]],
                    ["p3", ["plantilla", "ejecutar_flujo", "caso", "caso", "caso", "transicion", "nota_interna"]],
                ]) {
                    const orden = await page.$$eval(`[data-bloque='${paso}'] [data-elemento]`, (els) =>
                        els
                            .map((e) => ({ t: e.getAttribute("data-elemento"), y: e.getBoundingClientRect().top }))
                            .sort((a, b) => a.y - b.y)
                            .map((e) => e.t),
                    );
                    assert.deepEqual(orden, esperado, paso);
                }
                const desborda = await page.evaluate(() => {
                    const c = document.querySelector("[data-maqueta-del-paso]");
                    return c.scrollWidth > c.clientWidth + 1;
                });
                assert.equal(desborda, false, "la pantalla no desborda a lo ancho");
            } finally {
                await cerrar();
            }
        });
    }

    test("los campos y la lista de la transición, pintados", async (t) => {
        if (!puede(t)) return;
        const { page, cerrar } = await abrir(1440);
        try {
            const caso = page.locator("[data-bloque='p3'] [data-tarjeta-caso]").first();
            await caso.locator("text=CASO 1").waitFor();
            assert.equal(await caso.locator("[data-campo='escenario']").getAttribute("placeholder"), "¿Cuándo aplica este caso?");
            assert.ok(await caso.locator("text=Escenario").count());
            assert.ok(await caso.locator("label:has-text('Respuesta')").count());

            const tr = page.locator("[data-bloque='p3'] [data-tarjeta-transicion]");
            await tr.locator("text=¿A qué paso pasa cuando se completen los datos de este paso?").waitFor();
            await tr.locator("[data-campo='destino']").click();
            const opciones = await page.$$eval("[role='option']", (o) => o.map((x) => x.textContent.trim()));
            assert.deepEqual(opciones, ["Bienvenida", "Pedir datos de envío", "Cierre"], "sin el propio paso");
        } finally {
            await cerrar();
        }
    });

    test("el menú: las dos nuevas, y agregar un caso lo pone en su puesto", async (t) => {
        if (!puede(t)) return;
        const { page, cerrar } = await abrir(1440);
        try {
            const p3 = page.locator("[data-bloque='p3']");
            await p3.locator("[data-agregar-accion]").click();
            for (const r of ["Ejecutar flujo", "Notificar asesor", "Leer Google Sheets", "Transición", "Agregar respuesta", "Agregar caso", "Agregar nota interna"]) {
                await page.locator(`[role='option']:has-text('${r}')`).waitFor();
            }
            assert.equal(await page.locator("[data-opcion='caso'] >> text=Nuevo").count(), 1);
            assert.equal(await page.locator("[data-opcion='transicion'] >> text=Nuevo").count(), 1);
            await page.locator("[data-opcion='caso']").click();
            const orden = await p3.locator("[data-elemento]").evaluateAll((els) => els.map((e) => e.getAttribute("data-elemento")));
            assert.deepEqual(orden, ["plantilla", "ejecutar_flujo", "caso", "caso", "caso", "caso", "transicion", "nota_interna"]);
            assert.ok(await p3.locator("text=CASO 4").count());
        } finally {
            await cerrar();
        }
    });
}
