/**
 * La regla del vacío de la lista y un barrido de la bandeja.
 * Se levanta con `scripts/banco-busqueda-sin-hueco.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { elVacioEsCompacto, lasClasesDelVacio } from "./.compilado/busqueda-sin-hueco/reglas.js";

test("con texto que también se busca en los mensajes, el vacío es compacto", () => {
  assert.equal(elVacioEsCompacto("cotiz"), true);
  assert.equal(elVacioEsCompacto("15/09/2026"), true);
  assert.equal(elVacioEsCompacto(""), false);
  assert.equal(elVacioEsCompacto("ab"), false);
});

test("el compacto no ocupa el alto ni centra; el de siempre sí", () => {
  const c = lasClasesDelVacio(true);
  assert.ok(!c.includes("h-full") && !c.includes("justify-center"), c);
  const s = lasClasesDelVacio(false);
  assert.ok(s.includes("h-full") && s.includes("justify-center"), s);
});

test("barrido: la bandeja pasa compacto y vuelve arriba al cambiar la búsqueda", () => {
  const s = fs.readFileSync("app/(root)/chats/_components/chat-sidebar.tsx", "utf8");
  assert.match(s, /compacto=\{result\.success && elVacioEsCompacto\(q\)\}/);
  assert.match(s, /el\.scrollTop = 0;\s*setListViewport\(\{ scrollTop: 0[^}]*\}\);\s*\}, \[q\]\);/);
});
