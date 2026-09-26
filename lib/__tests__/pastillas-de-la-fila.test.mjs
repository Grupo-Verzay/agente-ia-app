/**
 * La fila de pastillas de una tarjeta de Chats cabe en UNA línea con la barra
 * de desplazamiento de la lista a la vista.
 *
 * # Qué se pidió
 *
 * La lista de Chats vuelve a enseñar su barra, como el resto de listas de la
 * plataforma (#915 la escondió). La barra se come 10 px con barras clásicas, y
 * con ella «Descartado» + «Asignar» + tres contadores + etiquetas se partía en
 * dos a 1024. El ancho se recupera en las pastillas: **cada una pierde 2 px de
 * relleno por lado, la misma cantidad todas** (`lib/pastillas-de-la-fila.ts`).
 * Ni el texto, ni el alto, ni el orden cambian.
 *
 * # Por qué en Chromium y SIN `--hide-scrollbars`
 *
 * Playwright esconde las barras por defecto, y entonces la lista mide lo mismo
 * con barra y sin ella: el caso no se ejerce. Aquí se quita esa bandera.
 *
 * # Los dos modos
 *
 * Los dos pintan la MISMA lista, con su barra. `MODO=roto` pinta las pastillas
 * de `ANTES_REF` (el script las saca de git a un árbol aparte) y AFIRMA el
 * fallo: con el relleno de antes, a 1024 las etiquetas se caen a otra línea.
 * Y en los dos se compara cada pastilla contra la MISMA tabla de relleno,
 * alto y tamaño de letra: el roto comprueba que la tabla de «antes» es cierta,
 * y el bueno que el relleno bajó exactamente 2 px por lado y lo demás no.
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
/**
 * Las seis pastillas del caso, en su orden, con su relleno horizontal por lado
 * y su tamaño de letra ANTES y AHORA. El alto es 24 en todas y en los dos
 * modos: eso es justamente lo que no puede moverse.
 *
 * Cinco bajaron 2 px por lado y nada más —que es de lo que va este banco—. La
 * de ETIQUETAS cambió además de familia en #957: era una pastilla de texto
 * (12 px, relleno de 6) y pasó a ser una CONTADORA como los recordatorios
 * —icono de 12 px y número de 10—, porque eso es lo que es. Por eso su fila
 * lleva su propio «ahora» en vez de salir de restarle 2 al «antes».
 */
const PASTILLAS = [
    { que: "estado", antes: 8, ahora: 6, letra: "12px" },
    { que: "asignar", antes: 4, ahora: 2, letra: "10px" },
    { que: "recordatorios", antes: 6, ahora: 4, letra: "10px" },
    { que: "flujos", antes: 8, ahora: 6, letra: "12px" },
    { que: "seguimientos", antes: 8, ahora: 6, letra: "12px" },
    { que: "etiquetas", antes: 8, ahora: 4, letra: "12px", letraAhora: "10px" },
];

