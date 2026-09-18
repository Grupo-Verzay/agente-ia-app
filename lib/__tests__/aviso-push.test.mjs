/**
 * El banco de a quién se le empuja un aviso.
 *
 * Lo que se prueba aquí es **la misma pregunta que el sonido**, del lado del
 * servidor. Equivocarse por arriba —empujar de más— enseña a despachar los
 * avisos sin leerlos, con lo que el que importa se pierde también; equivocarse
 * por abajo es que a alguien no le llegue un directo, que es la mitad de para
 * lo que esto sirve.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
    aQuienSeLeEmpuja,
    comoTextoDeAviso,
} from "./.compilado/aviso-del-equipo.js";

const A = "persona-a";
const B = "persona-b";
const C = "persona-c";

test("un directo avisa a la OTRA persona, sin mención ninguna", () => {
    assert.deepEqual(
        aQuienSeLeEmpuja({ tipo: "directo", miembros: [A, B], autorId: A, mencionados: [] }),
        [B],
    );
});

test("nunca al autor, ni estando en los miembros", () => {
    const salen = aQuienSeLeEmpuja({
        tipo: "directo",
        miembros: [A, B],
        autorId: A,
        mencionados: [],
    });
    assert.ok(!salen.includes(A), "el autor no puede recibir su propio mensaje");
});

test("ni al autor cuando se menciona a sí mismo", () => {
    assert.deepEqual(
        aQuienSeLeEmpuja({ tipo: "area", miembros: [A, B], autorId: A, mencionados: [A, B] }),
        [B],
    );
});

test("el GENERAL sin mención no empuja a nadie", () => {
    assert.deepEqual(
        aQuienSeLeEmpuja({
            tipo: "general",
            miembros: [A, B, C],
            autorId: A,
            mencionados: [],
        }),
        [],
        "es el canal donde está todo el mundo: sonar con todo es enseñar a ignorarlo",
    );
});

test("el general CON mención empuja solo a los mencionados", () => {
    assert.deepEqual(
        aQuienSeLeEmpuja({
            tipo: "general",
            miembros: [A, B, C],
            autorId: A,
            mencionados: [C],
        }),
        [C],
    );
});

test("un canal de área sin mención tampoco empuja", () => {
    assert.deepEqual(
        aQuienSeLeEmpuja({ tipo: "area", miembros: [A, B, C], autorId: A, mencionados: [] }),
        [],
    );
});

test("un canal de área con mención empuja a los mencionados, no a todo el canal", () => {
    assert.deepEqual(
        aQuienSeLeEmpuja({ tipo: "area", miembros: [A, B, C], autorId: A, mencionados: [B] }),
        [B],
        "empujarle el canal entero a todo el mundo es tanto como no tener avisos",
    );
});

test("miembro y mencionado a la vez sale UNA sola vez", () => {
    assert.deepEqual(
        aQuienSeLeEmpuja({ tipo: "directo", miembros: [A, B], autorId: A, mencionados: [B] }),
        [B],
    );
});

test("los mencionados repetidos se deduplican", () => {
    assert.deepEqual(
        aQuienSeLeEmpuja({ tipo: "area", miembros: [], autorId: A, mencionados: [B, B, C, B] }),
        [B, C],
    );
});

test("las entradas vacías o en blanco no cuentan como personas", () => {
    assert.deepEqual(
        aQuienSeLeEmpuja({
            tipo: "directo",
            miembros: ["", "   ", B],
            autorId: A,
            mencionados: [""],
        }),
        [B],
    );
});

test("un directo cuyo único miembro es el autor no empuja a nadie", () => {
    assert.deepEqual(
        aQuienSeLeEmpuja({ tipo: "directo", miembros: [A], autorId: A, mencionados: [] }),
        [],
    );
});

test("un directo sin miembros cargados no inventa destinatarios", () => {
    assert.deepEqual(
        aQuienSeLeEmpuja({ tipo: "directo", miembros: [], autorId: A, mencionados: [] }),
        [],
    );
});

test("el texto del aviso se recorta y no parte el aviso", () => {
    const largo = "a".repeat(400);
    const salida = comoTextoDeAviso(largo);
    assert.ok(salida.length <= 160, `se fue a ${salida.length}`);
    assert.ok(salida.endsWith("…"), "lo recortado tiene que decir que sigue");
});

test("un texto corto sale tal cual, sin puntos suspensivos", () => {
    assert.equal(comoTextoDeAviso("hola equipo"), "hola equipo");
});

test("los saltos de línea se aplastan: un aviso es una línea", () => {
    assert.equal(comoTextoDeAviso("hola\n\n  equipo  "), "hola equipo");
});
