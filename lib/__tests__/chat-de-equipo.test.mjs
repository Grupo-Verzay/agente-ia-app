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
  quienFirma,
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

/* -------------------------------------------------------------------------
 * Quien FIRMA el mensaje.
 *
 * El invariante, en una linea: **firma la PERSONA, el hilo es de la CUENTA.**
 *
 * `currentUser()` devuelve la fila de la cuenta EFECTIVA, asi que dentro de
 * una cuenta ajena por «Ingresar» lo que hay delante es el nombre del cliente.
 * Firmar con eso deja el equipo sin saber quien hablo, que es justo lo que un
 * chat de equipo viene a decir.
 * ---------------------------------------------------------------------- */

test("el dueno de la cuenta: persona y cuenta son el mismo", () => {
  const f = quienFirma({ id: "duenio", name: "Grupo Verzay", sessionUserId: "duenio" });
  assert.deepEqual(f, {
    personaId: "duenio", nombre: "Grupo Verzay",
    cuentaId: "duenio", escritoDesde: null,
  });
});

test("alguien del equipo: firma el, el hilo es de su cuenta", () => {
  const f = quienFirma({
    id: "yair", name: "Yair", ownerId: "duenio", sessionUserId: "yair",
    nombreDeLaPersona: "Yair",
  });
  assert.equal(f.personaId, "yair");
  assert.equal(f.nombre, "Yair");
  assert.equal(f.cuentaId, "duenio");
  assert.equal(f.escritoDesde, null);
});

test("EL CASO: por «Ingresar» firma la persona real, no la cuenta en la que esta", () => {
  const f = quienFirma({
    id: "cliente", name: "Distribuidora Pacifico",  // la fila EFECTIVA
    sessionUserId: "carlos", nombreDeLaPersona: "Carlos",
    porImpersonacion: true,
  });
  assert.equal(f.personaId, "carlos");
  assert.equal(f.nombre, "Carlos");
  assert.notEqual(f.nombre, "Distribuidora Pacifico");
  // El hilo sigue siendo el del cliente: se entro a ver lo suyo.
  assert.equal(f.cuentaId, "cliente");
  assert.equal(f.escritoDesde, "cliente");
});

test("el conmutador de cuentas tambien firma la persona, y sin «escritoDesde»", () => {
  const f = quienFirma({
    id: "atencion", name: "Verzay | Atencion",
    sessionUserId: "carlos", nombreDeLaPersona: "Carlos",
    porImpersonacion: false,
  });
  assert.equal(f.personaId, "carlos");
  assert.equal(f.nombre, "Carlos");
  assert.equal(f.cuentaId, "atencion");
  // No es una cuenta ajena: es una suya. Anotarlo seria ruido en cada fila.
  assert.equal(f.escritoDesde, null);
});

test("sin nombre de la persona NO se toma prestado el de la cuenta", () => {
  const f = quienFirma({
    id: "cliente", name: "Distribuidora Pacifico",
    sessionUserId: "carlos", nombreDeLaPersona: "   ",
    porImpersonacion: true,
  });
  assert.equal(f.personaId, "carlos");
  assert.equal(f.nombre, null);
});

test("sin id no hay firma", () => {
  assert.equal(quienFirma({ id: "" }), null);
  assert.equal(quienFirma({ id: "   " }), null);
  assert.equal(quienFirma({}), null);
});
