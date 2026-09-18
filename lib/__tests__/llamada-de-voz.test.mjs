/**
 * La llamada de voz de un directo.
 *
 * Los cuatro invariantes que este banco protege:
 *
 *   1. **Sin latido no esta disponible.** Es el lado seguro: mejor decir «no
 *      esta» que dejar a alguien escuchando un tono que no suena en ningun
 *      sitio — que es justo lo que se pidio evitar.
 *   2. **La duracion se cuenta desde que se CONTESTO**, no desde que se llamo.
 *      El rato sonando no es conversacion: contarlo haria que una llamada de
 *      diez segundos que tardo treinta en contestarse saliera como de cuarenta.
 *   3. **Solo uno a uno.** `laOtraPersona` se rinde con un canal que no es un
 *      directo o que no tiene exactamente dos miembros: con tres dentro no hay
 *      «el otro», y una llamada de uno a uno no sabria a quien sonarle.
 *   4. **Sin TURN hay llamadas que no conectan, y se DICEN.** STUN no
 *      transporta audio; con las dos puntas detras de NAT simetrico no hay ruta
 *      directa. Eso no se arregla desde el codigo — lo que si se puede es que
 *      no se pierda en silencio.
 *
 * Como compilar lo que importa (sale en `.compilado/`, que esta en .gitignore):
 *
 *   npx tsc lib/llamada-de-voz.ts --outDir lib/__tests__/.compilado \
 *     --module es2022 --target es2022 --lib es2022,dom \
 *     --moduleResolution bundler --skipLibCheck
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  MARGEN_DE_PRESENCIA_MS,
  TIMBRE_MAXIMO_MS,
  comoSeCuentaLaLlamada,
  comoSeLeeLaDuracion,
  duracionEnSegundos,
  esFinDeLlamada,
  estaDisponible,
  laOtraPersona,
  losServidoresIce,
  seLePasoElTimbre,
} from "./.compilado/llamada-de-voz.js";

const AHORA = Date.parse("2026-09-18T16:00:00.000Z");

// ── Quien esta delante ──────────────────────────────────────────────────────

test("un latido reciente es estar disponible", () => {
  assert.equal(estaDisponible(new Date(AHORA - 2_000), AHORA), true);
});

test("sin latido NO esta disponible: nunca abrio, o cerro hace rato", () => {
  assert.equal(estaDisponible(null, AHORA), false);
  assert.equal(estaDisponible(undefined, AHORA), false);
  assert.equal(estaDisponible("", AHORA), false);
});

test("una fecha ilegible tampoco cuela como presente", () => {
  assert.equal(estaDisponible("ayer por la tarde", AHORA), false);
});

test("el margen aguanta varias vueltas perdidas, no solo una", () => {
  // Con un margen de una vuelta, una pestaña ocupada te deja «no disponible»
  // estando delante — y eso se ve como que la funcion no funciona.
  assert.ok(MARGEN_DE_PRESENCIA_MS > 3 * 3_000);
  assert.equal(estaDisponible(new Date(AHORA - MARGEN_DE_PRESENCIA_MS + 1_000), AHORA), true);
  assert.equal(estaDisponible(new Date(AHORA - MARGEN_DE_PRESENCIA_MS - 1_000), AHORA), false);
});

// ── El timbre ───────────────────────────────────────────────────────────────

test("el timbre se mide por la hora de la FILA, no por un contador en pantalla", () => {
  // Si se midiera en la pantalla de quien llama y esa pestaña se cierra a
  // mitad, la llamada se quedaria sonando para siempre en la otra punta.
  assert.equal(seLePasoElTimbre(new Date(AHORA - 1_000), AHORA), false);
  assert.equal(seLePasoElTimbre(new Date(AHORA - TIMBRE_MAXIMO_MS - 1), AHORA), true);
});

// ── Cuanto duro ─────────────────────────────────────────────────────────────

test("se cuenta desde que se CONTESTO, no desde que se llamo", () => {
  const llamada = new Date(AHORA);
  const contestada = new Date(AHORA + 30_000);
  const colgada = new Date(AHORA + 40_000);
  // Diez segundos de conversacion, no cuarenta.
  assert.equal(duracionEnSegundos(contestada, colgada), 10);
  assert.equal(duracionEnSegundos(llamada, colgada), 40);
});

test("sin contestar son CERO segundos, y eso es un dato", () => {
  assert.equal(duracionEnSegundos(null, new Date(AHORA)), 0);
  assert.equal(duracionEnSegundos(new Date(AHORA), null), 0);
});

test("nunca sale negativa, aunque las horas vengan del reves", () => {
  assert.equal(duracionEnSegundos(new Date(AHORA + 10_000), new Date(AHORA)), 0);
});

test("los segundos van a dos cifras, o 3:07 se lee como 3,7 minutos", () => {
  assert.equal(comoSeLeeLaDuracion(187), "3:07");
  assert.equal(comoSeLeeLaDuracion(0), "0:00");
  assert.equal(comoSeLeeLaDuracion(60), "1:00");
  assert.equal(comoSeLeeLaDuracion(-5), "0:00");
});

// ── Lo que queda escrito en el directo ──────────────────────────────────────

test("una llamada contestada deja su duracion", () => {
  assert.equal(comoSeCuentaLaLlamada("contestada", 187), "Llamada de voz · 3:07");
});

test("y cada final dice lo que paso, sin confundirse con otro", () => {
  const textos = ["rechazada", "sin_respuesta", "no_disponible", "sin_conexion"].map((f) =>
    comoSeCuentaLaLlamada(f, 0),
  );
  // Cuatro finales, cuatro textos distintos: si dos dijeran lo mismo, el hilo
  // no distinguiria «me colgo» de «no estaba».
  assert.equal(new Set(textos).size, 4);
});

test("«no se pudo conectar» es su propio final, no «se corto»", () => {
  // Es el caso de las dos redes que no dejan conectar directo. Llamarlo de otra
  // forma mandaria a buscar el fallo donde no esta.
  assert.match(comoSeCuentaLaLlamada("sin_conexion", 0), /no se pudo conectar/i);
});

test("un final inventado no se da por bueno", () => {
  assert.equal(esFinDeLlamada("contestada"), true);
  assert.equal(esFinDeLlamada("colgada_por_el_gato"), false);
  assert.equal(esFinDeLlamada(null), false);
  assert.equal(esFinDeLlamada(7), false);
});

// ── Solo uno a uno ──────────────────────────────────────────────────────────

test("en un directo, el otro es el otro", () => {
  assert.equal(laOtraPersona({ tipo: "directo", miembros: ["yo", "tu"] }, "yo"), "tu");
  assert.equal(laOtraPersona({ tipo: "directo", miembros: ["yo", "tu"] }, "tu"), "yo");
});

test("un canal de area NO se llama: no hay «el otro»", () => {
  assert.equal(laOtraPersona({ tipo: "area", miembros: ["yo", "tu"] }, "yo"), null);
  assert.equal(laOtraPersona({ tipo: "general", miembros: ["yo", "tu"] }, "yo"), null);
});

test("ni un directo con tres dentro, ni uno en el que no estoy", () => {
  assert.equal(laOtraPersona({ tipo: "directo", miembros: ["a", "b", "c"] }, "a"), null);
  // Un administrador LEE los directos de su cuenta; eso no le deja llamar
  // desde ellos — meterse en la conversacion de otros dos no es supervisar.
  assert.equal(laOtraPersona({ tipo: "directo", miembros: ["a", "b"] }, "admin"), null);
});

test("y los miembros repetidos no fabrican una pareja donde no la hay", () => {
  assert.equal(laOtraPersona({ tipo: "directo", miembros: ["a", "a"] }, "a"), null);
});

// ── Los servidores ICE ──────────────────────────────────────────────────────

test("sin TURN configurado va solo STUN: directo siempre que se pueda", () => {
  const ice = losServidoresIce({});
  assert.equal(ice.length, 1);
  assert.ok(String(ice[0].urls).includes("stun:"));
});

test("con TURN configurado entra detras, sin quitar el STUN", () => {
  const ice = losServidoresIce({
    TURN_URL: "turn:turn.ia-app.com:3478",
    TURN_USER: "verzay",
    TURN_PASSWORD: "x",
  });
  assert.equal(ice.length, 2);
  // STUN primero: WebRTC prefiere la ruta directa y solo releva si no hay otra,
  // que es lo que mantiene el coste en cero la mayoria de las veces.
  assert.ok(String(ice[0].urls).includes("stun:"));
  assert.deepEqual(ice[1].urls, ["turn:turn.ia-app.com:3478"]);
  assert.equal(ice[1].username, "verzay");
});

test("y admite varias direcciones de TURN separadas por comas", () => {
  const ice = losServidoresIce({ TURN_URL: "turn:a:3478, turns:b:5349" });
  assert.deepEqual(ice[1].urls, ["turn:a:3478", "turns:b:5349"]);
});

test("una variable vacia no mete un TURN sin direccion", () => {
  assert.equal(losServidoresIce({ TURN_URL: "   " }).length, 1);
});
