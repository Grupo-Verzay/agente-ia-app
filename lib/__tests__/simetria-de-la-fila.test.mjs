/**
 * La SIMETRÍA de la fila de la lista de Chats, medida con `ChatContactItem`
 * REAL sobre el CSS del build.
 *
 * Los tres fallos reportados el 2026-09-26, y por qué ninguno se contesta
 * leyendo el código:
 *
 *   1. **El orden.** La etapa del embudo iba DETRÁS de la calificación, así que
 *      la fila y el menú de la cabecera contaban lo mismo al revés. Se mide en
 *      píxeles, no por el orden del JSX.
 *   2. **La pastilla de etiquetas.** Caía dentro del «+N» —resumir un resumen—,
 *      así que con dos etiquetas la fila enseñaba «+1», que se lee como «una
 *      etiqueta»; y ese «+1» era una caja de **18 × 24** casi blanca, o sea un
 *      óvalo de pie. Ahora es una contadora violeta que sale SIEMPRE, con el
 *      número total y los nombres en el globo.
 *   3. **El círculo del asesor.** `h-6` con relleno y sin ancho daba **20,9 ×
 *      24**: un óvalo de pie, no un círculo.
 *
 * Y lo que sostiene los dos últimos, que es una sola regla: **ninguna pastilla
 * de la fila puede ser más estrecha que alta.** Con `rounded-full`, una caja
 * así no es una pastilla. Se comprueba en TODAS, no solo en las dos del
 * reporte: el suelo es el alto (`FORMA_DE_LA_PASTILLA`).
 *
 * `MODO=roto` pinta la MISMA maqueta con los componentes de `ANTES_REF` —un
 * `git worktree` aparte, nunca `origin/main`— y AFIRMA los tres fallos con sus
 * números. Se levanta con `scripts/banco-simetria-de-la-fila.sh`.
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
const HARNESS = join(AQUI, ".compilado", "simetria-de-la-fila.js");
const CSS_FICHERO = process.env.CSS_DEL_BANCO;
const DIR_CSS = join(RAIZ, ".next", "static", "css");
const CSS = CSS_FICHERO
    ? fs.readFileSync(CSS_FICHERO, "utf8")
    : fs
          .readdirSync(DIR_CSS)
          .filter((f) => f.endsWith(".css"))
          .map((f) => fs.readFileSync(join(DIR_CSS, f), "utf8"))
          .join("\n");

/** 1440 y 1280 dan la misma columna (24 rem); 1024 es la más estrecha (22). */
const ANCHURAS = [1440, 1280, 1024];
const FILAS = ["pocas", "justas", "desborda", "unaSola", "sinNada"];

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
 * Lo que se mide de cada pastilla de la fila.
 *
 * El nodo que se mide no es el hijo directo del contenedor: varias pastillas
 * viven dentro de un `TooltipProvider` y de un envoltorio `inline-flex` que no
 * pinta nada. Se baja hasta el nodo PINTADO, el primero con redondeo completo;
 * sin eso se medirían envoltorios transparentes de 0 px de relleno y el banco
 * diría que todas están mal.
 */
