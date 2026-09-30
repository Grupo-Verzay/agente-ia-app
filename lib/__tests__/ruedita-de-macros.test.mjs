/**
 * La ruedita del menú «Macros» de Chats, en Chromium y con el componente REAL.
 *
 * # Qué se prueba, y por qué aquí
 *
 * Al pulsar una macro su fila enseña una ruedita mientras corre. La ruedita iba
 * al FINAL de la fila, detrás del nombre, así que le quitaba su ancho (14 px de
 * ruedita y 8 de hueco): en el vídeo de la guía «Marcar como caliente» salía
 * «Marcar como cali…» justo al lanzarla. Ahora ocupa el hueco del punto de
 * color, que mide lo mismo con punto o con ruedita.
 *
 * Eso no se contesta leyendo el componente: el ancho del panel lo decide
 * `usePanelFlotante('cabecera')` midiendo la fila de Macros y Acciones, la fila
 * la reparte el navegador, y el recorte depende de la letra de verdad
 * (Poppins). Así que se abre el menú de verdad, se pulsa la macro —que no
 * termina hasta que el banco la suelta— y se mide la fila antes y mientras gira.
 *
 * # El modo roto
 *
 * `MODO=roto` monta el `MacrosMenu` de un commit PINCHADO y afirma el fallo: el
 * nombre encoge al girar la ruedita y «Marcar como caliente» sale recortado.
 * Sin ese modo, lo verde del otro no diría si se arregló la causa o si el caso
 * no se llega a ejercer.
 *
 * Se levanta con `scripts/banco-ruedita-de-macros.sh`.
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
    // Sin navegador no se finge: se dice y se salta.
}

const ROTO = process.env.MODO === "roto";
const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..", "..");
const HARNESS = join(AQUI, ".compilado", "harness-ruedita-de-macros.js");

const DIR_CSS = join(RAIZ, ".next", "static", "css");
const CSS = fs.existsSync(DIR_CSS)
    ? fs
          .readdirSync(DIR_CSS)
          .filter((f) => f.endsWith(".css"))
          .map((f) => fs.readFileSync(join(DIR_CSS, f), "utf8"))
          .join("\n")
    : null;
// La clase de Poppins que Next pone en el `<body>`: el menú va en un portal al
// `<body>`, así que la letra con la que se mide es la de verdad.
const CLASE_DE_LA_FUENTE = ((CSS ?? "").match(/\.(__className_[a-z0-9]+)\{font-family:__poppins/) ?? [])[1] ?? "";

/** Las macros ACTIVAS de la guía, con sus nombres y colores de verdad. */
const MACROS = [
    ["Venta cerrada", "#10B981"],
    ["Dar la bienvenida", "#6366F1"],
    ["Enviar datos de pago", "#F59E0B"],
    ["Marcar como caliente", "#EF4444"],
    ["Pasar a soporte", "#8B5CF6"],
    ["Aviso desde Soporte", "#0EA5E9"],
    ["Pedir valoración", "#14B8A6"],
].map(([name, color], i) => ({ id: `m${i}`, name, color, enabled: true, actions: [], order: i, runCount: 0 }));

/** La que se lanza en el vídeo, y la que se recortaba. */
const LA_QUE_SE_LANZA = "Marcar como caliente";

/** El área de conversación empieza donde acaba la lista de chats. */
const ANCHURAS = [
    { vista: 1440, izquierda: 432 },
    { vista: 1280, izquierda: 432 },
    { vista: 1024, izquierda: 400 },
];

function levantar() {
    const bundle = fs.readFileSync(HARNESS);
    const html =
        `<!doctype html><html><head><meta charset="utf-8">` +
        `<meta name="viewport" content="width=device-width,initial-scale=1">` +
        // `next/link` lee `process.env.__NEXT_*`: en un navegador suelto no hay
        // nada que lo ponga y el módulo revienta al cargarse.
        `<script>window.process={env:{}};</script>` +
        `<style>${CSS ?? ""}</style></head>` +
        `<body class="${CLASE_DE_LA_FUENTE}" style="margin:0"><div id="app"></div>` +
        `<script type="module" src="/harness.js"></script></body></html>`;
    const server = http.createServer((req, res) => {
        const u = (req.url ?? "/").split("?")[0];
        if (u.startsWith("/_next/static/media/")) {
            const f = join(RAIZ, ".next", "static", "media", u.slice("/_next/static/media/".length));
            if (fs.existsSync(f)) {
                res.writeHead(200, { "Content-Type": "font/woff2" });
                return res.end(fs.readFileSync(f));
            }
        }
        if (u === "/harness.js") {
            res.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8" });
            return res.end(bundle);
        }
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(html);
    });
    return new Promise((r) => server.listen(0, () => r(server)));
}

