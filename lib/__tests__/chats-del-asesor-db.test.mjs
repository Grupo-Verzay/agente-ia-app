// Los chats que «perdía» un asesor al apagar sus interruptores en Equipo.
//
// Contra Postgres y con las acciones de verdad. Lo que decide el diagnóstico:
//  1. Los interruptores «Sesión» y «Agente» NUNCA mueven `assigned_advisor_id`
//     (vale en los dos modos: no había pérdida en la base por la App).
//  2. Con «Sesión» apagado, Equipo seguía contando sus chats como activos.
//     Antes caían a 0 (`status = false` se contaba como cerrada) y parecía que
//     se los habían quitado. MODO=roto corre el código de ANTES_REF y AFIRMA
//     esa caída.
import test from "node:test";
import assert from "node:assert/strict";

const ROTO = process.env.MODO === "roto";
const m = await import(
  ROTO
    ? "./.compilado/chats-del-asesor-antes/entrada-de-chats-del-asesor.js"
    : "./.compilado/chats-del-asesor/entrada-de-chats-del-asesor.js"
);
const db = m.db;

const S = `${Date.now().toString(36)}${ROTO ? "r" : "n"}`;
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
      userId: DUENO, remoteJid: `57311${Date.now() % 100000}${n}@s.whatsapp.net`,
      pushName: `c${n}`, instanceId: LINEA, status: true, aiOptIn: true,
      assignedAdvisorId: asesor, ...extra,
    },
  });
}
const asesores = async () =>
  Object.fromEntries(
    (await db.session.findMany({ where: { userId: DUENO }, select: { id: true, assignedAdvisorId: true } }))
      .map((s) => [s.id, s.assignedAdvisorId]),
  );
const activas = async (id) => (await m.getTeamAdvisors()).data.find((x) => x.id === id).activeCount;
const enMetricas = async (id) => (await m.getTeamMetrics()).data.advisors.find((x) => x.id === id);

test.before(async () => {
  await db.user.create({ data: { id: DUENO, email: `${DUENO}@x.co`, name: "Dueño" } });
  for (const id of [ANA, BETO]) {
    await db.user.create({ data: { id, email: `${id}@x.co`, name: id, ownerId: DUENO, advisorRole: "agente" } });
  }
  await db.instancia.create({ data: { instanceName: LINEA, userId: DUENO, instanceId: LINEA, instanceType: "Whatsapp" } });
  m.ponerAQuienMira(quien(DUENO));
  // Ana: tres abiertas y una que ya estaba cerrada a mano. Beto: dos abiertas.
  await sesion(ANA); await sesion(ANA); await sesion(ANA, { agentDisabled: true });
  await sesion(ANA, { status: false });
  await sesion(BETO); await sesion(BETO);
});
test.after(async () => {
  await m.toggleAdvisorIa(ANA, "sesion", true).catch(() => undefined);
  await m.toggleAdvisorIa(ANA, "agente", true).catch(() => undefined);
  await db.session.deleteMany({ where: { userId: DUENO } });
  await db.instancia.deleteMany({ where: { instanceName: LINEA } });
  await db.user.deleteMany({ where: { id: { in: [ANA, BETO, DUENO] } } });
  await db.$disconnect();
});

test("apagar y encender «Sesión» y «Agente» no le quita a nadie sus chats", async () => {
  m.ponerAQuienMira(quien(DUENO));
  const antes = await asesores();
  for (const [parte, valor] of [["sesion", false], ["agente", false], ["sesion", true], ["agente", true], ["agente", false], ["sesion", false]]) {
    const r = await m.toggleAdvisorIa(ANA, parte, valor);
    assert.equal(r.success, true, r.message);
    assert.deepEqual(await asesores(), antes, `tras ${parte}=${valor}`);
  }
  await m.toggleAdvisorIa(ANA, "sesion", true);
  await m.toggleAdvisorIa(ANA, "agente", true);
});

test("con «Sesión» apagado, Equipo sigue contando sus chats como activos", async () => {
  m.ponerAQuienMira(quien(DUENO));
  const antes = await activas(ANA);
  const metricasAntes = await enMetricas(ANA);
  assert.equal(antes, 3);
  await m.toggleAdvisorIa(ANA, "sesion", false);
  const apagado = await activas(ANA);
  const metricas = await enMetricas(ANA);
  if (ROTO) {
    assert.equal(apagado, 0, "ANTES: Ana se quedaba con 0 activas y parecía sin chats");
    assert.equal(metricas.activeCount, 0);
  } else {
    assert.equal(apagado, antes, "sus chats siguen siendo suyos y abiertos");
    assert.deepEqual(
      { activas: metricas.activeCount, cerradas: metricas.closedCount },
      { activas: metricasAntes.activeCount, cerradas: metricasAntes.closedCount },
    );
    assert.equal(await activas(BETO), 2, "al otro asesor no se le toca");
  }
  await m.toggleAdvisorIa(ANA, "sesion", true);
  assert.equal(await activas(ANA), 3);
});
