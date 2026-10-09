// La sala de la videollamada MONTADA en Chromium, con un Daily de mentira que
// trae pistas de verdad (el avatar es un lienzo animado y un tono; el
// micrófono, otro tono): que la sala del cliente grabe SOLA, suba trozos de
// video y de cada VOZ por su lado que se reproducen y suenan, lo diga en pantalla,
// cierre al colgar y al cerrar la pestaña, y que la de un asesor no grabe
// mientras el cliente está dentro.
// Lo corre `scripts/banco-detalle-de-videollamada.sh`.
//
// `MODO=roto` monta la sala de `RAIZ_DEL_ANTES` y afirma el fallo: ni un byte.
import test from "node:test";
import assert from "node:assert/strict";
import { execSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const MODO = process.env.MODO ?? "bueno";
const RAIZ = process.env.RAIZ_DEL_ANTES ?? process.cwd();
const aqui = process.cwd();
const dir = mkdtempSync(join(tmpdir(), "sala-que-graba-"));
execSync(
    `npx esbuild ${aqui}/lib/__tests__/sala-que-graba/arnes.jsx --bundle --format=iife --jsx=automatic ` +
        `--tsconfig=${RAIZ}/tsconfig.json --alias:@=${RAIZ} ` +
        `--alias:@daily-co/daily-js=${aqui}/lib/__tests__/sala-que-graba/daily-con-pistas.js ` +
        `--define:process.env.NODE_ENV='"production"' --outfile=${dir}/arnes.js --log-level=error`,
    { stdio: "inherit", env: { ...process.env, NODE_PATH: `${aqui}/node_modules` } },
);
const paquete = readFileSync(`${dir}/arnes.js`, "utf8");

/** Abre la sala y apunta todo lo que llega a la ruta de la grabación. */
async function abrir(navegador, consulta = "") {
    const pagina = await navegador.newPage();
    const pedidos = [];
    await pagina.route("http://sala.test/api/videollamada/grabacion**", async (r) => {
        const u = new URL(r.request().url());
        const a = u.searchParams.get("a");
        pedidos.push({ a, cual: u.searchParams.get("cual"), pista: u.searchParams.get("pista"), numero: Number(u.searchParams.get("numero")), cuerpo: r.request().postDataBuffer() });
        const cuerpo = a === "empezar" ? { ok: true, grabacionId: "g-1" } : { ok: true };
        await r.fulfill({ contentType: "application/json", body: JSON.stringify(cuerpo) });
    });
    await pagina.route("http://sala.test/arnes.js", (r) => r.fulfill({ contentType: "text/javascript", body: paquete }));
    await pagina.route(/^http:\/\/sala\.test\/(\?.*)?$/, (r) => r.fulfill({ contentType: "text/html", body: '<div id="raiz"></div><script src="/arnes.js"></script>' }));
    await pagina.goto(`http://sala.test/${consulta}`);
    await pagina.waitForFunction(() => window.listo === true);
    return { pagina, pedidos };
}
const trozos = (pedidos, cual, pista) => pedidos.filter((p) => p.a === "trozo" && p.cual === cual && (pista === undefined || p.pista === pista));

const lanzar = () => chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });

test("ANTES: la sala no grababa nada", { skip: MODO !== "roto" }, async (t) => {
    const navegador = await lanzar();
    t.after(() => navegador.close());
    const { pagina, pedidos } = await abrir(navegador);
    await pagina.waitForTimeout(12_500);
    assert.equal(pedidos.length, 0, "ni un pedido de grabación");
    assert.equal(await pagina.locator('[data-zona="aviso-de-grabacion"]').count(), 0);
});