function medir() {
    const pintado = (h) => {
        for (const n of [h, ...h.querySelectorAll("*")]) {
            const e = getComputedStyle(n);
            if (e.borderTopLeftRadius === "9999px" || parseFloat(e.borderTopLeftRadius) > 20) return n;
        }
        return h;
    };
    const de = (n) => {
        if (!n) return null;
        const r = n.getBoundingClientRect();
        const e = getComputedStyle(n);
        // La letra del nodo que lleva el texto: en una contadora el número va
        // en un span interior de 10 px, y el contenedor hereda 16.
        const conTexto = [n, ...n.querySelectorAll("*")].filter((x) =>
            [...x.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim()),
        );
        return {
            l: Math.round(r.left * 10) / 10,
            r: Math.round(r.right * 10) / 10,
            w: Math.round(r.width * 10) / 10,
            h: Math.round(r.height * 10) / 10,
            centro: Math.round((r.top + r.height / 2) * 10) / 10,
            letra: getComputedStyle(conTexto[0] ?? n).fontSize,
            redondeo: e.borderTopLeftRadius,
            relleno: `${e.paddingLeft}|${e.paddingRight}`,
            fondo: e.backgroundColor,
            borde: e.borderTopWidth,
            texto: (n.textContent ?? "").trim(),
        };
    };

    const salida = {};
    for (const raiz of document.querySelectorAll("[data-fila]")) {
        const id = raiz.getAttribute("data-fila");
        // El renglón: por su marca donde la hay, y por sus clases en el
        // «antes», que iba con `flex-wrap` y sin marca.
        const caja =
            raiz.querySelector("[data-renglon-de-pastillas]") ?? raiz.querySelector(".mt-1.flex.flex-wrap");
        const hijos = caja ? [...caja.children] : [];
        // La pastilla de etiquetas. En el «antes» no lleva marca, así que se
        // busca también por su icono: es lo único que existe en los dos
        // mundos, y sin eso el modo roto no encontraría la pastilla que viene
        // a comparar y fallaría por el motivo equivocado.
        const etiquetas =
            raiz.querySelector("[data-pastilla-de-etiquetas]") ??
            (() => {
                const icono = caja?.querySelector("svg.lucide-tag");
                return icono ? pintado(icono.closest("span") ?? icono) : null;
            })();
        // El «+N». Igual que las etiquetas: en el «antes» no lleva marca, así
        // que se busca también por su texto, que es lo único que no cambia.
        const mas =
            raiz.querySelector("[data-pastilla-de-mas]") ??
            [...(caja?.children ?? [])]
                .map((h) => pintado(h))
                .find((n) => /^\+\d+$/.test((n.textContent ?? "").trim())) ??
            null;
        const etapa = raiz.querySelector("[data-pastilla-de-etapa]");
        // La de estado es lo que pinta el disparador del selector de lead.
        const estado = raiz.querySelector('[aria-label="Cambiar estado del lead"]');
        // El asesor: su disparador lleva el nombre en el `title`.
        let asesor = null;
        for (const b of raiz.querySelectorAll("button,span")) {
            if ((b.getAttribute("title") ?? "") === "Yair Silvera") asesor = b;
        }
        salida[id] = {
            pastillas: hijos.map((h) => de(pintado(h))),
            etiquetas: de(etiquetas),
            mas: de(mas),
            etapa: de(etapa),
            estado: de(estado ? pintado(estado) : null),
            asesor: de(asesor),
            hayCaja: Boolean(caja),
            altoDeLaCaja: caja ? Math.round(caja.getBoundingClientRect().height) : 0,
            desborda: raiz.scrollWidth > raiz.clientWidth + 1,
        };
    }
    return { filas: salida, anchoPagina: document.documentElement.scrollWidth };
}

/**
 * Lo que el globo de las etiquetas dice al posar el cursor encima.
 *
 * Se apunta por el ICONO y no por la marca: el «antes» no la lleva, y buscar
 * algo que allí no existe haría que el modo roto se cayera con un plazo
 * agotado en vez de afirmar su fallo.
 */
async function globoDeLasEtiquetas(page) {
    const icono = 'svg.lucide-tag';
    const donde = `[data-fila="pocas"] ${icono}`;
    if (!(await page.locator(donde).count())) return "";
    await page.hover(donde);
    await page.waitForSelector('[role="tooltip"]', { timeout: 5000 });
    return page.evaluate(() =>
        [...document.querySelectorAll('[role="tooltip"]')].map((n) => n.textContent ?? "").join(" | "),
    );
}

