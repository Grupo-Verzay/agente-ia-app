/**
 * El arrastre de los dos tableros: el de un proyecto y el de tickets.
 *
 * El #769 —que trajo reordenar dentro de la columna— **no dejo banco**, y el
 * fallo que vino despues entro justo por ahi. Asi que este protege las dos
 * mitades:
 *
 *   1. **De que se resuelve la tarjeta arrastrada.** Viajaba en el `data` del
 *      arrastre, al pasar a `useSortable` ese `data` se perdio, y los dos
 *      tableros dejaron de mover tarjetas **sin un solo error**: el manejador
 *      se iba por su `if (!task) return` ANTES de decidir nada. Ahora se busca
 *      por el `id`, que es el unico canal que no se puede perder — sin el
 *      dnd-kit no arrastra.
 *   2. **Que significa haberla soltado.** Sobre una columna, sobre una tarjeta
 *      de otra columna, o sobre una de la suya: son tres cosas distintas y las
 *      dos pantallas tienen que decidirlas igual.
 *
 * Como compilar lo que importa (sale en `.compilado/`, que esta en .gitignore):
 *
 *   npx tsc lib/orden-del-tablero.ts --outDir lib/__tests__/.compilado \
 *     --module es2022 --target es2022 --moduleResolution bundler --skipLibCheck
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  laTarjetaArrastrada,
  moverEnLaColumna,
  ordenarLaColumna,
  posicionesDeLaColumna,
  resolverElArrastre,
} from "./.compilado/orden-del-tablero.js";

// Un tablero como el de Proyectos: ids NUMERICOS, tres columnas.
const TAREAS = [
  { id: 1, status: "pending" },
  { id: 2, status: "pending" },
  { id: 3, status: "in_progress" },
];
const COLUMNAS = ["pending", "in_progress", "done"];
const POR_COLUMNA = { pending: ["1", "2"], in_progress: ["3"], done: [] };

// ── De que se resuelve la tarjeta ───────────────────────────────────────────

test("se encuentra por su id, que es lo que manda dnd-kit", () => {
  assert.equal(laTarjetaArrastrada("2", TAREAS, (t) => t.id)?.id, 2);
});

test("y el id NUMERICO casa con la cadena que llega del arrastre", () => {
  // Es la mitad silenciosa del fallo: en Proyectos `task.id` es un numero y
  // `active.id` llega SIEMPRE como cadena. Con `===` en crudo no casaria nunca
  // y seria el mismo fallo otra vez, igual de mudo.
  assert.equal(laTarjetaArrastrada(2, TAREAS, (t) => t.id)?.id, 2);
  assert.notEqual(2, "2");
});

test("un id que no esta devuelve null, no la primera que aparezca", () => {
  assert.equal(laTarjetaArrastrada("99", TAREAS, (t) => t.id), null);
});

test("sin id no se inventa nada", () => {
  for (const malo of ["", "   ", null, undefined]) {
    assert.equal(laTarjetaArrastrada(malo, TAREAS, (t) => t.id), null);
  }
});

test("y sobre una lista vacia tampoco revienta", () => {
  assert.equal(laTarjetaArrastrada("1", [], (t) => t.id), null);
});

// ── Que significa haberla soltado ───────────────────────────────────────────

const soltar = (arrastrada, sobre, columna) =>
  resolverElArrastre({
    arrastrada,
    soltadaSobre: sobre,
    columnaDeLaArrastrada: columna,
    columnas: COLUMNAS,
    idsPorColumna: POR_COLUMNA,
  });

test("sobre OTRA columna: cambia de columna", () => {
  assert.deepEqual(soltar("1", "in_progress", "pending"), {
    que: "otra-columna",
    columna: "in_progress",
  });
});

test("sobre la SUYA (el hueco de abajo): no pasa nada", () => {
  assert.deepEqual(soltar("1", "pending", "pending"), { que: "nada" });
});

test("sobre una tarjeta de otra columna: cambia de columna, no reordena", () => {
  // Entra al final de la de destino: meterse en mitad de un orden que puso
  // alguien a mano seria pisarlo sin querer.
  assert.deepEqual(soltar("1", "3", "pending"), {
    que: "otra-columna",
    columna: "in_progress",
  });
});

test("sobre una tarjeta de la SUYA: reordena", () => {
  const r = soltar("2", "1", "pending");
  assert.equal(r.que, "reordenar");
  assert.deepEqual(r.ids, ["2", "1"]);
});

test("soltada sobre si misma: nada, y no escribe una vuelta al servidor", () => {
  assert.deepEqual(soltar("1", "1", "pending"), { que: "nada" });
});

test("soltada sobre algo que no esta en ninguna columna: nada", () => {
  assert.deepEqual(soltar("1", "fantasma", "pending"), { que: "nada" });
});

// ── El movimiento dentro de la columna ──────────────────────────────────────

test("mover hacia arriba y hacia abajo deja la lista completa", () => {
  const col = ["a", "b", "c", "d"];
  assert.deepEqual(moverEnLaColumna(col, "d", "b"), ["a", "d", "b", "c"]);
  assert.deepEqual(moverEnLaColumna(col, "a", "c"), ["b", "c", "a", "d"]);
  // Ni se pierde ni se duplica ninguna.
  assert.equal(new Set(moverEnLaColumna(col, "d", "a")).size, 4);
});

test("una tarjeta que no esta en la columna no mueve nada", () => {
  const col = ["a", "b"];
  assert.equal(moverEnLaColumna(col, "z", "a"), col);
  assert.equal(moverEnLaColumna(col, "a", "z"), col);
});

// ── Lo que se guarda ────────────────────────────────────────────────────────

test("las posiciones salen 0,1,2… y los ids repetidos se descartan", () => {
  // Dos veces la misma fila en un mismo INSERT y Postgres rechaza el comando.
  assert.deepEqual(posicionesDeLaColumna(["a", "b", "a", "  ", "c"]), [
    { id: "a", orden: 0 },
    { id: "b", orden: 1 },
    { id: "c", orden: 2 },
  ]);
});

// ── Y como se pinta la columna ──────────────────────────────────────────────

test("lo que NO tiene posicion va PRIMERO, y lo nuevo queda al final", () => {
  // Una columna que nadie toco sale tal cual salia; y una tarjeta nueva —que SI
  // trae numero— cae en el grupo de las colocadas, o sea la ultima. Al reves,
  // lo recien creado saldria arriba del todo.
  const tarjetas = [{ id: "vieja" }, { id: "nueva" }, { id: "colocada" }];
  const orden = ordenarLaColumna(tarjetas, { colocada: 0, nueva: 1 }, (t) => t.id);
  assert.deepEqual(orden.map((t) => t.id), ["vieja", "colocada", "nueva"]);
});

test("sin nada guardado la columna sale TAL CUAL llego", () => {
  const tarjetas = [{ id: "a" }, { id: "b" }, { id: "c" }];
  assert.deepEqual(
    ordenarLaColumna(tarjetas, {}, (t) => t.id).map((t) => t.id),
    ["a", "b", "c"],
  );
});
