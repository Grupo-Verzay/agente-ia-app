/**
 * La supresión de ruido del micrófono: la preferencia que se recuerda, la
 * restricción que se le pasa al micrófono y si `applyConstraints` prendió.
 *
 * Es puro —sin navegador— con un `localStorage` fingido, que es lo único que
 * hace falta para probar «recordar la elección» y «con qué se pide el micro».
 * El procesado en sí lo hace el navegador (la misma cancelación de ruido de
 * WebRTC), así que no se prueba aquí: lo que se protege es la decisión.
 */
import test from "node:test";
import assert from "node:assert/strict";

// Un `localStorage` de mentira, montado antes de importar el módulo.
function ponerAlmacen(almacen) {
    globalThis.window = { localStorage: almacen };
}
function almacenNormal() {
    const m = new Map();
    return {
        getItem: (k) => (m.has(k) ? m.get(k) : null),
        setItem: (k, v) => m.set(k, String(v)),
        removeItem: (k) => m.delete(k),
    };
}

const {
    SUPRESION_POR_DEFECTO,
    leerLaSupresion,
    guardarLaSupresion,
    laRestriccionDeAudio,
    seAplico,
} = await import("./.compilado/supresion/supresion.mjs");

test("por defecto viene encendida", () => {
    ponerAlmacen(almacenNormal());
    assert.equal(SUPRESION_POR_DEFECTO, true);
    assert.equal(leerLaSupresion(), true, "sin nada guardado, encendida");
});

test("recuerda la elección: apagar y volver a encender", () => {
    ponerAlmacen(almacenNormal());
    guardarLaSupresion(false);
    assert.equal(leerLaSupresion(), false, "apagada se recuerda apagada");
    guardarLaSupresion(true);
    assert.equal(leerLaSupresion(), true, "encendida se recuerda encendida");
});

test("un valor irreconocible cae al valor por defecto (encendida)", () => {
    const almacen = almacenNormal();
    almacen.setItem("verzay:supresion-de-ruido", "banana");
    ponerAlmacen(almacen);
    assert.equal(leerLaSupresion(), true, "lo que no se entiende, encendida");
});

test("si el almacenamiento lanza (ventana privada), no revienta: por defecto", () => {
    ponerAlmacen({
        getItem: () => {
            throw new Error("bloqueado");
        },
        setItem: () => {
            throw new Error("bloqueado");
        },
    });
    assert.equal(leerLaSupresion(), true, "leer no revienta");
    assert.doesNotThrow(() => guardarLaSupresion(false), "guardar no revienta");
});

test("la restricción solo toca noiseSuppression", () => {
    assert.deepEqual(laRestriccionDeAudio(true), { noiseSuppression: true });
    assert.deepEqual(laRestriccionDeAudio(false), { noiseSuppression: false });
});

test("seAplico: undefined se confía; en claro se compara", () => {
    // El navegador no dice cómo quedó → se confía, no se re-pide el micro.
    assert.equal(seAplico(undefined, true), true);
    assert.equal(seAplico(undefined, false), true);
    // El navegador lo dice en claro → tiene que coincidir con lo pedido.
    assert.equal(seAplico(true, true), true);
    assert.equal(seAplico(false, false), true);
    assert.equal(seAplico(false, true), false, "pedí encender y quedó apagada → re-pedir");
    assert.equal(seAplico(true, false), false, "pedí apagar y quedó encendida → re-pedir");
});
