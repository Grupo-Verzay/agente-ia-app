/**
 * Chats y Correos, simétricas, medidas en Chromium sobre el CSS del build.
 *
 * - El panel de Chats de HOY mide y se pinta igual que el de ANTES (sacado de
 *   git): pasar a la pieza compartida no le movió ni un píxel.
 * - El de Correo, con su componente de verdad, se pinta con la MISMA forma que
 *   el de Chats: icono, título, frase, tarjetas y huecos. Todos y Sin leer con
 *   el mismo color; Destacados con el ámbar de su pastilla. Y cada tarjeta pone
 *   su filtro.
 * - La barrita de arriba sale en /chats y /correo en el MISMO píxel, marca la
 *   que se mira, no pisa las migas ni los botones de la derecha, y no sale
 *   fuera de esas dos ni a quien no tiene las dos.
 *
 * `MODO=roto` afirma el fallo: Correo sin el panel y sin barrita.
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
const HARNESS = join(AQUI, ".compilado", "bandejas", ROTO ? "antes.js" : "hoy.js");
const DIR_CSS = join(RAIZ, ".next", "static", "css");
const CSS = fs.existsSync(DIR_CSS)
    ? fs.readdirSync(DIR_CSS).filter((f) => f.endsWith(".css")).map((f) => fs.readFileSync(join(DIR_CSS, f), "utf8")).join("\n")
    : null;
if (!(chromium && CSS && fs.existsSync(HARNESS))) {
    console.error("[banco] sin navegador, sin CSS del build o sin arnés: no se ejerce nada");
    process.exit(1);
}

const VENTANAS = [[1440, 900], [1280, 800], [1024, 768], [390, 740]];
let servidor, puerto, navegador;
test.before(async () => {
    const html = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>${CSS}</style></head>
<body style="margin:0"><div id="app" class="app-module-content"></div>
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

async function abrir(ancho, alto) {
    const p = await navegador.newPage({ viewport: { width: ancho, height: alto } });
    const errores = [];
    p.on("pageerror", (e) => { errores.push(String(e)); if (process.env.PILA) console.error(e.stack); });
    await p.goto(`http://127.0.0.1:${puerto}/`);
    await p.waitForFunction("window.listo === true", null, { timeout: 15000 });
    await p.addStyleTag({ content: "*,*::before,*::after{transition:none!important;animation:none!important}" });
    return { p, errores };
}

/** La forma de un panel de «nada abierto», para compararlo con otro. */
function forma(raiz) {
    const panel = raiz.querySelector("[data-panel-sin-seleccion]") ?? raiz.firstElementChild;
    const c = (el) => getComputedStyle(el);
    const r = (el) => el.getBoundingClientRect();
    const circulo = panel.children[0];
    const svg = circulo.querySelector("svg");
    const h2 = panel.querySelector("h2");
    const sub = h2.nextElementSibling;
    const botones = [...panel.querySelectorAll("button")];
    return {
        panel: { fondo: c(panel).backgroundColor, borde: c(panel).borderLeftWidth + " " + c(panel).borderLeftColor, gap: c(panel).rowGap, visible: c(panel).display !== "none" },
        circulo: { w: r(circulo).width, h: r(circulo).height, fondo: c(circulo).backgroundColor, sombra: c(circulo).boxShadow },
        svg: { w: r(svg).width, color: c(svg).color, trazo: c(svg).strokeWidth ?? svg.getAttribute("stroke-width") },
        titulo: { texto: h2.textContent, letra: c(h2).fontSize, peso: c(h2).fontWeight, color: c(h2).color },
        frase: { texto: sub.textContent, letra: c(sub).fontSize, color: c(sub).color, margen: c(sub).marginTop },
        huecos: botones.slice(1).map((b, i) => Math.round(r(b).top - r(botones[i]).bottom)),
        arriba: { tituloACirculo: Math.round(r(h2).top - r(circulo).bottom) },
        tarjetas: botones.map((b) => {
            const letra = b.querySelector("span");
            const [t, x] = b.querySelectorAll("p");
            return {
                w: Math.round(r(b).width), h: Math.round(r(b).height), radio: c(b).borderTopLeftRadius,
                fondo: c(b).backgroundColor, borde: c(b).borderTopColor, relleno: c(b).padding,
                letra: letra.textContent, letraW: r(letra).width, letraFondo: c(letra).backgroundColor, letraTam: c(letra).fontSize,
                titulo: t.textContent, tituloColor: c(t).color, tituloTam: c(t).fontSize, tituloPeso: c(t).fontWeight,
                texto: x.textContent, textoTam: c(x).fontSize,
            };
        }),
    };
}

