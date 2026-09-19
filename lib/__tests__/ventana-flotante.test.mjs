/**
 * Donde puede quedarse una ventana flotante.
 *
 * Los cuatro invariantes que este banco protege:
 *
 *   1. **Acotar siempre deja la ventana ENTERA dentro**, mientras quepa. Es lo
 *      unico que garantiza que se pueda volver a agarrar.
 *   2. **Una posicion que ya no sirve se OLVIDA, no se acota.** Acotar contra
 *      un tamano de 0x0 coloca la ventana casi entera fuera: el tope de cada
 *      eje sale pegado al borde contrario como si la caja no ocupara nada. Ese
 *      es el caso que deja una llamada inalcanzable.
 *   3. **Un par de pixeles asomando no es estar en pantalla.** No hay donde
 *      agarrar, asi que cuenta como perdida.
 *   4. **Pero el minimo no puede ser mayor que la propia caja ni que la
 *      pantalla**, o una ventana pequena —o una pantalla pequena— se olvidaria
 *      siempre y no habria forma de moverla de su esquina.
 *
 * Como compilar lo que importa (sale en `.compilado/`, que esta en .gitignore):
 *
 *   npx tsc lib/ventana-flotante.ts --outDir lib/__tests__/.compilado \
 *     --module es2022 --target es2022 --lib es2022,dom \
 *     --moduleResolution bundler --skipLibCheck
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
    MARGEN_EN_PANTALLA,
    MINIMO_VISIBLE,
    dentroDeLaPantalla,
    queHacerConLaVentana,
} from "./.compilado/ventana-flotante.js";

const PANTALLA = { ancho: 1440, alto: 900 };
/** La pastilla de una llamada, medida en Chromium. */
const PASTILLA = { ancho: 318, alto: 42 };
/** La tarjeta desplegada. */
const TARJETA = { ancho: 352, alto: 420 };

// ── 1. Acotar deja la ventana entera dentro ─────────────────────────────────

test("se acota por los cuatro bordes", () => {
    const m = MARGEN_EN_PANTALLA;
    for (const [x, y] of [[-500, -500], [5000, 5000], [-500, 5000], [5000, -500]]) {
        const p = dentroDeLaPantalla(x, y, PASTILLA.ancho, PASTILLA.alto, PANTALLA);
        assert.ok(p.x >= m && p.y >= m, `esquina superior izquierda: ${JSON.stringify(p)}`);
        assert.ok(
            p.x + PASTILLA.ancho <= PANTALLA.ancho - m,
            `se sale por la derecha: ${JSON.stringify(p)}`,
        );
        assert.ok(
            p.y + PASTILLA.alto <= PANTALLA.alto - m,
            `se sale por abajo: ${JSON.stringify(p)}`,
        );
    }
});

test("en una pantalla mas pequena que la caja, se queda arriba a la izquierda", () => {
    // Sin el suelo del margen el tope sale NEGATIVO y la ventana se iria hacia
    // arriba y hacia la izquierda, fuera, que es justo donde peor se esta.
    // Ojo con elegir el ejemplo: en 390 de ancho una tarjeta de 352 SI cabe
    // (tope 30), asi que el caso hay que montarlo con la caja mas ancha que la
    // pantalla de verdad — si no, se prueba otra cosa.
    const apretada = { ancho: 300, alto: 300 };
    const p = dentroDeLaPantalla(200, 200, TARJETA.ancho, TARJETA.alto, apretada);
    assert.deepEqual(p, { x: MARGEN_EN_PANTALLA, y: MARGEN_EN_PANTALLA });

    // Y en un movil de verdad la tarjeta cabe a lo ancho y no a lo alto:
    const movil = { ancho: 390, alto: 300 };
    assert.deepEqual(dentroDeLaPantalla(200, 200, TARJETA.ancho, TARJETA.alto, movil), {
        x: 30,
        y: MARGEN_EN_PANTALLA,
    });
});

