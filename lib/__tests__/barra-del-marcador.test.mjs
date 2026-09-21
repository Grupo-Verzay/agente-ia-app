/**
 * La barra de arriba de CRM › Llamadas, medida en Chromium sobre el CSS del
 * build.
 *
 * # Las dos preguntas del encargo, que no se contestan leyendo
 *
 *   1. **En computador todo va en UNA fila; en el teléfono en DOS** —arriba el
 *      campo con sus dos botones, abajo los conteos y los filtros—.
 *   2. **Sin que nada se apriete ni se parta**: ningún rótulo recortado,
 *      ningún mando fuera de su tarjeta, y la página sin desplazamiento
 *      horizontal. Lo que no cabe **se desplaza** dentro de su carril.
 *
 * # El modo roto mide lo que HABÍA, no una copia
 *
 * `MODO=roto` monta los dos bloques de `origin/main` —el recuadro «Marcador»
 * con su palabra, su icono y su «Rellamar:», y la cabecera «Historial» con los
 * conteos y los filtros dos bloques más abajo— sacados con `git show`. Así lo
 * que el «antes» mide es la pantalla que había y no lo que alguien recuerde de
 * ella, que es la regla de siempre de este repositorio.
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
const HARNESS = join(AQUI, ".compilado", "harness-barra-del-marcador.js");

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
                    `<script type="module" src="/harness-barra-del-marcador.js"></script></body></html>`,
            );
            return;
        }
        if (u === "/harness-barra-del-marcador.js") {
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
    await page.goto(base + "/", { waitUntil: "load" });
    await page.waitForFunction("window.listo === true", { timeout: 20000 });
    await page.evaluate((w) => {
        document.getElementById("hueco").style.width = w + "px";
    }, HUECO[ancho] ?? ancho);
    await page.evaluate(() => window.pintarBarra());
    await page.waitForTimeout(200);
    return {
        page,
        async cerrar() {
            await navegador.close();
            server.close();
        },
    };
}

/** Lo que hace falta medir, en una sola pasada dentro del navegador. */
function medir(page) {
    return page.evaluate(() => {
        const caja = (n) => {
            if (!n) return null;
            const r = n.getBoundingClientRect();
            return { x: r.x, y: r.y, w: r.width, h: r.height, abajo: r.bottom, dcha: r.right };
        };
        const fondo = (sel) => {
            const n = document.querySelector(sel);
            return n ? getComputedStyle(n).backgroundColor : "";
        };
        const barra = document.querySelector('[data-barra="marcador"]');
        const marcar = document.querySelector('[data-zona="marcar"]');
        const filtros = document.querySelector('[data-zona="filtros"]');
        // El carril que se desplaza es el padre del bloque de filtros.
        const carril = filtros?.parentElement ?? null;
        const mandos = [
            ...document.querySelectorAll(
                '[data-boton="llamar"], [data-boton="llamar-ia"], [data-grupo="direccion"] button',
            ),
        ];
        return {
            barra: caja(barra),
            marcar: caja(marcar),
            filtros: caja(filtros),
            carril: carril
                ? { ...caja(carril), scrollW: carril.scrollWidth, clientW: carril.clientWidth }
                : null,
            // Un rótulo recortado se ve como texto que no cabe en su caja.
            recortados: mandos
                .filter((n) => n.scrollWidth > n.clientWidth + 1)
                .map((n) => n.textContent.trim()),
            // Nada puede salirse de la tarjeta **sin forma de traerlo**.
            //
            // Lo que vive dentro del carril sí puede quedar fuera de la caja:
            // eso es exactamente lo que hace un carril que se desplaza, y su
            // rectángulo lo sigue diciendo aunque el navegador lo recorte. Así
            // que un mando solo cuenta como perdido cuando **no tiene ningún
            // antepasado que se desplace** — la primera versión de esta medida
            // no lo miraba y cantaba los tres filtros a 1024, que estaban
            // perfectamente alcanzables.
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
            guia: document.querySelector("input")?.getAttribute("placeholder") ?? "",
            // Sólido o de contorno, y eso NO se mide por la opacidad.
            //
            // La primera versión preguntaba si el fondo era transparente, y un
            // botón `variant="outline"` de esta casa **no lo es**: lleva
            // `bg-background`, que computa a blanco opaco. Así que el «antes»
            // pasaba por sólido y el modo roto se ponía en rojo sobre una
            // pantalla que estaba exactamente como se dice que estaba.
            //
            // Lo que separa un relleno de un contorno es que **el fondo del
            // botón no sea el de la tarjeta**; y «en otro color que lo
            // distinga», que no sea el de «Llamar».
            fondoIa: fondo('[data-boton="llamar-ia"]'),
            fondoLlamar: fondo('[data-boton="llamar"]'),
            fondoTarjeta: barra ? getComputedStyle(barra.parentElement).backgroundColor : "",
            altoDeLosMandos: (() => {
                const n = document.querySelector('[data-boton="llamar"]');
                const m = document.querySelector('[data-boton="llamar-ia"]');
                return n && m ? [n.getBoundingClientRect().height, m.getBoundingClientRect().height] : [];
            })(),
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

test("en computador es UNA fila, y en el teléfono DOS", async (t) => {
    if (faltaNavegador(t)) return;

    for (const ancho of ANCHURAS_DE_COMPUTADOR) {
        const { page, cerrar } = await abrir(ancho);
        try {
            const m = await medir(page);
            if (ROTO) {
                // EL ANTES: los conteos y los filtros no están en la barra del
                // marcador, están en otro bloque más abajo.
                assert.ok(
                    m.filtros === null || m.filtros.y > (m.marcar?.abajo ?? 0) + 8,
                    `a ${ancho} el antes tenía los filtros en otro bloque, no en la fila del marcador`,
                );
                continue;
            }
            assert.ok(m.marcar && m.filtros, `a ${ancho} faltan las dos zonas de la barra`);
            // Una sola fila: las dos zonas comparten banda vertical.
            const centroMarcar = m.marcar.y + m.marcar.h / 2;
            const centroFiltros = m.filtros.y + m.filtros.h / 2;
            assert.ok(
                Math.abs(centroMarcar - centroFiltros) <= 4,
                `a ${ancho} las dos zonas no van en la misma fila ` +
                    `(marcar ${centroMarcar.toFixed(1)}, filtros ${centroFiltros.toFixed(1)})`,
            );
            // Y los filtros, pegados al borde derecho de la tarjeta.
            assert.ok(
                m.barra.dcha - m.filtros.dcha <= 14,
                `a ${ancho} los filtros no llegan al borde derecho (sobran ${(m.barra.dcha - m.filtros.dcha).toFixed(1)} px)`,
            );
        } finally {
            await cerrar();
        }
    }

    const { page, cerrar } = await abrir(MOVIL);
    try {
        const m = await medir(page);
        if (ROTO) return;
        assert.ok(
            m.filtros.y >= m.marcar.abajo - 1,
            "en el teléfono los filtros van en un renglón propio, debajo del campo y sus botones",
        );
        // Y no en tres: el campo y los dos botones siguen juntos arriba.
        assert.ok(
            m.marcar.h <= 48,
            `en el teléfono la fila de marcar se partió (mide ${m.marcar.h} px)`,
        );
    } finally {
        await cerrar();
    }
});

test("no se aprieta ni se parte nada, en las cuatro anchuras", async (t) => {
    if (faltaNavegador(t)) return;
    for (const ancho of [...ANCHURAS_DE_COMPUTADOR, MOVIL]) {
        const { page, cerrar } = await abrir(ancho);
        try {
            const m = await medir(page);
            if (ROTO) continue;
            assert.deepEqual(
                m.recortados,
                [],
                `a ${ancho} hay rótulos recortados: ${JSON.stringify(m.recortados)}`,
            );
            assert.deepEqual(
                m.fuera,
                [],
                `a ${ancho} hay mandos fuera de la tarjeta: ${JSON.stringify(m.fuera)}`,
            );
            assert.equal(m.paginaDesborda, false, `a ${ancho} la página se desplaza a lo ancho`);
            // Lo que no cabe se desplaza dentro de su carril, no desborda.
            assert.ok(
                m.carril && m.carril.scrollW >= m.carril.clientW,
                `a ${ancho} el carril de los filtros no existe`,
            );
            // Los dos botones pesan lo mismo: mismo alto.
            const [a, b] = m.altoDeLosMandos;
            assert.equal(a, b, `a ${ancho} «Llamar» y «Llamar con IA» no miden lo mismo`);
        } finally {
            await cerrar();
        }
    }
});

test("en el teléfono los filtros se DESPLAZAN, no se cortan", async (t) => {
    if (faltaNavegador(t)) return;
    if (ROTO) return;
    const { page, cerrar } = await abrir(MOVIL);
    try {
        const m = await medir(page);
        // Su contenido no se comprime: o cabe, o hay más y se desplaza.
        assert.ok(
            m.carril.scrollW >= m.filtros.w - 1,
            "el contenido del carril se comprimió en vez de desplazarse",
        );
        assert.equal(m.paginaDesborda, false, "la página no se desplaza: lo hace el carril");
    } finally {
        await cerrar();
    }
});

test("las palabras que sobraban ya no están, y el botón de IA es sólido", async (t) => {
    if (faltaNavegador(t)) return;
    const { page, cerrar } = await abrir(1280);
    try {
        const m = await medir(page);
        const solido = m.fondoIa !== m.fondoTarjeta;

        if (ROTO) {
            // EL ANTES, tal cual estaba en `origin/main`.
            assert.match(m.texto, /Marcador/, "el antes se presentaba con la palabra «Marcador»");
            assert.match(m.texto, /Historial/, "el antes tenía la cabecera «Historial»");
            assert.match(m.texto, /Rellamar/, "el antes tenía el control «Rellamar»");
            assert.match(
                m.guia,
                /Número con código de país/,
                "el antes tenía el texto guía largo",
            );
            assert.equal(
                solido,
                false,
                "el antes tenía «Llamar con IA» en contorno: su fondo era el de la tarjeta",
            );
            return;
        }

        assert.doesNotMatch(m.texto, /Marcador/, "«Marcador» se quitó");
        assert.doesNotMatch(m.texto, /Historial/, "«Historial» se quitó");
        assert.doesNotMatch(m.texto, /Rellamar/, "«Rellamar» se quitó entero");
        assert.equal(m.guia, "Ej. 573001234567", "el texto guía es solo el ejemplo");
        assert.ok(solido, "«Llamar con IA» va sólido: su fondo no es el de la tarjeta");
        assert.notEqual(
            m.fondoIa,
            m.fondoLlamar,
            "«Llamar con IA» va en otro color que lo distinga de «Llamar»",
        );
        // Los conteos y los tres filtros, arriba.
        for (const rotulo of ["Todas", "Salientes", "Entrantes"]) {
            assert.match(m.texto, new RegExp(rotulo), `falta el filtro «${rotulo}» en la barra`);
        }
    } finally {
        await cerrar();
    }
});
