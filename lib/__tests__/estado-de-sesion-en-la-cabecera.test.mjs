// El estado de sesión de la cabecera del chat es UN solo elemento: la pastilla
// que dice Activa (verde) / Pausada (gris) y ES el interruptor. Y la fila de
// iconos reparte todo el ancho con huecos iguales (`justify-between`).
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import assert from "node:assert/strict";

const ROTO = process.env.MODO === "roto";
const REF = process.env.ANTES_REF || "f227386";
const ruta = "app/(root)/chats/_components/ChatHeader.tsx";
const rutaSwitch = "app/(root)/sessions/_components/SwitchStatus.tsx";
const leer = (r) => (ROTO ? execSync(`git show ${REF}:"${r}"`).toString() : readFileSync(r, "utf8"));
const quitar = (s) => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
const src = quitar(leer(ruta));
const sw = quitar(leer(rutaSwitch));

const filaHerramientas = src.slice(src.indexOf("mobileToolsOpen &&"));
const casos = {
  "no hay una pastilla Badge aparte con el estado": !/<Badge[^>]*data-estado-de-sesion/.test(src),
  "el interruptor se pinta como pastilla": /<SwitchStatus[\s\S]*?\bpastilla\b[\s\S]*?\/>/.test(src),
  "la pastilla dice Activa/Pausada y es el interruptor": /pastilla\)\s*\{[\s\S]*?Activa[\s\S]*?Pausada/.test(sw),
  "activa verde y pausada gris": /data-\[state=checked\]:bg-emerald-100/.test(sw) && /bg-slate-200/.test(sw),
  "la fila de iconos reparte todo el ancho (justify-between)": /flex items-center justify-between[^"']*overflow-x-auto/.test(filaHerramientas.slice(0, 600)),
};
const siempre = {
  "el interruptor se pinta una sola vez": [...src.matchAll(/\{sessionToggle\}/g)].length === 1,
  "queda el botón que abre las herramientas": /setMobileToolsOpen\(\(v\) => !v\)/.test(src),
};

let mal = 0;
for (const [n, ok] of Object.entries(casos)) {
  if (ROTO) { if (!ok) console.log(`ok (roto afirma el fallo): ${n}`); else { console.log(`MAL (roto no reproduce): ${n}`); mal++; } }
  else { try { assert.ok(ok); console.log(`ok: ${n}`); } catch { console.log(`MAL: ${n}`); mal++; } }
}
if (!ROTO) for (const [n, ok] of Object.entries(siempre)) { if (ok) console.log(`ok: ${n}`); else { console.log(`MAL: ${n}`); mal++; } }
if (ROTO && Object.values(casos).every(Boolean)) mal++;
process.exit(mal ? 1 : 0);
