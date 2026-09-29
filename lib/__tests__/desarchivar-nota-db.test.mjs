/**
 * Archivar y DESARCHIVAR contra Postgres, con las acciones de verdad.
 * Solo se finge quién ha iniciado sesión.
 *
 * Esta mitad es igual en los dos modos a propósito: la acción de servidor
 * existía y funcionaba; lo que faltaba era quien la llamara. Aquí se prueba que
 * el viaje de ida y vuelta deja la nota exactamente donde estaba y que nadie
 * desarchiva una nota ajena.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const AQUI = dirname(fileURLToPath(import.meta.url));
const m = await import(join(AQUI, ".compilado", "desarchivar-nota", "entrada-de-desarchivar-nota.js"));
const { db, ponerAQuienMira, createNote, getNotes, getArchivedNotes, archiveNote, unarchiveNote } = m;

const SELLO = Date.now().toString(36);
const YO = `yo-${SELLO}`;
const OTRA = `otra-${SELLO}`;

test.before(async () => {
    for (const id of [YO, OTRA]) {
        await db.user.create({ data: { id, email: `${id}@banco.test`, name: id } });
    }
});
test.after(async () => {
    await db.$disconnect();
});

const ids = (r) => (r.success ? r.data.map((n) => n.id) : []);

test("archivar y desarchivar: la nota va al Archivo y vuelve a la lista activa", async () => {
    ponerAQuienMira({ id: YO });
    const creada = await createNote(YO, null, undefined, "IDA Y VUELTA");
    assert.ok(creada.success);
    const id = creada.data.id;

    assert.ok(ids(await getNotes(YO)).includes(id), "nace activa");

    assert.deepEqual(await archiveNote(id, YO), { success: true });
    assert.ok(!ids(await getNotes(YO)).includes(id), "archivada no sale en las activas");
    assert.ok(ids(await getArchivedNotes(YO)).includes(id), "sale en el Archivo");

    assert.deepEqual(await unarchiveNote(id, YO), { success: true });
    assert.ok(ids(await getNotes(YO)).includes(id), "desarchivada vuelve a las activas");
    assert.ok(!ids(await getArchivedNotes(YO)).includes(id), "y deja el Archivo");

    const fila = await db.userNote.findUnique({ where: { id } });
    assert.equal(fila.isArchived, false);
    assert.equal(fila.title, "IDA Y VUELTA", "no se tocó nada más");

    const log = await db.auditLog.findMany({ where: { entityId: id }, orderBy: { createdAt: "asc" } });
    const acciones = log.map((l) => l.action);
    assert.ok(acciones.includes("archived") && acciones.includes("restored"), "las dos quedan en el historial");
});

test("nadie desarchiva una nota ajena (la dueña sale de la sesión, no del id pedido)", async () => {
    ponerAQuienMira({ id: YO });
    const creada = await createNote(YO, null, undefined, "DE YO");
    const id = creada.data.id;
    await archiveNote(id, YO);

    ponerAQuienMira({ id: OTRA });
    const r = await unarchiveNote(id, YO); // pide la de YO con la sesión de OTRA
    assert.equal(r.success, false);
    const fila = await db.userNote.findUnique({ where: { id } });
    assert.equal(fila.isArchived, true, "sigue archivada");
});

test("sin sesión no se desarchiva nada", async () => {
    ponerAQuienMira({ id: YO });
    const id = (await createNote(YO, null, undefined, "SIN SESION")).data.id;
    await archiveNote(id, YO);
    ponerAQuienMira(null);
    assert.equal((await unarchiveNote(id, YO)).success, false);
    assert.equal((await db.userNote.findUnique({ where: { id } })).isArchived, true);
});