let server = null;
let navegador = null;

test.before(async () => {
    if (!chromium || !CSS || !fs.existsSync(HARNESS)) return;
    server = await levantar();
    navegador = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined, args: ["--no-sandbox"] });
});
test.after(async () => {
    await navegador?.close();
    server?.close();
});

function faltaNavegador(t) {
    if (!navegador) {
        t.skip("sin playwright, sin el CSS del build o sin arnés: corre el banco con su script");
        return true;
    }
    return false;
}

async function abrirLaPagina(anchura) {
    const page = await navegador.newPage({ viewport: { width: anchura.vista, height: 800 } });
    const errores = [];
    page.on("pageerror", (e) => errores.push(String(e)));
    await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: "load" });
    await page.waitForFunction("window.listo === true", { timeout: 20000 }).catch(() => {
        throw new Error(`el arnés no llegó a montarse: ${errores.join(" | ") || "sin errores"}`);
    });
    await page.evaluate((m) => (window.__macros = m), MACROS);
    await page.evaluate((izq) => window.pintar(izq), anchura.izquierda);
    await page.evaluate(() => document.fonts.ready);
    // Sin animaciones: un panel a media animación mide lo que no es.
    await page.addStyleTag({ content: "*,*::before,*::after{animation:none!important;transition:none!important}" });
    return page;
}

async function abrirElMenu(page) {
    await page.click("[data-macros-de-chat]");
    await page.getByRole("menuitem", { name: LA_QUE_SE_LANZA }).waitFor({ state: "visible", timeout: 10000 });
}

/** Lo que se ve de cada fila del menú: el nombre, su caja y si sale recortado. */
function medir(page) {
    return page.evaluate(() => {
        const filas = Array.from(document.querySelectorAll('[role="menuitem"]'));
        return filas.map((fila) => {
            const nombre = fila.querySelector(".truncate") ?? fila;
            const cn = nombre.getBoundingClientRect();
            const cf = fila.getBoundingClientRect();
            const ruedita = fila.querySelector(".animate-spin");
            const punto = fila.querySelector(".rounded-full");
            const cr = ruedita?.getBoundingClientRect();
            const cp = punto?.getBoundingClientRect();
            return {
                texto: (nombre.textContent ?? "").trim(),
                izquierda: cn.left,
                ancho: cn.width,
                recortado: nombre.scrollWidth > nombre.clientWidth + 0.5,
                derechaDeLaFila: cf.right,
                ruedita: cr ? { centro: cr.left + cr.width / 2, ancho: cr.width, izquierda: cr.left, derecha: cr.right, color: getComputedStyle(ruedita).color } : null,
                punto: cp ? { centro: cp.left + cp.width / 2 } : null,
            };
        });
    });
}

const laFila = (filas, texto) => filas.find((f) => f.texto === texto);

for (const anchura of ANCHURAS) {
    test(`${anchura.vista} px: el nombre no cambia de ancho ni se recorta mientras gira la ruedita`, async (t) => {
        if (faltaNavegador(t)) return;
        const page = await abrirLaPagina(anchura);
        try {
            await abrirElMenu(page);
            const antes = laFila(await medir(page), LA_QUE_SE_LANZA);
            assert.ok(antes, "la fila de la macro tiene que estar en el menú");
            assert.equal(antes.recortado, false, `en reposo «${LA_QUE_SE_LANZA}» se lee entero (${antes.ancho.toFixed(1)} px)`);

            await page.getByRole("menuitem", { name: LA_QUE_SE_LANZA }).click();
            await page.locator('[role="menuitem"] .animate-spin').waitFor({ state: "visible", timeout: 5000 });
            const girando = laFila(await medir(page), LA_QUE_SE_LANZA);
            assert.deepEqual(await page.evaluate(() => window.lanzadas), ["m3"], "se lanza la macro pulsada, una vez");
            assert.ok(girando?.ruedita, "mientras corre, su fila enseña la ruedita");

            if (ROTO) {
                // EL FALLO: la ruedita va detrás del nombre y le quita su ancho.
                assert.ok(
                    antes.ancho - girando.ancho >= 14,
                    `con la ruedita al final el nombre tiene que encoger (antes ${antes.ancho.toFixed(1)}, girando ${girando.ancho.toFixed(1)})`,
                );
                assert.equal(girando.recortado, true, `«${LA_QUE_SE_LANZA}» sale recortado mientras gira: el fallo del vídeo`);
                return;
            }

            assert.ok(Math.abs(girando.ancho - antes.ancho) < 0.5, `el nombre mide lo mismo (antes ${antes.ancho.toFixed(1)}, girando ${girando.ancho.toFixed(1)})`);
            assert.ok(Math.abs(girando.izquierda - antes.izquierda) < 0.5, "el nombre no se mueve de sitio");
            assert.equal(girando.recortado, false, `«${LA_QUE_SE_LANZA}» se sigue leyendo entero mientras gira`);
        } finally {
            await page.evaluate(() => window.soltarLaMacro?.());
            await page.close();
        }
    });
}

