// La sala de la videollamada, MONTADA de verdad en Chromium con un Daily de
// mentira: que Verzy no se quede mudo al entrar (saludo de respaldo), que no
// se le pise si ya habló ni al volver, y que sus herramientas lleguen al
// servidor con la forma que la ruta entiende.
// Lo corre `scripts/banco-videollamada-ia.sh` (solo en modo bueno: en el
// «antes» la sala ni tenía saludo de respaldo, y eso lo afirma el otro banco).
import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
let chromium = null;
try { ({ chromium } = require("playwright")); } catch { try { ({ chromium } = require("@playwright/test")); } catch { chromium = null; } }

const MODO = process.env.MODO ?? "bueno";
const ESPERA = 4_000; // ESPERA_DEL_SALUDO_MS de la sala

// En modo roto la sala sale de un árbol de git del commit de antes (RAIZ_DE_LA_SALA).
const RAIZ = process.env.RAIZ_DE_LA_SALA ?? ".";
let paquete = "";
if (chromium) {
  const dir = mkdtempSync(join(tmpdir(), "sala-"));
  const aqui = process.cwd();
  execSync(
    `npx esbuild ${aqui}/lib/__tests__/sala-de-videollamada/arnes.jsx --bundle --format=iife --jsx=automatic ` +
      `--tsconfig=${RAIZ}/tsconfig.json --alias:@=${RAIZ} ` +
      `--alias:@daily-co/daily-js=${aqui}/lib/__tests__/sala-de-videollamada/daily-de-mentira.js ` +
      `--define:process.env.NODE_ENV='"production"' --outfile=${dir}/arnes.js --log-level=error`,
    { stdio: "inherit", env: { ...process.env, NODE_PATH: `${aqui}/node_modules` } },
  );
  paquete = readFileSync(`${dir}/arnes.js`, "utf8");
}

async function abrir(navegador, consulta = "") {
  const pagina = await navegador.newPage();
  await pagina.route("http://sala.test/**", (r) => r.fulfill({ contentType: "text/html", body: '<div id="raiz"></div><script src="/arnes.js"></script>' }));
  await pagina.route("http://sala.test/arnes.js", (r) => r.fulfill({ contentType: "text/javascript", body: paquete }));
  await pagina.goto(`http://sala.test/${consulta}`);
  await pagina.waitForFunction(() => window.listo === true);
  return pagina;
}
const echos = (p) => p.evaluate(() => window.__daily.enviados.filter((m) => m.event_type === "conversation.echo"));

test("ANTES: la sala se quedaba muda si Verzy no hablaba", { skip: MODO !== "roto" || !chromium }, async (t) => {
  const navegador = await chromium.launch();
  t.after(() => navegador.close());
  const p = await abrir(navegador);
  await p.waitForTimeout(ESPERA + 1_500);
  assert.equal((await echos(p)).length, 0, "en el antes no había saludo de respaldo");
});