for (const [ancho, alto] of VENTANAS.filter(([a]) => a >= 768)) {
    test(`${ancho}: el panel de Chats de hoy es el de antes, píxel a píxel`, async () => {
        const { p, errores } = await abrir(ancho, alto);
        await p.evaluate("window.maquetaChats()");
        await p.waitForSelector("[data-caja=chats-hoy] h2");
        const hoy = await p.evaluate(`(${forma})(document.querySelector("[data-caja=chats-hoy]"))`);
        const antes = await p.evaluate(`(${forma})(document.querySelector("[data-caja=chats-antes]"))`);
        assert.deepEqual(hoy, antes);
        assert.deepEqual(errores, []);
        // Y cada tarjeta sigue poniendo su filtro.
        for (const b of await p.$$("[data-caja=chats-hoy] button")) await b.click();
        assert.deepEqual(await p.evaluate("window.pulsadas"), ["mine", "all", "all+sinLeer"]);
        await p.close();
    });

    test(`${ancho}: ${ROTO ? "ANTES Correo no tenía el panel de Chats" : "el panel de Correo es el de Chats, y cada tarjeta filtra"}`, async () => {
        const { p, errores } = await abrir(ancho, alto);
        await p.evaluate("window.maquetaCorreo()");
        await p.waitForSelector("[data-correo-fila]");
        await p.waitForTimeout(200);
        if (ROTO) {
            assert.equal(await p.$("[data-panel-sin-seleccion]"), null);
            assert.ok((await p.textContent("body")).includes("Elige un correo para leerlo"));
            await p.close();
            return;
        }
        const correo = await p.evaluate(`(${forma})(document.querySelector("[data-panel-sin-seleccion]").parentElement)`);
        await p.close();

        const { p: p2 } = await abrir(ancho, alto);
        await p2.evaluate("window.maquetaChats()");
        await p2.waitForSelector("[data-caja=chats-hoy] h2");
        const chats = await p2.evaluate(`(${forma})(document.querySelector("[data-caja=chats-hoy]"))`);
        await p2.close();

        assert.equal(correo.titulo.texto, "Tus correos");
        assert.equal(correo.frase.texto, "Selecciona un correo de la lista para comenzar");
        assert.deepEqual(correo.tarjetas.map((t) => [t.letra, t.titulo]), [["D", "Destacados"], ["T", "Todos"], ["S", "Sin leer"]]);
        for (const k of ["panel", "circulo"]) assert.deepEqual(correo[k], chats[k], k);
        assert.deepEqual({ ...correo.svg }, { ...chats.svg });
        assert.deepEqual({ ...correo.titulo, texto: 0 }, { ...chats.titulo, texto: 0 });
        assert.deepEqual({ ...correo.frase, texto: 0 }, { ...chats.frase, texto: 0 });
        assert.deepEqual(correo.huecos, chats.huecos, "el mismo espacio entre tarjetas");
        assert.deepEqual(correo.arriba, chats.arriba, "el mismo espacio entre icono y título");
        const sinTexto = (t) => ({ ...t, letra: 0, titulo: 0, texto: 0 });
        // Todos y Sin leer: idénticas, color incluido.
        assert.deepEqual(sinTexto(correo.tarjetas[1]), sinTexto(chats.tarjetas[1]));
        assert.deepEqual(sinTexto(correo.tarjetas[2]), sinTexto(chats.tarjetas[2]));
        // Destacados: la misma forma, con el ámbar de su pastilla.
        const sinColor = (t) => ({ ...sinTexto(t), fondo: 0, borde: 0, letraFondo: 0, tituloColor: 0 });
        assert.deepEqual(sinColor(correo.tarjetas[0]), sinColor(chats.tarjetas[0]));
        assert.equal(correo.tarjetas[0].letraFondo, "rgb(245, 158, 11)", "ámbar-500");
        assert.deepEqual(errores, []);
    });

    if (!ROTO) {
        test(`${ancho}: cada tarjeta de Correo pone su filtro`, async () => {
            const { p } = await abrir(ancho, alto);
            await p.evaluate("window.maquetaCorreo()");
            await p.waitForSelector("[data-tarjeta-de-acceso]");
            const puesto = () => p.evaluate(() => document.querySelector("[data-pastilla-de-filtro][aria-pressed=true]")?.getAttribute("data-pastilla-de-filtro"));
            for (const f of ["destacados", "sinLeer", "todos"]) {
                await p.click(`[data-tarjeta-de-acceso=${f}]`);
                await p.waitForTimeout(80);
                assert.equal(await puesto(), f);
            }
            await p.close();
        });
    }
}