async function tomar(ancho) {
    const server = await levantar();
    const { port } = server.address();
    const navegador = await chromium.launch({
        executablePath: process.env.CHROME_BIN || undefined,
        args: ["--font-render-hinting=none"],
        // Sin esto Chromium esconde las barras, y la de la lista se come
        // 10 px del ancho de la fila: el caso más justo no existiría.
        ignoreDefaultArgs: ["--hide-scrollbars"],
    });
    try {
        const page = await navegador.newPage({ viewport: { width: ancho, height: 1200 } });
        const errores = [];
        page.on("pageerror", (e) => errores.push(String(e)));
        await page.goto(`http://127.0.0.1:${port}/`);
        await page.waitForFunction(() => window.listo === true, null, { timeout: 20000 });
        await page.evaluate(() => document.fonts.ready);
        const datos = await page.evaluate(medir);
        if (errores.length) throw new Error(`la maqueta reventó: ${errores[0]}`);
        // Una fila que no llega a pintarse mide cero y pasa cualquier
        // comprobación de «no desborda»: se exige que estén las cinco.
        const faltan = FILAS.filter((f) => !datos.filas[f]);
        if (faltan.length) throw new Error(`no se pintaron las filas: ${faltan.join(", ")}`);
        datos.globo = await globoDeLasEtiquetas(page);
        return datos;
    } finally {
        await navegador.close();
        server.close();
    }
}

const POR_ANCHURA = {};
for (const ancho of ANCHURAS) POR_ANCHURA[ancho] = await tomar(ancho);

// ── 1. El orden ──────────────────────────────────────────────────────────
test("la etapa va DELANTE de la calificación, y el asesor detrás", () => {
    for (const ancho of ANCHURAS) {
        for (const id of ["pocas", "justas", "desborda", "unaSola"]) {
            const { etapa, estado, asesor } = POR_ANCHURA[ancho].filas[id];
            assert.ok(etapa, `falta la etapa en ${id} a ${ancho}`);
            assert.ok(estado, `falta la calificación en ${id} a ${ancho}`);
            assert.ok(asesor, `falta el asesor en ${id} a ${ancho}`);
            if (ROTO) {
                assert.ok(
                    estado.r <= etapa.l,
                    `ANTES: la calificación iba delante de la etapa (${id}, ${ancho})`,
                );
                continue;
            }
            assert.ok(etapa.r <= estado.l, `la etapa no va delante de la calificación (${id}, ${ancho})`);
            assert.ok(estado.r <= asesor.l, `el asesor no va detrás de la calificación (${id}, ${ancho})`);
        }
    }
});

// ── 2. Las etiquetas ─────────────────────────────────────────────────────
test("la pastilla de etiquetas sale SIEMPRE, también con la fila llena", () => {
    for (const ancho of ANCHURAS) {
        for (const id of ["pocas", "justas", "desborda", "unaSola"]) {
            const f = POR_ANCHURA[ancho].filas[id];
            // En el «antes» las etiquetas entraban en el reparto de seis, así
            // que en cuanto la fila pasaba de ese tope se iban dentro del «+N».
            if (ROTO && (id === "justas" || id === "desborda")) {
                assert.equal(f.etiquetas, null, `ANTES: las etiquetas caían dentro del «+N» (${id})`);
                assert.ok(f.mas, `ANTES: y en su sitio quedaba el «+N» (${id})`);
                continue;
            }
            assert.ok(f.etiquetas, `falta la pastilla de etiquetas en ${id} a ${ancho}`);
        }
    }
});

