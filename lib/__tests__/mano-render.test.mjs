/**
 * Cómo pinta cada cliente la mano levantada, montando el componente REAL
 * (`RecuadrosDeLaSala`) con react-test-renderer, sin navegador.
 *
 * Es la otra mitad del banco de la mano: el de Postgres prueba que el dato
 * **llega** a los demás; este prueba que, con ese dato, **se pinta** en el
 * recuadro de esa persona —y solo en el suyo—, en los dos repartos (cuadrícula
 * y orador). El recuadro pone un `aria-label` «<nombre> ha levantado la mano»
 * exactamente cuando su prop `manoLevantada` es cierta, así que contar esas
 * etiquetas es contar las manos que se ven.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import React from "react";
import TestRenderer from "react-test-renderer";

import { RecuadrosDeLaSala } from "./.compilado/mano/recuadros.mjs";

const { act } = TestRenderer;
const h = React.createElement;

/** Tres personas; `manoDe` es la lista de nombres con la mano levantada. */
function gente(manoDe = []) {
    return ["Ana (tú)", "Beto", "Caro"].map((nombre, i) => ({
        id: `p${i}`,
        stream: null,
        nombre,
        hayVideo: false,
        micEncendido: true,
        compartiendo: false,
        manoLevantada: manoDe.includes(nombre),
        propio: i === 0,
    }));
}

/** Los nombres que el árbol marca como «ha levantado la mano». */
function manosVisibles(arbol) {
    const nombres = [];
    const recorrer = (nodo) => {
        if (!nodo || typeof nodo !== "object") return;
        const label = nodo.props?.["aria-label"];
        if (typeof label === "string" && label.endsWith("ha levantado la mano")) {
            nombres.push(label.replace(" ha levantado la mano", ""));
        }
        const hijos = nodo.children ?? [];
        for (const hijo of Array.isArray(hijos) ? hijos : [hijos]) recorrer(hijo);
    };
    for (const raiz of arbol) recorrer(raiz);
    return nombres.sort();
}

function pintar(props) {
    let r;
    act(() => {
        r = TestRenderer.create(h(RecuadrosDeLaSala, props));
    });
    const arbol = r.toJSON();
    return manosVisibles(Array.isArray(arbol) ? arbol : [arbol]);
}

for (const distribucion of ["cuadricula", "orador"]) {
    test(`[${distribucion}] la mano de un REMOTO se pinta en su recuadro`, () => {
        const manos = pintar({
            gente: gente(["Beto"]),
            distribucion,
            enGrande: "p0",
        });
        // La ve todo el mundo, no solo Beto: su recuadro lleva la marca.
        assert.deepEqual(manos, ["Beto"], "solo Beto tiene la mano, y se pinta");
    });

    test(`[${distribucion}] al bajarla, no queda ninguna marca`, () => {
        const manos = pintar({
            gente: gente([]),
            distribucion,
            enGrande: "p0",
        });
        assert.deepEqual(manos, [], "nadie con la mano → ninguna marca");
    });

    test(`[${distribucion}] varias manos a la vez se pintan todas`, () => {
        const manos = pintar({
            gente: gente(["Ana (tú)", "Caro"]),
            distribucion,
            enGrande: "p0",
        });
        assert.deepEqual(manos, ["Ana (tú)", "Caro"]);
    });
}
