/**
 * El banco de la caja de escribir: hasta tres renglones y ni uno más.
 *
 * Lo que se prueba aquí es la **decisión**, sin navegador. Las cuatro medidas
 * que entran son las que Chromium devuelve de verdad con el CSS del build
 * —están anotadas al lado de cada juego, con las clases que las producen— así
 * que los números de abajo no son inventados: son los de la pantalla.
 *
 * Corre en dos modos. `MODO=roto` mete la fórmula vieja —el tope de 160 px y
 * el `scrollHeight` pelado, sin bordes— y **afirma el fallo**: cinco renglones
 * y medio en un teléfono, y una sola línea con barra de deslizar. Sin ese modo
 * no se sabría si lo verde de al lado es que se arregló la causa o que el caso
 * no llega a ejercerse.
 *
 * Se levanta con `scripts/banco-caja.sh`, que además mide la caja de verdad en
 * Chromium sobre el CSS del build.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
    LINEAS_VISIBLES,
    altoDeLaCaja,
} from "./.compilado/alto-de-la-caja-de-escribir.js";

const ROTO = process.env.MODO === "roto";

/** La fórmula de antes, literal, para que el modo roto no la describa: la corra. */
function comoEraAntes(m) {
    return { alto: Math.min(m.contenido, 160), tope: 160, desborda: m.contenido > 160 };
}

const decidir = ROTO ? comoEraAntes : altoDeLaCaja;

const SOLO_NUEVA = { skip: ROTO && "esto solo lo cumple la fórmula nueva" };

/**
 * Medido en Chromium sobre el CSS del build, con las clases del componente:
 * `py-2` (relleno 16), `border` (bordes 2) y `leading-relaxed` sobre
 * `text-base sm:text-sm`.
 */
const ESCRITORIO = { interlineado: 20, fuente: 14, relleno: 16, bordes: 2 }; // text-sm
const MOVIL = { interlineado: 26, fuente: 16, relleno: 16, bordes: 2 }; // text-base

/** `scrollHeight` con la altura en `auto`: renglones + relleno, sin bordes. */
const conRenglones = (base, n) => ({ ...base, contenido: n * base.interlineado + base.relleno });

/** Cuántos renglones caben de verdad en el alto que se decidió. */
const renglonesQueCaben = (base, alto) => (alto - base.relleno - base.bordes) / base.interlineado;

/** Lo que tiene que medir una caja con `n` renglones dentro, bordes incluidos. */
const loQueHaceFalta = (base, n) => n * base.interlineado + base.relleno + base.bordes;

test("una línea: la caja mide lo que ocupa, y NO sale barra", () => {
    for (const [donde, base] of [["escritorio", ESCRITORIO], ["móvil", MOVIL]]) {
        const r = decidir(conRenglones(base, 1));
        if (ROTO) {
            // Los bordes se quedaban fuera, así que la caja medía SIEMPRE dos
            // píxeles menos de lo que hacía falta. En un teléfono eso es una
            // barra de deslizar con una sola línea dentro, para siempre; en
            // escritorio lo tapa el `min-h-10` del CSS —medido: 40 px— y por
            // eso nadie lo reportó.
            assert.equal(r.alto, loQueHaceFalta(base, 1) - base.bordes, donde);
            continue;
        }
        assert.equal(r.alto, loQueHaceFalta(base, 1), donde);
        assert.equal(r.desborda, false, donde);
    }
});

test("tres líneas: caben las tres enteras y tampoco sale barra", () => {
    for (const [donde, base] of [["escritorio", ESCRITORIO], ["móvil", MOVIL]]) {
        const r = decidir(conRenglones(base, LINEAS_VISIBLES));
        if (ROTO) {
            // 3 × 20 + 16 = 76, y hacen falta 78. Dos píxeles cortos: barra.
            assert.equal(r.alto, loQueHaceFalta(base, LINEAS_VISIBLES) - base.bordes, donde);
            continue;
        }
        assert.equal(r.alto, r.tope, donde);
        assert.equal(r.desborda, false, donde);
        assert.equal(renglonesQueCaben(base, r.alto), LINEAS_VISIBLES, donde);
    }
});

test("muchas líneas: se para en el tope y AHÍ sí hay barra", () => {
    for (const [donde, base] of [["escritorio", ESCRITORIO], ["móvil", MOVIL]]) {
        const r = decidir(conRenglones(base, 40));
        assert.equal(r.desborda, true, donde);
        assert.equal(r.alto, r.tope, donde);
    }
});

test("el tope son TRES renglones en las dos pantallas, no 160 px en las dos", () => {
    const escritorio = decidir(conRenglones(ESCRITORIO, 40));
    const movil = decidir(conRenglones(MOVIL, 40));

    if (ROTO) {
        // El fallo reportado, con los números delante: el mismo tope en píxeles
        // es un número de renglones distinto en cada pantalla.
        assert.equal(escritorio.alto, 160);
        assert.equal(movil.alto, 160);
        assert.equal(renglonesQueCaben(ESCRITORIO, 160), 7.1);
        assert.ok(renglonesQueCaben(MOVIL, 160) > 5 && renglonesQueCaben(MOVIL, 160) < 5.5);
        return;
    }

    assert.equal(renglonesQueCaben(ESCRITORIO, escritorio.alto), LINEAS_VISIBLES);
    assert.equal(renglonesQueCaben(MOVIL, movil.alto), LINEAS_VISIBLES);
    // Y son topes distintos en píxeles, que es justo de lo que se trata.
    assert.notEqual(escritorio.tope, movil.tope);
});

test("crece de una en una hasta el tope, y de ahí no pasa", SOLO_NUEVA, () => {
    const altos = [1, 2, 3, 4, 5, 20].map((n) => decidir(conRenglones(MOVIL, n)).alto);
    assert.deepEqual(altos, [44, 70, 96, 96, 96, 96]);
});

test("vaciar la caja la devuelve a una línea", SOLO_NUEVA, () => {
    // Sin texto, `scrollHeight` es el relleno pelado: el alto que sale está por
    // debajo del `min-h-10` del CSS, que es quien manda entonces.
    const r = decidir({ ...MOVIL, contenido: MOVIL.relleno });
    assert.ok(r.alto <= 40, `${r.alto}`);
    assert.equal(r.desborda, false);
});

test("sin interlineado usable NO se queda sin tope", SOLO_NUEVA, () => {
    // `line-height: normal` da `NaN` al parsear. Un tope `NaN` deja pasar
    // cualquier alto en `Math.min`: volvería el fallo entero y sin un error.
    const r = decidir({ ...MOVIL, interlineado: NaN, contenido: 4000 });
    assert.ok(Number.isFinite(r.tope));
    assert.equal(r.alto, r.tope);
    assert.equal(r.tope, 3 * (16 * 1.5) + 16 + 2);
});

test("sin interlineado y sin fuente tampoco", SOLO_NUEVA, () => {
    const r = decidir({ contenido: 4000, interlineado: NaN, fuente: NaN, relleno: NaN, bordes: NaN });
    assert.ok(Number.isFinite(r.alto) && r.alto > 0);
    assert.equal(r.alto, 3 * 20);
});
