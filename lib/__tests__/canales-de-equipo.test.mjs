/**
 * Los canales del chat de equipo: quien lee, quien escribe y la pareja de un
 * directo.
 *
 * Los dos invariantes que este banco protege:
 *
 *   1. **El administrador LEE todo y no escribe en los directos de otros.**
 *      Leer es supervisar; escribir dentro de la conversacion de otros dos es
 *      suplantar, y ninguno de los dos lo esperaria.
 *   2. **La pareja de un directo esta ORDENADA.** Sin eso el directo de A con B
 *      y el de B con A son dos canales distintos, con la mitad de los mensajes
 *      en cada uno — que desde fuera se lee como «me escribio y no me llego».
 *
 * Como compilar lo que importa (sale en `.compilado/`, que esta en .gitignore):
 *
 *   npx tsc lib/canales-de-equipo.ts --outDir lib/__tests__/.compilado \
 *     --module es2022 --target es2022 --moduleResolution bundler --skipLibCheck
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  CANAL_GENERAL,
  TOPE_DEL_NOMBRE,
  canalDeLaFila,
  comoSeGuardaElNombre,
  cruzaCuentas,
  llaveDelDirecto,
  ordenDeLosCanales,
  perteneceAlCanal,
  puedeEscribirEnElCanal,
  puedeLeerElCanal,
} from "./.compilado/canales-de-equipo.js";

/* ── La pareja de un directo ─────────────────────────────────────────────── */

test("EL CASO: la pareja va ordenada, la abra quien la abra", () => {
  assert.equal(llaveDelDirecto("ana", "luis"), llaveDelDirecto("luis", "ana"));
  assert.equal(llaveDelDirecto("luis", "ana"), "ana::luis");
});

test("no hay directo con uno mismo, ni sin las dos partes", () => {
  assert.equal(llaveDelDirecto("ana", "ana"), null);
  assert.equal(llaveDelDirecto("ana", ""), null);
  assert.equal(llaveDelDirecto("", "luis"), null);
  assert.equal(llaveDelDirecto("ana", "   "), null);
});

/* ── Leer ────────────────────────────────────────────────────────────────── */

test("el general lo lee todo el mundo, sin mirar ninguna lista", () => {
  for (const manda of [true, false]) {
    assert.equal(puedeLeerElCanal({ tipo: "general", pertenece: false, manda }), true);
  }
});

test("un area la lee quien pertenece... y quien manda", () => {
  assert.equal(puedeLeerElCanal({ tipo: "area", pertenece: true, manda: false }), true);
  assert.equal(puedeLeerElCanal({ tipo: "area", pertenece: false, manda: false }), false);
  assert.equal(puedeLeerElCanal({ tipo: "area", pertenece: false, manda: true }), true);
});

test("EL CASO: quien manda lee TODOS los directos de su cuenta", () => {
  assert.equal(puedeLeerElCanal({ tipo: "directo", pertenece: false, manda: true }), true);
  // Y el agente, solo los suyos.
  assert.equal(puedeLeerElCanal({ tipo: "directo", pertenece: false, manda: false }), false);
  assert.equal(puedeLeerElCanal({ tipo: "directo", pertenece: true, manda: false }), true);
});

/* ── Escribir ────────────────────────────────────────────────────────────── */

test("EL CASO: leer un directo ajeno NO es poder escribir en el", () => {
  const ajeno = { tipo: "directo", pertenece: false, manda: true };
  assert.equal(puedeLeerElCanal(ajeno), true);
  assert.equal(puedeEscribirEnElCanal(ajeno), false);
});

test("en un area manda escribe aunque no pertenezca; el agente solo en las suyas", () => {
  assert.equal(puedeEscribirEnElCanal({ tipo: "area", pertenece: false, manda: true }), true);
  assert.equal(puedeEscribirEnElCanal({ tipo: "area", pertenece: false, manda: false }), false);
  assert.equal(puedeEscribirEnElCanal({ tipo: "area", pertenece: true, manda: false }), true);
});

test("en el general escribe cualquiera", () => {
  assert.equal(puedeEscribirEnElCanal({ tipo: "general", pertenece: false, manda: false }), true);
});

