/**
 * El número que se pinta sobre el favicon.
 *
 * Los cuatro invariantes que este banco protege, y los cuatro son formas de
 * que el icono mienta — que es peor que no tener insignia, porque se mira de
 * reojo y se da por buena:
 *
 *   1. **Sin pendientes NO se pinta nada.** Una insignia con un cero dentro
 *      sigue llamando la atención para decir que no pasa nada.
 *   2. **Los dos contadores SUMAN.** Son dos sitios distintos donde hay algo
 *      que contestar; enseñar solo uno deja al otro invisible.
 *   3. **Por encima del tope, `9+`.** El hueco son 16 píxeles: tres cifras no
 *      se leen, y un número ilegible ocupa lo mismo y promete precisión.
 *   4. **Un número que no lo es NO pinta.** `Infinity` colado en la suma la
 *      haría `Infinity` entera y taparía los pendientes de verdad del otro.
 *
 * Como compilar lo que importa (sale en `.compilado/`, que esta en .gitignore):
 *
 *   npx tsc lib/insignia-del-favicon.ts --outDir lib/__tests__/.compilado \
 *     --module es2022 --target es2022 --lib es2022,dom \
 *     --moduleResolution bundler --skipLibCheck
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  INSIGNIA,
  TOPE_VISIBLE,
  losChatsSinLeer,
  loQueSePinta,
} from "./.compilado/insignia-del-favicon.js";

test("EL CASO: sin pendientes, el icono normal", () => {
  assert.deepEqual(loQueSePinta(0, 0), { total: 0, texto: null });
});

test("los dos contadores SUMAN", () => {
  assert.deepEqual(loQueSePinta(2, 3), { total: 5, texto: "5" });
  // Y cada uno por su cuenta cuenta igual.
  assert.deepEqual(loQueSePinta(4, 0), { total: 4, texto: "4" });
  assert.deepEqual(loQueSePinta(0, 4), { total: 4, texto: "4" });
});

test("hasta el tope el número exacto; por encima, 9+", () => {
  assert.equal(loQueSePinta(TOPE_VISIBLE, 0).texto, String(TOPE_VISIBLE));
  assert.equal(loQueSePinta(TOPE_VISIBLE + 1, 0).texto, `${TOPE_VISIBLE}+`);
  assert.equal(loQueSePinta(500, 500).texto, `${TOPE_VISIBLE}+`);
  // El tope es de lo que se ENSEÑA, no de lo que se cuenta: `total` sigue
  // entero, que es lo que mira quien decide si hay algo.
  assert.equal(loQueSePinta(500, 500).total, 1000);
});

test("y la suma cruza el tope aunque ninguno lo cruce solo", () => {
  // Cinco chats y seis menciones no son «5» ni «6»: son once.
  assert.equal(loQueSePinta(5, 6).texto, `${TOPE_VISIBLE}+`);
});

test("un número que no lo es NO pinta, y NO envenena la suma", () => {
  for (const malo of [NaN, Infinity, -Infinity, -3, null, undefined, "hola", {}]) {
    assert.deepEqual(
      loQueSePinta(malo, 0),
      { total: 0, texto: null },
      `no deberia pintar: ${String(malo)}`,
    );
    // Y con algo de verdad al lado, ese algo sobrevive entero.
    assert.deepEqual(
      loQueSePinta(malo, 3),
      { total: 3, texto: "3" },
      `deberia quedarse el 3: ${String(malo)}`,
    );
  }
});

test("lo que llega como texto de un contador se entiende igual", () => {
  // Los contadores pasan por props y por un store; un «3» de cadena es un 3.
  assert.deepEqual(loQueSePinta("3", "2"), { total: 5, texto: "5" });
});

test("los decimales se redondean HACIA ABAJO", () => {
  // 0,9 chats sin leer no es un chat sin leer: no se pinta nada.
  assert.deepEqual(loQueSePinta(0.9, 0), { total: 0, texto: null });
  assert.equal(loQueSePinta(2.7, 0).texto, "2");
});

test("el lienzo se dibuja MÁS GRANDE de lo que se ve", () => {
  // A 16 el círculo sale escalonado y el dígito ilegible. Se dibuja a 64 y el
  // navegador reduce, que es lo que hace cualquier icono de la barra.
  assert.ok(INSIGNIA.lado >= 64, "el lienzo tiene que dar margen para reducir");
  // Y la geometría va en PROPORCIONES, no en píxeles: si alguien cambia el
  // lado, la insignia tiene que seguir cayendo en su sitio.
  for (const [k, v] of Object.entries(INSIGNIA)) {
    if (k === "lado") continue;
    assert.ok(v > 0 && v < 1, `${k} deberia ser una proporcion, y es ${v}`);
  }
});

// ── La mitad de chats: lo que dice la BANDEJA, y nada más ───────────────────
//
// Hubo una segunda fuente —un conteo del servidor— y de ahí salieron los dos
// fallos del #838. Contaba «las conversaciones cuyo último mensaje es del
// contacto», que no es «sin leer», y encima ganaba a la bandeja siempre que
// esta estuviera vacía. Ahora hay una sola fuente y estos son todos los casos.

test("EL CASO: la cuenta vacía da CERO, y cero NO pinta", () => {
  // Borrados todos los chats y todos los leads, la bandeja dice cero. Ahí se
  // acaba: no hay ningún otro número que pueda ganarle.
  assert.equal(losChatsSinLeer(0), 0);
  assert.deepEqual(loQueSePinta(losChatsSinLeer(0), 0), { total: 0, texto: null });
});

test("la bandeja cargada da su número exacto: el de la pastilla «Sin leer»", () => {
  assert.equal(losChatsSinLeer(3), 3);
  assert.equal(loQueSePinta(losChatsSinLeer(3), 0).texto, "3");
  // Y con 577 conversaciones en la línea y tres sin leer, el icono dice tres.
  // Ese era el fallo 2: decía `9+` porque contaba las 577.
  assert.equal(loQueSePinta(losChatsSinLeer(3), 0).total, 3);
});

test("`null` es «no lo sé», y de «no lo sé» no sale un número", () => {
  // Fuera de Chats la bandeja no ha hablado. Cero y `null` son dos respuestas
  // distintas —«los leí todos» y «no lo sé»— y las dos pintan lo mismo: nada.
  // Lo que NO puede pasar es que de `null` salga un conteo de otra parte.
  assert.equal(losChatsSinLeer(null), 0);
  assert.equal(losChatsSinLeer(undefined), 0);
  assert.equal(loQueSePinta(losChatsSinLeer(null), 0).texto, null);
  // Y con el equipo al lado, el equipo sigue pintando solo.
  assert.equal(loQueSePinta(losChatsSinLeer(null), 2).texto, "2");
});

test("un número que no lo es tampoco envenena esta mitad", () => {
  for (const malo of [NaN, Infinity, -Infinity, -3, "hola", {}]) {
    assert.equal(losChatsSinLeer(malo), 0, `no deberia contar: ${String(malo)}`);
  }
  // Un contador que llega como texto sí es un número.
  assert.equal(losChatsSinLeer("4"), 4);
  // Y los decimales hacia abajo: 0,9 chats sin leer no es un chat sin leer.
  assert.equal(losChatsSinLeer(0.9), 0);
});

test("y las dos mitades se suman ENCADENADAS, no cada una por su lado", () => {
  // Probarlas por separado es lo que dejaría pasar que una no llegue al icono.
  assert.deepEqual(loQueSePinta(losChatsSinLeer(2), 3), { total: 5, texto: "5" });
  assert.deepEqual(loQueSePinta(losChatsSinLeer(0), 0), { total: 0, texto: null });
});
