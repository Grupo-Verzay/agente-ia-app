// La videollamada con IA de Verzay (Tavus): las reglas puras.
// Se compila `lib/videollamada-ia.ts` con esbuild (lo hace el script del banco).
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const MODO = process.env.MODO ?? "bueno";
const R = MODO === "bueno" ? await import("./.compilado/videollamada-ia.js") : null;

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

const P = MODO === "bueno" ? await import("./.compilado/pantalla-del-avatar.js") : null;
const leer = (f) => { try { return readFileSync(new URL(`../../${f}`, import.meta.url), "utf8"); } catch { return ""; } };

test("pantalla: la orden de Tavus elige una página de la lista, y nada más", { skip: !P }, () => {
    const orden = (args) => ({
        message_type: "conversation",
        event_type: "conversation.tool_call",
        properties: { name: P.NOMBRE_DE_LA_HERRAMIENTA, arguments: JSON.stringify(args) },
    });
    assert.equal(P.laOrdenDeLaPantalla(orden({ pagina: "precios" }))?.pagina.ruta, "/inicio#pricing");
    assert.deepEqual(P.laOrdenDeLaPantalla(orden({ pagina: "ninguna" })), { accion: "ocultar" });
    assert.equal(P.laOrdenDeLaPantalla(orden({ pagina: "https://malo.com" })), null);
    assert.equal(P.laOrdenDeLaPantalla({ event_type: "chat", properties: { pagina: "precios" } }), null);
    for (const p of P.PAGINAS_DEL_AVATAR) assert.match(p.ruta, /^\/[a-z]/, `${p.clave} no es una ruta propia`);
});

test("pantalla: las anclas que enseña el avatar existen en la landing", { skip: !P }, () => {
    for (const p of P.PAGINAS_DEL_AVATAR) {
        const ancla = p.ruta.split("#")[1];
        if (!ancla) continue;
        const hay = execSync(`grep -rlE 'id="${ancla}"' app components || true`, { encoding: "utf8" }).trim();
        assert.ok(hay, `no hay id="${ancla}" para ${p.clave}`);
    }
});

