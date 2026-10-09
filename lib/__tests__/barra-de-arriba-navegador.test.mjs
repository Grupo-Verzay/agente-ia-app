/**
 * La barra de arriba, medida en Chromium sobre el CSS del build, con la
 * `Breadcrumbs` de verdad en /chats, /correo, /sessions y /schedule, a
 * 1440/1280/1024/390 y con y sin el botón de tutoriales:
 *
 * - No hay casita: el menú (las dos flechas) es lo PRIMERO de la barra y cae en
 *   el mismo píxel en todas las pantallas.
 * - No hay ruta de texto («leads», «chats»…).
 * - El selector Chats ⇄ Correos sale en TODAS las pantallas, marca la activa
 *   (ninguna fuera de las dos), va centrado en la columna de la lista —o donde
 *   estaría— y en el mismo píxel en las cuatro; nunca pisa el menú ni los
 *   botones de la derecha, y la barra no crece por llevarlo.
 * - Cada pestaña lleva sus sin leer, dentro de la pestaña y sin tapar su
 *   palabra; cero no se pinta y más de 99 es «99+».
 * - Todos los botones de la barra son rectángulos de esquinas redondeadas:
 *   ninguno en píldora.
 *
 * `MODO=roto` monta la barra de `ANTES_REF` y afirma los fallos: la casita de
 * primera, ocupando sitio, y ningún número de sin leer en el selector.
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
// La clase con la que `app/layout.tsx` pone Poppins en el `<body>`.
const CLASE_DE_LA_FUENTE = (CSS.match(/\.(__className_[a-z0-9]+)\{font-family:__poppins/) ?? [])[1] ?? "";
const { dondeVaElSelector } = await import("./.compilado/barra-de-arriba/alternar-bandejas.mjs");

const VENTANAS = [[1440, 900], [1280, 800], [1024, 768], [390, 740]];
const RUTAS = ["/chats", "/correo", "/sessions", "/schedule"];
const AMBAS = ["/chats", "/correo", "/crm/llamadas", "/sessions", "/schedule"];

let servidor, puerto, navegador;
test.before(async () => {
    const html = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>${CSS}</style></head>
<body style="margin:0" class="${CLASE_DE_LA_FUENTE}"><div id="app"></div>
<script>window.process=window.process||{env:{}};</script>
<script type="module">${fs.readFileSync(HARNESS, "utf8")}</script></body></html>`;
    servidor = http.createServer((q, res) => {
        // La tipografía de verdad (Poppins), para medir si las palabras del
        // selector caben con la letra que se ve en producción.
        if (q.url.startsWith("/_next/static/media/")) {
            const f = join(RAIZ, ".next", "static", "media", q.url.slice("/_next/static/media/".length));
            if (fs.existsSync(f)) {
                res.writeHead(200, { "Content-Type": "font/woff2" });
                return res.end(fs.readFileSync(f));
            }
        }
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
    const casa = header.querySelector("[data-boton-del-panel]");
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
    // «Ayuda» es un enlace con forma de botón (navega a /ayuda), no texto: se
    // quita por su marca y no quitando todos los `a`, que se llevarían por
    // delante la ruta que esto viene a cazar.
    const clon = header.cloneNode(true);
    clon.querySelectorAll("button, [data-boton-de-ayuda], [data-alternar-bandeja], .sr-only, kbd").forEach((n) => n.remove());
    const derecha = header.querySelector("[data-botones-de-la-barra]") ?? header.querySelector("header > div:last-child");
    return {
        alto: Math.round(h.height),
        textoSuelto: clon.textContent.replace(/\s+/g, " ").trim(),
        hayMigas: !!header.querySelector("nav[aria-label=breadcrumb], ol"),
        casa: casa && { x: Math.round(r(casa).left - h.left), y: Math.round(r(casa).top), w: Math.round(r(casa).width), alto: Math.round(r(casa).height), href: casa.getAttribute("href"), derecha: Math.round(r(casa).right - h.left) },
        primero: visibles[0]?.getAttribute("href") ?? visibles[0]?.getAttribute("data-sidebar") ?? null,
        hayCasa: !!casa,
        menuX: menu && Math.round(r(menu).left - h.left),
        huecoMenuSel: menu && sel ? r(sel).left - r(menu).right : null,
        // Los números de cada pestaña: su texto, y si caben en su pestaña y
        // no tapan la palabra.
        numeros: sel ? [...sel.querySelectorAll("a[data-bandeja]")].map((a) => {
            const n = a.querySelector("[data-sin-leer]");
            if (!n) return { clave: a.getAttribute("data-bandeja"), texto: null };
            const bn = n.getBoundingClientRect();
            const ba = a.getBoundingClientRect();
            const palabra = a.querySelector("span:not([data-sin-leer])");
            const bp = palabra && palabra.getBoundingClientRect();
            return {
                clave: a.getAttribute("data-bandeja"),
                texto: n.textContent.trim(),
                dentro: bn.left >= ba.left - 0.5 && bn.right <= ba.right + 0.5 && bn.top >= ba.top - 0.5 && bn.bottom <= ba.bottom + 0.5,
                tapaLaPalabra: !!(bp && bp.width > 0 && bn.left < bp.right - 0.5 && bn.right > bp.left + 0.5),
                rojo: getComputedStyle(n).backgroundColor,
            };
        }) : [],
        // Lo que miden los botones de la derecha (Ver tutoriales, Soporte, la
        // campana: todos `h-9`). En el arnés Soporte no se pinta sin su
        // acción, así que se toma el más alto de los que haya.
        altoSoporte: (() => {
            const d = header.querySelector("[data-botones-de-la-barra]");
            const altos = d ? [...d.querySelectorAll("button")].map((b) => b.getBoundingClientRect().height).filter((h) => h > 0) : [];
            return altos.length ? Math.max(...altos) : null;
        })(),
        cortadas: sel ? [...sel.querySelectorAll("a span, a [data-sin-leer]")].filter((x) => x.scrollWidth > x.clientWidth + 0.5 || x.getBoundingClientRect().right > x.closest("a").getBoundingClientRect().right + 0.5).length : 0,
        izquierdaFin: Math.round(r(menu).right - h.left),
        casaX: casa && Math.round(r(casa).left - h.left),
        derechaIni: Math.round(r(derecha).left - h.left),
        sel: sel && {
            x: Math.round(r(sel).left - h.left),
            w: Math.round(r(sel).width),
            centroAlto: Math.abs(r(sel).top + r(sel).height / 2 - (h.top + h.height / 2)),
            radio: parseFloat(getComputedStyle(sel).borderTopLeftRadius),
            alto: r(sel).height,
            activa: sel.querySelector("[aria-current=page]")?.getAttribute("data-bandeja") ?? null,
            rotulos: [...sel.querySelectorAll("a")].map((a) => [...a.querySelectorAll("span:not([data-sin-leer]):not(.sr-only)")].map((x) => x.innerText.trim()).join("")),
            poppins: [...document.fonts].some((f) => /poppins/i.test(f.family) && f.status === "loaded")
                && /poppins/i.test(getComputedStyle(sel).fontFamily),
        },
        zona: { izquierda: zona.left - h.left, ancho: zona.width },
        botones,
        desborda: document.documentElement.scrollWidth > window.innerWidth,
    };
}

for (const [ancho, alto] of VENTANAS) {
    for (const guias of [false, true]) {
        test(`${ancho}${guias ? " con tutoriales" : ""}: ${ROTO ? "ANTES la barra estaba descuadrada" : "menú primero, casita del Panel junto al selector, selector centrado y con sus sin leer"}`, async () => {
            const p = await navegador.newPage({ viewport: { width: ancho, height: alto } });
            const errores = [];
            p.on("pageerror", (e) => errores.push(String(e)));
            await p.goto(`http://127.0.0.1:${puerto}/`);
            await p.waitForFunction("window.listo === true", null, { timeout: 15000 });
            await p.addStyleTag({ content: "*,*::before,*::after{transition:none!important;animation:none!important}" });
            await p.evaluate((g) => { window.__conGuias = g; window.__sinLeer = { chats: 3, correo: 12 }; }, guias);
            const en = async (ruta, rutas = AMBAS) => {
                await p.evaluate(([r, rs]) => window.maquetaBarra(r, rs), [ruta, rutas]);
                await p.waitForSelector("header");
                await p.waitForTimeout(400);
                await p.evaluate(() => document.fonts.ready);
                await p.waitForTimeout(100);
                return p.evaluate(`(${medir})()`);
            };
            const m = {};
            for (const ruta of RUTAS) m[ruta] = await en(ruta);

            if (ROTO) {
                // ANTES: ninguna casita del Panel.
                for (const ruta of RUTAS) {
                    const x = m[ruta];
                    assert.equal(x.hayCasa, false, `${ruta}: ANTES no había casita del Panel`);
                }
                await p.close();
                return;
            }

            const menus = RUTAS.map((r) => m[r].menuX);
            for (const ruta of RUTAS) {
                const x = m[ruta];
                assert.equal(x.hayMigas, false, `${ruta}: sin migas`);
                assert.equal(x.textoSuelto, "", `${ruta}: ningún texto suelto en la barra («${x.textoSuelto}»)`);
                assert.equal(x.hayCasa, true, `${ruta}: la casita del Panel sale`);
                assert.equal(x.casa.href, "/panel", `${ruta}: lleva al Panel`);
                assert.equal(x.casa.alto, 36, `${ruta}: mide lo que los botones de la derecha`);
                assert.ok(Math.abs(x.casa.x - (x.izquierdaFin + 8)) <= 1.5, `${ruta}: la casita a 8 px del menú (${x.casa.x} vs ${x.izquierdaFin})`);
                assert.ok(x.casa.derecha <= x.sel.x - 7, `${ruta}: la casita no pisa el selector`);
                assert.equal(x.primero, "trigger", `${ruta}: el menú es lo primero`);
                assert.equal(x.menuX, 16, `${ruta}: el menú arranca en el relleno de la barra`);
                assert.equal(x.menuX, menus[0], `${ruta}: el menú en el mismo píxel`);
                assert.ok(x.sel, `${ruta}: el selector sale`);
                assert.equal(x.sel.activa, ruta === "/chats" ? "chats" : ruta === "/correo" ? "correo" : null, `${ruta}: marca la activa`);
                assert.ok(x.sel.centroAlto <= 1, `${ruta}: centrado en el alto de la barra`);
                assert.ok(x.sel.x >= x.casa.derecha + 7, `${ruta}: no pisa la casita`);
                assert.ok(x.sel.x + x.sel.w <= x.derechaIni - 7, `${ruta}: no pisa los botones de la derecha`);
                // Centrado en la columna: lo que diga la regla pura con lo medido.
                const esperado = dondeVaElSelector({ columna: x.zona, minimo: x.casa.derecha + 8, maximo: x.derechaIni - 8, cuantas: 3 });
                assert.ok(Math.abs(x.sel.x - esperado.izquierda) <= 1, `${ruta}: donde dice la regla (${x.sel.x} vs ${esperado.izquierda})`);
                assert.ok(Math.abs(x.sel.w - esperado.ancho) <= 1, `${ruta}: el ancho que dice la regla (${x.sel.w} vs ${esperado.ancho})`);
                // Simétrico: menú → selector con el hueco de los botones de la
                // derecha (8), cuando cabe centrado; si no, la regla manda y
                // nunca menos de ese hueco.
                if (esperado.izquierda === x.casa.derecha + 8) {
                    assert.ok(Math.abs(x.huecoMenuSel - 52) <= 1, `${ruta}: menú→casita→selector (8+36+8) (${x.huecoMenuSel})`);
                }
                assert.ok(x.huecoMenuSel >= 51.5, `${ruta}: menú→selector nunca menos de casita y huecos (${x.huecoMenuSel})`);
                // Los sin leer: Chats 3 y Correos 12, dentro de su pestaña y sin
                // tapar su palabra.
                assert.deepEqual(x.numeros.map((n) => [n.clave, n.texto]), [["chats", "3"], ["correo", "12"], ["llamadas", null]], `${ruta}: cada bandeja con su número`);
                for (const n of x.numeros) {
                    if (n.texto === null) continue;
                    assert.ok(n.dentro, `${ruta}: el número de ${n.clave} cabe en su pestaña`);
                    assert.equal(n.tapaLaPalabra, false, `${ruta}: el número de ${n.clave} no tapa la palabra`);
                    assert.equal(n.rojo, x.numeros[0].rojo, "los dos del mismo color");
                }
                // Con la presencia de los botones de la derecha.
                assert.ok(x.altoSoporte >= 36, `${ruta}: los botones de la derecha miden ${x.altoSoporte}`);
                assert.ok(Math.abs(x.sel.alto - x.altoSoporte) <= 0.5, `${ruta}: el selector (${x.sel.alto}) mide lo que los botones de la derecha (${x.altoSoporte})`);
                assert.ok(CLASE_DE_LA_FUENTE && x.sel.poppins, `${ruta}: medido con Poppins, la letra de producción`);
                assert.equal(x.cortadas, 0, `${ruta}: ninguna palabra del selector recortada`);
                const centro = x.sel.x + x.sel.w / 2;
                const centroCol = x.zona.izquierda + x.zona.ancho / 2;
                // En escritorio siempre cabe centrado; en un teléfono lo que
                // manda es la regla (ya comprobada arriba), porque la derecha
                // puede llegar hasta el centro.
                if (ancho >= 1024) {
                    assert.ok(Math.abs(centro - centroCol) <= 1.5, `${ruta}: centrado en la columna (${centro} vs ${centroCol})`);
                }
                assert.deepEqual(x.sel.rotulos, esperado.compacto ? ["", "", ""] : ["Chats", "Correos", "Llamadas"]);
                // Simetría: ninguna píldora, ni en el selector ni en los botones.
                assert.ok(x.sel.radio > 0 && x.sel.radio < x.sel.alto / 2 - 1, `${ruta}: el selector es un rectángulo redondeado`);
                for (const b of x.botones) {
                    assert.ok(b.radio > 0 && b.radio < b.alto / 2 - 1, `${ruta}: «${b.que}» es un rectángulo redondeado (radio ${b.radio}, alto ${b.alto})`);
                }
                assert.equal(x.desborda, false, `${ruta}: la página no desborda`);
            }
            if (process.env.VER) console.error(ancho, guias, JSON.stringify(RUTAS.map((r) => [r, m[r].huecoMenuSel, m[r].sel.x, m[r].sel.w, m[r].sel.alto, m[r].sel.rotulos.join("/"), Math.round(m[r].zona.izquierda + m[r].zona.ancho / 2 - m[r].sel.x - m[r].sel.w / 2)])));
            for (const k of ["x", "w"]) {
                assert.equal(new Set(RUTAS.map((r) => m[r].sel[k])).size, 1, `el selector en el mismo píxel en las cuatro (${k})`);
            }
            // Cero no se pinta, y más de 99 es «99+».
            await p.evaluate(() => { window.__sinLeer = { chats: 0, correo: 250 }; });
            const otros = await en("/chats");
            assert.deepEqual(otros.numeros.map((n) => [n.clave, n.texto]), [["chats", null], ["correo", "99+"], ["llamadas", null]]);
            for (const n of otros.numeros.filter((n) => n.texto)) {
                assert.ok(n.dentro && !n.tapaLaPalabra, "«99+» cabe y no tapa la palabra");
            }
            assert.equal(otros.cortadas, 0, "con «99+» ninguna palabra recortada");
            await p.evaluate(() => { window.__sinLeer = { chats: 3, correo: 12 }; });
            // La barra no crece por llevarlo.
            const sin = await en("/chats", ["/chats"]);
            assert.equal(sin.sel, null, "sin Correos en el menú no sale");
            const dos = await en("/chats", ["/chats", "/correo"]);
            assert.deepEqual(dos.numeros.map((n) => n.clave), ["chats", "correo"], "sin Llamadas en el menú, solo dos pestañas");
            assert.ok(sin.hayCasa && sin.casa.href === "/panel", "la casita del Panel sale aunque no haya selector");
            assert.equal(m["/chats"].alto, sin.alto, "la barra no crece");
            // La campanita trae sus datos de acciones mudas con otra forma y se
            // queja al pintar: eso es del arnés. Cualquier otro error sí cuenta.
            assert.deepEqual(errores.filter((e) => !e.includes("reading 'filter'")), []);
            await p.close();
        });
    }
}
