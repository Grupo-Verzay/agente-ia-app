/**
 * Qué etiquetas se ofrecen a una conversación de Chats: la decisión, pura.
 *
 * `MODO=roto` corre la regla de antes —el selector ofrecía las etiquetas de la
 * cuenta de QUIEN MIRA, fuera cual fuera la línea de la conversación— y afirma
 * el fallo: una conversación de Atención vista desde la madre ofrecía las de la
 * madre. Sin ese modo no se sabría si lo verde es que la regla se cumple o que
 * el caso no se ejerce.
 *
 * Se levanta con `scripts/banco-etiquetas-de-la-linea.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
    etiquetasDeLaConversacion,
    etiquetasDelLote,
    etiquetasDelFiltro,
} from "./.compilado/etiquetas/etiquetas-de-la-linea.js";

const ROTO = process.env.MODO === "roto";

const MADRE = "madre";
const ATENCION = "atencion";
const VENTAS = "ventas";

const TODAS = [
    { id: 1, name: "Madre: VIP", userId: MADRE },
    { id: 2, name: "Atención: Reclamo", userId: ATENCION },
    { id: 3, name: "Atención: Resuelto", userId: ATENCION },
    { id: 4, name: "Ventas: Interesado", userId: VENTAS },
];

/** Lo que había: las de la cuenta de quien mira, sin mirar la conversación. */
const deAntes = (todas, _cuentaDeLaConversacion, cuentaDeQuienMira) =>
    todas.filter((t) => t.userId === cuentaDeQuienMira);

const ofrecer = ROTO
    ? (todas, cuenta) => deAntes(todas, cuenta, MADRE)
    : (todas, cuenta) => etiquetasDeLaConversacion(todas, cuenta);

const ids = (lista) => lista.map((t) => t.id);

if (ROTO) {
    test("ROTO: una conversación de Atención vista desde la madre ofrece las de la madre", () => {
        assert.deepEqual(ids(ofrecer(TODAS, ATENCION)), [1]);
    });
    test("ROTO: una línea sin etiquetas propias ofrece las de otra", () => {
        assert.deepEqual(ids(ofrecer(TODAS.filter((t) => t.userId !== VENTAS), VENTAS)), [1]);
    });
} else {
    test("Atención ofrece solo las de Atención", () => {
        assert.deepEqual(ids(ofrecer(TODAS, ATENCION)), [2, 3]);
    });

    test("Ventas ofrece solo las de Ventas", () => {
        assert.deepEqual(ids(ofrecer(TODAS, VENTAS)), [4]);
    });

    test("una línea sin etiquetas sale VACÍA, sin caer a las de otra", () => {
        const sinVentas = TODAS.filter((t) => t.userId !== VENTAS);
        assert.deepEqual(ids(ofrecer(sinVentas, VENTAS)), []);
    });

    test("sin cuenta (sin ficha CRM) no se ofrece ninguna", () => {
        assert.deepEqual(ids(ofrecer(TODAS, null)), []);
        assert.deepEqual(ids(ofrecer(TODAS, "  ")), []);
    });

    test("una etiqueta sin dueña no se ofrece en ninguna conversación", () => {
        assert.deepEqual(ids(ofrecer([{ id: 9, name: "x" }], ATENCION)), []);
    });

    test("el lote de una sola cuenta ofrece las de esa cuenta", () => {
        const r = etiquetasDelLote(TODAS, [ATENCION, ATENCION, null]);
        assert.deepEqual(ids(r.etiquetas), [2, 3]);
        assert.equal(r.variasCuentas, false);
    });

    test("el lote que mezcla líneas de cuentas distintas no ofrece ninguna", () => {
        const r = etiquetasDelLote(TODAS, [ATENCION, VENTAS]);
        assert.deepEqual(ids(r.etiquetas), []);
        assert.equal(r.variasCuentas, true);
    });

    test("el filtro sin línea elegida ofrece todas; con línea, las de su cuenta", () => {
        assert.deepEqual(ids(etiquetasDelFiltro(TODAS, null)), [1, 2, 3, 4]);
        assert.deepEqual(ids(etiquetasDelFiltro(TODAS, VENTAS)), [4]);
    });
}
