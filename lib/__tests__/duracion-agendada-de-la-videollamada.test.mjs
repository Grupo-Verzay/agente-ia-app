// La videollamada con Verzy dura lo que se AGENDÓ en la cita (20, 30, 45…),
// con los avisos 5 y 1 minuto antes de ESE corte.
//
//   1. Las reglas puras (`losMinutosDeLaVideollamada`, `elCierreDeLaSala`,
//      `losMomentosDelReloj`, `laDuracionEnTavus`, `elBloqueDeAtencion`).
//   2. `abrirLaVideollamada` COMPILADO con dobles de la base y un Tavus de
//      mentira: lo que la sala recibe y lo que se le pide a Tavus.
//   3. La sala MONTADA en Chromium con el reloj falso: 20 y 45 minutos.
//
// `MODO=roto` compila lo mismo de `RAIZ_DE_LA_SALA` (un commit pinchado) y
// AFIRMA el fallo: todo se cortaba a los 30 (aviso a los 25), se agendara lo
// que se agendara. Lo corre `scripts/banco-duracion-agendada-de-la-videollamada.sh`.
import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
let chromium = null;
try { ({ chromium } = require("playwright")); } catch { try { ({ chromium } = require("@playwright/test")); } catch { chromium = null; } }
const MODO = process.env.MODO ?? "bueno";
const ROTO = MODO === "roto";
const aqui = process.cwd();
const RAIZ = resolve(process.env.RAIZ_DE_LA_SALA ?? ".");
const dir = mkdtempSync(join(tmpdir(), "duracion-agendada-"));
const FINGIDOS = `${aqui}/lib/__tests__/duracion-agendada/fingidos.mjs`;
writeFileSync(`${dir}/vacio.mjs`, "");

// Lo que toca la base o la red va a los dobles (el alias más largo gana al
// `@`); el resto, el código de RAIZ.
const DOBLES = [
  "@/lib/db",
  "@/lib/cita-de-la-videollamada.server",
  "@/lib/videollamada-ia-db",
  "@/lib/guion-videollamada-db",
  "@/lib/persona-de-tavus.server",
];
async function compilar(entrada, salida) {
  execSync(
    `npx -y esbuild ${RAIZ}/${entrada} --bundle --format=esm --platform=node --outfile=${dir}/${salida} --log-level=error ` +
      `--external:@prisma/client --alias:@=${RAIZ} --alias:server-only=${dir}/vacio.mjs ` +
      DOBLES.map((d) => `--alias:${d}=${FINGIDOS}`).join(" "),
    { stdio: "inherit" },
  );
  return import(`${dir}/${salida}`);
}

const V = await compilar("lib/videollamada-ia.ts", "via.mjs");
const A = await compilar("lib/atencion-de-la-videollamada.ts", "atencion.mjs");
const S = await compilar("lib/videollamada-ia.server.ts", "servidor.mjs");

/* ── Abrir una cita de N minutos, con Tavus de mentira ─────────────────── */

async function abrirUnaCitaDe(minutos, { limiteDeLaCuenta = 30, fin } = {}) {
  const inicio = new Date("2026-10-10T15:00:00Z");
  globalThis.__banco = {
    limiteDeLaCuenta,
    cita: {
      id: "0b6f1c2e-0000-4000-8000-000000000001", userId: "cuenta-1",
      startTime: inicio, endTime: fin ?? new Date(inicio.getTime() + minutos * 60_000),
      timezone: "America/Bogota", status: "CONFIRMADA", clientName: "Alexis",
      service: { name: "Asesoría" }, session: null,
      user: { company: "Verzay", name: "Carlos", email: "c@x.co", timezone: "America/Bogota" },
    },
  };
  const pedidos = [];
  const fetchReal = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    pedidos.push({ url: String(url), cuerpo: JSON.parse(init?.body ?? "{}") });
    return new Response(JSON.stringify({ conversation_id: "c1", conversation_url: "https://tavus.daily.co/c1" }), { status: 200 });
  };
  try {
    const r = await S.abrirLaVideollamada(globalThis.__banco.cita.id, new Date(inicio.getTime() + 60_000));
    const tavus = pedidos.find((p) => p.url.includes("tavusapi.com/v2/conversations"))?.cuerpo;
    return { r, tavus };
  } finally {
    globalThis.fetch = fetchReal;
  }
}

