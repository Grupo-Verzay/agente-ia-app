/**
 * Las etiquetas por línea, contra Postgres y por las ACCIONES de verdad.
 *
 * La familia es la de producción en pequeño: una madre que vinculó a Atención y
 * a Ventas, más una cuenta ajena. El mismo cliente tiene conversación en
 * Atención y en Ventas. Atención tiene etiquetas; Ventas NINGUNA.
 *
 * Lo que se demuestra, desde la madre (súper administradora), desde un asesor
 * de Atención y desde un súper administrador de fuera:
 *
 *  - a cada conversación se le ofrecen solo las etiquetas de la cuenta de SU
 *    línea, y una línea sin etiquetas sale vacía;
 *  - lo que se ofrece es exactamente lo que el servidor deja asignar;
 *  - las dos conversaciones del mismo cliente conservan cada una sus
 *    etiquetas, y ninguna se mueve de línea;
 *  - una cuenta ajena no se cuela por mucho que se pida su id.
 *
 * `MODO=roto` corre el camino de antes —`listTagsAction` con la cuenta de quien
 * mira, ofrecida a cualquier conversación— y afirma el fallo: la conversación
 * de Atención ofrece las etiquetas de la madre y el servidor las rechaza.
 *
 * Se levanta con `scripts/banco-etiquetas-de-la-linea.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
    ponerAQuienMira,
    listTagsAction,
    listTagsDeLasCuentasAction,
    assignTagToSessionAction,
    etiquetasDeLaConversacion,
    db,
} from "./.compilado/etiquetas/entrada-de-etiquetas.js";

const ROTO = process.env.MODO === "roto";
const V = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const MADRE = `et-madre-${V}`;
const ATENCION = `et-atencion-${V}`;
const VENTAS = `et-ventas-${V}`;
const AJENA = `et-ajena-${V}`;
const ASESOR = `et-asesor-${V}`;
const SUPER = `et-super-${V}`;
const CLIENTE = `573001112233-${V}@s.whatsapp.net`;

const quien = (id, extra = {}) => ({
    id,
    effectiveId: id,
    sessionUserId: id,
    ownerId: null,
    advisorRole: null,
    role: "user",
    rolDeLaPersona: "user",
    email: `${id}@banco.test`,
    name: id,
    ...extra,
});

const S = {};
const T = {};

test.before(async () => {
    await db.user.create({ data: { id: MADRE, email: `${MADRE}@b.t`, name: "Madre", role: "super_admin" } });
    for (const id of [ATENCION, VENTAS, AJENA, SUPER]) {
        await db.user.create({
            data: { id, email: `${id}@b.t`, name: id, role: id === SUPER ? "super_admin" : "user" },
        });
    }
    await db.user.create({
        data: { id: ASESOR, email: `${ASESOR}@b.t`, name: "Asesor", role: "user", ownerId: ATENCION, advisorRole: "agente" },
    });
    let n = 0;
    for (const hija of [ATENCION, VENTAS]) {
        await db.$executeRawUnsafe(
            `INSERT INTO "linked_accounts" ("id","master_user_id","linked_user_id") VALUES ($1,$2,$3)`,
            `et-la-${V}-${n++}`, MADRE, hija,
        );
    }

    T.madre = await db.tag.create({ data: { userId: MADRE, name: "VIP", slug: "vip" } });
    T.reclamo = await db.tag.create({ data: { userId: ATENCION, name: "Reclamo", slug: "reclamo" } });
    T.resuelto = await db.tag.create({ data: { userId: ATENCION, name: "Resuelto", slug: "resuelto", order: 1 } });
    T.ajena = await db.tag.create({ data: { userId: AJENA, name: "Ajena", slug: "ajena" } });
    // Ventas: NINGUNA etiqueta, a propósito.

    // El mismo cliente, una conversación por línea.
    S.atencion = await db.session.create({
        data: { userId: ATENCION, remoteJid: CLIENTE, pushName: "Cliente", instanceId: `inst-atencion-${V}`, status: true },
    });
    S.ventas = await db.session.create({
        data: { userId: VENTAS, remoteJid: CLIENTE, pushName: "Cliente", instanceId: `inst-ventas-${V}`, status: true },
    });
});

test.after(async () => {
    await db.$disconnect();
});

const LA_BANDEJA = [MADRE, ATENCION, VENTAS];

/** Lo que el selector de la cabecera ofrece a una conversación. */
async function loQueSeOfrece(sesion, bandeja, cuentaDeQuienMira) {
    if (ROTO) {
        const r = await listTagsAction(cuentaDeQuienMira);
        return r.data ?? [];
    }
    const r = await listTagsDeLasCuentasAction(bandeja);
    assert.equal(r.success, true, r.message);
    return etiquetasDeLaConversacion(r.data, sesion.userId);
}

const nombres = (lista) => lista.map((t) => t.name).sort();

