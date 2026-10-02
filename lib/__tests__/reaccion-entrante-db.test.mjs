// Las reacciones que trae el sondeo de Evolution quedan colgadas de su mensaje
// (raw.reaccion), contra Postgres. En MODO=roto corre el chat-persistence de
// ANTES y afirma que se tiraban. Ver scripts/banco-reaccion-entrante.sh.
import test from 'node:test';
import assert from 'node:assert/strict';

const ROTO = process.env.MODO === 'roto';
const E = await import(`./.compilado/reaccion/${ROTO ? 'entrada-de-la-reaccion-antes' : 'entrada-de-la-reaccion'}.js`);
const { db, persistEvolutionMessages } = E;

const SELLO = Date.now().toString(36).toUpperCase();
const CUENTA = `cuenta-reac-${SELLO}`;
const LINEA = `LINEA_${SELLO}`;
const JID = '573001112233@s.whatsapp.net';

async function sembrar(id) {
  await db.$executeRawUnsafe(
    `INSERT INTO "chat_messages" ("userId","instanceName","remoteJid","messageId","fromMe","messageType","content","raw","messageTimestamp","createdAt","updatedAt")
     VALUES ($1,$2,$3,$4,true,'conversation','Hola',$5::jsonb,NOW(),NOW(),NOW())`,
    CUENTA, LINEA, JID, id, JSON.stringify({ key: { id, fromMe: true, remoteJid: JID }, message: { conversation: 'Hola' } }),
  );
}
async function laReaccion(id) {
  const r = await db.$queryRawUnsafe(
    `SELECT "raw"->>'reaccion' AS r FROM "chat_messages" WHERE "userId"=$1 AND "instanceName"=$2 AND "messageId"=$3`,
    CUENTA, LINEA, id,
  );
  return r[0]?.r ?? null;
}
async function cuantas() {
  const r = await db.$queryRawUnsafe(`SELECT COUNT(*)::int AS n FROM "chat_messages" WHERE "userId"=$1`, CUENTA);
  return r[0].n;
}
const reaccion = (id, text, ts) => ({
  key: { id: `REAC-${Math.random().toString(36).slice(2)}`, fromMe: false, remoteJid: JID },
  messageType: 'reactionMessage',
  messageTimestamp: ts,
  message: { reactionMessage: { key: { id, fromMe: true, remoteJid: JID }, text } },
});

test.after(() => db.$disconnect());

test('el sondeo trae la reaccion del cliente y queda en su mensaje, sin fila nueva', async () => {
  const id = `MSG-${SELLO}-1`;
  await sembrar(id);
  const antes = await cuantas();
  await persistEvolutionMessages({ userId: CUENTA, instanceName: LINEA, remoteJid: JID, messages: [reaccion(id, '❤️', 1790000000)] });
  const r = await laReaccion(id);
  if (ROTO) {
    assert.equal(r, null, 'antes la reaccion se tiraba');
    return;
  }
  assert.equal(r, '❤️');
  assert.equal(await cuantas(), antes, 'una reaccion no es una fila');
});

test('cambiar y quitar: vale la ultima por hora', { skip: ROTO }, async () => {
  const id = `MSG-${SELLO}-2`;
  await sembrar(id);
  await persistEvolutionMessages({
    userId: CUENTA, instanceName: LINEA, remoteJid: JID,
    messages: [reaccion(id, '😂', 1790000200), reaccion(id, '👍', 1790000100)],
  });
  assert.equal(await laReaccion(id), '😂');
  await persistEvolutionMessages({ userId: CUENTA, instanceName: LINEA, remoteJid: JID, messages: [reaccion(id, '', 1790000300)] });
  assert.equal(await laReaccion(id), null);
});

test('una reaccion a un mensaje que no tenemos no rompe ni crea nada', { skip: ROTO }, async () => {
  const antes = await cuantas();
  await persistEvolutionMessages({ userId: CUENTA, instanceName: LINEA, remoteJid: JID, messages: [reaccion(`NO-${SELLO}`, '🔥', 1790000400)] });
  assert.equal(await cuantas(), antes);
});
