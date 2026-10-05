/**
 * «Vincular existente» para un CLIENTE con varias cuentas propias, con las
 * acciones de verdad contra Postgres y `currentUser()` DE VERDAD.
 *
 * El árbol:
 *  - MADRE, una cuenta cliente (`user`) con BETO, un agente de su equipo;
 *  - HIJA, otra cuenta cliente de la misma persona (sabe su contraseña);
 *  - ARRIBA, una cuenta que ya tiene a MADRE por debajo;
 *  - CASA (`admin`), una cuenta de la plataforma;
 *  - PEPA, una persona del equipo de otra cuenta.
 *
 * Lo que se prueba:
 *  1. sin contraseña sigue sin poder apropiarse de nada;
 *  2. con una contraseña equivocada no vincula, y el aviso no dice si existe;
 *  3. con la contraseña de SU cuenta, vincula (desde Usuarios y desde el
 *     conmutador) y después la alcanza;
 *  4. ni con la contraseña correcta: una cuenta de la casa, una persona de un
 *     equipo, una cuenta que está por encima, ni un agente.
 *
 * `MODO=roto` empaqueta las mismas pruebas contra el código de ANTES
 * (`ANTES_REF`, pinchado) y AFIRMA el fallo: el cliente no podía vincular sus
 * propias cuentas ni con la contraseña.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const bcrypt = require("bcryptjs");

const ROTO = process.env.MODO === "roto";
const m = await import(
    ROTO
        ? "./.compilado/vincular-propias-antes/entrada-de-equipo-usuarios.js"
        : "./.compilado/equipo-usuarios/entrada-de-equipo-usuarios.js"
);
const { ponerLaSesion, equipo, vinculos, db } = m;

const SOLO = "Solo puedes vincular una cuenta que ya administras. Si es de otra empresa, pídeselo a soporte.";
const NO_COINCIDEN = "El correo o la contraseña de esa cuenta no coinciden.";

const V = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const MADRE = `vp-madre-${V}`;
const BETO = `vp-beto-${V}`;
const HIJA = `vp-hija-${V}`;
const HIJA2 = `vp-hija2-${V}`;
const ARRIBA = `vp-arriba-${V}`;
const CASA = `vp-casa-${V}`;
const OTRA = `vp-otra-${V}`;
const PEPA = `vp-pepa-${V}`;
const TODOS = [MADRE, BETO, HIJA, HIJA2, ARRIBA, CASA, OTRA, PEPA];
const correo = (id) => `${id}@banco.test`;
const CLAVE = "Clave-de-su-cuenta-1";

const como = async (quien, fn) => {
    ponerLaSesion(quien);
    return fn();
};
const vinculo = async (master, linked) =>
    Number(
        (await db.$queryRawUnsafe(
            `SELECT COUNT(*)::int AS n FROM "linked_accounts" WHERE "master_user_id" = $1 AND "linked_user_id" = $2`,
            master, linked,
        ))[0].n,
    );

test.before(async () => {
    const hash = await bcrypt.hash(CLAVE, 4);
    const u = (id, extra = {}) =>
        db.user.create({ data: { id, email: correo(id), name: id, role: "user", password: hash, ...extra } });
    await u(MADRE);
    await u(BETO, { ownerId: MADRE, advisorRole: "agente" });
    await u(HIJA);
    await u(HIJA2);
    await u(ARRIBA);
    await u(CASA, { role: "admin" });
    await u(OTRA);
    await u(PEPA, { ownerId: OTRA, advisorRole: "agente" });
    await db.$executeRawUnsafe(
        `INSERT INTO "linked_accounts" ("id","master_user_id","linked_user_id") VALUES ($1,$2,$3)`,
        `vp-l-${V}`, ARRIBA, MADRE,
    );
});

test.after(async () => {
    await db.$executeRawUnsafe(`DELETE FROM "linked_accounts" WHERE "master_user_id" = ANY($1) OR "linked_user_id" = ANY($1)`, TODOS).catch(() => {});
    await db.user.updateMany({ where: { id: { in: TODOS } }, data: { ownerId: null } });
    await db.user.deleteMany({ where: { id: { in: TODOS } } });
    await db.$disconnect();
});

test("1 · sin contraseña, un cliente sigue sin poder apropiarse de otra cuenta", async () => {
    const r = await como(MADRE, () => equipo.linkExistingAdvisor(correo(HIJA), "agente"));
    assert.equal(r.success, false);
    assert.equal(r.message, SOLO);
    assert.equal(await vinculo(MADRE, HIJA), 0);
});

test("2 · con una contraseña equivocada no vincula, y no dice si la cuenta existe", async () => {
    const mala = await como(MADRE, () => equipo.linkExistingAdvisor(correo(HIJA), "agente", "otra-cosa"));
    const nadie = await como(MADRE, () => equipo.linkExistingAdvisor("no-existe@banco.test", "agente", "otra-cosa"));
    if (ROTO) {
        assert.equal(mala.success, false, "en ANTES no se podía");
        return;
    }
    assert.equal(mala.success, false);
    assert.equal(mala.message, NO_COINCIDEN);
    assert.equal(nadie.message, NO_COINCIDEN, "el mismo aviso: no delata si existe");
    assert.equal(await vinculo(MADRE, HIJA), 0);
});

test("3a · con la contraseña de SU cuenta, la vincula desde Usuarios", async () => {
    const r = await como(MADRE, () => equipo.linkExistingAdvisor(correo(HIJA), "agente", CLAVE));
    if (ROTO) {
        assert.equal(r.success, false, "en ANTES un cliente no podía vincular sus propias cuentas");
        assert.equal(r.message, SOLO);
        assert.equal(await vinculo(MADRE, HIJA), 0);
        return;
    }
    assert.equal(r.success, true, r.message);
    assert.equal(await vinculo(MADRE, HIJA), 1);
    // Y ya la alcanza: volver a vincularla no pide nada.
});

test("3b · y desde «Agregar cuenta» del conmutador", async () => {
    const r = await como(MADRE, () => vinculos.addLinkedAccount(correo(HIJA2), "agente", CLAVE));
    if (ROTO) {
        assert.equal(r.success, false);
        assert.equal(await vinculo(MADRE, HIJA2), 0);
        return;
    }
    assert.equal(r.success, true, r.message);
    assert.equal(await vinculo(MADRE, HIJA2), 1);
});

test("4a · ni con la contraseña correcta: una cuenta de la casa", async () => {
    const r = await como(MADRE, () => equipo.linkExistingAdvisor(correo(CASA), "agente", CLAVE));
    assert.equal(r.success, false);
    assert.equal(await vinculo(MADRE, CASA), 0);
});

test("4b · ni una persona del equipo de otra cuenta", async () => {
    const r = await como(MADRE, () => equipo.linkExistingAdvisor(correo(PEPA), "agente", CLAVE));
    assert.equal(r.success, false);
    assert.equal(await vinculo(MADRE, PEPA), 0);
});

test("4c · ni una cuenta que está por encima de la suya", async () => {
    const r = await como(MADRE, () => vinculos.addLinkedAccount(correo(ARRIBA), "agente", CLAVE));
    assert.equal(r.success, false);
    assert.equal(await vinculo(MADRE, ARRIBA), 0);
});

test("4d · ni un agente del equipo, aunque sepa la contraseña", async () => {
    const r1 = await como(BETO, () => equipo.linkExistingAdvisor(correo(OTRA), "agente", CLAVE));
    const r2 = await como(BETO, () => vinculos.addLinkedAccount(correo(OTRA), "agente", CLAVE));
    assert.equal(r1.success, false);
    assert.equal(r2.success, false);
    assert.equal(await vinculo(MADRE, OTRA), 0);
    assert.equal(await vinculo(BETO, OTRA), 0);
});
