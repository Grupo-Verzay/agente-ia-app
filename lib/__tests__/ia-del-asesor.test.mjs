// Interruptores «Sesión» y «Agente» por asesor: la regla pura y un barrido.
// MODO=roto lee los ficheros de ANTES_REF y afirma que no existía nada.
import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const ROTO = process.env.MODO === "roto";
const ANTES = process.env.ANTES_REF || "7d3709d";
const leer = (f) =>
  ROTO
    ? (() => { try { return execSync(`git show ${ANTES}:${f}`, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }); } catch { return ""; } })()
    : readFileSync(f, "utf8");

const r = ROTO ? null : await import("./.compilado/ia-asesor/ia-del-asesor.js");
const t = ROTO ? test.skip : test;

const ENC = { status: true, agentDisabled: false, aiOptIn: true };
const NADA = { sesionApagada: false, agenteApagado: false };

t("de fábrica los dos encendidos, y solo un true explícito apaga", () => {
  assert.deepEqual(r.AJUSTES_DE_FABRICA, NADA);
  assert.deepEqual(r.comoAjustes({ sesionApagada: "true", agenteApagado: 1 }), NADA);
  assert.deepEqual(r.comoAjustes(null), NADA);
  assert.deepEqual(r.comoAjustes({ sesionApagada: true, agenteApagado: true }), { sesionApagada: true, agenteApagado: true });
});

t("sesión apagada: pausa y marca; encendida: devuelve y quita la marca", () => {
  const a = r.queHacerAlAsignar(ENC, null, { sesionApagada: true, agenteApagado: false });
  assert.deepEqual(a.datos, { status: false });
  assert.equal(a.marca.apagoSesion, true);
  const b = r.queHacerAlAsignar({ ...ENC, status: false }, a.marca, NADA);
  assert.deepEqual(b.datos, { status: true });
  assert.equal(b.marca, null);
});

t("lo pausado a mano no se marca y al encender no se toca", () => {
  const a = r.queHacerAlAsignar({ ...ENC, status: false }, null, { sesionApagada: true, agenteApagado: false });
  assert.deepEqual(a.datos, {});
  assert.equal(a.marca, null);
  const b = r.queHacerAlAsignar({ ...ENC, status: false }, null, NADA);
  assert.deepEqual(b.datos, {});
});

t("agente apagado: agentDisabled y aiOptIn falso; al encender aiOptIn vuelve como estaba", () => {
  for (const antes of [true, false]) {
    const a = r.queHacerAlAsignar({ ...ENC, aiOptIn: antes }, null, { sesionApagada: false, agenteApagado: true });
    assert.deepEqual(a.datos, { agentDisabled: true, aiOptIn: false });
    assert.equal(a.marca.aiOptInAntes, antes);
    const b = r.queHacerAlAsignar({ status: true, agentDisabled: true, aiOptIn: false }, a.marca, NADA);
    assert.deepEqual(b.datos, { agentDisabled: false, aiOptIn: antes });
    assert.equal(b.marca, null);
  }
  const mano = r.queHacerAlAsignar({ ...ENC, agentDisabled: true }, null, { sesionApagada: false, agenteApagado: true });
  assert.deepEqual(mano.datos, {});
});

t("volver a aplicar con el interruptor apagado no cambia nada", () => {
  const a = r.queHacerAlAsignar(ENC, null, { sesionApagada: true, agenteApagado: true });
  const b = r.queHacerAlAsignar({ status: false, agentDisabled: true, aiOptIn: false }, a.marca, { sesionApagada: true, agenteApagado: true });
  assert.deepEqual(b.datos, {});
  assert.deepEqual(b.marca, a.marca);
});

t("la regla es la MISMA en el motor (byte a byte)", (ctx) => {
  const otra = "/home/user/api-webhook/src/modules/webhook/services/auto-assign/ia-del-asesor.ts";
  if (!existsSync(otra)) return ctx.skip("el motor no está al lado");
  assert.equal(readFileSync(otra, "utf8"), readFileSync("lib/ia-del-asesor.ts", "utf8"));
});

// ── barrido: los caminos pasan por la regla ──
const SITIOS = [
  ["actions/team-actions.ts", "toggleAdvisorIa"],
  ["actions/advisor-assign-actions.ts", "aplicarALasConversaciones"],
  ["lib/chat-persistence.ts", "laSesionLaPausoSuAsesor"],
  ["actions/session-action.ts", "olvidarLaMarca"],
  ["app/(root)/equipo/_components/team-client.tsx", "toggleAdvisorIa"],
];

for (const [f, nombre] of SITIOS) {
  test(`${ROTO ? "ANTES no tenía" : "tiene"} ${nombre} en ${f}`, () => {
    const texto = leer(f);
    assert.ok(texto.length > 0 || ROTO, `no se pudo leer ${f}`);
    assert.equal(texto.includes(nombre), !ROTO);
  });
}
