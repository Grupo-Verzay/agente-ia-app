/**
 * Banco de `esSuperAdminDeVerdad` y de `elPanelQueLeToca`.
 *
 *   npx tsc lib/super-admin-de-verdad.ts lib/sidebar-modules.ts --outDir ... (ver abajo)
 *   node --test lib/__tests__/super-admin-de-verdad.test.mjs
 *
 * Las dos son puras y son las que deciden el reparto entero, asi que se prueban
 * con los casos REALES de las dos cuentas: «Grupo Verzay» (super_admin) y
 * «Verzay | Atencion» (admin), en sus tres formas de entrar.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { esSuperAdminDeVerdad, esAdminDeVerdad } from "./.compilado/lib/super-admin-de-verdad.js";

// Las tres formas en que `currentUser()` arma la fila, con nombres reales.
const grupoVerzayEnSuCuenta = { role: "super_admin", rolDeLaPersona: "super_admin" };
// Conmutador de cuentas: la fila efectiva es la de Verzay | Atencion (admin),
// pero quien esta sentado delante es Grupo Verzay.
const grupoVerzayDentroDeAtencion = { role: "admin", rolDeLaPersona: "super_admin" };
// «Ingresar» a la cuenta de un cliente cualquiera.
const grupoVerzayDentroDeUnCliente = { role: "user", rolDeLaPersona: "super_admin" };
// Verzay | Atencion, de verdad, sin nadie por encima.
const atencionEnSuCuenta = { role: "admin", rolDeLaPersona: "admin" };
const unAgenteDeAtencion = { role: "admin", rolDeLaPersona: "user" };
const unClienteCualquiera = { role: "user", rolDeLaPersona: "user" };

test("Grupo Verzay es superadministrador en su cuenta y en cualquier otra", () => {
  assert.equal(esSuperAdminDeVerdad(grupoVerzayEnSuCuenta), true);
  // ESTE es el caso que estaba roto: dentro de otra cuenta, `role` decia admin.
  assert.equal(esSuperAdminDeVerdad(grupoVerzayDentroDeAtencion), true);
  assert.equal(esSuperAdminDeVerdad(grupoVerzayDentroDeUnCliente), true);
});

test("Verzay | Atencion NO se convierte en superadministrador", () => {
  assert.equal(esSuperAdminDeVerdad(atencionEnSuCuenta), false);
  assert.equal(esSuperAdminDeVerdad(unAgenteDeAtencion), false);
  assert.equal(esSuperAdminDeVerdad(unClienteCualquiera), false);
});

test("una cuenta super_admin a la que entra otro SI pasa: se miran los dos lados", () => {
  // Un admin que entra a la cuenta de superadministrador actua por ella.
  assert.equal(esSuperAdminDeVerdad({ role: "super_admin", rolDeLaPersona: "admin" }), true);
});

test("sin datos no se regala nada", () => {
  assert.equal(esSuperAdminDeVerdad(null), false);
  assert.equal(esSuperAdminDeVerdad(undefined), false);
  assert.equal(esSuperAdminDeVerdad({}), false);
  assert.equal(esSuperAdminDeVerdad({ role: null, rolDeLaPersona: null }), false);
  // Nada de coincidencias por parecido.
  assert.equal(esSuperAdminDeVerdad({ role: "superadmin" }), false);
  assert.equal(esSuperAdminDeVerdad({ role: "SUPER_ADMIN" }), false);
});

test("esAdminDeVerdad abarca admin y super_admin, y nada mas", () => {
  assert.equal(esAdminDeVerdad(atencionEnSuCuenta), true);
  assert.equal(esAdminDeVerdad(grupoVerzayDentroDeUnCliente), true);
  assert.equal(esAdminDeVerdad({ role: "reseller", rolDeLaPersona: "reseller" }), false);
  assert.equal(esAdminDeVerdad(unClienteCualquiera), false);
});
