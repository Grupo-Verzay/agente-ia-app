/**
 * Compartir una conversacion de Chats en el chat del equipo.
 *
 * Los tres invariantes que este banco protege:
 *
 *   1. **La LINEA va en el enlace y no es opcional.** El mismo contacto tiene
 *      conversacion en dos lineas —le escribe a Ventas y a Atencion—, asi que
 *      sin ella el aterrizaje elegiria «la primera fila que aparezca». Es el
 *      fallo de `ownerForJid` y `lineaDelJid` que ya costo una sesion con las
 *      marcas de borrado.
 *   2. **Un `@lid` NO se convierte en telefono.** Sus digitos son un id de
 *      privacidad; enseñarlos como numero es peor que no enseñar nada, porque
 *      parecen un numero al que se puede llamar — y podrian ser los de otro.
 *   3. **Media referencia no es una referencia.** Sin linea no hay a donde
 *      llevar y sin jid no hay que abrir: se devuelve `null` y quien llama lo
 *      dice, en vez de publicar una tarjeta que no abre nada.
 *
 * Como compilar lo que importa (sale en `.compilado/`, que esta en .gitignore):
 *
 *   npx tsc lib/chat-compartido.ts --outDir lib/__tests__/.compilado \
 *     --module es2022 --target es2022 --moduleResolution bundler --skipLibCheck
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  aDondeLlevaElChat,
  comoSeGuardaElChat,
  elNumeroQueSeEnsena,
} from "./.compilado/chat-compartido.js";

// ── El enlace ───────────────────────────────────────────────────────────────

test("el enlace lleva la LINEA y el jid, que es lo que la pagina de Chats ya lee", () => {
  const url = aDondeLlevaElChat({ linea: "VERZAY_VENTAS", jid: "573001112233@s.whatsapp.net" });
  assert.equal(url, "/chats?jid=573001112233%40s.whatsapp.net&instance=VERZAY_VENTAS");
});

test("el mismo contacto en dos lineas da DOS enlaces distintos", () => {
  const jid = "573001112233@s.whatsapp.net";
  const ventas = aDondeLlevaElChat({ linea: "VERZAY_VENTAS", jid });
  const atencion = aDondeLlevaElChat({ linea: "VERZAY_ATENCION", jid });
  assert.notEqual(ventas, atencion);
});

test("lo que va en la direccion se escapa: un nombre de linea con espacio no la rompe", () => {
  const url = aDondeLlevaElChat({ linea: "Linea Dos", jid: "a&b@lid" });
  assert.ok(!url.includes(" "));
  assert.ok(url.includes("a%26b%40lid"));
  // Y se puede volver a leer entero, que es lo unico que importa.
  const p = new URLSearchParams(url.split("?")[1]);
  assert.equal(p.get("jid"), "a&b@lid");
  assert.equal(p.get("instance"), "Linea Dos");
});

// ── Lo que se guarda ────────────────────────────────────────────────────────

test("media referencia no es una referencia: sin linea o sin jid, null", () => {
  assert.equal(comoSeGuardaElChat({ jid: "573001112233@s.whatsapp.net" }), null);
  assert.equal(comoSeGuardaElChat({ linea: "VERZAY_VENTAS" }), null);
  assert.equal(comoSeGuardaElChat({ linea: "   ", jid: "   " }), null);
  assert.equal(comoSeGuardaElChat({}), null);
});

test("la identidad pedida va DELANTE: es la que se le devuelve a la pantalla", () => {
  const ref = comoSeGuardaElChat({
    linea: "VERZAY_VENTAS",
    jid: "210101696733292@lid",
    identidades: ["573001112233@s.whatsapp.net", "210101696733292@lid"],
  });
  assert.equal(ref.identidades[0], "210101696733292@lid");
  // Y sin repetirla, aunque venga tambien en la lista.
  assert.equal(ref.identidades.length, 2);
});

test("se guardan TODAS las identidades: preguntar por una sola vuelve vacio", () => {
  const ref = comoSeGuardaElChat({
    linea: "L",
    jid: "a@lid",
    identidades: ["b@s.whatsapp.net", "c@s.whatsapp.net", "  ", 7],
  });
  assert.deepEqual(ref.identidades, ["a@lid", "b@s.whatsapp.net", "c@s.whatsapp.net"]);
});

test("lo que no es texto no se cuela como nombre ni como numero", () => {
  const ref = comoSeGuardaElChat({ linea: "L", jid: "x@lid", nombre: 42, numero: {} });
  assert.equal(ref.nombre, null);
  assert.equal(ref.numero, null);
});

test("vacio y espacios son null, nunca cadena vacia", () => {
  const ref = comoSeGuardaElChat({ linea: " L ", jid: " x@lid ", nombre: "   ", numero: "" });
  assert.equal(ref.linea, "L");
  assert.equal(ref.jid, "x@lid");
  assert.equal(ref.nombre, null);
  assert.equal(ref.numero, null);
});

// ── El numero ───────────────────────────────────────────────────────────────

test("un @lid NO da numero: sus digitos son un id de privacidad", () => {
  const ref = comoSeGuardaElChat({ linea: "L", jid: "210101696733292@lid" });
  assert.equal(elNumeroQueSeEnsena(ref), null);
});

test("pero si se COPIO el telefono al compartir, ese si se enseña", () => {
  const ref = comoSeGuardaElChat({
    linea: "L",
    jid: "210101696733292@lid",
    numero: "573001112233",
  });
  assert.equal(elNumeroQueSeEnsena(ref), "573001112233");
});

test("un jid de telefono si es el numero", () => {
  const ref = comoSeGuardaElChat({ linea: "L", jid: "573001112233@s.whatsapp.net" });
  assert.equal(elNumeroQueSeEnsena(ref), "573001112233");
});

test("un grupo no tiene numero al que llamar", () => {
  const ref = comoSeGuardaElChat({ linea: "L", jid: "120363043211234567@g.us" });
  assert.equal(elNumeroQueSeEnsena(ref), null);
});

test("lo copiado manda sobre lo deducido", () => {
  // Si alguien copio el numero bueno, ese es el que vale: el jid puede venir
  // por una identidad y el telefono por otra.
  const ref = comoSeGuardaElChat({
    linea: "L",
    jid: "573009998877@s.whatsapp.net",
    numero: "573001112233",
  });
  assert.equal(elNumeroQueSeEnsena(ref), "573001112233");
});
