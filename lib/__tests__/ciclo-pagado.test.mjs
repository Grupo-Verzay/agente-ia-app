/**
 * La regla del ciclo pagado, sin base ninguna (`lib/ciclo-pagado.ts`).
 *
 * Qué se comprueba:
 *
 * - el vencimiento avanza UN ciclo, desde el vencimiento si no ha pasado y
 *   desde hoy si ya pasó — la misma cuenta para Wompi y «Marcar pagado»;
 * - mover la fecha HACIA ADELANTE en «Editar pagos» es renovar, y corregirla
 *   hacia atrás o borrarla no;
 * - aprobar una suscripción no le quita a una cuenta su plan `personalizado`;
 * - las dos suscripciones que esperan algo se pueden aprobar.
 *
 * Como se corre: `scripts/banco-ciclo-pagado.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
    DIAS_DE_UN_CICLO,
    elPlanQueQueda,
    elSiguienteVencimiento,
    esUnaRenovacion,
    estaPendiente,
    losDiasDelCiclo,
    vuelveLaCuenta,
} from "./.compilado/ciclo-pagado/ciclo-pagado.js";

const HOY = new Date("2026-09-27T15:00:00-05:00");
const dias = (d) => new Date(HOY.getTime() + d * 86400000);
const diff = (a, b) => Math.round((a.getTime() - b.getTime()) / 86400000);

test("vencido: el ciclo nuevo cuenta desde HOY", () => {
    const vence = elSiguienteVencimiento({ dueDate: dias(-5), licenseDays: 30 }, HOY);
    assert.equal(diff(vence, HOY), 30);
});

test("al día: el ciclo se suma al vencimiento, no se pierden días", () => {
    const vence = elSiguienteVencimiento({ dueDate: dias(3), licenseDays: 30 }, HOY);
    assert.equal(diff(vence, HOY), 33);
});

test("sin vencimiento: desde hoy", () => {
    assert.equal(diff(elSiguienteVencimiento({}, HOY), HOY), DIAS_DE_UN_CICLO);
});

test("los días del ciclo salen de la ficha; lo raro cae en 30", () => {
    assert.equal(losDiasDelCiclo(90), 90);
    assert.equal(losDiasDelCiclo(null), 30);
    assert.equal(losDiasDelCiclo(0), 30);
    assert.equal(losDiasDelCiclo(-4), 30);
    assert.equal(losDiasDelCiclo(Number.NaN), 30);
});

test("elSiguienteVencimiento no muta la fecha que recibe", () => {
    const d = dias(3);
    const antes = d.getTime();
    elSiguienteVencimiento({ dueDate: d, licenseDays: 30 }, HOY);
    assert.equal(d.getTime(), antes);
});

test("Editar pagos: solo la fecha que AVANZA repone créditos", () => {
    assert.equal(esUnaRenovacion(dias(-2), dias(28)), true, "adelante = renovar");
    assert.equal(esUnaRenovacion(null, dias(28)), true, "sin fecha antes = renovar");
    assert.equal(esUnaRenovacion(dias(28), dias(27)), false, "corregir para atrás no regala créditos");
    assert.equal(esUnaRenovacion(dias(28), dias(28)), false, "la misma fecha no es un pago");
    assert.equal(esUnaRenovacion(dias(28), null), false, "borrarla no es un pago");
    assert.equal(esUnaRenovacion(dias(28), "no es una fecha"), false);
});

test("Aprobar no le quita a una cuenta su plan personalizado", () => {
    assert.equal(elPlanQueQueda("personalizado", "basico"), "personalizado");
    assert.equal(elPlanQueQueda("lite", "enterprise"), "enterprise");
    assert.equal(elPlanQueQueda(null, "basico"), "basico");
});

test("la cuenta vuelve a habilitarse solo si la cortó la suspensión", () => {
    assert.equal(vuelveLaCuenta("SUSPENDED"), true);
    assert.equal(vuelveLaCuenta("ACTIVE"), false);
    assert.equal(vuelveLaCuenta(null), false);
});

test("pendientes: las dos que esperan algo, y ninguna más", () => {
    assert.equal(estaPendiente("PENDING_PAYMENT"), true, "la de Wompi también se puede aprobar");
    assert.equal(estaPendiente("PENDING_APPROVAL"), true);
    for (const e of ["ACTIVE", "REJECTED", "EXPIRED", "CANCELLED", null]) {
        assert.equal(estaPendiente(e), false, String(e));
    }
});
