// La videollamada con IA de Verzay (Tavus): las reglas puras.
// Se compila `lib/videollamada-ia.ts` con esbuild (lo hace el script del banco).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
    assert.match(pagina, /<SalaDeLaVideollamada url=/);
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
