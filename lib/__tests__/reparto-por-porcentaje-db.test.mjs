/**
 * Las ACCIONES de verdad contra Postgres: elegir el modo en Equipo, guardar los
 * porcentajes y «Asignar sin atender». Lo único que se finge es `currentUser()`.
 *
 * Solo corre en el modo normal: antes de este cambio no había modo por
 * porcentaje, y eso lo afirma el barrido (`reparto-por-porcentaje.test.mjs`) y
 * el banco del backend, que ejerce el servicio de antes.
 */
import test from "node:test";
import assert from "node:assert/strict";

const ROTO = process.env.MODO === "roto";
const m = ROTO ? null : await import("./.compilado/reparto/entrada-del-reparto-por-porcentaje.js");
const t = ROTO ? test.skip : test;

const V = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const DUENO = `rpp-dueno-${V}`;
const A = `rpp-a-${V}`;
const B = `rpp-b-${V}`;
const C = `rpp-c-${V}`;
const AJENO = `rpp-ajeno-${V}`;

function quien(id, extra = {}) {
    return {
        id, effectiveId: id, sessionUserId: id, ownerId: null, advisorRole: null,
        role: "user", rolDeLaPersona: "user", email: `${id}@banco.test`, name: id, ...extra,
    };
}

async function sesiones(n, desde) {
    for (let i = 0; i < n; i++) {
        await m.db.session.create({
            data: {
                userId: DUENO, remoteJid: `57311${String(desde + i).padStart(7, "0")}@s.whatsapp.net`,
                pushName: "Cliente", instanceId: "LINEA", status: true,
            },
        });
    }
}

async function reparto() {
    const filas = await m.db.$queryRawUnsafe(
        `SELECT assigned_advisor_id AS id, COUNT(*)::int AS n FROM "Session" WHERE "userId" = $1 AND assigned_advisor_id IS NOT NULL GROUP BY 1`,
        DUENO,
    );
    const mapa = new Map(filas.map((f) => [f.id, f.n]));
    return [A, B, C].map((x) => mapa.get(x) ?? 0);
}

test.before(async () => {
    if (ROTO) return;
    const { db } = m;
    await db.user.create({ data: { id: DUENO, email: `${DUENO}@banco.test`, name: DUENO, role: "user", autoAssignMaxChats: 1 } });
    for (const [id, nombre] of [[A, "Ana"], [B, "Beto"], [C, "Caro"]]) {
        await db.user.create({ data: { id, email: `${id}@banco.test`, name: nombre, role: "user", ownerId: DUENO, advisorRole: "agente", advisorAvailable: true } });
    }
    await db.user.create({ data: { id: AJENO, email: `${AJENO}@banco.test`, name: "Ajeno", role: "user" } });
});

test.after(async () => {
    if (ROTO) return;
    const { db } = m;
    await db.$executeRawUnsafe(`DELETE FROM "reparto_porcentaje_asesor" WHERE "cuentaId" = $1`, DUENO).catch(() => {});
    await db.$executeRawUnsafe(`DELETE FROM "reparto_porcentaje" WHERE "cuentaId" = $1`, DUENO).catch(() => {});
    await db.$executeRawUnsafe(`DELETE FROM "AssignmentLog" WHERE "sessionId" IN (SELECT id FROM "Session" WHERE "userId" = $1)`, DUENO).catch(() => {});
    await db.session.deleteMany({ where: { userId: DUENO } });
    await db.user.deleteMany({ where: { id: { in: [A, B, C, DUENO, AJENO] } } });
    await db.$disconnect();
});

t("sin tocar nada la cuenta sigue en Máx. chats, como antes", async () => {
    m.ponerAQuienMira(quien(DUENO));
    const r = await m.getAutoAssignSettings();
    assert.equal(r.success, true, r.message);
    assert.equal(r.data.modo, "maximo");
    assert.equal(r.data.autoAssignMaxChats, 1);
    const eq = await m.getTeamAdvisors();
    assert.ok(eq.data.every((x) => x.entraEnElReparto));
});

t("una suma que no es 100 NO se guarda, y lo dice", async () => {
    m.ponerAQuienMira(quien(DUENO));
    const g = await m.saveAutoAssignSettings({ enabled: true, maxChats: 1, modo: "porcentaje", porcentajes: { [A]: 50, [B]: 30, [C]: 10 } });
    assert.equal(g.success, false);
    assert.match(g.message, /90%/);
    assert.equal((await m.getAutoAssignSettings()).data.modo, "maximo");
});

