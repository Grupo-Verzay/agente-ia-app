/**
 * Mis datos no duplica a un cliente por la FORMA de su número.
 *
 * Un cliente se guarda con su número en la forma de WhatsApp
 * (`573004522013@s.whatsapp.net`), pero hay registros de antes guardados con el
 * número pelado o con `@c.us`. Importar una hoja buscaba el registro SOLO por
 * la forma canónica: no lo encontraba y creaba otro al lado —el mismo cliente
 * dos veces, el resumen diciendo «creados» donde tocaba «actualizados», y el
 * agente leyendo el que le tocara—. Y guardar a mano pasaba cualquier clave
 * por la regla del número, así que EDITAR un registro de catálogo («SKU-001»)
 * creaba otro, `001@s.whatsapp.net`, y el de verdad se quedaba sin cambiar.
 *
 * Corren las ACCIONES de verdad contra Postgres (lo único fingido es
 * `currentUser()`). `MODO=roto` las corre con el código de `ANTES_MIS_DATOS_REF`
 * —pinchado a un commit, nunca `origin/main`— y AFIRMA los duplicados.
 *
 * Se levanta con `scripts/banco-mis-datos.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";

const ROTO = process.env.MODO === "roto";
const m = await import(ROTO ? "./.compilado/mis-datos-antes/entrada-de-mis-datos.js" : "./.compilado/mis-datos/entrada-de-mis-datos.js");

const V = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const CUENTA = `md-dup-${V}`;
const quien = { id: CUENTA, effectiveId: CUENTA, sessionUserId: CUENTA, ownerId: null, advisorRole: null, role: "user", rolDeLaPersona: "user", email: `${CUENTA}@banco.test`, name: CUENTA };

const PELADO = "573004522013";
const CON_C_US = "573004522999@c.us";
const LID = "573001112233@lid";

const cuantos = (remoteJids) => m.db.externalClientData.count({ where: { userId: CUENTA, remoteJid: { in: remoteJids } } });

test.before(async () => {
    await m.db.user.create({ data: { id: CUENTA, email: `${CUENTA}@banco.test`, name: CUENTA } });
    m.ponerAQuienMira(quien);
    // Lo que ya estaba guardado de antes, con otras formas del número.
    await m.db.externalClientData.createMany({
        data: [
            { userId: CUENTA, remoteJid: PELADO, data: { NOMBRE: "Guardada pelada" }, source: "google_sheets" },
            { userId: CUENTA, remoteJid: CON_C_US, data: { NOMBRE: "Guardada con c.us" }, source: "google_sheets" },
            { userId: CUENTA, remoteJid: LID, data: { NOMBRE: "Un @lid" }, source: "manual" },
            { userId: CUENTA, remoteJid: "SKU-001", data: { PRODUCTO: "Kit" }, source: "google_sheets" },
        ],
    });
});

test.after(async () => {
    await m.db.externalClientData.deleteMany({ where: { userId: CUENTA } });
    await m.db.user.deleteMany({ where: { id: CUENTA } });
    await m.db.$disconnect();
});

test("importar una hoja ACTUALIZA al cliente guardado con otra forma de su número, y no crea otro", { skip: ROTO }, async () => {
    const r = await m.importExternalClientDataBulk(CUENTA, [
        { remoteJid: PELADO, data: { NOMBRE: "Actualizada" } },
        { remoteJid: "573004522999", data: { NOMBRE: "Actualizada c.us" } },
    ], "google_sheets");
    assert.deepEqual(r, { created: 0, updated: 2, errors: 0 });
    assert.equal(await cuantos([PELADO, `${PELADO}@s.whatsapp.net`, `${PELADO}@c.us`]), 1, "el mismo cliente, una sola vez");
    assert.equal(await cuantos(["573004522999", CON_C_US, "573004522999@s.whatsapp.net"]), 1);
    // Y queda con la forma canónica: el duplicado no puede volver.
    const fila = await m.db.externalClientData.findFirst({ where: { userId: CUENTA, remoteJid: `${PELADO}@s.whatsapp.net` } });
    assert.equal(fila?.data?.NOMBRE, "Actualizada");
});

test("importar la MISMA hoja dos veces solo actualiza la segunda", { skip: ROTO }, async () => {
    const filas = [{ remoteJid: "573007770001", data: { NOMBRE: "Nueva" } }];
    assert.deepEqual(await m.importExternalClientDataBulk(CUENTA, filas, "google_sheets"), { created: 1, updated: 0, errors: 0 });
    assert.deepEqual(await m.importExternalClientDataBulk(CUENTA, filas, "google_sheets"), { created: 0, updated: 1, errors: 0 });
});

test("un @lid NO es el mismo cliente que un número con sus dígitos", { skip: ROTO }, async () => {
    const r = await m.importExternalClientDataBulk(CUENTA, [{ remoteJid: "573001112233", data: { NOMBRE: "Por número" } }], "google_sheets");
    assert.equal(r.created, 1, "se casó un teléfono con un id de privacidad");
    const lid = await m.db.externalClientData.findFirst({ where: { userId: CUENTA, remoteJid: LID } });
    assert.equal(lid?.data?.NOMBRE, "Un @lid", "el @lid se quedó como estaba");
});

test("guardar a mano con la forma canónica encuentra al cliente guardado pelado", { skip: ROTO }, async () => {
    await m.db.externalClientData.create({ data: { userId: CUENTA, remoteJid: "573008880002", data: { NOMBRE: "Vieja" }, source: "manual" } });
    await m.upsertExternalClientData(CUENTA, "573008880002@s.whatsapp.net", { NOMBRE: "Editada" }, "manual");
    assert.equal(await cuantos(["573008880002", "573008880002@s.whatsapp.net"]), 1);
});

test("EDITAR un registro de catálogo lo actualiza a él: su clave no pasa por la regla del número", { skip: ROTO }, async () => {
    await m.upsertExternalClientData(CUENTA, "SKU-001", { PRODUCTO: "Kit editado" }, "manual");
    const sku = await m.db.externalClientData.findFirst({ where: { userId: CUENTA, remoteJid: "SKU-001" } });
    assert.equal(sku?.data?.PRODUCTO, "Kit editado");
    assert.equal(await cuantos(["001@s.whatsapp.net"]), 0, "se creó un registro fantasma con los dígitos del SKU");
    // Y uno de catálogo nuevo se guarda como se escribió.
    await m.upsertExternalClientData(CUENTA, "MEDIDA 205/55R16", { PRECIO: "$1" }, "manual");
    assert.equal(await cuantos(["MEDIDA 205/55R16"]), 1);
});

test("ANTES: importar creaba al mismo cliente OTRA vez, y editar un SKU creaba un registro fantasma", { skip: !ROTO }, async () => {
    const r = await m.importExternalClientDataBulk(CUENTA, [{ remoteJid: PELADO, data: { NOMBRE: "Actualizada" } }], "google_sheets");
    assert.deepEqual(r, { created: 1, updated: 0, errors: 0 }, "ya no lo creaba de nuevo");
    assert.equal(await cuantos([PELADO, `${PELADO}@s.whatsapp.net`]), 2, "ya no quedaba dos veces");
    await m.upsertExternalClientData(CUENTA, "SKU-001", { PRODUCTO: "Kit editado" }, "manual");
    assert.equal(await cuantos(["001@s.whatsapp.net"]), 1, "ya no creaba el fantasma del SKU");
    const sku = await m.db.externalClientData.findFirst({ where: { userId: CUENTA, remoteJid: "SKU-001" } });
    assert.equal(sku?.data?.PRODUCTO, "Kit", "el SKU de verdad ya se actualizaba");
});
