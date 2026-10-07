/**
 * La busqueda dentro de los mensajes, contra Postgres y por la RUTA de verdad
 * (`POST /api/chats/buscar`). Lo unico fingido es `currentUser()`.
 *
 * Lo levanta `scripts/banco-busqueda-en-mensajes.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";

const m = await import(new URL(`../../${process.env.ENTRADA}`, import.meta.url));
const { db, POST, comoPersona, buscarEnLosMensajes, asegurarElIndiceDeBusqueda, NOMBRE_DEL_INDICE } = m;

const S = Date.now().toString(36);
const DUENA = `duena-${S}`;
const AGENTE = `agente-${S}`;
const AJENA = `ajena-${S}`;
const LINEA = `LINEA_${S}`;
const LINEA_AJENA = `AJENA_${S}`;

const filaDe = (id, extra = {}) => ({ id, email: `${id}@x.co`, name: id, role: "user", ownerId: null, ...extra });
const DUENA_FILA = filaDe(DUENA);
const AGENTE_FILA = filaDe(AGENTE, { ownerId: DUENA, advisorRole: "agente", canTakeUnassigned: false });
const AJENA_FILA = filaDe(AJENA);

const hace = (dias) => new Date(Date.now() - dias * 86400000);
let n = 0;
const msg = (userId, instanceName, remoteJid, content, extra = {}) => ({
  userId,
  instanceName,
  remoteJid,
  messageId: `m-${S}-${n++}`,
  fromMe: false,
  content,
  messageTimestamp: hace(0.01),
  ...extra,
});

async function buscar(fila, q, lineas = [LINEA]) {
  return comoPersona(fila, async () => {
    const res = await POST(
      new Request("http://x/api/chats/buscar", {
        method: "POST",
        body: JSON.stringify({ q, instanceNames: lineas, tzOffset: 300 }),
      }),
    );
    return { status: res.status, cuerpo: await res.json() };
  });
}
const jids = (r) => r.cuerpo.resultados.map((x) => x.remoteJid).sort();

test.before(async () => {
  for (const f of [DUENA_FILA, AGENTE_FILA, AJENA_FILA]) {
    await db.user.create({ data: { id: f.id, email: f.email, name: f.name, ownerId: f.ownerId ?? undefined, advisorRole: f.advisorRole } });
  }
  await db.instancia.create({ data: { instanceName: LINEA, userId: DUENA, instanceId: LINEA } });
  await db.instancia.create({ data: { instanceName: LINEA_AJENA, userId: AJENA, instanceId: LINEA_AJENA } });

  const ayer15 = new Date("2026-09-15T15:00:00Z");
  await db.chatMessage.createMany({
    data: [
      msg(DUENA, LINEA, "571@s.whatsapp.net", "Hola, ¿cuál es el precio del envío a Medellín?"),
      msg(DUENA, LINEA, "572@s.whatsapp.net", "Te mando la factura número FAC-8841 mañana"),
      msg(DUENA, LINEA, "573@s.whatsapp.net", "Pago confirmado", { messageTimestamp: ayer15 }),
      msg(DUENA, LINEA, "574@s.whatsapp.net", "mensaje borrado con palabra secreta zarzamora", { deleted: true }),
      msg(DUENA, LINEA, "99999@lid", "quiero el combo arandano", { remoteJidAlt: "575@s.whatsapp.net" }),
      msg(DUENA, LINEA, "576@s.whatsapp.net", "otro cliente pregunta por arandano"),
      msg(AJENA, LINEA_AJENA, "577@s.whatsapp.net", "precio del envío ajeno arandano"),
    ],
  });
  // 99999@lid / 575 lo lleva el agente; 576 no lo lleva nadie.
  await db.session.create({
    data: { userId: DUENA, remoteJid: "575@s.whatsapp.net", remoteJidAlt: "99999@lid", pushName: "A", instanceId: LINEA, status: true, assignedAdvisorId: AGENTE },
  });
  await db.session.create({
    data: { userId: DUENA, remoteJid: "576@s.whatsapp.net", pushName: "B", instanceId: LINEA, status: true },
  });
});

test.after(async () => {
  await db.$disconnect();
});

test("sin sesion: 401", async () => {
  const r = await buscar(null, "precio");
  assert.equal(r.status, 401);
});

test("una palabra dentro de un mensaje lo encuentra, sin tildes y por prefijo", async () => {
  assert.deepEqual(jids(await buscar(DUENA_FILA, "precio envio")), ["571@s.whatsapp.net"]);
  assert.deepEqual(jids(await buscar(DUENA_FILA, "medell")), ["571@s.whatsapp.net"]);
  assert.deepEqual(jids(await buscar(DUENA_FILA, "FAC-8841")), ["572@s.whatsapp.net"]);
  const r = await buscar(DUENA_FILA, "precio");
  assert.match(r.cuerpo.resultados[0].extracto, /precio/i);
});

test("una fecha trae lo de ese dia", async () => {
  assert.deepEqual(jids(await buscar(DUENA_FILA, "15/09/2026")), ["573@s.whatsapp.net"]);
  assert.deepEqual(jids(await buscar(DUENA_FILA, "pago 15/09/2026")), ["573@s.whatsapp.net"]);
  assert.deepEqual(jids(await buscar(DUENA_FILA, "factura 15/09/2026")), []);
});

test("lo borrado no sale", async () => {
  assert.deepEqual(jids(await buscar(DUENA_FILA, "zarzamora")), []);
});

test("la linea de otra cuenta no se busca aunque se pida", async () => {
  const r = await buscar(DUENA_FILA, "arandano", [LINEA, LINEA_AJENA]);
  assert.ok(!jids(r).includes("577@s.whatsapp.net"));
  const solo = await buscar(DUENA_FILA, "arandano", [LINEA_AJENA]);
  assert.deepEqual(jids(solo), []);
});

test("la consulta sin cuentas o sin lineas no devuelve nada", async () => {
  assert.deepEqual(await buscarEnLosMensajes({ texto: "precio", cuentas: [], lineas: [LINEA] }), []);
  assert.deepEqual(await buscarEnLosMensajes({ texto: "precio", cuentas: [DUENA], lineas: [] }), []);
});

test("un agente ve solo lo suyo (encontrado por su @lid, con la ficha guardada por el numero)", async () => {
  const duena = await buscar(DUENA_FILA, "arandano");
  assert.deepEqual(jids(duena), ["576@s.whatsapp.net", "99999@lid"]);
  const agente = await buscar(AGENTE_FILA, "arandano");
  assert.deepEqual(jids(agente), ["99999@lid"]);
});

test("el indice GIN se crea y queda valido", async () => {
  await asegurarElIndiceDeBusqueda();
  const filas = await db.$queryRaw`
    SELECT i.indisvalid AS valido FROM pg_class c JOIN pg_index i ON i.indexrelid = c.oid
    WHERE c.relname = ${NOMBRE_DEL_INDICE}`;
  assert.equal(filas.length, 1);
  assert.equal(filas[0].valido, true);
});
