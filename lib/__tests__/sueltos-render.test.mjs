/**
 * La zona de «sin carpeta» del árbol de Documentos, montando el componente
 * REAL (`EspaciosSueltos`) con react-test-renderer, sin navegador.
 *
 * El encargo: la pista «Sin carpeta · arrastra aquí para sacar un espacio»
 * —cuando hay carpetas pero ningún espacio suelto— solo debe verse MIENTRAS se
 * arrastra un espacio; el resto del tiempo, no. El resto de casos no cambia:
 * con espacios sueltos se ve el rótulo «Sin carpeta», y sin carpetas no hay
 * cabecera ninguna.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import React from "react";
import TestRenderer from "react-test-renderer";

import { EspaciosSueltos } from "./.compilado/sueltos/sueltos.mjs";

const { act } = TestRenderer;
const h = React.createElement;

/** Todo el texto del árbol pintado, concatenado. */
function textoDe(nodo) {
    if (typeof nodo === "string") return nodo;
    if (!nodo || typeof nodo !== "object") return "";
    const hijos = nodo.children ?? [];
    return (Array.isArray(hijos) ? hijos : [hijos]).map(textoDe).join("");
}

function pintar(props) {
    let r;
    act(() => {
        r = TestRenderer.create(
            h(EspaciosSueltos, props, h("div", null, "CONTENIDO")),
        );
    });
    const arbol = r.toJSON();
    return (Array.isArray(arbol) ? arbol : [arbol]).map(textoDe).join("");
}

const PISTA = "arrastra aquí para sacar un espacio";

test("EL FALLO: con carpetas y sin sueltos, SIN arrastrar → no sale la pista", () => {
    const texto = pintar({ id: "SUELTOS", hayCarpetas: true, vacio: true, arrastrando: false });
    assert.ok(!texto.includes(PISTA), "la pista no puede verse en reposo");
    assert.ok(!texto.includes("Sin carpeta"), "ni siquiera el rótulo: no hay nada suelto");
    assert.ok(texto.includes("CONTENIDO"), "el droppable sigue envolviendo a sus hijos");
});

test("mientras se arrastra (con carpetas y sin sueltos) → sí sale la pista", () => {
    const texto = pintar({ id: "SUELTOS", hayCarpetas: true, vacio: true, arrastrando: true });
    assert.ok(texto.includes(PISTA), "arrastrando, la pista aparece como destino");
});

test("con espacios sueltos → sale «Sin carpeta» y nunca la pista", () => {
    for (const arrastrando of [false, true]) {
        const texto = pintar({
            id: "SUELTOS",
            hayCarpetas: true,
            vacio: false,
            arrastrando,
        });
        assert.ok(texto.includes("Sin carpeta"), "el rótulo encabeza los sueltos reales");
        assert.ok(!texto.includes(PISTA), "con sueltos, la pista de arrastre no aplica");
        assert.ok(texto.includes("CONTENIDO"), "los espacios sueltos se pintan");
    }
});

test("sin carpetas → nunca hay cabecera, ni arrastrando", () => {
    const texto = pintar({ id: "SUELTOS", hayCarpetas: false, vacio: true, arrastrando: true });
    assert.ok(!texto.includes("Sin carpeta"), "sin carpetas no hay rótulo");
    assert.ok(!texto.includes(PISTA), "sin carpetas no hay pista");
    assert.ok(texto.includes("CONTENIDO"), "el árbol de siempre se pinta");
});
