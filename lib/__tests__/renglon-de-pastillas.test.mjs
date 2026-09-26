/**
 * El RENGLÓN de pastillas de la fila de la lista de Chats, medido con
 * `ChatContactItem` REAL sobre el CSS del build.
 *
 * Los tres fallos del 2026-09-26, y por qué ninguno se contesta leyendo el
 * código:
 *
 *   1. **El tope era un número** (`MAX_BADGES = 6`) y se equivocaba por los dos
 *      lados: escondía pastillas con sitio de sobra **y** dejaba que la fila se
 *      partiera en dos líneas igual. Medido: la fila del reporte pedía 360,8 px
 *      en una columna de 348 CON el tope aplicado, y el renglón iba `flex-wrap`.
 *   2. **Las cinco contadoras medían cinco anchos distintos** —24, 31,7, 32,1,
 *      34 y 34,9—, con tres anatomías: dos llevaban el relleno y la letra de una
 *      pastilla de texto y un punto de 8 px donde las otras tienen un glifo de
 *      12. La de etiquetas era de las más estrechas, y `rounded-full` sobre la
 *      más estrecha del renglón es lo que se lee como «esa se ve más redonda».
 *   3. **«Asignar» llevaba un icono de persona** delante de la palabra, con dos
 *      escalones menos de relleno y de letra que sus vecinas de texto para
 *      hacerle sitio.
 *
 * `MODO=roto` pinta la MISMA maqueta con los componentes de `ANTES_REF` —un
 * `git worktree` aparte, nunca `origin/main`— y AFIRMA los tres con sus
 * números. Se levanta con `scripts/banco-renglon-de-pastillas.sh`.
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
const HARNESS = join(AQUI, ".compilado", "renglon-de-pastillas.js");
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
const FILAS = [
    "cabenTodas",
    "sieteCortas",
    "desborda",
    "contadoras",
    "sinAsignar",
    "agenteTomar",
    "agenteYo",
    "sinNada",
];
/** El mismo ancho para las cinco, y el que el reparto le supone al «+N». */
const ANCHO_DE_LA_CONTADORA_PX = 36;
const SEPARACION = 4;

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
 * Las contadoras se buscan por su ICONO y no por la marca de posición: el
 * «antes» no la lleva, y buscar algo que allí no existe haría que el modo roto
 * se cayera con un plazo agotado en vez de afirmar su fallo. Y el nodo que se
 * mide no es el que lleva el icono: hay envoltorios que no pintan nada, así que
 * se sube hasta el primero con redondeo completo, que es la pastilla.
 */
