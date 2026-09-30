/**
 * Mis notas contra POSTGRES, con las acciones y la ruta de producción. Solo se
 * finge quién ha iniciado sesión.
 *
 * Lo que esta mitad prueba y un banco puro no puede decir: que el buscador
 * encuentra un texto que solo está en el CUERPO de la nota —un árbol JSON, no
 * una cadena—, sin mirar tildes; que el Archivo y Compartidas buscan también y
 * el Archivo va por el orden de las demás listas; que el número de una carpeta
 * no cuenta sus archivadas; y que «Vincular contacto» ve los contactos de la
 * CUENTA, y a un agente solo los suyos.
 *
 * `MODO=roto` empaqueta las MISMAS pruebas contra el código de `ANTES_REF` y
 * AFIRMA los fallos.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const AQUI = dirname(fileURLToPath(import.meta.url));
const ROTO = process.env.MODO === "roto";
const m = await import(join(AQUI, ".compilado", "notas-db", "entrada-de-notas.js"));
const { db, ponerAQuienMira, createNote, updateNote, getNotes, getArchivedNotes, getSharedNotes, getFolders, createFolder, archiveNote, contactosParaVincular } = m;

const SELLO = Date.now().toString(36);
const DUENA = `duena-${SELLO}`;
const AGENTE = `agente-${SELLO}`;
const ADMIN = `admin-${SELLO}`;
const OTRA = `otra-${SELLO}`;
const doc = (...parrafos) => ({ type: "doc", content: parrafos.map((t) => ({ type: "paragraph", content: [{ type: "text", text: t }] })) });
const ids = (r) => (r.success ? r.data.map((n) => n.id) : []);
const titulos = (r) => (r.success ? r.data.map((n) => n.title) : []);

let proveedor, cafe, porciento, archivadaA, archivadaB, carpeta;

test.before(async () => {
    await db.user.create({ data: { id: DUENA, email: `${DUENA}@b.test`, name: "Dueña" } });
    await db.user.create({ data: { id: AGENTE, email: `${AGENTE}@b.test`, name: "Agente", ownerId: DUENA, advisorRole: "agente" } });
    await db.user.create({ data: { id: ADMIN, email: `${ADMIN}@b.test`, name: "Admin", ownerId: DUENA, advisorRole: "administrador" } });
    await db.user.create({ data: { id: OTRA, email: `${OTRA}@b.test`, name: "Otra" } });

    ponerAQuienMira({ id: DUENA });
    carpeta = (await createFolder(DUENA, "Clientes")).data;
    proveedor = (await createNote(DUENA, carpeta.id, doc("Llamar al proveedor el lunes"), "PENDIENTES")).data.id;
    cafe = (await createNote(DUENA, null, doc("Pedido de Café de Colombia"), "PEDIDOS")).data.id;
    porciento = (await createNote(DUENA, null, doc("Descuento del 50% para mayoristas"), "PRECIOS")).data.id;
    archivadaA = (await createNote(DUENA, carpeta.id, doc("Contrato del proveedor viejo"), "ARCHIVADA A")).data.id;
    archivadaB = (await createNote(DUENA, null, doc("Nada que ver"), "ARCHIVADA B")).data.id;
    await archiveNote(archivadaA, DUENA);
    await archiveNote(archivadaB, DUENA);
    // B fijada y con orden 0: tiene que ir PRIMERO en el Archivo aunque A se tocó después.
    await db.userNote.update({ where: { id: archivadaB }, data: { isPinned: true, order: 0 } });
    await db.userNote.update({ where: { id: archivadaA }, data: { order: 1 } });

    // Una nota de OTRA compartida con la dueña.
    const ajena = await db.userNote.create({ data: { userId: OTRA, title: "DE OTRA", content: doc("El proveedor de empaques") } });
    await db.userNote.create({ data: { userId: OTRA, title: "OTRA MAS", content: doc("Sin relación") } }).then((n) =>
        db.noteShare.create({ data: { noteId: n.id, userId: DUENA, canEdit: false } }),
    );
    await db.noteShare.create({ data: { noteId: ajena.id, userId: DUENA, canEdit: true } });

    // Conversaciones de la CUENTA: una del agente y otra sin asignar.
    await db.session.create({ data: { userId: DUENA, remoteJid: `57300${SELLO}1@s.whatsapp.net`, pushName: "Laura", instanceId: "i1", status: true, assignedAdvisorId: AGENTE } });
    await db.session.create({ data: { userId: DUENA, remoteJid: `57300${SELLO}2@s.whatsapp.net`, pushName: "Pedro", customName: "Don Pedro", instanceId: "i1", status: true } });
});
test.after(async () => {
    await db.$disconnect();
});

const contactos = async (q = "") => {
    const url = new URL(`http://x/api/notes/contacts?q=${encodeURIComponent(q)}&userId=${DUENA}`);
    const r = await contactosParaVincular(Object.assign(new Request(url), { nextUrl: url }));
    return r.status === 200 ? (await r.json()).data.map((c) => c.pushName).sort() : [];
};

if (ROTO) {
    test("ANTES: buscar un texto del CUERPO no encontraba nada", async () => {
        ponerAQuienMira({ id: DUENA });
        assert.deepEqual(ids(await getNotes(DUENA, undefined, "proveedor")), []);
    });
    test("ANTES: el Archivo ignoraba la búsqueda y el orden fijado", async () => {
        ponerAQuienMira({ id: DUENA });
        assert.deepEqual(new Set(ids(await getArchivedNotes(DUENA, "proveedor"))), new Set([archivadaA, archivadaB]));
        await db.userNote.update({ where: { id: archivadaA }, data: { emoji: "📌" } }); // la toca: pasa a ser la más reciente
        assert.equal(ids(await getArchivedNotes(DUENA))[0], archivadaA, "la última tocada arriba, aunque B esté fijada");
    });
    test("ANTES: el número de una carpeta contaba sus archivadas", async () => {
        ponerAQuienMira({ id: DUENA });
        const f = (await getFolders(DUENA)).data.find((x) => x.id === carpeta.id);
        assert.equal(f._count.notes, 2, "decía 2 con una sola a la vista");
    });
    test("ANTES: a alguien del equipo «Vincular contacto» no le enseñaba ninguno", async () => {
        ponerAQuienMira({ id: ADMIN, ownerId: DUENA, advisorRole: "administrador" });
        const url = new URL(`http://x/api/notes/contacts?q=&userId=${ADMIN}`);
        const r = await contactosParaVincular(Object.assign(new Request(url), { nextUrl: url }));
        assert.deepEqual((await r.json()).data, []);
    });
} else {
    test("el buscador encuentra un texto que solo está en el CUERPO", async () => {
        ponerAQuienMira({ id: DUENA });
        assert.deepEqual(ids(await getNotes(DUENA, undefined, "proveedor")), [proveedor]);
        assert.deepEqual(ids(await getNotes(DUENA, undefined, "LUNES")), [proveedor], "sin mirar mayúsculas");
        assert.deepEqual(ids(await getNotes(DUENA, carpeta.id, "proveedor")), [proveedor], "también dentro de una carpeta");
        assert.deepEqual(ids(await getNotes(DUENA, null, "proveedor")), [], "y respeta el filtro de Sueltas");
    });
    test("sin mirar tildes, por los dos lados", async () => {
        ponerAQuienMira({ id: DUENA });
        assert.deepEqual(ids(await getNotes(DUENA, undefined, "cafe")), [cafe]);
        assert.deepEqual(ids(await getNotes(DUENA, undefined, "CAFÉ")), [cafe]);
    });
    test("lo que se teclea se escapa: «50%» no es «50 y cualquier cosa»", async () => {
        ponerAQuienMira({ id: DUENA });
        assert.deepEqual(ids(await getNotes(DUENA, undefined, "50%")), [porciento]);
        assert.deepEqual(ids(await getNotes(DUENA, undefined, "5_%")), []);
    });
    test("el título sigue encontrándose", async () => {
        ponerAQuienMira({ id: DUENA });
        assert.deepEqual(ids(await getNotes(DUENA, undefined, "pedidos")), [cafe]);
    });
    test("el Archivo busca, y va fijadas arriba y por su orden", async () => {
        ponerAQuienMira({ id: DUENA });
        assert.deepEqual(ids(await getArchivedNotes(DUENA, "proveedor")), [archivadaA]);
        await db.userNote.update({ where: { id: archivadaA }, data: { emoji: "📌" } });
        assert.deepEqual(ids(await getArchivedNotes(DUENA)), [archivadaB, archivadaA], "B está fijada: primero, aunque A se tocó después");
    });
    test("Compartidas busca también en el cuerpo", async () => {
        ponerAQuienMira({ id: DUENA });
        assert.deepEqual(titulos(await getSharedNotes(DUENA)).sort(), ["DE OTRA", "OTRA MAS"]);
        assert.deepEqual(titulos(await getSharedNotes(DUENA, "empaques")), ["DE OTRA"]);
    });
    test("el número de una carpeta cuenta lo que su lista ENSEÑA: sin las archivadas", async () => {
        ponerAQuienMira({ id: DUENA });
        const f = (await getFolders(DUENA)).data.find((x) => x.id === carpeta.id);
        assert.equal(f._count.notes, 1);
        assert.equal(ids(await getNotes(DUENA, carpeta.id)).length, f._count.notes);
    });
    test("la búsqueda de otra persona no ve nada de la dueña", async () => {
        ponerAQuienMira({ id: OTRA });
        const r = ids(await getNotes(DUENA, undefined, "proveedor"));
        assert.ok(!r.includes(proveedor), "el id pedido se ignora: se buscan las de quien mira");
        assert.equal(r.length, 1, "y encuentra la SUYA, que también habla del proveedor");
    });
    test("«Vincular contacto»: la dueña y su administrador ven los de la CUENTA", async () => {
        ponerAQuienMira({ id: DUENA });
        assert.deepEqual(await contactos(), ["Don Pedro", "Laura"], "el nombre puesto a mano manda");
        ponerAQuienMira({ id: ADMIN, ownerId: DUENA, advisorRole: "administrador" });
        assert.deepEqual(await contactos(), ["Don Pedro", "Laura"]);
        assert.deepEqual(await contactos("pedro"), ["Don Pedro"]);
    });
    test("«Vincular contacto»: un agente ve solo sus conversaciones", async () => {
        ponerAQuienMira({ id: AGENTE, ownerId: DUENA, advisorRole: "agente" });
        assert.deepEqual(await contactos(), ["Laura"]);
    });
    test("«Vincular contacto»: sin sesión, nada", async () => {
        ponerAQuienMira(null);
        const url = new URL("http://x/api/notes/contacts?q=");
        const r = await contactosParaVincular(Object.assign(new Request(url), { nextUrl: url }));
        assert.equal(r.status, 401);
    });
    test("guardar el cuerpo sigue funcionando y lo nuevo se encuentra", async () => {
        ponerAQuienMira({ id: DUENA });
        await updateNote(cafe, DUENA, { content: doc("Pedido de Café", "Confirmar con la tostadora") });
        assert.deepEqual(ids(await getNotes(DUENA, undefined, "tostadora")), [cafe]);
    });
}
