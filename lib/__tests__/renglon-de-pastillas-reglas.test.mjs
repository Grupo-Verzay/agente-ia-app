/**
 * El reparto del renglón de pastillas, sin navegador.
 *
 * Lo que se prueba aquí es la DECISIÓN —cuántas caben— con medidas de verdad,
 * las que dio Chromium sobre la columna de producción: una contadora mide 36,
 * «Contactado» 86,7 y el círculo de un asesor 24. Que la fila las use es otra
 * pregunta, y la contesta `renglon-de-pastillas.test.mjs` en un navegador.
 *
 * `MODO=roto` no cambia nada aquí: la función es nueva y no hay un «antes»
 * suyo que afirmar. Lo que el modo roto reproduce es el TOPE de 6, y eso vive
 * en el componente.
 */
import test from "node:test";
import assert from "node:assert/strict";
// El módulo compilado vive en su propia carpeta: el paquete del arnés de
// navegador se llama igual, y el segundo pisaría al primero.
import {
    RENGLON_DE_PASTILLAS,
    SEPARACION_DEL_RENGLON_PX,
    repartirLasPastillas,
} from "./.compilado/reglas/renglon-de-pastillas.js";

/** Medido en la columna de producción: la contadora y el «+N». */
const CONTADORA = 36;
const COLUMNA_1440 = 348;
const COLUMNA_1024 = 316;

test("caben todas: no se reserva sitio para un «+N» que no va a existir", () => {
    // 86,7 + 42,2 + 24 + 36 = 188,9 y tres huecos: 200,9 de 348.
    const anchos = [86.7, 42.2, 24, CONTADORA];
    assert.equal(repartirLasPastillas(anchos, [], CONTADORA, COLUMNA_1440), 4);
});

test("una fila que cabe JUSTA no esconde nada por hacerle sitio al «+N»", () => {
    // Exactamente el hueco: 4 de 80 con tres separaciones = 332 en 332.
    const anchos = [80, 80, 80, 80];
    const hueco = 80 * 4 + 3 * SEPARACION_DEL_RENGLON_PX;
    assert.equal(repartirLasPastillas(anchos, [], CONTADORA, hueco), 4);
    // Un píxel menos y ya no caben: entra el «+N» y cae la última.
    assert.equal(repartirLasPastillas(anchos, [], CONTADORA, hueco - 1), 3);
});

test("siete cortas caben en la columna: el tope de 6 escondía la séptima", () => {
    // La fila del banco de navegador: «Nuevo», «Tibio», el asesor y cuatro
    // contadoras. 286,2 px de los 348 de la columna.
    const anchos = [52, 42.2, 24, CONTADORA, CONTADORA, CONTADORA, CONTADORA];
    assert.equal(repartirLasPastillas(anchos, [], CONTADORA, COLUMNA_1440), 7);
    assert.equal(repartirLasPastillas(anchos, [], CONTADORA, COLUMNA_1024), 7);
});

test("lo que no cabe va al «+N», y lo que entra cabe de verdad", () => {
    const anchos = [53.8, 86.7, 42.2, 24, CONTADORA, CONTADORA, CONTADORA, CONTADORA, CONTADORA];
    const fijas = [CONTADORA];
    const k = repartirLasPastillas(anchos, fijas, CONTADORA, COLUMNA_1440);
    assert.ok(k > 0 && k < anchos.length, `reparte de verdad (salió ${k})`);

    const ocupa = (n) => {
        const suma = anchos.slice(0, n).reduce((s, a) => s + a, 0) + CONTADORA * 2;
        return suma + (n + 2 - 1) * SEPARACION_DEL_RENGLON_PX;
    };
    assert.ok(ocupa(k) <= COLUMNA_1440, `lo que entra cabe: ${ocupa(k)} de ${COLUMNA_1440}`);
    assert.ok(ocupa(k + 1) > COLUMNA_1440, `y una más no cabría: ${ocupa(k + 1)}`);
});

test("lo que NO reparte ocupa igual: las etiquetas le quitan sitio al reparto", () => {
    const anchos = [80, 80, 80];
    const hueco = 80 * 3 + 2 * SEPARACION_DEL_RENGLON_PX;
    assert.equal(repartirLasPastillas(anchos, [], CONTADORA, hueco), 3);
    // Con la de etiquetas al lado ya no caben las tres.
    assert.ok(repartirLasPastillas(anchos, [CONTADORA], CONTADORA, hueco) < 3);
});

test("sin medidas no se decide: se pintan TODAS", () => {
    const anchos = [80, 80, 80];
    for (const hueco of [0, -1, NaN, Infinity]) {
        assert.equal(repartirLasPastillas(anchos, [], CONTADORA, hueco), 3, `hueco ${hueco}`);
    }
    // Un ancho que falta —una pastilla que todavía no se ha medido— no puede
    // esconder a las demás.
    assert.equal(repartirLasPastillas([80, undefined, 80], [], CONTADORA, 100), 3);
    assert.equal(repartirLasPastillas([80, NaN, 80], [], CONTADORA, 100), 3);
    assert.equal(repartirLasPastillas(anchos, [NaN], CONTADORA, 100), 3);
    assert.equal(repartirLasPastillas(anchos, [], NaN, 100), 3);
});

test("sin pastillas no hay nada que repartir", () => {
    assert.equal(repartirLasPastillas([], [], CONTADORA, COLUMNA_1440), 0);
    assert.equal(repartirLasPastillas([], [CONTADORA], CONTADORA, COLUMNA_1440), 0);
});

test("una columna diminuta lo pliega todo en el «+N», sin negativos", () => {
    const k = repartirLasPastillas([80, 80, 80], [], CONTADORA, 20);
    assert.equal(k, 0);
});

test("el renglón NO puede partirse en dos líneas", () => {
    assert.match(RENGLON_DE_PASTILLAS, /\bflex-nowrap\b/);
    assert.match(RENGLON_DE_PASTILLAS, /\boverflow-hidden\b/);
    assert.doesNotMatch(RENGLON_DE_PASTILLAS, /\bflex-wrap\b/);
    // La separación que cuenta el reparto es la que pinta el renglón.
    assert.match(RENGLON_DE_PASTILLAS, new RegExp(`gap-${SEPARACION_DEL_RENGLON_PX / 4}\\b`));
});