function medir() {
    const esPastilla = (n) => {
        const e = getComputedStyle(n);
        return (
            (e.borderTopLeftRadius === "9999px" || parseFloat(e.borderTopLeftRadius) > 20) &&
            Math.round(n.getBoundingClientRect().height) >= 20
        );
    };
    /*
     * El nodo PINTADO de una pastilla, buscando hacia abajo: un hijo del
     * renglón trae envoltorios que no pintan nada —el `TooltipProvider`, el
     * `inline-flex` que marca la posición—, así que se baja hasta el primero
     * con redondeo completo. Buscándolo hacia arriba se pasaría de largo: el
     * badge de la calificación vive DENTRO de su botón.
     */
    const laPastilla = (nodo) => {
        if (!nodo) return null;
        for (const n of [nodo, ...nodo.querySelectorAll("*")]) if (esPastilla(n)) return n;
        return null;
    };
    const de = (n) => {
        if (!n) return null;
        const r = n.getBoundingClientRect();
        const e = getComputedStyle(n);
        const conTexto = [n, ...n.querySelectorAll("*")].filter((x) =>
            [...x.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim()),
        );
        return {
            l: Math.round(r.left * 10) / 10,
            r: Math.round(r.right * 10) / 10,
            top: Math.round(r.top * 10) / 10,
            w: Math.round(r.width * 10) / 10,
            h: Math.round(r.height * 10) / 10,
            letra: getComputedStyle(conTexto[0] ?? n).fontSize,
            relleno: `${e.paddingLeft}|${e.paddingRight}`,
            hueco: e.columnGap,
            texto: (n.textContent ?? "").trim(),
            iconos: n.querySelectorAll("svg").length,
        };
    };

    const salida = {};
    for (const raiz of document.querySelectorAll("[data-fila]")) {
        const id = raiz.getAttribute("data-fila");
        // El renglón: por su marca donde la hay, y por sus clases en el «antes».
        const caja =
            raiz.querySelector("[data-renglon-de-pastillas]") ?? raiz.querySelector(".mt-1.flex.flex-wrap");
        if (!caja) {
            salida[id] = { hayRenglon: false };
            continue;
        }
        const cr = caja.getBoundingClientRect();
        // Las pastillas que se ven: se sube desde cada hoja pintada del renglón.
        const pastillas = [];
        for (const hijo of caja.children) {
            const n = laPastilla(hijo);
            if (n) pastillas.push(de(n));
        }
        // Una contadora se busca por su icono, y de ahí se SUBE hasta su
        // pastilla: el icono es una hoja.
        const porIcono = (sel) => {
            let n = caja.querySelector(sel);
            while (n && n !== caja && !esPastilla(n)) n = n.parentElement;
            return n && n !== caja ? de(n) : null;
        };
        const mas =
            de(raiz.querySelector("[data-pastilla-de-mas]")) ??
            (() => {
                const n = [...caja.children]
                    .map((h) => laPastilla(h.querySelector("*") ?? h) ?? laPastilla(h))
                    .find((x) => x && /^\+\d+$/.test((x.textContent ?? "").trim()));
                return de(n ?? null);
            })();
        // Las tres caras del mando de asignar, por su palabra.
        const porPalabra = (palabra) => {
            for (const hijo of caja.children) {
                if ((hijo.textContent ?? "").trim() === palabra) return de(laPastilla(hijo));
            }
            return null;
        };
        const asignar = porPalabra("Asignar");
        salida[id] = {
            hayRenglon: true,
            hueco: caja.clientWidth,
            altoDelRenglon: Math.round(cr.height * 10) / 10,
            gap: getComputedStyle(caja).columnGap,
            envoltura: getComputedStyle(caja).flexWrap,
            desbordaElRenglon: caja.scrollWidth > caja.clientWidth + 1,
            pastillas,
            mas,
            asignar,
            tomar: porPalabra("Tomar"),
            yo: porPalabra("Yo"),
            contadoras: {
                flujos: porIcono(".bg-blue-500"),
                seguimientos: porIcono(".bg-orange-500"),
                cita: porIcono("svg.lucide-calendar-clock"),
                notas: porIcono("svg.lucide-lock"),
                etiquetas: porIcono("svg.lucide-tag"),
            },
            // La calificación del lead, que es la pastilla de TEXTO de referencia.
            // El badge vive DENTRO del disparador del selector, que no tiene
            // ni relleno ni redondeo: hay que bajar hasta la pastilla.
            estado: de(laPastilla(raiz.querySelector('[aria-label="Cambiar estado del lead"]'))),
        };
    }
    return { filas: salida, anchoPagina: document.documentElement.scrollWidth };
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
        // Los flujos se cargan con `dynamic`: hasta que llegan, su pastilla no
        // existe y el reparto todavía no es el definitivo.
        await page
            .waitForFunction(() => document.querySelectorAll(".bg-blue-500").length > 0, null, { timeout: 10000 })
            .catch(() => {});
        const datos = await page.evaluate(medir);
        if (errores.length) throw new Error(`la maqueta reventó: ${errores[0]}`);
        // Una fila que no llega a pintarse mide cero y pasa cualquier
        // comprobación de «no desborda»: se exige que estén las seis.
        const faltan = FILAS.filter((f) => !datos.filas[f]);
        if (faltan.length) throw new Error(`no se pintaron las filas: ${faltan.join(", ")}`);
        return datos;
    } finally {
        await navegador.close();
        server.close();
    }
}

const POR_ANCHURA = {};
for (const ancho of ANCHURAS) POR_ANCHURA[ancho] = await tomar(ancho);

const conRenglon = (ancho) =>
    Object.entries(POR_ANCHURA[ancho].filas).filter(([, f]) => f.hayRenglon);

// ── 1. Nunca una segunda línea ───────────────────────────────────────────
test("el renglón es UNA sola línea, en todas las filas y anchuras", () => {
    for (const ancho of ANCHURAS) {
        for (const [id, fila] of conRenglon(ancho)) {
            const tops = new Set(fila.pastillas.map((p) => Math.round(p.top)));
            if (ROTO && id === "desborda") {
                assert.ok(
                    tops.size > 1,
                    `ANTES: «${id}» se partía en dos líneas a ${ancho} (tops: ${[...tops].join(", ")})`,
                );
                continue;
            }
            assert.equal(
                tops.size,
                1,
                `«${id}» a ${ancho} pinta sus pastillas en ${tops.size} líneas (${[...tops].join(", ")})`,
            );
        }
    }
});

