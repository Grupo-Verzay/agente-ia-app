/**
 * Mis datos se lee y se guarda con la CUENTA ACTIVA.
 *
 * La pantalla le pasaba a sus pestañas `user.id`, que para una persona del
 * equipo es SU fila, no la cuenta. Así que un asesor no veía los datos ni la
 * base de conocimiento de su cuenta, y lo que importaba quedaba guardado bajo
 * él —donde el agente de la cuenta no lo lee y ningún compañero lo ve—.
 *
 * Aquí corren las ACCIONES de verdad contra Postgres (lo único fingido es
 * `currentUser()`), con el id que la pantalla les da: `laCuentaActiva(user)`.
 * `MODO=roto` les da el de antes (`user.id`) y AFIRMA el fallo; además lee la
 * página de un commit pinchado para comprobar que era eso lo que pasaba.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROTO = process.env.MODO === "roto";
const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..", "..");
const m = await import("./.compilado/mis-datos/entrada-de-mis-datos.js");
const ANTES_REF = process.env.ANTES_REF || "16e81b7";

const V = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const DUENO = `md-dueno-${V}`;
const ASESOR = `md-asesor-${V}`;
const ADMIN_EQUIPO = `md-admin-${V}`;
const HIJA = `md-hija-${V}`;
const AJENA = `md-ajena-${V}`;

const quien = (id, extra = {}) => ({
    id, effectiveId: id, sessionUserId: id, ownerId: null, advisorRole: null,
    role: "user", rolDeLaPersona: "user", email: `${id}@banco.test`, name: id, ...extra,
});
// Las formas que devuelve `currentUser()` para cada caso.
const dueno = () => quien(DUENO);
const asesor = () => quien(ASESOR, { ownerId: DUENO, effectiveId: DUENO, advisorRole: "agente" });
const adminDelEquipo = () => quien(ADMIN_EQUIPO, { ownerId: DUENO, effectiveId: DUENO, advisorRole: "administrador" });
// Con el conmutador en una cuenta hija: la fila efectiva ES la hija.
const duenoEnLaHija = () => quien(HIJA, { sessionUserId: DUENO });

/** El id que la pantalla le da a sus pestañas: el de hoy, o el de antes en el modo roto. */
const laQueDaLaPantalla = (u) => (ROTO ? u.id : m.laCuentaActiva(u));

test.before(async () => {
    for (const [id, ownerId, advisorRole] of [[DUENO, null, null], [ASESOR, DUENO, "agente"], [ADMIN_EQUIPO, DUENO, "administrador"], [HIJA, null, null], [AJENA, null, null]]) {
        await m.db.user.create({ data: { id, email: `${id}@banco.test`, name: id, ownerId, advisorRole } });
    }
    await m.db.linkedAccount.create({ data: { masterUserId: DUENO, linkedUserId: HIJA } }).catch(async () => {
        await m.db.$executeRawUnsafe(`INSERT INTO "linked_accounts" ("id","master_user_id","linked_user_id") VALUES ($1,$2,$3)`, `lk-${V}`, DUENO, HIJA);
    });
    // Lo que la cuenta ya tiene: su base de conocimiento y un dato externo.
    await m.db.knowledgeBlock.create({ data: { userId: DUENO, title: "Horarios", keywords: ["horario"], content: "Abrimos de 8 a 6", embedding: [] } });
    await m.db.externalClientData.create({ data: { userId: DUENO, remoteJid: "573001112233@s.whatsapp.net", data: { nombre: "Cliente de la cuenta" }, source: "manual" } });
});

test.after(async () => {
    const ids = [DUENO, ASESOR, ADMIN_EQUIPO, HIJA, AJENA];
    await m.db.knowledgeBlock.deleteMany({ where: { userId: { in: ids } } });
    await m.db.externalClientData.deleteMany({ where: { userId: { in: ids } } });
    await m.db.$executeRawUnsafe(`DELETE FROM "linked_accounts" WHERE "master_user_id" = $1`, DUENO).catch(() => {});
    await m.db.user.deleteMany({ where: { id: { in: ids } } });
    await m.db.$disconnect();
});

test("la regla: la cuenta activa es la de la cuenta, no la fila de la persona", () => {
    assert.equal(m.laCuentaActiva(dueno()), DUENO);
    assert.equal(m.laCuentaActiva(asesor()), DUENO, "un asesor trabaja en la cuenta de su dueño");
    assert.equal(m.laCuentaActiva(adminDelEquipo()), DUENO);
    assert.equal(m.laCuentaActiva(duenoEnLaHija()), HIJA, "con el conmutador, la cuenta elegida");
    assert.equal(m.laCuentaActiva({ id: "x", ownerId: "y" }), "y", "sin effectiveId, la del dueño");
    assert.equal(m.laCuentaActiva({ id: "x" }), "x");
});

