// Verzy apunta en la pestaña «Notas» de la conversación (al lado de «Mensajes»),
// nunca en la ficha del contacto; y una ruta que falla nunca se le enseña al
// cliente. MODO=roto lee el servidor de ANTES_REF y afirma que escribía en la
// caja de notas de la ficha y que navegaba a la vista.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const ROTO = process.env.MODO === "roto";
const srv = readFileSync(`${process.env.RAIZ_NOTAS}/lib/pantalla-de-verzy.server.ts`, "utf8");

if (ROTO) {
  test("ANTES: la nota se escribía en la caja de la FICHA del contacto", () => {
    assert.match(srv, /textarea\[data-notas\]/);
    assert.match(srv, /abrirLaFicha/);
  });
  test("ANTES: una ruta se cargaba a la vista, sin volver atrás si fallaba", () => {
    assert.doesNotMatch(srv, /cargarSinEnsenarElFallo/);
  });
} else {
  const V = await import(new URL("./.compilado/notas/pantalla-de-verzy.js", import.meta.url).href);
  test("el título de la nota es uno por prospecto, en mayúsculas", () => {
    assert.equal(V.elTituloDeLaNotaDeLaLlamada("Mariana Toro"), "NOTAS DE LA VIDEOLLAMADA · MARIANA TORO");
    assert.equal(V.elTituloDeLaNotaDeLaLlamada("  "), "NOTAS DE LA VIDEOLLAMADA · PROSPECTO");
    assert.equal(V.elTituloDeLaNotaDeLaLlamada(null), "NOTAS DE LA VIDEOLLAMADA · PROSPECTO");
  });
  test("lo que se le cuenta a Verzy nombra las Notas de la conversación, no la ficha", () => {
    const t = V.loQueSeLeCuentaAVerzy({ tipo: "nota", datos: { texto: "x" } }, { ok: true });
    assert.match(t, /Notas de la conversación/);
    assert.doesNotMatch(t, /ficha/i);
  });
  test("la nota no toca la ficha: ni su caja ni abrirla", () => {
    assert.doesNotMatch(srv, /textarea\[data-notas\]/);
    assert.doesNotMatch(srv, /abrirLaFicha|irAlMenu/);
  });
  test("la nota va a la pestaña Notas del chat, y si no, a /notas y de vuelta", () => {
    assert.match(srv, /data-pestana-del-chat/);
    assert.match(srv, /cargarSinEnsenarElFallo\(viva, "\/notas"\)/);
  });
  test("toda carga pasa por la que vuelve atrás si falla", () => {
    // .goto solo en cargar() (con su reintento de sesión) y en volverA().
    const cargas = srv.match(/\.goto\(/g) ?? [];
    assert.ok(cargas.length <= 3, `hay ${cargas.length} .goto: toda carga va por cargarSinEnsenarElFallo/volverA`);
    const llamadasACargar = srv.match(/[^A-Za-z]cargar\(viva/g) ?? [];
    assert.ok(llamadasACargar.length <= 2, `cargar() aparece ${llamadasACargar.length} veces: solo su declaración y la de cargarSinEnsenarElFallo`);
    assert.match(srv, /async function volverA/);
  });
}