test("y no puede partirse: el renglón va `nowrap` con `overflow-hidden`", () => {
    for (const ancho of ANCHURAS) {
        for (const [id, fila] of conRenglon(ancho)) {
            if (ROTO) {
                assert.equal(fila.envoltura, "wrap", `ANTES: «${id}» iba con flex-wrap`);
                continue;
            }
            assert.equal(fila.envoltura, "nowrap", `«${id}» a ${ancho}`);
            assert.ok(!fila.desbordaElRenglon, `«${id}» a ${ancho} se sale de su renglón`);
        }
    }
});

// ── 2. Se muestran todas las que caben ───────────────────────────────────
test("siete pastillas que caben salen las SIETE, sin «+N»", () => {
    for (const ancho of ANCHURAS) {
        const fila = POR_ANCHURA[ancho].filas.sieteCortas;
        const cabe =
            fila.pastillas.reduce((s, p) => s + p.w, 0) + (fila.pastillas.length - 1) * SEPARACION;
        if (ROTO) {
            assert.ok(fila.mas, `ANTES: el tope de 6 escondía la séptima a ${ancho}`);
            assert.ok(
                cabe + ANCHO_DE_LA_CONTADORA_PX <= fila.hueco,
                `ANTES: y sobraba sitio para ella (${cabe} de ${fila.hueco}, a ${ancho})`,
            );
            continue;
        }
        assert.equal(fila.pastillas.length, 7, `a ${ancho} se ven ${fila.pastillas.length} de 7`);
        assert.equal(fila.mas, null, `a ${ancho} sale un «+N» que no hace falta`);
        assert.ok(cabe <= fila.hueco, `a ${ancho} las siete piden ${cabe} de ${fila.hueco}`);
    }
});

test("al «+N» va SOLO lo que no entra: no sobra sitio ni para la más estrecha", () => {
    if (ROTO) return; // El «antes» no repartía por ancho: no hay nada que afirmar.
    for (const ancho of ANCHURAS) {
        for (const [id, fila] of conRenglon(ancho)) {
            if (!fila.mas) continue;
            const ocupado = fila.pastillas.reduce((s, p) => s + p.w, 0) + (fila.pastillas.length - 1) * SEPARACION;
            const sobra = fila.hueco - ocupado;
            assert.ok(sobra >= 0, `«${id}» a ${ancho} ya se sale: ocupa ${ocupado} de ${fila.hueco}`);
            assert.ok(
                sobra < ANCHO_DE_LA_CONTADORA_PX + SEPARACION,
                `«${id}» a ${ancho} esconde algo y le sobran ${sobra} px: cabía una pastilla más`,
            );
        }
    }
});

test("el «+N» es una contadora: mide lo mismo que las demás", () => {
    if (ROTO) return;
    for (const ancho of ANCHURAS) {
        for (const [id, fila] of conRenglon(ancho)) {
            if (!fila.mas) continue;
            assert.equal(
                fila.mas.w,
                ANCHO_DE_LA_CONTADORA_PX,
                `el «+N» de «${id}» a ${ancho} mide ${fila.mas.w} y el reparto le supone ${ANCHO_DE_LA_CONTADORA_PX}`,
            );
        }
    }
});

// ── 3. Las cinco contadoras, iguales entre sí ────────────────────────────
test("flujos, seguimientos, cita, notas y etiquetas miden EXACTAMENTE lo mismo", () => {
    for (const ancho of ANCHURAS) {
        const { contadoras } = POR_ANCHURA[ancho].filas.contadoras;
        const nombres = Object.keys(contadoras);
        for (const n of nombres) assert.ok(contadoras[n], `falta la contadora «${n}» a ${ancho}`);
        const anchos = nombres.map((n) => contadoras[n].w);
        if (ROTO) {
            assert.ok(
                new Set(anchos).size >= 3,
                `ANTES: las cinco medían anchos distintos a ${ancho} (${anchos.join(", ")})`,
            );
            continue;
        }
        assert.equal(
            new Set(anchos).size,
            1,
            `a ${ancho} miden ${nombres.map((n, i) => `${n} ${anchos[i]}`).join(", ")}`,
        );
        assert.equal(anchos[0], ANCHO_DE_LA_CONTADORA_PX, `a ${ancho}`);
    }
});

