/**
 * La regla del reparto por porcentaje y un barrido de la pantalla (sin base).
 *
 *   MODO=roto  lee la pantalla y las acciones de `ANTES_REF` y AFIRMA que no
 *              había un tercer modo.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";

const ROTO = process.env.MODO === "roto";
const ANTES_REF = process.env.ANTES_REF;
const r = await import("./.compilado/reparto/reparto-por-porcentaje.js");

const leer = (ruta) =>
    ROTO
        ? execSync(`git show "${ANTES_REF}:${ruta}"`, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
        : readFileSync(ruta, "utf8");

function simular(asesores, n) {
    let peor = 0;
    for (let i = 1; i <= n; i++) {
        const id = r.elegirPorPorcentaje(asesores);
        asesores.find((a) => a.id === id).asignados++;
        const disp = asesores.filter((a) => a.disponible && a.porcentaje > 0);
        const S = disp.reduce((t, a) => t + a.porcentaje, 0);
        const N = disp.reduce((t, a) => t + a.asignados, 0);
        for (const a of disp) peor = Math.max(peor, Math.abs(a.asignados - (a.porcentaje / S) * N));
    }
    return peor;
}

test("contador acumulado continuo: 60/25/15 converge exacto y nunca se desvía un chat", () => {
    const a = [
        { id: "a", porcentaje: 60, asignados: 0, disponible: true },
        { id: "b", porcentaje: 25, asignados: 0, disponible: true },
        { id: "c", porcentaje: 15, asignados: 0, disponible: true },
    ];
    assert.ok(simular(a, 2000) < 1);
    assert.deepEqual(a.map((x) => x.asignados), [1200, 500, 300]);
});

test("un asesor desactivado se salta y conserva su contador", () => {
    const a = [
        { id: "a", porcentaje: 50, asignados: 10, disponible: true },
        { id: "b", porcentaje: 50, asignados: 10, disponible: false },
    ];
    for (let i = 0; i < 5; i++) assert.equal(r.elegirPorPorcentaje(a), "a"), a[0].asignados++;
    assert.equal(a[1].asignados, 10);
});

test("los tres modos son excluyentes y lo desconocido cae en Máx. chats", () => {
    assert.deepEqual([...r.MODOS_DE_REPARTO], ["maximo", "ilimitado", "porcentaje"]);
    assert.equal(r.comoModoDeReparto("porcentaje"), "porcentaje");
    assert.equal(r.comoModoDeReparto("loteria"), "maximo");
    assert.equal(r.porQueNoSePuedeGuardar([{ id: "a", porcentaje: 70, asignados: 0, disponible: true }]), "La suma de los asesores disponibles es 70% y tiene que ser 100%.");
    const p = r.repartoAPartesIguales(["a", "b", "c"]);
    assert.deepEqual(p, { a: 34, b: 33, c: 33 });
});

test("la regla es la MISMA que la del backend (byte a byte)", () => {
    const backend = process.env.RUTA_DEL_BACKEND ?? "../api-webhook";
    const suya = `${backend}/src/modules/webhook/services/auto-assign/reparto-por-porcentaje.ts`;
    if (!existsSync(suya)) {
        console.warn(`[banco] no está el backend en ${suya}: no se comparan las dos copias`);
        return;
    }
    assert.equal(readFileSync("lib/reparto-por-porcentaje.ts", "utf8"), readFileSync(suya, "utf8"));
});

test("la barra de Equipo ofrece los TRES modos y la tabla un campo de porcentaje por asesor", () => {
    const pantalla = leer("app/(root)/equipo/_components/team-client.tsx");
    if (ROTO) {
        assert.doesNotMatch(pantalla, /Por porcentaje/);
        assert.match(pantalla, /Ilimitado/);
        assert.match(pantalla, /type="checkbox"[\s\S]{0,200}handleUnlimitedToggle/);
        return;
    }
    for (const etiqueta of ["Máx. chats", "Ilimitado", "Por porcentaje"]) assert.match(pantalla, new RegExp(etiqueta.replace(".", "\\.")));
    assert.match(pantalla, /role="radiogroup"/);
    assert.match(pantalla, /data-columna="porcentaje"/);
    // El grupo de modos y el de Tabla / Pipeline salen de la MISMA forma.
    assert.equal((pantalla.match(/className=\{claseDelSegmento\(/g) ?? []).length, 3);
    // Ya no queda la casilla suelta de «Ilimitado»: es un modo más.
    assert.doesNotMatch(pantalla, /handleUnlimitedToggle/);
});

test("el reparto de la App pasa por el porcentaje cuando está activo", () => {
    const acciones = leer("actions/advisor-assign-actions.ts");
    if (ROTO) {
        assert.doesNotMatch(acciones, /asignarPorPorcentaje/);
        return;
    }
    assert.match(acciones, /if \(reparto\.activo\)/);
    assert.match(acciones, /asignarPorPorcentaje\(ownerId, session\.id\)/);
});
