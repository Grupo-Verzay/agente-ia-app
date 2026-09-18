/**
 * El selector de menciones y la lista de directos: las dos mitades del fallo
 * de produccion de esta vuelta.
 *
 * Los tres invariantes que este banco protege:
 *
 *   1. **El selector ofrece lo mismo que el servidor mencionaria.** La arroba
 *      tiene que abrir palabra — la MISMA condicion que `extraerMenciones`
 *      aplica al leer. Si las dos no estuvieran de acuerdo, la lista ofreceria
 *      a alguien que luego no se menciona: el texto sale, nadie recibe nada, y
 *      no hay ningun error que mirar.
 *   2. **Se escribe el nombre EXACTO.** Es la forma que el servidor reconoce.
 *      Y con un espacio detras: sin el, lo siguiente que se teclee se pega al
 *      nombre y deja de ser una mencion.
 *   3. **Un directo es entre PERSONAS.** En la lista salian «Verzay |
 *      Atencion» y «Verzay Ventas», que son lineas. Pero la cuenta RAIZ si es
 *      gente: es el inicio de sesion del dueño, y sin esa mitad nadie del
 *      equipo podria escribirle al jefe.
 *
 * Como compilar lo que importa (sale en `.compilado/`, que esta en .gitignore):
 *
 *   npx tsc lib/chat-de-equipo.ts lib/canales-de-equipo.ts \
 *     --outDir lib/__tests__/.compilado \
 *     --module es2022 --target es2022 --moduleResolution bundler --skipLibCheck
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  TOPE_DE_LO_QUE_SE_BUSCA,
  aQuienSeOfrece,
  extraerMenciones,
  laArrobaQueSeEscribe,
  ponerLaMencion,
} from "./.compilado/chat-de-equipo.js";
import { soloLasPersonas } from "./.compilado/canales-de-equipo.js";

const EQUIPO = [
  { id: "yair", name: "Yair Silvera", email: "yair@verzay.com" },
  { id: "sofia", name: "Sofia Mejia", email: "sofia@verzay.com" },
  { id: "maria", name: "Maria Alejandra", email: "maria@verzay.com" },
];

// ── La arroba que se escribe ────────────────────────────────────────────────

test("solo la arroba: se abre la lista entera, que es para lo que sirve", () => {
  const a = laArrobaQueSeEscribe("hola @", 6);
  assert.deepEqual(a, { desde: 5, buscado: "" });
  assert.equal(aQuienSeOfrece(EQUIPO, a.buscado).length, 3);
});

test("una arroba en mitad de una palabra NO es una mencion: es un correo", () => {
  assert.equal(laArrobaQueSeEscribe("escribele a hola@verzay.com", 27), null);
  // Y el servidor opina lo mismo, que es de lo que se trata.
  assert.deepEqual(extraerMenciones("escribele a hola@verzay.com", EQUIPO), []);
});

test("al principio del texto si abre palabra", () => {
  assert.deepEqual(laArrobaQueSeEscribe("@yai", 4), { desde: 0, buscado: "yai" });
});

test("despues de un signo tambien: lo que cierra es letra o numero", () => {
  assert.deepEqual(laArrobaQueSeEscribe("(@yai", 5), { desde: 1, buscado: "yai" });
  assert.equal(laArrobaQueSeEscribe("x2@yai", 6), null);
});

test("un salto de linea corta la busqueda: es otra frase, no el nombre", () => {
  assert.equal(laArrobaQueSeEscribe("@yair\nhola", 10), null);
});

test("un parrafo entero detras de una arroba no se queda buscando para siempre", () => {
  const largo = "@" + "x".repeat(TOPE_DE_LO_QUE_SE_BUSCA + 1);
  assert.equal(laArrobaQueSeEscribe(largo, largo.length), null);
});

test("el cursor manda, no el final del texto: se puede editar una mencion de atras", () => {
  //             0123456789
  const texto = "hola @yai y adios";
  assert.deepEqual(laArrobaQueSeEscribe(texto, 9), { desde: 5, buscado: "yai" });
});

// ── A quien se le ofrece ────────────────────────────────────────────────────

test("se busca por el apellido, no solo por como empieza el nombre", () => {
  const salen = aQuienSeOfrece(EQUIPO, "silvera");
  assert.deepEqual(salen.map((p) => p.id), ["yair"]);
});

test("y por el correo, sin distinguir mayusculas", () => {
  assert.deepEqual(aQuienSeOfrece(EQUIPO, "SOFIA@").map((p) => p.id), ["sofia"]);
});

test("lo que no casa con nadie no ofrece a nadie", () => {
  assert.deepEqual(aQuienSeOfrece(EQUIPO, "zzz"), []);
});

test("hay tope: una lista sin fin taparia la conversacion entera", () => {
  const muchos = Array.from({ length: 30 }, (_, i) => ({
    id: `p${i}`, name: `Persona ${i}`, email: `p${i}@verzay.com`,
  }));
  assert.equal(aQuienSeOfrece(muchos, "").length, 8);
});

// ── Lo que queda escrito ────────────────────────────────────────────────────

test("se escribe el nombre exacto, con espacio detras, y el servidor lo reconoce", () => {
  const texto = "hola @yai";
  const a = laArrobaQueSeEscribe(texto, texto.length);
  const puesto = ponerLaMencion(texto, a, EQUIPO[0], texto.length);
  assert.equal(puesto.texto, "hola @Yair Silvera ");
  assert.equal(puesto.cursor, puesto.texto.length);
  // La prueba de que las dos mitades estan de acuerdo.
  assert.deepEqual(extraerMenciones(puesto.texto, EQUIPO), ["yair"]);
});

test("meterla en medio no se come lo que venia detras", () => {
  const texto = "dile a @sof que mire esto";
  const a = laArrobaQueSeEscribe(texto, 11);
  const puesto = ponerLaMencion(texto, a, EQUIPO[1], 11);
  assert.equal(puesto.texto, "dile a @Sofia Mejia  que mire esto");
  assert.deepEqual(extraerMenciones(puesto.texto, EQUIPO), ["sofia"]);
});

test("elegir sin nada escrito tambien deja una mencion buena", () => {
  const texto = "@";
  const a = laArrobaQueSeEscribe(texto, 1);
  const puesto = ponerLaMencion(texto, a, EQUIPO[2], 1);
  assert.equal(puesto.texto, "@Maria Alejandra ");
  assert.deepEqual(extraerMenciones(puesto.texto, EQUIPO), ["maria"]);
});

// ── Personas, no cuentas ────────────────────────────────────────────────────

const FAMILIA = [
  { id: "grupo", name: "Grupo Verzay", esCuenta: true },
  { id: "atencion", name: "Verzay | Atencion", esCuenta: true },
  { id: "ventas", name: "Verzay Ventas", esCuenta: true },
  { id: "yair", name: "Yair Silvera", esCuenta: false },
  { id: "sofia", name: "Sofia Mejia", esCuenta: false },
];

test("las cuentas vinculadas NO son gente con la que abrir un directo", () => {
  const quedan = soloLasPersonas(FAMILIA, "grupo").map((p) => p.id);
  assert.deepEqual(quedan, ["grupo", "yair", "sofia"]);
  assert.ok(!quedan.includes("atencion"));
  assert.ok(!quedan.includes("ventas"));
});

test("pero la RAIZ se queda: es el inicio de sesion del dueño", () => {
  // Sin esta mitad nadie del equipo podria escribirle al jefe, que es justo el
  // agujero que las cuentas vinieron a tapar.
  assert.ok(soloLasPersonas(FAMILIA, "grupo").some((p) => p.id === "grupo"));
});

test("y quien mira desde otra cuenta ve la raiz de SU familia, no la suya", () => {
  // La raiz es la de la familia, la misma para todos: se pasa desde el
  // servidor, no se deduce de quien mira.
  const quedan = soloLasPersonas(FAMILIA, "grupo").map((p) => p.id);
  assert.ok(quedan.includes("grupo"));
});

test("sin marca de cuenta se pasa todo: una lista vieja no se queda vacia", () => {
  const sinMarca = [{ id: "a", name: "A" }, { id: "b", name: "B" }];
  assert.equal(soloLasPersonas(sinMarca, "raiz").length, 2);
});
