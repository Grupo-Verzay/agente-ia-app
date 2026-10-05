/**
 * El banco de las archivadas y resueltas que vuelven a la bandeja.
 *
 * Dos fallos, que son el mismo al reves:
 *
 * 1. Una RESUELTA se reabria sola a los tres o cuatro dias: la regla la
 *    devolvia con cualquier mensaje posterior a la marca, tambien un SALIENTE
 *    (un seguimiento, un recordatorio, la IA).
 * 2. Una ARCHIVADA no salia nunca: nada quitaba `archivedAt` cuando el
 *    contacto escribia.
 *
 * La regla: solo un mensaje DEL CONTACTO posterior a la marca la levanta, y se
 * LEVANTA (se borra la marca) en vez de evaluarse al pintar, para que la
 * respuesta de la IA segundos despues no la vuelva a esconder.
 *
 * Contra Postgres de usar y tirar, con el barrido de produccion. `MODO=roto`
 * corre la regla de `9c0e76d` (escrita aqui literal, y el script comprueba que
 * es la de ese commit) y AFIRMA los dos fallos.
 *
 * Como se levanta: `scripts/banco-reapertura.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  laMarcaSeLevanta,
  levantarArchivosYResueltas,
  estaResuelta,
  marcarSesionResuelta,
  ensureResolvedAtColumn,
  db,
} from "./.compilado/reapertura/entrada-de-reapertura.js";

const ROTO = process.env.MODO === "roto";
const V = `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const LINEA = `LINEA_${V}`;
const CUENTA = `cuenta-${V}`;
const HORA = 3600 * 1000;
const DIA = 24 * HORA;

// --- La regla de 9c0e76d, literal. -----------------------------------------
const estaResueltaDeAntes = (ultimoMs, resueltaMs) => (resueltaMs ? ultimoMs <= resueltaMs : false);
// En 9c0e76d nada sacaba del archivo: no habia barrido.
const barridoDeAntes = async () => {};

const resuelta = ROTO ? (ts, marca) => estaResueltaDeAntes(ts, marca) : estaResuelta;
const barrer = ROTO ? barridoDeAntes : (ids) => levantarArchivosYResueltas(ids, { forzar: true });

let n = 0;
const jid = () => `57300${V.length}${String(++n).padStart(6, "0")}@s.whatsapp.net`;

async function mensaje(remoteJid, fromMe, cuando, extra = {}) {
  await db.chatMessage.create({
    data: {
      userId: CUENTA,
      instanceName: LINEA,
      remoteJid,
      messageId: `${V}-${++n}`,
      fromMe,
      messageTimestamp: new Date(cuando),
      content: fromMe ? "seguimiento automatico" : "hola, sigo interesado",
      ...extra,
    },
  });
}

async function archivar(remoteJid, cuando, instanceName = LINEA) {
  await db.chatConversationPreference.create({
    data: { userId: CUENTA, instanceName, remoteJid, archivedAt: new Date(cuando) },
  });
}
const archivada = async (remoteJid) =>
  (await db.chatConversationPreference.findMany({ where: { userId: CUENTA, remoteJid } })).some((p) => p.archivedAt);

async function sesionResuelta(remoteJid, cuando) {
  const s = await db.session.create({
    data: { userId: CUENTA, remoteJid, pushName: "Cliente", instanceId: LINEA, status: true },
  });
  await ensureResolvedAtColumn();
  await db.$executeRaw`UPDATE "Session" SET resolved_at = ${new Date(cuando)} WHERE id = ${s.id}`;
  return s.id;
}
const resueltaEnBase = async (id) =>
  (await db.$queryRaw`SELECT resolved_at FROM "Session" WHERE id = ${id}`)[0]?.resolved_at ?? null;

test.before(async () => {
  await db.user.create({ data: { id: CUENTA, email: `${V}@banco.test` } });
});
test.after(async () => {
  await db.$disconnect();
});

// --- La regla pura (vale en los dos modos: es de hoy). ----------------------
test("regla: un mensaje del contacto posterior levanta la marca; un saliente no", { skip: ROTO }, () => {
  const marca = new Date("2026-10-01T10:00:00Z");
  assert.equal(laMarcaSeLevanta(marca, { ts: marca.getTime() + 1000, fromMe: false }), true);
  assert.equal(laMarcaSeLevanta(marca, { ts: Math.floor(marca.getTime() / 1000) + 60, fromMe: false }), true, "en segundos tambien");
  assert.equal(laMarcaSeLevanta(marca, { ts: marca.getTime() + 4 * DIA, fromMe: true }), false, "un saliente no");
  assert.equal(laMarcaSeLevanta(marca, { ts: marca.getTime() + 1000, fromMe: undefined }), false, "sin prueba no levanta");
  assert.equal(laMarcaSeLevanta(marca, { ts: marca.getTime() - 1000, fromMe: false }), false, "anterior no");
  assert.equal(laMarcaSeLevanta(null, { ts: Date.now(), fromMe: false }), false, "sin marca no hay nada");
});

// --- Fallo 1: la resuelta que se reabria sola. -------------------------------
test("fallo 1: un SALIENTE dias despues no reabre una resuelta", async () => {
  const marca = Date.now() - 4 * DIA;
  const ultimo = marca + 3 * DIA; // el seguimiento de los tres dias
  const sigue = resuelta(ultimo, marca, false);
  if (ROTO) {
    assert.equal(sigue, false, "ANTES: el seguimiento la sacaba de Resueltas sin que el cliente dijera nada");
    return;
  }
  assert.equal(sigue, true);

  const c = jid();
  const id = await sesionResuelta(c, marca);
  await mensaje(c, true, ultimo);
  await barrer([CUENTA]);
  assert.notEqual(await resueltaEnBase(id), null, "el barrido no quita la marca por un saliente");
});

test("fallo 1: el CONTACTO escribe y la resuelta vuelve, y la IA despues no la esconde", async () => {
  const marca = Date.now() - 2 * DIA;
  const c = jid();
  const id = await sesionResuelta(c, marca);
  await mensaje(c, false, marca + HORA);
  await mensaje(c, true, marca + HORA + 5000); // la IA contesta
  await barrer([CUENTA]);
  if (ROTO) {
    // Antes la marca no se quitaba: con la respuesta de la IA como ultimo
    // mensaje, la regla de antes la daba por NO resuelta solo porque era
    // posterior; aqui lo que se afirma es que la marca seguia escrita.
    assert.notEqual(await resueltaEnBase(id), null, "ANTES: la marca no se levantaba nunca en la base");
    return;
  }
  assert.equal(await resueltaEnBase(id), null, "la marca se levanta");
  assert.equal(estaResuelta(marca + HORA + 5000, null, false), false, "sin marca, la IA no la vuelve a esconder");
});

test("fallo 1: el contacto escribe bajo otra identidad (remoteJidAlt) y tambien vuelve", { skip: ROTO }, async () => {
  const marca = Date.now() - DIA;
  const numero = jid();
  const lid = `${V}${n}@lid`;
  const id = await sesionResuelta(numero, marca);
  await mensaje(lid, false, marca + HORA, { remoteJidAlt: numero });
  await barrer([CUENTA]);
  assert.equal(await resueltaEnBase(id), null);
});

// --- Fallo 2: la archivada que no salia. -------------------------------------
test("fallo 2: el contacto escribe y la archivada sale del archivo", async () => {
  const marca = Date.now() - 3 * DIA;
  const c = jid();
  await archivar(c, marca);
  await mensaje(c, false, marca + DIA);
  await barrer([CUENTA]);
  if (ROTO) {
    assert.equal(await archivada(c), true, "ANTES: seguia archivada aunque el cliente escribio");
    return;
  }
  assert.equal(await archivada(c), false);
});

test("fallo 2: una marca antigua sin linea tambien sale", { skip: ROTO }, async () => {
  const marca = Date.now() - 3 * DIA;
  const c = jid();
  await archivar(c, marca, "");
  await mensaje(c, false, marca + DIA);
  await barrer([CUENTA]);
  assert.equal(await archivada(c), false);
});

test("lo que no se puede haber aflojado: un saliente o un mensaje anterior no desarchivan", { skip: ROTO }, async () => {
  const marca = Date.now() - 3 * DIA;
  const a = jid();
  await archivar(a, marca);
  await mensaje(a, true, marca + DIA);
  const b = jid();
  await archivar(b, marca);
  await mensaje(b, false, marca - DIA);
  // Otra linea: un mensaje del contacto ahi no saca del archivo esta.
  const c = jid();
  await archivar(c, marca);
  await db.chatMessage.create({
    data: { userId: CUENTA, instanceName: `OTRA_${V}`, remoteJid: c, messageId: `${V}-otra`, fromMe: false, messageTimestamp: new Date(marca + DIA) },
  });
  await barrer([CUENTA]);
  assert.equal(await archivada(a), true, "un saliente no");
  assert.equal(await archivada(b), true, "un mensaje anterior no");
  assert.equal(await archivada(c), true, "otra linea no");
});