test("la sala del cliente graba sola", { skip: MODO !== "bueno" }, async (t) => {
    const navegador = await lanzar();
    t.after(() => navegador.close());

    // Las tres páginas a la vez: cada una espera trozos de 10 s.
    const [cliente, sePierde, asesor] = await Promise.all([abrir(navegador), abrir(navegador), abrir(navegador, "?asesor=1&conCliente=1")]);
    await Promise.all([cliente, sePierde, asesor].map((x) => x.pagina.waitForTimeout(11_500)));

    await t.test("empieza al entrar, dice «Grabando» y sube un trozo de cada pista a los 10 s", async () => {
        const { pagina, pedidos } = cliente;
        assert.equal(pedidos[0]?.a, "empezar");
        assert.equal(await pagina.locator('[data-zona="aviso-de-grabacion"]').innerText(), "Grabando");
        assert.equal(await pagina.getAttribute('[data-zona="sala"]', "data-grabando"), "si");
        assert.ok(trozos(pedidos, "voz", "1").length >= 1, "trozo de la voz de Verzy");
        assert.ok(trozos(pedidos, "voz", "2").length >= 1, "trozo del micrófono");
        assert.ok(trozos(pedidos, "video").length >= 1, "trozo de video");
        assert.ok(trozos(pedidos, "video")[0].cuerpo.length > 20_000, `video con bytes: ${trozos(pedidos, "video")[0].cuerpo.length}`);
    });

    await t.test("al colgar sube lo que quedaba y DESPUÉS pide cerrar", async () => {
        const { pagina, pedidos } = cliente;
        await pagina.click('[data-mando="salir"]');
        await pagina.waitForTimeout(1_500);
        const ultimo = pedidos.at(-1);
        assert.equal(ultimo.a, "cerrar");
        const audio = trozos(pedidos, "voz", "1");
        assert.ok(audio.length >= 2, "el trozo del final también");
        assert.deepEqual(audio.map((p) => p.numero), audio.map((_, i) => i + 1), "numerados 1, 2…");
        assert.equal(await pagina.locator('[data-zona="aviso-de-grabacion"]').count(), 0, "el aviso se va");
    });

    await t.test("los trozos JUNTOS son un video que se ve (1280×720) y dura lo grabado", async () => {
        const { pagina, pedidos } = cliente;
        const video = Buffer.concat(trozos(pedidos, "video").map((p) => p.cuerpo)).toString("base64");
        const medido = await pagina.evaluate(async (b64) => {
            const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
            const v = document.createElement("video");
            v.muted = true;
            v.src = URL.createObjectURL(new Blob([bytes], { type: "video/webm" }));
            await new Promise((ok, mal) => { v.onloadedmetadata = ok; v.onerror = () => mal(new Error("no carga")); });
            // Un webm de MediaRecorder no trae duración: se busca el final.
            v.currentTime = 1e9;
            await new Promise((ok) => { v.ontimeupdate = ok; setTimeout(ok, 3000); });
            const duracion = v.duration;
            // Un fotograma de en medio: ¿está el avatar dibujado, o es negro?
            v.ontimeupdate = null;
            v.currentTime = 5;
            await new Promise((ok) => { v.onseeked = ok; setTimeout(ok, 3000); });
            const c = document.createElement("canvas");
            c.width = 64;
            c.height = 36;
            const x = c.getContext("2d");
            x.drawImage(v, 0, 0, 64, 36);
            const px = x.getImageData(0, 0, 64, 36).data;
            let brillo = 0;
            for (let i = 0; i < px.length; i += 4) brillo += (px[i] + px[i + 1] + px[i + 2]) / 3;
            return { ancho: v.videoWidth, alto: v.videoHeight, duracion, brillo: brillo / (px.length / 4) };
        }, video);
        assert.equal(medido.ancho, 1280);
        assert.equal(medido.alto, 720);
        // La duración la cuenta ffmpeg fotograma a fotograma: un webm de solo
        // video (sin la voz dentro desde que las voces van sueltas) no trae
        // duración, y el `<video>` la estimaba corta con el banco cargado.
        const crudo = Buffer.concat(trozos(pedidos, "video").map((p) => p.cuerpo));
        const r = spawnSync(`${process.cwd()}/node_modules/@ffmpeg-installer/linux-x64/ffmpeg`, ["-hide_banner", "-i", "-", "-f", "null", "-"], { input: crudo });
        const hora = /time=(\d+):(\d+):([\d.]+)/.exec(String(r.stderr).split("time=").length > 1 ? String(r.stderr).slice(String(r.stderr).lastIndexOf("time=")) : "");
        const segundos = hora ? Number(hora[1]) * 3600 + Number(hora[2]) * 60 + Number(hora[3]) : 0;
        // Se graban ~11 s; con tres salas codificando a la vez en el banco el
        // codificador tarda en arrancar. Que el video y las voces van a la
        // par lo mide `sala-que-graba-sin-clic.test.mjs`, con una sala sola.
        assert.ok(segundos > 8, `dura ${segundos} s (el <video> decía ${medido.duracion})`);
        assert.ok(medido.brillo > 40, `se ve el avatar, no negro (brillo ${medido.brillo})`);
    });

    // Las voces van SUELTAS (la mezcla la hace el servidor: lo mide
    // `sala-que-graba-sin-clic.test.mjs` con el ffmpeg de verdad).
    await t.test("cada voz SUENA por su lado: Verzy (440 Hz) y el micrófono (660 Hz)", async () => {
        const { pagina, pedidos } = cliente;
        for (const [pista, hz] of [["1", 440], ["2", 660]]) {
            const audio = Buffer.concat(trozos(pedidos, "voz", pista).map((p) => p.cuerpo)).toString("base64");
            const medido = await pagina.evaluate(async (b64) => {
                const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
                const ctx = new OfflineAudioContext(1, 48000, 48000);
                const buf = await ctx.decodeAudioData(bytes.buffer);
                const datos = buf.getChannelData(0);
                const desde = Math.floor(datos.length / 2);
                let suma = 0;
                let cruces = 0;
                for (let i = desde + 1; i < desde + 48000 && i < datos.length; i += 1) {
                    suma += datos[i] * datos[i];
                    if ((datos[i - 1] < 0) !== (datos[i] < 0)) cruces += 1;
                }
                return { segundos: buf.duration, rms: Math.sqrt(suma / 48000), cruces };
            }, audio);
            console.info("[banco] voz medida", { pista, ...medido });
            assert.ok(medido.segundos > 10, `la voz ${pista} dura ${medido.segundos} s`);
            assert.ok(medido.rms > 0.05, `la voz ${pista} suena (rms ${medido.rms})`);
            assert.ok(Math.abs(medido.cruces - 2 * hz) < 0.1 * 2 * hz, `la voz ${pista} es la de ${hz} Hz (${medido.cruces} cruces/s)`);
        }
    });

    await t.test("si el cliente CIERRA LA PESTAÑA, el servidor recibe el cierre (sendBeacon)", async () => {
        const { pagina, pedidos } = sePierde;
        assert.ok(trozos(pedidos, "voz").length >= 1, "ya había subido su primer trozo");
        const antes = pedidos.length;
        // El aviso de que la pestaña se va (`pagehide`), sin irse de verdad:
        // con la página ya fuera, Playwright a veces no llega a ver el
        // `sendBeacon` en su ruta y la prueba fallaba a ratos (también en
        // main). Que el navegador mande el beacon al cerrar es cosa suya.
        await pagina.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: false })));
        for (let i = 0; i < 50 && !pedidos.slice(antes).some((p) => p.a === "cerrar"); i += 1) {
            await new Promise((ok) => setTimeout(ok, 100));
        }
        assert.ok(pedidos.slice(antes).some((p) => p.a === "cerrar"), `llegó: ${pedidos.slice(antes).map((p) => p.a)}`);
    });

    // El asesor SOLO con Verzy sí graba: lo prueba `sala-del-asesor-que-graba.test.mjs`.
    await t.test("con el cliente dentro, la sala de un ASESOR no graba (no habría dos ficheros de la misma llamada)", async () => {
        const { pagina, pedidos } = asesor;
        assert.equal(pedidos.length, 0);
        assert.equal(await pagina.locator('[data-zona="aviso-de-grabacion"]').count(), 0);
    });
});
