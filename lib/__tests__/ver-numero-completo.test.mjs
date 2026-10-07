// «Ver número» por agente: la regla pura del tapado y un barrido del código.
// MODO=roto lee los ficheros de ANTES_REF y afirma que no existía.
import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const ROTO = process.env.MODO === "roto";
const ANTES = process.env.ANTES_REF || "4c84c02";
const leer = (f) =>
  ROTO
    ? (() => { try { return execSync(`git show ${ANTES}:"${f}"`, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }); } catch { return ""; } })()
    : readFileSync(f, "utf8");

const r = ROTO ? null : await import("./.compilado/ver-numero/telefono-visible.js");
const t = ROTO ? test.skip : test;
const JID = "573001234567@s.whatsapp.net";

t("un agente sin permiso ve los cuatro últimos tapados", () => {
  const v = r.telefonoParaMostrar(JID, "agente");
  assert.ok(!v.includes("4567"), v);
  assert.equal(r.puedeVerTelefonoCompleto("agente"), false);
  assert.equal(r.puedeVerTelefonoCompleto("agente", false), false);
});

t("un agente con el interruptor encendido ve el número completo", () => {
  assert.equal(r.puedeVerTelefonoCompleto("agente", true), true);
  assert.ok(r.telefonoParaMostrar(JID, "agente", true).includes("4567"));
});

t("administrador y dueño lo ven completo, como siempre", () => {
  assert.ok(r.telefonoParaMostrar(JID, "administrador").includes("4567"));
  assert.ok(r.telefonoParaMostrar(JID, null).includes("4567"));
});

// ── barrido ──
const SITIOS = [
  ["actions/team-actions.ts", "toggleAdvisorVerNumero"],
  ["app/(root)/equipo/_components/team-client.tsx", "toggleAdvisorVerNumero"],
  ["app/(root)/equipo/_components/team-client.tsx", 'data-columna="ver-numero"'],
  ["app/(root)/chats/page.tsx", "veElNumeroCompleto"],
  ["app/(root)/chats/_components/chat-sidebar.tsx", "verNumeroCompleto"],
  ["app/(root)/chats/_components/chat-main.tsx", "verNumeroCompleto"],
  ["app/(root)/chats/_components/NewConversationDialog.tsx", "verNumeroCompleto"],
  ["lib/telefono-visible.ts", "verNumeroCompleto"],
];
for (const [f, nombre] of SITIOS) {
  test(`${ROTO ? "ANTES no" : "sí"}: ${f} usa ${nombre}`, () => {
    const hay = leer(f).includes(nombre);
    assert.equal(hay, !ROTO);
  });
}

test(`${ROTO ? "ANTES no" : "sí"}: existe la tabla asesor_ver_numero`, () => {
  assert.equal(leer("lib/ver-numero-completo-db.ts").includes("asesor_ver_numero"), !ROTO);
});
