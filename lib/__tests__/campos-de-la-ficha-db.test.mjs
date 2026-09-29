/**
 * Los campos de la ficha de contacto: LEER y GUARDAR pasan por la misma puerta.
 *
 * `saveContactFieldsConfig` tenía una comprobación propia —mismo id, el rol de
 * la PERSONA y un `linked_accounts` mirado hacia ARRIBA—, mientras su hermana
 * `getContactFieldsConfig` usaba `laCuentaDeLaAccion`. Así que el administrador
 * de una cuenta abría la ficha de una conversación de una cuenta hija, la veía,
 * y al pulsar Guardar recibía «No autorizado». Y al revés: una cuenta hija
 * guardaba la ficha de su madre, que ni siquiera podía leer.
 *
 * Aquí corren las ACCIONES de verdad contra Postgres, con la familia de
 * producción reproducida (una madre súper administradora, una cuenta con rol
 * `admin`, su administrador y su agente de equipo, dos hijas y una ajena).
 * `MODO=roto` empaqueta la acción de un commit pinchado y AFIRMA el fallo.
 */
import test from "node:test";
import assert from "node:assert/strict";

const ROTO = process.env.MODO === "roto";
const m = await import(
    ROTO
        ? "./.compilado/campos-de-la-ficha-antes/entrada-de-campos-de-la-ficha.mjs"
        : "./.compilado/campos-de-la-ficha/entrada-de-campos-de-la-ficha.mjs"
);

const V = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const MADRE = `cf-madre-${V}`; // Carlos Arcos: super_admin
const PRINCIPAL = `cf-principal-${V}`; // Verzay | Atencion: rol admin, hija de la madre
const ADMIN = `cf-admin-${V}`; // Yair: administrador del equipo de la principal
const AGENTE = `cf-agente-${V}`; // agente del equipo de la principal
const HIJA = `cf-hija-${V}`; // Verzay Ventas: cuelga de la principal
const AJENA = `cf-ajena-${V}`;

const quien = (id, extra = {}) => ({
    id, effectiveId: id, sessionUserId: id, ownerId: null, advisorRole: null,
    role: "user", rolDeLaPersona: "user", rolDeLaCuenta: "user",
    email: `${id}@banco.test`, name: id, ...extra,
});
const madre = () => quien(MADRE, { role: "super_admin", rolDeLaPersona: "super_admin", rolDeLaCuenta: "super_admin" });
const principal = () => quien(PRINCIPAL, { role: "admin", rolDeLaPersona: "admin", rolDeLaCuenta: "admin" });
const admin = () => quien(ADMIN, { ownerId: PRINCIPAL, effectiveId: PRINCIPAL, advisorRole: "administrador", rolDeLaCuenta: "admin" });
const agente = () => quien(AGENTE, { ownerId: PRINCIPAL, effectiveId: PRINCIPAL, advisorRole: "agente", rolDeLaCuenta: "admin" });
const hija = () => quien(HIJA);
const ajena = () => quien(AJENA);

const CAMPOS = (etiqueta) => [
    { key: "empresa", label: etiqueta, section: "Negocio", icon: "Building2", enabled: true, order: 0, custom: false },
    { key: `propio_${V}`, label: "Campo propio", section: "Libre", icon: "Tag", enabled: true, order: 1, custom: true },
];

test.before(async () => {
    for (const [id, role, ownerId, advisorRole] of [
        [MADRE, "super_admin", null, null],
        [PRINCIPAL, "admin", null, null],
        [ADMIN, "user", PRINCIPAL, "administrador"],
        [AGENTE, "user", PRINCIPAL, "agente"],
        [HIJA, "user", null, null],
        [AJENA, "user", null, null],
    ]) {
        await m.db.user.create({ data: { id, email: `${id}@banco.test`, name: id, role, ownerId, advisorRole } });
    }
    for (const [i, [de, a]] of [[MADRE, PRINCIPAL], [MADRE, HIJA], [PRINCIPAL, HIJA]].entries()) {
        await m.db.$executeRawUnsafe(
            `INSERT INTO "linked_accounts" ("id","master_user_id","linked_user_id") VALUES ($1,$2,$3)`,
            `cf-lk-${i}-${V}`, de, a,
        );
    }
});

test.after(async () => {
    const ids = [MADRE, PRINCIPAL, ADMIN, AGENTE, HIJA, AJENA];
    await m.db.$executeRawUnsafe(`DELETE FROM "linked_accounts" WHERE "id" LIKE $1`, `cf-lk-%-${V}`);
    await m.db.user.deleteMany({ where: { id: { in: ids } } });
    await m.db.$disconnect();
});

const guardadoEn = async (cuenta) =>
    (await m.db.user.findUnique({ where: { id: cuenta }, select: { contactFieldsConfig: true } }))?.contactFieldsConfig ?? null;

