/**
 * Editar los créditos a mano NO adelanta la renovación, contra Postgres y con
 * las acciones de VERDAD (`rechargeIaCredit`, `createIaCreditForUser`).
 *
 * Las pantallas de Clientes y de Créditos mandan `new Date()` como fecha de
 * renovación. Antes se guardaba tal cual, y el reloj del motor
 * (`renewDueCredits`, cada hora, renueva toda fila con `renewalDate <= now`)
 * reponía el cupo del plan en la hora siguiente: dejar una cuenta en cero a
 * mano no duraba. `MODO=roto` corre las acciones de ANTES_REF y AFIRMA eso.
 *
 * Se levanta con `scripts/banco-creditos-al-editar.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";

const ROTO = process.env.MODO === "roto";
const m = await import(
    ROTO
        ? "./.compilado/creditos-al-editar/entrada-de-creditos-al-editar-antes.js"
        : "./.compilado/creditos-al-editar/entrada-de-creditos-al-editar.js"
);
const r = await import("./.compilado/creditos-al-editar/renovacion-al-editar.js");
const { ponerAQuienMira, rechargeIaCredit, createIaCreditForUser, db } = m;

const V = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const SUPER = `cae-super-${V}`;
const CLIENTE = `cae-cliente-${V}`;
const NUEVO = `cae-nuevo-${V}`;
const DIA = 24 * 60 * 60 * 1000;
/** Lo que el motor renueva: lo que tiene la fecha en el pasado o en «ahora». */
const loRenuevaElMotor = (f) => f.renewalDate.getTime() <= Date.now();

test("la regla, sin base", () => {
    const ahora = new Date("2026-10-05T12:00:00Z");
    const manana = new Date(ahora.getTime() + DIA);
    const ayer = new Date(ahora.getTime() - DIA);
    assert.equal(r.laFechaAlEditar(manana, ayer, ahora).getTime(), manana.getTime());
    assert.equal(r.laFechaAlEditar(ahora, manana, ahora).getTime(), manana.getTime());
    assert.equal(r.laFechaAlEditar(undefined, manana, ahora).getTime(), manana.getTime());
    const sinNada = r.laFechaAlEditar(ahora, ayer, ahora);
    assert.ok(sinNada.getTime() > ahora.getTime() + 27 * DIA);
});

test("preparar", async () => {
    await db.user.create({ data: { id: SUPER, email: `${SUPER}@banco.test`, name: SUPER, role: "super_admin" } });
    await db.user.create({ data: { id: CLIENTE, email: `${CLIENTE}@banco.test`, name: CLIENTE, plan: "avanzado" } });
    await db.user.create({ data: { id: NUEVO, email: `${NUEVO}@banco.test`, name: NUEVO, plan: "avanzado" } });
    await db.iaCredit.create({
        data: { userId: CLIENTE, total: 35000, used: 0, renewalDate: new Date(Date.now() + 20 * DIA) },
    });
    ponerAQuienMira({
        id: SUPER, effectiveId: SUPER, sessionUserId: SUPER, ownerId: null, advisorRole: null,
        role: "super_admin", rolDeLaPersona: "super_admin", email: `${SUPER}@banco.test`, name: SUPER,
    });
});

if (ROTO) {
    test("ANTES: dejar en cero con la fecha de la pantalla (ahora) la deja para que el motor la renueve", async () => {
        const res = await rechargeIaCredit(CLIENTE, 0, new Date(), 0);
        assert.equal(res.success, true);
        const f = await db.iaCredit.findUnique({ where: { userId: CLIENTE } });
        assert.equal(f.total, 0);
        assert.ok(loRenuevaElMotor(f), "la fecha quedó en ahora: el motor repone el cupo en la hora siguiente");
    });
} else {
    test("dejar en cero guarda el cero y NO adelanta la renovación", async () => {
        const antes = await db.iaCredit.findUnique({ where: { userId: CLIENTE } });
        const res = await rechargeIaCredit(CLIENTE, 0, new Date(), 0);
        assert.equal(res.success, true);
        const f = await db.iaCredit.findUnique({ where: { userId: CLIENTE } });
        assert.equal(f.total, 0);
        assert.equal(f.used, 0);
        assert.equal(f.renewalDate.getTime(), antes.renewalDate.getTime());
        assert.ok(!loRenuevaElMotor(f));
    });

    test("una fila con la fecha ya vencida: al editar pasa a dentro de un mes", async () => {
        await db.iaCredit.update({ where: { userId: CLIENTE }, data: { renewalDate: new Date(Date.now() - DIA) } });
        await rechargeIaCredit(CLIENTE, 0, new Date(), 0);
        const f = await db.iaCredit.findUnique({ where: { userId: CLIENTE } });
        assert.ok(f.renewalDate.getTime() > Date.now() + 27 * DIA);
    });

    test("una fecha futura pedida se respeta", async () => {
        const pedida = new Date(Date.now() + 10 * DIA);
        await rechargeIaCredit(CLIENTE, 500, pedida, 0);
        const f = await db.iaCredit.findUnique({ where: { userId: CLIENTE } });
        assert.equal(f.renewalDate.getTime(), pedida.getTime());
        assert.equal(f.total, 500);
    });

    test("crear créditos con la fecha de la pantalla no nace vencido", async () => {
        const res = await createIaCreditForUser(NUEVO, 0, new Date(), 0);
        assert.equal(res.success, true);
        const f = await db.iaCredit.findUnique({ where: { userId: NUEVO } });
        assert.equal(f.total, 0);
        assert.ok(!loRenuevaElMotor(f));
    });
}

test("cerrar", async () => {
    await db.$disconnect();
});
