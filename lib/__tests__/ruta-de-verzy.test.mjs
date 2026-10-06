// La primera pantalla de Verzy salía con «/» (404) y al reabrir saltaba sola a
// una página vieja. MODO=roto compila las reglas de antes y afirma el fallo.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const ROTO = process.env.MODO === "roto";
const A = await import(new URL("./.compilado/ruta/pantalla-del-avatar.js", import.meta.url).href);
const V = await import(new URL("./.compilado/ruta/pantalla-de-verzy.js", import.meta.url).href);
const srv = readFileSync(`${process.env.RAIZ_RUTA}/lib/pantalla-de-verzy.server.ts`, "utf8");
const tool = (args) => ({ message_type: "conversation", event_type: "conversation.tool_call",
  properties: { name: A.NOMBRE_DE_LA_HERRAMIENTA, arguments: JSON.stringify(args) } });

test(ROTO ? "ANTES: «/» se aceptaba como pantalla" : "«/» no es una pantalla", () => {
  if (ROTO) assert.equal(V.comoRutaDeVerzy("/"), "/");
  else assert.equal(V.comoRutaDeVerzy("/"), null);
});
test(ROTO ? "ANTES: una ruta inválida se callaba (Verzy no se enteraba)" : "una ruta inválida se le cuenta a Verzy", () => {
  const o = A.laOrdenDeLaPantalla(tool({ ruta: "" }));
  if (ROTO) assert.equal(o, null);
  else assert.equal(o?.accion, "invalida");
});
test(ROTO ? "ANTES: al reabrir se retomaba cualquier destino guardado" : "al reabrir solo se retoma un relevo en vivo", () => {
  if (ROTO) assert.equal(typeof V.elDestinoQueSeRetoma, "undefined");
  else { assert.equal(typeof V.elDestinoQueSeRetoma, "function"); assert.match(srv, /elDestinoQueSeRetoma\(previa\[0\]\)/); }
});
