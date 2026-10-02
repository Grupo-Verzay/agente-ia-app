/**
 * Los iconos de la fila de Chats se ponen al día cuando se cambian desde la
 * conversación abierta: la regla y un barrido del código.
 *
 * La regla (`lib/fila-de-chats-al-dia.ts`): qué campos se toman de la lectura
 * fresca, que el aviso sin id no hace nada y que el conjunto de notas no se
 * copia si no cambia.
 *
 * El barrido mira lo que un banco puro no puede: que CADA sitio que cambia un
 * icono de la fila avisa, que las etiquetas se aplican por el id de la sesión
 * (la fila lee la llave de SU línea, no la global) y que la lista de notas mira
 * las cuentas que la bandeja enseña.
 *
 * `MODO=roto` lee los mismos ficheros de `DIR_ANTES` (un worktree del commit
 * de antes) y afirma el fallo: nadie avisaba, y las etiquetas buscaban la
 * llave global.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..", "..");
const ROTO = process.env.MODO === "roto";
const DIR = ROTO ? process.env.DIR_ANTES : RAIZ;
const leer = (rel) => readFileSync(join(DIR, rel), "utf8");
const sinComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const C = "app/(root)/chats/_components/";
/** Los sitios que cambian un icono de la fila desde la conversación abierta. */
const QUIEN_CAMBIA = {
  "etiquetas (cabecera y CRM)": "app/(root)/tags/components/SessionTagsCombobox.tsx",
  "notas, macros y copiloto": C + "chat-main.tsx",
  "etiqueta desde el menú de la fila": C + "chat-sidebar.tsx",
  "recordatorio": C + "ChatReminderDialog.tsx",
  "cita agendada": C + "ChatAppointmentStatusButton.tsx",
  "flujos y respuestas rápidas": C + "chats-client.tsx",
};

if (!ROTO) {
  const L = await import(join(AQUI, ".compilado", "fila-de-chats-al-dia.js"));

  test("se toman los campos de la fila y nada más", () => {
    const fila = {
      id: 7, userId: "u", remoteJid: "j", tags: [], reminderCount: 2,
      latestAppointmentStatus: "PENDIENTE", pendingSeguimientos: 1, resolvedAt: 123,
      instanceId: "X", updatedAt: 9, etapa: null, leadStatus: "CALIENTE",
    };
    const cambio = L.elCambioDeLaFila(fila);
    assert.equal(cambio.reminderCount, 2);
    assert.equal(cambio.latestAppointmentStatus, "PENDIENTE");
    assert.equal(cambio.pendingSeguimientos, 1);
    assert.equal(cambio.leadStatus, "CALIENTE");
    assert.ok("etapa" in cambio, "una etapa en null también se aplica: quitarla es un cambio");
    assert.ok(!("resolvedAt" in cambio), "resolver lleva su propio camino");
    assert.ok(!("instanceId" in cambio) && !("id" in cambio) && !("remoteJid" in cambio));
  });

  test("lo que la fila pinta está en la lista", () => {
    for (const campo of ["tags", "reminderCount", "latestAppointmentStatus", "pendingSeguimientos", "seguimientosTipos", "flujos", "escalatedAt", "assignedAdvisorId"]) {
      assert.ok(L.CAMPOS_DE_LA_FILA_AL_DIA.includes(campo), campo);
    }
  });

  test("el aviso sin id ni ventana no hace nada", () => {
    assert.doesNotThrow(() => L.avisarQueCambioLaFila(undefined, "x"));
    assert.doesNotThrow(() => L.avisarQueCambioLaFila(5, "x"));
  });

  test("el conjunto de notas no se copia si no cambia", () => {
    const s = new Set([1, 2]);
    assert.equal(L.conLasNotasDeLaFila(s, 1, true), s);
    assert.equal(L.conLasNotasDeLaFila(s, 3, false), s);
    assert.deepEqual([...L.conLasNotasDeLaFila(s, 3, true)].sort(), [1, 2, 3]);
    assert.deepEqual([...L.conLasNotasDeLaFila(s, 1, false)], [2]);
  });

  test("la espera para agrupar avisos es corta", () => {
    assert.ok(L.ESPERA_PARA_LEER_LA_FILA_MS <= 1000);
  });
}

for (const [que, fichero] of Object.entries(QUIEN_CAMBIA)) {
  test(`${ROTO ? "ANTES" : "ahora"}: ${que} avisa a la fila`, () => {
    const avisa = /avisarQueCambioLaFila\(/.test(sinComentarios(leer(fichero)));
    if (ROTO) assert.equal(avisa, false, `${fichero} ya avisaba antes`);
    else assert.equal(avisa, true, `${fichero} cambia un icono y no avisa a su fila`);
  });
}

test(`${ROTO ? "ANTES" : "ahora"}: la pantalla de Chats escucha el aviso y vuelve a leer la fila`, () => {
  const s = sinComentarios(leer(C + "chats-client.tsx"));
  const escucha = /EVENTO_FILA_DE_CHAT/.test(s) && /laFilaDeLaSesionAction\(/.test(s);
  assert.equal(escucha, !ROTO);
});

test(`${ROTO ? "ANTES" : "ahora"}: las etiquetas se aplican por el id de la sesión`, () => {
  const s = sinComentarios(leer(C + "chats-client.tsx"));
  const i = s.indexOf("const handleSessionTagsChange");
  assert.ok(i >= 0);
  const cuerpo = s.slice(i, s.indexOf("useCallback(", s.indexOf("useCallback(", i) + 1));
  if (ROTO) {
    assert.match(cuerpo, /previous\[remoteJid\]/, "antes buscaba la llave GLOBAL");
    assert.doesNotMatch(cuerpo, /aplicarEnLaSesion/);
  } else {
    assert.match(cuerpo, /aplicarEnLaSesion\(/);
    assert.doesNotMatch(cuerpo, /previous\[remoteJid\]/);
  }
});

test(`${ROTO ? "ANTES" : "ahora"}: la lista de notas mira las cuentas de la bandeja`, () => {
  const s = sinComentarios(leer("actions/internal-notes-actions.ts"));
  const i = s.indexOf("export async function getSessionIdsWithNotesAction");
  const cuerpo = s.slice(i, s.indexOf("export ", i + 10));
  assert.equal(/lasCuentasQueVeLaBandeja\(/.test(cuerpo), !ROTO);
});
