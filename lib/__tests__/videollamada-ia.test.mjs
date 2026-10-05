// La videollamada con IA de Verzay (Tavus): las reglas puras.
// Se compila `lib/videollamada-ia.ts` con esbuild (lo hace el script del banco).
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const MODO = process.env.MODO ?? "bueno";
const R = MODO === "bueno" ? await import("./.compilado/videollamada-ia.js") : null;
const P = MODO === "bueno" ? await import("./.compilado/pantalla-del-avatar.js") : null;
const D = MODO === "bueno" ? await import("./.compilado/pantalla-de-verzy.js") : null;
const V = MODO === "bueno" ? await import("./.compilado/videollamada-en-vivo.js") : null;
const C = MODO === "bueno" ? await import("./.compilado/videollamada-crm.js") : null;
const salaDe = (ref) => ref
  ? execSync(`git show ${ref}:components/videollamada/SalaDeLaVideollamada.tsx`, { encoding: "utf8" })
  : readFileSync("components/videollamada/SalaDeLaVideollamada.tsx", "utf8");
const sinComentarios = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
const existiaEn = (ref, ruta) => {
  try { execSync(`git cat-file -e ${ref}:${ruta}`, { stdio: "ignore" }); return true; } catch { return false; }
};

const ajustes = readFileSync(
  process.env.AJUSTES_DE_LA_REUNION ?? "app/(root)/schedule/_components/settings/UpdateMeetingDuration.tsx",
  "utf8",
);