test("sala: la página monta la sala y no redirige, y el contexto lleva la pantalla", { skip: MODO !== "bueno" }, () => {
    const pagina = leer("app/videollamada/[id]/page.tsx");
    assert.match(pagina, /<SalaDeLaVideollamada\s+url=/);
    assert.doesNotMatch(pagina, /redirect\(/);
    const sala = leer("components/videollamada/SalaDeLaVideollamada.tsx");
    assert.match(sala, /laOrdenDeLaPantalla\(/);
    assert.match(sala, /"app-message"/);
    // Sin la interfaz de Daily: se entra directo, sin «Are you ready to join?».
    assert.match(sala, /createCallObject\(/);
    assert.doesNotMatch(sala, /createFrame\(/);
    assert.match(leer("lib/videollamada-ia.server.ts"), /elBloqueDeLaPantalla\(\)/);
    assert.match(leer("next.config.js"), /camera=\(self "https:\/\/tavus\.daily\.co"\)/);
});

test("pantalla: la herramienta se REGISTRA en la persona, sin pisar las demás", { skip: !P }, () => {
    const sinNada = P.elParcheDeLaPersona({ persona_id: "p" });
    assert.ok(Array.isArray(sinNada) && sinNada.length > 0, "sin layers hay que ponerla");
    const otra = { type: "function", function: { name: "otra" } };
    const conOtra = P.elParcheDeLaPersona({ layers: { llm: { tools: [otra] } } });
    const puesta = conOtra.find((op) => op.path === "/layers/llm/tools");
    assert.ok(puesta, "se escribe la lista de herramientas");
    const nombres = puesta.value.map((t) => t.function?.name);
    assert.ok(nombres.includes("otra"), "conserva las demás herramientas");
    assert.ok(nombres.includes(P.NOMBRE_DE_LA_HERRAMIENTA));
    // Ya puesta e igual: no se toca.
    assert.equal(P.elParcheDeLaPersona({ layers: { llm: { tools: puesta.value } } }), null);
    // Vieja: se reemplaza, sin duplicar.
    const vieja = { type: "function", function: { name: P.NOMBRE_DE_LA_HERRAMIENTA, description: "vieja" } };
    const rehecha = P.elParcheDeLaPersona({ layers: { llm: { tools: [vieja, otra] } } });
    const lista = rehecha.find((op) => op.path === "/layers/llm/tools").value;
    assert.equal(lista.filter((t) => t.function?.name === P.NOMBRE_DE_LA_HERRAMIENTA).length, 1);
});

test("pantalla: el contexto prohíbe decir direcciones y nombra la página de cada momento", { skip: !P }, () => {
    const b = P.elBloqueDeLaPantalla();
    assert.match(b, /mostrar_pantalla/);
    assert.match(b, /nunca/i);
    assert.match(b, /precios/);
    assert.equal(P.laPaginaDelAvatar("precios").ruta, "/inicio#pricing");
    assert.deepEqual(P.laRutaYElAncla("/inicio#pricing"), { ruta: "/inicio", ancla: "pricing" });
    assert.deepEqual(P.laRutaYElAncla("/demo"), { ruta: "/demo", ancla: null });
});

test("sala y servidor: la persona se revisa antes de crear la conversación, y la sala baja al ancla", { skip: MODO !== "bueno" }, () => {
    const srv = leer("lib/videollamada-ia.server.ts");
    const i = srv.indexOf("asegurarLaPantallaEnLaPersona(tavus)");
    assert.ok(i > 0 && i < srv.indexOf("persona_id: tavus.personaId"), "se revisa antes de pedir la conversación");
    const sala = leer("components/videollamada/SalaDeLaVideollamada.tsx");
    assert.match(sala, /laRutaYElAncla\(/);
    assert.match(sala, /bajarAlAncla\(/);
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

test("sala: entra con el nombre de la cita, sin «Salir» ni chat, y con compartir pantalla", { skip: MODO !== "bueno" }, () => {
  const sala = readFileSync("components/videollamada/SalaDeLaVideollamada.tsx", "utf8");
  const pagina = readFileSync("app/videollamada/[id]/page.tsx", "utf8");
  assert.ok(sala.includes("userName: conNombre"), "el nombre va al entrar, no se le pide");
  assert.ok(pagina.includes("nombre={resultado.nombre}"));
  assert.ok(sala.includes("startScreenShare") && sala.includes("stopScreenShare"));
  assert.ok(!/>\s*Salir\s*</.test(sala), "solo cámara, micrófono y pantalla");
  assert.ok(!/chat/i.test(sala.replace(/\/\/.*$/gm, "")), "sin chat en la videollamada");
});

// ── Ajustes de experiencia (vuelta del 2026-10-05) ──
const ANTES_EXP = process.env.ANTES_EXP_REF ?? "c4e5b5d5";
const salaDe = (ref) => ref
  ? execSync(`git show ${ref}:components/videollamada/SalaDeLaVideollamada.tsx`, { encoding: "utf8" })
  : readFileSync("components/videollamada/SalaDeLaVideollamada.tsx", "utf8");
const sinComentarios = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

test("experiencia: sin recuadro propio, sin Silenciar, y DOS mandos: cámara y luego pantalla", () => {
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
  assert.deepEqual(mandos, ["camara", "pantalla"]);
  assert.ok(sala.indexOf("Apagar cámara") < sala.indexOf("Compartir pantalla"));
  assert.match(sala, /justify-center/);
});

test("experiencia: arranca solo con el avatar; con la pantalla, el avatar es miniatura", { skip: MODO !== "bueno" }, () => {
  const sala = salaDe(null);
  assert.match(sala, /data-miniatura=\{enMiniatura/);
  assert.match(sala, /const enMiniatura = !!pagina/);
  assert.match(sala, /useState<PaginaDelAvatar \| null>\(null\)/, "sin pantalla al empezar");
  // El <video> del avatar es UNO y siempre montado: no se queda en negro.
  assert.equal((sala.match(/data-zona="video-del-avatar"/g) ?? []).length, 1);
});

test("experiencia: la herramienta de Verzy empieza sin compartir, y hay una de envío", { skip: !P }, () => {
  const b = P.elBloqueDeLaPantalla();
  assert.match(b, /sin compartir|no compartas|solo/i);
  const parche = P.elParcheDeLaPersona({ layers: { llm: { tools: [] } } });
  const nombres = parche.find((op) => op.path === "/layers/llm/tools").value.map((t) => t.function?.name);
  assert.ok(nombres.includes(P.NOMBRE_DE_LA_HERRAMIENTA) && nombres.includes(P.NOMBRE_DEL_ENVIO));
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

// ── En vivo: guion, agendar, notas, novedades y vistas (vuelta del 2026-10-05) ──
// El «antes» va PINCHADO a f0eac70 (nunca origin/main): allí nada de esto existía.
const ANTES_VIVO = process.env.ANTES_VIVO_REF ?? "f0eac70";
const V = MODO === "bueno" ? await import("./.compilado/videollamada-en-vivo.js") : null;
const existiaEn = (ref, ruta) => {
  try { execSync(`git cat-file -e ${ref}:${ruta}`, { stdio: "ignore" }); return true; } catch { return false; }
};

test("en vivo: antes no había agendar, notas, novedades ni vistas", { skip: MODO !== "roto" }, () => {
  for (const r of ["lib/videollamada-en-vivo.ts", "app/api/videollamada/agendar/route.ts", "app/api/videollamada/novedades/route.ts",
    "app/videollamada/vista/ficha/page.tsx", "app/videollamada/vista/resultados/page.tsx"]) {
    assert.equal(existiaEn(ANTES_VIVO, r), false, `${r} no existía antes`);
  }
  const sala = salaDe(ANTES_VIVO);
  assert.doesNotMatch(sala, /\/api\/videollamada\/agendar/);
  assert.doesNotMatch(sala, /data-zona="notas"/);
  const pantalla = execSync(`git show ${ANTES_VIVO}:lib/pantalla-del-avatar.ts`, { encoding: "utf8" });
  assert.doesNotMatch(pantalla, /agendar_seguimiento/);
});

test("envío: formato WhatsApp con negrilla y la mano señalando el enlace", { skip: MODO !== "bueno" }, () => {
  for (const que of ["web", "plan", "pago"]) {
    const a = P.elEnvioArmado({ que, plan: "basico" }, { origen: "https://agente.ia-app.com", nivel: P.NIVELES_DEL_ENVIO[1], nombreDelPlan: "Básico" });
    assert.ok(!("motivo" in a));
    assert.match(a.mensaje, /\*[^*]+\*/, "lleva negrilla");
    assert.ok(a.mensaje.endsWith(`\n\n👉 ${a.enlace}`), "acaba con 👉 y el enlace");
    assert.ok(!a.mensaje.includes("👇"));
  }
});

test("agendar: tres tipos, fecha estricta, y la regla de cuándo", { skip: MODO !== "bueno" }, () => {
  const llamada = (args) => ({ event_type: "conversation.tool_call", properties: { name: P.NOMBRE_DEL_AGENDAR, arguments: args } });
  const o = P.laOrdenDeAgendar(llamada({ tipo: "llamada", fecha_hora: "2026-10-07T10:30", nota: "Revisar plan" }));
  assert.deepEqual(o, { tipo: "llamada", fechaHora: "2026-10-07T10:30", nota: "Revisar plan" });
  assert.equal(P.laOrdenDeAgendar(llamada({ tipo: "otro", fecha_hora: "2026-10-07T10:30" })), null);
  assert.equal(P.laOrdenDeAgendar(llamada({ tipo: "cita", fecha_hora: "mañana a las 10" })), null);
  assert.equal(P.laOrdenDeAgendar({ event_type: "conversation.tool_call", properties: { name: "otra", arguments: {} } }), null);
  const instante = V.elInstanteDeLaAgenda("2026-10-07T10:30", "America/Bogota");
  assert.equal(instante.toISOString(), "2026-10-07T15:30:00.000Z", "en la zona de la cuenta");
  const ahora = new Date("2026-10-05T12:00:00Z");
  assert.equal(V.porQueNoSeAgenda(instante, ahora), null);
  assert.ok(V.porQueNoSeAgenda(new Date("2026-10-01T12:00:00Z"), ahora));
  assert.ok(V.porQueNoSeAgenda(new Date("2028-10-01T12:00:00Z"), ahora));
  assert.ok(V.porQueNoSeAgenda(null, ahora));
  assert.notEqual(V.laLlaveDeLaAgenda(o), V.laLlaveDeLaAgenda({ ...o, tipo: "cita" }));
  assert.ok(V.PREFIJO_DEL_NODO.startsWith("auto-reminder-"), "el motor lo manda a su hora");
});

test("guion: el contexto lleva el guion de ventas con la fecha de hoy", { skip: MODO !== "bueno" }, () => {
  const g = P.elBloqueDelGuion("lunes 5 de octubre de 2026, 10:00");
  assert.match(g, /5 de octubre de 2026/);
  assert.match(g, new RegExp(P.NOMBRE_DEL_AGENDAR));
  assert.match(readFileSync("lib/videollamada-ia.server.ts", "utf8"), /elBloqueDelGuion/);
});

test("notas: solo lo que dice el cliente, sin repetir y con tope", { skip: MODO !== "bueno" }, () => {
  const u = (role, speech) => ({ event_type: "conversation.utterance", properties: { role, speech } });
  assert.equal(V.loQueDijoElCliente(u("user", "Tengo una clínica")), "Tengo una clínica");
  assert.equal(V.loQueDijoElCliente(u("replica", "Hola")), null);
  let n = V.conLaNota([], "Uno");
  n = V.conLaNota(n, "Uno");
  assert.deepEqual(n, ["Uno"]);
  for (let i = 0; i < 40; i++) n = V.conLaNota(n, `n${i}`);
  assert.equal(n.length, V.TOPE_DE_NOTAS);
  assert.equal(n.at(-1), "n39");
});

test("novedades: un pago o una cuenta nueva se le cuenta a Verzy", { skip: MODO !== "bueno" }, () => {
  assert.equal(V.elAvisoDelPago("nada", null), null);
  assert.ok(V.elAvisoDelPago("registrado", null));
  assert.match(V.elAvisoDelPago("pagado", "Básico"), /Básico/);
  const desde = new Date("2026-10-05T10:00:00Z");
  assert.ok(V.esElProspecto({ notificationNumber: "+57 300 123 4567", createdAt: new Date("2026-10-05T11:00:00Z") }, "573001234567", desde));
  assert.ok(!V.esElProspecto({ notificationNumber: "573001234567", createdAt: new Date("2026-10-04T11:00:00Z") }, "573001234567", desde));
});

test("sala: agenda, notas, novedades y vistas con la firma", { skip: MODO !== "bueno" }, () => {
  const sala = sinComentarios(salaDe(null));
  assert.match(sala, /\/api\/videollamada\/agendar\?\$\{consulta\}/);
  assert.match(sala, /\/api\/videollamada\/novedades\?\$\{consulta\}/);
  assert.match(sala, /NOVEDADES_CADA_MS/);
  assert.match(sala, /data-zona="notas"/);
  assert.match(sala, /VISTAS_DE_LA_SALA/);
  for (const r of ["agendar", "novedades"]) {
    assert.match(readFileSync(`app/api/videollamada/${r}/route.ts`, "utf8"), /esLaFirmaDeLaCita/);
  }
  for (const v of ["ficha", "resultados"]) {
    const p = readFileSync(`app/videollamada/vista/${v}/page.tsx`, "utf8");
    assert.match(p, /esLaFirmaDeLaCita/);
    assert.match(p, /index: false/);
  }
});

// ── El inicio de la llamada y el CRM real como pizarra (vuelta del 2026-10-05, 2) ──
// El «antes» va PINCHADO a 3d2ff75: allí Verzy no saludaba primero ni había CRM.
const ANTES_CRM = process.env.ANTES_CRM_REF ?? "3d2ff75";
const C = MODO === "bueno" ? await import("./.compilado/videollamada-crm.js") : null;

test("crm: antes no había saludo inicial, ni CRM, ni notas junto al CRM", { skip: MODO !== "roto" }, () => {
  for (const r of ["lib/videollamada-crm.ts", "lib/videollamada-crm.server.ts", "app/videollamada/vista/crm/page.tsx"]) {
    assert.equal(existiaEn(ANTES_CRM, r), false, `${r} no existía antes`);
  }
  assert.doesNotMatch(execSync(`git show ${ANTES_CRM}:lib/videollamada-ia.server.ts`, { encoding: "utf8" }), /custom_greeting/);
  const sala = salaDe(ANTES_CRM);
  assert.match(sala, /!pagina && notas\.length > 0/, "las notas salían sueltas, sin el CRM");
});

test("crm: la cuenta de Verzy se reconoce por su nombre, de cualquier forma", { skip: MODO !== "bueno" }, () => {
  for (const n of ["Verzay Ventas", "Verzay | Ventas", "verzay-ventas", "VERZAY  VENTAS"]) assert.ok(C.esLaCuentaDeVerzy(n), n);
  for (const n of ["Verzay | Atencion", "Ventas", null, ""]) assert.ok(!C.esLaCuentaDeVerzy(n), String(n));
});

test("crm: la ruta del CRM con o sin ancla, y nada más", { skip: MODO !== "bueno" }, () => {
  assert.ok(C.esLaVistaDelCrm("/videollamada/vista/crm"));
  assert.ok(C.esLaVistaDelCrm("/videollamada/vista/crm?c=1&f=x#embudo"));
  assert.ok(!C.esLaVistaDelCrm("/videollamada/vista/ficha"));
  assert.ok(!C.esLaVistaDelCrm(null));
});

test("crm: la conversación en orden, sin vacíos ni repetidos, con tope", { skip: MODO !== "bueno" }, () => {
  const filas = [
    { messageId: "b", fromMe: true, content: "Hola, ¿en qué te ayudo?", messageTimestamp: 2000 },
    { messageId: "a", fromMe: false, content: "Quiero info", messageTimestamp: 1000 },
    { messageId: "a", fromMe: false, content: "Quiero info", messageTimestamp: 1000 },
    { messageId: "c", fromMe: false, content: "  ", messageTimestamp: 3000 },
    { messageId: "d", fromMe: false, content: "Gracias", messageTimestamp: 4000000000000 },
  ];
  const c = C.laConversacionDelCrm(filas);
  assert.deepEqual(c.map((m) => m.texto), ["Quiero info", "Hola, ¿en qué te ayudo?", "Gracias"]);
  assert.equal(c[0].deQuien, "cliente");
  assert.equal(c[2].cuando, 4000000000, "milisegundos a segundos");
  assert.equal(C.laConversacionDelCrm(filas, 1).length, 1);
});

test("inicio: saluda primero, después la pregunta, y solo después la pizarra", { skip: MODO !== "bueno" }, () => {
  assert.equal(C.SALUDO_INICIAL, "Hola, muy buenas, ¿me escuchas?");
  assert.match(readFileSync("lib/videollamada-ia.server.ts", "utf8"), /custom_greeting = SALUDO_INICIAL/);
  const g = P.elBloqueDelGuion("lunes 5 de octubre de 2026, 10:00");
  const iSaludo = g.indexOf(C.SALUDO_INICIAL), iPregunta = g.indexOf(C.SEGUNDA_PREGUNTA), iCrm = g.indexOf("crm");
  assert.ok(iSaludo >= 0 && iPregunta > iSaludo && iCrm > iPregunta, "el orden del guion");
  for (const s of C.SECCIONES_DEL_CRM) {
    const p = P.PAGINAS_DEL_AVATAR.find((x) => x.clave === s.clave);
    assert.ok(p, `${s.clave} es una página del avatar`);
    assert.ok(C.esLaVistaDelCrm(p.ruta));
  }
});

test("sala: las notas van al lado del CRM, no sueltas", { skip: MODO !== "bueno" }, () => {
  const sala = sinComentarios(salaDe(null));
  assert.match(sala, /esLaVistaDelCrm\(pagina\.ruta\)/);
  assert.doesNotMatch(sala, /!pagina && notas\.length > 0/);
  const p = readFileSync("app/videollamada/vista/crm/page.tsx", "utf8");
  assert.match(p, /esLaFirmaDeLaCita/);
  assert.match(p, /index: false/);
  assert.match(readFileSync("lib/videollamada-crm.server.ts", "utf8"), /server-only/);
});
