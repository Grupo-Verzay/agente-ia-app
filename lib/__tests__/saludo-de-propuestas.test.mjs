import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const roto = process.env.MODO === "roto";
const ref = process.env.ANTES_REF || "62386d4";
const leer = (f) => roto ? execSync(`git show ${ref}:${f}`).toString() : readFileSync(f, "utf8");

if (!roto) {
  const m = await import("./.compilado/saludo/propuestas.js");
  const { SALUDO_DE_FABRICA, comoSaludo, elMensajeDeWhatsapp, TOPE_DE_SALUDO } = m;

  test("de fábrica: nombre y enlace completados, dos saltos de línea", () => {
    assert.equal(elMensajeDeWhatsapp("Ana", "https://x/p/1"),
      "Hola *Ana*, te comparto nuestra propuesta comercial, haz clic en el enlace para conocer los detalles.\n\n👉 https://x/p/1");
  });
  test("un saludo propio usa {cliente} y {enlace}", () => {
    assert.equal(elMensajeDeWhatsapp("Ana", "L", "Buenas {cliente}\n{enlace}"), "Buenas Ana\nL");
  });
  test("sin {enlace} se añade el enlace al final", () => {
    assert.ok(elMensajeDeWhatsapp("Ana", "https://x", "Hola {cliente}").includes("https://x"));
  });
  test("igual al de fábrica o vacío se guarda como vacío; se topa", () => {
    assert.equal(comoSaludo(SALUDO_DE_FABRICA), "");
    assert.equal(comoSaludo("   "), "");
    assert.equal(comoSaludo("a".repeat(TOPE_DE_SALUDO + 50)).length, TOPE_DE_SALUDO);
  });
}

test("la pantalla y las acciones usan el saludo", () => {
  const ui = leer("app/(root)/(protected)/panel/propuestas/_components/PropuestasClient.tsx");
  const ac = leer("actions/propuestas-actions.ts");
  assert.ok(ui.includes("data-saludo-de-envio"), "campo del saludo en la pantalla");
  assert.ok(ui.includes("Configuración"), "el modal se llama Configuración");
  assert.ok(ac.includes("ponerConfiguracionAction"), "acción que guarda ambos");
  assert.ok(ac.includes("elSaludoDe"), "el envío lee el saludo de la cuenta");
});
