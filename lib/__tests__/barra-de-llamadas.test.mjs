/**
 * La barra de CRM › Llamadas y su ventana de llamar, medidas en Chromium
 * sobre el CSS del build.
 *
 * # Las tres preguntas del encargo, que no se contestan leyendo
 *
 *   1. **La barra es la de Leads**: `BarraDeAcciones` con sus cinco huecos en
 *      orden —buscador, filtros, secundarias, crear, acciones— y el botón
 *      azul a la derecha. Sin el campo del número y sin «Llamar con IA»
 *      sueltos dentro.
 *   2. **La ventana se abre y se cierra**, y eso solo se puede medir con
 *      navegador: Radix monta el contenido de un `Dialog` en un portal y
 *      **solo al abrirlo**, así que el `onClick` de cada botón del pie es
 *      código que sin Chromium no se ejecuta nunca.
 *   3. **Cada botón dispara SU llamada y no la otra.** Un pie que al pulsar
 *      «Llamar» lanzara además la de IA gastaría créditos sin que nadie los
 *      pidiera, y eso no da ningún error.
 *
 * # El modo roto mide lo que HABÍA, no una copia
 *
 * `MODO=roto` monta las dos filas de `origin/main` —el toolbar con el rango
 * de días y el `BarraDelMarcador` con el campo y los dos botones dentro—
 * sacadas con `git show` por `scripts/sacar-barra-de-llamadas.py`, y
 * **afirma el fallo**: no hay ningún `[data-barra-de-acciones]`, no hay
 * botón que abra ninguna ventana, y el campo del número y «Llamar con IA»
 * viven en la fila. Copiadas a mano se estaría midiendo lo que alguien
 * recuerda de la pantalla vieja, que es la regla de siempre aquí.
 *
 * Se levanta con `scripts/banco-llamar-con-ia.sh`.
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
const HARNESS = join(AQUI, ".compilado", "harness-barra-de-llamadas.js");

const DIR_CSS = join(RAIZ, ".next", "static", "css");
const CSS = fs.existsSync(DIR_CSS)
    ? fs
          .readdirSync(DIR_CSS)
          .filter((f) => f.endsWith(".css"))
          .map((f) => fs.readFileSync(join(DIR_CSS, f), "utf8"))
          .join("\n")
    : null;

const ANCHURAS_DE_COMPUTADOR = [1440, 1280, 1024];
const MOVIL = 390;

/**
 * El hueco que de verdad tiene esta pantalla: la ventana menos el menú lateral
 * (16 rem abierto) y el relleno de la página. En un teléfono el menú no está.
 */
const HUECO = { 1440: 1160, 1280: 1000, 1024: 744, 390: 374 };

function levantar() {
    const bundle = fs.readFileSync(HARNESS);
    const server = http.createServer((req, res) => {
        const u = (req.url ?? "/").split("?")[0];
        if (u === "/") {
            res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
            res.end(
                `<!doctype html><html><head><meta charset="utf-8"><style>${CSS ?? ""}</style></head>` +
                    `<body style="margin:0"><div id="hueco"><div id="barra"></div></div>` +
                    `<script type="module" src="/harness-barra-de-llamadas.js"></script></body></html>`,
            );
            return;
        }
        if (u === "/harness-barra-de-llamadas.js") {
            res.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8" });
            res.end(bundle);
            return;
        }
        res.writeHead(404);
        res.end("no");
    });
    return new Promise((r) => server.listen(0, () => r(server)));
}

async function abrir(ancho) {
    const server = await levantar();
    const base = `http://127.0.0.1:${server.address().port}`;
    const navegador = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined });
    const page = await (
        await navegador.newContext({ viewport: { width: ancho, height: 900 } })
    ).newPage();
    // Una barra que no llega a pintarse mide cero y hace pasar cualquier
    // comprobación de «no desborda» sin haber ejercido nada — y en el modo
    // roto, además, deja de reproducir el fallo que viene a afirmar. Se cazan
    // las dos formas de que eso pase: una excepción al pintar y un hueco que
    // se queda vacío.
    const reventones = [];
    page.on("pageerror", (e) => reventones.push(String(e)));
    await page.goto(base + "/", { waitUntil: "load" });
    await page.waitForFunction("window.listo === true", { timeout: 20000 });
    await page.evaluate((w) => {
        document.getElementById("hueco").style.width = w + "px";
    }, HUECO[ancho] ?? ancho);
    await page.evaluate(() => window.pintarBarra());
    await page.waitForTimeout(200);
    assert.equal(
        reventones.join(" | "),
        "",
        `la barra reventó al pintarse (MODO=${ROTO ? "roto" : "bueno"})`,
    );
    const pintada = await page.evaluate(
        () => (document.getElementById("barra")?.textContent ?? "").trim().length,
    );
    assert.ok(pintada > 0, `la barra no pintó nada (MODO=${ROTO ? "roto" : "bueno"})`);
    return {
        page,
        async cerrar() {
            await navegador.close();
            server.close();
        },
    };
}

