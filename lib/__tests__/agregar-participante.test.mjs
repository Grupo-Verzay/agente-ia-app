// Banco de la acción de flujo «Agregar participante».
// MODO=roto lee los ficheros de ANTES_REF y AFIRMA que no existía.
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const ROTO = process.env.MODO === "roto";
const REF = process.env.ANTES_REF || "a3c678e";
const leer = (f) =>
  ROTO ? execSync(`git show ${REF}:"${f}"`, { encoding: "utf8" }) : readFileSync(f, "utf8");

const casos = [];
const caso = (n, f) => casos.push([n, f]);

const NODOS = leer("lib/workflow-automation-nodes.ts");
const TIPOS = leer("types/workflow-node.ts");
const FEAT = leer("lib/workflow-features.ts");
const GUIA = leer("lib/guia-flujos.ts");
const ESQ = leer("prisma/schema.prisma");
const CONF = leer("app/(root)/workflow/[workflowId]/_components/AutomationNodeConfig.tsx");

const tiene = {
  motor: /"add-participant":\s*"ADD_PARTICIPANT"/.test(NODOS),
  mapa: /["']?add-participant["']?\s*:\s*["']ADD_PARTICIPANT["']/.test(TIPOS),
  paleta: /type:\s*"add-participant",\s*label:\s*"Agregar participante"/.test(TIPOS),
  tarjeta: (TIPOS.match(/"add-participant"/g) || []).length >= 4,
  plan: /key:\s*"add-participant",\s*label:\s*"Agregar participante"/.test(FEAT),
  guia: /"Agregar participante"/.test(GUIA),
  enum: /enum StageActionType\s*\{[^}]*ADD_PARTICIPANT/.test(ESQ),
  selector: /case 'add-participant':/.test(CONF) && /tipo === 'add-participant' \|\|/.test(CONF),
};

if (ROTO) {
  caso("antes no existía la acción en ningún sitio", () => {
    for (const [k, v] of Object.entries(tiene)) assert.equal(v, false, `ya estaba: ${k}`);
  });
} else {
  for (const [k, v] of Object.entries(tiene)) caso(`está en ${k}`, () => assert.equal(v, true));
  caso("va justo detrás de Asignar asesor en la paleta", () => {
    const i = TIPOS.indexOf('type: "assign-advisor"');
    const j = TIPOS.indexOf('type: "add-participant"');
    assert.ok(i > -1 && j > i, "orden");
  });
  caso("comparte el selector de asesor con Asignar asesor", () => {
    assert.match(CONF, /case 'assign-advisor':\s*case 'add-participant':/);
  });
  caso("lanzado a mano, pide ADD_PARTICIPANT al motor con el asesor", async () => {
    const m = await import(process.env.NODOS_COMPILADO);
    let cuerpo = null;
    globalThis.fetch = async (url, init) => { cuerpo = { url, ...JSON.parse(init.body) }; return { ok: true }; };
    process.env.BACKEND_URL = "http://motor";
    assert.equal(m.esNodoDeAutomatizacion("add-participant"), true);
    const ok = await m.ejecutarNodoDeAutomatizacion({
      tipo: "add-participant", message: JSON.stringify({ advisorId: "a1" }),
      userId: "u", remoteJid: "57@s.whatsapp.net", instanceName: "L",
    });
    assert.equal(ok, true);
    assert.equal(cuerpo.url, "http://motor/stage-actions/run");
    assert.equal(cuerpo.type, "ADD_PARTICIPANT");
    assert.deepEqual(cuerpo.config, { advisorId: "a1" });
    assert.equal(cuerpo.sessionId, 7);
  });
}

let mal = 0;
for (const [n, f] of casos) {
  try { await f(); console.log(`ok  ${n}`); } catch (e) { mal++; console.log(`MAL ${n}: ${e.message}`); }
}
console.log(`\n${casos.length - mal} ok, ${mal} MAL`);
process.exit(mal ? 1 : 0);
