// El humano, el cierre de venta y el reloj de la videollamada con Verzy.
// Las reglas puras, y la sala MONTADA en Chromium con un Daily de mentira y el
// reloj del navegador falso (`page.clock`): los 3 minutos de espera y los 30
// de la reunión pasan en milisegundos. `MODO=roto` monta la sala de un commit
// pinchado (RAIZ_DE_LA_SALA) y afirma que no existía nada de esto.
// Lo corre `scripts/banco-atencion-de-la-videollamada.sh`.
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
const RAIZ = process.env.RAIZ_DE_LA_SALA ?? ".";
const aqui = process.cwd();
const dir = mkdtempSync(join(tmpdir(), "atencion-"));

let R = null;
if (MODO === "bueno") {
  execSync(`npx esbuild lib/atencion-de-la-videollamada.ts --bundle --format=esm --platform=node --outfile=${dir}/atencion.mjs --log-level=error`);
  execSync(`npx esbuild lib/videollamada-ia.ts --bundle --format=esm --platform=node --outfile=${dir}/via.mjs --log-level=error`);
  R = { ...(await import(`${dir}/atencion.mjs`)), ...(await import(`${dir}/via.mjs`)) };
}

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

/* ── Las reglas ─────────────────────────────────────────────────────────── */

test("pedir un humano: lo explícito sí, lo que no lo es no", { skip: MODO !== "bueno" }, () => {
  for (const f of [
    "Quiero hablar con una persona",
    "¿Me puedes pasar con un asesor?",
    "¿me pasas con alguien de verdad?",
    "prefiero un humano, la verdad",
    "No, quiero hablar con alguien real",
    "comunícame con el encargado por favor",
    "necesito hablar con una persona de verdad",
  ]) assert.equal(R.pideUnHumano(f), true, f);
  for (const f of [
    "Hola, ¿me escuchas?",
    "mi asesor contable lo revisa",
    "no hace falta hablar con un asesor, sigue tú",
    "las personas que me escriben por WhatsApp",
    "",
  ]) assert.equal(R.pideUnHumano(f), false, f);
});

test("el NO explícito cierra; lo que se le parece no", { skip: MODO !== "bueno" }, () => {
  for (const f of ["No me interesa, gracias", "Está muy caro para mí", "esto no es lo que busco", "no estoy interesada", "me parece demasiado caro", "carísimo"]) {
    assert.equal(R.esUnCierreNegativo(f), true, f);
  }
  for (const f of ["no es caro", "no está muy caro", "no sé si me interesa", "me interesa mucho", "¿qué tan caro es?", "y si no me interesa el plan grande?"]) {
    assert.equal(R.esUnCierreNegativo(f), false, f);
  }
});

test("la intención de comprar", { skip: MODO !== "bueno" }, () => {
  for (const f of ["Quiero comprar el plan básico", "¿Cómo pago?", "mándame el link de pago", "vamos con ese plan", "ya estoy convencido", "quiero contratar"]) {
    assert.equal(R.quiereComprar(f), true, f);
  }
  for (const f of ["no quiero comprar nada todavía", "¿qué incluye el plan?", "lo voy a pensar"]) assert.equal(R.quiereComprar(f), false, f);
});

test("la incomodidad: una fuerte basta, las leves se juntan", { skip: MODO !== "bueno" }, () => {
  assert.equal(R.laIncomodidad(["no me estás entendiendo"]).alerta, true);
  assert.equal(R.laIncomodidad(["ya te dije que no tengo tienda"]).alerta, true);
  assert.equal(R.laIncomodidad(["no entiendo"]).alerta, false, "una leve sola no alerta");
  assert.equal(R.laIncomodidad(["no entiendo", "vale", "esto es muy confuso"]).alerta, true);
  assert.equal(R.laIncomodidad(["esto es muy confuso", "vale, perfecto"]).alerta, false, "la alerta es por lo ÚLTIMO que dijo");
  assert.equal(R.laIncomodidad(["perfecto, me encanta"]).alerta, false);
});

test("la prioridad: un no gana; pedir humano gana a la incomodidad", { skip: MODO !== "bueno" }, () => {
  assert.equal(R.loQueDijoElCliente("no me interesa, quiero hablar con una persona"), "cierre-negativo");
  assert.equal(R.loQueDijoElCliente("no me estás entendiendo, quiero hablar con una persona"), "pide-humano");
  assert.equal(R.loQueDijoElCliente("perfecto, ¿cómo pago?"), "quiere-comprar");
  assert.equal(R.loQueDijoElCliente("me tienes perdiendo el tiempo"), "incomodidad");
  assert.equal(R.loQueDijoElCliente("tengo una ferretería"), null);
});

