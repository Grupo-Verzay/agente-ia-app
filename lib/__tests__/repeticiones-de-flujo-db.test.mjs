/**
 * Las ACCIONES de verdad contra Postgres: leer y guardar las repeticiones de un
 * flujo, con su puerta. Lo único que se finge es `currentUser()`.
 *
 * Solo corre en el modo normal: antes de este cambio las acciones no existían,
 * y lo que el modo roto afirma —que no había forma de configurarlo— lo afirma
 * el barrido de la pantalla (`repeticiones-de-flujo.test.mjs`).
 */
import test from "node:test";
import assert from "node:assert/strict";

const ROTO = process.env.MODO === "roto";
const m = ROTO ? null : await import("./.compilado/repeticiones/entrada-de-repeticiones-de-flujo.js");

const V = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const DUENO = `rep-dueno-${V}`;
const AGENTE = `rep-agente-${V}`;
const AJENA = `rep-ajena-${V}`;
const FLUJO = `rep-flujo-${V}`;
const FLUJO_VIEJO = `rep-viejo-${V}`;

function quien(id, extra = {}) {
    return {
        id, effectiveId: extra.ownerId ?? id, sessionUserId: id, ownerId: null, advisorRole: null,
        role: "user", rolDeLaPersona: "user", email: `${id}@banco.test`, name: id, ...extra,
    };
}

const t = ROTO ? test.skip : test;

test.before(async () => {
    if (ROTO) return;
    const { db } = m;
    await db.user.create({ data: { id: DUENO, email: `${DUENO}@banco.test`, name: DUENO, role: "user" } });
    await db.user.create({ data: { id: AJENA, email: `${AJENA}@banco.test`, name: AJENA, role: "user" } });
    await db.user.create({
        data: { id: AGENTE, email: `${AGENTE}@banco.test`, name: AGENTE, role: "user", ownerId: DUENO, advisorRole: "agente" },
    });
    for (const [id, name] of [[FLUJO, `PAGO ${V}`], [FLUJO_VIEJO, `UBICACION ${V}`]]) {
        await db.workflow.create({ data: { id, userId: DUENO, name, definition: "{}", status: "active" } });
    }
});

test.after(async () => {
    if (ROTO) return;
    const { db } = m;
    await db.$executeRawUnsafe(`DELETE FROM "flujo_repeticiones" WHERE "workflowId" LIKE 'rep-%-${V}'`).catch(() => {});
    await db.workflow.deleteMany({ where: { id: { in: [FLUJO, FLUJO_VIEJO] } } });
    await db.user.deleteMany({ where: { id: { in: [AGENTE, DUENO, AJENA] } } });
    await db.$disconnect();
});

t("un flujo que existe sin ajuste lee lo de siempre: 1 vez y sin espera", async () => {
    m.ponerAQuienMira(quien(DUENO));
    const r = await m.leerRepeticionesDelFlujoAction(FLUJO_VIEJO);
    assert.equal(r.success, true, r.message);
    assert.deepEqual(r.data, { maxEjecuciones: 1, esperaMinutos: null });
});

t("el dueño guarda máximo 3 y espera de 2 horas, y se lee igual", async () => {
    m.ponerAQuienMira(quien(DUENO));
    const g = await m.guardarRepeticionesDelFlujoAction(FLUJO, { maxEjecuciones: 3, esperaMinutos: 120 });
    assert.equal(g.success, true, g.message);
    const r = await m.leerRepeticionesDelFlujoAction(FLUJO);
    assert.deepEqual(r.data, { maxEjecuciones: 3, esperaMinutos: 120 });
    const mapa = await m.leerRepeticiones([FLUJO, FLUJO_VIEJO]);
    assert.deepEqual(mapa[FLUJO], { maxEjecuciones: 3, esperaMinutos: 120 });
    assert.deepEqual(mapa[FLUJO_VIEJO], { maxEjecuciones: 1, esperaMinutos: null });
});

t("lo que llega del navegador se sanea", async () => {
    m.ponerAQuienMira(quien(DUENO));
    const g = await m.guardarRepeticionesDelFlujoAction(FLUJO, { maxEjecuciones: 5000, esperaMinutos: -3 });
    assert.equal(g.success, true, g.message);
    assert.deepEqual(g.data, { maxEjecuciones: 100, esperaMinutos: null });
});

t("volver a lo de siempre BORRA la fila: sin fila sigue significando una sola cosa", async () => {
    m.ponerAQuienMira(quien(DUENO));
    await m.guardarRepeticionesDelFlujoAction(FLUJO, { maxEjecuciones: 1, esperaMinutos: null });
    const filas = await m.db.$queryRaw`SELECT 1 FROM "flujo_repeticiones" WHERE "workflowId" = ${FLUJO}`;
    assert.equal(filas.length, 0);
});

t("un agente lo ve pero no lo cambia", async () => {
    m.ponerAQuienMira(quien(AGENTE, { ownerId: DUENO, advisorRole: "agente" }));
    const r = await m.leerRepeticionesDelFlujoAction(FLUJO);
    assert.equal(r.success, true, r.message);
    const g = await m.guardarRepeticionesDelFlujoAction(FLUJO, { maxEjecuciones: 4, esperaMinutos: null });
    assert.equal(g.success, false);
    const r2 = await m.leerRepeticionesDelFlujoAction(FLUJO);
    assert.equal(r2.data.maxEjecuciones, 1, "el agente no puede haber escrito");
});

t("otra cuenta no lee ni escribe el flujo de esta: se contesta como si no existiera", async () => {
    m.ponerAQuienMira(quien(AJENA));
    const r = await m.leerRepeticionesDelFlujoAction(FLUJO);
    assert.equal(r.success, false);
    assert.equal(r.message, "Flujo no encontrado.");
    const g = await m.guardarRepeticionesDelFlujoAction(FLUJO, { maxEjecuciones: 9, esperaMinutos: null });
    assert.equal(g.success, false);
    m.ponerAQuienMira(quien(DUENO));
    const r2 = await m.leerRepeticionesDelFlujoAction(FLUJO);
    assert.equal(r2.data.maxEjecuciones, 1);
});

t("la lista solo devuelve las de los flujos que se alcanzan", async () => {
    m.ponerAQuienMira(quien(DUENO));
    await m.guardarRepeticionesDelFlujoAction(FLUJO, { maxEjecuciones: 2, esperaMinutos: 30 });
    const mio = await m.leerRepeticionesDeLosFlujosAction([FLUJO, FLUJO_VIEJO, "no-existe"]);
    assert.deepEqual(mio[FLUJO], { maxEjecuciones: 2, esperaMinutos: 30 });
    assert.deepEqual(mio[FLUJO_VIEJO], { maxEjecuciones: 1, esperaMinutos: null });
    m.ponerAQuienMira(quien(AJENA));
    assert.deepEqual(await m.leerRepeticionesDeLosFlujosAction([FLUJO]), {});
});

t("sin sesión, nada", async () => {
    m.ponerAQuienMira(null);
    assert.equal((await m.leerRepeticionesDelFlujoAction(FLUJO)).success, false);
    assert.equal((await m.guardarRepeticionesDelFlujoAction(FLUJO, { maxEjecuciones: 2, esperaMinutos: null })).success, false);
});