/* ── El general de las filas viejas ──────────────────────────────────────── */

test("un mensaje sin canal es del general: es lo que habia antes de los canales", () => {
  assert.equal(canalDeLaFila(null), CANAL_GENERAL);
  assert.equal(canalDeLaFila(undefined), CANAL_GENERAL);
  assert.equal(canalDeLaFila("   "), CANAL_GENERAL);
  assert.equal(canalDeLaFila("ventas"), "ventas");
});

/* ── El nombre ───────────────────────────────────────────────────────────── */

test("el nombre se limpia y se recorta", () => {
  assert.equal(comoSeGuardaElNombre("  ventas  "), "ventas");
  assert.equal(comoSeGuardaElNombre("dos   espacios"), "dos espacios");
  assert.equal(comoSeGuardaElNombre(null), "");
  assert.equal(comoSeGuardaElNombre("a".repeat(TOPE_DEL_NOMBRE + 20)).length, TOPE_DEL_NOMBRE);
});

/* ── El orden ────────────────────────────────────────────────────────────── */

test("el general va SIEMPRE el primero, aunque su nombre no lo ponga ahi", () => {
  const canal = (id, tipo, nombre) => ({
    id, tipo, nombre, conQuienId: null, pertenezco: true, puedoEscribir: true,
  });
  const lista = [
    canal("d1", "directo", "Ana"),
    canal("a1", "area", "Atencion"),
    canal("general", "general", "General"),
    canal("a2", "area", "Ventas"),
  ].sort(ordenDeLosCanales);

  assert.deepEqual(lista.map((c) => c.id), ["general", "a1", "a2", "d1"]);
});

/* -------------------------------------------------------------------------
 * La pertenencia POR CUENTA, que es lo que hace que un canal cruce.
 *
 * El invariante: **un canal con cuentas manda por cuenta.** Si la cuenta de
 * quien mira esta dentro, toda su gente esta dentro, sin que nadie la haya
 * anadido a mano — que es justo lo que la madre no puede hacer, porque no
 * administra el equipo de la cuenta vinculada.
 * ---------------------------------------------------------------------- */

test("EL CASO: si mi CUENTA esta dentro, yo estoy dentro", () => {
  assert.equal(
    perteneceAlCanal({ personas: [], cuentas: ["atencion"], yo: "yair", miCuenta: "atencion" }),
    true,
  );
});

test("...y si no esta, no — aunque el canal cruce otras cuentas", () => {
  assert.equal(
    perteneceAlCanal({ personas: [], cuentas: ["ventas"], yo: "yair", miCuenta: "atencion" }),
    false,
  );
});

test("un canal SIN cuentas sigue yendo por persona, como hasta ahora", () => {
  assert.equal(
    perteneceAlCanal({ personas: ["yair"], cuentas: [], yo: "yair", miCuenta: "atencion" }),
    true,
  );
  assert.equal(
    perteneceAlCanal({ personas: ["otro"], cuentas: [], yo: "yair", miCuenta: "atencion" }),
    false,
  );
});

test("se miran LAS DOS listas: un invitado suelto entra aunque su cuenta no este", () => {
  assert.equal(
    perteneceAlCanal({ personas: ["yair"], cuentas: ["ventas"], yo: "yair", miCuenta: "atencion" }),
    true,
  );
});

test("cruzar no es una marca aparte: lo dice tener cuentas", () => {
  assert.equal(cruzaCuentas({ cuentas: [] }), false);
  assert.equal(cruzaCuentas({ cuentas: ["atencion"] }), true);
});

test("y la pertenencia por cuenta pasa por las mismas reglas de leer y escribir", () => {
  const dentroPorCuenta = perteneceAlCanal({
    personas: [], cuentas: ["atencion"], yo: "yair", miCuenta: "atencion",
  });
  // Un agente de la cuenta vinculada participa: lee y escribe.
  assert.equal(puedeLeerElCanal({ tipo: "area", pertenece: dentroPorCuenta, manda: false }), true);
  assert.equal(puedeEscribirEnElCanal({ tipo: "area", pertenece: dentroPorCuenta, manda: false }), true);
});
