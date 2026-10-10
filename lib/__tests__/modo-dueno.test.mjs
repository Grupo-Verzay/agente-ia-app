/**
 * Modo Dueño, Fase 0: las reglas puras y un barrido del código.
 *
 * - `queDiceLaRespuesta`: un «sí» tiene que ser SOLO un sí.
 * - `elNumeroEsDelDueno`: otro país con la misma cola no es el dueño, y la
 *   copia del motor es byte a byte la misma.
 * - Barrido: ninguna ruta `/api/owner/*` ejecuta una acción (todas preparan o
 *   consultan por el motor) y escribir el historial ya no es un POST del
 *   navegador.
 *
 * `MODO=roto` lee los MISMOS ficheros del commit de antes (`ANTES_REF`) y
 * afirma los huecos.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROTO = process.env.MODO === "roto";
const ANTES_REF = process.env.ANTES_REF || "2f3633e";
const t = ROTO ? test.skip : test;
const antes = ROTO ? test : test.skip;

const leer = (f) =>
  ROTO ? execSync(`git show ${ANTES_REF}:${f}`, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }) : readFileSync(f, "utf8");

const puras = ROTO ? null : await import("./.compilado/modo-dueno/puras.js");

t("un «sí» es SOLO un sí", () => {
  const { queDiceLaRespuesta: q } = puras;
  for (const si of ["sí", "Si", "SÍ!", "dale", "ok", "Sí, dale.", "sí por favor", "confirmo", "de una", "está bien", "👍", "✅"]) {
    assert.equal(q(si), "si", si);
  }
  for (const no of ["no", "No, gracias", "cancela", "mejor no", "déjalo", "❌"]) {
    assert.equal(q(no), "no", no);
  }
  for (const otra of [
    "ok pero a otro número",
    "sí, pero a otro número",
    "sí, al 3001112233",
    "dale, y también mándale a Pedro",
    "sí para mañana",
    "no, a Pedro",
    "hola",
    "",
    "sí no",
  ]) {
    assert.equal(q(otra), "otra", otra);
  }
});

t("otro país con la misma cola NO es el dueño", () => {
  const { elNumeroEsDelDueno: e } = puras;
  assert.equal(e("573001234567", "573001234567"), true);
  assert.equal(e("573001234567", "3001234567"), true, "guardado sin código de país");
  assert.equal(e("5213312345678", "523312345678"), true, "México con el 1");
  assert.equal(e("523001234567", "573001234567"), false, "México ≠ Colombia");
  assert.equal(e("13001234567", "573001234567"), false);
  assert.equal(e("1234567", "1234567"), false, "un número de siete cifras no identifica a nadie");
});

t("la regla de identidad es la MISMA en el motor (byte a byte)", (ctx) => {
  const otra = "/home/user/api-webhook/src/utils/identidad-del-dueno.ts";
  if (!existsSync(otra)) return ctx.skip("el motor no está al lado");
  assert.equal(readFileSync(otra, "utf8"), readFileSync("lib/identidad-del-dueno.ts", "utf8"));
});

// ── Barrido ─────────────────────────────────────────────────────────────────

function rutas(dir) {
  const out = [];
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) out.push(...rutas(p));
    else if (n === "route.ts") out.push(p);
  }
  return out;
}

const EJECUTAN = [
  "createOwnerTask",
  "sendOwnerMessage",
  "moveOwnerLeadStatus",
  "tagOwnerContact",
  "assignOwnerAdvisor",
  "appendOwnerTrainingInstruction",
  "updateOwnerTrainingInstruction",
  "deleteOwnerTrainingInstruction",
  "restoreOwnerTraining",
];
const POR_SU_CUENTA = ["app/api/owner/sync-contact/route.ts", "app/api/owner/turn/route.ts", "app/api/owner/identity/lid/route.ts"];

t("ninguna ruta /api/owner ejecuta: todas consultan o PREPARAN por el motor", () => {
  for (const f of rutas("app/api/owner")) {
    const s = readFileSync(f, "utf8");
    for (const fn of EJECUTAN) assert.ok(!s.includes(fn), `${f} llama a ${fn}`);
    if (POR_SU_CUENTA.includes(f)) continue;
    assert.ok(/rutaDeAccion|rutaDeConsulta/.test(s), `${f} no pasa por el motor`);
  }
});

antes("ANTES: las rutas ejecutaban al pedirlas (la tarea, sin ni siquiera `confirmed`)", () => {
  const tarea = leer("app/api/owner/task/route.ts");
  assert.ok(tarea.includes("createOwnerTask"));
  assert.ok(!tarea.includes("confirmed"));
  assert.ok(leer("app/api/owner/message/route.ts").includes("sendOwnerMessage"));
});

t("escribir el historial ya no es un POST del navegador", () => {
  const acc = readFileSync("actions/audit-log-actions.ts", "utf8");
  assert.ok(acc.startsWith('"use server"'));
  assert.ok(!/export async function writeAuditLog/.test(acc));
  const lib = readFileSync("lib/registro-de-cambios.server.ts", "utf8");
  assert.ok(lib.startsWith('import "server-only"'));
  assert.ok(/export async function writeAuditLog/.test(lib));
  const usos = execSync(`grep -rln "writeAuditLog" actions lib app components --include=*.ts --include=*.tsx`, { encoding: "utf8" })
    .split("\n")
    .filter(Boolean);
  for (const f of usos) {
    const s = readFileSync(f, "utf8");
    assert.ok(!/import \{[^}]*writeAuditLog[^}]*\} from ["'](@\/actions\/|\.\/)audit-log-actions["']/.test(s), `${f} lo importa de la acción`);
  }
});

antes("ANTES: writeAuditLog se exportaba desde un fichero «use server»", () => {
  const acc = leer("actions/audit-log-actions.ts");
  assert.ok(acc.startsWith('"use server"'));
  assert.ok(/export async function writeAuditLog/.test(acc));
});

t("el Modo Dueño de una cuenta lo toca solo quien la alcanza (la puerta de siempre)", () => {
  const s = readFileSync("actions/owner-mode-actions.ts", "utf8");
  assert.ok(s.includes("assertCanAccessTargetUser"));
  assert.ok(!s.includes("isAdminLike"));
});

antes("ANTES: ser admin o reseller bastaba para tocar el Modo Dueño de CUALQUIER cuenta", () => {
  assert.ok(leer("actions/owner-mode-actions.ts").includes("isAdminLike"));
});