/*
 * La barrita de arriba se mide ahora en `barra-de-arriba-navegador.test.mjs`
 * (`scripts/banco-barra-de-arriba.sh`): sale en todas las pantallas y va
 * centrada en la columna de la lista, no pegada al menú.
 */
const SIN_BARRITA_AQUI = true;
/** Dónde queda la barrita, y si pisa algo de la barra. */
function barrita() {
    const b = document.querySelector("[data-alternar-bandeja]");
    if (!b) return null;
    const r = b.getBoundingClientRect();
    const header = b.closest("header").getBoundingClientRect();
    const menu = document.querySelector("header [data-sidebar=trigger]").getBoundingClientRect();
    const casa = document.querySelector("header a[href='/']").getBoundingClientRect();
    const derecha = document.querySelector("header > div:last-child").getBoundingClientRect();
    return {
        altoDeLaBarra: Math.round(header.height),
        x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height),
        trasElMenu: Math.round(r.left - menu.right),
        dentro: r.top >= header.top && r.bottom <= header.bottom,
        centradaEnAlto: Math.abs(r.top + r.height / 2 - (header.top + header.height / 2)) <= 1,
        antesDeLasMigas: casa.left >= r.right,
        pisaDerecha: derecha.left < r.right,
        activa: b.querySelector("[aria-current=page]")?.getAttribute("data-bandeja") ?? null,
        rotulos: [...b.querySelectorAll("a")].map((a) => a.innerText.trim()),
        desborda: document.documentElement.scrollWidth > window.innerWidth,
    };
}

for (const [ancho, alto] of SIN_BARRITA_AQUI && !ROTO ? [] : VENTANAS) {
    for (const guias of [false, true]) {
        test(`${ancho}${guias ? " con tutoriales" : ""}: ${ROTO ? "ANTES no había barrita" : "la barrita sale en el mismo sitio en Chats y Correos"}`, async () => {
            const { p, errores } = await abrir(ancho, alto);
            await p.evaluate((g) => { window.__conGuias = g; }, guias);
            const en = async (ruta, rutas = ["/chats", "/correo"]) => {
                await p.evaluate(([r, rs]) => window.maquetaBarra(r, rs), [ruta, rutas]);
                await p.waitForSelector("header");
                await p.waitForTimeout(250);
                return p.evaluate(`(${barrita})()`);
            };
            const chats = await en("/chats");
            const correo = await en("/correo");
            if (ROTO) {
                assert.equal(chats, null);
                assert.equal(correo, null);
                await p.close();
                return;
            }
            assert.ok(chats && correo, "la barrita sale en las dos");
            assert.equal(chats.activa, "chats");
            assert.equal(correo.activa, "correo");
            for (const k of ["x", "y", "w", "h"]) assert.equal(correo[k], chats[k], `${k} igual en las dos`);
            for (const m of [chats, correo]) {
                assert.ok(m.trasElMenu >= 0 && m.trasElMenu <= 32, `justo después del menú (${m.trasElMenu})`);
                assert.ok(m.dentro, "dentro de la barra");
                assert.ok(m.centradaEnAlto, "centrada en el alto de la barra");
                assert.ok(m.antesDeLasMigas, "no pisa las migas");
                assert.ok(!m.pisaDerecha, "no pisa los botones de la derecha");
                assert.ok(!m.desborda);
                assert.deepEqual(m.rotulos, ancho >= 640 ? ["Chats", "Correos"] : ["", ""]);
            }
            assert.equal(await en("/sessions"), null, "fuera de las dos no sale");
            // Y la barra no crece de alto por llevarla: mide lo que mide sin ella.
            const sinElla = await p.evaluate(() => Math.round(document.querySelector("header").getBoundingClientRect().height));
            assert.equal(chats.altoDeLaBarra, sinElla, "la barra no crece");
            assert.equal(correo.altoDeLaBarra, sinElla, "la barra no crece");
            assert.equal(await en("/chats", ["/chats"]), null, "sin Correos en el menú no sale");
            // Y el enlace lleva a la otra.
            await en("/chats");
            assert.equal(await p.getAttribute("[data-bandeja=correo]", "href"), "/correo");
            // La campanita trae sus datos de acciones mudas con otra forma y se
            // queja al pintar: eso es del arnés, no de la barrita. Cualquier
            // otro error sí cuenta.
            assert.deepEqual(errores.filter((e) => !e.includes("reading 'filter'")), []);
            await p.close();
        });
    }
}
