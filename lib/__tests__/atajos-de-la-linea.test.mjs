/**
 * La decisión de los atajos por línea, pura y sin base.
 *
 * `MODO=roto` corre la regla de antes —el panel ofrecía TODO lo que traía la
 * bandeja, sin mirar de qué cuenta— y afirma el fallo.
 *
 * Se levanta con `scripts/banco-atajos-de-la-linea.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
    atajosDeLaConversacion,
    elAtajoEsDeLaLinea,
    cuentasDeLasFilas,
    porQueNoEsDeLaLinea,
} from "./.compilado/atajos/atajos-de-la-linea.js";

const ROTO = process.env.MODO === "roto";
// Lo que hacía el panel antes: pintar la lista tal cual llegaba.
const ofrecer = ROTO ? (todos) => [...todos] : atajosDeLaConversacion;

const TODOS = [
    { id: "wm", cuentaId: "madre" },
    { id: "wa", cuentaId: "atencion" },
    { id: "wa2", cuentaId: "atencion" },
];

test("una conversación de Atención ofrece solo los de Atención", () => {
    const ids = ofrecer(TODOS, "atencion").map((a) => a.id);
    if (ROTO) return assert.ok(ids.includes("wm"), "antes: salía el de la madre");
    assert.deepEqual(ids, ["wa", "wa2"]);
});

test("una cuenta sin atajos sale VACÍA, sin caer a la madre ni a una hermana", () => {
    const ids = ofrecer(TODOS, "ventas").map((a) => a.id);
    if (ROTO) return assert.ok(ids.length > 0, "antes: Ventas enseñaba los de otras cuentas");
    assert.deepEqual(ids, []);
});

test("sin cuenta conocida, vacío", () => {
    if (ROTO) return;
    assert.deepEqual(atajosDeLaConversacion(TODOS, null), []);
    assert.deepEqual(atajosDeLaConversacion(TODOS, "  "), []);
});

test("la puerta del servidor exige las dos puntas y que coincidan", () => {
    assert.equal(elAtajoEsDeLaLinea("atencion", "atencion"), true);
    assert.equal(elAtajoEsDeLaLinea("madre", "atencion"), false);
    assert.equal(elAtajoEsDeLaLinea(null, "atencion"), false);
    assert.equal(elAtajoEsDeLaLinea("atencion", null), false);
    assert.equal(elAtajoEsDeLaLinea("", ""), false);
});

test("un atajo creado por un asesor es de la cuenta para la que trabaja", () => {
    const mapa = cuentasDeLasFilas(
        ["asesor", "atencion", "desconocido"],
        [{ id: "asesor", ownerId: "atencion" }, { id: "atencion", ownerId: null }],
    );
    assert.equal(mapa.get("asesor"), "atencion");
    assert.equal(mapa.get("atencion"), "atencion");
    assert.equal(mapa.get("desconocido"), "desconocido");
});

test("el motivo nombra la línea", () => {
    assert.match(porQueNoEsDeLaLinea("workflow", "VENTAS"), /línea VENTAS/);
});
