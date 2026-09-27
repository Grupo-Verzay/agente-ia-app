/**
 * La pantalla de Correo, en CHROMIUM, sobre el CSS del build y con el
 * componente de VERDAD (las acciones se fingen apuntando lo que se les pide).
 *
 * Lo que solo se ve pintando:
 *
 * - que la lista mide lo que las demás columnas laterales de la plataforma
 *   (`--ancho-lateral`, la misma escala que la lista de Chats) y el lector se
 *   queda con el resto;
 * - que la caja de responder mide lo que la barra de escribir de Chats y del
 *   chat de equipo (`ALTO_DE_LA_BARRA`, 57 px): es la misma barra;
 * - que el correo se pinta en un iframe que NO ejecuta sus scripts;
 * - que en un teléfono se ve una cosa a la vez, con su flecha de volver;
 * - que nada desborda a lo ancho en 1440, 1280, 1024 y 390;
 * - y que responder manda el texto y el correo, nunca un destinatario.
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
    /* sin navegador no se finge: se salta y lo dice el resumen */
}

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..", "..");
const HARNESS = join(AQUI, ".compilado", "correo", "pantalla.js");
const DIR_CSS = join(RAIZ, ".next", "static", "css");
const CSS = fs.existsSync(DIR_CSS)
    ? fs.readdirSync(DIR_CSS).filter((f) => f.endsWith(".css")).map((f) => fs.readFileSync(join(DIR_CSS, f), "utf8")).join("\n")
    : null;
const hay = Boolean(chromium && CSS && fs.existsSync(HARNESS));
const ALTO_DE_LA_BARRA = 57;

async function conLaPantalla(hacer) {
    const html = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>${CSS}</style></head>
<body class="app-module-content" style="margin:0"><div id="app"></div>
<script>window.process=window.process||{env:{}};</script>
<script type="module">${fs.readFileSync(HARNESS, "utf8")}</script></body></html>`;
    const servidor = http.createServer((_q, res) => {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(html);
    }).listen(0);
    await new Promise((r) => servidor.once("listening", r));
    const navegador = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined, args: ["--no-sandbox"] });
    try {
        await hacer(navegador, servidor.address().port);
    } finally {
        await navegador.close();
        servidor.close();
    }
}

async function abrir(navegador, puerto, ancho, alto, sinBuzones = false) {
    const p = await navegador.newPage({ viewport: { width: ancho, height: alto } });
    const errores = [];
    p.on("pageerror", (e) => errores.push(String(e)));
    await p.goto(`http://127.0.0.1:${puerto}/`);
    await p.waitForFunction("window.listo === true", null, { timeout: 15000 });
    if (sinBuzones) await p.evaluate("window.__sinBuzones = true");
    await p.evaluate("window.maqueta()");
    await p.waitForTimeout(300);
    assert.deepEqual(errores, [], `la pantalla no llegó a pintarse a ${ancho}`);
    return p;
}

const VENTANAS = [[1440, 900], [1280, 800], [1024, 768], [390, 740]];

test("la lista mide la columna lateral de la plataforma, y nada desborda", { skip: !hay }, async () => {
    await conLaPantalla(async (nav, puerto) => {
        for (const [ancho, alto] of VENTANAS) {
            const p = await abrir(nav, puerto, ancho, alto);
            await p.waitForSelector("[data-correo-fila='c1']");
            const m = await p.evaluate(() => {
                const lista = document.querySelector("[data-lista-de-correos]").getBoundingClientRect();
                const sonda = document.createElement("div");
                sonda.style.width = "var(--ancho-lateral)";
                document.body.appendChild(sonda);
                const lateral = sonda.getBoundingClientRect().width;
                sonda.remove();
                return { lista: lista.width, lateral, desborda: document.documentElement.scrollWidth > window.innerWidth };
            });
            assert.equal(m.desborda, false, `desborda a ${ancho}`);
            if (ancho >= 768) assert.ok(Math.abs(m.lista - m.lateral) < 1.5, `a ${ancho} la lista mide ${m.lista} y la columna lateral ${m.lateral}`);
            await p.close();
        }
    });
});