/* ── 1. Las reglas ─────────────────────────────────────────────────────── */

test("las reglas: el cierre y los avisos salen de la duración agendada", { skip: ROTO }, () => {
  const t0 = new Date("2026-10-10T15:00:00Z");
  const fin = (m) => new Date(t0.getTime() + m * 60_000);
  for (const m of [20, 30, 45, 60, 90]) {
    assert.equal(V.losMinutosDeLaVideollamada(t0, fin(m), 30), m, `una cita de ${m} dura ${m}`);
    const cierre = V.elCierreDeLaSala(t0, t0, m);
    assert.equal(cierre.toISOString(), fin(m).toISOString(), `se cierra a los ${m}`);
    assert.deepEqual(
      A.losMomentosDelReloj(t0, cierre).map((x) => [x.momento, (x.en - t0) / 1000]),
      [["quedan-5", (m - 5) * 60], ["queda-1", (m - 1) * 60], ["despedida", m * 60 - 15]],
      `avisos 5 y 1 minuto antes del ${m}`,
    );
    assert.equal(V.laDuracionEnTavus(m), m * 60 + V.MARGEN_DE_TAVUS_S, "Tavus nunca corta antes que la sala");
  }
  // Sin duración legible: el límite de la cuenta (respaldo, 5–30).
  assert.equal(V.losMinutosDeLaVideollamada(t0, t0, 25), 25);
  assert.equal(V.losMinutosDeLaVideollamada(fin(10), t0, 20), 20, "fin antes del inicio");
  assert.equal(V.losMinutosDeLaVideollamada(null, null, null), 30);
  assert.equal(V.losMinutosDeLaVideollamada("x", "y", 99), 30);
  // Suelo y techo de la reunión.
  assert.equal(V.losMinutosDeLaVideollamada(t0, fin(3), 30), 5);
  assert.equal(V.losMinutosDeLaVideollamada(t0, fin(480), 30), V.TECHO_DE_LA_REUNION_MIN);
  // Verzy sabe el tiempo real desde el principio.
  assert.match(A.elBloqueDeAtencion(45), /como mucho 45 minutos.*en el 40 quedan 5.*en el 44 queda 1/s);
  assert.match(A.elBloqueDeAtencion(20), /como mucho 20 minutos.*en el 15 quedan 5.*en el 19 queda 1/s);
});

/* ── 2. Abrir la sala ──────────────────────────────────────────────────── */

test("abrir una cita: la sala y Tavus reciben lo agendado", { skip: ROTO }, async () => {
  for (const m of [20, 30, 45, 90]) {
    const { r, tavus } = await abrirUnaCitaDe(m);
    assert.equal(r.estado, "ir");
    assert.equal(r.limiteMinutos, m, `la sala recibe ${m}`);
    assert.equal(tavus.properties.max_call_duration, m * 60 + 60, `Tavus no corta antes del ${m}`);
    assert.match(tavus.conversational_context, new RegExp(`como mucho ${m} minutos`));
  }
  // Una cita de 45 en una cuenta con límite 20: manda la cita.
  assert.equal((await abrirUnaCitaDe(45, { limiteDeLaCuenta: 20 })).r.limiteMinutos, 45);
  // Una cita sin duración legible: el límite de la cuenta.
  assert.equal((await abrirUnaCitaDe(0, { limiteDeLaCuenta: 20, fin: new Date("2026-10-10T16:00:00Z") })).r.limiteMinutos, 60);
});

test("ANTES: abrir una cita de 45 o de 20 daba 30 a la sala y a Tavus", { skip: !ROTO }, async () => {
  const cuarenta = await abrirUnaCitaDe(45);
  assert.equal(cuarenta.r.limiteMinutos, 30, "la sala no sabía de la cita");
  assert.ok(cuarenta.tavus.properties.max_call_duration <= 30 * 60, "Tavus cortaba a los 30");
  assert.equal((await abrirUnaCitaDe(20)).r.limiteMinutos, 30, "una de 20 iba a 30");
  assert.equal(V.elCierreDeLaSala(new Date(0), new Date(0), 45).getTime(), 30 * 60_000, "y un 45 se leía como 30");
});

