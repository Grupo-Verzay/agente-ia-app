/**
 * La fila de pastillas de una tarjeta de Chats llega al filo derecho con el
 * MISMO margen que a la izquierda.
 *
 * # Qué fallaba
 *
 * La fila ya llegaba al borde de su tarjeta. Lo que no llegaba al borde de la
 * columna era la tarjeta: la lista desplaza con `overflow-y-auto`, y con barras
 * clásicas (Windows, Linux) la barra se queda su ancho aunque su pista sea
 * transparente. Medido antes del arreglo: 13 px de la columna a la primera
 * pastilla y 23 px de la última posible al borde derecho. Esos 10 px de más son
 * el «espacio muerto» y son los que mandaban las etiquetas a otra línea.
 *
 * # Por qué en Chromium y SIN `--hide-scrollbars`
 *
 * Playwright lanza Chromium escondiendo las barras por defecto. Con eso el
 * fallo desaparece del banco: la lista mide lo mismo con barra y sin ella y las
 * dos versiones salen iguales. Aquí se quita esa bandera, así que lo que se
 * mide es lo que ve quien usa la App en Windows.
 *
 * # Los dos modos
 *
 * `MODO=roto` monta la lista con la clase de `ANTES_REF` (sacada de git por el
 * script) y AFIRMA el fallo: la barra ocupa, el margen derecho es el izquierdo
 * más la barra, y las etiquetas se caen de línea donde con el arreglo caben.
 *
 * Se levanta con `scripts/banco-pastillas-de-la-fila.sh`.
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
const HARNESS = join(AQUI, ".compilado", "harness-pastillas-de-la-fila.js");
const DIR_CSS = join(RAIZ, ".next", "static", "css");
const CSS = fs.existsSync(DIR_CSS)
    ? fs.readdirSync(DIR_CSS).filter((f) => f.endsWith(".css")).map((f) => fs.readFileSync(join(DIR_CSS, f), "utf8")).join("\n")
    : null;

const ANCHURAS = [1440, 1280, 1024];
/** El `gap-1` de la fila de pastillas. */
const HUECO = 4;

function levantar() {
    const bundle = fs.readFileSync(HARNESS);
    const server = http.createServer((req, res) => {
        if ((req.url ?? "/").split("?")[0] === "/") {
            res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
            // El menú lateral de la plataforma abierto (16 rem) a la izquierda,
            // como en la App: la columna de Chats no depende de él, pero la
            // ficha y la conversación sí.
            res.end(
                `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">` +
                    `<style>${CSS ?? ""}</style></head>` +
                    `<body style="margin:0;height:100vh;display:flex"><nav style="width:16rem;flex-shrink:0"></nav>` +
                    `<div id="app" style="flex:1;min-width:0;height:100vh"></div>` +
                    `<script type="module" src="/h.js"></script></body></html>`,
            );
            return;
        }
        res.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8" });
        res.end(bundle);
    });
    return new Promise((r) => server.listen(0, () => r(server)));
}

let navegador = null;
let servidor = null;

async function medir(ancho, conFicha, dosCifras) {
    const ctx = await navegador.newContext({ viewport: { width: ancho, height: 900 } });
    const page = await ctx.newPage();
    const errores = [];
    page.on("pageerror", (e) => errores.push(e.message));
    await page.goto(`http://127.0.0.1:${servidor.address().port}/`, { waitUntil: "load" });
    await page.waitForFunction("window.listo === true", { timeout: 20000 });
    await page.evaluate(([f, d]) => window.pintar(f, d), [conFicha, dosCifras]);
    await page.waitForTimeout(250);
    const m = await page.evaluate(() => {
        const lista = document.querySelector("[role=list]");
        const lr = lista.getBoundingClientRect();
        // La segunda es la seleccionada (borde visible): se miden las dos.
        const filas = [...document.querySelectorAll("[role=listitem]")].slice(0, 2).map((tarjeta) => {
            const fila = tarjeta.lastElementChild;
            const fr = fila.getBoundingClientRect();
            const pastillas = [...fila.children].map((k) => {
                const r = k.getBoundingClientRect();
                return { izq: r.left, der: r.right, alto: r.top + r.height / 2 };
            });
            // Una línea = mismo centro vertical (la de estado mide 28 y las
            // demás 24, así que se compara el centro y no el borde de arriba).
            const lineas = [];
            for (const p of pastillas) {
                const l = lineas.find((x) => Math.abs(x.centro - p.alto) < 6);
                if (l) l.items.push(p);
                else lineas.push({ centro: p.alto, items: [p] });
            }
            return { filaIzq: fr.left, filaDer: fr.right, lineas: lineas.map((l) => l.items), n: pastillas.length };
        });
        return {
            barra: lista.offsetWidth - lista.clientWidth,
            desborda: lista.scrollHeight > lista.clientHeight,
            listaIzq: lr.left,
            listaDer: lr.right,
            filas,
            ficha: !!document.querySelector("[data-ficha-de-contacto]"),
            anchoPagina: document.documentElement.scrollWidth,
        };
    });
    await ctx.close();
    return { ...m, errores };
}

