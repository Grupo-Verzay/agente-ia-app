// La pantalla compartida de Verzy llena su hueco: el navegador del servidor
// toma el formato que le dice la sala, y la imagen ocupa la caja entera.
// MODO=roto lee la sala y la pantalla de un commit pinchado y afirma las franjas.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const MODO = process.env.MODO ?? "bueno";
const sala = readFileSync(process.env.SALA, "utf8");
const servidor = readFileSync(process.env.PANTALLA, "utf8");

if (MODO === "roto") {
  test("ANTES: la imagen no llena su caja y el servidor no cambia de tamaño", () => {
    assert.match(sala, /max-h-full max-w-full object-contain/);
    assert.doesNotMatch(sala, /tipo: "tamano"/);
    assert.doesNotMatch(servidor, /setViewportSize/);
  });
} else {
  const { elTamanoDeLaPantalla, laOrdenPedida, TAMANO_DE_FABRICA } = await import("./.compilado/pantalla-de-verzy.js");
  test("el tamaño sigue el formato del hueco", () => {
    const ancho = elTamanoDeLaPantalla(1600, 700);
    assert.ok(Math.abs(ancho.ancho / ancho.alto - 1600 / 700) < 0.01);
    const alto = elTamanoDeLaPantalla(360, 600);
    assert.ok(Math.abs(alto.ancho / alto.alto - 360 / 600) < 0.01);
    assert.ok(alto.ancho >= 1024, "en un teléfono no se encoge la App");
    assert.equal(elTamanoDeLaPantalla(0, 0), null);
    assert.equal(elTamanoDeLaPantalla(NaN, 500), null);
    assert.deepEqual(Object.keys(TAMANO_DE_FABRICA).sort(), ["alto", "ancho"]);
  });
  test("la orden de tamaño se entiende y lo raro no", () => {
    assert.equal(laOrdenPedida({ tipo: "tamano", ancho: 1400, alto: 700 })?.tipo, "tamano");
    assert.equal(laOrdenPedida({ tipo: "tamano", ancho: "x", alto: 700 }), null);
  });
  test("la sala mide su hueco y la imagen lo llena", () => {
    assert.match(sala, /tipo: "tamano", ancho, alto/);
    assert.match(sala, /ResizeObserver/);
    assert.match(sala, /data-zona="video-de-la-pantalla"[\s\S]{0,400}className="h-full w-full object-contain"/);
    assert.doesNotMatch(sala, /max-h-full max-w-full object-contain/);
  });
  test("el servidor cambia el viewport y reabre el video con ese tamaño", () => {
    assert.match(servidor, /orden\.tipo === "tamano"/);
    assert.match(servidor, /setViewportSize/);
    assert.match(servidor, /maxWidth: viva\.tamano\.ancho/);
  });
}