for (const [nombre, persona] of [["un asesor", asesor], ["el administrador del equipo", adminDelEquipo]]) {
    test(`${nombre} LEE los datos y la base de conocimiento de SU CUENTA`, { skip: ROTO }, async () => {
        const u = persona();
        m.ponerAQuienMira(u);
        const cuenta = laQueDaLaPantalla(u);
        assert.deepEqual((await m.listKnowledgeBlocks(cuenta)).map((b) => b.title), ["Horarios"]);
        assert.deepEqual((await m.listExternalClientData(cuenta, 1, 200)).items.map((i) => i.data.nombre), ["Cliente de la cuenta"]);
        assert.equal((await m.getKnowledgeBlockCounts(cuenta)).total, 1);
    });
}

test("un asesor IMPORTA y GUARDA en su cuenta: nada queda bajo su propia fila", { skip: ROTO }, async () => {
    const u = asesor();
    m.ponerAQuienMira(u);
    const cuenta = laQueDaLaPantalla(u);
    const r = await m.autoSplitAndImport(cuenta, "Precios\nEl plan básico cuesta 10\n\n---\n\nEnvíos\nA todo el país", "---");
    assert.equal(r.created, 2);
    await m.createKnowledgeBlock(cuenta, { title: "Garantía", keywords: ["garantia"], content: "Un año" });
    await m.upsertExternalClientData(cuenta, "573009998877@s.whatsapp.net", { nombre: "Importado por el asesor" }, "google_sheets");
    assert.equal(await m.db.knowledgeBlock.count({ where: { userId: ASESOR } }), 0, "nada bajo la persona");
    assert.equal(await m.db.externalClientData.count({ where: { userId: ASESOR } }), 0);
    // Y el dueño lo ve, que es lo que lee el agente de la cuenta.
    m.ponerAQuienMira(dueno());
    assert.equal((await m.getKnowledgeBlockCounts(DUENO)).total, 4);
    assert.equal((await m.listExternalClientData(DUENO, 1, 200)).total, 2);
    // Limpieza de lo de esta prueba.
    await m.db.knowledgeBlock.deleteMany({ where: { userId: DUENO, NOT: { title: "Horarios" } } });
    await m.db.externalClientData.deleteMany({ where: { userId: DUENO, remoteJid: "573009998877@s.whatsapp.net" } });
});

test("con el conmutador en una cuenta hija se lee y se guarda en LA HIJA, no en la del dueño", { skip: ROTO }, async () => {
    const u = duenoEnLaHija();
    m.ponerAQuienMira(u);
    const cuenta = laQueDaLaPantalla(u);
    assert.deepEqual(await m.listKnowledgeBlocks(cuenta), [], "la hija no tiene la base de la madre");
    await m.createKnowledgeBlock(cuenta, { title: "De la hija", keywords: [], content: "x" });
    assert.equal(await m.db.knowledgeBlock.count({ where: { userId: HIJA } }), 1);
    assert.equal(await m.db.knowledgeBlock.count({ where: { userId: DUENO, title: "De la hija" } }), 0);
});

test("la puerta no se afloja: un asesor no llega a otra cuenta ni pidiéndola a mano", async () => {
    m.ponerAQuienMira(asesor());
    await assert.rejects(() => m.listKnowledgeBlocks(AJENA));
    await assert.rejects(() => m.listExternalClientData(AJENA, 1, 200));
});

test("barrido: la pantalla de Mis datos pasa la CUENTA ACTIVA a sus pestañas", { skip: ROTO }, () => {
    const p = fs.readFileSync(join(RAIZ, "app/(root)/my-data/page.tsx"), "utf8");
    assert.match(p, /const cuenta = laCuentaActiva\(user\)/);
    assert.match(p, /<MyDataContent userId=\{cuenta\} \/>/);
    assert.doesNotMatch(p, /userId=\{user\.id\}/);
    assert.match(p, /where: \{ id: cuenta \}/, "el plan de la cuenta, no el de la persona");
});

test("MODO=roto: antes la pantalla daba la fila de la PERSONA, y el asesor trabajaba fuera de su cuenta", { skip: !ROTO }, async () => {
    const antes = execFileSync("git", ["show", `${ANTES_REF}:app/(root)/my-data/page.tsx`], { cwd: RAIZ, encoding: "utf8" });
    assert.match(antes, /<MyDataContent userId=\{user\.id\} \/>/, "le pasaba user.id a las pestañas");
    const u = asesor();
    m.ponerAQuienMira(u);
    const cuenta = laQueDaLaPantalla(u);
    assert.equal(cuenta, ASESOR);
    assert.deepEqual(await m.listKnowledgeBlocks(cuenta), [], "no veía la base de conocimiento de su cuenta");
    assert.equal((await m.listExternalClientData(cuenta, 1, 200)).total, 0, "ni sus datos externos");
    await m.autoSplitAndImport(cuenta, "Importado\nlo que sea", undefined);
    assert.equal(await m.db.knowledgeBlock.count({ where: { userId: ASESOR } }), 1, "y lo que importaba quedaba bajo la persona");
    assert.equal(await m.db.knowledgeBlock.count({ where: { userId: DUENO } }), 1, "fuera de la cuenta que lee el agente");
});
