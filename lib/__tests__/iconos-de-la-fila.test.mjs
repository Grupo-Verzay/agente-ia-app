/**
 * Los iconitos de la fila de Chats, elegibles en Perfil › Apariencia: la regla
 * pura y un barrido de que la tarjeta, la fila y la lista pasan por ella.
 *
 * En `MODO=roto` lee el código de ANTES_REF y afirma que no había tarjeta ni
 * forma de esconder ningún icono.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const ROTO = process.env.MODO === "roto";
const ANTES = process.env.ANTES_REF ?? "da69baf";
const leer = (f) => ROTO
  ? (() => { try { return execSync(`git show ${ANTES}:"${f}"`, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }); } catch { return ""; } })()
  : readFileSync(f, "utf8");
const t = ROTO ? test.skip : test;

const APARIENCIA = "app/(root)/profile/_components/UserInformation.tsx";
const TARJETA = "app/(root)/profile/_components/IconosDeLaFilaCard.tsx";
const FILA = "app/(root)/chats/_components/ChatContactItem.tsx";
const LISTA = "app/(root)/chats/_components/chat-sidebar.tsx";

(ROTO ? test : test.skip)("ANTES: no había tarjeta ni forma de esconder un icono", () => {
  assert.equal(leer(TARJETA), "", "la tarjeta no existía");
  assert.doesNotMatch(leer(APARIENCIA), /IconosDeLaFilaCard/);
  assert.doesNotMatch(leer(FILA), /verCalificacion|verAsesor|verSinLeer|verNotas/);
  assert.doesNotMatch(leer(LISTA), /laNotaQueSeEnsena/);
});

t("la regla: cinco iconos, todos encendidos por defecto", async () => {
  const r = await import("./.compilado/iconos-de-la-fila/iconos-de-la-fila.js");
  assert.deepEqual(r.CLAVES_DE_ICONOS, ["calificacion", "asesor", "sinLeer", "notaInterna", "resumenIa"]);
  assert.equal(r.ICONOS_DE_LA_FILA.length, 5);
  for (const c of r.CLAVES_DE_ICONOS) assert.equal(r.ICONOS_POR_DEFECTO[c], true, c);
  assert.deepEqual(r.comoIconosDeLaFila(null), r.ICONOS_POR_DEFECTO);
  assert.deepEqual(r.comoIconosDeLaFila("basura"), r.ICONOS_POR_DEFECTO);
  // Solo un false explícito apaga; lo raro no esconde nada.
  const x = r.comoIconosDeLaFila({ asesor: false, sinLeer: "no", raro: false });
  assert.equal(x.asesor, false);
  assert.equal(x.sinLeer, true);
  assert.equal("raro" in x, false);
  assert.equal(r.conElIcono(r.ICONOS_POR_DEFECTO, "notaInterna", false).notaInterna, false);
});

t("la nota de la vista previa: interna y resumen IA, por separado", async () => {
  const r = await import("./.compilado/iconos-de-la-fila/iconos-de-la-fila.js");
  const todo = r.ICONOS_POR_DEFECTO;
  const nota = { texto: "Llamar el lunes" };
  const resumen = { texto: `${r.PREFIJO_DEL_RESUMEN_IA}: pidió precios` };
  assert.equal(r.laNotaQueSeEnsena(nota, todo), nota);
  assert.equal(r.laNotaQueSeEnsena(resumen, todo), resumen);
  assert.equal(r.laNotaQueSeEnsena(nota, { ...todo, notaInterna: false }), null);
  assert.equal(r.laNotaQueSeEnsena(resumen, { ...todo, resumenIa: false }), null);
  assert.equal(r.laNotaQueSeEnsena(nota, { ...todo, resumenIa: false }), nota);
  assert.equal(r.laNotaQueSeEnsena(null, todo), null);
});

t("barrido: la tarjeta va en Apariencia, con un interruptor por icono", () => {
  assert.match(leer(APARIENCIA), /<IconosDeLaFilaCard \/>/);
  const tarjeta = leer(TARJETA);
  assert.match(tarjeta, /ICONOS_DE_LA_FILA\.map/);
  assert.match(tarjeta, /<Switch/);
  assert.match(tarjeta, /guardarIconosDeLaFilaAction/);
  assert.match(tarjeta, /setIconos\(antes\)/, "si no se guarda, vuelve");
});

t("barrido: la fila y la lista obedecen", () => {
  const fila = leer(FILA);
  for (const p of ["verCalificacion &&", "verAsesor &&", "verNotas && hasNotes", "verSinLeer && isUnread"]) {
    assert.ok(fila.includes(p), p);
  }
  const lista = leer(LISTA);
  assert.match(lista, /laNotaQueSeEnsena\(ultimaNota, iconos\)/);
  for (const p of ["verCalificacion={iconos.calificacion}", "verAsesor={iconos.asesor}", "verSinLeer={iconos.sinLeer}", "verNotas={iconos.notaInterna}"]) {
    assert.ok(lista.includes(p), p);
  }
});
