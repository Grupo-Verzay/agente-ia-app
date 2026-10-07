// «Ver número» por agente contra Postgres con las acciones de verdad.
import test from "node:test";
import assert from "node:assert/strict";

const ROTO = process.env.MODO === "roto";
const m = ROTO ? null : await import("./.compilado/ver-numero/entrada-del-ver-numero.js");
const t = ROTO ? test.skip : test;
const db = m?.db;

const S = Date.now().toString(36);
const DUENO = `dueno-${S}`, ANA = `ana-${S}`, BETO = `beto-${S}`, OTRO = `otro-${S}`, AJENO = `ajeno-${S}`;
const quien = (id, extra = {}) => ({
  id, effectiveId: id, sessionUserId: id, ownerId: null, advisorRole: null,
  role: "user", rolDeLaPersona: "user", email: `${id}@x.co`, name: id, ...extra,
});

if (!ROTO) {
  test.before(async () => {
    for (const id of [DUENO, OTRO]) await db.user.create({ data: { id, email: `${id}@x.co`, name: id } });
    for (const id of [ANA, BETO]) {
      await db.user.create({ data: { id, email: `${id}@x.co`, name: id, ownerId: DUENO, advisorRole: "agente" } });
    }
    await db.user.create({ data: { id: AJENO, email: `${AJENO}@x.co`, name: AJENO, ownerId: OTRO, advisorRole: "agente" } });
  });
  test.after(async () => {
    await db.user.deleteMany({ where: { id: { in: [ANA, BETO, AJENO, DUENO, OTRO] } } });
    await db.$disconnect();
  });
}

t("por defecto apagado: la tabla del equipo lo dice y el agente ve tapado", async () => {
  m.ponerAQuienMira(quien(DUENO));
  const eq = await m.getTeamAdvisors();
  assert.equal(eq.success, true, eq.message);
  assert.equal(eq.data.find((x) => x.id === ANA).verNumeroCompleto, false);
  assert.equal(await m.veElNumeroCompleto(DUENO, ANA), false);
});

t("el dueño lo enciende para UN agente, y solo ese lo ve", async () => {
  m.ponerAQuienMira(quien(DUENO));
  const r = await m.toggleAdvisorVerNumero(ANA, true);
  assert.equal(r.success, true, r.message);
  assert.equal(await m.veElNumeroCompleto(DUENO, ANA), true);
  assert.equal(await m.veElNumeroCompleto(DUENO, BETO), false);
  const eq = await m.getTeamAdvisors();
  assert.equal(eq.data.find((x) => x.id === ANA).verNumeroCompleto, true);
  assert.equal(eq.data.find((x) => x.id === BETO).verNumeroCompleto, false);
});

t("el permiso es de ESTA cuenta: en otra no vale", async () => {
  assert.equal(await m.veElNumeroCompleto(OTRO, ANA), false);
  assert.deepEqual([...(await m.losQueVenElNumero([OTRO]))], []);
});

t("apagarlo lo vuelve a tapar", async () => {
  m.ponerAQuienMira(quien(DUENO));
  await m.toggleAdvisorVerNumero(ANA, false);
  assert.equal(await m.veElNumeroCompleto(DUENO, ANA), false);
});

t("no se toca un asesor de otra cuenta", async () => {
  m.ponerAQuienMira(quien(DUENO));
  const r = await m.toggleAdvisorVerNumero(AJENO, true);
  assert.equal(r.success, false);
  assert.equal(await m.veElNumeroCompleto(DUENO, AJENO), false);
});

t("un agente no puede darse el permiso", async () => {
  m.ponerAQuienMira(quien(ANA, { ownerId: DUENO, advisorRole: "agente" }));
  const r = await m.toggleAdvisorVerNumero(ANA, true);
  assert.equal(r.success, false);
  assert.equal(await m.veElNumeroCompleto(DUENO, ANA), false);
  m.ponerAQuienMira(quien(DUENO));
});
