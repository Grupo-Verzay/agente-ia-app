// Interruptores «Sesión» y «Agente» por asesor, contra Postgres con las
// acciones de verdad. En MODO=roto no existen: el barrido de al lado lo afirma.
import test from "node:test";
import assert from "node:assert/strict";

const ROTO = process.env.MODO === "roto";
const m = ROTO ? null : await import("./.compilado/ia-asesor/entrada-del-ia-del-asesor.js");
const t = ROTO ? test.skip : test;
const db = m?.db;

const S = Date.now().toString(36);
const DUENO = `dueno-${S}`, ANA = `ana-${S}`, BETO = `beto-${S}`;
const LINEA = `LINEA_${S}`;
const quien = (id, extra = {}) => ({
  id, effectiveId: id, sessionUserId: id, ownerId: null, advisorRole: null,
  role: "user", rolDeLaPersona: "user", email: `${id}@x.co`, name: id, ...extra,
});
let n = 0;
async function sesion(asesor, extra = {}) {
  n++;
  return db.session.create({
    data: {
      userId: DUENO, remoteJid: `57300${S.length}${Date.now() % 100000}${n}@s.whatsapp.net`,
      pushName: `c${n}`, instanceId: LINEA, status: true, aiOptIn: true,
      assignedAdvisorId: asesor, ...extra,
    },
  });
}
const leer = (id) => db.session.findUnique({ where: { id }, select: { status: true, agentDisabled: true, aiOptIn: true } });

if (!ROTO) {
  test.before(async () => {
    await db.user.create({ data: { id: DUENO, email: `${DUENO}@x.co`, name: "Dueño" } });
    for (const id of [ANA, BETO]) {
      await db.user.create({ data: { id, email: `${id}@x.co`, name: id, ownerId: DUENO, advisorRole: "agente" } });
    }
    await db.instancia.create({ data: { instanceName: LINEA, userId: DUENO, instanceId: LINEA, instanceType: "Whatsapp" } });
    m.ponerAQuienMira(quien(DUENO));
  });
  test.after(async () => {
    await db.session.deleteMany({ where: { userId: DUENO } });
    await db.instancia.deleteMany({ where: { instanceName: LINEA } });
    await db.user.deleteMany({ where: { id: { in: [ANA, BETO, DUENO] } } });
    await db.$disconnect();
  });
}

t("Sesión apagada pausa las de ESE asesor; al encender vuelve solo lo que pausó", async () => {
  m.ponerAQuienMira(quien(DUENO));
  const a1 = await sesion(ANA), aMano = await sesion(ANA, { status: false }), b1 = await sesion(BETO);
  const r = await m.toggleAdvisorIa(ANA, "sesion", false);
  assert.equal(r.success, true);
  assert.equal((await leer(a1.id)).status, false);
  assert.equal((await leer(b1.id)).status, true, "el otro asesor no se toca");
  await m.toggleAdvisorIa(ANA, "sesion", true);
  assert.equal((await leer(a1.id)).status, true);
  assert.equal((await leer(aMano.id)).status, false, "lo pausado a mano se queda pausado");
});

t("un mensaje entrante NO reabre lo que pausó el interruptor, y sí una resuelta normal", async () => {
  m.ponerAQuienMira(quien(DUENO));
  const a = await sesion(ANA), b = await sesion(BETO, { status: false });
  await m.toggleAdvisorIa(ANA, "sesion", false);
  for (const s of [a, b]) {
    await m.upsertSessionFromChatMessage({ userId: DUENO, instanceName: LINEA, remoteJid: (await db.session.findUnique({ where: { id: s.id } })).remoteJid, fromMe: false, pushName: "x", content: "hola" });
  }
  assert.equal((await leer(a.id)).status, false, "sigue pausada por su asesor");
  assert.equal((await leer(b.id)).status, true, "la resuelta normal se reabre");
  await m.toggleAdvisorIa(ANA, "sesion", true);
});

t("Agente apagado apaga la IA y al encender devuelve el opt-in", async () => {
  m.ponerAQuienMira(quien(DUENO));
  const a = await sesion(ANA);
  await m.toggleAdvisorIa(ANA, "agente", false);
  assert.deepEqual(await leer(a.id), { status: true, agentDisabled: true, aiOptIn: false });
  await m.toggleAdvisorIa(ANA, "agente", true);
  assert.deepEqual(await leer(a.id), { status: true, agentDisabled: false, aiOptIn: true });
});

t("lo que se asigna a un asesor con los interruptores apagados entra apagado", async () => {
  m.ponerAQuienMira(quien(DUENO));
  await m.toggleAdvisorIa(BETO, "sesion", false);
  await m.toggleAdvisorIa(BETO, "agente", false);
  const s = await sesion(null);
  const r = await m.assignSessionToAdvisor(s.id, BETO);
  assert.equal(r.success, true, r.message);
  assert.deepEqual(await leer(s.id), { status: false, agentDisabled: true, aiOptIn: false });
  const eq = await m.getTeamAdvisors();
  const beto = eq.data.find((x) => x.id === BETO);
  assert.equal(beto.sesionApagada, true);
  assert.equal(beto.agenteApagado, true);
});

t("tocar a mano olvida la marca: al encender el interruptor no se pisa", async () => {
  m.ponerAQuienMira(quien(DUENO));
  const s = (await db.session.findMany({ where: { userId: DUENO, assignedAdvisorId: BETO }, orderBy: { id: "desc" }, take: 1 }))[0];
  await m.updateSessionStatus(s.id, false);
  await m.toggleAgentDisabled(DUENO, s.id, true);
  await m.toggleAdvisorIa(BETO, "sesion", true);
  await m.toggleAdvisorIa(BETO, "agente", true);
  assert.deepEqual(await leer(s.id), { status: false, agentDisabled: true, aiOptIn: false });
});

t("un agente no puede mover los interruptores", async () => {
  m.ponerAQuienMira(quien(ANA, { ownerId: DUENO, advisorRole: "agente", effectiveId: ANA }));
  const r = await m.toggleAdvisorIa(BETO, "sesion", false);
  assert.equal(r.success, false);
  m.ponerAQuienMira(quien(DUENO));
});
