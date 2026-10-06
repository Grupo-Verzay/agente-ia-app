/**
 * Las acciones de verdad contra Postgres: lo que se guarda es de la PERSONA,
 * sin nada guardado son todos, y otra persona no ve lo de la primera.
 */
import test from "node:test";
import assert from "node:assert/strict";

const ROTO = process.env.MODO === "roto";
const t = ROTO ? test.skip : test;
const m = ROTO ? null : await import("./.compilado/iconos-de-la-fila/entrada-de-iconos-de-la-fila.js");

const V = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const CUENTA = `iconos-cuenta-${V}`;
const ASESOR = `iconos-asesor-${V}`;
const quien = (id, ownerId = null) => ({ id, effectiveId: ownerId ?? id, sessionUserId: id, ownerId,
  advisorRole: ownerId ? "agente" : null, role: "user", rolDeLaPersona: "user", email: `${id}@banco.test`, name: id });

if (!ROTO) {
  test.before(async () => {
    await m.db.user.create({ data: { id: CUENTA, email: `${CUENTA}@banco.test`, name: CUENTA, role: "user" } });
    await m.db.user.create({ data: { id: ASESOR, email: `${ASESOR}@banco.test`, name: ASESOR, role: "user", ownerId: CUENTA } });
  });
  test.after(async () => {
    await m.db.$executeRawUnsafe(`DELETE FROM "preferencias_de_persona" WHERE "personaId" IN ('${CUENTA}','${ASESOR}')`).catch(() => {});
    await m.db.user.deleteMany({ where: { id: { in: [ASESOR, CUENTA] } } });
    await m.db.$disconnect();
  });
}

t("sin nada guardado, todos encendidos", async () => {
  m.ponerAQuienMira(quien(CUENTA));
  const r = await m.misIconosDeLaFilaAction();
  assert.equal(r.success, true);
  assert.ok(Object.values(r.iconos).every(Boolean));
});

t("guardar apaga solo lo pedido, y se lee igual después", async () => {
  m.ponerAQuienMira(quien(CUENTA));
  const r = await m.guardarIconosDeLaFilaAction({ calificacion: true, asesor: false, etapa: true, cita: true, notaInterna: true, espera: true, recordatorios: true, flujos: false, seguimientos: true, etiquetas: true });
  assert.equal(r.success, true, r.message);
  const leidos = (await m.misIconosDeLaFilaAction()).iconos;
  assert.equal(leidos.asesor, false);
  assert.equal(leidos.flujos, false);
  assert.equal(leidos.calificacion, true);
});

t("es de la PERSONA: el asesor de la misma cuenta sigue viéndolos todos", async () => {
  m.ponerAQuienMira(quien(ASESOR, CUENTA));
  const r = await m.misIconosDeLaFilaAction();
  assert.ok(Object.values(r.iconos).every(Boolean));
  await m.guardarIconosDeLaFilaAction({ etiquetas: false });
  m.ponerAQuienMira(quien(CUENTA));
  assert.equal((await m.misIconosDeLaFilaAction()).iconos.etiquetas, true);
});

t("basura del navegador no esconde nada", async () => {
  m.ponerAQuienMira(quien(CUENTA));
  const r = await m.guardarIconosDeLaFilaAction("<script>");
  assert.equal(r.success, true);
  assert.ok(Object.values(r.iconos).every(Boolean));
});
