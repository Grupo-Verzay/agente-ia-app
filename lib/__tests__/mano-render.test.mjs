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

/** Texto plano de un nodo (concatena sus hijos de texto). */
function textoDe(nodo) {
    if (typeof nodo === "string") return nodo;
    if (!nodo || typeof nodo !== "object") return "";
    const hijos = nodo.children ?? [];
    return (Array.isArray(hijos) ? hijos : [hijos]).map(textoDe).join("");
}

/**
 * ¿La mano de `nombre` está EN EL PIE, junto a su nombre —y no como un badge
 * arriba a la izquierda, donde la tapaba la cabecera «Reunión»—?
 *
 * Se busca el contenedor (el pie) que tiene a la vez el badge de la mano de esa
 * persona y su nombre; y se comprueba que el badge no lleva `top-` (no está
 * posicionado arriba). Sin esto, un refactor podría devolver la mano a la
 * esquina que la ocultaba y los bancos de dato seguirían en verde.
 */
function manoEnElPie(arbol, nombre) {
    const label = `${nombre} ha levantado la mano`;
    let ok = false;
    const recorrer = (nodo) => {
        if (!nodo || typeof nodo !== "object") return;
        const lista = Array.isArray(nodo.children) ? nodo.children : nodo.children ? [nodo.children] : [];
        const badge = lista.find(
            (h) => h && typeof h === "object" && h.props?.["aria-label"] === label,
        );
        const tieneNombre = lista.some(
            (h) => h && typeof h === "object" && textoDe(h) === nombre,
        );
        if (badge && tieneNombre) {
            ok = true;
            const clase = String(badge.props?.className ?? "");
            assert.ok(
                !/\btop-/.test(clase),
                `el badge de la mano de ${nombre} no puede ir posicionado arriba (estaba: "${clase}")`,
            );
        }
        for (const h of lista) recorrer(h);
    };
    for (const raiz of arbol) recorrer(raiz);
    return ok;
}

function pintar(props) {
    let r;
    act(() => {
        r = TestRenderer.create(h(RecuadrosDeLaSala, props));
    });
    const arbol = r.toJSON();
    return Array.isArray(arbol) ? arbol : [arbol];
}

for (const distribucion of ["cuadricula", "orador"]) {
    test(`[${distribucion}] la mano de un REMOTO se pinta en su recuadro, EN EL PIE`, () => {
        const arbol = pintar({ gente: gente(["Beto"]), distribucion, enGrande: "p0" });
        // La ve todo el mundo, no solo Beto: su recuadro lleva la marca.
        assert.deepEqual(manosVisibles(arbol), ["Beto"], "solo Beto tiene la mano, y se pinta");
        // Y va en el pie, no en la esquina que tapaba «Reunión».
        assert.ok(manoEnElPie(arbol, "Beto"), "la mano de Beto va en el pie, junto a su nombre");
    });

    test(`[${distribucion}] al bajarla, no queda ninguna marca`, () => {
        const arbol = pintar({ gente: gente([]), distribucion, enGrande: "p0" });
        assert.deepEqual(manosVisibles(arbol), [], "nadie con la mano → ninguna marca");
    });

    test(`[${distribucion}] varias manos a la vez se pintan todas`, () => {
        const arbol = pintar({ gente: gente(["Ana (tú)", "Caro"]), distribucion, enGrande: "p0" });
        assert.deepEqual(manosVisibles(arbol), ["Ana (tú)", "Caro"]);
        assert.ok(manoEnElPie(arbol, "Caro"), "la mano de Caro va en el pie");
    });
}
