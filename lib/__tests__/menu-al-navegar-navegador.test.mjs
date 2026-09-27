/**
 * El menú lateral se comprime al entrar a una sección — en Chromium, con el
 * `SidebarProvider` de VERDAD y la pieza de verdad del layout.
 *
 * Lo que la regla pura no puede decir: que la pieza lee el menú del proveedor,
 * lo cierra al cambiar de ruta, NO lo vuelve a cerrar cuando la persona lo abre
 * a mano, y en un teléfono no toca nada. Se lee `data-state` del menú, que es
 * lo que la pantalla pinta (`expanded` / `collapsed`).
 *
 * `MODO=roto` monta el proveedor sin la pieza —como estaba el layout— y AFIRMA
 * el fallo: entrar a Correo deja el menú abierto.
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
try { ({ chromium } = require("playwright")); } catch { /* se dice abajo */ }

const ROTO = process.env.MODO === "roto";
const AQUI = dirname(fileURLToPath(import.meta.url));
const HARNESS = join(AQUI, ".compilado", "harness-menu-al-navegar.js");

const PAGINA = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<script>window.process = { env: {} };</script></head>
<body><div id="pantalla"></div><script type="module" src="/h.js"></script></body></html>`;

let servidor, navegador, base;

test.before(async () => {
  if (!chromium) throw new Error("falta playwright: sin navegador este banco no mide nada");
  servidor = http.createServer((req, res) => {
    if (req.url === "/h.js") { res.setHeader("content-type", "text/javascript"); res.end(fs.readFileSync(HARNESS)); return; }
    res.setHeader("content-type", "text/html"); res.end(PAGINA);
  });
  await new Promise((r) => servidor.listen(0, r));
  base = `http://127.0.0.1:${servidor.address().port}/`;
  navegador = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined });
});
test.after(async () => { await navegador?.close(); servidor?.close(); });

async function abrir(ancho, rutaInicial, abiertoAlEmpezar = true) {
  const pagina = await navegador.newPage({ viewport: { width: ancho, height: 900 } });
  const errores = [];
  pagina.on("pageerror", (e) => errores.push(String(e)));
  await pagina.goto(base);
  await pagina.waitForFunction(() => window.listo === true, null, { timeout: 15000 });
  await pagina.evaluate(([r, a]) => { window.navegar(r); window.pintar(a); }, [rutaInicial, abiertoAlEmpezar]);
  await pagina.waitForSelector("[data-banco-estado]");
  await pagina.waitForTimeout(150);
  assert.deepEqual(errores, [], "la pantalla reventó al pintar");
  return pagina;
}
const estado = (p) => p.getAttribute("[data-banco-estado]", "data-banco-estado");
const navegar = async (p, r) => { await p.evaluate((x) => window.navegar(x), r); await p.waitForTimeout(120); };
const abrirAMano = async (p) => { await p.click("[data-banco-abrir]"); await p.waitForTimeout(120); };

for (const ancho of [1440, 1280, 1024]) {
  test(`${ancho}px: entrar a Correo con el menú abierto lo comprime`, async () => {
    const p = await abrir(ancho, "/correo");
    if (ROTO) assert.equal(await estado(p), "expanded", "el fallo: el menú se quedaba abierto");
    else assert.equal(await estado(p), "collapsed");
    await p.close();
  });
}

if (!ROTO) {
  test("desde la portada, cada sección lo comprime al entrar, y abrirlo a mano lo deja abierto", async () => {
    const p = await abrir(1440, "/");
    assert.equal(await estado(p), "expanded", "la portada no se toca");
    for (const ruta of ["/chats", "/correo", "/panel/clientes", "/sessions", "/herramientas", "/crm/llamadas"]) {
      await abrirAMano(p);
      assert.equal(await estado(p), "expanded", `abrirlo a mano en ${ruta} tiene que funcionar`);
      await navegar(p, ruta);
      assert.equal(await estado(p), "collapsed", `entrar a ${ruta}`);
      await abrirAMano(p);
      await p.waitForTimeout(200);
      assert.equal(await estado(p), "expanded", `abierto a mano en ${ruta} no se vuelve a cerrar solo`);
    }
    await navegar(p, "/");
    assert.equal(await estado(p), "expanded", "volver a la portada no lo cierra");
    await p.close();
  });

  test("comprimirlo escribe la cookie, así que al recargar sigue comprimido", async () => {
    const p = await abrir(1440, "/panel");
    const cookie = await p.evaluate(() => document.cookie);
    assert.match(cookie, /sidebar_state=false/);
    await p.close();
  });

  test("390px (teléfono): no toca el menú de escritorio ni la cookie", async () => {
    const p = await abrir(390, "/correo");
    assert.equal(await estado(p), "expanded");
    assert.doesNotMatch(await p.evaluate(() => document.cookie), /sidebar_state=false/);
    await p.close();
  });
}
