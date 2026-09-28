/**
 * La regla del panel de filtros de Chats, sin navegador: qué sección se ve
 * desplegada y qué acción cierra el panel. Se compila con
 * `scripts/banco-panel-filtros.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const AQUI = dirname(fileURLToPath(import.meta.url));
const m = await import(join(AQUI, ".compilado", "secciones-del-filtro.js"));

test("al abrir el panel no hay ninguna sección desplegada", () => {
    assert.equal(m.SECCION_AL_ABRIR, null);
    assert.deepEqual([...m.SECCIONES_DEL_FILTRO], ["etiquetas", "embudos"]);
});

test("desplegar una sección pliega la otra; pulsarla otra vez la pliega", () => {
    assert.equal(m.alternarSeccion(null, "etiquetas"), "etiquetas");
    assert.equal(m.alternarSeccion("etiquetas", "embudos"), "embudos", "nunca las dos a la vez");
    assert.equal(m.alternarSeccion("embudos", "etiquetas"), "etiquetas");
    assert.equal(m.alternarSeccion("etiquetas", "etiquetas"), null);
    assert.equal(m.alternarSeccion("embudos", "embudos"), null);
});

test("solo elegir una etiqueta o una etapa cierra el panel", () => {
    assert.equal(m.cierraElPanel("etiqueta"), true);
    assert.equal(m.cierraElPanel("etapa"), true);
    for (const paso of ["embudo", "cuenta", "seccion", "rango"]) {
        assert.equal(m.cierraElPanel(paso), false, `${paso} es un paso, no cierra`);
    }
});
