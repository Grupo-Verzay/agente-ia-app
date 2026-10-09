// La grabación de la videollamada cuando el navegador NO deja arrancar el
// audio sin un toque (la regla de Chrome y Safari para un `AudioContext`
// nacido sin gesto; en el TELÉFONO, casi siempre). Antes el video llevaba la
// mezcla de voces de un `AudioContext`, y con él parado no se grababa NADA:
// en el teléfono, ni un byte; en el ordenador, desde el primer clic.
//
// Chromium de Playwright no aplica esa regla, así que se FINGE: los
// `AudioContext` de la sala nacen suspendidos y `resume()` no hace nada hasta
// un clic de verdad. Ahora la sala no usa `AudioContext` para grabar: el video
// es el lienzo y cada voz va suelta con su `MediaRecorder`; aquí se mide que
// graba SOLA desde que entra, y que lo que sube, mezclado con el `ffmpeg` del
// servidor (`lasOrdenesDeLaMezcla`), es un video con las dos voces.
// La sala se monta con el Daily de mentira de `sala-que-graba/`.
// Lo corre `scripts/banco-grabacion-voces-sueltas.sh`.
//
// `MODO=roto` monta la sala de `RAIZ_DEL_ANTES` y afirma el fallo: sin un
// toque no subía ni un byte de video, y pedía un toque con un botón.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, execSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const MODO = process.env.MODO ?? "bueno";
const RAIZ = process.env.RAIZ_DEL_ANTES ?? process.cwd();
const aqui = process.cwd();
const FFMPEG = `${aqui}/node_modules/@ffmpeg-installer/linux-x64/ffmpeg`;
const dir = mkdtempSync(join(tmpdir(), "sala-sin-clic-"));
execSync(
    `npx esbuild ${aqui}/lib/__tests__/sala-que-graba/arnes.jsx --bundle --format=iife --jsx=automatic ` +
        `--tsconfig=${RAIZ}/tsconfig.json --alias:@=${RAIZ} ` +
        `--alias:@daily-co/daily-js=${aqui}/lib/__tests__/sala-que-graba/daily-con-pistas.js ` +
        `--define:process.env.NODE_ENV='"production"' --outfile=${dir}/arnes.js --log-level=error`,
    { stdio: "inherit", env: { ...process.env, NODE_PATH: `${aqui}/node_modules` } },
);
const paquete = readFileSync(`${dir}/arnes.js`, "utf8");

/** La regla del navegador, fingida: el primer `AudioContext` es el del Daily de mentira (el «remoto»). */
function laReglaDelNavegador() {
    const Real = window.AudioContext;
    let n = 0;
    window.__permiso = false;
    // El clic de VERDAD (el de `pagina.click`); `navigator.userActivation` no
    // sirve aquí: Playwright marca como gesto cada `evaluate`.
    window.__toco = false;
    window.addEventListener("pointerdown", (e) => { if (e.isTrusted) window.__toco = true; }, true);
    window.AudioContext = class extends Real {
        constructor(...a) {
            super(...a);
            n += 1;
            if (n > 1) {
                this.__sala = true;
                void super.suspend();
            }
        }
        resume() {
            if (this.__sala && !(window.__toco || window.__permiso)) return Promise.resolve();
            return super.resume();
        }
    };
}

async function abrir(navegador) {
    const pagina = await navegador.newPage();
    await pagina.addInitScript(laReglaDelNavegador);
    const t0 = Date.now();
    const pedidos = [];
    await pagina.route("http://sala.test/api/videollamada/grabacion**", async (r) => {
        const u = new URL(r.request().url());
        const a = u.searchParams.get("a");
        const cuerpo = r.request().postDataBuffer() ?? Buffer.alloc(0);
        pedidos.push({ a, cual: u.searchParams.get("cual"), pista: u.searchParams.get("pista"), desde: Number(u.searchParams.get("desde")), numero: Number(u.searchParams.get("numero")), t: Date.now() - t0, bytes: cuerpo.length, cuerpo });
        const respuesta = a === "empezar" ? { ok: true, grabacionId: "g-sin-clic" } : { ok: true };
        await r.fulfill({ contentType: "application/json", body: JSON.stringify(respuesta) });
    });
    await pagina.route("http://sala.test/arnes.js", (r) => r.fulfill({ contentType: "text/javascript", body: paquete }));
    await pagina.route(/^http:\/\/sala\.test\/(\?.*)?$/, (r) => r.fulfill({ contentType: "text/html", body: '<div id="raiz"></div><script src="/arnes.js"></script>' }));
    await pagina.goto("http://sala.test/");
    await pagina.waitForFunction(() => window.listo === true);
    return { pagina, pedidos, t0 };
}
const conBytes = (pedidos, cual) => pedidos.filter((p) => p.a === "trozo" && p.cual === cual && p.bytes > 1_000);
const lanzar = () => chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });

test("ANTES: sin un toque no subía ni un byte de video, y pedía tocar un botón", { skip: MODO !== "roto" }, async (t) => {
    const navegador = await lanzar();
    t.after(() => navegador.close());
    const { pagina, pedidos } = await abrir(navegador);
    await pagina.waitForTimeout(12_500);
    assert.equal(conBytes(pedidos, "video").length, 0, "ni un trozo de video con bytes");
    assert.equal(await pagina.locator('[data-zona="activar-sonido"]').count(), 1, "el botón que pedía el toque");
});

