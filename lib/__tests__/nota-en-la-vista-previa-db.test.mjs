/**
 * LA NOTA INTERNA EN LA VISTA PREVIA, contra Postgres y con las acciones de
 * VERDAD. Lo que un banco puro no puede decir:
 *
 * 1. La lista de la bandeja trae la ÚLTIMA nota de cada conversación, con su
 *    texto en una línea y su hora: una consulta, una nota por conversación.
 * 2. La fila de UNA sesión —la que se relee cuando el asesor escribe o borra
 *    una nota desde la conversación abierta— trae lo mismo, al momento.
 * 3. Con eso la regla de la fila decide bien: si la nota es posterior al
 *    último mensaje, la vista previa es «🔒 su texto»; con un mensaje
 *    posterior, vuelve a ser el mensaje.
 * 4. La puerta no se afloja: la madre ve las notas de su hija, la hija no ve
 *    las de su madre, y una cuenta ajena no ve nada.
 *
 * `MODO=roto` corre las dos acciones tal cual estaban en `ANTES_REF` y AFIRMA
 * el fallo: a la lista solo le llegaban ids, y la fila no traía ningún texto.
 *
 * Se levanta con `scripts/banco-nota-en-la-vista-previa.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";

const ROTO = process.env.MODO === "roto";
const m = await import(
    ROTO
        ? "./.compilado/nota-vista-previa/entrada-de-la-nota-en-la-vista-previa-antes.js"
        : "./.compilado/nota-vista-previa/entrada-de-la-nota-en-la-vista-previa.js"
);
const { ponerAQuienMira, createInternalNoteAction, deleteInternalNoteAction, laFilaDeLaSesionAction, db } = m;

const V = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const MADRE = `nvp-madre-${V}`;
const HIJA = `nvp-hija-${V}`;
const AJENA = `nvp-ajena-${V}`;
const ASESORA = `nvp-asesora-${V}`; // administradora del equipo de la madre

function quien(id, extra = {}) {
    return {
        id, effectiveId: id, sessionUserId: id, ownerId: null, advisorRole: null,
        role: "user", rolDeLaPersona: "user", email: `${id}@banco.test`, name: id,
        canTakeUnassigned: false, ...extra,
    };
}
/** La administradora del equipo: la fila efectiva es la de la cuenta; la persona, la suya. */
const laAsesora = () => quien(MADRE, { sessionUserId: ASESORA, ownerId: null, advisorRole: "administrador" });

const S = {};

test.before(async () => {
    await db.$executeRawUnsafe(`ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMP(3)`);
    await db.$executeRawUnsafe(`ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMP(3)`);
    for (const [id, nombre] of [[MADRE, "La Madre"], [HIJA, "La Hija"], [AJENA, "La Ajena"]]) {
        await db.user.create({ data: { id, email: `${id}@banco.test`, name: nombre } });
    }
    await db.user.create({ data: { id: ASESORA, email: `${ASESORA}@banco.test`, name: "Ana Asesora", ownerId: MADRE, advisorRole: "administrador" } });
    await db.linkedAccount.create({ data: { masterUserId: MADRE, linkedUserId: HIJA } });
    const crear = async (userId, linea, sufijo, nombre) =>
        (await db.session.create({
            data: { userId, instanceId: linea, remoteJid: `5730${V.slice(-6)}${sufijo}@s.whatsapp.net`, pushName: nombre, status: true },
            select: { id: true },
        })).id;
    S.beatriz = await crear(MADRE, `NVP_MADRE_${V}`, "01", "Beatriz");
    S.diana = await crear(MADRE, `NVP_MADRE_${V}`, "02", "Diana");
    S.hilda = await crear(HIJA, `NVP_HIJA_${V}`, "03", "Hilda");
    S.ajena = await crear(AJENA, `NVP_AJENA_${V}`, "04", "Alba");
});

test("MODO=roto: a la lista solo le llegaban ids, y la fila no traía ningún texto", { skip: !ROTO }, async () => {
    ponerAQuienMira(laAsesora());
    const r = await createInternalNoteAction({ sessionId: S.beatriz, content: "Llamar mañana a las 10" });
    assert.equal(r.success, true, r.message);

    const ids = await m.getSessionIdsWithNotesAction();
    assert.ok(ids.includes(S.beatriz));
    assert.equal(typeof ids[0], "number", "el fallo: solo el id, sin el texto de la nota");
    assert.equal(m.lasNotasDeLaBandejaAction, undefined, "el fallo: no había forma de pedir la última nota");

    const fila = await laFilaDeLaSesionAction(S.beatriz);
    assert.equal(fila.success, true, fila.message);
    assert.equal(fila.data.tieneNotas, true);
    assert.equal(fila.data.ultimaNota, undefined, "el fallo: la fila sabía que había nota, no qué decía");
});

test("la nota recién escrita es la de la conversación: en la lista y en su fila, al momento", { skip: ROTO }, async () => {
    ponerAQuienMira(laAsesora());
    const antes = Date.now();
    const r = await createInternalNoteAction({ sessionId: S.beatriz, content: "Llamar mañana a las 10" });
    assert.equal(r.success, true, r.message);

    const notas = await m.lasNotasDeLaBandejaAction();
    const deBeatriz = notas.filter((n) => n.sessionId === S.beatriz);
    assert.equal(deBeatriz.length, 1, "una nota por conversación");
    assert.equal(deBeatriz[0].texto, "Llamar mañana a las 10");
    assert.ok(deBeatriz[0].creadaEnMs >= antes - 5_000, "la hora en milisegundos");

    const fila = await laFilaDeLaSesionAction(S.beatriz);
    assert.equal(fila.success, true, fila.message);
    assert.equal(fila.data.tieneNotas, true);
    assert.equal(fila.data.ultimaNota?.texto, "Llamar mañana a las 10");
    assert.equal(fila.data.ultimaNota?.creadaEnMs, deBeatriz[0].creadaEnMs, "la lista y la fila dicen lo mismo");
});

