/**
 * La migración de la ficha contra Postgres, con la acción de VERDAD: leer una
 * cuenta que tenía la lista de ANTES la deja escrita en la versión 2 (sin los
 * apagados de fábrica), una cuenta nueva lee vacío y no se escribe nada, y
 * guardar vacío se queda vacío.
 */
import test from "node:test";
import assert from "node:assert/strict";

const ROTO = process.env.MODO === "roto";
const m = await import("./.compilado/campos-de-la-ficha/entrada-de-campos-de-la-ficha.mjs");

const V = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const VIEJA = `cfm-vieja-${V}`;
const NUEVA = `cfm-nueva-${V}`;
const quien = (id) => ({
    id, effectiveId: id, sessionUserId: id, ownerId: null, advisorRole: null,
    role: "user", rolDeLaPersona: "user", rolDeLaCuenta: "user", email: `${id}@banco.test`, name: id,
});
const F = (key, extra = {}) => ({ key, label: key, section: "Libre", icon: "Tag", enabled: true, order: 0, ...extra });

test.before(async () => {
    await m.db.user.create({
        data: {
            id: VIEJA, email: `${VIEJA}@banco.test`, name: VIEJA,
            contactFieldsConfig: [
                F("empresa", { order: 0 }), F("cargo", { order: 1, enabled: false }),
                F("telefono", { order: 2 }), F("mio", { order: 3, custom: true, enabled: false }),
            ],
        },
    });
    await m.db.user.create({ data: { id: NUEVA, email: `${NUEVA}@banco.test`, name: NUEVA } });
});
test.after(async () => {
    await m.db.user.deleteMany({ where: { id: { in: [VIEJA, NUEVA] } } });
    await m.db.$disconnect();
});
const guardadoEn = async (id) =>
    (await m.db.user.findUnique({ where: { id }, select: { contactFieldsConfig: true } }))?.contactFieldsConfig ?? null;

test("leer una cuenta con la lista de ANTES la migra y la deja escrita en la versión 2", { skip: ROTO }, async () => {
    m.ponerAQuienMira(quien(VIEJA));
    const leido = await m.getContactFieldsConfig(VIEJA);
    assert.deepEqual(leido.map((f) => f.key), ["empresa", "mio"]);
    const escrito = await guardadoEn(VIEJA);
    assert.equal(escrito.version, 2, "quedó escrita ya migrada");
    assert.deepEqual(escrito.campos.map((f) => f.key), ["empresa", "mio"]);
    // Y una segunda lectura no cambia nada.
    assert.deepEqual((await m.getContactFieldsConfig(VIEJA)).map((f) => f.key), ["empresa", "mio"]);
});

test("una cuenta que nunca tocó la ficha lee vacío y no se le escribe nada", { skip: ROTO }, async () => {
    m.ponerAQuienMira(quien(NUEVA));
    assert.deepEqual(await m.getContactFieldsConfig(NUEVA), []);
    assert.equal(await guardadoEn(NUEVA), null);
});

test("guardar la lista vacía se queda vacía (no vuelven los de fábrica)", { skip: ROTO }, async () => {
    m.ponerAQuienMira(quien(NUEVA));
    const r = await m.saveContactFieldsConfig(NUEVA, []);
    assert.equal(r.success, true, r.message);
    assert.deepEqual(await guardadoEn(NUEVA), { version: 2, campos: [] });
    assert.deepEqual(await m.getContactFieldsConfig(NUEVA), []);
});

test("un campo que era de fábrica se BORRA guardando la lista sin él", { skip: ROTO }, async () => {
    m.ponerAQuienMira(quien(VIEJA));
    const lista = await m.getContactFieldsConfig(VIEJA);
    const r = await m.saveContactFieldsConfig(VIEJA, lista.filter((f) => f.key !== "empresa"));
    assert.equal(r.success, true);
    assert.deepEqual((await m.getContactFieldsConfig(VIEJA)).map((f) => f.key), ["mio"]);
});