/** Guarda como `persona` sobre `cuenta` y devuelve la respuesta más lo que quedó escrito y lo que se lee. */
async function guardar(persona, cuenta, etiqueta) {
    m.ponerAQuienMira(persona());
    const antes = JSON.stringify(await guardadoEn(cuenta));
    const res = await m.saveContactFieldsConfig(cuenta, CAMPOS(etiqueta));
    const despues = await guardadoEn(cuenta);
    const leido = await m.getContactFieldsConfig(cuenta);
    return { res, cambio: JSON.stringify(despues) !== antes, despues, leido };
}

const PUEDEN = [
    ["el administrador del equipo, en su cuenta", admin, PRINCIPAL],
    ["el administrador del equipo, en una conversación de la cuenta HIJA", admin, HIJA],
    ["la cuenta principal (rol admin), en la hija", principal, HIJA],
    ["la madre súper administradora, en la principal", madre, PRINCIPAL],
    ["un agente del equipo, en su cuenta (como siempre)", agente, PRINCIPAL],
    // La puerta común deja al equipo de una cuenta llegar a sus hijas; la ficha
    // no inventa una regla propia encima (leer ya lo permitía).
    ["un agente del equipo, en la cuenta hija (lo mismo que puede leer)", agente, HIJA],
];

for (const [nombre, persona, cuenta] of PUEDEN) {
    test(`GUARDA: ${nombre}`, { skip: ROTO && cuenta === HIJA && (persona === admin || persona === agente) }, async () => {
        const etiqueta = `Empresa ${nombre}`;
        const r = await guardar(persona, cuenta, etiqueta);
        assert.equal(r.res.success, true, `${nombre}: ${r.res.message}`);
        const escritos = Array.isArray(r.despues) ? r.despues : r.despues.campos;
        assert.equal(escritos[0].label, etiqueta, "quedó escrito en la cuenta dueña");
        // Simetría: lo que se guarda es lo que la misma persona lee después.
        assert.equal(r.leido[0].label, etiqueta, "y es lo que lee la misma persona");
    });
}

const NO_PUEDEN = [
    ["la cuenta hija, hacia ARRIBA (la ficha de la principal)", hija, PRINCIPAL],
    ["una cuenta ajena", ajena, HIJA],
];

for (const [nombre, persona, cuenta] of NO_PUEDEN) {
    test(`NO GUARDA: ${nombre}`, { skip: ROTO && persona === hija }, async () => {
        const r = await guardar(persona, cuenta, `Intrusa ${V}`);
        assert.equal(r.res.success, false);
        assert.match(r.res.message, /No autorizado/);
        assert.equal(r.cambio, false, "no se escribió nada");
    });
}

test("la simetría: quien no puede LEER una ficha tampoco puede GUARDARLA, y al revés", { skip: ROTO }, async () => {
    const casos = [...PUEDEN, ...NO_PUEDEN];
    for (const [nombre, persona, cuenta] of casos) {
        await m.db.user.update({ where: { id: cuenta }, data: { contactFieldsConfig: CAMPOS(`Marca ${V}`) } });
        m.ponerAQuienMira(persona());
        const lee = (await m.getContactFieldsConfig(cuenta))[0]?.label === `Marca ${V}`;
        const guarda = (await m.saveContactFieldsConfig(cuenta, CAMPOS(`Otra ${V}`))).success;
        assert.equal(guarda, lee, `${nombre}: lee=${lee} guarda=${guarda}`);
    }
});

test("una cuenta que no existe se DICE, no se traga en un catch", { skip: ROTO }, async () => {
    m.ponerAQuienMira(madre());
    const r = await m.saveContactFieldsConfig(`no-existe-${V}`, CAMPOS("x"));
    assert.equal(r.success, false);
    assert.match(r.message, /No se encontró la cuenta/);
});

// ── El «antes», pinchado: el fallo reportado, reproducido ──

test("ANTES: el administrador del equipo veía la ficha de la cuenta hija y NO podía guardarla", { skip: !ROTO }, async () => {
    m.ponerAQuienMira(admin());
    await m.db.user.update({ where: { id: HIJA }, data: { contactFieldsConfig: CAMPOS(`Visible ${V}`) } });
    const leido = await m.getContactFieldsConfig(HIJA);
    assert.equal(leido[0].label, `Visible ${V}`, "la leía");
    const res = await m.saveContactFieldsConfig(HIJA, CAMPOS("Nueva"));
    assert.equal(res.success, false);
    assert.match(res.message, /No autorizado/, "y al guardar: No autorizado");
});

test("ANTES: una cuenta hija guardaba la ficha de su madre, que ni podía leer", { skip: !ROTO }, async () => {
    await m.db.user.update({ where: { id: PRINCIPAL }, data: { contactFieldsConfig: CAMPOS(`De la principal ${V}`) } });
    m.ponerAQuienMira(hija());
    const leido = await m.getContactFieldsConfig(PRINCIPAL);
    assert.notEqual(leido[0]?.label, `De la principal ${V}`, "no la leía");
    const res = await m.saveContactFieldsConfig(PRINCIPAL, CAMPOS("Pisada por la hija"));
    assert.equal(res.success, true, "pero la guardaba hacia arriba");
});