test("con dos notas, manda la más reciente; y un texto largo viaja en una línea y cortado", { skip: ROTO }, async () => {
    ponerAQuienMira(laAsesora());
    // La vieja se escribe con fecha de ayer: la que gana es la de hoy.
    await db.internalNote.create({
        data: { sessionId: S.diana, authorId: ASESORA, content: "La de ayer", createdAt: new Date(Date.now() - 86_400_000) },
    });
    const largo = `Revisar el pedido\n\ncon   el cliente ${"x".repeat(400)}`;
    const r = await createInternalNoteAction({ sessionId: S.diana, content: largo });
    assert.equal(r.success, true, r.message);

    const nota = (await m.lasNotasDeLaBandejaAction()).find((n) => n.sessionId === S.diana);
    assert.ok(nota, "Diana tiene nota");
    assert.ok(nota.texto.startsWith("Revisar el pedido con el cliente x"), nota.texto);
    assert.ok(!/\n/.test(nota.texto), "una sola línea");
    assert.ok(nota.texto.length <= m.TOPE_DEL_TEXTO_DE_LA_NOTA, `cortado: ${nota.texto.length}`);
    assert.ok(nota.texto.endsWith("…"));
});

test("la regla de la fila con lo que trae la base: la nota manda solo si es lo último", { skip: ROTO }, async () => {
    ponerAQuienMira(laAsesora());
    const { ultimaNota } = (await laFilaDeLaSesionAction(S.beatriz)).data;
    // El último mensaje, en SEGUNDOS como lo guarda la casa, un minuto antes.
    const mensajeAntes = Math.floor((ultimaNota.creadaEnMs - 60_000) / 1000);
    const conNota = m.laVistaPreviaDeLaFila({
        textoDelMensaje: "🖼️ Imagen",
        ultimoMensajeMs: mensajeAntes * 1000,
        nota: ultimaNota,
    });
    assert.deepEqual(conNota, { texto: `${m.ICONO_DE_LA_NOTA} Llamar mañana a las 10`, esNota: true });

    const conMensaje = m.laVistaPreviaDeLaFila({
        textoDelMensaje: "Gracias, quedo atenta",
        ultimoMensajeMs: ultimaNota.creadaEnMs + 1_000,
        nota: ultimaNota,
    });
    assert.deepEqual(conMensaje, { texto: "Gracias, quedo atenta", esNota: false }, "un mensaje nuevo vuelve a ser la vista previa");
});

test("la puerta: la madre ve las de su hija, la hija no las de su madre, la ajena nada", { skip: ROTO }, async () => {
    ponerAQuienMira(quien(HIJA));
    const r = await createInternalNoteAction({ sessionId: S.hilda, content: "Nota de la hija" });
    assert.equal(r.success, true, r.message);
    ponerAQuienMira(quien(AJENA));
    assert.equal((await createInternalNoteAction({ sessionId: S.ajena, content: "Nota ajena" })).success, true);

    ponerAQuienMira(quien(MADRE));
    const deLaMadre = new Set((await m.lasNotasDeLaBandejaAction()).map((n) => n.sessionId));
    assert.ok(deLaMadre.has(S.beatriz) && deLaMadre.has(S.diana), "las suyas");
    assert.ok(deLaMadre.has(S.hilda), "la de la hija: la bandeja de la madre la enseña");
    assert.ok(!deLaMadre.has(S.ajena), "nunca la de otra cuenta");

    ponerAQuienMira(quien(HIJA));
    const deLaHija = new Set((await m.lasNotasDeLaBandejaAction()).map((n) => n.sessionId));
    assert.ok(deLaHija.has(S.hilda));
    assert.ok(!deLaHija.has(S.beatriz) && !deLaHija.has(S.diana), "la hija no ve las de su madre");

    ponerAQuienMira(quien(AJENA));
    const deLaAjena = new Set((await m.lasNotasDeLaBandejaAction()).map((n) => n.sessionId));
    assert.deepEqual([...deLaAjena], [S.ajena]);

    ponerAQuienMira(null);
    assert.deepEqual(await m.lasNotasDeLaBandejaAction(), [], "sin sesión, nada");
});

test("borrar la última nota: la fila vuelve a la anterior, y sin ninguna se quita", { skip: ROTO }, async () => {
    ponerAQuienMira(laAsesora());
    const segunda = await createInternalNoteAction({ sessionId: S.beatriz, content: "Ya confirmó" });
    assert.equal(segunda.success, true, segunda.message);
    assert.equal((await laFilaDeLaSesionAction(S.beatriz)).data.ultimaNota?.texto, "Ya confirmó");

    assert.equal((await deleteInternalNoteAction(segunda.data.id)).success, true);
    assert.equal((await laFilaDeLaSesionAction(S.beatriz)).data.ultimaNota?.texto, "Llamar mañana a las 10", "vuelve a la anterior");

    const quedan = await db.internalNote.findMany({ where: { sessionId: S.beatriz }, select: { id: true } });
    for (const { id } of quedan) assert.equal((await deleteInternalNoteAction(id)).success, true);
    const fila = await laFilaDeLaSesionAction(S.beatriz);
    assert.equal(fila.data.ultimaNota, null);
    assert.equal(fila.data.tieneNotas, false);
    assert.ok(!(await m.lasNotasDeLaBandejaAction()).some((n) => n.sessionId === S.beatriz), "ni en la lista");
});