// ── 2. Lo que no se puede arreglar se olvida ────────────────────────────────

test("una caja de 0x0 se OLVIDA, no se acota", () => {
    // Este es el caso que deja la llamada perdida. Acotando, el tope de cada
    // eje seria (pantalla - 0 - margen), o sea la esquina de abajo a la
    // derecha, puesta como ESQUINA SUPERIOR de una pastilla de 318x42: se
    // quedarian 8 px asomando y el asa entera fuera.
    assert.equal(queHacerConLaVentana({ x: 100, y: 100 }, { ancho: 0, alto: 0 }, PANTALLA).que, "olvidar");

    // Y para que se vea que acotar NO valia:
    const acotada = dentroDeLaPantalla(5000, 5000, 0, 0, PANTALLA);
    assert.deepEqual(acotada, { x: 1432, y: 892 });
    assert.ok(
        acotada.x + PASTILLA.ancho > PANTALLA.ancho,
        "acotar con 0x0 deja la pastilla fuera por la derecha",
    );
});

test("numeros que no sirven se olvidan", () => {
    const fuera = [
        [{ x: NaN, y: 10 }, PASTILLA, PANTALLA],
        [{ x: 10, y: Infinity }, PASTILLA, PANTALLA],
        [{ x: 10, y: 10 }, { ancho: NaN, alto: 42 }, PANTALLA],
        [{ x: 10, y: 10 }, { ancho: -5, alto: 42 }, PANTALLA],
        [{ x: 10, y: 10 }, PASTILLA, { ancho: 0, alto: 900 }],
    ];
    for (const [pos, caja, pantalla] of fuera) {
        assert.equal(
            queHacerConLaVentana(pos, caja, pantalla).que,
            "olvidar",
            `deberia olvidarse: ${JSON.stringify({ pos, caja, pantalla })}`,
        );
    }
});

test("una posicion de una pantalla grande, en una pequena, se olvida", () => {
    // Estaba abajo a la derecha de un monitor y se abre el portatil.
    const dondeEstaba = { x: 1100, y: 840 };
    assert.equal(queHacerConLaVentana(dondeEstaba, PASTILLA, PANTALLA).que, "dejar");
    assert.equal(
        queHacerConLaVentana(dondeEstaba, PASTILLA, { ancho: 390, alto: 667 }).que,
        "olvidar",
    );
});

// ── 3. Asomar no es estar ───────────────────────────────────────────────────

test("un par de pixeles asomando cuenta como perdida", () => {
    // Dos pixeles por la derecha.
    const casiFuera = { x: PANTALLA.ancho - 2, y: 100 };
    assert.equal(queHacerConLaVentana(casiFuera, PASTILLA, PANTALLA).que, "olvidar");
    // Justo en el umbral, se recupera acotandola.
    const asomando = { x: PANTALLA.ancho - MINIMO_VISIBLE, y: 100 };
    assert.equal(queHacerConLaVentana(asomando, PASTILLA, PANTALLA).que, "acotar");
});

test("entera fuera, por cualquier lado, se olvida", () => {
    for (const pos of [
        { x: -400, y: 100 },
        { x: 2000, y: 100 },
        { x: 100, y: -200 },
        { x: 100, y: 2000 },
    ]) {
        assert.equal(
            queHacerConLaVentana(pos, PASTILLA, PANTALLA).que,
            "olvidar",
            `${JSON.stringify(pos)}`,
        );
    }
});

// ── 4. El minimo no puede ser mayor que la caja ni que la pantalla ──────────

test("una caja mas baja que el minimo no se olvida por eso", () => {
    // La pastilla mide 42 de alto; un dia podria medir 20. Con el minimo fijo
    // en 32 se olvidaria SIEMPRE y se quedaria clavada en su esquina.
    const bajita = { ancho: 318, alto: 20 };
    assert.equal(queHacerConLaVentana({ x: 100, y: 100 }, bajita, PANTALLA).que, "dejar");
});

