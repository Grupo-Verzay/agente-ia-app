/**
 * Cómo pinta la puerta el emblema, montando el componente REAL
 * (`EmblemaDeLaReunion`) con react-test-renderer, sin navegador.
 *
 * Es la otra mitad del banco: el de Postgres prueba que el logo correcto
 * **llega**; este prueba que, con ese dato, se pinta el `<img>` —y que sin logo,
 * o si la imagen no carga, se cae al icono de cámara—, que es el respaldo
 * pedido. Así una regresión que deje de enseñar el logo, o que no respete el
 * respaldo, se caza aquí.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import React from "react";
import TestRenderer from "react-test-renderer";

import { EmblemaDeLaReunion } from "./.compilado/logo/emblema.mjs";

const { act } = TestRenderer;
const h = React.createElement;

function montar(props) {
    let r;
    act(() => {
        r = TestRenderer.create(h(EmblemaDeLaReunion, props));
    });
    return r;
}

test("con logo → se pinta el <img> con ese src, y ningún icono", () => {
    const src = "https://medias3.verzay.co/logos/a.png";
    const r = montar({ logo: src });
    const imgs = r.root.findAllByType("img");
    assert.equal(imgs.length, 1, "hay un logo");
    assert.equal(imgs[0].props.src, src, "es el src que llega");
    assert.equal(r.root.findAllByType("svg").length, 0, "sin icono cuando hay logo");
});

test("sin logo → el icono de cámara, ningún <img>", () => {
    const r = montar({ logo: null });
    assert.equal(r.root.findAllByType("img").length, 0, "no se pinta ningún logo");
    assert.ok(r.root.findAllByType("svg").length >= 1, "queda el icono de cámara");
});

test("si el logo no carga (onError) → cae al icono", () => {
    const r = montar({ logo: "https://medias3.verzay.co/logos/roto.png" });
    const img = r.root.findAllByType("img")[0];
    assert.ok(img, "de partida hay logo");
    act(() => {
        img.props.onError();
    });
    assert.equal(r.root.findAllByType("img").length, 0, "el logo roto se retira");
    assert.ok(r.root.findAllByType("svg").length >= 1, "y queda el icono de cámara");
});
