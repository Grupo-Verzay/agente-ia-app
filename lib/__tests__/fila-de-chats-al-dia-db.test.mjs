/**
 * La fila de UNA conversación, leída con la misma consulta que la bandeja.
 *
 * Es lo que la pantalla de Chats pide cuando algo cambió desde la conversación
 * abierta. Contra Postgres y con la acción de verdad: un recordatorio, una cita,
 * una etiqueta, un seguimiento y una nota interna se leen al momento —que es lo
 * que antes esperaba al reloj de sesiones (60 s)— y la puerta no se afloja: una
 * cuenta ajena no lee la fila, y la madre sí lee la de su hija.
 *
 * Se levanta con `scripts/banco-iconos-de-la-fila.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const AQUI = dirname(fileURLToPath(import.meta.url));
const { ponerAQuienMira, laFilaDeLaSesionAction, lasNotasDeLaBandejaAction, db } = await import(
  join(AQUI, ".compilado", "fila-al-dia", "entrada-de-la-fila-al-dia.js")
);

const como = (id, extra = {}) =>
  ponerAQuienMira({
    id,
    sessionUserId: id,
    effectiveId: id,
    ownerId: null,
    advisorRole: null,
    role: "user",
    rolDeLaPersona: "user",
    email: `${id}@banco.test`,
    name: id,
    ...extra,
  });

const V = `v${Date.now().toString(36)}`;
const MADRE = `${V}-madre`;
const HIJA = `${V}-hija`;
const AJENA = `${V}-ajena`;
const JID = `${V}-573001112233@s.whatsapp.net`;

async function cuenta(id) {
  await db.user.create({ data: { id, name: id, email: `${id}@banco.test`, password: "x" } });
}

let sesionId;
let sesionDeLaHija;

test("siembra", async () => {
  await cuenta(MADRE);
  await cuenta(HIJA);
  await cuenta(AJENA);
  await db.linkedAccount.create({ data: { masterUserId: MADRE, linkedUserId: HIJA } });
  const s = await db.session.create({
    data: { userId: MADRE, remoteJid: JID, pushName: "Laura", instanceId: "BANCO", status: true },
  });
  sesionId = s.id;
  const h = await db.session.create({
    data: { userId: HIJA, remoteJid: `${V}-hija@s.whatsapp.net`, pushName: "Hija", instanceId: "BANCO_H", status: true },
  });
  sesionDeLaHija = h.id;
});

test("recién creada: sin iconos", async () => {
  como(MADRE);
  const r = await laFilaDeLaSesionAction(sesionId);
  assert.equal(r.success, true, r.message);
  assert.equal(r.data.reminderCount, 0);
  assert.equal(r.data.latestAppointmentStatus, null);
  assert.equal(r.data.pendingSeguimientos, 0);
  assert.deepEqual(r.data.tags, []);
  assert.equal(r.data.tieneNotas, false);
  assert.equal(r.data.ultimaNota, null);
});

test("lo que se crea desde la conversación se lee al momento", async () => {
  como(MADRE);
  await db.reminders.create({ data: { title: "Llamar", remoteJid: JID, userId: MADRE, time: "02/10/2026 10:00" } });
  await db.appointment.create({
    data: {
      userId: MADRE, sessionId: sesionId, startTime: new Date(Date.now() + 86_400_000),
      endTime: new Date(Date.now() + 90_000_000), timezone: "America/Bogota", status: "CONFIRMADA",
    },
  });
  const tag = await db.tag.create({ data: { userId: MADRE, name: "Interesado", slug: `${V}-interesado` } });
  await db.sessionTag.create({ data: { sessionId: sesionId, tagId: tag.id } });
  await db.seguimiento.create({ data: { remoteJid: JID, instancia: "BANCO", idNodo: `${V}-n`, tipo: "text", followUpStatus: "pending", time: "x" } });
  await db.internalNote.create({ data: { sessionId: sesionId, authorId: MADRE, content: "ojo" } });

  const r = await laFilaDeLaSesionAction(sesionId);
  assert.equal(r.success, true, r.message);
  assert.equal(r.data.reminderCount, 1);
  assert.equal(r.data.latestAppointmentStatus, "CONFIRMADA");
  assert.equal(r.data.pendingSeguimientos, 1);
  assert.deepEqual(r.data.tags.map((t) => t.name), ["Interesado"]);
  assert.equal(r.data.tieneNotas, true);
  assert.equal(r.data.ultimaNota?.texto, "ojo");
});

test("la puerta: una cuenta ajena no lee la fila", async () => {
  como(AJENA);
  const r = await laFilaDeLaSesionAction(sesionId);
  assert.equal(r.success, false);
  assert.equal(r.data, undefined);
});

test("la madre lee la fila de su hija, y su candado de notas sale en la lista", async () => {
  await db.internalNote.create({ data: { sessionId: sesionDeLaHija, authorId: HIJA, content: "nota" } });
  como(MADRE);
  const r = await laFilaDeLaSesionAction(sesionDeLaHija);
  assert.equal(r.success, true, r.message);
  assert.equal(r.data.tieneNotas, true);
  const conNotas = (await lasNotasDeLaBandejaAction()).map((n) => n.sessionId);
  assert.ok(conNotas.includes(sesionDeLaHija), "la conversación de la hija con nota no pinta su candado");
  assert.ok(conNotas.includes(sesionId));
});

test("una hija no lee la fila de su madre", async () => {
  como(HIJA);
  const r = await laFilaDeLaSesionAction(sesionId);
  assert.equal(r.success, false);
});

test("un id que no es una sesión se dice", async () => {
  como(MADRE);
  assert.equal((await laFilaDeLaSesionAction(0)).success, false);
  assert.equal((await laFilaDeLaSesionAction(999999999)).success, false);
});

test.after(async () => {
  await db.$disconnect();
});
