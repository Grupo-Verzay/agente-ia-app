/**
 * La campana de VERDAD, abierta en Chromium sobre el CSS del build:
 *
 *  - nueve pastillas en tres filas de tres, en el orden pedido;
 *  - las nueve del MISMO ancho y alto, con los mismos huecos: simétrica;
 *  - ningún rótulo recortado ni ningún número fuera de su pastilla, también
 *    «Créditos bajos», que es el más largo, a 1440/1280/1024/390;
 *  - Correos enseña el número de los buzones, y cada pastilla nueva filtra lo
 *    suyo.
 *
 * `MODO=roto` monta la campana de `ANTES_REF` y afirma el fallo: seis
 * pastillas y ninguna de las tres nuevas.
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
const HARNESS = join(AQUI, ".compilado", "campana", ROTO ? "navegador-antes.js" : "navegador.js");
const DIR_CSS = join(RAIZ, ".next", "static", "css");
const CSS = fs.existsSync(DIR_CSS)
    ? fs.readdirSync(DIR_CSS).filter((f) => f.endsWith(".css")).map((f) => fs.readFileSync(join(DIR_CSS, f), "utf8")).join("\n")
    : null;
if (!(chromium && CSS && fs.existsSync(HARNESS))) {
    console.error("[banco] sin navegador, sin CSS del build o sin arnés: no se ejerce nada");
    process.exit(1);
}

const ORDEN = [
    "Chats", "Correos", "Citas",
    "Menciones", "Asignaciones", "Mis tareas",
    "Seguimientos", "Errores", "Créditos bajos",
];
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

async function abrir(ancho, alto, correos = 7, muchos = false) {
    const p = await navegador.newPage({ viewport: { width: ancho, height: alto } });
    const errores = [];
    p.on("pageerror", (e) => errores.push(String(e)));
    await p.goto(`http://127.0.0.1:${puerto}/`);
    await p.waitForFunction("window.listo === true", null, { timeout: 15000 });
    await p.evaluate((n) => { window.__correosSinLeer = n.correos; window.__muchos = n.muchos; window.__soloViejas = n.roto; window.montar(); }, { correos, muchos, roto: ROTO });
    await p.addStyleTag({ content: "*,*::before,*::after{transition:none!important;animation:none!important}" });
    await p.click("button[aria-label='Centro de notificaciones']");
    await p.waitForSelector("[role=menu] button");
    // Espera a que lleguen la carga y el número de correos.
    await p.waitForTimeout(400);
    return { p, errores };
}

/** Las pastillas del panel, medidas: rótulo, número, caja y si algo se recorta. */
function medir() {
    const menu = document.querySelector("[role=menu]");
    // Las pastillas son los botones de la rejilla; se buscan por eso y no por
    // una marca de hoy, para que el «antes» se mida igual.
    const chips = [...menu.querySelectorAll("button")].filter((b) => getComputedStyle(b.parentElement).display === "grid");
    return chips.map((b) => {
        const r = b.getBoundingClientRect();
        const rotulo = b.querySelector("span");
        const numero = b.lastElementChild;
        const rn = numero.getBoundingClientRect();
        return {
            rotulo: rotulo.textContent,
            numero: numero.textContent,
            x: Math.round(r.left * 10) / 10, y: Math.round(r.top * 10) / 10, w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10,
            recortado: rotulo.scrollWidth > rotulo.clientWidth + 0.5,
            numeroFuera: rn.right > r.right + 0.5 || rn.left < r.left - 0.5,
            letra: getComputedStyle(rotulo).fontSize,
            nat: rotulo.scrollWidth, disp: rotulo.clientWidth, badge: Math.round(rn.width * 10) / 10,
        };
    });
}