if (MODO === "roto") {
  test("antes: los ajustes de reunión solo tenían el enlace fijo", () => {
    assert.ok(!ajustes.includes("tavus"), "en el «antes» no había modo Tavus");
    assert.equal(process.env.HAY_MODULO_ANTES, "no", "en el «antes» no existía lib/videollamada-ia.ts");
  });
} else {
  test("sin ajustes la cuenta sigue en el enlace fijo", () => {
    assert.equal(R.comoModoDeReunion(undefined), "enlace");
    assert.equal(R.comoModoDeReunion("raro"), "enlace");
    assert.equal(R.comoModoDeReunion("tavus"), "tavus");
  });

  test("los ajustes ofrecen los DOS modos, el fijo no se quita", () => {
    assert.ok(ajustes.includes("tavus"));
    assert.ok(ajustes.includes("meetingUrl") || ajustes.includes("enlace"));
  });

  test("el enlace del cliente es nuestro y no lleva nada de Tavus", () => {
    assert.equal(R.elEnlaceDeLaVideollamada("https://agente.ia-app.com/", "c1"), "https://agente.ia-app.com/videollamada/c1");
  });

  test("la sesión se crea al ABRIR, dentro de la franja, y se reutiliza", () => {
    const inicio = new Date("2026-10-05T15:00:00Z");
    const fin = new Date("2026-10-05T15:30:00Z");
    const base = { inicio, fin, estado: "PENDIENTE", existente: null };
    assert.equal(R.queHacerAlAbrir({ ...base, ahora: new Date("2026-10-05T14:00:00Z") }).accion, "temprano");
    assert.equal(R.queHacerAlAbrir({ ...base, ahora: new Date("2026-10-05T14:50:00Z") }).accion, "crear");
    assert.equal(R.queHacerAlAbrir({ ...base, ahora: new Date("2026-10-05T15:31:00Z") }).accion, "cerrada");
    assert.equal(R.queHacerAlAbrir({ ...base, estado: "CANCELADA", ahora: inicio }).accion, "cancelada");
    // «No asistió» sigue con la sala viva hasta el fin de la franja.
    assert.equal(R.queHacerAlAbrir({ ...base, estado: "NO_ASISTIDA", ahora: new Date("2026-10-05T15:10:00Z") }).accion, "crear");
    assert.equal(
      R.queHacerAlAbrir({ ...base, ahora: inicio, existente: { url: "https://tavus.daily.co/x", estado: "activa" } }).accion,
      "reutilizar",
    );
  });

  test("los tiempos de la ausencia son 3 y 5 minutos", () => {
    assert.equal(R.MINUTOS_PARA_LLAMAR, 3);
    assert.equal(R.MINUTOS_PARA_NO_ASISTIO, 5);
  });

  test("el avatar es UNO, el de la plataforma: sin él no hay modo Tavus", () => {
    assert.equal(R.losAjustesQueSeGuardan({ modo: "tavus" }, false).ok, false);
    const ok = R.losAjustesQueSeGuardan({ modo: "tavus", personaId: "otro", clave: "x" }, true);
    assert.equal(ok.ok, true);
    assert.deepEqual(ok.ajustes, { modo: "tavus" });
    assert.equal(R.losAjustesQueSeGuardan({ modo: "enlace" }, false).ok, true);
    assert.equal(R.elAvatarDelEntorno({}), null);
    assert.equal(R.elAvatarDelEntorno({ TAVUS_API_KEY: "a".repeat(32) }), null);
    const av = R.elAvatarDelEntorno({ TAVUS_API_KEY: "a".repeat(32), TAVUS_PERSONA_ID: "p123abc" });
    assert.equal(av.personaId, "p123abc");
  });

  test("una cuenta puede tener su propio avatar; sin él usa el de la casa", () => {
    const casa = { clave: "c".repeat(32), personaId: "pcasa1" };
    assert.deepEqual(R.elAvatarQueUsa(null, casa), casa);
    assert.deepEqual(R.elAvatarQueUsa({ clave: "a".repeat(32) }, casa), casa);
    assert.deepEqual(R.elAvatarQueUsa({ personaId: "ppropio" }, casa), casa);
    assert.deepEqual(R.elAvatarQueUsa({ clave: "a".repeat(32), personaId: "ppropio" }, casa), { clave: "a".repeat(32), personaId: "ppropio" });
    assert.deepEqual(R.elAvatarQueUsa({ clave: "a".repeat(32), personaId: "ppropio" }, null), { clave: "a".repeat(32), personaId: "ppropio" });
    assert.equal(R.elAvatarQueUsa(null, null), null);
  });

  test("abrir y la disponibilidad usan el avatar de la CUENTA", () => {
    const srv = leer("lib/videollamada-ia.server.ts");
    const db = leer("lib/videollamada-ia-db.ts");
    assert.match(srv, /elAvatarDeLaCuenta\(cita\.userId\)/);
    assert.doesNotMatch(srv, /elAvatarDeVerzay\(\)/);
    assert.match(db, /disponible = Boolean\(await elAvatarDeLaCuenta\(cuentaId\)\)/);
    assert.match(db, /propioClaveSellada/);
    assert.match(db, /sellar\(/);
  });

  test("la transcripción de Tavus se guarda como la de una llamada", () => {
    const t = R.laTranscripcionDeTavus([
      { role: "system", content: "secreto" },
      { role: "assistant", content: "Hola" },
      { role: "user", content: "Buenas  tardes" },
    ]);
    assert.equal(t, "Asistente: Hola\nCliente: Buenas tardes");
    const a = R.queHaceElAvisoDeTavus({ event_type: "application.recording_ready", conversation_id: "c", properties: { s3_key: "x" } });
    assert.equal(a.accion, "grabacion");
    assert.equal(a.grabacionUrl, null);
  });
}

/* ── La pantalla del avatar y su sala ─────────────────────────────────── */

const leer = (f) => { try { return readFileSync(new URL(`../../${f}`, import.meta.url), "utf8"); } catch { return ""; } };
const tool = (name, args) => ({
    message_type: "conversation",
    event_type: "conversation.tool_call",
    properties: { name, arguments: typeof args === "string" ? args : JSON.stringify(args) },
});

test("pantalla: mostrar_pantalla elige SOLO un destino real de Verzay Ventas, o ninguna", { skip: !P }, () => {
    assert.deepEqual(P.laOrdenDeLaPantalla(tool(P.NOMBRE_DE_LA_HERRAMIENTA, { destino: "embudo" })), { accion: "mostrar", destino: "embudo" });
    assert.deepEqual(P.laOrdenDeLaPantalla(tool(P.NOMBRE_DE_LA_HERRAMIENTA, { destino: "ninguna" })), { accion: "ocultar" });
    assert.equal(P.laOrdenDeLaPantalla(tool(P.NOMBRE_DE_LA_HERRAMIENTA, { destino: "https://malo.com" })), null);
    // Formato viejo (`pagina`): la persona de Tavus puede no haber aceptado el
    // cambio; se traduce a una pantalla real, nunca se ignora.
    assert.deepEqual(P.laOrdenDeLaPantalla(tool(P.NOMBRE_DE_LA_HERRAMIENTA, { pagina: "crm_embudo" })), { accion: "mostrar", destino: "embudo" });
    assert.deepEqual(P.laOrdenDeLaPantalla(tool(P.NOMBRE_DE_LA_HERRAMIENTA, { pagina: "ficha" })), { accion: "mostrar", destino: "ficha" });
    assert.deepEqual(P.laOrdenDeLaPantalla(tool(P.NOMBRE_DE_LA_HERRAMIENTA, { pagina: "precios" })), { accion: "mostrar", destino: "dashboard" });
    assert.deepEqual(P.laOrdenDeLaPantalla(tool(P.NOMBRE_DE_LA_HERRAMIENTA, { pagina: "ninguna" })), { accion: "ocultar" });
    assert.equal(P.laOrdenDeLaPantalla(tool(P.NOMBRE_DE_LA_HERRAMIENTA, {})), null);
    assert.equal(P.laOrdenDeLaPantalla({ event_type: "chat", properties: { destino: "chats" } }), null);
    const enumerado = P.HERRAMIENTA_DE_LA_PANTALLA.function.parameters.properties.destino.enum;
    assert.deepEqual([...enumerado].sort(), [...D.DESTINOS_DE_VERZY.map((d) => d.clave), "ninguna"].sort());
});

test("pantalla: cada destino es una ruta REAL de la plataforma, nunca una vista de la llamada", { skip: !D }, () => {
    const conv = { jid: "573001234567@s.whatsapp.net", linea: "VERZAY_VENTAS" };
    for (const d of D.DESTINOS_DE_VERZY) {
        const r = D.laRutaDelDestino(d.clave, conv);
        assert.match(r, /^\/[a-z]/);
        assert.doesNotMatch(r, /videollamada/);
        const carpeta = r.split("?")[0];
        const hay = execSync(`ls app/\\(root\\)${carpeta}/page.tsx 2>/dev/null || true`, { encoding: "utf8" }).trim();
        assert.ok(hay, `${d.clave} → ${carpeta} no es una pantalla de la App`);
    }
    assert.match(D.laRutaDelDestino("ficha", conv), /jid=573001234567%40s\.whatsapp\.net&instance=VERZAY_VENTAS/);
    assert.equal(D.laRutaDelDestino("chats", null), "/chats");
});

test("pantalla: la orden que llega a la ruta se sanea", { skip: !D }, () => {
    assert.deepEqual(D.laOrdenPedida({ tipo: "ir", destino: "citas" }), { tipo: "ir", datos: { destino: "citas" } });
    assert.equal(D.laOrdenPedida({ tipo: "ir", destino: "/admin" }), null);
    assert.deepEqual(D.laOrdenPedida({ tipo: "nota", texto: "  Tiene   3 sedes " }), { tipo: "nota", datos: { texto: "Tiene 3 sedes" } });
    assert.equal(D.laOrdenPedida({ tipo: "nota", texto: "   " }), null);
    assert.equal(D.laOrdenPedida({ tipo: "otra" }), null);
    assert.equal(D.laOrdenPedida(null), null);
    assert.equal(D.laOrdenPedida({ tipo: "nota", texto: "x".repeat(900) }).datos.texto.length, D.TOPE_DE_LA_NOTA);
});

test("nota: se agrega en su línea, sin repetir y sin pisar lo que había", { skip: !D }, () => {
    assert.equal(D.conLaNotaAgregada("", "Uno"), "Uno");
    assert.equal(D.conLaNotaAgregada("Previo\n", "Uno"), "Previo\nUno");
    assert.equal(D.conLaNotaAgregada("Previo\nUno", "Uno"), "Previo\nUno");
    assert.equal(D.conLaNotaAgregada("Previo", "  "), "Previo");
    assert.match(D.loQueSeLeCuentaAVerzy({ tipo: "nota", datos: { texto: "a" } }, { ok: false, motivo: "x" }), /No digas/);
    assert.match(D.loQueSeLeCuentaAVerzy({ tipo: "ir", datos: { destino: "embudo" } }, { ok: true }), /Embudo de ventas/);
});

test("tomar_nota: se registra en la persona y su orden se lee", { skip: !P }, () => {
    assert.deepEqual(P.laOrdenDeTomarNota(tool(P.NOMBRE_DE_TOMAR_NOTA, { texto: "Tiene una clínica" })), { texto: "Tiene una clínica" });
    assert.equal(P.laOrdenDeTomarNota(tool(P.NOMBRE_DE_TOMAR_NOTA, { texto: "  " })), null);
    assert.equal(P.laOrdenDeTomarNota(tool("otra", { texto: "x" })), null);
    const parche = P.elParcheDeLaPersona({ layers: { llm: { tools: [] } } });
    const nombres = parche.find((op) => op.path === "/layers/llm/tools").value.map((t) => t.function?.name);
    for (const n of [P.NOMBRE_DE_LA_HERRAMIENTA, P.NOMBRE_DE_TOMAR_NOTA, P.NOMBRE_DEL_ENVIO, P.NOMBRE_DEL_AGENDAR]) {
        assert.ok(nombres.includes(n), `falta ${n}`);
    }
});

test("pantalla: la herramienta se REGISTRA en la persona, sin pisar las demás", { skip: !P }, () => {
    const sinNada = P.elParcheDeLaPersona({ persona_id: "p" });
    assert.ok(Array.isArray(sinNada) && sinNada.length > 0, "sin layers hay que ponerla");
    const otra = { type: "function", function: { name: "otra" } };
    const conOtra = P.elParcheDeLaPersona({ layers: { llm: { tools: [otra] } } });
    const puesta = conOtra.find((op) => op.path === "/layers/llm/tools");
    const nombres = puesta.value.map((t) => t.function?.name);
    assert.ok(nombres.includes("otra"), "conserva las demás herramientas");
    assert.equal(P.elParcheDeLaPersona({ layers: { llm: { tools: puesta.value } } }), null);
    const vieja = { type: "function", function: { name: P.NOMBRE_DE_LA_HERRAMIENTA, description: "vieja" } };
    const rehecha = P.elParcheDeLaPersona({ layers: { llm: { tools: [vieja, otra] } } });
    const lista = rehecha.find((op) => op.path === "/layers/llm/tools").value;
    assert.equal(lista.filter((t) => t.function?.name === P.NOMBRE_DE_LA_HERRAMIENTA).length, 1);
});

test("pantalla: el contexto prohíbe decir direcciones, empieza sin compartir y nombra los destinos", { skip: !P }, () => {
    const b = P.elBloqueDeLaPantalla();
    assert.match(b, /mostrar_pantalla/);
    assert.match(b, /nunca/i);
    assert.match(b, /sin compartir/i);
    for (const d of D.DESTINOS_DE_VERZY) assert.ok(b.includes(d.clave), `el contexto no nombra ${d.clave}`);
    assert.doesNotMatch(b + P.elBloqueDelGuion("hoy"), /https?:\/\/|\/inicio|\/demo|#pricing/, "ninguna URL en el guion");
});

test("sala: la página monta la sala y no redirige", { skip: MODO !== "bueno" }, () => {
    const pagina = leer("app/videollamada/[id]/page.tsx");
    assert.match(pagina, /<SalaDeLaVideollamada\s+url=/);
    assert.doesNotMatch(pagina, /redirect\(/);
    const sala = leer("components/videollamada/SalaDeLaVideollamada.tsx");
    assert.match(sala, /laOrdenDeLaPantalla\(/);
    assert.match(sala, /laOrdenDeTomarNota\(/);
    assert.match(sala, /createCallObject\(/);
    assert.doesNotMatch(sala, /createFrame\(/);
    assert.match(leer("lib/videollamada-ia.server.ts"), /elBloqueDeLaPantalla\(\)/);
});

test("sala: la pantalla es el VIDEO en vivo de la sesión real, sin fotos periódicas ni iframe", { skip: MODO !== "bueno" }, () => {
    const sala = sinComentarios(salaDe(null));
    assert.doesNotMatch(sala, /<iframe/);
    assert.match(sala, /\/api\/videollamada\/pantalla\?preparar=1&\$\{consulta\}/);
    assert.match(sala, /data-zona="video-de-la-pantalla"/);
    assert.match(sala, /\/api\/videollamada\/pantalla\?stream=1&/);
    assert.match(sala, /onError=\{reabrirElVideo\}/);
    assert.doesNotMatch(sala, /FOTO_CADA_MS/);
    assert.doesNotMatch(sala, /setInterval\(\(\) => set(Foto|Video)/);
    const ruta = leer("app/api/videollamada/pantalla/route.ts");
    assert.match(ruta, /abrirElFlujo\(/);
    assert.match(ruta, /TIPO_DEL_FLUJO/);
    assert.match(leer("lib/pantalla-de-verzy.server.ts"), /Page\.startScreencast/);
    assert.match(sala, /tipo: "ir"/);
    assert.match(sala, /tipo: "nota"/);
    assert.doesNotMatch(sala, /data-zona="notas"/);
    for (const v of ["crm", "ficha", "resultados"]) assert.ok(!existsSync(`app/videollamada/vista/${v}/page.tsx`), `${v} sigue existiendo`);
});

test("sala: si Verzy no habla en unos segundos, se le pide el saludo", { skip: MODO !== "bueno" }, () => {
    const sala = sinComentarios(salaDe(null));
    assert.match(sala, /conversation\.echo/);
    assert.match(sala, /ESPERA_DEL_SALUDO_MS/);
    assert.match(sala, /SALUDO_INICIAL/);
});

test("servidor de la pantalla: firmado, solo servidor y la nota se comprueba en la base", { skip: MODO !== "bueno" }, () => {
    assert.match(leer("app/api/videollamada/pantalla/route.ts"), /esLaFirmaDeLaCita/);
    assert.match(leer("app/api/videollamada/pantalla/route.ts"), /laOrdenPedida/);
    const srv = leer("lib/pantalla-de-verzy.server.ts");
    assert.match(srv, /import "server-only"/);
    assert.match(srv, /externalClientData/);
    assert.match(srv, /CHROMIUM_PATH/);
    assert.match(srv, /addCookies/);
    assert.ok(!existsSync("app/api/videollamada/servicio/entrar/route.ts"), "ninguna ruta entrega una sesión");
    assert.match(leer("next.config.js"), /"playwright-core"/);
    assert.match(leer("Dockerfile"), /chromium/);
    assert.match(leer("Dockerfile"), /CHROMIUM_PATH=\/usr\/bin\/chromium/);
});

test("sala y servidor: la persona se revisa antes de crear la conversación", { skip: MODO !== "bueno" }, () => {
    const srv = leer("lib/videollamada-ia.server.ts");
    const i = srv.indexOf("asegurarLaPantallaEnLaPersona(tavus)");
    assert.ok(i > 0 && i < srv.indexOf("persona_id: tavus.personaId"), "se revisa antes de pedir la conversación");
});

// ── La pantalla real (vuelta del 2026-10-05, 3) ──
// El «antes» va PINCHADO a 9c0e76d (nunca origin/main): allí la pantalla era
// un iframe con vistas simuladas y no había tomar_nota.
const ANTES_REAL = process.env.ANTES_REAL_REF ?? "9c0e76d";
test("pantalla real: antes era un iframe con vistas simuladas y sin tomar_nota", { skip: MODO !== "roto" }, () => {
    const sala = execSync(`git show ${ANTES_REAL}:components/videollamada/SalaDeLaVideollamada.tsx`, { encoding: "utf8" });
    assert.match(sala, /<iframe/);
    assert.ok(existiaEn(ANTES_REAL, "app/videollamada/vista/crm/page.tsx"));
    assert.ok(!existiaEn(ANTES_REAL, "lib/pantalla-de-verzy.ts"));
    assert.doesNotMatch(execSync(`git show ${ANTES_REAL}:lib/pantalla-del-avatar.ts`, { encoding: "utf8" }), /tomar_nota/);
});

test("sala: antes la sala era la interfaz de Daily (con su pantalla «Join»)", { skip: MODO !== "roto" }, () => {
    const antes = execSync("git show 0319376:components/videollamada/SalaDeLaVideollamada.tsx", { encoding: "utf8" });
    assert.match(antes, /createFrame\(/);
    assert.doesNotMatch(antes, /createCallObject\(/);
});

test("enlace con nombre: «María Alejandra Rosas» → maria-alejandra-rosas, y sin nombre va el id", { skip: MODO !== "bueno" }, () => {
  assert.equal(R.elEnlaceDelNombre("María Alejandra Rosas"), "maria-alejandra-rosas");
  assert.equal(R.elEnlaceDelNombre("  Ñandú  Pérez!! "), "nandu-perez");
  assert.equal(R.elEnlaceDelNombre(""), null);
  assert.equal(R.elEnlaceDelNombre("+57 300 123 4567"), null, "un teléfono no es un nombre");
  assert.equal(R.elEnlaceConSufijo("ana-ruiz", 1), "ana-ruiz");
  assert.equal(R.elEnlaceConSufijo("ana-ruiz", 3), "ana-ruiz-3");
  assert.ok(R.pareceUnEnlaceConNombre("maria-alejandra-rosas"));
  assert.ok(!R.pareceUnEnlaceConNombre("María"));
  assert.equal(
    R.elNombreDelProspecto({ clientName: "Cliente", session: { customName: "María Rosas", pushName: "Mari" } }),
    "María Rosas",
  );
});

test("sala: entra con el nombre de la cita, sin chat, con compartir pantalla y con «Salir»", { skip: MODO !== "bueno" }, () => {
  const sala = readFileSync("components/videollamada/SalaDeLaVideollamada.tsx", "utf8");
  const pagina = readFileSync("app/videollamada/[id]/page.tsx", "utf8");
  assert.ok(sala.includes("userName: conNombre"), "el nombre va al entrar, no se le pide");
  assert.ok(pagina.includes("nombre={resultado.nombre}"));
  assert.ok(sala.includes("startScreenShare") && sala.includes("stopScreenShare"));
  assert.ok(/>\s*Salir\s*</.test(sala), "se puede colgar a mano");
  assert.ok(!/chat/i.test(sala.replace(/\/\/.*$/gm, "").replace(/\/chats/g, "")), "sin chat en la videollamada");
});

// ── Ajustes de experiencia (vuelta del 2026-10-05) ──
const ANTES_EXP = process.env.ANTES_EXP_REF ?? "c4e5b5d5";

test("experiencia: sin recuadro propio, sin Silenciar, y tres mandos: cámara, pantalla y Salir", () => {
  const sala = sinComentarios(salaDe(MODO === "roto" ? ANTES_EXP : null));
  const tieneMiVideo = /data-zona="mi-video"/.test(sala);
  const tieneSilenciar = />\s*\{?[^<]*Silenciar/.test(sala) || /"Silenciar"/.test(sala);
  if (MODO === "roto") {
    assert.ok(tieneMiVideo || tieneSilenciar, "antes había recuadro propio o Silenciar");
    return;
  }
  assert.ok(!tieneMiVideo, "sin recuadro de la cámara propia");
  assert.ok(!tieneSilenciar, "sin botón de silenciar");
  const mandos = [...sala.matchAll(/data-mando="([a-z]+)"/g)].map((m) => m[1]);
  assert.deepEqual(mandos, ["camara", "pantalla", "salir"]);
  assert.ok(sala.indexOf("Apagar cámara") < sala.indexOf("Compartir pantalla"));
  assert.match(sala, /justify-center/);
});

test("experiencia: arranca solo con el avatar; con la pantalla, el avatar es miniatura", { skip: MODO !== "bueno" }, () => {
  const sala = salaDe(null);
  assert.match(sala, /data-miniatura=\{enMiniatura/);
  assert.match(sala, /const enMiniatura = !!destino/);
  assert.match(sala, /useState<DestinoDeVerzy \| null>\(null\)/, "sin pantalla al empezar");
  assert.equal((sala.match(/data-zona="video-del-avatar"/g) ?? []).length, 1);
});

test("envío por WhatsApp: la orden se lee y el enlace se arma en el servidor", { skip: !P }, () => {
  const orden = P.laOrdenDeEnvio({ event_type: "conversation.tool_call", properties: { name: P.NOMBRE_DEL_ENVIO, arguments: JSON.stringify({ que: "pago", plan: "Básico" }) } });
  assert.ok(orden && orden.que === "pago");
  assert.equal(P.laOrdenDeEnvio({ event_type: "conversation.tool_call", properties: { name: P.NOMBRE_DEL_ENVIO, arguments: { que: "otra" } } }), null);
  assert.equal(P.laOrdenDeEnvio({ event_type: "otra", properties: {} }), null);
  const web = P.elEnvioArmado({ que: "web", plan: null }, { origen: "https://agente.ia-app.com", nivel: null, nombreDelPlan: null });
  assert.match(web.enlace, /^https:\/\/agente\.ia-app\.com\/inicio/);
  const pago = P.elEnvioArmado({ que: "pago", plan: "x" }, { origen: "https://agente.ia-app.com", nivel: P.NIVELES_DEL_ENVIO[1], nombreDelPlan: "Básico" });
  assert.match(pago.enlace, /\/register\?plan=nivel-2/);
  assert.ok("motivo" in P.elEnvioArmado({ que: "plan", plan: "?" }, { origen: "https://x.co", nivel: null, nombreDelPlan: null }), "sin plan no se manda");
  assert.notEqual(web.llave, pago.llave);
});

test("envío y reconexión: la sala los pide al servidor con la firma, y la sesión espera al cliente", () => {
  const sala = salaDe(MODO === "roto" ? ANTES_EXP : null);
  if (MODO === "roto") {
    assert.doesNotMatch(sala, /\/api\/videollamada\/whatsapp/, "antes no había envío");
    assert.doesNotMatch(sala, /\/api\/videollamada\/sala/, "antes no había reconexión");
    return;
  }
  assert.match(sala, /\/api\/videollamada\/whatsapp\?\$\{consulta\}/);
  assert.match(sala, /\/api\/videollamada\/sala\?\$\{consulta\}/);
  assert.match(sala, /conversation\.append_llm_context/);
  assert.ok(existsSync("app/api/videollamada/whatsapp/route.ts") && existsSync("app/api/videollamada/sala/route.ts"));
  for (const r of ["whatsapp", "sala"]) assert.match(readFileSync(`app/api/videollamada/${r}/route.ts`, "utf8"), /esLaFirmaDeLaCita/);
  assert.match(readFileSync("lib/videollamada-ia.server.ts", "utf8"), /participant_left_timeout/);
  assert.match(readFileSync("lib/whatsapp-de-la-videollamada.server.ts", "utf8"), /anotarElEnvio/);
});

// ── En vivo: guion, agendar y novedades (vuelta del 2026-10-05) ──
const ANTES_VIVO = process.env.ANTES_VIVO_REF ?? "f0eac70";

test("en vivo: antes no había agendar ni novedades", { skip: MODO !== "roto" }, () => {
  for (const r of ["lib/videollamada-en-vivo.ts", "app/api/videollamada/agendar/route.ts", "app/api/videollamada/novedades/route.ts"]) {
    assert.equal(existiaEn(ANTES_VIVO, r), false, `${r} no existía antes`);
  }
  assert.doesNotMatch(salaDe(ANTES_VIVO), /\/api\/videollamada\/agendar/);
  assert.doesNotMatch(execSync(`git show ${ANTES_VIVO}:lib/pantalla-del-avatar.ts`, { encoding: "utf8" }), /agendar_seguimiento/);
});

test("envío: formato WhatsApp con negrilla y la mano señalando el enlace", { skip: MODO !== "bueno" }, () => {
  for (const que of ["web", "plan", "pago"]) {
    const a = P.elEnvioArmado({ que, plan: "basico" }, { origen: "https://agente.ia-app.com", nivel: P.NIVELES_DEL_ENVIO[1], nombreDelPlan: "Básico" });
    assert.ok(!("motivo" in a));
    assert.match(a.mensaje, /\*[^*]+\*/, "lleva negrilla");
    assert.ok(a.mensaje.endsWith(`\n\n👉 ${a.enlace}`), "acaba con 👉 y el enlace");
  }
});

test("agendar: tres tipos, fecha estricta, y la regla de cuándo", { skip: MODO !== "bueno" }, () => {
  const llamada = (args) => ({ event_type: "conversation.tool_call", properties: { name: P.NOMBRE_DEL_AGENDAR, arguments: args } });
  const o = P.laOrdenDeAgendar(llamada({ tipo: "llamada", fecha_hora: "2026-10-07T10:30", nota: "Revisar plan" }));
  assert.deepEqual(o, { tipo: "llamada", fechaHora: "2026-10-07T10:30", nota: "Revisar plan" });
  assert.equal(P.laOrdenDeAgendar(llamada({ tipo: "otro", fecha_hora: "2026-10-07T10:30" })), null);
  assert.equal(P.laOrdenDeAgendar(llamada({ tipo: "cita", fecha_hora: "mañana a las 10" })), null);
  const instante = V.elInstanteDeLaAgenda("2026-10-07T10:30", "America/Bogota");
  assert.equal(instante.toISOString(), "2026-10-07T15:30:00.000Z", "en la zona de la cuenta");
  const ahora = new Date("2026-10-05T12:00:00Z");
  assert.equal(V.porQueNoSeAgenda(instante, ahora), null);
  assert.ok(V.porQueNoSeAgenda(new Date("2026-10-01T12:00:00Z"), ahora));
  assert.ok(V.porQueNoSeAgenda(null, ahora));
  assert.notEqual(V.laLlaveDeLaAgenda(o), V.laLlaveDeLaAgenda({ ...o, tipo: "cita" }));
  assert.ok(V.PREFIJO_DEL_NODO.startsWith("auto-reminder-"));
});

test("novedades: un pago o una cuenta nueva se le cuenta a Verzy", { skip: MODO !== "bueno" }, () => {
  assert.equal(V.elAvisoDelPago("nada", null), null);
  assert.ok(V.elAvisoDelPago("registrado", null));
  assert.match(V.elAvisoDelPago("pagado", "Básico"), /Básico/);
  const desde = new Date("2026-10-05T10:00:00Z");
  assert.ok(V.esElProspecto({ notificationNumber: "+57 300 123 4567", createdAt: new Date("2026-10-05T11:00:00Z") }, "573001234567", desde));
  assert.ok(!V.esElProspecto({ notificationNumber: "573001234567", createdAt: new Date("2026-10-04T11:00:00Z") }, "573001234567", desde));
});

test("sala: agenda y novedades con la firma", { skip: MODO !== "bueno" }, () => {
  const sala = sinComentarios(salaDe(null));
  assert.match(sala, /\/api\/videollamada\/agendar\?\$\{consulta\}/);
  assert.match(sala, /\/api\/videollamada\/novedades\?\$\{consulta\}/);
  for (const r of ["agendar", "novedades"]) {
    assert.match(readFileSync(`app/api/videollamada/${r}/route.ts`, "utf8"), /esLaFirmaDeLaCita/);
  }
});

// ── El inicio de la llamada ──

test("crm: la cuenta de Verzy se reconoce por su nombre, de cualquier forma", { skip: MODO !== "bueno" }, () => {
  for (const n of ["Verzay Ventas", "Verzay | Ventas", "verzay-ventas", "VERZAY  VENTAS"]) assert.ok(C.esLaCuentaDeVerzy(n), n);
  for (const n of ["Verzay | Atencion", "Ventas", null, ""]) assert.ok(!C.esLaCuentaDeVerzy(n), String(n));
});

test("inicio: saluda primero, después la pregunta, y solo después abre la ficha y toma notas", { skip: MODO !== "bueno" }, () => {
  assert.equal(C.SALUDO_INICIAL, "Hola, muy buenas, ¿me escuchas?");
  assert.match(readFileSync("lib/videollamada-ia.server.ts", "utf8"), /custom_greeting = elGuionQueSeUsa\(guion\)\.saludo \|\| SALUDO_INICIAL/);
  const g = P.elBloqueDelGuion("lunes 5 de octubre de 2026, 10:00");
  assert.match(g, /5 de octubre de 2026/);
  const iSaludo = g.indexOf(C.SALUDO_INICIAL), iPregunta = g.indexOf(C.SEGUNDA_PREGUNTA), iNota = g.indexOf("tomar_nota");
  assert.ok(iSaludo >= 0 && iPregunta > iSaludo && iNota > iPregunta, "el orden del guion");
});
