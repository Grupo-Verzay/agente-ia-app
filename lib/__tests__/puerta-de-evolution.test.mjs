// La puerta del administrador de Evolution: /evo y Panel › Evo deciden igual,
// con la SESIÓN (el rol de la cuenta que manda), nunca con el rol de la persona.
//
// MODO=roto lee /evo de ANTES_REF con `git show` y AFIRMA el fallo: preguntaba
// `isAdminLike(user.role)`, así que el administrador del equipo —rol `user`—
// no pasaba aunque Panel › Evo le abriera.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { puedeAdministrarEvolution } from "./.compilado/puerta-de-evolution.js";

const MODO = process.env.MODO ?? "bueno";
const ANTES_REF = process.env.ANTES_REF ?? "16e81b7";

const EVO = "app/(root)/evo/page.tsx";
const PANEL = "app/(root)/(protected)/panel/evo/page.tsx";
const ACCION = "actions/evo-instance-admin-action.ts";

// Los casos: persona (lo que trae la sesión) y el rol de la cuenta que manda.
const administradorDelEquipo = { role: "user", rolDeLaPersona: "user" };
const casos = [
  ["dueño admin", { role: "admin", rolDeLaPersona: "admin" }, "admin", true],
  ["administrador del equipo de una cuenta admin", administradorDelEquipo, "admin", true],
  ["agente del equipo (no hereda)", { role: "user", rolDeLaPersona: "user" }, "user", false],
  ["cliente", { role: "user", rolDeLaPersona: "user" }, "user", false],
  ["reseller", { role: "reseller", rolDeLaPersona: "reseller" }, "reseller", false],
  ["super admin con el conmutador en una cuenta cliente", { role: "user", rolDeLaPersona: "super_admin" }, "user", true],
  ["super admin DENTRO de un cliente con «Ingresar»", { role: "user", rolDeLaPersona: "super_admin", porImpersonacion: true }, "user", false],
];

if (MODO !== "roto") {
  for (const [nombre, persona, rolCuenta, esperado] of casos) {
    test(`la decisión: ${nombre}`, () => {
      assert.equal(puedeAdministrarEvolution(persona, rolCuenta), esperado);
    });
  }

  test("sin sesión no pasa", () => {
    assert.equal(puedeAdministrarEvolution(null, "admin"), false);
  });

  test("las dos pantallas y la acción usan la MISMA puerta, y ninguna mira user.role", () => {
    for (const f of [EVO, PANEL, ACCION]) {
      const src = readFileSync(f, "utf8");
      assert.match(src, /laSesionAdministraEvolution\(user\)/, `${f} no pasa por la puerta común`);
      assert.doesNotMatch(src, /isAdminLike\(user\.role\)/, `${f} vuelve a preguntar por la persona`);
    }
  });

  test("las dos pantallas dicen por qué no se pasa", () => {
    for (const f of [EVO, PANEL]) {
      assert.match(readFileSync(f, "utf8"), /detalle=\{MOTIVO_SIN_EVOLUTION\}/);
    }
  });
} else {
  test(`ROTO (${ANTES_REF}): /evo preguntaba por la PERSONA y el administrador del equipo no pasaba`, () => {
    const antes = execSync(`git show ${ANTES_REF}:"${EVO}"`, { encoding: "utf8" });
    assert.match(antes, /isAdminLike\(user\.role\)/);
    // Lo que esa condición contesta para el administrador del equipo:
    const rolDeLaPersona = administradorDelEquipo.role;
    assert.equal(["admin", "super_admin"].includes(rolDeLaPersona), false);
    // …mientras Panel › Evo, en el mismo commit, ya le abría por la cuenta:
    const panelAntes = execSync(`git show ${ANTES_REF}:"${PANEL}"`, { encoding: "utf8" });
    assert.match(panelAntes, /cuentaQueManda/);
    assert.doesNotMatch(antes, /cuentaQueManda|laSesionAdministraEvolution/);
  });
}