test("el caso del reporte: dos etiquetas y la fila decía «+1»", () => {
    for (const ancho of ANCHURAS) {
        const f = POR_ANCHURA[ancho].filas.justas;
        if (ROTO) {
            // Exactamente la captura: una sola pastilla escondida —la de las
            // etiquetas— así que el «+1» se leía como «una etiqueta» habiendo
            // dos. Y era una caja de 18 × 24, o sea un óvalo de pie.
            assert.equal(f.mas.texto, "+1", `ANTES: la fila decía «+1» (${ancho})`);
            assert.ok(f.mas.w < f.mas.h - 1, `ANTES: el «+1» salía de ${f.mas.w} × ${f.mas.h}`);
            continue;
        }
        /*
         * Lo que se afirma es que la de etiquetas está EN el renglón y dice el
         * total, no que no haya «+N».
         *
         * Desde que el renglón mide su hueco en vez de cortar por un tope de
         * 6, esta fila sí deja algo fuera en la columna más estrecha —a 1024
         * pide 320,9 px de 316— y eso es lo correcto: antes «cabía» porque se
         * partía en dos líneas. Lo que no puede volver a pasar es que la
         * escondida sea la de etiquetas.
         */
        assert.ok(f.etiquetas, `la pastilla de etiquetas sigue en el renglón (${ancho})`);
        assert.equal(f.etiquetas.texto, "2", "y lo que se lee es el total de etiquetas");
        if (f.mas) {
            assert.ok(
                f.etiquetas.l < f.mas.l,
                `las etiquetas van delante del «+N», no dentro (${ancho})`,
            );
        }
    }
});

test("enseña el número TOTAL de etiquetas, no cuántas pastillas sobraron", () => {
    if (ROTO) return;
    for (const ancho of ANCHURAS) {
        for (const id of ["pocas", "justas", "desborda"]) {
            assert.equal(
                POR_ANCHURA[ancho].filas[id].etiquetas.texto,
                "2",
                `con dos etiquetas tiene que decir 2 (${id}, ${ancho})`,
            );
        }
        assert.equal(POR_ANCHURA[ancho].filas.unaSola.etiquetas.texto, "1");
    }
});

test("las etiquetas son una pastilla CON color, no una caja en blanco", () => {
    if (ROTO) return;
    for (const ancho of ANCHURAS) {
        const e = POR_ANCHURA[ancho].filas.pocas.etiquetas;
        const [, r, g, b] = e.fondo.match(/(\d+),\s*(\d+),\s*(\d+)/).map(Number);
        // Violeta de verdad: el azul manda sobre el verde y el fondo no es un
        // gris (los tres canales casi iguales), que es lo que se veía antes.
        assert.ok(b > g + 8, `el fondo de las etiquetas no es violeta: ${e.fondo} (${ancho})`);
        assert.equal(e.borde, "1px", "lleva borde, como las demás");
    }
});

test("el globo dice los nombres de TODAS las etiquetas", () => {
    if (ROTO) return;
    for (const ancho of ANCHURAS) {
        const globo = POR_ANCHURA[ancho].globo;
        assert.match(globo, /2 etiquetas/, `el globo no dice cuántas hay (${ancho})`);
        assert.match(globo, /Cliente VIP/, `el globo no dice la primera (${ancho})`);
        assert.match(globo, /Seguimiento marzo/, `el globo no dice la segunda (${ancho})`);
    }
});

// ── 3. El asesor ─────────────────────────────────────────────────────────
test("el asesor es un CÍRCULO, no un óvalo de pie", () => {
    for (const ancho of ANCHURAS) {
        for (const id of ["pocas", "justas", "desborda", "unaSola"]) {
            const a = POR_ANCHURA[ancho].filas[id].asesor;
            if (ROTO) {
                assert.ok(
                    a.w < a.h - 1,
                    `ANTES: el círculo del asesor salía estirado (${a.w} × ${a.h}, ${id}, ${ancho})`,
                );
                continue;
            }
            assert.equal(a.w, a.h, `el asesor no es redondo: ${a.w} × ${a.h} (${id}, ${ancho})`);
            assert.equal(a.relleno, "0px|0px", "un avatar no lleva relleno: el ancho es el alto");
        }
    }
});