t("POR PORCENTAJE: guardar 50/30/20 activa el modo y «Asignar sin atender» reparte exacto, sin mirar el tope", async () => {
    m.ponerAQuienMira(quien(DUENO));
    // Ids de fuera se ignoran: la lista la decide el servidor.
    const g = await m.saveAutoAssignSettings({ enabled: false, maxChats: 1, modo: "porcentaje", porcentajes: { [A]: 50, [B]: 30, [C]: 20, [AJENO]: 99 } });
    assert.equal(g.success, true, g.message);
    const s = await m.getAutoAssignSettings();
    assert.equal(s.data.modo, "porcentaje");
    assert.equal(s.data.autoAssignMaxChats, 1, "Máx. chats se conserva para cuando se vuelva");
    assert.equal(s.data.porcentajes[AJENO], undefined);
    await sesiones(20, 0);
    const b = await m.bulkAutoAssign();
    assert.equal(b.success, true);
    assert.equal(b.assigned, 20);
    assert.deepEqual(await reparto(), [10, 6, 4]);
    const d = (await m.getAutoAssignSettings()).data.porcentajes;
    assert.deepEqual([d[A].asignados, d[B].asignados, d[C].asignados], [10, 6, 4]);
});

t("cambiar un porcentaje con el modo activo NO reinicia el contador", async () => {
    m.ponerAQuienMira(quien(DUENO));
    const g = await m.saveAutoAssignSettings({ enabled: false, maxChats: 1, modo: "porcentaje", porcentajes: { [A]: 40, [B]: 40, [C]: 20 } });
    assert.equal(g.success, true, g.message);
    const d = (await m.getAutoAssignSettings()).data.porcentajes;
    assert.deepEqual([d[A].asignados, d[B].asignados, d[C].asignados], [10, 6, 4]);
    // Y se sigue desde ahí: 30 chats en total a 40/40/20 = 12/12/6.
    await sesiones(10, 100);
    await m.bulkAutoAssign();
    assert.deepEqual(await reparto(), [12, 12, 6]);
});

t("un asesor desactivado sale del reparto sin perder su historial", async () => {
    m.ponerAQuienMira(quien(DUENO));
    await m.db.user.update({ where: { id: B }, data: { advisorAvailable: false } });
    await sesiones(6, 200);
    await m.bulkAutoAssign();
    const r = await reparto();
    assert.equal(r[1], 12);
    assert.equal(r[0] + r[2], 24);
    await m.db.user.update({ where: { id: B }, data: { advisorAvailable: true } });
});

t("volver a Máx. chats o Ilimitado apaga el porcentaje (excluyentes), y reactivar pone los contadores a cero", async () => {
    m.ponerAQuienMira(quien(DUENO));
    let g = await m.saveAutoAssignSettings({ enabled: false, maxChats: 0, modo: "ilimitado" });
    assert.equal(g.success, true, g.message);
    let s = (await m.getAutoAssignSettings()).data;
    assert.equal(s.modo, "ilimitado");
    assert.equal(s.autoAssignMaxChats, 0);
    g = await m.saveAutoAssignSettings({ enabled: false, maxChats: 3, modo: "maximo" });
    s = (await m.getAutoAssignSettings()).data;
    assert.equal(s.modo, "maximo");
    assert.equal(s.autoAssignMaxChats, 3);
    // Los porcentajes se conservan…
    assert.equal(s.porcentajes[A].porcentaje, 40);
    // …y al volver a activar, el contador arranca de cero: «desde que se activó».
    g = await m.saveAutoAssignSettings({ enabled: false, maxChats: 3, modo: "porcentaje", porcentajes: { [A]: 40, [B]: 40, [C]: 20 } });
    assert.equal(g.success, true, g.message);
    s = (await m.getAutoAssignSettings()).data;
    assert.deepEqual([s.porcentajes[A].asignados, s.porcentajes[B].asignados, s.porcentajes[C].asignados], [0, 0, 0]);
});

t("un agente no configura el reparto", async () => {
    m.ponerAQuienMira(quien(A, { ownerId: DUENO, advisorRole: "agente", effectiveId: DUENO }));
    const g = await m.saveAutoAssignSettings({ enabled: true, maxChats: 1, modo: "porcentaje", porcentajes: { [A]: 100 } });
    assert.equal(g.success, false);
});
