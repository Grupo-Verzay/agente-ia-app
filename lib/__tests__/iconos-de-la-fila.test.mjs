/**
 * Los iconitos de la fila de Chats, elegibles en Perfil › Apariencia: la regla
 * pura y un barrido de que la tarjeta, la fila y la lista pasan por ella.
 *
 * Dos tarjetas en Apariencia (prioritarios y secundarios) con las DIEZ pastillas
 * de la fila; lo que no es pastilla no tiene interruptor.
 *
 * En `MODO=roto` lee el código de ANTES_REF y afirma la tarjeta vieja: cinco
 * interruptores (sin leer y resumen IA entre ellos) y solo tres pastillas.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const ROTO = process.env.MODO === "roto";
const ANTES = process.env.ANTES_REF ?? "7d3709d";
const leer = (f) => ROTO
  ? (() => { try { return execSync(`git show ${ANTES}:"${f}"`, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }); } catch { return ""; } })()
  : readFileSync(f, "utf8");
const t = ROTO ? test.skip : test;

const APARIENCIA = "app/(root)/profile/_components/UserInformation.tsx";
const TARJETA = "app/(root)/profile/_components/IconosDeLaFilaCard.tsx";
const FILA = "app/(root)/chats/_components/ChatContactItem.tsx";
const LISTA = "app/(root)/chats/_components/chat-sidebar.tsx";

(ROTO ? test : test.skip)("ANTES: una tarjeta, cinco interruptores, y solo tres pastillas obedecían", () => {
  const regla = leer("lib/iconos-de-la-fila.ts");
  assert.match(regla, /sinLeer/);
  assert.match(regla, /resumenIa/);
  const fila = leer(FILA);
  assert.match(fila, /verSinLeer && isUnread/);
  for (const p of ["verEspera", "verEtapa", "verRecordatorios", "verFlujos", "verSeguimientos", "verCita", "verEtiquetas"]) {
    assert.ok(!fila.includes(p), `${p} no existía`);
  }
  assert.doesNotMatch(leer(TARJETA), /TARJETAS_DE_ICONOS/);
});

const PRIORITARIOS = ["calificacion", "asesor", "etapa", "cita", "notaInterna"];
const SECUNDARIOS = ["espera", "recordatorios", "flujos", "seguimientos", "etiquetas"];

t("la regla: diez pastillas en dos grupos, todas encendidas por defecto", async () => {
  const r = await import("./.compilado/iconos-de-la-fila/iconos-de-la-fila.js");
  assert.equal(r.ICONOS_DE_LA_FILA.length, 10);
  assert.deepEqual(r.losIconosDelGrupo("prioritarios").map((i) => i.clave), PRIORITARIOS);
  assert.deepEqual(r.losIconosDelGrupo("secundarios").map((i) => i.clave), SECUNDARIOS);
  assert.deepEqual(r.TARJETAS_DE_ICONOS.map((t) => t.grupo), ["prioritarios", "secundarios"]);
  for (const c of r.CLAVES_DE_ICONOS) assert.equal(r.ICONOS_POR_DEFECTO[c], true, c);
  // Lo que no es pastilla no tiene interruptor.
  for (const c of ["sinLeer", "resumenIa", "destacada", "anclada", "bloqueada"]) assert.ok(!r.CLAVES_DE_ICONOS.includes(c), c);
  assert.deepEqual(r.comoIconosDeLaFila(null), r.ICONOS_POR_DEFECTO);
  assert.deepEqual(r.comoIconosDeLaFila("basura"), r.ICONOS_POR_DEFECTO);
  // Solo un false explícito apaga; lo raro —y las claves viejas— no esconde nada.
  const x = r.comoIconosDeLaFila({ asesor: false, etapa: "no", sinLeer: false, resumenIa: false });
  assert.equal(x.asesor, false);
  assert.equal(x.etapa, true);
  assert.equal("sinLeer" in x, false);
  assert.equal("resumenIa" in x, false);
  // Lo guardado con la tarjeta vieja sigue valiendo.
  assert.equal(r.comoIconosDeLaFila({ calificacion: false, notaInterna: false }).notaInterna, false);
  assert.equal(r.conElIcono(r.ICONOS_POR_DEFECTO, "cita", false).cita, false);
});

t("barrido: dos tarjetas en Apariencia, un interruptor por pastilla", () => {
  assert.match(leer(APARIENCIA), /<IconosDeLaFilaCard \/>/);
  const tarjeta = leer(TARJETA);
  assert.match(tarjeta, /TARJETAS_DE_ICONOS\.map/);
  assert.match(tarjeta, /md:col-span-2 md:grid-cols-2/, "las dos en su propia fila, lado a lado");
  assert.match(tarjeta, /losIconosDelGrupo/);
  assert.match(tarjeta, /<Switch/);
  assert.match(tarjeta, /guardarIconosDeLaFilaAction/);
  assert.match(tarjeta, /setIconos\(antes\)/, "si no se guarda, vuelve");
});

t("barrido: las diez pastillas obedecen; sin leer y la vista previa no", () => {
  const fila = leer(FILA);
  for (const p of ["verEspera && escaladaEn", "verEtapa && contact.chatSession.etapa", "verCalificacion &&", "verAsesor &&",
    "verRecordatorios && recordatorios", "verFlujos && contact.chatSession?.flujos", "verSeguimientos &&",
    "verCita && apptStatus", "verNotas && hasNotes", "verEtiquetas && tags.length"]) {
    assert.ok(fila.includes(p), p);
  }
  assert.ok(!fila.includes("verSinLeer"), "sin leer no tiene interruptor");
  const lista = leer(LISTA);
  assert.match(lista, /nota: ultimaNota,/, "la vista previa no se filtra");
  for (const [p, c] of [["Espera", "espera"], ["Etapa", "etapa"], ["Calificacion", "calificacion"], ["Asesor", "asesor"],
    ["Recordatorios", "recordatorios"], ["Flujos", "flujos"], ["Seguimientos", "seguimientos"], ["Cita", "cita"],
    ["Notas", "notaInterna"], ["Etiquetas", "etiquetas"]]) {
    assert.ok(lista.includes(`ver${p}={iconos.${c}}`), p);
  }
});