if (ROTO) {
    test("ROTO: desde la madre, la conversación de Atención ofrece las de la madre", async () => {
        ponerAQuienMira(quien(MADRE, { role: "super_admin", rolDeLaPersona: "super_admin" }));
        const ofrecidas = await loQueSeOfrece(S.atencion, LA_BANDEJA, MADRE);
        assert.deepEqual(nombres(ofrecidas), ["VIP"]);
        // ...y la que se ofrece, el servidor la rechaza.
        const r = await assignTagToSessionAction({ userId: S.atencion.userId, sessionId: S.atencion.id, tagId: ofrecidas[0].id });
        assert.equal(r.success, false);
    });

    test("ROTO: la línea de Ventas, que no tiene etiquetas, ofrece las de otra", async () => {
        ponerAQuienMira(quien(MADRE, { role: "super_admin", rolDeLaPersona: "super_admin" }));
        const ofrecidas = await loQueSeOfrece(S.ventas, LA_BANDEJA, MADRE);
        assert.ok(ofrecidas.length > 0);
    });
} else {
    test("madre: Atención ofrece solo las de Atención, y se asignan", async () => {
        ponerAQuienMira(quien(MADRE, { role: "super_admin", rolDeLaPersona: "super_admin" }));
        const ofrecidas = await loQueSeOfrece(S.atencion, LA_BANDEJA, MADRE);
        assert.deepEqual(nombres(ofrecidas), ["Reclamo", "Resuelto"]);
        for (const tag of ofrecidas) {
            const r = await assignTagToSessionAction({ userId: S.atencion.userId, sessionId: S.atencion.id, tagId: tag.id });
            assert.equal(r.success, true, r.message);
        }
    });

    test("madre: Ventas no tiene etiquetas y el selector sale VACÍO", async () => {
        ponerAQuienMira(quien(MADRE, { role: "super_admin", rolDeLaPersona: "super_admin" }));
        assert.deepEqual(await loQueSeOfrece(S.ventas, LA_BANDEJA, MADRE), []);
    });

    test("una etiqueta de Atención no entra en la conversación de Ventas", async () => {
        ponerAQuienMira(quien(MADRE, { role: "super_admin", rolDeLaPersona: "super_admin" }));
        const r = await assignTagToSessionAction({ userId: S.ventas.userId, sessionId: S.ventas.id, tagId: T.reclamo.id });
        assert.equal(r.success, false);
    });

    test("el mismo cliente conserva sus dos conversaciones, cada una con lo suyo", async () => {
        const filas = await db.session.findMany({
            where: { remoteJid: CLIENTE },
            include: { sessionTags: { include: { tag: true } } },
            orderBy: { id: "asc" },
        });
        assert.equal(filas.length, 2);
        const porCuenta = Object.fromEntries(
            filas.map((f) => [f.userId, { instancia: f.instanceId, tags: f.sessionTags.map((x) => x.tag.name).sort() }]),
        );
        assert.deepEqual(porCuenta[ATENCION], { instancia: `inst-atencion-${V}`, tags: ["Reclamo", "Resuelto"] });
        assert.deepEqual(porCuenta[VENTAS], { instancia: `inst-ventas-${V}`, tags: [] });
    });

    test("una cuenta ajena no se cuela aunque se pida su id", async () => {
        ponerAQuienMira(quien(MADRE, { role: "user", rolDeLaPersona: "user" }));
        const r = await listTagsDeLasCuentasAction([...LA_BANDEJA, AJENA]);
        assert.equal(r.success, true);
        assert.ok(!r.data.some((t) => t.userId === AJENA));
        assert.deepEqual(new Set(r.data.map((t) => t.userId)), new Set([MADRE, ATENCION]));
    });

    test("asesor de Atención: ve las de Atención y las asigna", async () => {
        ponerAQuienMira(quien(ASESOR, { ownerId: ATENCION, advisorRole: "agente", effectiveId: ATENCION }));
        const ofrecidas = await loQueSeOfrece(S.atencion, [ATENCION, ASESOR], ATENCION);
        assert.deepEqual(nombres(ofrecidas), ["Reclamo", "Resuelto"]);
        const r = await assignTagToSessionAction({ userId: S.atencion.userId, sessionId: S.atencion.id, tagId: T.reclamo.id });
        assert.equal(r.success, true, r.message);
    });

    test("asesor de Atención: no alcanza las etiquetas de Ventas ni de la ajena", async () => {
        ponerAQuienMira(quien(ASESOR, { ownerId: ATENCION, advisorRole: "agente", effectiveId: ATENCION }));
        const r = await listTagsDeLasCuentasAction([ATENCION, VENTAS, AJENA]);
        assert.deepEqual(new Set(r.data.map((t) => t.userId)), new Set([ATENCION]));
    });

    test("súper administrador de fuera: cada línea con las suyas, igual que la madre", async () => {
        ponerAQuienMira(quien(SUPER, { role: "super_admin", rolDeLaPersona: "super_admin" }));
        assert.deepEqual(nombres(await loQueSeOfrece(S.atencion, LA_BANDEJA, SUPER)), ["Reclamo", "Resuelto"]);
        assert.deepEqual(await loQueSeOfrece(S.ventas, LA_BANDEJA, SUPER), []);
    });
}
