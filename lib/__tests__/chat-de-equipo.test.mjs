/**
 * El invariante que este banco protege, en una linea:
 *
 *   **La lista de gente manda, no el texto.**
 *
 * Una `@` en un correo no es una mencion. Si lo fuera, escribir «escribele a
 * hola@verzay.com» le saltaria la ventana que interrumpe a quien no toca — y
 * avisar de mas es exactamente lo que enseña a ignorar los avisos, que es el
 * fallo del que viene todo este asunto.
 *
 * Como compilar lo que importa (sale en `.compilado/`, que esta en .gitignore):
 *
 *   npx tsc lib/chat-de-equipo.ts --outDir lib/__tests__/.compilado \
 *     --module es2022 --target es2022 --moduleResolution bundler --skipLibCheck
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  TOPE_DEL_MENSAJE,
  comoSeGuardaElTexto,
  comoSeLlama,
  extraerMenciones,
} from "./.compilado/chat-de-equipo.js";

const EQUIPO = [
  { id: "ana", name: "Ana Gómez", email: "ana@verzay.com" },
  { id: "luis", name: "Luis", email: "luis@verzay.com" },
  { id: "sinNombre", name: null, email: "nuevo@verzay.com" },
];

test("menciona a quien esta en la lista", () => {
  assert.deepEqual(extraerMenciones("@Luis mira esto", EQUIPO), ["luis"]);
});

test("EL CASO: una arroba que no es de nadie NO es una mencion", () => {
  assert.deepEqual(extraerMenciones("escribele a hola@verzay.com", EQUIPO), []);
  assert.deepEqual(extraerMenciones("@Pedro no existe", EQUIPO), []);
});

test("...y un correo del equipo SI cuenta, porque asi sale quien no tiene nombre", () => {
  assert.deepEqual(extraerMenciones("@nuevo@verzay.com bienvenido", EQUIPO), ["sinNombre"]);
});

test("varios en el mismo mensaje, y cada uno una sola vez", () => {
  const quienes = extraerMenciones("@Luis y @Ana Gómez, y otra vez @Luis", EQUIPO);
  assert.deepEqual(quienes.sort(), ["ana", "luis"]);
});

test("un nombre de dos palabras se reconoce entero", () => {
  assert.deepEqual(extraerMenciones("hola @Ana Gómez", EQUIPO), ["ana"]);
  // Y el nombre a medias no: seria mencionar a alguien por parecido.
  assert.deepEqual(extraerMenciones("hola @Ana", EQUIPO), []);
});

test("sin arroba no se consulta a nadie", () => {
  assert.deepEqual(extraerMenciones("buenos dias equipo", EQUIPO), []);
  assert.deepEqual(extraerMenciones("", EQUIPO), []);
  assert.deepEqual(extraerMenciones("@Luis", []), []);
});

test("el texto se recorta al tope y sin espacios de sobra", () => {
  assert.equal(comoSeGuardaElTexto("   hola   "), "hola");
  assert.equal(comoSeGuardaElTexto(null), "");
  assert.equal(comoSeGuardaElTexto(undefined), "");
  assert.equal(comoSeGuardaElTexto("a".repeat(TOPE_DEL_MENSAJE + 500)).length, TOPE_DEL_MENSAJE);
});

test("quien no tiene nombre se llama por su correo", () => {
  assert.equal(comoSeLlama(EQUIPO[0]), "Ana Gómez");
  assert.equal(comoSeLlama(EQUIPO[2]), "nuevo@verzay.com");
  assert.equal(comoSeLlama({ id: "x", name: "   ", email: "x@y.com" }), "x@y.com");
});