/** Lo que hace falta medir de la BARRA, en una sola pasada. */
function medir(page) {
    return page.evaluate(() => {
        const caja = (n) => {
            if (!n) return null;
            const r = n.getBoundingClientRect();
            return { x: r.x, y: r.y, w: r.width, h: r.height, abajo: r.bottom, dcha: r.right };
        };
        const barra = document.querySelector("[data-barra-de-acciones]");
        const zona = (cual) => caja(document.querySelector(`[data-zona="${cual}"]`));
        // Todo lo que tiene texto y se puede pulsar dentro de la barra.
        const mandos = barra
            ? [...barra.querySelectorAll("button")].filter((n) => n.textContent.trim())
            : [];
        return {
            hayBarra: !!barra,
            barra: caja(barra),
            buscador: zona("buscador"),
            filtros: zona("filtros"),
            secundarias: zona("secundarias"),
            crear: zona("crear"),
            acciones: zona("acciones"),
            // El orden en el marcado ES la ley, así que se lee del DOM.
            orden: barra
                ? [...barra.querySelectorAll("[data-zona]")].map((n) => n.getAttribute("data-zona"))
                : [],
            // Un rótulo recortado se ve como texto que no cabe en su caja.
            recortados: mandos
                .filter((n) => n.scrollWidth > n.clientWidth + 1)
                .map((n) => n.textContent.trim()),
            // Nada puede salirse de la barra **sin forma de traerlo**.
            //
            // Lo que vive dentro del carril sí puede quedar fuera de la caja:
            // eso es exactamente lo que hace un carril que se desplaza, y su
            // rectángulo lo sigue diciendo aunque el navegador lo recorte. Así
            // que un mando solo cuenta como perdido cuando **no tiene ningún
            // antepasado que se desplace**.
            fuera: mandos
                .filter((n) => {
                    if (!barra) return false;
                    const r = n.getBoundingClientRect();
                    const b = barra.getBoundingClientRect();
                    if (r.left >= b.left - 1 && r.right <= b.right + 1) return false;
                    for (let p = n.parentElement; p && p !== document.body; p = p.parentElement) {
                        const ov = getComputedStyle(p).overflowX;
                        if ((ov === "auto" || ov === "scroll") && p.scrollWidth > p.clientWidth) {
                            return false;
                        }
                    }
                    return true;
                })
                .map((n) => n.textContent.trim()),
            paginaDesborda:
                document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
            texto: document.body.innerText,
            // Lo que el encargo saca de la barra, y lo que el modo roto afirma
            // que estaba dentro.
            campoEnLaBarra: !!barra?.querySelector('input[aria-label="Número al que llamar"]'),
            iaEnLaBarra: !!barra?.querySelector('[data-boton="llamar-ia"]'),
            // Los mismos dos, sobre la página entera: es lo que el modo roto
            // afirma, y ahí no hay ninguna `[data-barra-de-acciones]` dentro
            // de la que buscar. Por marca y no por su rótulo, que en un
            // teléfono los dos botones se quedan solo con su icono y un
            // `innerText` no lo vería.
            campoEnLaPagina: !!document.querySelector('input[aria-label="Número al que llamar"]'),
            iaEnLaPagina: !!document.querySelector('[data-boton="llamar-ia"]'),
            hayAbrir: !!document.querySelector('[data-boton="abrir-llamar"]'),
            hayDialogo: !!document.querySelector('[data-dialogo="llamar"]'),
            // El rango de días se fue a la fila de las pestañas del CRM, que
            // no es esta barra.
            diasEnLaBarra: barra ? /7 días/.test(barra.innerText) : false,
        };
    });
}