test("abrir un correo: el cuerpo NO ejecuta scripts, hay adjuntos, y la barra de responder mide lo de Chats", { skip: !hay }, async () => {
    await conLaPantalla(async (nav, puerto) => {
        for (const [ancho, alto] of VENTANAS) {
            const p = await abrir(nav, puerto, ancho, alto);
            await p.click("[data-correo-fila='c1']");
            await p.waitForSelector("iframe[data-cuerpo-del-correo]");
            await p.waitForTimeout(250);
            const m = await p.evaluate(() => {
                const iframe = document.querySelector("iframe[data-cuerpo-del-correo]");
                const barra = document.querySelector("[data-lectura-de-correo] > div:last-child").getBoundingClientRect();
                const adjunto = document.querySelector("[data-adjuntos-del-correo] a");
                return {
                    sandbox: iframe.getAttribute("sandbox"),
                    ejecutado: Boolean(window.__ejecutado),
                    altoBarra: barra.height,
                    lista: document.querySelector("[data-lista-de-correos]").getBoundingClientRect().width,
                    lector: document.querySelector("[data-lectura-de-correo]").getBoundingClientRect().width,
                    adjunto: adjunto?.getAttribute("href") ?? null,
                    desborda: document.documentElement.scrollWidth > window.innerWidth,
                };
            });
            assert.ok(!m.sandbox.includes("allow-scripts"), "sin allow-scripts");
            assert.equal(m.ejecutado, false, "el <script> del correo no corrió");
            // `ALTO_DE_LA_BARRA` es el de escritorio: en el teléfono el marco
            // lleva menos relleno, igual que la barra de Chats.
            if (ancho >= 640) assert.equal(Math.round(m.altoBarra), ALTO_DE_LA_BARRA, `a ${ancho} la barra de responder mide ${m.altoBarra}`);
            assert.match(m.adjunto, /^\/api\/correo\/adjunto\?buzon=bz1&correo=c1&adjunto=1$/);
            assert.equal(m.desborda, false, `desborda a ${ancho} con un correo abierto`);
            if (ancho < 768) {
                assert.equal(m.lista, 0, "en el teléfono se ve una cosa a la vez");
                await p.click("button[aria-label='Volver']");
                await p.waitForTimeout(100);
                const lista = await p.evaluate(() => document.querySelector("[data-lista-de-correos]").getBoundingClientRect().width);
                assert.ok(lista > 300, "volver enseña otra vez la lista");
            } else {
                assert.ok(m.lector > 300, `a ${ancho} el lector se queda con el resto`);
            }
            await p.close();
        }
    });
});

test("responder manda el texto y el correo, nunca un destinatario", { skip: !hay }, async () => {
    await conLaPantalla(async (nav, puerto) => {
        const p = await abrir(nav, puerto, 1280, 800);
        await p.click("[data-correo-fila='c1']");
        await p.waitForSelector("textarea[aria-label='Respuesta']");
        const apagado = await p.evaluate(() => document.querySelector("button[aria-label='Enviar respuesta']").disabled);
        assert.equal(apagado, true, "vacío no se puede mandar");
        await p.fill("textarea[aria-label='Respuesta']", "Va en camino");
        await p.click("button[aria-label='Enviar respuesta']");
        await p.waitForTimeout(200);
        const llamadas = await p.evaluate(() => window.__correo.filter((c) => c.que === "responder"));
        assert.deepEqual(llamadas, [{ que: "responder", datos: { buzonId: "bz1", correoId: "c1", texto: "Va en camino" } }]);
        const vaciado = await p.evaluate(() => document.querySelector("textarea[aria-label='Respuesta']").value);
        assert.equal(vaciado, "", "tras enviar la caja se vacía");
    });
});

test("sin correo conectado: las tres formas de conectar, y la que no está configurada lo dice", { skip: !hay }, async () => {
    await conLaPantalla(async (nav, puerto) => {
        for (const [ancho, alto] of VENTANAS) {
            const p = await abrir(nav, puerto, ancho, alto, true);
            await p.waitForSelector("[data-correo-vacio]");
            const m = await p.evaluate(() => {
                const botones = [...document.querySelectorAll("[data-conectar-correo] button")].map((b) => ({ t: b.textContent.trim(), off: b.disabled }));
                return { botones, texto: document.querySelector("[data-conectar-correo]").textContent, desborda: document.documentElement.scrollWidth > window.innerWidth };
            });
            assert.deepEqual(m.botones.map((b) => b.t), ["Conectar Gmail", "Conectar Outlook", "Conectar correo de dominio propio"]);
            assert.equal(m.botones[0].off, true, "Gmail sin llaves va apagado");
            assert.match(m.texto, /Google aún no está configurada/, "y dice por qué");
            assert.equal(m.botones[1].off, false);
            assert.equal(m.desborda, false);
            await p.close();
        }
    });
});
