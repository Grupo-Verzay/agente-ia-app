/**
 * Lo que se arregló en la pantalla de Etiquetas (`/tags`) al documentarla,
 * probado sobre las reglas puras de `lib/etiquetas-de-la-pantalla.ts` y con un
 * barrido de que la pantalla las usa.
 *
 * - Pulsar el rango de puntaje que ya estaba puesto no lo quitaba: una vez
 *   puesto un filtro no había forma de volver a ver el tablero entero.
 * - Los cinco rangos vivían en tres copias (la barra, el filtro del tablero y
 *   el color de la insignia de cada tarjeta).
 * - Reordenar con una búsqueda puesta guardaba el orden de un TROZO de la lista.
 *
 * `MODO=roto` lee la pantalla de `ANTES_ET_REF` —pinchado a un commit— y
 * afirma los fallos.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "..", "..");
const ROTO = process.env.MODO === "roto";
const ANTES = process.env.ANTES_ET_REF ?? "7767f6f";
const PANTALLA = "app/(root)/tags/components";

const leer = (rel) =>
    ROTO
        ? (() => {
              try {
                  return execSync(`git show ${ANTES}:${JSON.stringify(rel)}`, { cwd: RAIZ, stdio: ["ignore", "pipe", "ignore"] }).toString();
              } catch {
                  return "";
              }
          })()
        : readFileSync(path.join(RAIZ, rel), "utf8");

if (ROTO) {
    test("ANTES el rango puesto no se quitaba, y los rangos estaban copiados", () => {
        const pagina = leer(`${PANTALLA}/TagsPageClient.tsx`);
        assert.match(pagina, /setSelectedScoreRanges\(new Set\(\[key\]\)\)/, "en ANTES pulsar un rango no lo dejaba siempre puesto");
        assert.match(pagina, /const SCORE_RANGES = \[/, "en ANTES los rangos no estaban copiados en la barra");
        assert.equal(leer("lib/etiquetas-de-la-pantalla.ts"), "", "las reglas ya existían");
        // Y la lista de Gestionar se podía reordenar con la búsqueda puesta.
        assert.doesNotMatch(leer(`${PANTALLA}/SortableTagList.tsx`), /porQueNoSeOrdena/);
    });
} else {
    const r = await import(path.join(RAIZ, "lib/__tests__/.compilado/etiquetas-de-la-pantalla.mjs"));

    test("los cinco rangos cubren de 0 a 100 sin huecos ni solapes", () => {
        assert.equal(r.RANGOS_DE_PUNTAJE.length, 5);
        assert.equal(r.RANGOS_DE_PUNTAJE[0].min, 0);
        assert.equal(r.RANGOS_DE_PUNTAJE.at(-1).max, 100);
        for (let i = 1; i < r.RANGOS_DE_PUNTAJE.length; i += 1) {
            assert.equal(r.RANGOS_DE_PUNTAJE[i].min, r.RANGOS_DE_PUNTAJE[i - 1].max + 1);
        }
        for (let p = 0; p <= 100; p += 1) assert.ok(r.elRangoDelPuntaje(p), `${p} sin rango`);
    });

    test("el rango de un puntaje: sin calificar no tiene, y lo de fuera se acota", () => {
        assert.equal(r.elRangoDelPuntaje(null), null);
        assert.equal(r.elRangoDelPuntaje(undefined), null);
        assert.equal(r.elRangoDelPuntaje(Number.NaN), null);
        assert.equal(r.elRangoDelPuntaje(25).clave, "bajo");
        assert.equal(r.elRangoDelPuntaje(26).clave, "medio");
        assert.equal(r.elRangoDelPuntaje(91).clave, "listo");
        assert.equal(r.elRangoDelPuntaje(140).clave, "listo");
        assert.equal(r.elRangoDelPuntaje(-3).clave, "bajo");
    });

    test("pulsar el rango que está puesto lo QUITA, y pulsar otro lo cambia", () => {
        assert.equal(r.elFiltroDePuntaje(null, "alto"), "alto");
        assert.equal(r.elFiltroDePuntaje("alto", "alto"), null);
        assert.equal(r.elFiltroDePuntaje("alto", "listo"), "listo");
    });

    test("sin filtro pasan todas; con filtro, solo las calificadas en ese rango", () => {
        assert.ok(r.pasaElFiltroDePuntaje(null, null));
        assert.ok(r.pasaElFiltroDePuntaje(12, null));
        assert.ok(r.pasaElFiltroDePuntaje(93, "listo"));
        assert.ok(!r.pasaElFiltroDePuntaje(89, "listo"));
        assert.ok(!r.pasaElFiltroDePuntaje(null, "bajo"), "una sin calificar no es «Bajo»");
    });

    test("cuántas por rango: las sin calificar no cuentan", () => {
        assert.deepEqual(r.cuantasPorRango([12, 18, 41, 61, 78, 82, 93, 96, null, undefined]), { bajo: 2, medio: 1, moderado: 1, alto: 2, listo: 2 });
    });

    test("con una búsqueda puesta no se ordena, y se dice por qué", () => {
        assert.equal(r.porQueNoSePuedenOrdenarLasEtiquetas(""), null);
        assert.equal(r.porQueNoSePuedenOrdenarLasEtiquetas("   "), null);
        assert.match(r.porQueNoSePuedenOrdenarLasEtiquetas("co"), /Quita la búsqueda/);
    });

    test("la pantalla usa las reglas, y no queda ninguna copia de los rangos", () => {
        const pagina = leer(`${PANTALLA}/TagsPageClient.tsx`);
        const tablero = leer(`${PANTALLA}/TagKanbanBoard.tsx`);
        assert.match(pagina, /elFiltroDePuntaje\(/);
        assert.doesNotMatch(pagina, /SCORE_RANGES|new Set\(\[key\]\)/);
        assert.match(tablero, /pasaElFiltroDePuntaje\(/);
        assert.match(tablero, /elRangoDelPuntaje\(/);
        assert.doesNotMatch(tablero, /score >= 9\d|>= 76 \?/, "el color del puntaje vuelve a tener sus cortes a mano");
        const lista = leer(`${PANTALLA}/SortableTagList.tsx`);
        assert.match(lista, /disabled: porQueNoSeOrdena !== null/);
        assert.match(leer(`${PANTALLA}/SessionTagsManager.tsx`), /porQueNoSePuedenOrdenarLasEtiquetas\(/);
    });
}