function faltaNavegador(t) {
    if (!chromium) {
        t.skip("sin playwright en este equipo");
        return true;
    }
    if (!CSS) {
        t.skip("sin el CSS del build: corre `npm run build` antes");
        return true;
    }
    return false;
}

test("la barra es la de Leads: cinco huecos en orden, y el azul a la derecha", async (t) => {
    if (faltaNavegador(t)) return;

    for (const ancho of [...ANCHURAS_DE_COMPUTADOR, MOVIL]) {
        const { page, cerrar } = await abrir(ancho);
        try {
            const m = await medir(page);

            if (ROTO) {
                // EL ANTES, tal cual estaba en `origin/main`: dos filas
                // escritas a mano, con el campo y los dos botones dentro.
                assert.equal(m.hayBarra, false, `a ${ancho} el antes no usaba BarraDeAcciones`);
                assert.equal(m.hayAbrir, false, `a ${ancho} el antes no tenía botón que abriera nada`);
                assert.ok(m.iaEnLaPagina, `a ${ancho} el antes tenía «Llamar con IA» suelto en la fila`);
                assert.ok(m.campoEnLaPagina, `a ${ancho} el antes tenía el campo del número en la fila`);
                assert.match(m.texto, /7 días/, "el antes tenía el rango de días en la barra");
                continue;
            }

            assert.ok(m.hayBarra, `a ${ancho} la pantalla no usa BarraDeAcciones`);
            assert.deepEqual(
                m.orden,
                ["buscador", "filtros", "secundarias", "crear", "acciones"],
                `a ${ancho} los cinco huecos no salen en orden`,
            );
            // El buscador, fijo a la izquierda y fuera del carril.
            assert.ok(
                Math.abs(m.buscador.x - m.barra.x) <= 1,
                `a ${ancho} el buscador no arranca en el borde izquierdo (x=${m.buscador.x - m.barra.x})`,
            );
            // El `⋯`, pegado al borde derecho; el azul, justo antes.
            assert.ok(
                m.barra.dcha - m.acciones.dcha <= 1,
                `a ${ancho} el «⋯» no queda pegado al borde derecho`,
            );
            assert.ok(
                m.crear.dcha <= m.acciones.x + 1,
                `a ${ancho} el botón de llamar no va justo antes del «⋯»`,
            );
            // Una sola fila, del alto de un botón.
            assert.ok(
                m.barra.h <= 44,
                `a ${ancho} la barra creció de alto (${m.barra.h} px): se partió en dos filas`,
            );
            // Y lo que se sacó de la barra ya no está.
            assert.equal(m.campoEnLaBarra, false, `a ${ancho} el campo del número sigue en la barra`);
            assert.equal(m.iaEnLaBarra, false, `a ${ancho} «Llamar con IA» sigue en la barra`);
            assert.equal(m.diasEnLaBarra, false, `a ${ancho} el rango de días sigue en la barra`);
            assert.ok(m.hayAbrir, `a ${ancho} falta el botón «Llamar» de la barra`);
        } finally {
            await cerrar();
        }
    }
});

test("no se aprieta ni se parte nada, en las cuatro anchuras", async (t) => {
    if (faltaNavegador(t)) return;
    if (ROTO) return; // lo que había se mide en el caso de arriba.

    for (const ancho of [...ANCHURAS_DE_COMPUTADOR, MOVIL]) {
        const { page, cerrar } = await abrir(ancho);
        try {
            const m = await medir(page);
            assert.deepEqual(
                m.recortados,
                [],
                `a ${ancho} hay rótulos recortados: ${JSON.stringify(m.recortados)}`,
            );
            assert.deepEqual(
                m.fuera,
                [],
                `a ${ancho} hay mandos fuera de la barra: ${JSON.stringify(m.fuera)}`,
            );
            assert.equal(m.paginaDesborda, false, `a ${ancho} la página se desplaza a lo ancho`);
        } finally {
            await cerrar();
        }
    }
});

