/**
 * La CALIDAD SEMANAL, sin base: la regla del resumen y un barrido del código.
 *
 * - El resumen: promedio de la semana, el mejor asesor (y el desempate), el
 *   dueño que atiende solo —su puntaje, sin «mejor asesor»— y que sin nada
 *   evaluado NO hay sección (nunca «0/100»).
 * - Las líneas: una o dos, las MISMAS en el WhatsApp y en Reportes.
 * - El barrido: el cron diario ya no evalúa, el runner no espera reposo, y el
 *   corte semanal evalúa ANTES de mandar cada reporte.
 *
 * `MODO=roto` lee lo mismo de ANTES_REF y afirma el fallo.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

import * as calidad from "./.compilado/calidad-semanal/calidad-de-conversaciones.js";

const ROTO = process.env.MODO === "roto";
const ANTES = process.env.ANTES_REF ?? "2017da3";
const leer = (p) => (ROTO ? execSync(`git show '${ANTES}:${p}'`, { encoding: "utf8" }) : readFileSync(p, "utf8"));

const nombres = new Map([["ana", "Ana"], ["beto", "Beto"], ["carla", "Carla"]]);

test("el resumen: promedio de todo lo evaluado y el mejor asesor entre las personas", () => {
    if (ROTO) {
        assert.equal(calidad.elResumenSemanalDeCalidad, undefined, "EL FALLO: no había resumen de calidad para el reporte");
        return;
    }
    const filas = [
        { asesorId: "ana", puntaje: 90 },
        { asesorId: "ana", puntaje: 80 },
        { asesorId: "beto", puntaje: 60 },
        { asesorId: null, puntaje: 70 }, // la IA: cuenta en el promedio, no compite
        { asesorId: "beto", puntaje: null }, // sin puntaje: ni cuenta ni compite
    ];
    const r = calidad.elResumenSemanalDeCalidad(filas, { tieneEquipo: true, nombres });
    assert.equal(r.conversaciones, 4);
    assert.equal(r.puntajePromedio, 75);
    assert.equal(r.soloElDueno, false);
    assert.deepEqual(r.mejor, { asesorId: "ana", nombre: "Ana", puntaje: 85, conversaciones: 2 });
});

test("a igualdad de puntaje gana quien atendió más", () => {
    if (ROTO) return;
    const r = calidad.elResumenSemanalDeCalidad(
        [{ asesorId: "carla", puntaje: 80 }, { asesorId: "beto", puntaje: 80 }, { asesorId: "beto", puntaje: 80 }],
        { tieneEquipo: true, nombres },
    );
    assert.equal(r.mejor.nombre, "Beto");
});

test("sin equipo: el puntaje es del dueño y NO se nombra a ningún mejor asesor", () => {
    if (ROTO) return;
    const r = calidad.elResumenSemanalDeCalidad([{ asesorId: "dueno", puntaje: 82 }, { asesorId: null, puntaje: 78 }], {
        tieneEquipo: false,
        nombres,
    });
    assert.equal(r.soloElDueno, true);
    assert.equal(r.mejor, null);
    const lineas = calidad.lasLineasDeLaCalidad(r, { negrilla: true });
    assert.deepEqual(lineas, ["⭐ Tu calidad de atención: *80/100* (2 conversaciones evaluadas)"]);
});

test("con equipo: dos líneas como mucho, y una sola si nadie tiene asesor", () => {
    if (ROTO) return;
    const r = calidad.elResumenSemanalDeCalidad([{ asesorId: "ana", puntaje: 90 }], { tieneEquipo: true, nombres });
    assert.deepEqual(calidad.lasLineasDeLaCalidad(r, { negrilla: true }), [
        "⭐ Calidad del equipo: *90/100* (1 conversación evaluada)",
        "🏆 Mejor asesor: *Ana* (90/100)",
    ]);
    assert.deepEqual(calidad.lasLineasDeLaCalidad(r, { negrilla: false }), [
        "⭐ Calidad del equipo: 90/100 (1 conversación evaluada)",
        "🏆 Mejor asesor: Ana (90/100)",
    ], "Reportes pinta las mismas líneas, sin los asteriscos de WhatsApp");
    const soloIa = calidad.elResumenSemanalDeCalidad([{ asesorId: null, puntaje: 70 }], { tieneEquipo: true, nombres });
    assert.equal(calidad.lasLineasDeLaCalidad(soloIa, { negrilla: true }).length, 1);
});

test("sin nada evaluado no hay sección: nunca un «0/100»", () => {
    if (ROTO) return;
    assert.equal(calidad.elResumenSemanalDeCalidad([], { tieneEquipo: true, nombres }), null);
    assert.equal(calidad.elResumenSemanalDeCalidad([{ asesorId: "ana", puntaje: null }], { tieneEquipo: false, nombres }), null);
});

test("barrido: el cron diario ya no evalúa la calidad", () => {
    const cron = leer("app/api/cron/billing/route.ts");
    if (ROTO) {
        assert.ok(cron.includes("lanzarElBarridoDeCalidad()"), "EL FALLO: el QA corría solo, todos los días");
        return;
    }
    assert.ok(!/lanzarElBarridoDeCalidad|evaluarLaCalidad/.test(cron), "el cron de facturación no toca la calidad");
    const runner = leer("lib/calidad-runner.server.ts");
    assert.ok(!runner.includes("lanzarElBarridoDeCalidad"), "no queda ningún barrido diario que lanzar");
});

test("barrido: el runner no espera reposo", () => {
    const runner = leer("lib/calidad-runner.server.ts");
    const regla = leer("lib/calidad-de-conversaciones.ts");
    if (ROTO) {
        assert.ok(runner.includes("REPOSO_ANTES_DE_EVALUAR_MS"), "EL FALLO: se esperaban dos horas sin mensajes");
        return;
    }
    assert.ok(!/REPOSO/.test(runner) && !/export const REPOSO/.test(regla));
    assert.ok(runner.includes("hasta: ahora"), "se evalúa hasta este momento");
});

test("barrido: el corte semanal evalúa ANTES de cada reporte, y el reporte y la pantalla dicen lo mismo", () => {
    const semanal = leer("lib/weekly-report-runner.server.ts");
    const vista = leer("app/(root)/crm/dashboard/components/WeeklyReportsView.tsx");
    if (ROTO) {
        assert.ok(!semanal.includes("evaluarLaCalidadDeLaCuenta"), "EL FALLO: el reporte no tenía corte de calidad");
        assert.ok(!semanal.includes("CALIDAD"), "EL FALLO: ni sección de calidad");
        return;
    }
    const bucle = semanal.slice(semanal.indexOf("export async function runWeeklyReportForAllUsers"));
    assert.ok(bucle.indexOf("evaluarLaCalidadDeLaCuenta(") < bucle.indexOf("generateWeeklyReportForUser("), "se evalúa antes de mandar");
    const generar = semanal.slice(semanal.indexOf("export async function generateWeeklyReportForUser"), semanal.indexOf("// ─── Cron: all users"));
    assert.ok(!generar.includes("evaluarLaCalidad"), "generar a mano NO gasta créditos: solo lee lo evaluado");
    assert.ok(semanal.includes("lasLineasDeLaCalidad(metrics.calidad, { negrilla: true })"));
    assert.ok(vista.includes("lasLineasDeLaCalidad(m.calidad, { negrilla: false })"), "Reportes pinta las mismas líneas");
    // La acción de «Evaluar ahora» sigue siendo la única puerta a pedido.
    assert.ok(leer("actions/calidad-actions.ts").includes("evaluarLaCalidadDeLaCuenta(cuenta)"));
});