test("una pantalla mas pequena que el minimo tampoco lo olvida todo", () => {
    const diminuta = { ancho: 20, alto: 20 };
    assert.notEqual(queHacerConLaVentana({ x: 0, y: 0 }, PASTILLA, diminuta).que, "olvidar");
});

// ── Y lo que ya estaba dentro no se toca ────────────────────────────────────

test("dentro se deja como esta", () => {
    assert.deepEqual(queHacerConLaVentana({ x: 400, y: 300 }, TARJETA, PANTALLA), {
        que: "dejar",
    });
});

test("la tarjeta que CRECE donde estaba se acota", () => {
    // 22rem pegada al borde derecho, y se enciende la camara: pasa a 32rem.
    const pegada = dentroDeLaPantalla(5000, 300, 352, 420, PANTALLA);
    assert.equal(queHacerConLaVentana(pegada, { ancho: 352, alto: 420 }, PANTALLA).que, "dejar");

    const crecida = queHacerConLaVentana(pegada, { ancho: 512, alto: 640 }, PANTALLA);
    assert.equal(crecida.que, "acotar", "al crecer tiene que volver a meterse");
    assert.equal(crecida.x + 512, PANTALLA.ancho - MARGEN_EN_PANTALLA);
    assert.equal(crecida.y + 640, PANTALLA.alto - MARGEN_EN_PANTALLA);
});

// ── Los casos que venian del banco de la llamada de voz ─────────────────────
//
// El arrastre es pointer events y no se prueba sin navegador. Lo que SI se
// prueba es donde acaba, que es lo unico que puede dejar una llamada abierta
// sin forma de colgarla y con el micro encendido.

const VENTANA = { ancho: 1280, alto: 800 };

test("sin tocar los bordes, se queda donde se la deja", () => {
  assert.deepEqual(dentroDeLaPantalla(300, 200, 352, 180, VENTANA), { x: 300, y: 200 });
});

test("no se sale por la derecha ni por abajo: el boton de colgar va dentro", () => {
  const p = dentroDeLaPantalla(5000, 5000, 352, 180, VENTANA);
  assert.deepEqual(p, { x: 1280 - 352 - 8, y: 800 - 180 - 8 });
});

test("ni por arriba ni por la izquierda", () => {
  assert.deepEqual(dentroDeLaPantalla(-999, -999, 352, 180, VENTANA), { x: 8, y: 8 });
});

test("una ventana MAS ESTRECHA que la tarjeta la deja pegada al margen, no fuera", () => {
  // El caso que rompe un clamp escrito de la forma obvia: el tope sale
  // negativo y, sin el suelo del margen, la tarjeta se va fuera por arriba y
  // por la izquierda — justo donde no hay forma de alcanzarla.
  const p = dentroDeLaPantalla(100, 100, 400, 900, { ancho: 390, alto: 667 });
  assert.deepEqual(p, { x: 8, y: 8 });
});

test("plegarla la deja mas adentro; desplegarla la vuelve a meter", () => {
  // Pegada abajo a la derecha como barra pequena...
  const plegada = dentroDeLaPantalla(5000, 5000, 260, 44, VENTANA);
  assert.deepEqual(plegada, { x: 1280 - 260 - 8, y: 800 - 44 - 8 });
  // ...y al desplegarla ahi mismo, la tarjeta entera ya no cabria: se recoloca.
  const desplegada = dentroDeLaPantalla(plegada.x, plegada.y, 352, 180, VENTANA);
  assert.deepEqual(desplegada, { x: 1280 - 352 - 8, y: 800 - 180 - 8 });
});

test("el margen se puede cambiar, y cero es cero", () => {
  assert.deepEqual(dentroDeLaPantalla(-5, -5, 352, 180, VENTANA, 0), { x: 0, y: 0 });
});