/* ── 3. La sala montada ────────────────────────────────────────────────── */

let paquete = "";
if (chromium) {
  execSync(
    `npx esbuild ${aqui}/lib/__tests__/sala-de-videollamada/arnes.jsx --bundle --format=iife --jsx=automatic ` +
      `--tsconfig=${RAIZ}/tsconfig.json --alias:@=${RAIZ} ` +
      `--alias:@daily-co/daily-js=${aqui}/lib/__tests__/sala-de-videollamada/daily-de-mentira.js ` +
      `--define:process.env.NODE_ENV='"production"' --outfile=${dir}/arnes.js --log-level=error`,
    { stdio: "inherit", env: { ...process.env, NODE_PATH: `${aqui}/node_modules` } },
  );
  paquete = readFileSync(`${dir}/arnes.js`, "utf8");
}

async function abrirLaSala(navegador, minutos) {
  const p = await navegador.newPage();
  await p.clock.install();
  await p.route("http://sala.test/**", (r) => r.fulfill({ contentType: "text/html", body: `<!doctype html><html><body><div id="raiz"></div><script src="/arnes.js"></script></body></html>` }));
  await p.route("http://sala.test/arnes.js", (r) => r.fulfill({ contentType: "text/javascript", body: paquete }));
  const empezo = new Date().toISOString(); // el reloj falso arranca en el real
  await p.goto(`http://sala.test/?reentrada=1&limite=${minutos}&empezo=${encodeURIComponent(empezo)}`);
  await p.waitForFunction(() => window.listo === true);
  await p.evaluate(() => {
    const av = { session_id: "av", user_name: "tavus-replica", tracks: {} };
    window.__daily.remotos.av = av;
    window.__daily.disparar("participant-joined", { participant: av });
  });
  await p.clock.runFor(100);
  return p;
}
const avisos = (p) => p.evaluate(() => window.__daily.enviados.filter((m) => m.event_type === "conversation.respond").map((m) => m.properties?.text ?? ""));
const salidas = (p) => p.evaluate(() => window.__daily.salidas);
const minutoA = async (p, desdeMs, hastaMin) => { await p.clock.runFor(hastaMin * 60_000 - desdeMs); return hastaMin * 60_000; };

for (const m of [20, 45]) {
  test(`la sala de ${m} minutos: avisa en el ${m - 5} y el ${m - 1}, y corta en el ${m}`, { skip: ROTO || !chromium }, async (t) => {
    const navegador = await chromium.launch(); t.after(() => navegador.close());
    const p = await abrirLaSala(navegador, m);
    let ya = 100;
    ya = await minutoA(p, ya, m - 5 - 0.1);
    assert.equal((await avisos(p)).length, 0, `nada antes del ${m - 5}`);
    ya = await minutoA(p, ya, m - 5 + 0.1);
    assert.match((await avisos(p))[0] ?? "", /Quedan 5 minutos/, `«quedan 5» en el ${m - 5}`);
    ya = await minutoA(p, ya, m - 1 + 0.1);
    assert.match((await avisos(p))[1] ?? "", /Queda 1 minuto/, `«queda 1» en el ${m - 1}`);
    assert.equal(await salidas(p), 0, "no corta antes");
    ya = await minutoA(p, ya, m + 0.1);
    assert.equal(await salidas(p), 1, `corta en el ${m}`);
  });
}

test("ANTES: la sala de 45 minutos avisaba en el 25 y cortaba en el 30", { skip: !ROTO || !chromium }, async (t) => {
  const navegador = await chromium.launch(); t.after(() => navegador.close());
  const p = await abrirLaSala(navegador, 45);
  let ya = 100;
  ya = await minutoA(p, ya, 25.1);
  assert.match((await avisos(p))[0] ?? "", /Quedan 5 minutos/, "«quedan 5» a los 25 de una reunión de 45");
  ya = await minutoA(p, ya, 30.1);
  assert.equal(await salidas(p), 1, "cortada a los 30");
});