test.before(async () => {
    if (!chromium || !CSS) return;
    servidor = await levantar();
    navegador = await chromium.launch({
        executablePath: process.env.CHROME_BIN || undefined,
        // Sin esto Chromium esconde las barras y el fallo no existe en el banco.
        ignoreDefaultArgs: ["--hide-scrollbars"],
    });
});
test.after(async () => {
    await navegador?.close();
    servidor?.close();
});

function faltaNavegador(t) {
    if (!chromium) return t.skip("sin playwright en este equipo"), true;
    if (!CSS) return t.skip("sin el CSS del build: corre `npm run build` antes"), true;
    return false;
}

for (const ancho of ANCHURAS) {
    for (const conFicha of [false, true]) {
        const nombre = `${ancho} px, ficha ${conFicha ? "abierta" : "cerrada"}`;

        test(`${nombre}: Descartado + Asignar + tres contadores + etiquetas, mismo margen a los dos lados`, async (t) => {
            if (faltaNavegador(t)) return;
            const m = await medir(ancho, conFicha, false);
            assert.deepEqual(m.errores, [], "la página no puede reventar");
            assert.equal(m.ficha, conFicha);
            assert.ok(m.desborda, "la lista tiene que desbordar, o la barra no llegaría a salir y no se mediría nada");
            assert.ok(m.anchoPagina <= ancho, `la página no se desplaza a lo ancho (${m.anchoPagina})`);

            for (const f of m.filas) {
                assert.equal(f.n, 6, "las seis pastillas: estado, asignar, tres contadores y etiquetas");
                const izq = f.filaIzq - m.listaIzq;
                const der = m.listaDer - f.filaDer;
                const detalle = `izq ${izq.toFixed(1)} · der ${der.toFixed(1)} · barra ${m.barra}`;
                if (ROTO) {
                    assert.ok(m.barra >= 6, `ANTES: la barra ocupa ancho (${detalle})`);
                    assert.ok(der - izq >= m.barra - 0.5, `ANTES: el margen derecho es el izquierdo más la barra (${detalle})`);
                    continue;
                }
                assert.equal(m.barra, 0, `la barra de la lista no se come ancho (${detalle})`);
                assert.ok(Math.abs(der - izq) <= 0.5, `la fila acaba con el mismo margen con el que empieza (${detalle})`);

                // Si se cae de línea, que sea porque de verdad no cabe: lo que
                // queda en la línea de arriba es menos que el hueco más la
                // pastilla que bajó.
                for (let i = 1; i < f.lineas.length; i++) {
                    const arriba = f.lineas[i - 1];
                    const sobra = f.filaDer - arriba[arriba.length - 1].der;
                    const baja = f.lineas[i][0];
                    assert.ok(
                        sobra < HUECO + (baja.der - baja.izq),
                        `se cayó de línea con sitio: sobraban ${sobra.toFixed(1)} px para una pastilla de ${(baja.der - baja.izq).toFixed(1)}`,
                    );
                }
                if (ancho >= 1280) {
                    assert.equal(f.lineas.length, 1, `a ${ancho} las seis caben en una línea (${detalle})`);
                }
            }
        });

        test(`${nombre}: con contadores de dos cifras las etiquetas no se caen por la barra`, async (t) => {
            if (faltaNavegador(t)) return;
            const m = await medir(ancho, conFicha, true);
            assert.deepEqual(m.errores, []);
            const f = m.filas[0];
            const necesita = f.lineas.flat().reduce((s, p) => s + (p.der - p.izq), 0) + HUECO * (f.n - 1);
            const hay = f.filaDer - f.filaIzq;
            if (ancho < 1280) {
                // A 1024 la columna es de 22 rem y esto no cabe ni simétrico:
                // se comprueba solo que la caída es honrada.
                assert.ok(f.lineas.length === 1 || necesita > hay, `se cayó con sitio: necesita ${necesita.toFixed(1)}, hay ${hay.toFixed(1)}`);
                return;
            }
            if (ROTO) {
                assert.ok(f.lineas.length > 1, `ANTES: las etiquetas se caían (necesita ${necesita.toFixed(1)}, había ${hay.toFixed(1)})`);
                return;
            }
            assert.equal(f.lineas.length, 1, `caben en una línea: necesita ${necesita.toFixed(1)}, hay ${hay.toFixed(1)}`);
        });
    }
}
