/**
 * La barra de arriba, medida en Chromium sobre el CSS del build, con la
 * `Breadcrumbs` de verdad en /chats, /correo, /sessions y /schedule, a
 * 1440/1280/1024/390 y con y sin el botón de tutoriales:
 *
 * - La casita es lo PRIMERO de la barra y cae en el mismo píxel en todas las
 *   pantallas; detrás, el menú (las dos flechas).
 * - No hay ruta de texto («leads», «chats»…).
 * - El selector Chats ⇄ Correos sale en TODAS las pantallas, marca la activa
 *   (ninguna fuera de las dos), va centrado en la columna de la lista —o donde
 *   estaría— y en el mismo píxel en las cuatro; nunca pisa la casita ni los
 *   botones de la derecha, y la barra no crece por llevarlo.
 * - Todos los botones de la barra son rectángulos de esquinas redondeadas:
 *   ninguno en píldora.
 *
 * `MODO=roto` monta la barra de `ANTES_REF` y afirma los fallos: la ruta de
 * texto, la casita en otro sitio en Chats, el selector pegado al menú y solo
 * en Chats/Correos, y la campana en píldora.
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
    /* sin navegador el banco se cae abajo */
}
const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..", "..");
const ROTO = process.env.MODO === "roto";
const HARNESS = join(AQUI, ".compilado", "barra-de-arriba", ROTO ? "antes.js" : "hoy.js");
const DIR_CSS = join(RAIZ, ".next", "static", "css");
const CSS = fs.existsSync(DIR_CSS)
    ? fs.readdirSync(DIR_CSS).filter((f) => f.endsWith(".css")).map((f) => fs.readFileSync(join(DIR_CSS, f), "utf8")).join("\n")
    : null;
if (!(chromium && CSS && fs.existsSync(HARNESS))) {
    console.error("[banco] sin navegador, sin CSS del build o sin arnés: no se ejerce nada");
    process.exit(1);
}
const { dondeVaElSelector } = await import("./.compilado/barra-de-arriba/alternar-bandejas.mjs");

const VENTANAS = [[1440, 900], [1280, 800], [1024, 768], [390, 740]];
const RUTAS = ["/chats", "/correo", "/sessions", "/schedule"];
const AMBAS = ["/chats", "/correo", "/sessions", "/schedule"];

