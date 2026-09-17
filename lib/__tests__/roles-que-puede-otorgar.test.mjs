/**
 * El invariante que este banco protege, en una linea:
 *
 *   **Nadie otorga un rol igual o superior al suyo.**
 *
 * De donde sale: en Panel > Clientes el desplegable listaba los CINCO roles a
 * cualquiera, y la accion que guarda copiaba el `role` del formulario tal cual.
 * Un `admin` podia ponerle «Super administrador» a cualquier cuenta —la suya
 * incluida— y nadie lo comprobaba.
 *
 * Los tres casos que el encargo pedia estan aqui y en el banco de al lado
 * (`quien-manda-en-un-cliente`): un administrador intentando asignar
 * «Administrador», el mismo intentando «Super administrador», y una cuenta
 * vinculada intentando editar a su duena.
 *
 * Para compilar lo que este fichero importa, ver la cabecera de
 * `quien-manda-en-un-cliente.test.mjs`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  JERARQUIA_DE_ROLES,
  esRolDePlataforma,
  porQueNoPuedeOtorgarlo,
  puedeCambiarElRol,
  puedeOtorgarElRol,
  rolQueReparte,
  rolesQuePuedeOtorgar,
} from "./.compilado/roles-que-puede-otorgar.js";

test("la jerarquia va de menos a mas, y es la del enum de la base", () => {
  assert.deepEqual([...JERARQUIA_DE_ROLES], [
    "user", "affiliate", "reseller", "admin", "super_admin",
  ]);
});

test("un admin reparte hasta reseller, y NO admin ni super_admin", () => {
  assert.deepEqual(rolesQuePuedeOtorgar("admin"), ["user", "affiliate", "reseller"]);
});

test("EL CASO: un administrador intentando asignar «Administrador» se rechaza", () => {
  assert.equal(puedeOtorgarElRol("admin", "admin"), false);
  assert.equal(puedeCambiarElRol("admin", "user", "admin"), false);
});

test("EL CASO: un administrador intentando asignar «Super administrador» se rechaza", () => {
  assert.equal(puedeOtorgarElRol("admin", "super_admin"), false);
  assert.equal(puedeCambiarElRol("admin", "user", "super_admin"), false);
});

test("y el motivo dice de quien es ese rol, no «no autorizado» a secas", () => {
  const motivo = porQueNoPuedeOtorgarlo("admin", "user", "super_admin");
  assert.match(motivo, /Super administrador/);
  assert.match(motivo, /súper administrador/);
});

test("la otra punta: un admin NO puede degradar a un super_admin", () => {
  // Es la escalada por el otro lado — quitarse de encima a quien manda es tan
  // bueno para el atacante como ascender el mismo.
  assert.equal(puedeCambiarElRol("admin", "super_admin", "user"), false);
  assert.equal(puedeCambiarElRol("admin", "admin", "user"), false);
});

test("lo que si puede: mover a un cliente entre los roles por debajo de el", () => {
  assert.equal(puedeCambiarElRol("admin", "user", "reseller"), true);
  assert.equal(puedeCambiarElRol("admin", "reseller", "user"), true);
});

test("un reseller llega hasta affiliate y nada mas", () => {
  assert.deepEqual(rolesQuePuedeOtorgar("reseller"), ["user", "affiliate"]);
  assert.equal(puedeCambiarElRol("reseller", "user", "reseller"), false);
});

test("un `user` no reparte ningun rol", () => {
  assert.deepEqual(rolesQuePuedeOtorgar("user"), []);
  assert.deepEqual(rolesQuePuedeOtorgar(""), []);
  assert.deepEqual(rolesQuePuedeOtorgar(null), []);
  assert.deepEqual(rolesQuePuedeOtorgar("inventado"), []);
});

test("el super admin es la excepcion, y tiene que serlo", () => {
  // Sin esta excepcion nadie podria crear otro super admin nunca.
  assert.deepEqual(rolesQuePuedeOtorgar("super_admin"), [...JERARQUIA_DE_ROLES]);
  assert.equal(puedeCambiarElRol("super_admin", "super_admin", "user"), true);
  assert.equal(puedeCambiarElRol("super_admin", "user", "super_admin"), true);
});

test("un rol inventado no pasa, ni como nuevo ni como actual", () => {
  assert.equal(esRolDePlataforma("dueño"), false);
  assert.equal(puedeOtorgarElRol("super_admin", "dueño"), false);
  assert.equal(puedeCambiarElRol("admin", "dueño", "user"), false);
});

test("rolQueReparte: el super admin de verdad reparte como tal en CUALQUIER cuenta", () => {
  // Metido en la cuenta de un cliente, `currentUser().role` es `user`; si se
  // decidiera con eso, no podria repartir ningun rol.
  assert.equal(rolQueReparte(true, "user"), "super_admin");
  assert.deepEqual(rolesQuePuedeOtorgar(rolQueReparte(true, "user")), [...JERARQUIA_DE_ROLES]);
});

test("rolQueReparte: los demas reparten con el rol de SU cuenta", () => {
  // El `administrador` de una cuenta reseller se crea con rol `user`; reparte
  // como reseller porque actua por la cuenta.
  assert.equal(rolQueReparte(false, "reseller"), "reseller");
  assert.equal(rolQueReparte(false, null), "");
});
