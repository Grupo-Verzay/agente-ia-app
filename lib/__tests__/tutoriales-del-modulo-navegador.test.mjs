/**
 * La ventana «Tutoriales del módulo» abierta de verdad, en Chromium sobre el
 * CSS del build, con la `Breadcrumbs` real y tres tarjetas —un vídeo de
 * YouTube, una guía de /guia y una sin descripción— a 1440, 1024 y 640 (en un teléfono el botón no sale):
 *
 * - Cada tarjeta: el título, debajo la descripción y AL FINAL «Ver tutorial».
 * - El botón es el azul de crear (medido contra una sonda `bg-blue-600`) en
 *   estilo secundario: fondo blanco, borde y letra de ese azul. Nada rojo.
 * - Todas iguales: el botón mide lo mismo y arranca en el mismo sitio en cada
 *   tarjeta, y sale entero (con su palabra) también en el ancho más estrecho.
 * - Abre el enlace en otra pestaña, sin `window.opener`.
 *
 * `MODO=roto` monta la barra de ANTES_REF y afirma el fallo: el botón rojo
 * «Ver en YouTube», puesto ENTRE el título y la descripción.
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
const HARNESS = join(AQUI, ".compilado", "tutoriales", ROTO ? "antes.js" : "hoy.js");
const DIR_CSS = join(RAIZ, ".next", "static", "css");
const CSS = fs.existsSync(DIR_CSS)
    ? fs.readdirSync(DIR_CSS).filter((f) => f.endsWith(".css")).map((f) => fs.readFileSync(join(DIR_CSS, f), "utf8")).join("\n")
    : null;
if (!(chromium && CSS && fs.existsSync(HARNESS))) {
    console.error("[banco] sin navegador, sin CSS del build o sin arnés: no se ejerce nada");
    process.exit(1);
}

const TARJETAS = [
    { id: "yt", path: "/sessions", title: "Cómo filtrar tus leads", description: "Un vídeo corto con los contadores y el buscador.", url: "https://www.youtube.com/watch?v=abc" },
    { id: "guia-leads", path: "/sessions", title: "Guía de Leads", description: "Aprende a organizar y filtrar tus contactos de WhatsApp en la plataforma", url: "/guia/leads" },
    { id: "sin", path: "/sessions", title: "Tutorial sin descripción", description: null, url: "https://youtu.be/xyz" },
];

// La letra de la App (Poppins, auto-alojada): medir «cabe en una línea» con la
// letra de respaldo diría otra cosa que en producción.
const POPPINS = (peso) =>
    `@font-face{font-family:PoppinsBanco;font-weight:${peso};src:url(data:font/woff2;base64,${fs
        .readFileSync(join(RAIZ, "app", "fonts", `poppins-${peso}.woff2`))
        .toString("base64")}) format("woff2")}`;

let servidor, puerto, navegador;
test.before(async () => {
    const html = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>${CSS}</style><style>${POPPINS(400)}${POPPINS(700)}body{font-family:PoppinsBanco,sans-serif}</style></head>
<body style="margin:0"><div id="app"></div>
<div id="sonda" class="bg-blue-600" style="width:10px;height:10px"></div>
<script>window.process=window.process||{env:{}};</script>
<script type="module">${fs.readFileSync(HARNESS, "utf8")}</script></body></html>`;
    servidor = http.createServer((q, res) => {
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

function medir() {
    const azul = getComputedStyle(document.getElementById("sonda")).backgroundColor;
    const dialogo = document.querySelector('[role="dialog"]');
    const tarjetas = [...dialogo.querySelectorAll("li")].map((li) => {
        const c = li.getBoundingClientRect();
        const titulo = li.querySelector("h3");
        const desc = li.querySelector("p");
        const boton = li.querySelector("a, button");
        const b = boton.getBoundingClientRect();
        const s = getComputedStyle(boton);
        return {
            texto: li.textContent,
            tituloAbajo: titulo.getBoundingClientRect().bottom,
            descArriba: desc ? desc.getBoundingClientRect().top : null,
            descAbajo: desc ? desc.getBoundingClientRect().bottom : null,
            botonArriba: b.top,
            botonIzq: Math.round(b.left - c.left),
            botonAncho: Math.round(b.width),
            botonAlto: Math.round(b.height),
            botonTexto: boton.innerText.trim(),
            fondo: s.backgroundColor,
            borde: s.borderTopColor,
            bordeAncho: s.borderTopWidth,
            letra: s.color,
            href: boton.getAttribute("href"),
            target: boton.getAttribute("target"),
            rel: boton.getAttribute("rel") ?? "",
            dentro: b.right <= c.right + 0.5,
        };
    });
    return { azul, tarjetas, desborda: document.documentElement.scrollWidth > window.innerWidth };
}

// Desde `sm` (640): en un teléfono «Ver tutoriales» no sale de la barra —sus
// guías están en «Ayuda»—, así que la ventana se abre desde el ancho más
// estrecho en el que el botón existe.
for (const [ancho, alto] of [[1440, 900], [1024, 768], [640, 740]]) {
    test(`${ancho}: ${ROTO ? "ANTES el botón era «Ver en YouTube» en rojo" : "título, descripción y «Ver tutorial» azul secundario, todas iguales"}`, async () => {
        const p = await navegador.newPage({ viewport: { width: ancho, height: alto } });
        const errores = [];
        p.on("pageerror", (e) => errores.push(String(e)));
        await p.goto(`http://127.0.0.1:${puerto}/`);
        await p.waitForFunction("window.listo === true", null, { timeout: 15000 });
        await p.addStyleTag({ content: "*,*::before,*::after{transition:none!important;animation:none!important}" });
        await p.evaluate((t) => { window.__tutoriales = t; }, TARJETAS);
        await p.evaluate(() => window.maquetaBarra("/sessions", ["/sessions"]));
        const disparador = p.locator("header button", { has: p.locator("svg.lucide-play") });
        await disparador.waitFor({ timeout: 10000 });
        await disparador.click();
        await p.waitForSelector('[role="dialog"] li');
        await p.waitForTimeout(200);
        const m = await p.evaluate(`(${medir})()`);
        assert.deepEqual(errores, []);
        assert.equal(m.tarjetas.length, 3);

        if (ROTO) {
            for (const t of m.tarjetas) {
                assert.match(t.texto, /Ver en YouTube/, "ANTES decía «Ver en YouTube»");
                assert.equal(t.fondo, "rgb(255, 0, 51)", "ANTES era un bloque rojo");
                if (t.descArriba !== null) assert.ok(t.botonArriba < t.descArriba, "ANTES el botón iba ENTRE título y descripción");
            }
            await p.close();
            return;
        }

        const [a] = m.tarjetas;
        for (const t of m.tarjetas) {
            assert.equal(t.botonTexto, "Ver tutorial", "el botón dice «Ver tutorial», también en el ancho más estrecho");
            assert.doesNotMatch(t.texto, /YouTube/);
            if (t.descArriba !== null) {
                assert.ok(t.tituloAbajo <= t.descArriba + 0.5, "la descripción va debajo del título");
                assert.ok(t.descAbajo <= t.botonArriba + 0.5, "el botón va AL FINAL, debajo de la descripción");
            } else {
                assert.ok(t.tituloAbajo <= t.botonArriba + 0.5);
            }
            assert.equal(t.fondo, "rgb(255, 255, 255)", "fondo blanco, no un bloque sólido");
            assert.equal(t.borde, m.azul, "el borde es el azul del botón de crear");
            assert.equal(t.letra, m.azul, "la letra es el azul del botón de crear");
            assert.equal(t.bordeAncho, "1px");
            assert.equal(t.target, "_blank");
            assert.match(t.rel, /noopener/);
            assert.ok(t.dentro, "el botón no se sale de la tarjeta");
            // Simétricas: el mismo botón en el mismo sitio en todas.
            assert.equal(t.botonIzq, a.botonIzq);
            assert.equal(t.botonAncho, a.botonAncho);
            assert.equal(t.botonAlto, a.botonAlto);
        }
        assert.deepEqual(m.tarjetas.map((t) => t.href), TARJETAS.map((t) => t.url));
        assert.equal(m.desborda, false);
        await p.close();
    });
}

// ── Cada descripción cabe en UNA línea de la tarjeta ──
// Las de verdad: las de las guías y las corregidas de la base. Y una larga de
// las de antes, que tiene que partirse: si no, la medida no está mirando.
if (!ROTO) {
    const { TUTORIALES_DE_LAS_GUIAS } = await import("./.compilado/tutoriales/tutoriales-del-modulo.mjs");
    const { DESCRIPCIONES_DE_LOS_TUTORIALES } = await import("../../scripts/descripciones-de-los-tutoriales.mjs");
    const textos = [...new Set([...TUTORIALES_DE_LAS_GUIAS.map((t) => t.description), ...DESCRIPCIONES_DE_LOS_TUTORIALES.map((d) => d.ahora)])];
    const LARGA = "Aprende cómo gestionar conversaciones de tus clientes y administrar todo desde un solo lugar.";
    const tarjetas = [...textos, LARGA].map((d, i) => ({ id: `t${i}`, path: "/sessions", title: `Tutorial ${i}`, description: d, url: `/guia/x${i}` }));

    for (const [ancho, alto] of [[1440, 900], [1024, 768]]) {
        test(`${ancho}: las ${textos.length} descripciones caben en una sola línea de la tarjeta (con Poppins)`, async () => {
            const p = await navegador.newPage({ viewport: { width: ancho, height: alto } });
            await p.goto(`http://127.0.0.1:${puerto}/`);
            await p.waitForFunction("window.listo === true", null, { timeout: 15000 });
            await p.evaluate(() => document.fonts.ready);
            await p.addStyleTag({ content: "*,*::before,*::after{transition:none!important;animation:none!important}" });
            await p.evaluate((t) => { window.__tutoriales = t; }, tarjetas);
            await p.evaluate(() => window.maquetaBarra("/sessions", ["/sessions"]));
            await p.locator("header button", { has: p.locator("svg.lucide-play") }).click();
            await p.waitForSelector('[role="dialog"] li p');
            await p.evaluate(() => document.fonts.ready);
            const lineas = await p.evaluate(() =>
                [...document.querySelectorAll('[role="dialog"] li p')].map((el) => {
                    const alto = el.getBoundingClientRect().height;
                    const linea = parseFloat(getComputedStyle(el).lineHeight);
                    return { texto: el.textContent, lineas: Math.round(alto / linea), fuente: getComputedStyle(el).fontFamily };
                }),
            );
            assert.equal(lineas.length, tarjetas.length);
            assert.match(lineas[0].fuente, /PoppinsBanco/);
            for (const l of lineas.slice(0, -1)) assert.equal(l.lineas, 1, `se parte en ${l.lineas} líneas: ${l.texto}`);
            assert.ok(lineas.at(-1).lineas >= 2, "la larga de antes tiene que partirse, o la medida no mira nada");
            await p.close();
        });
    }
}
