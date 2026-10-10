// La sala MONTADA en Chromium (el Daily de mentira de `sala-que-graba/`): al
// pulsar «Salir» le dice al servidor que termine la conversación de Tavus
// (`DELETE /api/videollamada/sala`), y no lo hace si queda otra persona dentro
// (el asesor que sale no le corta la llamada al cliente).
// Lo corre `scripts/banco-grabacion-completa.sh`; `MODO=roto` monta la sala de
// `RAIZ_DEL_ANTES` y afirma que al salir no se terminaba nada.
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
const dir = mkdtempSync(join(tmpdir(), "sala-que-termina-"));
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
    await pagina.route("http://sala.test/api/videollamada/grabacion**", (r) =>
        r.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, grabacionId: "g" }) }));
    await pagina.route("http://sala.test/arnes.js", (r) => r.fulfill({ contentType: "text/javascript", body: paquete }));
    await pagina.route(/^http:\/\/sala\.test\/(\?.*)?$/, (r) => r.fulfill({ contentType: "text/html", body: '<div id="raiz"></div><script src="/arnes.js"></script>' }));
    await pagina.goto(`http://sala.test/${consulta}`);
    await pagina.waitForFunction(() => window.listo === true);
    await pagina.waitForTimeout(1_500);
    return pagina;
}
const terminaciones = (pagina) => pagina.evaluate(() => window.__pedidos.filter((p) => p.url.includes("/api/videollamada/sala") && p.metodo === "DELETE").length);

test("al pulsar «Salir»", async (t) => {
    const navegador = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
    t.after(() => navegador.close());

    await t.test(MODO === "roto" ? "ANTES: no se terminaba la conversación (Tavus seguía cobrando su espera)" : "el cliente solo con Verzy: se termina la conversación", async () => {
        const pagina = await abrir(navegador, "");
        await pagina.click('[data-mando="salir"]');
        await pagina.waitForTimeout(500);
        assert.equal(await terminaciones(pagina), MODO === "roto" ? 0 : 1);
    });

    await t.test("un asesor que sale con el cliente dentro NO la termina", { skip: MODO === "roto" }, async () => {
        const pagina = await abrir(navegador, "?asesor=1&conCliente=1");
        await pagina.click('[data-mando="salir"]');
        await pagina.waitForTimeout(500);
        assert.equal(await terminaciones(pagina), 0);
    });
});
