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
  elCanalDeEntrada,
  elCanalRecordado,
  llaveDelUltimoCanal,
  recordarElCanal,
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

/* ── El último canal abierto ─────────────────────────────────────────────── */
//
// Lo que este trozo protege son las tres formas de estropear un recuerdo:
//
//   1. Que **pise un enlace**. Quien llega desde un aviso de mención va a algo
//      concreto; abrirle el canal de ayer es un enlace que no lleva donde dice.
//   2. Que **cruce de cuenta o de persona**. La lista de canales depende de la
//      cuenta y la pertenencia depende de la persona, así que una llave
//      compartida devuelve un canal que quien entra no puede abrir.
//   3. Que **tumbe el panel** donde `localStorage` no se puede tocar.

test("EL CASO: se vuelve al canal donde se estaba, no al General", () => {
  assert.deepEqual(elCanalDeEntrada({ recordado: "ventas" }), {
    canal: "ventas",
    deRecuerdo: true,
  });
  // Un directo es un canal como otro cualquiera: se recuerda igual.
  assert.deepEqual(elCanalDeEntrada({ recordado: "ana::luis" }), {
    canal: "ana::luis",
    deRecuerdo: true,
  });
});

test("lo PEDIDO manda sobre el recuerdo", () => {
  // El `?canal=` de un aviso de mención. Si el recuerdo lo pisara, pulsar el
  // aviso abriría otra conversación y la mención no se encontraría.
  assert.deepEqual(elCanalDeEntrada({ pedido: "soporte", recordado: "ventas" }), {
    canal: "soporte",
    deRecuerdo: false,
  });
});

test("sin nada, el General — y como antes", () => {
  for (const entrada of [
    {},
    { pedido: null, recordado: null },
    { pedido: "", recordado: "" },
    { recordado: "   " },
  ]) {
    assert.deepEqual(
      elCanalDeEntrada(entrada),
      { canal: CANAL_GENERAL, deRecuerdo: false },
      `deberia caer en el general: ${JSON.stringify(entrada)}`,
    );
  }
});

test("un General recordado NO se marca como recuerdo", () => {
  // `deRecuerdo` es lo unico que apaga el aviso de la caida al General. Con el
  // propio General marcado, ese aviso quedaria apagado tambien para el caso en
  // que SI hay que mirarlo.
  assert.deepEqual(elCanalDeEntrada({ recordado: CANAL_GENERAL }), {
    canal: CANAL_GENERAL,
    deRecuerdo: false,
  });
});

test("la llave separa CUENTA y PERSONA, y no las confunde entre si", () => {
  const unos = llaveDelUltimoCanal("cuenta1", "ana");
  assert.notEqual(unos, llaveDelUltimoCanal("cuenta2", "ana"));
  assert.notEqual(unos, llaveDelUltimoCanal("cuenta1", "luis"));
  // Y no se pueden cruzar por un separador mal puesto: «cuenta1_ana» y
  // «cuenta1» + «ana» tienen que dar llaves distintas de «cuenta1_a» + «na».
  assert.notEqual(
    llaveDelUltimoCanal("a", "b_c"),
    llaveDelUltimoCanal("a_b", "c"),
  );
  // Sin ids no se revienta: se guarda bajo una llave reconocible.
  assert.ok(llaveDelUltimoCanal("", "").includes("sin-cuenta"));
});

test("leer y guardar se ENCADENAN: lo guardado es lo que se abre", () => {
  const almacen = new Map();
  globalThis.localStorage = {
    getItem: (k) => (almacen.has(k) ? almacen.get(k) : null),
    setItem: (k, v) => almacen.set(k, String(v)),
  };
  try {
    recordarElCanal("cuenta1", "ana", "ventas");
    assert.equal(elCanalRecordado("cuenta1", "ana"), "ventas");
    // Lo de Ana no es lo de Luis, ni lo de la otra cuenta.
    assert.equal(elCanalRecordado("cuenta1", "luis"), null);
    assert.equal(elCanalRecordado("cuenta2", "ana"), null);
    // Y encadenado con la decision: se vuelve ahi.
    assert.deepEqual(
      elCanalDeEntrada({ recordado: elCanalRecordado("cuenta1", "ana") }),
      { canal: "ventas", deRecuerdo: true },
    );
  } finally {
    delete globalThis.localStorage;
  }
});

test("un `localStorage` que LANZA no tumba nada", () => {
  // Ventana privada, cookies de sitio bloqueadas, previsualizacion. Sin el
  // `try`, la excepcion sale en la primera carga y el panel no llega a abrirse.
  globalThis.localStorage = {
    getItem() {
      throw new Error("acceso denegado");
    },
    setItem() {
      throw new Error("acceso denegado");
    },
  };
  try {
    assert.equal(elCanalRecordado("cuenta1", "ana"), null);
    assert.doesNotThrow(() => recordarElCanal("cuenta1", "ana", "ventas"));
    // Y sin recuerdo se abre el General, que es como se comportaba antes.
    assert.deepEqual(elCanalDeEntrada({ recordado: elCanalRecordado("c", "a") }), {
      canal: CANAL_GENERAL,
      deRecuerdo: false,
    });
  } finally {
    delete globalThis.localStorage;
  }
});

test("no se guarda un canal vacio", () => {
  const almacen = new Map();
  globalThis.localStorage = {
    getItem: (k) => (almacen.has(k) ? almacen.get(k) : null),
    setItem: (k, v) => almacen.set(k, String(v)),
  };
  try {
    recordarElCanal("cuenta1", "ana", "   ");
    assert.equal(almacen.size, 0, "una cadena en blanco no es un canal");
    assert.equal(elCanalRecordado("cuenta1", "ana"), null);
  } finally {
    delete globalThis.localStorage;
  }
});
