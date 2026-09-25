/**
 * Las repeticiones de un flujo: la regla pura y la pantalla, sin base.
 *
 * `MODO=roto` lee la pantalla de `ANTES_REF` con `git show` y AFIRMA que allí
 * no había forma de configurarlo: ni opción en el menú del flujo ni diálogo.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const ROTO = process.env.MODO === "roto";
const ANTES_REF = process.env.ANTES_REF || "e72e56d";

const r = await import("./.compilado/repeticiones/repeticiones-de-flujo.js");

const leer = (ruta) =>
    ROTO
        ? (() => {
              try {
                  return execSync(`git show ${ANTES_REF}:"${ruta}"`, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
              } catch {
                  return "";
              }
          })()
        : readFileSync(ruta, "utf8");

test("por defecto es lo de siempre: 1 vez y sin espera", () => {
    assert.deepEqual(r.REPETICIONES_POR_DEFECTO, { maxEjecuciones: 1, esperaMinutos: null });
    assert.deepEqual(r.comoRepeticiones(undefined), r.REPETICIONES_POR_DEFECTO);
    assert.equal(r.esLoDeSiempre(r.comoRepeticiones({})), true);
    assert.equal(r.resumenDeRepeticiones(r.REPETICIONES_POR_DEFECTO), null);
});

test("lo que no se entiende cae en lo de siempre, y hay topes", () => {
    assert.deepEqual(r.comoRepeticiones({ maxEjecuciones: 0, esperaMinutos: 0 }), { maxEjecuciones: 1, esperaMinutos: null });
    assert.deepEqual(r.comoRepeticiones({ maxEjecuciones: "x", esperaMinutos: "" }), { maxEjecuciones: 1, esperaMinutos: null });
    assert.deepEqual(r.comoRepeticiones({ maxEjecuciones: 9999, esperaMinutos: 10 ** 9 }), {
        maxEjecuciones: r.TOPE_DE_EJECUCIONES,
        esperaMinutos: r.TOPE_DE_ESPERA_MINUTOS,
    });
});

test("la espera: vacío es sin espera, y las unidades convierten a minutos", () => {
    assert.equal(r.esperaEnMinutos("", "hours"), null);
    assert.equal(r.esperaEnMinutos("0", "days"), null);
    assert.equal(r.esperaEnMinutos("15", "minutes"), 15);
    assert.equal(r.esperaEnMinutos("2", "hours"), 120);
    assert.equal(r.esperaEnMinutos("3", "days"), 3 * 1440);
    assert.equal(r.esperaEnMinutos("999", "days"), r.TOPE_DE_ESPERA_MINUTOS);
});

test("lo guardado se enseña en la unidad más grande que sale entera, y vuelve igual", () => {
    assert.deepEqual(r.esperaParaElFormulario(null), { valor: "", unidad: "minutes" });
    assert.deepEqual(r.esperaParaElFormulario(1440), { valor: "1", unidad: "days" });
    assert.deepEqual(r.esperaParaElFormulario(120), { valor: "2", unidad: "hours" });
    assert.deepEqual(r.esperaParaElFormulario(90), { valor: "90", unidad: "minutes" });
    for (const m of [15, 60, 90, 1440, 2880, 4320]) {
        const { valor, unidad } = r.esperaParaElFormulario(m);
        assert.equal(r.esperaEnMinutos(valor, unidad), m);
    }
    assert.equal(r.resumenDeRepeticiones({ maxEjecuciones: 3, esperaMinutos: 120 }), "Hasta 3 veces · cada 2 h");
});

test("la pantalla: el menú del flujo ofrece Repeticiones y el diálogo guarda en verde", () => {
    const accion = leer("app/(root)/flow/_components/WorkflowAction.tsx");
    const tarjeta = leer("app/(root)/flow/_components/WorkflowCard.tsx");
    const dialogo = leer("app/(root)/flow/_components/RepeticionesDelFlujoDialog.tsx");
    const lista = leer("app/(root)/flow/_components/UserWorkflows.tsx");

    if (ROTO) {
        assert.equal(accion.includes("Repeticiones"), false, "el modo roto tiene que reproducir que no había opción");
        assert.equal(dialogo, "", "el modo roto tiene que reproducir que no había diálogo");
        return;
    }

    assert.match(accion, /onRepeticiones &&/);
    assert.match(accion, />\s*Repeticiones\s*</);
    // Bienvenida y embudo son de una vez por diseño: no se ofrece.
    assert.match(tarjeta, /admiteRepeticiones = !welcomeActive && !funnelActive/);
    assert.match(tarjeta, /onRepeticiones=\{admiteRepeticiones \?/);
    // Guardar en verde, y los dos botones como hijos DIRECTOS del pie.
    assert.match(dialogo, /<Button variant="save" onClick=\{guardar\}/);
    assert.match(dialogo, /<DialogFooter[^>]*>\s*<Button variant="outline"[\s\S]*?<\/Button>\s*<Button variant="save"/);
    assert.match(dialogo, /label="Tiempo de espera entre ejecuciones"/);
    assert.match(dialogo, /permitirVacio/);
    assert.match(dialogo, /Máximo de ejecuciones/);
    // Las repeticiones de la lista, en UNA consulta.
    assert.match(lista, /leerRepeticionesDeLosFlujosAction\(visibleWorkflows\.map/);
    // La lista entra al paquete del navegador por el barrel: nada server-only.
    assert.equal(lista.includes("repeticiones-de-flujo-db"), false);
});

test("el selector de tiempo de siempre no cambia para quien no pasa las props nuevas", () => {
    const t = leer("components/shared/TimeInput.tsx");
    if (ROTO) return;
    assert.match(t, /label = "Duración de retraso"/);
    assert.match(t, /permitirVacio = false/);
    assert.match(t, /value=\{permitirVacio && value === 0 \? "" : value\}/);
});
