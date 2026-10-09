// El diálogo del detalle de una videollamada con IA, PINTADO en Chromium (con
// el CSS del build si lo hay): «Detalle de la videollamada», el video de la
// sala que se reproduce, la transcripción de Tavus por turnos y el resumen, y
// sin el «Reintentar» de AstraCalls.
// Lo corre `scripts/banco-detalle-de-videollamada.sh`.
//
// `MODO=roto` pinta el diálogo de `RAIZ_DEL_ANTES` con la MISMA fila y afirma
// el fallo: «Detalle de la llamada» y ningún video.
import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import fs from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const MODO = process.env.MODO ?? "bueno";
const aqui = process.cwd();
const RAIZ = process.env.RAIZ_DEL_ANTES ?? aqui;
const OUT = join(aqui, "lib/__tests__/.compilado/grabacion-de-videollamada");
fs.mkdirSync(OUT, { recursive: true });
execSync(
    `npx esbuild ${aqui}/lib/__tests__/detalle-de-videollamada/arnes.tsx --bundle --format=iife ` +
        `--tsconfig=${RAIZ}/tsconfig.json --alias:@=${RAIZ} ` +
        `--alias:@/actions/calls-crm-actions=${aqui}/lib/__tests__/detalle-de-videollamada/acciones.ts ` +
        `--alias:@/actions/calls-recording-actions=${aqui}/lib/__tests__/detalle-de-videollamada/acciones.ts ` +
        `--loader:.tsx=tsx --jsx=automatic --define:process.env.NODE_ENV='"production"' ` +
        `--outfile=${OUT}/detalle.js --log-level=error`,
    { stdio: "inherit", env: { ...process.env, NODE_PATH: `${aqui}/node_modules` } },
);
const paquete = fs.readFileSync(`${OUT}/detalle.js`, "utf8");
const DIR_CSS = join(aqui, ".next/static/css");
const CSS = fs.existsSync(DIR_CSS)
    ? fs.readdirSync(DIR_CSS).filter((f) => f.endsWith(".css")).map((f) => fs.readFileSync(join(DIR_CSS, f), "utf8")).join("\n")
    : "";

async function abrir(navegador) {
    const pagina = await navegador.newPage({ viewport: { width: 1280, height: 900 } });
    await pagina.route("http://crm.test/detalle.js", (r) => r.fulfill({ contentType: "text/javascript; charset=utf-8", body: paquete }));
    await pagina.route("http://crm.test/", (r) =>
        r.fulfill({ contentType: "text/html; charset=utf-8", body: `<html><head><meta charset="utf-8"><style>${CSS}</style></head><body><div id="pantalla"></div><script src="/detalle.js"></script></body></html>` }),
    );
    await pagina.goto("http://crm.test/");
    await pagina.waitForFunction(() => window.listo === true);
    // Un video de verdad, grabado aquí mismo: dos segundos de un lienzo.
    const url = await pagina.evaluate(async () => {
        const c = document.createElement("canvas");
        c.width = 320;
        c.height = 180;
        const x = c.getContext("2d");
        const r = new MediaRecorder(c.captureStream(15), { mimeType: "video/webm" });
        const trozos = [];
        r.ondataavailable = (e) => trozos.push(e.data);
        let n = 0;
        const reloj = setInterval(() => { x.fillStyle = `hsl(${n++ * 9} 70% 50%)`; x.fillRect(0, 0, 320, 180); }, 60);
        r.start();
        await new Promise((ok) => setTimeout(ok, 2000));
        await new Promise((ok) => { r.onstop = ok; r.stop(); });
        clearInterval(reloj);
        return URL.createObjectURL(new Blob(trozos, { type: "video/webm" }));
    });
    return { pagina, url };
}

test("el detalle de una videollamada", async (t) => {
    const navegador = await chromium.launch();
    t.after(() => navegador.close());
    const { pagina, url } = await abrir(navegador);
    await pagina.evaluate((u) => window.abrir(u), url);
    await pagina.waitForSelector("[data-detalle-de-llamada]");
    await pagina.waitForTimeout(500);
    const titulo = await pagina.locator("[data-detalle-de-llamada] h2").innerText();
    const videos = await pagina.locator("[data-detalle-de-llamada] video").count();

    if (MODO === "roto") {
        await t.test("ANTES: salía como «Detalle de la llamada» y sin video", () => {
            assert.equal(titulo, "Detalle de la llamada");
            assert.equal(videos, 0);
        });
        return;
    }

    await t.test("se titula «Detalle de la videollamada»", () => {
        assert.equal(titulo, "Detalle de la videollamada");
    });
    await t.test("el video de la sala está y se reproduce", async () => {
        assert.equal(videos, 1);
        const v = pagina.locator("[data-video-de-la-llamada]");
        assert.equal(await v.getAttribute("src"), url);
        assert.equal(await v.getAttribute("preload"), "metadata");
        const medido = await v.evaluate(async (el) => {
            if (el.readyState < 1) await new Promise((ok) => { el.onloadedmetadata = ok; setTimeout(ok, 3000); });
            return { ancho: el.videoWidth, alto: el.videoHeight, controles: el.controls };
        });
        assert.deepEqual(medido, { ancho: 320, alto: 180, controles: true });
        // Con video no se pinta además la nota de voz (sería la misma llamada dos veces).
        assert.equal(await pagina.locator('[data-detalle-de-llamada] [data-nota-de-voz], [data-detalle-de-llamada] audio').count(), 0);
    });
    await t.test("la transcripción de Tavus sale por turnos (Asistente / Cliente) y el resumen está", async () => {
        const turnos = await pagina.locator("[data-turno]").evaluateAll((els) => els.map((e) => e.getAttribute("data-turno")));
        assert.deepEqual(turnos, ["asistente", "persona", "asistente"]);
        assert.match(await pagina.locator('[data-bloque="resumen"]').innerText(), /vio la demo de Chats/);
    });
    await t.test("sin el «Reintentar» de AstraCalls", async () => {
        assert.equal(await pagina.locator("[data-reintentar-transcripcion]").count(), 0);
    });
    await pagina.screenshot({ path: join(OUT, "detalle-de-videollamada.png") });

    await t.test("una videollamada SIN grabación enseña la transcripción y el resumen igual", async () => {
        await pagina.evaluate(() => window.abrir(null));
        await pagina.waitForTimeout(500);
        assert.equal(await pagina.locator("[data-detalle-de-llamada] video").count(), 0);
        assert.equal(await pagina.locator("[data-turno]").count(), 3);
        assert.match(await pagina.locator('[data-bloque="resumen"]').innerText(), /vio la demo/);
    });
});