test("lo que la sala le pide a Verzy no es frase del cliente, ni va a la transcripción", { skip: MODO !== "bueno" }, () => {
  const aviso = R.comoAvisoInterno("Quedan 5 minutos");
  assert.equal(R.laFraseDelCliente({ event_type: "conversation.utterance", properties: { role: "user", speech: aviso } }), null);
  assert.equal(R.laFraseDelCliente({ event_type: "conversation.utterance", properties: { role: "user", speech: "hola" } }), "hola");
  assert.equal(R.laFraseDelCliente({ event_type: "conversation.utterance", properties: { role: "replica", speech: "hola" } }), null);
  assert.equal(R.laTranscripcionDeTavus([{ role: "user", content: aviso }, { role: "user", content: "hola" }]), "Cliente: hola");
});

test("el reloj: 25, 29 y la despedida antes del 30; nada que no quepa", { skip: MODO !== "bueno" }, () => {
  const t0 = new Date("2026-10-10T15:00:00Z");
  const cierre = R.elCierreDeLaSala(t0, t0, 30);
  const m = R.losMomentosDelReloj(t0, cierre).map((x) => [x.momento, x.en.toISOString()]);
  assert.deepEqual(m, [
    ["quedan-5", "2026-10-10T15:25:00.000Z"],
    ["queda-1", "2026-10-10T15:29:00.000Z"],
    ["despedida", "2026-10-10T15:29:45.000Z"],
  ]);
  // Una reunión de 5 minutos no empieza diciendo «quedan 5».
  assert.deepEqual(R.losMomentosDelReloj(t0, R.elCierreDeLaSala(t0, t0, 5)).map((x) => x.momento), ["queda-1", "despedida"]);
  // Un aviso que ya pasó hace rato no se da tarde; uno dado no se repite.
  const cinco = { momento: "quedan-5", en: new Date("2026-10-10T15:25:00Z") };
  assert.equal(R.tocaElAviso(cinco, new Date("2026-10-10T15:25:10Z"), new Set()), true);
  assert.equal(R.tocaElAviso(cinco, new Date("2026-10-10T15:27:00Z"), new Set()), false);
  assert.equal(R.tocaElAviso(cinco, new Date("2026-10-10T15:25:10Z"), new Set(["quedan-5"])), false);
});

test("el límite de la CUENTA (respaldo) no pasa de 30; la reunión dura lo agendado", { skip: MODO !== "bueno" }, () => {
  assert.equal(R.LIMITE_MAXIMO_MIN, 30);
  assert.equal(R.comoLimiteDeMinutos(60), 30);
  assert.equal(R.comoLimiteDeMinutos(240), 30);
  assert.equal(R.comoLimiteDeMinutos(20), 20, "acortarla sí se puede");
  // La reunión: lo agendado, no el techo de la cuenta (banco-duracion-agendada-de-la-videollamada.sh).
  assert.equal(R.laDuracionEnTavus(45), 45 * 60 + R.MARGEN_DE_TAVUS_S);
});

test("lo que dice Verzy: nunca que ya hay un humano, ni detalles internos", { skip: MODO !== "bueno" }, () => {
  assert.match(R.alPedirUnHumano("Alexis Rosas"), /^Claro, Alexis\. Dame un momento, he notificado a un humano para que ingrese a la reunión\.$/);
  for (const t of [R.alPedirUnHumano(null), R.laDespedidaDelNo("Ana"), R.laDespedidaDelCierre("Ana")]) {
    assert.doesNotMatch(t, /ya (hay|está) (un humano|alguien) conectad/i);
    assert.doesNotMatch(t, /alerta|sistema|aviso interno/i);
  }
  assert.match(R.elAvisoDeLaEspera(1), /ya fue notificado/);
  assert.match(R.elAvisoDeLaEspera(2), /demorando/);
  assert.match(R.elAvisoDeLaEspera(3), /reagendar.*sin avatar/);
  assert.match(R.elAvisoDeCincoMinutos(false), /qué plan quiere.*No le ofrezcas de entrada hablar con un humano.*Solo si duda/s);
  assert.match(R.elAvisoDeCincoMinutos(true), /necesita algo más.*agendar directamente con el equipo de soporte/s);
  assert.match(R.AVISO_DE_UN_MINUTO, /Queda 1 minuto.*recomendación final/s);
  assert.match(R.laDespedidaDelCierre("Ana"), /WhatsApp/);
  // Las despedidas de la sala se reconocen como despedidas: la llamada cuelga al decirlas.
  assert.ok(R.laDespedidaDelNo("Ana").includes("excelente día"));
});

