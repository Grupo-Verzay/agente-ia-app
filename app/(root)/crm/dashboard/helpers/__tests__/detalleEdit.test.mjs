import test from "node:test";
import assert from "node:assert/strict";
import {
  getDetalleRawValue,
  normalizeDetalleDraft,
  isDetalleChanged,
} from "../detalleEdit.js";

test("getDetalleRawValue prioriza resumen y hace trim", () => {
  const result = getDetalleRawValue({
    resumen: "  Resumen principal  ",
    detalles: "Detalle alterno",
  });
  assert.equal(result, "Resumen principal");
});

test("getDetalleRawValue usa detalles cuando resumen está vacío", () => {
  const result = getDetalleRawValue({
    resumen: "   ",
    detalles: "  Detalle final  ",
  });
  assert.equal(result, "Detalle final");
});

test("normalizeDetalleDraft devuelve null cuando está vacío", () => {
  assert.equal(normalizeDetalleDraft("   "), null);
});

test("normalizeDetalleDraft normaliza contenido válido", () => {
  assert.equal(normalizeDetalleDraft("  texto editado  "), "texto editado");
});

test("isDetalleChanged detecta cambios reales ignorando espacios laterales", () => {
  assert.equal(isDetalleChanged("Hola mundo", "  Hola mundo "), false);
  assert.equal(isDetalleChanged("Hola mundo", "Hola mundo 2"), true);
});
