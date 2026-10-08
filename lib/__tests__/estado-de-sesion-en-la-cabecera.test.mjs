// Un solo control de estado de sesión en la cabecera del chat: junto al nombre,
// y el interruptor de la fila de herramientas no vuelve.
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import assert from "node:assert/strict";

const ROTO = process.env.MODO === "roto";
const REF = process.env.ANTES_REF || "70273b0";
const ruta = "app/(root)/chats/_components/ChatHeader.tsx";
const src = ROTO ? execSync(`git show ${REF}:"${ruta}"`).toString() : readFileSync(ruta, "utf8");
const sinComentarios = src.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

const usos = [...sinComentarios.matchAll(/\{sessionToggle\}/g)].length;
const filaHerramientas = sinComentarios.slice(sinComentarios.indexOf("mobileToolsOpen &&"));
const casos = {
  "el interruptor va pegado al texto Activa/Pausada": /data-estado-de-sesion[\s\S]{0,400}\{sessionToggle\}/.test(sinComentarios),
  "la fila de herramientas no lleva el interruptor": !/\{sessionToggle\}/.test(filaHerramientas.slice(0, filaHerramientas.indexOf("Fila 2") > 0 ? filaHerramientas.indexOf("Fila 2") : 4000)),
  "el interruptor es la versión compacta": /<SwitchStatus[\s\S]*?compact[\s\S]*?\/>/.test(sinComentarios),
};
// No discrimina (el viejo también lo tiene): solo se exige en el modo normal.
const siempre = { "el interruptor se pinta una sola vez": usos === 1, "queda el botón que abre las herramientas": /setMobileToolsOpen\(\(v\) => !v\)/.test(sinComentarios) };

let mal = 0;
for (const [n, ok] of Object.entries(casos)) {
  if (ROTO) { if (!ok) { console.log(`ok (roto afirma el fallo): ${n}`); } else { console.log(`MAL (roto no reproduce): ${n}`); mal++; } }
  else { try { assert.ok(ok); console.log(`ok: ${n}`); } catch { console.log(`MAL: ${n}`); mal++; } }
}
if (!ROTO) for (const [n, ok] of Object.entries(siempre)) { if (ok) console.log(`ok: ${n}`); else { console.log(`MAL: ${n}`); mal++; } }
if (ROTO && Object.values(casos).every(Boolean)) mal++;
process.exit(mal ? 1 : 0);