test("sin un solo toque, graba desde que entra", { skip: MODO !== "bueno" }, async (t) => {
    const navegador = await lanzar();
    t.after(() => navegador.close());
    const { pagina, pedidos } = await abrir(navegador);
    await pagina.waitForTimeout(11_500);

    await t.test("dice «Grabando» al entrar y no pide ningún toque", async () => {
        assert.equal(await pagina.getAttribute('[data-zona="sala"]', "data-grabando"), "si");
        assert.equal(await pagina.locator('[data-zona="aviso-de-grabacion"]').innerText(), "Grabando");
        assert.equal(await pagina.locator('[data-zona="activar-sonido"]').count(), 0);
        assert.equal(await pagina.locator("button", { hasText: "activar el audio" }).count(), 0);
        assert.equal(await pagina.evaluate(() => window.__toco), false, "nadie tocó la página");
    });

    await t.test("a los 10 s ya subió video y CADA voz por su lado, con su desde", async () => {
        const video = conBytes(pedidos, "video");
        assert.ok(video.length >= 1 && video[0].bytes > 20_000, `video: ${JSON.stringify(pedidos.map((p) => [p.a, p.cual, p.pista, p.t, p.bytes]))}`);
        assert.ok(video[0].t < 11_500, `el primer trozo a los ${video[0].t} ms`);
        const voces = conBytes(pedidos, "voz");
        const pistas = [...new Set(voces.map((p) => p.pista))].sort();
        assert.deepEqual(pistas, ["1", "2"], "la voz de Verzy y el micrófono");
        for (const p of voces) assert.ok(p.desde >= 0 && p.desde < 2_000, `la voz ${p.pista} empezó con el video (${p.desde} ms)`);
        assert.equal(pedidos.filter((p) => p.cual === "audio").length, 0, "ya no hay mezcla del navegador");
    });

    await t.test("lo subido, mezclado con el ffmpeg del servidor, es un video que se ve y lleva las dos voces", async () => {
        await pagina.click('[data-mando="salir"]');
        await pagina.waitForTimeout(1_500);
        assert.equal(pedidos.at(-1)?.a, "cerrar");
        const G = await import("./.compilado/grabacion-de-videollamada/puro.js");
        const juntar = (filtro) => Buffer.concat(pedidos.filter(filtro).sort((a, b) => a.numero - b.numero).map((p) => p.cuerpo));
        writeFileSync(join(dir, "lienzo.webm"), juntar((p) => p.a === "trozo" && p.cual === "video"));
        const voces = ["1", "2"].map((pista) => {
            const archivo = join(dir, `voz-${pista}.webm`);
            writeFileSync(archivo, juntar((p) => p.a === "trozo" && p.cual === "voz" && p.pista === pista));
            const desde = pedidos.find((p) => p.cual === "voz" && p.pista === pista).desde;
            return { archivo, desdeMs: desde };
        });
        const salidaVideo = join(dir, "video.webm");
        execFileSync(FFMPEG, G.lasOrdenesDeLaMezcla({ video: join(dir, "lienzo.webm"), voces, formato: "webm", salidaAudio: join(dir, "audio.webm"), salidaVideo }));

        let lleva = "";
        try {
            execFileSync(FFMPEG, ["-hide_banner", "-i", salidaVideo], { stdio: ["ignore", "ignore", "pipe"] });
        } catch (e) {
            lleva = String(e.stderr);
        }
        assert.match(lleva, /Video: vp8.*1280x720/, "el video de la sala, sin recodificar");
        assert.match(lleva, /Audio: opus/, "con la mezcla dentro");

        const pcm = execFileSync(FFMPEG, ["-hide_banner", "-loglevel", "error", "-i", salidaVideo, "-vn", "-ac", "1", "-ar", "48000", "-f", "s16le", "-"], { maxBuffer: 64 * 1024 * 1024 });
        const m = new Int16Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.length / 2));
        let cruces = 0;
        let energia = 0;
        for (let i = 48000 * 2 + 1; i < 48000 * 6; i += 1) {
            if ((m[i - 1] < 0) !== (m[i] < 0)) cruces += 1;
            energia += m[i] * m[i];
        }
        const rms = Math.sqrt(energia / (48000 * 4)) / 32768;
        const { spawnSync } = await import("node:child_process");
        const tiempo = (archivo) => {
            const e = String(spawnSync(FFMPEG, ["-hide_banner", "-i", archivo, "-f", "null", "-"]).stderr);
            const h = /time=(\d+):(\d+):([\d.]+)/.exec(e.slice(e.lastIndexOf("time=")));
            return h ? Number(h[1]) * 3600 + Number(h[2]) * 60 + Number(h[3]) : 0;
        };
        const delLienzo = tiempo(join(dir, "lienzo.webm"));
        const deLaVoz = tiempo(voces[0].archivo) + voces[0].desdeMs / 1000;
        console.info("[banco] mezcla medida", { segundos: m.length / 48000, rms, cruces: cruces / 4, delLienzo, deLaVoz });
        // El video y las voces A LA PAR: si el video perdiera su principio, las
        // voces irían adelantadas respecto a la imagen.
        assert.ok(Math.abs(delLienzo - deLaVoz) < 1, `video ${delLienzo} s y voz ${deLaVoz} s`);
        assert.ok(m.length / 48000 > 10, `dura lo grabado (${m.length / 48000} s)`);
        assert.ok(rms > 0.05, `suena (rms ${rms})`);
        // 440 Hz solo cruza ~880 veces por segundo; con el de 660 encima, más.
        assert.ok(cruces / 4 > 1000, `las dos voces mezcladas (${cruces / 4} cruces/s)`);
    });
});