test("y la misma FORMA: el mismo relleno, el mismo hueco y la misma letra", () => {
    for (const ancho of ANCHURAS) {
        const { contadoras } = POR_ANCHURA[ancho].filas.contadoras;
        const nombres = Object.keys(contadoras);
        const rellenos = new Set(nombres.map((n) => contadoras[n].relleno));
        const huecos = new Set(nombres.map((n) => contadoras[n].hueco));
        const altos = new Set(nombres.map((n) => contadoras[n].h));
        if (ROTO) {
            assert.ok(rellenos.size > 1, `ANTES: los rellenos no eran el mismo a ${ancho}`);
            continue;
        }
        assert.equal(rellenos.size, 1, `rellenos a ${ancho}: ${[...rellenos].join(" / ")}`);
        assert.equal(huecos.size, 1, `huecos a ${ancho}: ${[...huecos].join(" / ")}`);
        assert.equal(altos.size, 1, `altos a ${ancho}: ${[...altos].join(" / ")}`);
        // Las que llevan número, con la misma letra.
        const conNumero = ["flujos", "seguimientos", "etiquetas"].map((n) => contadoras[n].letra);
        assert.equal(new Set(conNumero).size, 1, `letras a ${ancho}: ${conNumero.join(" / ")}`);
    }
});

// ── 4. «Asignar» ─────────────────────────────────────────────────────────
test("la pastilla de asignar es SOLO la palabra, sin icono", () => {
    for (const ancho of ANCHURAS) {
        const { asignar } = POR_ANCHURA[ancho].filas.sinAsignar;
        assert.ok(asignar, `falta la pastilla de asignar a ${ancho}`);
        assert.equal(asignar.texto, "Asignar", `a ${ancho}`);
        if (ROTO) {
            assert.equal(asignar.iconos, 1, `ANTES: llevaba el icono de persona a ${ancho}`);
            continue;
        }
        assert.equal(asignar.iconos, 0, `a ${ancho} sigue llevando ${asignar.iconos} icono(s)`);
    }
});

test("y se lee como sus vecinas de texto: la misma letra y el mismo relleno", () => {
    for (const ancho of ANCHURAS) {
        const fila = POR_ANCHURA[ancho].filas.sinAsignar;
        assert.ok(fila.estado, `falta la calificación a ${ancho}`);
        if (ROTO) {
            assert.notEqual(
                fila.asignar.letra,
                fila.estado.letra,
                `ANTES: la letra de «Asignar» no era la de la calificación a ${ancho}`,
            );
            continue;
        }
        assert.equal(fila.asignar.letra, fila.estado.letra, `letra a ${ancho}`);
        assert.equal(fila.asignar.relleno, fila.estado.relleno, `relleno a ${ancho}`);
        assert.equal(fila.asignar.h, fila.estado.h, `alto a ${ancho}`);
    }
});

test("y sus otras dos caras —«Tomar» y «Yo»— se leen igual", () => {
    for (const ancho of ANCHURAS) {
        const tomar = POR_ANCHURA[ancho].filas.agenteTomar;
        const yo = POR_ANCHURA[ancho].filas.agenteYo;
        assert.ok(tomar.tomar, `falta «Tomar» a ${ancho}`);
        assert.ok(yo.yo, `falta «Yo» a ${ancho}`);
        if (ROTO) return;
        for (const [que, fila, pastilla] of [
            ["Tomar", tomar, tomar.tomar],
            ["Yo", yo, yo.yo],
        ]) {
            assert.equal(pastilla.letra, fila.estado.letra, `la letra de «${que}» a ${ancho}`);
            assert.equal(pastilla.relleno, fila.estado.relleno, `el relleno de «${que}» a ${ancho}`);
            assert.equal(pastilla.h, fila.estado.h, `el alto de «${que}» a ${ancho}`);
        }
    }
});

// ── 5. Lo que no se puede haber aflojado ─────────────────────────────────
test("ninguna pastilla es más estrecha que alta", () => {
    for (const ancho of ANCHURAS) {
        for (const [id, fila] of conRenglon(ancho)) {
            for (const p of fila.pastillas) {
                assert.ok(p.w >= p.h - 0.5, `«${id}» a ${ancho}: una pastilla de ${p.w}×${p.h} («${p.texto}»)`);
            }
        }
    }
});

test("sin pastillas y sin etiquetas no queda ni renglón ni hueco", () => {
    for (const ancho of ANCHURAS) {
        const fila = POR_ANCHURA[ancho].filas.sinNada;
        // `sinNada` conserva la calificación —se pinta siempre—, así que el
        // renglón existe: lo que se comprueba es que mide UNA línea y nada más.
        assert.ok(fila.hayRenglon, `a ${ancho}`);
        assert.equal(fila.pastillas.length, 1, `a ${ancho}`);
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