let servidor, puerto, navegador;
test.before(async () => {
    const html = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>${CSS}</style></head>
<body style="margin:0"><div id="app"></div>
<script>window.process=window.process||{env:{}};</script>
<script type="module">${fs.readFileSync(HARNESS, "utf8")}</script></body></html>`;
    servidor = http.createServer((_q, res) => {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(html);
    }).listen(0);
    await new Promise((r) => servidor.once("listening", r));
    puerto = servidor.address().port;
    navegador = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined, args: ["--no-sandbox"] });
});
test.after(async () => {
    await navegador?.close();
    servidor?.close();
});

/** Todo lo que se mide de la barra, con coordenadas de la página. */
function medir() {
    const header = document.querySelector("header");
    const h = header.getBoundingClientRect();
    const r = (el) => el && el.getBoundingClientRect();
    const casa = header.querySelector("a[href='/']");
    const menu = header.querySelector("[data-sidebar=trigger]");
    const sel = header.querySelector("[data-alternar-bandeja]");
    // Lo primero que SE VE en la barra, de izquierda a derecha.
    const visibles = [...header.querySelectorAll("a, button")].filter((el) => {
        const b = el.getBoundingClientRect();
        return b.width > 0 && b.height > 0 && getComputedStyle(el).visibility !== "hidden";
    });
    visibles.sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);
    const columna = document.querySelector("[data-columna-de-chats]");
    const caja = document.querySelector("[data-caja-del-contenido]");
    const lateral = (() => {
        const d = document.createElement("div");
        d.style.width = "var(--ancho-lateral)";
        d.style.position = "absolute";
        document.body.appendChild(d);
        const w = d.getBoundingClientRect().width;
        d.remove();
        return w;
    })();
    const zona = columna
        ? r(columna)
        : { left: r(caja).left + caja.clientLeft, width: Math.min(lateral, caja.clientWidth) };
    // Los botones de la barra: su redondeo contra su alto.
    const botones = [...header.querySelectorAll("button, a")]
        .filter((el) => !el.closest("[data-alternar-bandeja]") && el.getBoundingClientRect().width > 0)
        .map((el) => {
            const b = el.getBoundingClientRect();
            return {
                que: el.getAttribute("aria-label") || el.textContent.trim().slice(0, 20) || el.tagName,
                radio: parseFloat(getComputedStyle(el).borderTopLeftRadius),
                alto: b.height,
            };
        });
    // Texto de la barra que no es ni un botón ni el selector: la «ruta».
    const clon = header.cloneNode(true);
    clon.querySelectorAll("button, [data-alternar-bandeja], .sr-only, kbd").forEach((n) => n.remove());
    const derecha = header.querySelector("[data-botones-de-la-barra]") ?? header.querySelector("header > div:last-child");
    return {
        alto: Math.round(h.height),
        textoSuelto: clon.textContent.replace(/\s+/g, " ").trim(),
        hayMigas: !!header.querySelector("nav[aria-label=breadcrumb], ol"),
        casa: casa && { x: Math.round(r(casa).left - h.left), y: Math.round(r(casa).top) },
        primero: visibles[0]?.getAttribute("href") ?? visibles[0]?.getAttribute("data-sidebar") ?? null,
        casaAntesDelMenu: !!(casa && menu && r(casa).right <= r(menu).left),
        izquierdaFin: Math.round((r(menu) ?? r(casa)).right - h.left),
        derechaIni: Math.round(r(derecha).left - h.left),
        sel: sel && {
            x: Math.round(r(sel).left - h.left),
            w: Math.round(r(sel).width),
            centroAlto: Math.abs(r(sel).top + r(sel).height / 2 - (h.top + h.height / 2)),
            radio: parseFloat(getComputedStyle(sel).borderTopLeftRadius),
            alto: r(sel).height,
            activa: sel.querySelector("[aria-current=page]")?.getAttribute("data-bandeja") ?? null,
            rotulos: [...sel.querySelectorAll("a")].map((a) => a.innerText.trim()),
        },
        zona: { izquierda: zona.left - h.left, ancho: zona.width },
        botones,
        desborda: document.documentElement.scrollWidth > window.innerWidth,
    };
}

for (const [ancho, alto] of VENTANAS) {
    for (const guias of [false, true]) {
        test(`${ancho}${guias ? " con tutoriales" : ""}: ${ROTO ? "ANTES la barra estaba descuadrada" : "casita primero, sin ruta, selector centrado en la columna"}`, async () => {
            const p = await navegador.newPage({ viewport: { width: ancho, height: alto } });
            const errores = [];
            p.on("pageerror", (e) => errores.push(String(e)));
            await p.goto(`http://127.0.0.1:${puerto}/`);
            await p.waitForFunction("window.listo === true", null, { timeout: 15000 });
            await p.addStyleTag({ content: "*,*::before,*::after{transition:none!important;animation:none!important}" });
            await p.evaluate((g) => { window.__conGuias = g; }, guias);
            const en = async (ruta, rutas = AMBAS) => {
                await p.evaluate(([r, rs]) => window.maquetaBarra(r, rs), [ruta, rutas]);
                await p.waitForSelector("header");
                await p.waitForTimeout(400);
                return p.evaluate(`(${medir})()`);
            };
            const m = {};
            for (const ruta of RUTAS) m[ruta] = await en(ruta);

            if (ROTO) {
                // La ruta de texto estaba ahí, y la casita no caía donde en Chats.
                assert.ok(m["/sessions"].hayMigas, "ANTES había migas");
                assert.match(m["/sessions"].textoSuelto, /sessions|leads/i, "ANTES se leía la ruta");
                assert.notEqual(m["/chats"].casa.x, m["/sessions"].casa.x, "ANTES la casita se movía en Chats");
                assert.equal(m["/sessions"].sel, null, "ANTES el selector no salía fuera de Chats y Correos");
                assert.ok(m["/chats"].sel.x < m["/chats"].casa.x, "ANTES el selector iba antes de la casita");
                const campana = m["/chats"].botones.find((b) => b.que === "Centro de notificaciones");
                assert.ok(campana.radio >= campana.alto / 2 - 0.5, "ANTES la campana era una píldora");
                await p.close();
                return;
            }

            const casas = RUTAS.map((r) => m[r].casa);
            for (const ruta of RUTAS) {
                const x = m[ruta];
                assert.equal(x.hayMigas, false, `${ruta}: sin migas`);
                assert.equal(x.textoSuelto, "", `${ruta}: ningún texto suelto en la barra («${x.textoSuelto}»)`);
                assert.equal(x.primero, "/", `${ruta}: la casita es lo primero`);
                assert.ok(x.casaAntesDelMenu, `${ruta}: la casita va antes del menú`);
                assert.deepEqual(x.casa, casas[0], `${ruta}: la casita en el mismo píxel`);
                assert.ok(x.sel, `${ruta}: el selector sale`);
                assert.equal(x.sel.activa, ruta === "/chats" ? "chats" : ruta === "/correo" ? "correo" : null, `${ruta}: marca la activa`);
                assert.ok(x.sel.centroAlto <= 1, `${ruta}: centrado en el alto de la barra`);
                assert.ok(x.sel.x >= x.izquierdaFin + 7, `${ruta}: no pisa la casita ni el menú`);
                assert.ok(x.sel.x + x.sel.w <= x.derechaIni - 7, `${ruta}: no pisa los botones de la derecha`);
                // Centrado en la columna: lo que diga la regla pura con lo medido.
                const esperado = dondeVaElSelector({ columna: x.zona, minimo: x.izquierdaFin + 8, maximo: x.derechaIni - 8 });
                assert.ok(Math.abs(x.sel.x - esperado.izquierda) <= 1, `${ruta}: donde dice la regla (${x.sel.x} vs ${esperado.izquierda})`);
                const centro = x.sel.x + x.sel.w / 2;
                const centroCol = x.zona.izquierda + x.zona.ancho / 2;
                // En escritorio siempre cabe centrado; en un teléfono lo que
                // manda es la regla (ya comprobada arriba), porque la derecha
                // puede llegar hasta el centro.
                if (ancho >= 1024) {
                    assert.ok(Math.abs(centro - centroCol) <= 1.5, `${ruta}: centrado en la columna (${centro} vs ${centroCol})`);
                }
                assert.deepEqual(x.sel.rotulos, esperado.compacto ? ["", ""] : ["Chats", "Correos"]);
                // Simetría: ninguna píldora, ni en el selector ni en los botones.
                assert.ok(x.sel.radio > 0 && x.sel.radio < x.sel.alto / 2 - 1, `${ruta}: el selector es un rectángulo redondeado`);
                for (const b of x.botones) {
                    assert.ok(b.radio > 0 && b.radio < b.alto / 2 - 1, `${ruta}: «${b.que}» es un rectángulo redondeado (radio ${b.radio}, alto ${b.alto})`);
                }
                assert.equal(x.desborda, false, `${ruta}: la página no desborda`);
            }
            if (process.env.VER) console.error(ancho, guias, RUTAS.map((r) => [r, m[r].sel, m[r].zona]));
            for (const k of ["x", "w"]) {
                assert.equal(new Set(RUTAS.map((r) => m[r].sel[k])).size, 1, `el selector en el mismo píxel en las cuatro (${k})`);
            }
            // La barra no crece por llevarlo.
            const sin = await en("/chats", ["/chats"]);
            assert.equal(sin.sel, null, "sin Correos en el menú no sale");
            assert.equal(m["/chats"].alto, sin.alto, "la barra no crece");
            // La campanita trae sus datos de acciones mudas con otra forma y se
            // queja al pintar: eso es del arnés. Cualquier otro error sí cuenta.
            assert.deepEqual(errores.filter((e) => !e.includes("reading 'filter'")), []);
            await p.close();
        });
    }
}
