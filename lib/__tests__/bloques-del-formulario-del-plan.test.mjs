/**
 * El formulario «Página de detalle» de un plan va en el MISMO orden que su
 * página pública, y sus bloques grandes se mueven enteros.
 *
 * 1. **La regla** (pura, `lib/bloques-del-formulario-del-plan.ts`): soltar,
 *    subir y bajar, dónde se pinta la raya de la caída —y que dice EXACTAMENTE
 *    dónde queda el bloque al soltar— y el bloque más cercano a la altura del
 *    puntero cuando miden muy distinto.
 * 2. **Un barrido** del código: el formulario pinta sus bloques con `orden`,
 *    lo que flota al arrastrar sale del diálogo por un portal, nadie usa
 *    `scrollIntoView`, y Panel › Planes le pasa las funciones que salen.
 * 3. **La pestaña de VERDAD en Chromium**, dentro del MISMO diálogo que la
 *    monta Panel › Planes y sobre el CSS del build, a 1440 y a 390: con un
 *    orden guardado distinto al de fábrica el formulario sale en ese orden;
 *    mover un bloque con sus flechas, con el índice, arrastrándolo con el ratón
 *    y con el teclado lo mueve en los dos sitios; pulsar un nombre del índice
 *    lleva al bloque; y guardar manda el orden nuevo.
 *
 * `MODO=roto` pinta la pestaña de `ANTES_REF` (165a431, pinchado a un commit:
 * nunca `origin/main`) y AFIRMA el fallo: el formulario salía en el orden fijo
 * de siempre aunque la página tuviera otro, sin forma de mover un bloque
 * entero y sin el bloque «Qué incluye».
 *
 * Se levanta con `scripts/banco-bloques-del-formulario.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
let chromium = null;
try {
    ({ chromium } = require("playwright"));
} catch {
    // Sin navegador no se finge: se salta y se dice.
}

const ROTO = process.env.MODO === "roto";
const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..", "..");
const COMPILADO = join(AQUI, ".compilado", "bloques-del-formulario");
const HARNESS = join(COMPILADO, "harness.js");
const ANTES_REF = process.env.ANTES_REF ?? "165a431";
const PESTANA = "app/(root)/(protected)/admin/planes/_components/PlanDetailTab.tsx";
const PLANES = "app/(root)/(protected)/admin/planes/_components/PlanesMain.tsx";
const REGLA = "lib/bloques-del-formulario-del-plan.ts";

/** Un orden guardado DISTINTO al de fábrica: es el caso que se venía a arreglar. */
// Con «Todo incluido, sin sorpresas» (`incluido`), el bloque que la página
// tiene desde entonces: la regla de hoy lo añade a cualquier orden guardado.
const ORDEN_GUARDADO = ["preguntas", "video", "funciones", "comenzar", "incluido", "capacidad", "paraquien"];
const ORDEN_DE_FABRICA = ["video", "paraquien", "capacidad", "funciones", "preguntas", "comenzar"];

const crudo = (f) => fs.readFileSync(join(RAIZ, f), "utf8");
/** Sin comentarios: el código lleva escrito al lado por qué NO usa algo, y
 *  buscarlo en el texto crudo haría que la explicación tumbara al banco. */
const sinComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'])\/\/.*$/gm, "$1");
const deAntes = (f) => {
    try {
        execFileSync("git", ["cat-file", "-e", `${ANTES_REF}:${f}`], { cwd: RAIZ, stdio: "ignore" });
        return execFileSync("git", ["show", `${ANTES_REF}:${f}`], { encoding: "utf8", cwd: RAIZ, stdio: ["ignore", "pipe", "ignore"] });
    } catch {
        return null;
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// 1 y 2. La regla y el barrido
// ─────────────────────────────────────────────────────────────────────────────

if (ROTO) {
    test("ANTES: no había regla para mover los bloques del formulario", () => {
        assert.ok(deAntes(PESTANA), `no se pudo leer ${ANTES_REF}`);
        assert.equal(deAntes(REGLA), null, "en el «antes» la regla no existía");
        const antes = deAntes(PESTANA);
        assert.ok(!/data-bloque-del-formulario/.test(antes), "en el «antes» los bloques del formulario no se movían");
        assert.ok(!/funcionesQueSalen/.test(antes), "en el «antes» el formulario no tenía «Qué incluye»");
    });
} else {
    const regla = await import(pathToFileURL(join(COMPILADO, "bloques-del-formulario-del-plan.js")).href);
    const { elOrdenAlSoltar, elOrdenAlMover, laMarcaDeLaCaida, elMasCercanoEnVertical } = regla;

    test("soltar: el bloque ocupa el sitio del de debajo, y sin cambio devuelve la MISMA lista", () => {
        const o = ["a", "b", "c", "d"];
        assert.deepEqual(elOrdenAlSoltar(o, "a", "c"), ["b", "c", "a", "d"], "bajar");
        assert.deepEqual(elOrdenAlSoltar(o, "d", "b"), ["a", "d", "b", "c"], "subir");
        assert.equal(elOrdenAlSoltar(o, "a", "a"), o, "sobre sí mismo");
        assert.equal(elOrdenAlSoltar(o, "a", null), o, "sin destino");
        assert.equal(elOrdenAlSoltar(o, "a", "z"), o, "un destino que no está");
        assert.equal(elOrdenAlSoltar(o, "z", "a"), o, "un bloque que no está");
        assert.deepEqual(o, ["a", "b", "c", "d"], "no toca la lista que recibe");
    });

    test("subir y bajar: un puesto, y en el borde no se mueve", () => {
        const o = ["a", "b", "c"];
        assert.deepEqual(elOrdenAlMover(o, "b", -1), ["b", "a", "c"]);
        assert.deepEqual(elOrdenAlMover(o, "b", 1), ["a", "c", "b"]);
        assert.equal(elOrdenAlMover(o, "a", -1), o);
        assert.equal(elOrdenAlMover(o, "c", 1), o);
        assert.equal(elOrdenAlMover(o, "z", 1), o);
    });

    test("la raya de la caída dice EXACTAMENTE dónde queda el bloque al soltar", () => {
        const o = ["a", "b", "c", "d", "e"];
        for (const activo of o) {
            for (const sobre of o) {
                const marca = laMarcaDeLaCaida(o, activo, sobre);
                if (activo === sobre) {
                    assert.equal(marca, null);
                    continue;
                }
                const nuevo = elOrdenAlSoltar(o, activo, sobre);
                const ia = nuevo.indexOf(activo);
                const is = nuevo.indexOf(sobre);
                assert.equal(marca.bloque, sobre);
                assert.equal(
                    marca.lado === "antes" ? ia + 1 === is : ia === is + 1,
                    true,
                    `${activo} sobre ${sobre}: la raya dice «${marca.lado}» y queda en ${nuevo.join("")}`,
                );
            }
        }
        assert.equal(laMarcaDeLaCaida(o, null, "a"), null);
        assert.equal(laMarcaDeLaCaida(o, "a", null), null);
    });

    test("el más cercano en vertical: el que contiene la altura; en un hueco, el borde más cercano", () => {
        const cajas = [
            { id: "corto", top: 0, bottom: 40 },
            { id: "largo", top: 60, bottom: 900 },
            { id: "final", top: 920, bottom: 960 },
        ];
        assert.equal(elMasCercanoEnVertical(cajas, 20), "corto");
        assert.equal(elMasCercanoEnVertical(cajas, 61), "largo", "el principio de un bloque largo es suyo, no del de al lado");
        assert.equal(elMasCercanoEnVertical(cajas, 880), "largo");
        assert.equal(elMasCercanoEnVertical(cajas, 45), "corto", "en el hueco, el borde más cercano");
        assert.equal(elMasCercanoEnVertical(cajas, 50), "corto", "a igualdad, el de arriba");
        assert.equal(elMasCercanoEnVertical(cajas, 5000), "final");
        assert.equal(elMasCercanoEnVertical([], 10), null);
    });

    test("barrido: el formulario se pinta con `orden`, flota por un portal y nadie usa scrollIntoView", () => {
        const s = sinComentarios(crudo(PESTANA));
        assert.match(s, /orden\.map\(\(clave, i\) => \(\s*<BloqueOrdenable/, "los bloques del formulario salen de `orden`");
        assert.match(s, /createPortal\(\s*<DragOverlay/, "lo que flota sale del diálogo por un portal");
        assert.ok(!/scrollIntoView/.test(s), "nada de scrollIntoView: movería también la página entera");
        for (const regla of ["elOrdenAlSoltar", "elOrdenAlMover", "laMarcaDeLaCaida", "elMasCercanoEnVertical"]) {
            assert.match(s, new RegExp(`\\b${regla}\\(`), `la pestaña usa ${regla}`);
        }
        assert.match(crudo(PLANES), /funcionesQueSalen=\{lasFuncionesQueSeEnsenan\(/, "Panel › Planes le pasa las funciones que salen");
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. La pestaña de VERDAD en Chromium
// ─────────────────────────────────────────────────────────────────────────────

const cssDir = join(RAIZ, ".next", "static", "css");
const hayNavegador = chromium && fs.existsSync(HARNESS) && fs.existsSync(cssDir);
const conNavegador = hayNavegador ? test : test.skip;
if (!hayNavegador) console.log("# sin navegador o sin arnés: se saltan las pruebas de la pantalla");

async function servir() {
    const css = fs.readdirSync(cssDir).filter((f) => f.endsWith(".css")).map((f) => fs.readFileSync(join(cssDir, f), "utf8")).join("\n");
    const js = fs.readFileSync(HARNESS, "utf8");
    const html =
        `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">` +
        `<style>${css}</style></head><body><div id="app"></div><script type="module" src="/h.js"></script></body></html>`;
    const srv = http.createServer((q, res) => {
        if (q.url === "/h.js") {
            res.setHeader("content-type", "text/javascript");
            res.end(js);
        } else {
            res.setHeader("content-type", "text/html");
            res.end(html);
        }
    });
    await new Promise((ok) => srv.listen(0, ok));
    return { srv, url: `http://127.0.0.1:${srv.address().port}/` };
}

/**
 * El orden en que se VEN los bloques del formulario, de arriba abajo, medido
 * por lo que edita cada uno: esas marcas están en la pestaña de hoy y en la de
 * antes, así que la misma medida vale en los dos modos. «Qué incluye» solo
 * existe en la de hoy.
 */
const elOrdenQueSeVe = (pag) =>
    pag.evaluate(() => {
        const marcas = {
            video: '[data-campo-del-detalle="videoUrl"]',
            paraquien: '[data-campo-del-detalle="paraQuien"]',
            capacidad: "[data-agregar-recuadro]",
            funciones: "[data-funciones-que-salen], [data-sin-funciones]",
            preguntas: "[data-agregar-pregunta]",
            incluido: '[data-campo-del-detalle="todoIncluidoTitulo"]',
        };
        const tops = [];
        for (const [clave, sel] of Object.entries(marcas)) {
            const n = document.querySelector(sel);
            if (n) tops.push([clave, n.getBoundingClientRect().top]);
        }
        // El texto del botón principal ya no se escribe (es «Comenzar con el plan
        // X»): el bloque se reconoce por su enlace; en el «antes», por el campo.
        const cta =
            document.querySelector('[data-campo-del-detalle="ctaButtonUrl"]') ??
            [...document.querySelectorAll("input")].find((i) => i.value === "Quiero este plan");
        if (cta) tops.push(["comenzar", cta.getBoundingClientRect().top]);
        return tops.sort((a, b) => a[1] - b[1]).map(([c]) => c);
    });

const elIndice = (pag) => pag.$$eval("[data-bloque-del-orden]", (n) => n.map((x) => x.getAttribute("data-bloque-del-orden")));
const losBloques = (pag) => pag.$$eval("[data-bloque-del-formulario]", (n) => n.map((x) => x.getAttribute("data-bloque-del-formulario")));

async function abrir(nav, w, h) {
    const pag = await nav.newPage({ viewport: { width: w, height: h } });
    const errores = [];
    pag.on("pageerror", (e) => errores.push(String(e)));
    await pag.addInitScript((orden) => {
        window.ordenGuardado = orden;
    }, ORDEN_GUARDADO);
    return { pag, errores };
}

async function cargar(pag, url) {
    await pag.goto(url);
    await pag.waitForFunction(() => window.listo === true);
    await pag.waitForSelector("[data-guardar-detalle]");
    // La carga del detalle es asíncrona: se espera a que el orden guardado llegue.
    await pag.waitForFunction(() => document.querySelector("[data-bloque-del-orden]")?.getAttribute("data-bloque-del-orden") === "preguntas", null, { timeout: 5000 }).catch(() => {});
    // Y a que el diálogo termine de entrar: mientras su animación corre, nada
    // está quieto, Playwright reintenta el clic desplazando el diálogo por su
    // cuenta y lo medido antes ya no vale.
    await pag.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));
}

/** Lleva el desplazador del diálogo para que `sel` quede a `aire` px de su borde de arriba. */
async function ponerArriba(pag, sel, aire = 40) {
    await pag.$eval(
        sel,
        (n, aire) => {
            let s = n.parentElement;
            while (s && !(/(auto|scroll)/.test(getComputedStyle(s).overflowY) && s.scrollHeight > s.clientHeight)) s = s.parentElement;
            if (!s) return;
            s.scrollTop += n.getBoundingClientRect().top - s.getBoundingClientRect().top - aire;
        },
        aire,
    );
}

if (ROTO) {
    conNavegador("ANTES: con otro orden en la página, el formulario seguía en el orden fijo", async () => {
        const { srv, url } = await servir();
        const nav = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined });
        try {
            const { pag, errores } = await abrir(nav, 1440, 900);
            await cargar(pag, url);
            assert.deepEqual(await elIndice(pag), ORDEN_GUARDADO, "el índice sí llevaba el orden de la página");
            const visto = await elOrdenQueSeVe(pag);
            assert.deepEqual(
                visto,
                ORDEN_DE_FABRICA.filter((c) => c !== "funciones"),
                "el formulario salía en el orden fijo, no en el de la página",
            );
            assert.notDeepEqual(visto, ORDEN_GUARDADO.filter((c) => c !== "funciones"), "y no coincidía con el de la página");
            assert.equal((await losBloques(pag)).length, 0, "ningún bloque del formulario se podía mover entero");
            assert.equal(await pag.$("[data-funciones-que-salen], [data-sin-funciones]"), null, "y no había bloque «Qué incluye»");
            // Mover en el índice no movía nada del formulario.
            await pag.click('[data-bloque-del-orden="preguntas"] [data-bajar-bloque]');
            assert.deepEqual((await elIndice(pag)).slice(0, 2), ["video", "preguntas"]);
            assert.deepEqual(await elOrdenQueSeVe(pag), visto, "el formulario se quedaba igual");
            assert.deepEqual(errores, []);
        } finally {
            await nav.close();
            srv.close();
        }
    });
} else {
    for (const [w, h] of [
        [1440, 900],
        [390, 844],
    ]) {
        conNavegador(`${w}: el formulario va en el orden de la página y sus bloques se mueven enteros`, async () => {
            const { srv, url } = await servir();
            const nav = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined });
            try {
                const { pag, errores } = await abrir(nav, w, h);
                await cargar(pag, url);

                // 1. Con un orden guardado distinto al de fábrica, el formulario sale en ESE orden.
                assert.deepEqual(await elIndice(pag), ORDEN_GUARDADO, "el índice");
                assert.deepEqual(await losBloques(pag), ORDEN_GUARDADO, "los bloques del formulario, en el DOM");
                assert.deepEqual(await elOrdenQueSeVe(pag), ORDEN_GUARDADO, "y en la pantalla, de arriba abajo");
                const funcs = await pag.$$eval("[data-funcion-que-sale]", (n) => n.map((x) => x.textContent.trim()));
                assert.deepEqual(
                    funcs.map((t) => t.replace(/^\d+/, "")),
                    ["Agente de IA entrenado con tu negocio", "Bandeja de chats con asignación", "CRM y embudos"],
                    "«Qué incluye» enseña las encendidas, en su orden",
                );
                const puestos = await pag.$$eval("[data-puesto-del-bloque]", (n) => n.map((x) => x.textContent.trim()));
                assert.deepEqual(puestos, ["1", "2", "3", "4", "5", "6", "7"], "cada bloque dice su puesto");
                assert.equal(await pag.$('[data-bloque-del-formulario="preguntas"] [data-subir-bloque-del-formulario]'), null, "el primero no sube: la flecha se quita");
                assert.equal(await pag.$('[data-bloque-del-formulario="paraquien"] [data-bajar-bloque-del-formulario]'), null, "el último no baja");

                // 2. Bajar con su flecha: se mueve en el formulario Y en el índice, y se queda quieto en la pantalla.
                await ponerArriba(pag, '[data-bloque-del-formulario="preguntas"]', 60);
                const antesDeBajar = await pag.$eval('[data-bloque-del-formulario="preguntas"]', (n) => n.getBoundingClientRect().top);
                await pag.click('[data-bloque-del-formulario="preguntas"] [data-bajar-bloque-del-formulario]');
                const tras1 = ["video", "preguntas", "funciones", "comenzar", "incluido", "capacidad", "paraquien"];
                assert.deepEqual(await losBloques(pag), tras1);
                assert.deepEqual(await elIndice(pag), tras1, "el índice sigue al formulario");
                assert.deepEqual(await elOrdenQueSeVe(pag), tras1);
                const trasBajar = await pag.$eval('[data-bloque-del-formulario="preguntas"]', (n) => n.getBoundingClientRect().top);
                assert.ok(Math.abs(trasBajar - antesDeBajar) <= 2, `${w}: el bloque movido se queda donde estaba (${antesDeBajar} → ${trasBajar})`);

                // 3. Subir desde el índice mueve el bloque del formulario.
                await ponerArriba(pag, "[data-orden-de-bloques]", 20);
                await pag.click('[data-bloque-del-orden="paraquien"] [data-subir-bloque]');
                const tras2 = ["video", "preguntas", "funciones", "comenzar", "incluido", "paraquien", "capacidad"];
                assert.deepEqual(await elIndice(pag), tras2);
                assert.deepEqual(await losBloques(pag), tras2, "el formulario sigue al índice");
                assert.deepEqual(await elOrdenQueSeVe(pag), tras2);

                // 4. Pulsar un nombre del índice lleva a su bloque y le da el foco.
                await pag.click('[data-ir-al-bloque="capacidad"]');
                await pag.waitForTimeout(700);
                const ir = await pag.evaluate(() => {
                    const b = document.querySelector('[data-bloque-del-formulario="capacidad"]');
                    const s = document.querySelector("[data-hueco-del-detalle]");
                    const rb = b.getBoundingClientRect();
                    const rs = s.getBoundingClientRect();
                    return { dentro: rb.top >= rs.top - 1 && rb.top <= rs.top + 40, foco: document.activeElement === b, top: rb.top, sTop: rs.top };
                });
                assert.ok(ir.dentro, `${w}: el bloque queda arriba del formulario (${JSON.stringify(ir)})`);
                assert.ok(ir.foco, `${w}: y con el foco`);

                // 5. Arrastrar con el ratón por el asa: «video» (el primero) cae debajo de «preguntas».
                await ponerArriba(pag, '[data-bloque-del-formulario="video"]', 30);
                const asa = await pag.$eval('[data-bloque-del-formulario="video"] [data-arrastrar-bloque-del-formulario]', (n) => {
                    const r = n.getBoundingClientRect();
                    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
                });
                const destino = await pag.$eval('[data-bloque-del-formulario="preguntas"]', (n) => {
                    const r = n.getBoundingClientRect();
                    return { y: r.top + Math.min(40, r.height / 2) };
                });
                assert.ok(destino.y < h - 20, `${w}: el destino se ve (${destino.y})`);
                await pag.mouse.move(asa.x, asa.y);
                await pag.mouse.down();
                for (let i = 1; i <= 12; i++) await pag.mouse.move(asa.x, asa.y + ((destino.y - asa.y) * i) / 12);
                await pag.waitForTimeout(100);
                const durante = await pag.evaluate(() => {
                    const flota = document.querySelector("[data-bloque-arrastrado]");
                    const r = flota?.getBoundingClientRect();
                    const marca = document.querySelector("[data-marca-de-caida]");
                    return {
                        flota: flota?.getAttribute("data-bloque-arrastrado") ?? null,
                        enElBody: !!flota && !flota.closest("[data-dialogo-del-plan]"),
                        dentro: !!r && r.left >= -1 && r.right <= window.innerWidth + 1 && r.height > 0 && r.height < 200,
                        marca: marca ? { lado: marca.getAttribute("data-marca-de-caida"), bloque: marca.closest("[data-bloque-del-formulario]")?.getAttribute("data-bloque-del-formulario") } : null,
                    };
                });
                assert.equal(durante.flota, "video", `${w}: flota lo que se arrastra`);
                assert.ok(durante.enElBody, `${w}: lo que flota sale del diálogo (si no, su transform lo descoloca)`);
                assert.ok(durante.dentro, `${w}: y se ve entero, como una tarjeta corta`);
                assert.deepEqual(durante.marca, { lado: "despues", bloque: "preguntas" }, `${w}: la raya dice dónde cae`);
                await pag.mouse.up();
                const tras3 = ["preguntas", "video", "funciones", "comenzar", "incluido", "paraquien", "capacidad"];
                assert.deepEqual(await losBloques(pag), tras3, `${w}: soltar mueve el bloque entero`);
                assert.deepEqual(await elIndice(pag), tras3);
                assert.deepEqual(await elOrdenQueSeVe(pag), tras3);
                assert.equal(await pag.$("[data-bloque-arrastrado]"), null, "lo que flota se va al soltar");
                assert.equal(await pag.$("[data-marca-de-caida]"), null, "y la raya también");

                // 6. Con el teclado por el asa: espacio, flecha abajo, espacio.
                await ponerArriba(pag, '[data-bloque-del-formulario="funciones"]', 60);
                await pag.focus('[data-bloque-del-formulario="funciones"] [data-arrastrar-bloque-del-formulario]');
                await pag.keyboard.press("Space");
                await pag.waitForTimeout(150);
                await pag.keyboard.press("ArrowDown");
                // El sensor desplaza el diálogo con suavidad: se suelta cuando la raya
                // ya dice dónde cae, como haría quien lo está mirando.
                await pag.waitForFunction(() => {
                    const m = document.querySelector("[data-marca-de-caida]");
                    return m?.closest("[data-bloque-del-formulario]")?.getAttribute("data-bloque-del-formulario") === "comenzar";
                });
                assert.equal(await pag.$eval("[data-marca-de-caida]", (n) => n.getAttribute("data-marca-de-caida")), "despues", `${w}: la raya cae detrás de «comenzar»`);
                await pag.keyboard.press("Space");
                await pag.waitForTimeout(150);
                const tras4 = ["preguntas", "video", "comenzar", "funciones", "incluido", "paraquien", "capacidad"];
                assert.deepEqual(await losBloques(pag), tras4, `${w}: con el teclado también se mueve`);
                assert.deepEqual(await elIndice(pag), tras4);

                // 7. Lo de dentro de un bloque sigue funcionando: las preguntas no se pierden al moverlo.
                const preguntas = await pag.$$eval("[data-pregunta-texto]", (n) => n.map((x) => x.value));
                assert.deepEqual(preguntas, ["¿Cuánto tarda la puesta en marcha?", "¿Puedo cambiar de plan?"]);

                // 8. Guardar manda el orden que se ve.
                await pag.click("[data-guardar-detalle]");
                await pag.waitForFunction(() => window.pedidas.some((p) => p.accion === "guardar"));
                const guardado = await pag.evaluate(() => window.pedidas.filter((p) => p.accion === "guardar").at(-1).args[1]);
                assert.deepEqual(guardado.orden, tras4, "se guarda el orden del formulario");
                assert.equal(guardado.faqs.length, 2, "y lo demás del detalle sigue yendo");

                // 9. Nada se sale a lo ancho.
                const ancho = await pag.evaluate(() => ({ doc: document.documentElement.scrollWidth, vw: window.innerWidth }));
                assert.ok(ancho.doc <= ancho.vw, `${w}: la página no desborda (${JSON.stringify(ancho)})`);
                assert.deepEqual(errores, []);
            } finally {
                await nav.close();
                srv.close();
            }
        });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Sin textos de más, y el pie: «Ver página pública» a la izquierda, «Guardar»
//    a la derecha, en la misma fila.
// ─────────────────────────────────────────────────────────────────────────────

const lasCajasDelPie = (pag) =>
    pag.evaluate(() => {
        const caja = (n) => {
            if (!n) return null;
            const r = n.getBoundingClientRect();
            return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, centro: r.top + r.height / 2, texto: n.textContent.trim() };
        };
        const bloques = [...document.querySelectorAll("[data-bloque-del-formulario]")];
        return {
            texto: document.querySelector("[data-detalle-del-plan]")?.textContent ?? "",
            enlace: caja(document.querySelector("[data-ver-pagina-publica]")),
            boton: caja(document.querySelector("[data-guardar-detalle]")),
            pie: caja(document.querySelector("[data-pie-del-detalle]")),
            ultimo: caja(bloques.at(-1)),
            primero: caja(bloques[0]),
        };
    });

if (ROTO) {
    conNavegador("ANTES: un texto largo arriba, otro abajo, el enlace arriba y el botón «Guardar detalle»", async () => {
        const { srv, url } = await servir();
        const nav = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined });
        try {
            const { pag } = await abrir(nav, 1440, 900);
            await cargar(pag, url);
            const c = await lasCajasDelPie(pag);
            assert.match(c.texto, /La página pública se arma sola/, "el texto de arriba estaba");
            assert.match(c.texto, /testimonios, galería/, "y el de lo de antes, abajo");
            assert.equal(c.boton.texto, "Guardar detalle");
            assert.ok(c.enlace.top < c.boton.top - 200, "«Ver página pública» iba arriba, lejos del botón");
        } finally {
            await nav.close();
            srv.close();
        }
    });
} else {
    for (const [w, h] of [
        [1440, 900],
        [390, 844],
    ]) {
        conNavegador(`${w}: sin textos de más, y «Ver página pública» a la izquierda de «Guardar», al final`, async () => {
            const { srv, url } = await servir();
            const nav = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined });
            try {
                const { pag, errores } = await abrir(nav, w, h);
                await cargar(pag, url);
                const c = await lasCajasDelPie(pag);
                assert.doesNotMatch(c.texto, /se arma sola/, "el texto de arriba ya no está");
                assert.doesNotMatch(c.texto, /testimonios|galería|de antes/, "ni el de lo de antes");
                assert.equal(c.boton.texto, "Guardar", "el botón dice Guardar");
                assert.equal(c.enlace.texto, "Ver página pública");
                assert.ok(c.enlace.top > c.ultimo.bottom, `${w}: el enlace va al final, debajo del último bloque`);
                assert.ok(Math.abs(c.enlace.centro - c.boton.centro) <= 1, `${w}: enlace y botón en la misma fila (${c.enlace.centro} / ${c.boton.centro})`);
                assert.ok(Math.abs(c.enlace.left - c.pie.left) <= 1, `${w}: el enlace pegado a la izquierda`);
                assert.ok(Math.abs(c.boton.right - c.pie.right) <= 1, `${w}: el botón pegado a la derecha`);
                assert.ok(Math.abs(c.pie.left - c.primero.left) <= 1, `${w}: el pie arranca donde los bloques`);
                assert.ok(c.enlace.right < c.boton.left, `${w}: no se montan`);
                assert.deepEqual(errores, []);

                // Con el plan apagado, en el sitio del enlace va por qué no se ve.
                const { pag: p2 } = await abrir(nav, w, h);
                await p2.addInitScript(() => {
                    window.planApagado = true;
                });
                await cargar(p2, url);
                assert.equal(await p2.$("[data-ver-pagina-publica]"), null);
                const pie = await p2.$eval("[data-pie-del-detalle]", (n) => n.textContent);
                assert.match(pie, /El plan está apagado/);
                assert.match(pie, /Guardar$/);
            } finally {
                await nav.close();
                srv.close();
            }
        });
    }
}
