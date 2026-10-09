// Quien abre el enlace de la videollamada con la sesión iniciada entra como
// ASESOR, y así es como se prueba la llamada: el dueño de la cuenta la abre en
// su navegador y habla con Verzy. La sala del asesor no grababa NUNCA, así que
// esa llamada no dejaba ni audio ni video (`laSalaGraba`).
//
// La sala MONTADA en Chromium con el Daily de mentira de `sala-que-graba/`:
//   - el asesor SOLO con Verzy graba, sube trozos y cierra al colgar;
//   - con el cliente dentro no graba (graba el cliente);
//   - si el cliente se va, el asesor empieza a grabar.
// Lo corre `scripts/banco-videollamada-graba-el-asesor.sh`.
//
// `MODO=roto` monta la sala de `RAIZ_DEL_ANTES` y afirma el fallo: el asesor
// solo con Verzy no subía ni un byte.
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
const dir = mkdtempSync(join(tmpdir(), "sala-del-asesor-"));
execSync(
    `npx esbuild ${aqui}/lib/__tests__/sala-que-graba/arnes.jsx --bundle --format=iife --jsx=automatic ` +
        `--tsconfig=${RAIZ}/tsconfig.json --alias:@=${RAIZ} ` +
        `--alias:@daily-co/daily-js=${aqui}/lib/__tests__/sala-que-graba/daily-con-pistas.js ` +
        `--define:process.env.NODE_ENV='"production"' --outfile=${dir}/arnes.js --log-level=error`,
    { stdio: "inherit", env: { ...process.env, NODE_PATH: `${aqui}/node_modules` } },
);
const paquete = readFileSync(`${dir}/arnes.js`, "utf8");

async function abrir(navegador, consulta) {
    const pagina = await navegador.newPage();
    const pedidos = [];
    await pagina.route("http://sala.test/api/videollamada/grabacion**", async (r) => {
        const u = new URL(r.request().url());
        const a = u.searchParams.get("a");
        pedidos.push({ a, cual: u.searchParams.get("cual"), cuerpo: r.request().postDataBuffer() });
        const cuerpo = a === "empezar" ? { ok: true, grabacionId: "g-asesor" } : { ok: true };
        await r.fulfill({ contentType: "application/json", body: JSON.stringify(cuerpo) });
    });
    await pagina.route("http://sala.test/arnes.js", (r) => r.fulfill({ contentType: "text/javascript", body: paquete }));
    await pagina.route(/^http:\/\/sala\.test\/(\?.*)?$/, (r) => r.fulfill({ contentType: "text/html", body: '<div id="raiz"></div><script src="/arnes.js"></script>' }));
    await pagina.goto(`http://sala.test/${consulta}`);
    await pagina.waitForFunction(() => window.listo === true);
    return { pagina, pedidos };
}
const trozos = (pedidos, cual) => pedidos.filter((p) => p.a === "trozo" && p.cual === cual);
const lanzar = () => chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });

test("ANTES: el asesor solo con Verzy no grababa nada", { skip: MODO !== "roto" }, async (t) => {
    const navegador = await lanzar();
    t.after(() => navegador.close());
    const { pagina, pedidos } = await abrir(navegador, "?asesor=1");
    await pagina.waitForTimeout(11_500);
    assert.equal(pedidos.length, 0, "ni un pedido de grabación");
    assert.equal(await pagina.getAttribute('[data-zona="sala"]', "data-grabando"), "no");
});

test("el asesor graba cuando no hay cliente en la sala", { skip: MODO !== "bueno" }, async (t) => {
    const navegador = await lanzar();
    t.after(() => navegador.close());

    const [solo, conCliente, seVa] = await Promise.all([
        abrir(navegador, "?asesor=1"),
        abrir(navegador, "?asesor=1&conCliente=1"),
        abrir(navegador, "?asesor=1&conCliente=1"),
    ]);
    // Al de «seVa» se le va el cliente a los 2 s.
    await seVa.pagina.waitForTimeout(2_000);
    await seVa.pagina.evaluate(() => window.__daily.saleElCliente());
    await Promise.all([solo, conCliente, seVa].map((x) => x.pagina.waitForTimeout(11_500)));

    await t.test("solo con Verzy: empieza, dice «Grabando» y sube audio y video", async () => {
        const { pagina, pedidos } = solo;
        assert.equal(pedidos[0]?.a, "empezar");
        assert.equal(await pagina.getAttribute('[data-zona="sala"]', "data-grabando"), "si");
        assert.equal(await pagina.locator('[data-zona="aviso-de-grabacion"]').innerText(), "Grabando");
        assert.ok(trozos(pedidos, "audio").length >= 1, "trozo de audio");
        assert.ok(trozos(pedidos, "video").length >= 1, "trozo de video");
        assert.ok(trozos(pedidos, "video")[0].cuerpo.length > 20_000, "el video lleva bytes");
    });

    await t.test("al colgar, cierra la grabación (el servidor la junta y la lleva al CRM)", async () => {
        const { pagina, pedidos } = solo;
        await pagina.click('[data-mando="salir"]');
        await pagina.waitForTimeout(1_500);
        assert.equal(pedidos.at(-1)?.a, "cerrar");
    });

    await t.test("con el cliente dentro, el asesor NO graba (graba el cliente)", async () => {
        const { pagina, pedidos } = conCliente;
        assert.equal(pedidos.length, 0);
        assert.equal(await pagina.getAttribute('[data-zona="sala"]', "data-grabando"), "no");
    });

    await t.test("si el cliente se va, el asesor empieza a grabar", async () => {
        const { pagina, pedidos } = seVa;
        assert.equal(pedidos[0]?.a, "empezar");
        assert.equal(await pagina.getAttribute('[data-zona="sala"]', "data-grabando"), "si");
        assert.ok(trozos(pedidos, "audio").length >= 1, "trozo de audio");
    });
});