// Dos juegos de números: los de todos los días, y el peor caso —«99+» en las
// nueve—, que es cuando la pastilla deja menos sitio al rótulo.
for (const [ancho, alto] of VENTANAS) for (const muchos of [false, true]) {
    test(`${ancho}${muchos ? " con 99+" : ""}: nueve pastillas, tres grupos de tres, simétricas y sin recortes`, async () => {
        const { p, errores } = await abrir(ancho, alto, muchos ? 500 : 7, muchos);
        const chips = await p.evaluate(medir);
        console.log(`  ${ancho}: ` + chips.map((c) => `${c.rotulo}[${c.numero}] ${c.w}×${c.h} n${c.nat}/d${c.disp}/b${c.badge}${c.recortado ? " RECORTADO" : ""}`).join(" · "));
        if (ROTO) {
            assert.equal(chips.length, 6, "antes eran seis");
            for (const nueva of ["Correos", "Asignaciones", "Créditos bajos"]) {
                assert.ok(!chips.some((c) => c.rotulo === nueva), `antes no había «${nueva}»`);
            }
            await p.close();
            return;
        }
        assert.deepEqual(chips.map((c) => c.rotulo), ORDEN, "el orden de izquierda a derecha y de arriba abajo");
        const filas = [...new Set(chips.map((c) => c.y))];
        assert.equal(filas.length, 3, "tres filas");
        const columnas = [...new Set(chips.map((c) => c.x))];
        assert.equal(columnas.length, 3, "tres columnas, alineadas");
        for (let f = 0; f < 3; f++) {
            assert.deepEqual(chips.slice(f * 3, f * 3 + 3).map((c) => c.y), [filas[f], filas[f], filas[f]], `la fila ${f + 1} va entera`);
        }
        assert.equal(new Set(chips.map((c) => c.w)).size, 1, `las nueve miden lo mismo de ancho: ${chips.map((c) => c.w)}`);
        assert.equal(new Set(chips.map((c) => c.h)).size, 1, `y de alto: ${chips.map((c) => c.h)}`);
        assert.equal(new Set(chips.map((c) => c.letra)).size, 1, "la misma letra");
        const huecosX = [columnas[1] - columnas[0], columnas[2] - columnas[1]];
        const huecosY = [filas[1] - filas[0], filas[2] - filas[1]];
        assert.ok(Math.abs(huecosX[0] - huecosX[1]) < 0.2, `los mismos huecos entre columnas: ${huecosX}`);
        assert.ok(Math.abs(huecosY[0] - huecosY[1]) < 0.2, `y entre filas: ${huecosY}`);
        for (const c of chips) {
            assert.ok(!c.recortado, `«${c.rotulo}» se recorta a ${ancho}`);
            assert.ok(!c.numeroFuera, `el número de «${c.rotulo}» se sale a ${ancho}`);
        }
        const doc = await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
        assert.ok(doc, "la página no desborda a lo ancho");
        assert.deepEqual(errores, []);
        await p.close();
    });
}

test("Correos enseña el número de los buzones, y «no se sabe» no es cero", { skip: ROTO ? "el «antes» no tenía Correos" : false }, async () => {
    const { p } = await abrir(1440, 900, 7);
    let chips = await p.evaluate(medir);
    assert.equal(chips.find((c) => c.rotulo === "Correos").numero, "7");
    await p.click("[data-chip=correo]");
    const lista = await p.evaluate(() => document.querySelector("[role=menu]").textContent);
    assert.match(lista, /Tienes 7 correos sin leer/);
    await p.close();

    const otra = await abrir(1440, 900, null);
    chips = await otra.p.evaluate(medir);
    assert.equal(chips.find((c) => c.rotulo === "Correos").numero, "—");
    await otra.p.close();
});

test("cada pastilla nueva filtra lo suyo", { skip: ROTO ? "el «antes» no las tenía" : false }, async () => {
    const { p } = await abrir(1440, 900);
    const chips = await p.evaluate(medir);
    assert.equal(chips.find((c) => c.rotulo === "Asignaciones").numero, "2");
    assert.equal(chips.find((c) => c.rotulo === "Créditos bajos").numero, "1");
    await p.click("[data-chip=asignacion]");
    let texto = await p.evaluate(() => document.querySelector("[role=menu]").textContent);
    assert.match(texto, /Te asignaron el chat con Marta López/);
    assert.match(texto, /Te quitaron el chat con Pedro Pérez/);
    assert.doesNotMatch(texto, /créditos/);
    await p.click("[data-chip=creditos]");
    texto = await p.evaluate(() => document.querySelector("[role=menu]").textContent);
    assert.match(texto, /te queda el 5 % de los créditos/);
    assert.doesNotMatch(texto, /Marta/);
    await p.close();
});