test("la ruedita va en el hueco del punto de color, y con su color", async (t) => {
    if (faltaNavegador(t)) return;
    const page = await abrirLaPagina(ANCHURAS[0]);
    try {
        await abrirElMenu(page);
        const antes = laFila(await medir(page), LA_QUE_SE_LANZA);
        assert.ok(antes.punto, "en reposo la fila lleva su punto de color");

        await page.getByRole("menuitem", { name: LA_QUE_SE_LANZA }).click();
        await page.locator('[role="menuitem"] .animate-spin').waitFor({ state: "visible", timeout: 5000 });
        const girando = laFila(await medir(page), LA_QUE_SE_LANZA);

        if (ROTO) {
            // En el de antes la ruedita va DETRÁS del nombre.
            assert.ok(girando.ruedita.izquierda >= girando.izquierda + girando.ancho - 0.5, "la ruedita iba al final de la fila");
            return;
        }
        assert.ok(Math.abs(girando.ruedita.centro - antes.punto.centro) < 0.6, `la ruedita gira donde estaba el punto (${girando.ruedita.centro} frente a ${antes.punto.centro})`);
        assert.ok(Math.abs(girando.ruedita.ancho - 14) < 0.6, `la ruedita mide lo que la de «Cargando…» (${girando.ruedita.ancho} px)`);
        assert.equal(girando.punto, null, "el punto cede su sitio a la ruedita: no se pintan los dos");
        // El rojo de «Marcar como caliente»: la ruedita se reconoce como de ESA macro.
        assert.equal(girando.ruedita.color, "rgb(239, 68, 68)", "la ruedita lleva el color de su macro");
        // Las demás filas no cambian: siguen con su punto.
        const otra = laFila(await medir(page), "Venta cerrada");
        assert.ok(otra.punto && !otra.ruedita, "las demás macros conservan su punto");
    } finally {
        await page.evaluate(() => window.soltarLaMacro?.());
        await page.close();
    }
});

test("en reposo ningún nombre de la guía sale recortado, y todos arrancan en el mismo píxel", async (t) => {
    if (faltaNavegador(t)) return;
    for (const anchura of ANCHURAS) {
        const page = await abrirLaPagina(anchura);
        try {
            await abrirElMenu(page);
            const filas = (await medir(page)).filter((f) => MACROS.some((m) => m.name === f.texto));
            assert.equal(filas.length, MACROS.length, "salen las siete macros activas");
            const recortadas = filas.filter((f) => f.recortado).map((f) => f.texto);
            // El hueco del punto mide lo que el punto (10 px): con uno de 14
            // «Marcar como caliente» salía cortado a 1024 sin que corriera
            // nada. Si aparece aquí un nombre, alguien le quitó sitio.
            assert.deepEqual(recortadas, [], `${anchura.vista} px: ninguna macro de la guía sale con «…»`);
            const izquierdas = new Set(filas.map((f) => Math.round(f.izquierda)));
            assert.equal(izquierdas.size, 1, "todos los nombres arrancan en la misma columna");
        } finally {
            await page.close();
        }
    }
});

test("al terminar la macro el menú se cierra y, al volver, la fila tiene su punto", async (t) => {
    if (faltaNavegador(t)) return;
    const page = await abrirLaPagina(ANCHURAS[0]);
    try {
        await abrirElMenu(page);
        await page.getByRole("menuitem", { name: LA_QUE_SE_LANZA }).click();
        await page.locator('[role="menuitem"] .animate-spin').waitFor({ state: "visible", timeout: 5000 });
        await page.evaluate(() => window.soltarLaMacro());
        await page.getByRole("menu").waitFor({ state: "detached", timeout: 5000 });
        await abrirElMenu(page);
        const fila = laFila(await medir(page), LA_QUE_SE_LANZA);
        assert.ok(fila.punto && !fila.ruedita, "sin nada corriendo, la fila vuelve a tener su punto");
    } finally {
        await page.close();
    }
});