test("el pedido que llega del navegador, saneado", { skip: MODO !== "bueno" }, () => {
  assert.deepEqual(R.comoPedidoDeAtencion({ tipo: "humano", frase: "  quiero   una persona " }), { tipo: "humano", frase: "quiero una persona", cuando: null });
  assert.equal(R.comoPedidoDeAtencion({ tipo: "borrar-todo" }), null);
  assert.equal(R.comoPedidoDeAtencion({ tipo: "reagendada" }), null, "reagendar sin fecha no es un pedido");
  assert.equal(R.comoPedidoDeAtencion({ tipo: "reagendada", cuando: "2026-10-11T10:00" }).cuando, "2026-10-11T10:00");
  const aviso = R.elAvisoAlEquipo({ tipo: "humano", frase: null, cuando: null }, { nombre: "Ana", enlace: "https://x/videollamada/ana" });
  assert.match(aviso.texto, /Ana.*pidió hablar con una persona.*3 minutos.*https:\/\/x\/videollamada\/ana/s);
  assert.equal(R.elAvisoAlEquipo({ tipo: "descartado", frase: null, cuando: null }, { nombre: "Ana", enlace: null }), null, "un NO no se avisa como alerta");
  assert.match(R.elBloqueDeAtencion(30), /minuto 20.*en el 25 quedan 5.*en el 29 queda 1/s);
});

/* ── La sala montada ───────────────────────────────────────────────────── */

async function abrir(navegador, consulta = "", { reloj = true } = {}) {
  const pagina = await navegador.newPage();
  if (reloj) await pagina.clock.install();
  await pagina.route("http://sala.test/**", (r) => r.fulfill({ contentType: "text/html", body: `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="raiz"></div><script src="/arnes.js"></script></body></html>` }));
  await pagina.route("http://sala.test/arnes.js", (r) => r.fulfill({ contentType: "text/javascript", body: paquete }));
  await pagina.goto(`http://sala.test/${consulta}`);
  await pagina.waitForFunction(() => window.listo === true);
  await pagina.evaluate(() => {
    window.__poner = (id, p) => {
      window.__daily.remotos[id] = { session_id: id, ...p };
      window.__daily.disparar("participant-joined", { participant: window.__daily.remotos[id] });
      window.__daily.disparar("participant-updated", { participant: window.__daily.remotos[id] });
    };
    window.__poner("av", { user_name: "tavus-replica", tracks: {} });
  });
  // Entra (joined-meeting llega a los 50 ms del Daily de mentira).
  if (reloj) await pagina.clock.runFor(100);
  await pagina.waitForFunction(() => document.querySelector("[data-mando]"));
  return pagina;
}
const dice = (p, speech) => p.evaluate((s) => window.__daily.disparar("app-message", { data: { event_type: "conversation.utterance", properties: { role: "user", speech: s } } }), speech);
const verzyCalla = (p) => p.evaluate(() => window.__daily.disparar("app-message", { data: { event_type: "conversation.replica.stopped_speaking" } }));
const enviados = (p) => p.evaluate(() => window.__daily.enviados.map((m) => ({ tipo: m.event_type, texto: m.properties?.text ?? m.properties?.context ?? "" })));
const pedidos = (p) => p.evaluate(() => window.__pedidos.filter((x) => x.url.includes("/api/videollamada/atencion")).map((x) => JSON.parse(x.cuerpo)));
const pasan = (p, ms) => p.clock.runFor(ms);
const decir = (lista) => lista.filter((m) => m.tipo === "conversation.echo").map((m) => m.texto);
const avisos = (lista) => lista.filter((m) => m.tipo === "conversation.respond").map((m) => m.texto);
const contexto = (lista) => lista.filter((m) => m.tipo === "conversation.append_llm_context").map((m) => m.texto);

