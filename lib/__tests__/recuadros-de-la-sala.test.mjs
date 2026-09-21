/**
 * El reparto de la sala, en Chromium y con el componente real.
 *
 * El fallo que arregla: en la vista de orador, quién va en grande cambia cada
 * pocos segundos, y la persona que se mueve de grande a la tira se REMONTA. Con
 * el audio en ese `<video>`, el remonte le soltaba el `srcObject` y se quedaba
 * muda —«apago la cámara y no se oye a nadie», porque apagar la cámara cambia
 * quién habla y de paso remonta al otro—. El arreglo saca el audio a un
 * `<audio>` estable (el pool) que no entra en el reparto.
 *
 * Se comprueba en DOS modos:
 *   - BUENO: el `<audio>` de una persona es el MISMO nodo del DOM tras cambiar
 *     de orador y apagar la cámara, con su `srcObject` y sonando.
 *   - ROTO: la estructura vieja remonta el `<video>` de esa persona al cambiar
 *     de orador (cambia el nodo del DOM). Sin este modo, lo verde no diría si se
 *     arregló la causa o si el caso no se ejercía.
 *
 * Se monta con `scripts/banco-recuadros-sala.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { readFileSync } from "node:fs";
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

const AQUI = dirname(fileURLToPath(import.meta.url));
const HARNESS = join(AQUI, ".compilado", "harness-recuadros-sala.js");

function levantar() {
    const bundle = readFileSync(HARNESS);
    const server = http.createServer((req, res) => {
        const u = (req.url ?? "/").split("?")[0];
        if (u === "/") {
            res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
            res.end(
                `<!doctype html><html><body><div id="bueno"></div><div id="roto"></div>` +
                    `<script type="module" src="/harness-recuadros-sala.js"></script></body></html>`,
            );
            return;
        }
        if (u === "/harness-recuadros-sala.js") {
            res.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8" });
            res.end(bundle);
            return;
        }
        res.writeHead(404);
        res.end("no");
    });
    return new Promise((r) => server.listen(0, () => r(server)));
}

async function abrir() {
    const server = await levantar();
    const base = `http://127.0.0.1:${server.address().port}`;
    const navegador = await chromium.launch({
        executablePath: process.env.CHROME_BIN || undefined,
        args: ["--autoplay-policy=no-user-gesture-required"],
    });
    const page = await (await navegador.newContext()).newPage();
    await page.goto(base + "/", { waitUntil: "load" });
    await page.waitForFunction("window.listo === true", { timeout: 20000 });
    return {
        page,
        async cerrar() {
            await navegador.close();
            server.close();
        },
    };
}

test("el audio de una persona sobrevive al cambio de orador y a apagar la cámara (BUENO)", async (t) => {
    if (!chromium) return t.skip("sin playwright en este equipo");
    const { page, cerrar } = await abrir();
    try {
        const r = await page.evaluate(async () => {
            const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
            // Un stream de audio de verdad para «R», para poder mirar que suena.
            const ctx = new AudioContext();
            const osc = ctx.createOscillator();
            osc.frequency.value = 440;
            const dest = ctx.createMediaStreamDestination();
            osc.connect(dest);
            osc.start();
            const rStream = dest.stream;
            window.rStream = rStream;

            const gente = (enGrande, camaraDeR) => [
                { id: "yo", stream: null, nombre: "Tú (tú)", hayVideo: false, micEncendido: true, compartiendo: false, manoLevantada: false, propio: true },
                { id: "R", stream: rStream, nombre: "R", hayVideo: camaraDeR, micEncendido: true, compartiendo: false, manoLevantada: false },
            ];

            // Arranca con R en grande y su cámara encendida.
            window.pintarBueno({ gente: gente("R", true), enGrande: "R" });
            await sleep(200);
            const antes = document.querySelector('[data-audio-remoto="R"]');
            const idAntes = antes; // guardamos el NODO para comparar identidad
            const srcAntes = antes && antes.srcObject === rStream;
            await antes?.play?.().catch(() => {});
            await sleep(200);
            const sonabaAntes = antes ? !antes.paused : false;

            // Cambia el orador a «yo» (R se va a la tira) y APAGA la cámara de R.
            // Es justo el baile que remontaba el `<video>` de R.
            window.pintarBueno({ gente: gente("yo", false), enGrande: "yo" });
            await sleep(200);
            // Y otra vuelta: R vuelve a grande.
            window.pintarBueno({ gente: gente("R", false), enGrande: "R" });
            await sleep(200);

            const despues = document.querySelector('[data-audio-remoto="R"]');
            return {
                habiaAntes: Boolean(antes),
                mismoNodo: idAntes === despues, // ¿el MISMO `<audio>`?
                srcAntes,
                srcDespues: despues && despues.srcObject === rStream,
                sonabaAntes,
                sonandoDespues: despues ? !despues.paused : false,
                // Ningún `<video>` puede quedar sonando: el audio sale solo del pool.
                videosNoMudos: Array.from(document.querySelectorAll("#bueno video")).filter((v) => !v.muted).length,
            };
        });

        assert.ok(r.habiaAntes, "R tiene su `<audio>` en el pool");
        assert.ok(r.srcAntes, "el `<audio>` de R arranca con su stream");
        assert.ok(r.sonabaAntes, "el `<audio>` de R estaba sonando");
        // Lo que de verdad importa: es el MISMO nodo, así que nunca se soltó el
        // audio.
        assert.ok(
            r.mismoNodo,
            "el `<audio>` de R es el MISMO nodo tras cambiar de orador y apagar la cámara",
        );
        assert.ok(r.srcDespues, "el `<audio>` de R conserva su stream");
        assert.ok(r.sonandoDespues, "el `<audio>` de R sigue sonando");
        assert.equal(r.videosNoMudos, 0, "ningún `<video>` suena: el audio va solo por el pool");
    } finally {
        await cerrar();
    }
});

test("la estructura vieja SÍ remonta el `<video>` de quien cambia de sitio (ROTO)", async (t) => {
    if (!chromium) return t.skip("sin playwright en este equipo");
    const { page, cerrar } = await abrir();
    try {
        const cambia = await page.evaluate(async () => {
            const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
            const ctx = new AudioContext();
            const osc = ctx.createOscillator();
            const dest = ctx.createMediaStreamDestination();
            osc.connect(dest);
            osc.start();
            const rStream = dest.stream;

            const gente = (enGrande) => [
                { id: "yo", stream: null, nombre: "yo", hayVideo: false, micEncendido: true, compartiendo: false, manoLevantada: false, propio: true },
                { id: "R", stream: rStream, nombre: "R", hayVideo: true, micEncendido: true, compartiendo: false, manoLevantada: false },
            ];

            window.pintarRoto({ gente: gente("R"), enGrande: "R" });
            await sleep(150);
            const antes = document.querySelector('[data-video-roto="R"]');
            window.pintarRoto({ gente: gente("yo"), enGrande: "yo" });
            await sleep(150);
            const despues = document.querySelector('[data-video-roto="R"]');
            return { habia: Boolean(antes), mismoNodo: antes === despues };
        });

        assert.ok(cambia.habia, "R tenía su `<video>` en la estructura vieja");
        // El nodo CAMBIA: la estructura vieja lo remonta al cambiar de orador, y
        // con el audio dentro, eso era el corte.
        assert.equal(
            cambia.mismoNodo,
            false,
            "la estructura vieja remonta el `<video>` de R al cambiar de orador",
        );
    } finally {
        await cerrar();
    }
});