test("sala montada: Verzy no se queda mudo", { skip: MODO !== "bueno" || !chromium }, async (t) => {
  const navegador = await chromium.launch();
  t.after(() => navegador.close());

  await t.test("si calla, la sala dice el saludo pasados ~4 s, una vez", async () => {
    const p = await abrir(navegador);
    await p.waitForTimeout(ESPERA - 1_000);
    assert.equal((await echos(p)).length, 0, "no antes de tiempo");
    await p.waitForTimeout(2_000);
    const e = await echos(p);
    assert.equal(e.length, 1);
    assert.equal(e[0].properties.text, "Hola, muy buenas, ¿me escuchas?");
    assert.equal(e[0].conversation_id, "c123conv");
    await p.waitForTimeout(ESPERA);
    assert.equal((await echos(p)).length, 1, "no se repite");
  });

  await t.test("si Verzy ya habló, la sala no lo pisa", async () => {
    const p = await abrir(navegador);
    await p.waitForTimeout(300);
    await p.evaluate(() => window.__daily.disparar("app-message", { data: { event_type: "conversation.replica.started_speaking" } }));
    await p.waitForTimeout(ESPERA + 1_000);
    assert.equal((await echos(p)).length, 0);
  });

  await t.test("al volver a entrar no se saluda otra vez", async () => {
    const p = await abrir(navegador, "?reentrada=1");
    await p.waitForTimeout(ESPERA + 1_000);
    assert.equal((await echos(p)).length, 0);
  });

  await t.test("tomar_nota y mostrar_pantalla llegan a la ruta con la forma plana", async () => {
    const p = await abrir(navegador);
    await p.evaluate(() => {
      const d = window.__daily;
      d.disparar("app-message", { data: { message_type: "conversation", event_type: "conversation.tool_call", properties: { name: "tomar_nota", arguments: JSON.stringify({ texto: "Le interesa el plan Business" }) } } });
      d.disparar("app-message", { data: { message_type: "conversation", event_type: "conversation.tool_call", properties: { name: "mostrar_pantalla", arguments: JSON.stringify({ destino: "ficha" }) } } });
    });
    await p.waitForTimeout(500);
    const posts = (await p.evaluate(() => window.__pedidos))
      .filter((x) => x.metodo === "POST" && x.url.includes("/api/videollamada/pantalla"))
      .map((x) => JSON.parse(x.cuerpo));
    assert.deepEqual(posts, [{ tipo: "nota", texto: "Le interesa el plan Business" }, { tipo: "ir", destino: "ficha" }]);
  });
  const herramienta = (p, name, args) => p.evaluate(([n, a]) => window.__daily.disparar("app-message", { data: { message_type: "conversation", event_type: "conversation.tool_call", properties: { name: n, arguments: JSON.stringify(a) } } }), [name, args]);
  const postsDePantalla = async (p) => (await p.evaluate(() => window.__pedidos))
    .filter((x) => x.metodo === "POST" && x.url.includes("/api/videollamada/pantalla")).map((x) => JSON.parse(x.cuerpo));

  await t.test("mostrar_pantalla en el formato VIEJO (pagina) también enseña la plataforma", async () => {
    const p = await abrir(navegador);
    await herramienta(p, "mostrar_pantalla", { pagina: "crm_embudo" });
    await herramienta(p, "mostrar_pantalla", { pagina: "ficha" });
    await herramienta(p, "mostrar_pantalla", { pagina: "inventada" });
    await p.waitForTimeout(500);
    assert.deepEqual(await postsDePantalla(p), [
      { tipo: "ir", destino: "embudo" }, { tipo: "ir", destino: "ficha" }, { tipo: "ir", destino: "dashboard" },
    ]);
    assert.ok(await p.locator('img[src*="/api/videollamada/pantalla"]').count() >= 1, "la pantalla se ve");
  });

  const dentro = async (p) => { await p.waitForFunction(() => document.querySelector('[data-mando="salir"]')); };
  const terminada = (p) => p.waitForFunction(() => document.body.innerText.includes("La videollamada terminó."), null, { timeout: 15_000 });

  await t.test("Salir cuelga y no se reconecta", async () => {
    const p = await abrir(navegador);
    await dentro(p);
    await p.click('[data-mando="salir"]');
    await terminada(p);
    await p.waitForTimeout(1_000);
    assert.equal(await p.evaluate(() => window.__daily.salidas), 1);
    assert.ok(await p.evaluate(() => document.body.innerText.includes("La videollamada terminó.")), "no vuelve a entrar");
  });

  await t.test("si Verzy se despide, se cuelga al terminar de hablar", async () => {
    const p = await abrir(navegador);
    await dentro(p);
    await p.evaluate(() => {
      const d = window.__daily;
      d.disparar("app-message", { data: { event_type: "conversation.utterance", properties: { role: "replica", speech: "Gracias por tu tiempo, hasta luego." } } });
      d.disparar("app-message", { data: { event_type: "conversation.replica.stopped_speaking" } });
    });
    await terminada(p);
  });

  await t.test("si el cliente se despide, se cuelga (como mucho al tope)", async () => {
    const p = await abrir(navegador);
    await dentro(p);
    await p.evaluate(() => window.__daily.disparar("app-message", { data: { event_type: "conversation.utterance", properties: { role: "user", speech: "Listo, chao" } } }));
    await terminada(p);
  });

  await t.test("un saludo NO cuelga", async () => {
    const p = await abrir(navegador);
    await dentro(p);
    await p.evaluate(() => {
      const d = window.__daily;
      d.disparar("app-message", { data: { event_type: "conversation.utterance", properties: { role: "replica", speech: "Hola, buen día, ¿cómo estás?" } } });
      d.disparar("app-message", { data: { event_type: "conversation.replica.stopped_speaking" } });
    });
    await p.waitForTimeout(3_000);
    assert.equal(await p.evaluate(() => window.__daily.salidas), 0);
  });

  await t.test("si Tavus cierra la conversación, se cuelga", async () => {
    const p = await abrir(navegador);
    await dentro(p);
    await p.evaluate(() => window.__daily.disparar("app-message", { data: { event_type: "system.shutdown" } }));
    await terminada(p);
  });
});

