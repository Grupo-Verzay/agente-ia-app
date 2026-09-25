/**
 * Los números de la línea de estado, sin navegador: nombre + estado caben
 * EXACTOS en la fila 1, y la cabecera no se movió de 78 px ni de 6 de margen.
 */
import test from "node:test";
import assert from "node:assert/strict";
import * as c from "./.compilado/cabeceras-de-chats.js";

test("nombre (18) + estado (14) = la fila 1 (32)", () => {
    assert.equal(c.ALTO_LINEA_DEL_NOMBRE + c.ALTO_LINEA_DEL_ESTADO, c.ALTO_FILA_1);
    assert.equal(c.ALTO_LINEA_DEL_NOMBRE, 18);
    assert.equal(c.ALTO_LINEA_DEL_ESTADO, 14);
});

test("las clases dicen esos números", () => {
    assert.match(c.LINEA_DEL_NOMBRE, new RegExp(`leading-\\[${c.ALTO_LINEA_DEL_NOMBRE / 16}rem\\]`));
    assert.match(c.LINEA_DEL_ESTADO, new RegExp(`leading-\\[${c.ALTO_LINEA_DEL_ESTADO / 16}rem\\]`));
    // El lápiz (28) sobresale (28 − 18) / 2 a cada lado de la línea del nombre.
    assert.match(c.LAPIZ_SIN_ALTO, new RegExp(`-my-\\[${(c.LADO_DEL_CONTROL - c.ALTO_LINEA_DEL_NOMBRE) / 2 / 16}rem\\]`));
    // La línea de estado NO puede ser `text-xs`: dentro del módulo vale 14/20.
    assert.doesNotMatch(c.LINEA_DEL_ESTADO, /\btext-xs\b/);
});

test("la cabecera no se toca: 78 px, 6 de margen, iconos de 28", () => {
    assert.equal(c.ALTO_DE_LAS_CABECERAS, 78);
    assert.equal(c.MARGEN_DE_LAS_CABECERAS, 6);
    assert.equal(c.LADO_DEL_CONTROL, 28);
    assert.equal(c.CABECERA_ESCRITORIO, "md:h-[4.875rem] md:p-1.5 md:gap-1");
});