// ── La regla que sostiene los dos últimos ────────────────────────────────
test("NINGUNA pastilla de la fila es más estrecha que alta", () => {
    for (const ancho of ANCHURAS) {
        for (const id of FILAS) {
            for (const p of POR_ANCHURA[ancho].filas[id].pastillas) {
                if (ROTO) continue; // el «antes» es justamente lo que las tenía
                assert.ok(
                    p.w >= p.h - 0.5,
                    `«${p.texto || "(icono)"}» sale de ${p.w} × ${p.h} en ${id} a ${ancho}`,
                );
            }
        }
    }
});

test("todas miden 24 de alto, con el mismo redondeo y en la misma línea", () => {
    if (ROTO) return;
    for (const ancho of ANCHURAS) {
        for (const id of FILAS) {
            const ps = POR_ANCHURA[ancho].filas[id].pastillas;
            for (const p of ps) {
                assert.equal(p.h, 24, `«${p.texto || "(icono)"}» mide ${p.h} de alto (${id}, ${ancho})`);
                assert.equal(p.redondeo, "9999px", `«${p.texto || "(icono)"}» no es redondeada`);
            }
            // Todas las de un mismo renglón, centradas en la misma línea.
            const renglones = new Set(ps.map((p) => Math.round(p.centro / 8)));
            assert.ok(renglones.size <= 2, `la fila se parte en más de dos renglones (${id}, ${ancho})`);
        }
    }
});

test("sin etiquetas, sin etapa y sin asesor no queda ni pastilla ni hueco", () => {
    if (ROTO) return;
    for (const ancho of ANCHURAS) {
        const f = POR_ANCHURA[ancho].filas.sinNada;
        assert.equal(f.etiquetas, null, "no hay etiquetas que resumir");
        assert.equal(f.etapa, null, "la cuenta no usa embudos");
        assert.equal(f.mas, null, "no sobra nada, así que no hay «+N»");
        // Queda la calificación, que se pinta siempre: una sola pastilla y UN
        // renglón, nunca una franja vacía ni un segundo renglón de hueco.
        //
        // El alto es 28 y no 24 a propósito: el disparador del selector de
        // lead es un `button` de 28 px con su pastilla de 24 centrada dentro
        // (el área de pulsación). Lo mismo que ya anota el banco del relleno.
        assert.equal(f.pastillas.length, 1, "solo la calificación");
        assert.ok(
            f.altoDeLaCaja >= 24 && f.altoDeLaCaja <= 28,
            `la caja mide lo que su única pastilla, en un renglón (${f.altoDeLaCaja})`,
        );
    }
});

test("el «+N» es lo que NO cupo, y también es una pastilla", () => {
    if (ROTO) return;
    for (const ancho of ANCHURAS) {
        const f = POR_ANCHURA[ancho].filas.desborda;
        assert.ok(f.mas, `falta el «+N» en la fila que desborda (${ancho})`);
        assert.equal(f.mas.h, 24, "mide lo que las demás");
        assert.ok(f.mas.w >= f.mas.h - 0.5, `el «+N» sale de ${f.mas.w} × ${f.mas.h} (${ancho})`);
        assert.equal(f.mas.borde, "1px", "lleva borde, como las demás");
        // Y va DETRÁS de las etiquetas. Se compara el orden en el DOM y no la
        // posición: con la columna de verdad la fila puede repartirse en dos
        // renglones, y entonces lo último está a la izquierda de lo anterior.
        const ultimas = f.pastillas.slice(-2).map((p) => p.texto);
        assert.deepEqual(ultimas, ["2", `+${f.mas.texto.slice(1)}`], `el orden del final: ${ultimas}`);
    }
});

test("la fila no se desborda a lo ancho en ninguna anchura", () => {
    for (const ancho of ANCHURAS) {
        for (const id of FILAS) {
            assert.equal(POR_ANCHURA[ancho].filas[id].desborda, false, `${id} desborda a ${ancho}`);
        }
        assert.ok(
            POR_ANCHURA[ancho].anchoPagina <= ancho,
            `la página se desplaza a lo ancho a ${ancho} (${POR_ANCHURA[ancho].anchoPagina})`,
        );
    }
});
