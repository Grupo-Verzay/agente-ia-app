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
const ESPERA = Number(process.env.ESPERA_DEL_SALUDO ?? 2_500); // ESPERA_DEL_SALUDO_MS de la sala

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

  await t.test("si calla, la sala dice el saludo tras el margen de arranque, una vez, y le cuenta que ya saludó", async () => {
    const p = await abrir(navegador);
    await p.waitForTimeout(ESPERA - 1_000);
    assert.equal((await echos(p)).length, 0, "no antes de tiempo");
    await p.waitForTimeout(2_000);
    const e = await echos(p);
    assert.equal(e.length, 1);
    assert.equal(e[0].properties.text, "Hola, muy buenas, ¿me escuchas?");
    assert.equal(e[0].conversation_id, "c123conv");
    const contextos = await p.evaluate(() => window.__daily.enviados.filter((m) => m.event_type === "conversation.append_llm_context").map((m) => m.properties?.context ?? ""));
    assert.ok(contextos.some((c) => /saludo ya se dijo|ya saludaste|NO vuelvas a saludar/i.test(c)), `le cuenta que ya saludó: ${JSON.stringify(contextos)}`);
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
      d.disparar("app-message", { data: { message_type: "conversation", event_type: "conversation.tool_call", properties: { name: "mostrar_pantalla", arguments: JSON.stringify({ ruta: "/chats" }) } } });
    });
    await p.waitForTimeout(500);
    const posts = (await p.evaluate(() => window.__pedidos))
      .filter((x) => x.metodo === "POST" && x.url.includes("/api/videollamada/pantalla"))
      .map((x) => JSON.parse(x.cuerpo));
    assert.deepEqual(posts, [{ tipo: "nota", texto: "Le interesa el plan Business" }, { tipo: "ir", lugar: "/chats" }]);
  });
  const herramienta = (p, name, args) => p.evaluate(([n, a]) => window.__daily.disparar("app-message", { data: { message_type: "conversation", event_type: "conversation.tool_call", properties: { name: n, arguments: JSON.stringify(a) } } }), [name, args]);
  const postsDePantalla = async (p) => (await p.evaluate(() => window.__pedidos))
    .filter((x) => x.metodo === "POST" && x.url.includes("/api/videollamada/pantalla")).map((x) => JSON.parse(x.cuerpo));

  await t.test("mostrar_pantalla: la URL del modelo se pide TAL CUAL; una palabra suelta no se traduce a nada", async () => {
    const p = await abrir(navegador);
    await herramienta(p, "mostrar_pantalla", { ruta: "/planes/nivel-3" });
    await herramienta(p, "mostrar_pantalla", { ruta: "/inicio#features" });
    await herramienta(p, "mostrar_pantalla", { pagina: "crm_embudo" });
    await herramienta(p, "mostrar_pantalla", { destino: "ficha" });
    await herramienta(p, "mostrar_pantalla", { pagina: "inventada" });
    await herramienta(p, "mostrar_pantalla", { ruta: "javascript:alert(1)" });
    await p.waitForTimeout(500);
    assert.deepEqual(await postsDePantalla(p), [
      { tipo: "ir", lugar: "/planes/nivel-3" }, { tipo: "ir", lugar: "/inicio#features" },
    ], "solo lo que es una URL se pide, y tal cual; ningún atajo ni clave vieja se traduce");
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

  const voz = (p, ev, speech) => p.evaluate(([e, sp]) => window.__daily.disparar("app-message", { data: sp === undefined ? { event_type: e } : { event_type: e, properties: { role: "replica", speech: sp } } }), [ev, speech]);
  const ordenes = async (p) => (await postsDePantalla(p)).filter((o) => o.tipo !== "nota");

  await t.test("el margen de arranque es de 2 a 3 segundos", async () => {
    assert.ok(ESPERA >= 2_000 && ESPERA <= 3_000);
    const sala = readFileSync(`${RAIZ}/components/videollamada/SalaDeLaVideollamada.tsx`, "utf8");
    assert.match(sala, new RegExp(`ESPERA_DEL_SALUDO_MS = ${ESPERA.toLocaleString("en").replace(",", "_")}\\b`));
  });

  await t.test("mientras Verzy habla, la voz NUNCA cambia de pantalla: solo la recorre", async () => {
    const p = await abrir(navegador);
    await dentro(p);
    await herramienta(p, "mostrar_pantalla", { ruta: "/chats" });
    await voz(p, "conversation.replica.started_speaking");
    await voz(p, "conversation.utterance", "Aquí ves tus chats, y desde la agenda de citas, el embudo y los precios confirmas cada reunión.");
    await p.waitForTimeout(300);
    assert.deepEqual((await ordenes(p)).map((o) => o.lugar ?? o.tipo), ["/chats"], "nombrar una sección no la abre: solo la herramienta");
    // Habla cuatro segundos más sin nombrar nada nuevo: la pantalla se recorre.
    await p.waitForTimeout(4_000);
    const hablando = (await ordenes(p)).filter((o) => o.tipo === "recorrer").length;
    assert.ok(hablando >= 1, `se recorre mientras habla (${hablando})`);
    assert.equal((await ordenes(p)).filter((o) => o.tipo === "ir").length, 1, "hablar no añade ningún cambio de pantalla");
    await voz(p, "conversation.replica.stopped_speaking");
    const alCallar = (await ordenes(p)).length;
    await p.waitForTimeout(5_000);
    assert.equal((await ordenes(p)).length, alCallar, "callada, la pantalla no se mueve sola");
  });

  await t.test("sin pantalla compartida, hablar no la abre", async () => {
    const p = await abrir(navegador);
    await dentro(p);
    await voz(p, "conversation.replica.started_speaking");
    await voz(p, "conversation.utterance", "Te cuento cómo funciona la agenda.");
    await p.waitForTimeout(3_000);
    assert.equal((await ordenes(p)).length, 0);
  });
});