test("la ventana se abre y se cierra", async (t) => {
    if (faltaNavegador(t)) return;
    const { page, cerrar } = await abrir(1280);
    try {
        if (ROTO) {
            assert.equal(
                await page.locator('[data-boton="abrir-llamar"]').count(),
                0,
                "el antes no tenía ninguna ventana que abrir: los dos botones estaban en la fila",
            );
            return;
        }

        assert.equal(
            await page.locator('[data-dialogo="llamar"]').count(),
            0,
            "la ventana no puede estar montada antes de pulsar",
        );

        await page.click('[data-boton="abrir-llamar"]');
        await page.waitForSelector('[data-dialogo="llamar"]', { timeout: 5000 });

        // El título, el campo con su texto guía y los tres botones del pie.
        const dentro = await page.evaluate(() => {
            const d = document.querySelector('[data-dialogo="llamar"]');
            const campo = d.querySelector("#llamar-numero");
            return {
                titulo: d.querySelector("h2")?.textContent?.trim() ?? "",
                guia: campo?.getAttribute("placeholder") ?? "",
                alineacion: campo ? getComputedStyle(campo).textAlign : "",
                botones: [...d.querySelectorAll("button")]
                    .map((n) => n.textContent.trim())
                    .filter(Boolean),
            };
        });
        assert.equal(dentro.titulo, "Llamar", "el título de la ventana es «Llamar»");
        assert.equal(dentro.guia, "573001234567", "el texto guía es el número de ejemplo");
        assert.equal(
            dentro.alineacion,
            "left",
            "el campo va alineado a la izquierda, no centrado",
        );
        // Sin «Cancelar»: la ventana se cierra con la X y tocando fuera. El
        // orden y la fila los mide `llamadas-como-leads.test.mjs`.
        for (const rotulo of ["Llamar", "Llamar IA"]) {
            assert.ok(
                dentro.botones.some((b) => b === rotulo),
                `falta el botón «${rotulo}» en el pie: ${JSON.stringify(dentro.botones)}`,
            );
        }
        assert.ok(!dentro.botones.includes("Cancelar"), "«Cancelar» sobra: se cierra con la X");

        // Y Escape la cierra, igual que la X y el clic fuera.
        await page.keyboard.press("Escape");
        await page.waitForSelector('[data-dialogo="llamar"]', { state: "detached", timeout: 5000 });
        assert.equal(
            await page.locator('[data-dialogo="llamar"]').count(),
            0,
            "la ventana tiene que cerrarse sin «Cancelar»",
        );
    } finally {
        await cerrar();
    }
});

test("cada botón dispara SU llamada y no la otra", async (t) => {
    if (faltaNavegador(t)) return;
    const { page, cerrar } = await abrir(1280);
    try {
        if (ROTO) {
            // EL ANTES: los dos botones estaban en la fila, sin ventana.
            const enLaFila = await page.locator('[data-boton="llamar-ia"]').count();
            assert.equal(enLaFila, 1, "el antes tenía «Llamar con IA» suelto en la fila");
            return;
        }

        const llamar = async (cual) => {
            await page.click('[data-boton="abrir-llamar"]');
            await page.waitForSelector('[data-dialogo="llamar"]', { timeout: 5000 });
            await page.fill("#llamar-numero", "573001234567");
            await page.click(`[data-dialogo="llamar"] [data-boton="${cual}"]`);
            await page.waitForTimeout(100);
        };

        await llamar("llamar");
        assert.deepEqual(
            await page.evaluate(() => window.__llamadas),
            { llamar: 1, ia: 0 },
            "«Llamar» dispara la llamada normal y NADA más",
        );

        await llamar("llamar-ia");
        assert.deepEqual(
            await page.evaluate(() => window.__llamadas),
            { llamar: 1, ia: 1 },
            "«Llamar IA» dispara la suya y no vuelve a disparar la normal",
        );
    } finally {
        await cerrar();
    }
});

test("sin número los dos botones están apagados", async (t) => {
    if (faltaNavegador(t)) return;
    if (ROTO) return;
    const { page, cerrar } = await abrir(1280);
    try {
        await page.click('[data-boton="abrir-llamar"]');
        await page.waitForSelector('[data-dialogo="llamar"]', { timeout: 5000 });
        const apagados = await page.evaluate(() => {
            const d = document.querySelector('[data-dialogo="llamar"]');
            return {
                llamar: d.querySelector('[data-boton="llamar"]').disabled,
                ia: d.querySelector('[data-boton="llamar-ia"]').disabled,
            };
        });
        assert.deepEqual(
            apagados,
            { llamar: true, ia: true },
            "con la caja vacía no hay número al que llamar: los dos se apagan",
        );
        assert.deepEqual(
            await page.evaluate(() => window.__llamadas ?? null),
            null,
            "y no se disparó ninguna llamada",
        );
    } finally {
        await cerrar();
    }
});
