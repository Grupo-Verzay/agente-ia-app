/**
 * Donde se queda un hilo de mensajes al pintarse.
 *
 * Los cuatro invariantes que este banco protege:
 *
 *   1. **Un hilo que no llena la pantalla esta SIEMPRE abajo.** Sin esto, un
 *      chat de dos mensajes ensenaria la flecha para siempre.
 *   2. **Cargar historial NO es una novedad.** Lo que delata que llego algo es
 *      que cambie el ULTIMO, no que suba el total: sin esa distincion, pulsar
 *      «Cargar mensajes anteriores» mientras se lee arriba pondria un «+30» de
 *      mensajes viejos.
 *   3. **Abrir un hilo no deja nada sin leer.**
 *   4. **Pegado abajo, el contador es cero**, siempre.
 *
 * Como compilar lo que importa (sale en `.compilado/`, que esta en .gitignore):
 *
 *   npx tsc lib/desplazamiento-del-hilo.ts --outDir lib/__tests__/.compilado \
 *     --module es2022 --target es2022 --lib es2022,dom \
 *     --moduleResolution bundler --skipLibCheck
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
    MARGEN_DE_PEGADO,
    cuantosSinLeer,
    estaPegadoAbajo,
} from "./.compilado/desplazamiento-del-hilo.js";

/** Un hilo largo en una ventana de 600 de alto. */
const alto = (scrollTop) => ({ scrollTop, scrollHeight: 5000, clientHeight: 600 });

// ── 1. Pegado abajo ─────────────────────────────────────────────────────────

test("al final del todo, pegado", () => {
    assert.equal(estaPegadoAbajo(alto(4400)), true);
});

test("justo en el margen, todavia pegado; un pixel mas arriba, no", () => {
    assert.equal(estaPegadoAbajo(alto(4400 - MARGEN_DE_PEGADO)), true);
    assert.equal(estaPegadoAbajo(alto(4400 - MARGEN_DE_PEGADO - 1)), false);
});

test("leyendo arriba, no pegado", () => {
    assert.equal(estaPegadoAbajo(alto(0)), false);
    assert.equal(estaPegadoAbajo(alto(1200)), false);
});

test("un hilo que no llena la pantalla esta SIEMPRE abajo", () => {
    // Dos mensajes en una ventana de 600: no hay a donde subir. Sin esto, la
    // flecha saldria para siempre en cualquier chat corto.
    assert.equal(estaPegadoAbajo({ scrollTop: 0, scrollHeight: 120, clientHeight: 600 }), true);
    assert.equal(estaPegadoAbajo({ scrollTop: 0, scrollHeight: 600, clientHeight: 600 }), true);
});

test("con numeros que no sirven se da por pegado, que es el lado seguro", () => {
    // Equivocarse hacia «pegado» deja el hilo al final, que es donde se abre un
    // chat. Hacia el otro lado saldria una flecha permanente sobre un hilo que
    // ya esta abajo.
    assert.equal(estaPegadoAbajo({ scrollTop: NaN, scrollHeight: 5000, clientHeight: 600 }), true);
});

// ── 2. Cargar historial no es una novedad ───────────────────────────────────

test("«Cargar mensajes anteriores» NO suma sin leer", () => {
    const antes = { total: 30, ultimoId: "z" };
    // Entran 30 viejos por arriba: el total sube y el ultimo es el mismo.
    const ahora = { total: 60, ultimoId: "z" };
    assert.equal(cuantosSinLeer(antes, ahora, false, 0), 0);
    assert.equal(cuantosSinLeer(antes, ahora, false, 4), 4, "ni toca lo ya contado");
});

test("un mensaje nuevo suma uno", () => {
    assert.equal(
        cuantosSinLeer({ total: 30, ultimoId: "y" }, { total: 31, ultimoId: "z" }, false, 0),
        1,
    );
});

test("una tanda suma la tanda", () => {
    assert.equal(
        cuantosSinLeer({ total: 30, ultimoId: "y" }, { total: 33, ultimoId: "z" }, false, 2),
        5,
    );
});

test("si a la vez entra uno y se borra otro, sigue siendo uno nuevo", () => {
    // El total no se mueve, pero el ultimo cambio: llego algo.
    assert.equal(
        cuantosSinLeer({ total: 30, ultimoId: "y" }, { total: 30, ultimoId: "z" }, false, 0),
        1,
    );
});

// ── 3 y 4. Abrir y volver abajo ─────────────────────────────────────────────

test("abrir un hilo no deja nada sin leer", () => {
    assert.equal(
        cuantosSinLeer({ total: 0, ultimoId: null }, { total: 30, ultimoId: "z" }, false, 0),
        0,
    );
});

test("pegado abajo, siempre cero", () => {
    assert.equal(
        cuantosSinLeer({ total: 30, ultimoId: "y" }, { total: 35, ultimoId: "z" }, true, 9),
        0,
    );
});

test("un hilo que se queda vacio conserva lo contado", () => {
    assert.equal(
        cuantosSinLeer({ total: 3, ultimoId: "y" }, { total: 0, ultimoId: null }, false, 2),
        2,
    );
});

// ── Y la historia entera, encadenada ────────────────────────────────────────

test("una sesion completa: abrir, subir a leer, llegan tres, volver abajo", () => {
    let sinLeer = 0;
    let estado = { total: 0, ultimoId: null };

    // Abrir: 20 mensajes, pegado abajo.
    let siguiente = { total: 20, ultimoId: "m20" };
    sinLeer = cuantosSinLeer(estado, siguiente, true, sinLeer);
    estado = siguiente;
    assert.equal(sinLeer, 0);

    // Se sube a leer. Llegan tres, de uno en uno.
    for (const [total, id] of [[21, "m21"], [22, "m22"], [23, "m23"]]) {
        siguiente = { total, ultimoId: id };
        sinLeer = cuantosSinLeer(estado, siguiente, false, sinLeer);
        estado = siguiente;
    }
    assert.equal(sinLeer, 3);

    // Se pulsa «Cargar mensajes anteriores»: 30 mas por arriba.
    siguiente = { total: 53, ultimoId: "m23" };
    sinLeer = cuantosSinLeer(estado, siguiente, false, sinLeer);
    estado = siguiente;
    assert.equal(sinLeer, 3, "el historial no cuenta");

    // Se baja al final.
    siguiente = { total: 53, ultimoId: "m23" };
    sinLeer = cuantosSinLeer(estado, siguiente, true, sinLeer);
    assert.equal(sinLeer, 0);
});