function levantar() {
    const bundle = fs.readFileSync(HARNESS);
    const server = http.createServer((req, res) => {
        if ((req.url ?? "/").split("?")[0] === "/") {
            res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
            // El menú lateral de la plataforma abierto (16 rem) a la izquierda,
            // como en la App.
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
        // La pastilla es el primer nodo redondeado (rounded-full) dentro de
        // cada hijo de la fila: los envoltorios del tooltip y el disparador del
        // estado no tienen fondo ni borde propios.
        const laPastilla = (el) => {
            const cola = [el];
            while (cola.length) {
                const n = cola.shift();
                if (parseFloat(getComputedStyle(n).borderTopLeftRadius) >= 9) return n;
                cola.push(...n.children);
            }
            return el;
        };
        // La segunda tarjeta es la seleccionada (borde visible): se miden las dos.
        const filas = [...document.querySelectorAll("[role=listitem]")].slice(0, 2).map((tarjeta) => {
            const fila = tarjeta.lastElementChild;
            const fr = fila.getBoundingClientRect();
            const pastillas = [...fila.children].map((k) => {
                const r = k.getBoundingClientRect();
                const p = laPastilla(k);
                const cs = getComputedStyle(p);
                return {
                    izq: r.left,
                    der: r.right,
                    centro: r.top + r.height / 2,
                    relleno: [parseFloat(cs.paddingLeft), parseFloat(cs.paddingRight)],
                    alto: p.getBoundingClientRect().height,
                    // La letra del nodo que lleva el texto: en los contadores
                    // de icono el número va en un span interior de 10 px.
                    letra: (() => {
                        const conTexto = [p, ...p.querySelectorAll("*")].filter((n) =>
                            [...n.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim()),
                        );
                        return getComputedStyle(conTexto[0] ?? p).fontSize;
                    })(),
                    texto: p.textContent.trim(),
                };
            });
            // Una línea = mismo centro vertical (el disparador del estado mide
            // 28 y lo demás 24: se compara el centro, no el borde de arriba).
            const lineas = [];
            pastillas.forEach((p, i) => {
                const l = lineas.find((x) => Math.abs(x.centro - p.centro) < 6);
                if (l) l.indices.push(i);
                else lineas.push({ centro: p.centro, indices: [i] });
            });
            return { ancho: fr.width, der: fr.right, pastillas, lineas: lineas.map((l) => l.indices) };
        });
        return {
            barra: lista.offsetWidth - lista.clientWidth,
            desborda: lista.scrollHeight > lista.clientHeight,
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
        // Sin esto Chromium esconde las barras y el caso no existe en el banco.
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

function comprobarLasPastillas(f, detalle) {
    assert.equal(f.pastillas.length, 6, "las seis: estado, asignar, tres contadores y etiquetas");
    assert.match(f.pastillas[0].texto, /Descartado/, "la primera es el estado");
    assert.match(f.pastillas[1].texto, /Asignar/, "«Asignar» se conserva, con su palabra");
    PASTILLAS.forEach((esperada, i) => {
        const p = f.pastillas[i];
        const relleno = ROTO ? esperada.antes : esperada.ahora;
        const letra = ROTO ? esperada.letra : (esperada.letraAhora ?? esperada.letra);
        assert.deepEqual(p.relleno, [relleno, relleno], `${esperada.que}: relleno por lado (${detalle})`);
        assert.equal(Math.round(p.alto), 24, `${esperada.que}: el alto es 24 en todas`);
        assert.equal(p.letra, letra, `${esperada.que}: el tamaño de letra`);
    });
}

for (const ancho of ANCHURAS) {
    for (const conFicha of [false, true]) {
        for (const dosCifras of [false, true]) {
            const nombre = `${ancho} px, ficha ${conFicha ? "abierta" : "cerrada"}, contadores de ${dosCifras ? "dos cifras" : "una cifra"}`;

            test(`${nombre}: Descartado + Asignar + tres contadores + etiquetas en una línea, con la barra a la vista`, async (t) => {
                if (faltaNavegador(t)) return;
                const m = await medir(ancho, conFicha, dosCifras);
                assert.deepEqual(m.errores, [], "la página no puede reventar");
                assert.equal(m.ficha, conFicha);
                assert.ok(m.desborda, "la lista tiene que desbordar, o la barra no saldría y no se mediría nada");
                assert.ok(m.barra >= 6, `la barra de la lista se ve y ocupa, como en las demás listas (${m.barra} px)`);
                assert.ok(m.anchoPagina <= ancho, `la página no se desplaza a lo ancho (${m.anchoPagina})`);

                for (const f of m.filas) {
                    const necesita = f.pastillas.reduce((s, p) => s + (p.der - p.izq), 0) + 4 * (f.pastillas.length - 1);
                    const detalle = `necesita ${necesita.toFixed(1)}, hay ${f.ancho.toFixed(1)}, ${f.lineas.length} línea(s)`;
                    comprobarLasPastillas(f, detalle);

                    if (ROTO) {
                        // El fallo reportado: a 1024 (columna de 22 rem) con la
                        // barra, el relleno de antes manda las etiquetas abajo.
                        if (ancho === 1024) {
                            assert.ok(f.lineas.length > 1, `ANTES: la fila se partía (${detalle})`);
                            assert.ok(!f.lineas[0].includes(5), `ANTES: las etiquetas caían a otra línea (${detalle})`);
                        }
                        continue;
                    }
                    if (dosCifras && ancho === 1024) {
                        // A 1024 (columna de 22 rem) con tres contadores de DOS
                        // cifras la fila pide ~325 px y hay 314: ni con 2 px
                        // menos por lado cabe. Se comprueba que la caída es
                        // honrada: no cabía de verdad.
                        assert.ok(f.lineas.length === 1 || necesita > f.ancho, `se cayó con sitio (${detalle})`);
                        continue;
                    }
                    assert.equal(f.lineas.length, 1, `una sola línea (${detalle})`);
                    assert.ok(f.pastillas[5].der <= f.der + 0.5, `las etiquetas no se salen de la tarjeta (${detalle})`);
                }
            });
        }
    }
}
