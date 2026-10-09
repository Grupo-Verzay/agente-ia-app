// La grabación de la videollamada cuando el navegador NO deja arrancar el
// audio sin un clic (la regla de Chrome y Safari para un `AudioContext` nacido
// sin gesto). Con el audio parado no se graba NADA, ni el video: la grabación
// empezaba con el primer toque en la página, a veces un minuto tarde.
//
// Chromium de Playwright no aplica esa regla, así que se FINGE: los
// `AudioContext` de la sala nacen suspendidos y `resume()` no hace nada hasta
// que la página recibe un clic o «la cámara se abre» (`window.__permiso`).
// La sala se monta con el Daily de mentira de `sala-que-graba/`.
// Lo corre `scripts/banco-grabacion-sin-clic.sh`.
//
// `MODO=roto` monta la sala de `RAIZ_DEL_ANTES` y afirma el fallo: sin clic,
// ni un byte, aunque el navegador ya dejara arrancar el audio, y sin botón
// que pida el toque.
import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const MODO = process.env.MODO ?? "bueno";
const RAIZ = process.env.RAIZ_DEL_ANTES ?? process.cwd();
const aqui = process.cwd();
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
        pedidos.push({ a, cual: u.searchParams.get("cual"), t: Date.now() - t0, bytes: (r.request().postDataBuffer() ?? Buffer.alloc(0)).length });
        const cuerpo = a === "empezar" ? { ok: true, grabacionId: "g-sin-clic" } : { ok: true };
        await r.fulfill({ contentType: "application/json", body: JSON.stringify(cuerpo) });
    });
    await pagina.route("http://sala.test/arnes.js", (r) => r.fulfill({ contentType: "text/javascript", body: paquete }));
    await pagina.route(/^http:\/\/sala\.test\/(\?.*)?$/, (r) => r.fulfill({ contentType: "text/html", body: '<div id="raiz"></div><script src="/arnes.js"></script>' }));
    await pagina.goto("http://sala.test/");
    await pagina.waitForFunction(() => window.listo === true);
    return { pagina, pedidos, t0 };
}
const conBytes = (pedidos, cual) => pedidos.filter((p) => p.a === "trozo" && p.cual === cual && p.bytes > 1_000);
const lanzar = () => chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });

test("ANTES: sin clic no se grababa nada, aunque el navegador ya dejara, y nada pedía el toque", { skip: MODO !== "roto" }, async (t) => {
    const navegador = await lanzar();
    t.after(() => navegador.close());
    const { pagina, pedidos } = await abrir(navegador);
    await pagina.waitForTimeout(1_500);
    await pagina.evaluate(() => { window.__permiso = true; });
    await pagina.waitForTimeout(12_500);
    assert.equal(conBytes(pedidos, "video").length, 0, "ni un trozo de video con bytes");
    assert.equal(conBytes(pedidos, "audio").length, 0, "ni un trozo de audio con bytes");
    assert.equal(await pagina.locator('[data-zona="activar-sonido"]').count(), 0);
});

test("sin clic", { skip: MODO !== "bueno" }, async (t) => {
    const navegador = await lanzar();
    t.after(() => navegador.close());
    const [deja, noDeja] = await Promise.all([abrir(navegador), abrir(navegador)]);
    // Al primero el navegador le deja arrancar el audio al segundo y medio
    // (así hace Chrome en cuanto la cámara o el micrófono están abiertos).
    await deja.pagina.waitForTimeout(1_500);
    await deja.pagina.evaluate(() => { window.__permiso = true; });

    await t.test("en cuanto el navegador deja, graba SOLA: sin esperar a ningún toque", async () => {
        const { pagina, pedidos } = deja;
        await pagina.waitForTimeout(12_500);
        const video = conBytes(pedidos, "video");
        assert.ok(video.length >= 1, `trozos de video: ${JSON.stringify(pedidos.map((p) => [p.a, p.cual, p.t, p.bytes]))}`);
        assert.ok(video[0].bytes > 20_000, `el primer trozo trae video (${video[0].bytes} bytes)`);
        // Arrancó al ~1,5 s: el primer trozo (10 s) llega antes de los 14 s.
        assert.ok(video[0].t < 14_000, `llegó a los ${video[0].t} ms`);
        assert.ok(conBytes(pedidos, "audio").length >= 1, "y el audio");
        assert.equal(await pagina.getAttribute('[data-zona="sala"]', "data-grabando"), "si");
        assert.equal(await pagina.locator('[data-zona="activar-sonido"]').count(), 0, "no hizo falta pedir el toque");
    });

    await t.test("si el navegador no deja, pide el toque en vez de no grabar callado", async () => {
        const { pagina, pedidos, t0 } = noDeja;
        const boton = pagina.locator('[data-zona="activar-sonido"]');
        await boton.waitFor({ timeout: 5_000 });
        assert.equal(await boton.innerText(), "Toca aquí para activar el audio de la llamada");
        // No dice «Grabando» mientras no graba.
        assert.equal(await pagina.getAttribute('[data-zona="sala"]', "data-grabando"), "no");
        assert.equal(await pagina.locator('[data-zona="aviso-de-grabacion"]').count(), 0);
        assert.equal(conBytes(pedidos, "video").length, 0);

        const alTocar = Date.now() - t0;
        await boton.click();
        // El primer trozo con video llega al cumplirse SU tanda de 10 s, que
        // puede ir un par de segundos detrás del toque.
        await pagina.waitForTimeout(13_500);
        assert.equal(await boton.count(), 0, "el botón se va");
        assert.equal(await pagina.getAttribute('[data-zona="sala"]', "data-grabando"), "si");
        const video = conBytes(pedidos, "video");
        assert.ok(video.length >= 1 && video[0].bytes > 20_000, `tras el toque, graba: ${JSON.stringify(pedidos.map((p) => [p.a, p.cual, p.t, p.bytes]))}`);
        assert.ok(video[0].t - alTocar < 13_500, `llegó a los ${video[0].t - alTocar} ms del toque`);
    });
});
