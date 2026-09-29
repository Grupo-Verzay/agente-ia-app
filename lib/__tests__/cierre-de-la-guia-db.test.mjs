/**
 * La introducción EDITABLE de la guía pública, contra Postgres y con las
 * acciones de verdad: la casa guarda y la página pública lo enseña; un
 * cliente no lee ni guarda; guardar vacío restaura el texto del código; y sin
 * base la página sale igual, con el texto del código.
 */
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "..", "..");
const acc = await import(path.join(RAIZ, "lib/__tests__/.compilado/cierre-de-la-guia/entrada-de-la-guia-simetrica.js"));
const sello = Date.now().toString(36);
const DEF = { titulo: "Leads", subtitulo: "Sub del código", descripcion: "Desc del código" };

async function persona(q, role = "user") {
    const id = `guia-${sello}-${q}`;
    await acc.db.user.upsert({ where: { id }, update: { role }, create: { id, email: `${id}@banco.test`, name: q, role } });
    return { id, role, name: q, ownerId: null, rolDeLaPersona: role };
}

test("un cliente NO lee ni guarda la introducción", async () => {
    acc.ponerAQuienMira(await persona("cliente"));
    assert.equal((await acc.introduccionDeLaGuiaAction("leads")).success, false);
    assert.equal((await acc.guardarIntroduccionDeLaGuiaAction("leads", { titulo: "hackeado" })).success, false);
    const filas = await acc.db.$queryRawUnsafe(`SELECT 1 FROM "guia_introducciones" WHERE "titulo" = 'hackeado'`).catch(() => []);
    assert.equal(filas.length, 0, "no se escribió nada");
});

test("la casa guarda, y la página pública lo enseña; lo vacío sale del código", async () => {
    acc.ponerAQuienMira(await persona("admin", "admin"));
    assert.equal((await acc.guardarIntroduccionDeLaGuiaAction("../otro", { titulo: "x" })).success, false, "un módulo inventado no");
    assert.equal((await acc.guardarIntroduccionDeLaGuiaAction("leads", { titulo: "x".repeat(200) })).success, false, "lo largo se rechaza");
    const r = await acc.guardarIntroduccionDeLaGuiaAction("leads", { titulo: "", subtitulo: "Nuevo sub", descripcion: "Uno\n\nDos" });
    assert.equal(r.success, true, r.message);
    const leido = await acc.introduccionDeLaGuiaAction("leads");
    assert.equal(leido.guardada.subtitulo, "Nuevo sub");
    assert.equal(leido.porDefecto.titulo, "Leads");
    assert.deepEqual(await acc.laIntroduccionPublica("leads", DEF), { titulo: "Leads", subtitulo: "Nuevo sub", descripcion: "Uno\n\nDos" });
});

test("guardar vacío RESTAURA: se borra la fila y vuelve el texto del código", async () => {
    acc.ponerAQuienMira(await persona("admin3", "admin"));
    assert.equal((await acc.guardarIntroduccionDeLaGuiaAction("leads", { titulo: "", subtitulo: "", descripcion: "" })).success, true);
    const filas = await acc.db.$queryRawUnsafe(`SELECT 1 FROM "guia_introducciones" WHERE "modulo" = 'leads'`);
    assert.equal(filas.length, 0);
    assert.deepEqual(await acc.laIntroduccionPublica("leads", DEF), DEF);
});

test("sin la tabla (base recién levantada), la página no se cae: la crea o sale el código", async () => {
    await acc.db.$executeRawUnsafe(`DROP TABLE IF EXISTS "guia_introducciones"`);
    assert.deepEqual(await acc.laIntroduccionPublica("leads", DEF), DEF);
    acc.ponerAQuienMira(await persona("admin4", "admin"));
    assert.equal((await acc.guardarIntroduccionDeLaGuiaAction("leads", { titulo: "Otra vez" })).success, true, "se recrea sola");
    assert.equal((await acc.laIntroduccionPublica("leads", DEF)).titulo, "Otra vez");
    await acc.guardarIntroduccionDeLaGuiaAction("leads", {});
});
