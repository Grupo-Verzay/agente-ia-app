// «Verzy, yo sigo desde aquí» calla al avatar (lo decide la sala, no el prompt),
// y mostrar_pantalla contesta sin esperar animaciones ni la vuelta del ciclo.
// MODO=roto lee la sala y la pantalla de un commit pinchado y afirma el fallo.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const ROTO = process.env.MODO === "roto";
const sala = readFileSync(process.env.SALA, "utf8");
const srv = readFileSync(process.env.PANTALLA, "utf8");
const dice = (speech, role = "user") => ({ event_type: "conversation.utterance", properties: { role, speech } });

if (!ROTO) {
  const S = await import(new URL("./.compilado/silencio-de-verzy.js", import.meta.url).href);
  test("la orden se reconoce como la transcribe Tavus", () => {
    for (const t of ["Verzy, yo sigo desde aquí", "verzi yo sigo desde aqui.", "Bersi, yo sigo", "Yo sigo desde aquí"])
      assert.equal(S.loQueHaceConElSilencio(dice(t), false), "silenciar", t);
  });
  test("lo que dice Verzy no lo calla, ni una frase cualquiera", () => {
    assert.equal(S.loQueHaceConElSilencio(dice("yo sigo desde aquí", "replica"), false), null);
    assert.equal(S.loQueHaceConElSilencio(dice("¿y cuánto cuesta?"), false), null);
    assert.equal(S.loQueHaceConElSilencio(dice("¿y cuánto cuesta?"), true), null);
  });
  test("solo llamarlo por su nombre lo devuelve", () => {
    assert.equal(S.loQueHaceConElSilencio(dice("Verzy, ¿me ayudas con esto?"), true), "reanudar");
    assert.equal(S.loQueHaceConElSilencio(dice("Verzy, yo sigo desde aquí"), true), null);
  });
}

test(ROTO ? "ANTES: la sala no hacía nada con la orden" : "la sala corta la voz y la deja en silencio", () => {
  if (ROTO) assert.doesNotMatch(sala, /silencio-de-verzy|conversation\.interrupt/);
  else {
    assert.match(sala, /loQueHaceConElSilencio\(/);
    assert.match(sala, /conversation\.interrupt/);
    assert.match(sala, /silenciadoRef\.current/);
  }
});
test(ROTO ? "ANTES: la sala esperaba la vuelta del ciclo y miraba cada 400 ms" : "la orden despierta al ciclo y se mira cada 100 ms", () => {
  if (ROTO) { assert.doesNotMatch(srv, /despertar/); assert.match(srv, /dormir\(400\)/); }
  else { assert.match(srv, /pantallasVivas\.get\(citaId\)\?\.despertar\?\.\(\)/); assert.match(srv, /MIRAR_LA_ORDEN_MS = 100/); }
});
test(ROTO ? "ANTES: el gesto al menú y el recorrido iban antes de contestar" : "el gesto va a la vez que la carga y el recorrido después de contestar", () => {
  if (ROTO) { assert.match(srv, /await irAlMenu\(viva\);\s*const r = await cargar/); assert.doesNotMatch(srv, /viva\.despues/); }
  else {
    assert.doesNotMatch(srv, /await irAlMenu\(viva\);\s*const r = await cargar/);
    assert.match(srv, /viva\.despues = \(\) => recorrerConLaRueda\(viva\)/);
    assert.match(srv, /CALMA_DE_LA_RED_MS = 1_200/);
  }
});