test("ANTES: pedir un humano o decir que no le interesa no hacía nada", { skip: MODO !== "roto" || !chromium }, async (t) => {
  const navegador = await chromium.launch(); t.after(() => navegador.close());
  const p = await abrir(navegador, "?reentrada=1");
  await dice(p, "Quiero hablar con una persona");
  await dice(p, "No me interesa, gracias");
  await pasan(p, 4 * 60_000);
  const e = await enviados(p);
  assert.equal(decir(e).length, 0, "Verzy no decía nada de un humano");
  assert.equal((await p.evaluate(() => window.__pedidos.filter((x) => x.url.includes("/atencion")).length)), 0, "nadie se enteraba");
  assert.equal(await p.evaluate(() => window.__daily.salidas), 0, "y la llamada seguía");
});

test("la sala montada", { skip: MODO !== "bueno" || !chromium }, async (t) => {
  const navegador = await chromium.launch(); t.after(() => navegador.close());

  await t.test("pedir un humano: lo dice al momento, avisa al equipo y espera 3 minutos", async () => {
    const p = await abrir(navegador, "?reentrada=1");
    await dice(p, "Quiero hablar con una persona, por favor");
    await pasan(p, 300);
    let e = await enviados(p);
    assert.deepEqual(await pedidos(p), [{ tipo: "humano", frase: "Quiero hablar con una persona, por favor" }]);
    assert.ok(e.some((m) => m.tipo === "conversation.interrupt"), "corta lo que Verzy iba a decir");
    assert.deepEqual(decir(e), ["Claro, Alexis. Dame un momento, he notificado a un humano para que ingrese a la reunión."]);
    assert.ok(contexto(e).some((c) => /Nunca digas que ya hay un humano conectado/.test(c)));
    // Lo repite: no se avisa dos veces.
    await dice(p, "quiero hablar con un humano");
    await pasan(p, 60_000);
    e = await enviados(p);
    assert.equal((await pedidos(p)).length, 1, "una sola alerta");
    assert.equal(avisos(e).length, 1);
    assert.match(avisos(e)[0], /^\[AVISO INTERNO\] .*ya fue notificado/);
    await pasan(p, 60_000);
    assert.match(avisos(await enviados(p))[1], /demorando/);
    await pasan(p, 60_000);
    assert.match(avisos(await enviados(p))[2], /reagendar.*sin avatar/);
    assert.equal(await p.evaluate(() => window.__daily.salidas), 0, "nunca cuelga por esperar");
    // Reagenda: el equipo se entera con la fecha.
    await p.evaluate(() => window.__daily.disparar("app-message", { data: { event_type: "conversation.tool_call", properties: { name: "agendar_seguimiento", arguments: JSON.stringify({ tipo: "recordatorio", fecha_hora: "2026-10-12T10:00", nota: "Llamada con un asesor humano" }) } } }));
    await p.waitForFunction(() => window.__pedidos.some((x) => x.url.includes("/atencion") && x.cuerpo.includes("reagendada")));
    assert.deepEqual((await pedidos(p)).at(-1), { tipo: "reagendada", cuando: "2026-10-12T10:00" });
  });

  await t.test("si el asesor entra durante la espera, Verzy le da la palabra y no hay más avisos", async () => {
    const p = await abrir(navegador, "?reentrada=1");
    await dice(p, "¿Me pasas con un asesor?");
    await pasan(p, 30_000);
    await p.evaluate(() => window.__poner("as", { user_name: "Laura", userData: { humano: true, asesor: true }, tracks: {} }));
    await pasan(p, 4 * 60_000);
    const e = await enviados(p);
    assert.ok(contexto(e).some((c) => /asesor humano acaba de entrar/.test(c)));
    assert.equal(avisos(e).length, 0, "sin avisos de espera");
    // Con el asesor dentro, lo que se oye no dispara nada (puede ser él).
    await dice(p, "no me interesa");
    await pasan(p, 1_000);
    assert.equal((await pedidos(p)).filter((x) => x.tipo === "descartado").length, 0);
  });

  await t.test("la incomodidad: alerta SILENCIOSA, Verzy no se entera", async () => {
    const p = await abrir(navegador, "?reentrada=1");
    const antes = (await enviados(p)).length;
    await dice(p, "Uff, no me estás entendiendo");
    await pasan(p, 500);
    assert.deepEqual(await pedidos(p), [{ tipo: "incomodidad", frase: "Uff, no me estás entendiendo" }]);
    assert.equal((await enviados(p)).length, antes, "a Verzy no se le dice nada");
    // Otra enseguida no repite la alerta.
    await dice(p, "ya te dije que no");
    await pasan(p, 500);
    assert.equal((await pedidos(p)).length, 1);
  });

  await t.test("quiere comprar en el minuto 2: Verzy salta al cierre", async () => {
    const p = await abrir(navegador, "?reentrada=1");
    await pasan(p, 2 * 60_000);
    await dice(p, "Ya vengo convencido, ¿cómo pago el plan básico?");
    await pasan(p, 300);
    const c = contexto(await enviados(p));
    assert.ok(c.some((x) => /intención clara de comprar.*enviar_por_whatsapp.*comparta su pantalla.*videotutoriales.*soporte e implementación/s.test(x)));
  });

  await t.test("el NO explícito: despedida cordial, la cita a Descartado y se cuelga al terminarla", async () => {
    const p = await abrir(navegador, "?reentrada=1");
    await dice(p, "La verdad está muy caro, no me interesa");
    await pasan(p, 300);
    const e = await enviados(p);
    assert.deepEqual((await pedidos(p)).map((x) => x.tipo), ["descartado"]);
    assert.ok(e.some((m) => m.tipo === "conversation.interrupt"), "no deja que insista");
    assert.match(decir(e)[0], /^Entiendo perfectamente, Alexis\. Gracias por tu tiempo/);
    assert.equal(await p.evaluate(() => window.__daily.salidas), 0, "no corta a media despedida");
    await pasan(p, 3_000);
    await verzyCalla(p);
    await pasan(p, 2_000);
    assert.equal(await p.evaluate(() => window.__daily.salidas), 1);
  });

  await t.test("el reloj: 25, 29 y la despedida del 30, con el seguimiento por WhatsApp", async () => {
    const empezo = new Date().toISOString(); // el reloj falso arranca en el real
    const p = await abrir(navegador, `?reentrada=1&limite=30&empezo=${encodeURIComponent(empezo)}`);
    await pasan(p, 24 * 60_000);
    assert.equal(avisos(await enviados(p)).length, 0, "nada antes del 25");
    await pasan(p, 61_000);
    let a = avisos(await enviados(p));
    assert.equal(a.length, 1);
    assert.match(a[0], /Quedan 5 minutos.*qué plan quiere adquirir/s);
    await pasan(p, 4 * 60_000);
    a = avisos(await enviados(p));
    assert.match(a[1], /Queda 1 minuto/);
    await pasan(p, 46_000);
    const e = await enviados(p);
    assert.match(decir(e).at(-1), /Alexis, llegamos al tiempo de nuestra reunión.*WhatsApp/);
    assert.ok((await pedidos(p)).some((x) => x.tipo === "seguimiento"), "el seguimiento pasa a WhatsApp");
    assert.equal(await p.evaluate(() => window.__daily.salidas), 0, "se despide antes de cortar");
    await pasan(p, 2_000);
    await verzyCalla(p);
    await pasan(p, 2_000);
    assert.equal(await p.evaluate(() => window.__daily.salidas), 1, "y cuelga limpio");
  });

  await t.test("el aviso de los 5 minutos con el cliente ya pagando", async () => {
    const empezo = new Date().toISOString(); // el reloj falso arranca en el real
    const p = await abrir(navegador, `?reentrada=1&limite=30&empezo=${encodeURIComponent(empezo)}`);
    await p.evaluate(() => window.__daily.disparar("app-message", { data: { event_type: "conversation.tool_call", properties: { name: "enviar_por_whatsapp", arguments: JSON.stringify({ que: "pago", plan: "nivel 2" }) } } }));
    await pasan(p, 25 * 60_000 + 1_000);
    assert.match(avisos(await enviados(p))[0], /ya está en proceso de pago.*soporte desde la plataforma/s);
  });

  await t.test("el aviso espera a que el cliente termine de hablar", async () => {
    const empezo = new Date().toISOString(); // el reloj falso arranca en el real
    const p = await abrir(navegador, `?reentrada=1&limite=30&empezo=${encodeURIComponent(empezo)}`);
    await pasan(p, 24 * 60_000 + 59_000);
    await p.evaluate(() => window.__daily.disparar("app-message", { data: { event_type: "conversation.user.started_speaking" } }));
    await pasan(p, 5_000);
    assert.equal(avisos(await enviados(p)).length, 0, "no lo pisa");
    await p.evaluate(() => window.__daily.disparar("app-message", { data: { event_type: "conversation.user.stopped_speaking" } }));
    await pasan(p, 500);
    assert.equal(avisos(await enviados(p)).length, 1);
  });
});
