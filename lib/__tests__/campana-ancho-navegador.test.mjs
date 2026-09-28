/**
 * El ancho de la campana, medido contra el de un panel lateral de VERDAD.
 *
 * En Chromium sobre el CSS del build, con la campana real abierta y, en la
 * misma página, la franja de `PanelLateral` (`FRANJA_DEL_PANEL`), que es la del
 * chat del equipo, el copiloto, las notas y la ficha de contacto:
 *
 *  - de 640 px para arriba mide EXACTAMENTE lo mismo que esa franja y acaba en
 *    el mismo filo derecho — igual, no parecido;
 *  - en un teléfono, donde la franja es la pantalla entera, se queda dentro de
 *    la ventana;
 *  - las nueve pastillas siguen siendo tres filas de tres, sin un rótulo
 *    recortado, también con «99+» en todas (eso lo mide además
 *    `campana-navegador.test.mjs`).
 *
 * `MODO=roto` monta la campana de `ANTES_REF` y AFIRMA el fallo: 420 px, más
 * ancha que los paneles laterales.
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
const HARNESS = join(AQUI, ".compilado", "campana", ROTO ? "ancho-antes.js" : "navegador.js");
const DIR_CSS = join(RAIZ, ".next", "static", "css");
const CSS = fs.existsSync(DIR_CSS)
    ? fs.readdirSync(DIR_CSS).filter((f) => f.endsWith(".css")).map((f) => fs.readFileSync(join(DIR_CSS, f), "utf8")).join("\n")
    : null;
if (!(chromium && CSS && fs.existsSync(HARNESS))) {
    console.error("[banco] sin navegador, sin CSS del build o sin arnés: no se ejerce nada");
    process.exit(1);
}

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

async function medir(ancho, alto, muchos = false) {
    const p = await navegador.newPage({ viewport: { width: ancho, height: alto } });
    const errores = [];
    p.on("pageerror", (e) => errores.push(String(e)));
    await p.goto(`http://127.0.0.1:${puerto}/`);
    await p.waitForFunction("window.listo === true", null, { timeout: 15000 });
    await p.evaluate((m) => { window.__correosSinLeer = m ? 500 : 7; window.__muchos = m; window.__soloViejas = false; window.montar(); }, muchos);
    await p.addStyleTag({ content: "*,*::before,*::after{transition:none!important;animation:none!important}" });
    // El «antes» usaba una clase que el build de hoy ya no genera: se le pone
    // la regla exacta que generaba Tailwind, para medir lo que medía de verdad.
    if (ROTO) await p.addStyleTag({ content: ".w-\\[min\\(96vw\\2c 420px\\)\\]{width:min(96vw,420px)}" });
    await p.click("button[aria-label='Centro de notificaciones']");
    await p.waitForSelector("[role=menu] button");
    await p.waitForTimeout(400);
    const m = await p.evaluate(() => {
        const menu = document.querySelector("[role=menu]").getBoundingClientRect();
        const sonda = document.querySelector("[data-sonda-panel-lateral]").getBoundingClientRect();
        const chips = [...document.querySelectorAll("[role=menu] button")]
            .filter((b) => getComputedStyle(b.parentElement).display === "grid")
            .map((b) => {
                const r = b.getBoundingClientRect();
                const s = b.querySelector("span");
                return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width * 10) / 10, recortado: s.scrollWidth > s.clientWidth + 0.5 };
            });
        return {
            menu: { left: menu.left, right: menu.right, w: menu.width },
            panel: { left: sonda.left, right: sonda.right, w: sonda.width },
            chips,
            desborda: document.documentElement.scrollWidth > window.innerWidth,
        };
    });
    await p.close();
    return { ...m, errores };
}

const ESCRITORIO = [[1440, 900], [1280, 800], [1024, 768], [800, 700], [700, 700]];

for (const [ancho, alto] of ESCRITORIO) {
    test(`${ancho}: la campana mide lo mismo que un panel lateral`, async () => {
        const m = await medir(ancho, alto);
        console.log(`  ${ancho}: campana ${m.menu.w} (${m.menu.left}→${m.menu.right}) · panel lateral ${m.panel.w} (${m.panel.left}→${m.panel.right})`);
        if (ROTO) {
            // El CSS es el del build de hoy, donde `w-[min(96vw,420px)]` ya no
            // existe; `montar` le devuelve su regla (ver abajo).
            if (ancho >= 1024) {
                assert.equal(Math.round(m.menu.w), 420, "antes la campana medía 420 px");
                assert.ok(m.menu.w > m.panel.w + 1, "y era más ancha que los paneles laterales");
            }
            return;
        }
        assert.equal(m.menu.w, m.panel.w, `el mismo ancho: ${m.menu.w} frente a ${m.panel.w}`);
        assert.equal(m.menu.right, m.panel.right, "y el mismo filo derecho");
        assert.equal(m.chips.length, 9);
        assert.equal(new Set(m.chips.map((c) => c.y)).size, 3, "tres filas");
        assert.equal(new Set(m.chips.map((c) => c.x)).size, 3, "tres columnas");
        assert.ok(!m.desborda, "la página no desborda");
        assert.deepEqual(m.errores, []);
    });
    test(`${ancho} con 99+: ningún rótulo recortado`, { skip: ROTO ? "el «antes» se mide arriba" : false }, async () => {
        const m = await medir(ancho, alto, true);
        for (const c of m.chips) assert.ok(!c.recortado, `un rótulo se recorta a ${ancho}`);
        assert.equal(new Set(m.chips.map((c) => c.w)).size, 1, "las nueve miden lo mismo");
    });
}

test("390: en un teléfono la campana se queda dentro de la ventana", { skip: ROTO ? "no aplica" : false }, async () => {
    const m = await medir(390, 740, true);
    console.log(`  390: campana ${m.menu.w} (${m.menu.left}→${m.menu.right}) · panel lateral ${m.panel.w}`);
    assert.ok(m.menu.left >= 0 && m.menu.right <= 390, "dentro de la ventana");
    for (const c of m.chips) assert.ok(!c.recortado, "ningún rótulo recortado");
    assert.ok(!m.desborda);
});
