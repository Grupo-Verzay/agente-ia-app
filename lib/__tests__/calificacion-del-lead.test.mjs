/**
 * La CALIFICACIÓN en la fila REAL de la lista de Chats, en Chromium y sobre el
 * CSS del build.
 *
 * Que la decisión sea correcta no prueba que la fila la use, y aquí hay dos
 * cosas que además no se contestan leyendo el código:
 *
 *   - **cuánto ancho devuelve** quitar la pastilla, que es de lo que iba el
 *     encargo —el renglón es lo único que escasea en esa fila—;
 *   - y **que calificar siga teniendo camino**: el menú «⋯» se pinta en un
 *     portal y solo al abrirlo, así que su contenido es código que sin
 *     navegador no se ejecuta nunca.
 *
 * `MODO=roto` pinta la MISMA maqueta con los componentes de `ANTES_REF` —un
 * `git worktree` aparte, nunca `origin/main`— y AFIRMA el fallo: la pastilla
 * «Sin clasificar» pintándose en una conversación sin calificar, y el menú sin
 * ninguna forma de calificarla. Se levanta con
 * `scripts/banco-calificacion-del-lead.sh`.
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
const RAIZ = join(AQUI, "..", "..");
const HARNESS = join(AQUI, ".compilado", "calificacion-del-lead.js");
const CSS_FICHERO = process.env.CSS_DEL_BANCO;
const DIR_CSS = join(RAIZ, ".next", "static", "css");
const CSS = CSS_FICHERO
    ? fs.readFileSync(CSS_FICHERO, "utf8")
    : fs
          .readdirSync(DIR_CSS)
          .filter((f) => f.endsWith(".css"))
          .map((f) => fs.readFileSync(join(DIR_CSS, f), "utf8"))
          .join("\n");

/** El ancho de la columna sale de `--ancho-lateral`: 24 rem a 1440 y 1280, 22 a 1024. */
const ANCHURAS = [1440, 1280, 1024, 390];
const FILAS = ["sinCalificar", "calificada", "apretada", "apretadaCal", "menu"];

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
                    `<style>@font-face{font-family:__poppins;src:url(/p400.woff2);font-weight:400}` +
                    `@font-face{font-family:__poppins;src:url(/p700.woff2);font-weight:700}` +
                    `@font-face{font-family:__poppins_Fallback;src:local("Arial")}` +
                    `body{font-family:__poppins,__poppins_Fallback}</style>` +
                    `<style>html,body{margin:0;height:100%;overflow:hidden}</style>` +
                    // Las animaciones de Radix mueven y encogen lo que se mide:
                    // un nodo a media animación no está en ningún sitio.
                    `<style>*,*::before,*::after{animation:none !important;transition:none !important}</style>` +
                    `</head><body><div id="app"></div><script type="module" src="/h.js"></script></body></html>`,
            );
            return;
        }
        if (u === "/p400.woff2" || u === "/p700.woff2") {
            res.writeHead(200, { "Content-Type": "font/woff2" });
            res.end(
                fs.readFileSync(
                    join(RAIZ, "app", "fonts", u === "/p400.woff2" ? "poppins-400.woff2" : "poppins-700.woff2"),
                ),
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

/**
 * Lo que se mide de cada fila.
 *
 * La pastilla de la calificación se busca por su DISPARADOR
 * (`aria-label="Cambiar estado del lead"`), que es lo único que está en el DOM
 * en los dos mundos: por el texto «Sin clasificar» no valdría —en el «ahora»
 * no existe y el banco se caería con un plazo agotado en vez de afirmar nada—.
 */
function medir() {
    const texto = (n) => (n?.textContent ?? "").replace(/\s+/g, " ").trim();
    const salida = {};
    for (const fila of document.querySelectorAll("[data-fila]")) {
        const id = fila.dataset.fila;
        const renglon = fila.querySelector("[data-renglon-de-pastillas], .mt-1.flex.items-center");
        const caja = renglon ?? null;
        salida[id] = {
            hayRenglon: !!caja,
            // Cuántas pastillas se ven. `data-pastilla` es la marca de
            // posición que el reparto usa; el «antes» ya la llevaba.
            pastillas: caja ? caja.querySelectorAll(":scope > [data-pastilla]").length : 0,
            hayMas: caja ? !!caja.querySelector(":scope > [data-pastilla-mas]") : false,
            hayCalificacion: !!fila.querySelector('[aria-label="Cambiar estado del lead"]'),
            diceSinClasificar: texto(fila).includes("Sin clasificar"),
            // El alto de la fila: quitar la pastilla no puede encogerla ni
            // estirarla, y una segunda línea se vería aquí.
            alto: Math.round(fila.getBoundingClientRect().height),
            huecoDelRenglon: caja ? caja.clientWidth : 0,
            // El alto del DISPARADOR de la calificación. Era `h-7` envolviendo
            // un badge de `h-6`, y esos 2 px por lado estiraban la fila entera.
            altoDelDisparador: (() => {
                const n = fila.querySelector('[aria-label="Cambiar estado del lead"]');
                return n ? Math.round(n.getBoundingClientRect().height) : null;
            })(),
            // El de sus vecinas, para comparar contra algo medido y no contra
            // un número escrito a mano.
            altosDeLasVecinas: caja
                ? [...caja.querySelectorAll(":scope > [data-pastilla]")]
                      .map((n) => {
                          const p = [n, ...n.querySelectorAll("*")].find((x) => {
                              const e = getComputedStyle(x);
                              return (
                                  (e.borderTopLeftRadius === "9999px" ||
                                      parseFloat(e.borderTopLeftRadius) > 20) &&
                                  Math.round(x.getBoundingClientRect().height) >= 20
                              );
                          });
                          return p ? Math.round(p.getBoundingClientRect().height) : null;
                      })
                      .filter((h) => h !== null)
                : [],
            desbordaElRenglon: caja ? caja.scrollWidth > caja.clientWidth + 1 : false,
        };
    }
    salida.__anchoPagina = document.documentElement.scrollWidth;
    return salida;
}

const server = await levantar();
const URL = `http://127.0.0.1:${server.address().port}/`;
const navegador = await chromium.launch({
    executablePath: process.env.CHROME_BIN || undefined,
    // Sin esto Playwright esconde las barras, y la barra de la lista es
    // justamente lo que le quita ancho al renglón.
    args: ["--force-device-scale-factor=1"],
    ignoreDefaultArgs: ["--hide-scrollbars"],
});

async function abrir(ancho) {
    const pagina = await navegador.newPage({ viewport: { width: ancho, height: 900 } });
    const fallos = [];
    pagina.on("pageerror", (e) => fallos.push(String(e)));
    await pagina.goto(URL);
    await pagina.waitForFunction("window.listo === true", null, { timeout: 15000 });
    await pagina.evaluate(() => document.fonts.ready);
    // Dos fotogramas: el reparto del renglón se decide midiendo.
    await pagina.evaluate(
        () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
    );
    if (fallos.length) throw new Error(`la maqueta reventó: ${fallos[0]}`);
    return pagina;
}

const POR_ANCHURA = {};
for (const ancho of ANCHURAS) {
    const pagina = await abrir(ancho);
    const m = await pagina.evaluate(medir);
    const anchoPagina = m.__anchoPagina;
    delete m.__anchoPagina;
    POR_ANCHURA[ancho] = { filas: m, anchoPagina };
    await pagina.close();
}

// ── El menú «⋯», que solo existe abierto ────────────────────────────────
const pagina = await abrir(1440);
const fila = pagina.locator('[data-fila="menu"]');
await fila.locator('[aria-label="Más opciones del chat"]').click();
const menu = pagina.locator('[role="menu"]').first();
await menu.waitFor({ state: "visible", timeout: 5000 });
const TEXTO_DEL_MENU = (await menu.innerText()).replace(/\s+/g, " ").trim();

let OPCIONES_DEL_SUBMENU = [];
const disparador = menu.getByText("Clasificar lead", { exact: true });
if ((await disparador.count()) > 0) {
    await disparador.first().click();
    // El submenú es OTRO `[role="menu"]`, y nace en un portal aparte.
    await pagina.waitForFunction(
        () => document.querySelectorAll('[role="menu"]').length > 1,
        null,
        { timeout: 5000 },
    );
    OPCIONES_DEL_SUBMENU = await pagina.evaluate(() => {
        const menus = [...document.querySelectorAll('[role="menu"]')];
        const sub = menus[menus.length - 1];
        return [...sub.querySelectorAll('[role="menuitem"]')].map((n) =>
            (n.textContent ?? "").replace(/\s+/g, " ").trim(),
        );
    });
}
await pagina.close();
await navegador.close();
server.close();

// ── Lo que se afirma ────────────────────────────────────────────────────

test("sin calificar NO se pinta la pastilla, y no queda ni el hueco", () => {
    for (const ancho of ANCHURAS) {
        const f = POR_ANCHURA[ancho].filas.sinCalificar;
        if (ROTO) {
            // El fallo: la pastilla se pintaba siempre, y sin calificación
            // decía «Sin clasificar» dentro de un borde punteado.
            assert.ok(f.hayCalificacion, `a ${ancho} el «antes» tendría que pintarla`);
            assert.ok(f.diceSinClasificar, `a ${ancho} el «antes» decía «Sin clasificar»`);
            continue;
        }
        assert.equal(f.hayCalificacion, false, `a ${ancho} se sigue pintando la calificación`);
        assert.equal(f.diceSinClasificar, false, `a ${ancho} la fila dice «Sin clasificar»`);
        // Y como era su única pastilla, no queda ni renglón: el hueco se va con
        // ella. Un renglón vacío de 24 px es la franja que esto viene a quitar.
        assert.equal(f.pastillas, 0, `a ${ancho} quedan pastillas`);
        assert.equal(f.hayRenglon, false, `a ${ancho} queda el renglón vacío`);
    }
});

test("con calificación de verdad SÍ se pinta, y sigue abriendo su menú", () => {
    for (const ancho of ANCHURAS) {
        const f = POR_ANCHURA[ancho].filas.calificada;
        assert.ok(f.hayCalificacion, `a ${ancho} falta la calificación`);
        assert.equal(f.pastillas, 1, `a ${ancho} hay ${f.pastillas} pastillas`);
        assert.equal(f.diceSinClasificar, false, `a ${ancho} dice «Sin clasificar»`);
    }
});

test("la fila llena GANA sitio: la calificación ocupaba y ahora no", () => {
    for (const ancho of ANCHURAS) {
        const sin = POR_ANCHURA[ancho].filas.apretada;
        const con = POR_ANCHURA[ancho].filas.apretadaCal;
        // Las dos filas son la misma salvo la calificación, así que sin ella
        // tienen que entrar al menos tantas pastillas como con ella.
        assert.ok(
            sin.pastillas >= con.pastillas,
            `a ${ancho}: sin calificación entran ${sin.pastillas} y con ella ${con.pastillas}`,
        );
        if (!ROTO) {
            // Y en el «ahora» la fila sin calificar no pinta ninguna pastilla
            // de calificación, por llena que esté.
            assert.equal(sin.hayCalificacion, false, `a ${ancho} la fila llena la pinta`);
        }
    }
});

test("el disparador de la calificación mide lo que sus pastillas vecinas", () => {
    for (const ancho of ANCHURAS) {
        const f = POR_ANCHURA[ancho].filas.apretadaCal;
        const vecinas = new Set(f.altosDeLasVecinas);
        if (ROTO) {
            // El fallo: el disparador era `h-7` (28) envolviendo un badge de
            // `h-6`, así que medía más que TODA pastilla de la fila.
            assert.ok(
                f.altoDelDisparador > Math.max(...f.altosDeLasVecinas),
                `a ${ancho} el «antes» medía ${f.altoDelDisparador} y sus vecinas ${[...vecinas].join(", ")}`,
            );
            continue;
        }
        assert.equal(vecinas.size, 1, `a ${ancho} las pastillas no miden lo mismo: ${[...vecinas].join(", ")}`);
        assert.equal(
            f.altoDelDisparador,
            [...vecinas][0],
            `a ${ancho} el disparador mide ${f.altoDelDisparador} y las pastillas ${[...vecinas][0]}`,
        );
    }
});

test("una fila mide lo MISMO esté calificada o no", () => {
    for (const ancho of ANCHURAS) {
        // En el «antes» esto no se podía ver, y conviene saber por qué en vez
        // de fingir un rojo: allí TODAS las filas llevaban la pastilla —la
        // calificada y la que decía «Sin clasificar»— así que las dos medían
        // los mismos 96 px. El fallo estaba igual —el disparador era `h-7`
        // entre pastillas de `h-6`, y eso lo afirma la prueba de arriba— pero
        // solo se convierte en una DIFERENCIA ahora, cuando una de las dos
        // filas deja de pintarla. Lo que se mide aquí es que no haya quedado.
        if (ROTO) return;
        const { apretada, apretadaCal } = POR_ANCHURA[ancho].filas;
        assert.equal(
            apretada.alto,
            apretadaCal.alto,
            `a ${ancho}: sin calificar ${apretada.alto} y calificada ${apretadaCal.alto}`,
        );
    }
});

test("ninguna fila se parte en dos líneas ni desborda su renglón", () => {
    for (const ancho of ANCHURAS) {
        const alturas = new Set();
        for (const id of FILAS) {
            const f = POR_ANCHURA[ancho].filas[id];
            assert.equal(f.desbordaElRenglon, false, `a ${ancho} el renglón de ${id} desborda`);
            if (f.hayRenglon) alturas.add(f.alto);
        }
        // Todas las filas CON renglón miden lo mismo: una segunda línea se
        // vería como una altura distinta.
        assert.equal(
            alturas.size,
            1,
            `a ${ancho} hay filas de distinto alto: ${[...alturas].join(", ")}`,
        );
    }
});

test("la página no desborda a lo ancho", () => {
    for (const ancho of ANCHURAS) {
        assert.ok(
            POR_ANCHURA[ancho].anchoPagina <= ancho + 1,
            `a ${ancho} la página mide ${POR_ANCHURA[ancho].anchoPagina}`,
        );
    }
});

test("quitar la pastilla no quitó el mando: el menú «⋯» califica", () => {
    if (ROTO) {
        // El fallo de la otra punta: el «antes» no ofrecía calificar en el
        // menú, así que la pastilla era el ÚNICO camino —y por eso esconderla
        // a secas habría dejado sin calificar la conversación que hay que
        // calificar—.
        assert.ok(
            !TEXTO_DEL_MENU.includes("Clasificar lead"),
            `el «antes» no tendría que ofrecer calificar; dice: ${TEXTO_DEL_MENU}`,
        );
        return;
    }
    assert.ok(
        TEXTO_DEL_MENU.includes("Clasificar lead"),
        `el menú no ofrece calificar; dice: ${TEXTO_DEL_MENU}`,
    );
    // Y ofrece las CINCO más «Sin clasificar», que es lo que la borra: sin esa
    // entrada, una calificación puesta por error no se podría deshacer.
    assert.equal(OPCIONES_DEL_SUBMENU.length, 6, `el submenú tiene ${OPCIONES_DEL_SUBMENU.length}`);
    for (const rotulo of ["Sin clasificar", "Frio", "Tibio", "Caliente", "Finalizado", "Descartado"]) {
        assert.ok(
            OPCIONES_DEL_SUBMENU.some((o) => o.includes(rotulo)),
            `falta «${rotulo}»: ${OPCIONES_DEL_SUBMENU.join(" | ")}`,
        );
    }
});
