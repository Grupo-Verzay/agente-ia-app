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
  llaveDelDirecto,
  ordenDeLosCanales,
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
