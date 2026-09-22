/**
 * La decisión del CRM de la familia, sin base y sin navegador.
 *
 * Aquí solo vive lo que se puede contestar con las listas delante: qué cuentas
 * quedan elegidas, cuándo la vista va unificada, qué fila es ajena y cuánto
 * crece el tope. Lo que este fichero NO puede probar —y por eso hay un banco
 * contra Postgres al lado— es que las consultas del CRM pasen por aquí.
 *
 * `MODO=roto` corre la forma INGENUA: consultar **solo la cuenta propia**, que
 * es lo que había antes de esto, y **afirma el fallo** —la madre no ve nada de
 * sus hijas—. Sin ese modo no se sabría si lo verde de al lado es que la regla
 * se cumple o que el caso no se llega a ejercer.
 *
 * Se levanta con `scripts/banco-crm-de-la-familia.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
    laSeleccionDelCrm,
    seEnsenaElFiltroDelCrm,
    elCrmVaUnificado,
    nombresDeLasCuentas,
    esDeOtraCuentaDelCrm,
    elTopeDelCrm,
    TECHO_DE_CUENTAS_EN_UN_TOPE,
} from "./.compilado/crm/crm-de-la-familia.js";

const ROTO = process.env.MODO === "roto";

/** La forma que había antes: cada pantalla consultaba su propia cuenta. */
function comoEraAntes(_pedidas, _alcanzables, propia) {
    return [propia];
}

const MADRE = "madre";
const HIJA_A = "hija-a";
const HIJA_B = "hija-b";
const FAMILIA = [MADRE, HIJA_A, HIJA_B];

test("sin parámetro se consulta la FAMILIA entera, no solo la propia", () => {
    if (ROTO) {
        // El fallo, afirmado: la madre tenía que entrar cuenta por cuenta.
        assert.deepEqual(comoEraAntes(null, FAMILIA, MADRE), [MADRE]);
        return;
    }
    assert.deepEqual(laSeleccionDelCrm(null, FAMILIA), FAMILIA);
    assert.deepEqual(laSeleccionDelCrm([], FAMILIA), FAMILIA);
});

test("el filtro REDUCE: elegir una deja una", () => {
    assert.deepEqual(laSeleccionDelCrm([HIJA_A], FAMILIA), [HIJA_A]);
    assert.deepEqual(laSeleccionDelCrm([MADRE, HIJA_B], FAMILIA), [MADRE, HIJA_B]);
});

test("lo que no se alcanza se descarta, y no arrastra a lo bueno", () => {
    assert.deepEqual(laSeleccionDelCrm([HIJA_A, "de-fuera"], FAMILIA), [HIJA_A]);
    // Y una lista ENTERA de ids de fuera no deja la pantalla en blanco: cae en
    // todas las alcanzables. Un `IN ()` devolvería cero filas sin decir por qué,
    // y el caso más común de llegar aquí es un `?cuentas=` rancio, no un ataque.
    assert.deepEqual(laSeleccionDelCrm(["de-fuera", "otra"], FAMILIA), FAMILIA);
});

test("los repetidos y la basura no inflan la lista", () => {
    assert.deepEqual(
        laSeleccionDelCrm([HIJA_A, HIJA_A, "  ", null, undefined], FAMILIA),
        [HIJA_A],
    );
});

test("una cuenta HIJA solo se alcanza a sí misma", () => {
    // Su `alcanzables` es `[propia]`, así que pida lo que pida —incluso la
    // madre y su hermana escritas a mano— sale ella sola. Los vínculos van
    // solo de madre a hija, y eso se cae de aquí sin una condición aparte.
    assert.deepEqual(laSeleccionDelCrm([MADRE, HIJA_B], [HIJA_A]), [HIJA_A]);
    assert.deepEqual(laSeleccionDelCrm(null, [HIJA_A]), [HIJA_A]);
});

test("el filtro se pinta solo para la MADRE de una familia de varias", () => {
    const madre = { mandaEnSuCuenta: true, esLaMadre: true, cuantasCuentas: 3 };
    assert.equal(seEnsenaElFiltroDelCrm(madre), true);
    assert.equal(seEnsenaElFiltroDelCrm({ ...madre, esLaMadre: false }), false);
    assert.equal(seEnsenaElFiltroDelCrm({ ...madre, cuantasCuentas: 1 }), false);
    // Un `agente` participa, no administra.
    assert.equal(seEnsenaElFiltroDelCrm({ ...madre, mandaEnSuCuenta: false }), false);
});

test("con una sola cuenta elegida la pantalla NO va unificada", () => {
    assert.equal(elCrmVaUnificado([MADRE]), false);
    assert.equal(elCrmVaUnificado([]), false);
    assert.equal(elCrmVaUnificado([MADRE, HIJA_A]), true);
});

test("sin dueño una fila NO es ajena", () => {
    // Se pintaría un candado sobre una fila perfectamente editable.
    assert.equal(esDeOtraCuentaDelCrm(null, MADRE), false);
    assert.equal(esDeOtraCuentaDelCrm("", MADRE), false);
    assert.equal(esDeOtraCuentaDelCrm(MADRE, MADRE), false);
    assert.equal(esDeOtraCuentaDelCrm(HIJA_A, MADRE), true);
});

test("el tope CRECE con las cuentas, y tiene techo", () => {
    assert.equal(elTopeDelCrm(200, 1), 200);
    assert.equal(elTopeDelCrm(200, 3), 600);
    // Sin esto, unificar tres cuentas haría que cada una enseñara un tercio de
    // lo que enseña sola —van ordenadas por fecha, así que se intercalan— y
    // unificar se vería como perder filas.
    assert.ok(elTopeDelCrm(200, 3) > elTopeDelCrm(200, 1));
    assert.equal(elTopeDelCrm(200, 50), 200 * TECHO_DE_CUENTAS_EN_UN_TOPE);
    // Nunca cero: una lista con `take: 0` sale vacía y se lee como que no hay nada.
    assert.ok(elTopeDelCrm(0, 0) >= 1);
});

test("los nombres se indexan por id", () => {
    const nombres = nombresDeLasCuentas([
        { id: MADRE, nombre: "Grupo Verzay", moneda: "COP", esLaPropia: true },
        { id: HIJA_A, nombre: "Verzay | Ventas", moneda: "COP", esLaPropia: false },
    ]);
    assert.equal(nombres[MADRE], "Grupo Verzay");
    assert.equal(nombres[HIJA_A], "Verzay | Ventas");
    assert.equal(nombres["no-esta"], undefined);
});
