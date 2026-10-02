// La regla de las reacciones (lib/reacciones-del-chat.ts), sin base, y un
// barrido de que la App la usa donde hace falta. Ver
// scripts/banco-reaccion-entrante.sh.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const ROTO = process.env.MODO === 'roto';
const ANTES = process.env.ANTES_REF ?? '83159ac';
const leer = (p) => (ROTO ? execSync(`git show "${ANTES}:${p}"`, { encoding: 'utf8' }) : readFileSync(p, 'utf8'));

const R = ROTO ? null : await import('./.compilado/reaccion/reacciones-del-chat.js');

const reaccion = (id, text, ts) => ({
  key: { id: `R-${Math.random()}` },
  messageType: 'reactionMessage',
  messageTimestamp: ts,
  message: { reactionMessage: { key: { id }, text } },
});

test('la regla: la ULTIMA reaccion por hora vale para cada mensaje', { skip: ROTO }, () => {
  const r = R.lasReaccionesQueTrae([
    { key: { id: 'A' }, message: { conversation: 'hola' } },
    reaccion('A', '👍', 100),
    reaccion('A', '❤️', 200),
    reaccion('B', '😂', 150),
    reaccion('B', '', 160),
  ]);
  assert.deepEqual(
    r.sort((x, y) => x.idDelMensaje.localeCompare(y.idDelMensaje)),
    [
      { idDelMensaje: 'A', emoji: '❤️' },
      { idDelMensaje: 'B', emoji: '' },
    ],
  );
});

test('la regla: el chat abierto ve una reaccion que cambio en un mensaje de en medio', { skip: ROTO }, () => {
  const a = [{ key: { id: 'A' } }, { key: { id: 'B' } }];
  const b = [{ key: { id: 'A' }, reaccion: '🙏' }, { key: { id: 'B' } }];
  assert.equal(R.cambioAlgunaReaccion(a, b), true);
  assert.equal(R.cambioAlgunaReaccion(b, b), false);
  assert.equal(R.cambioAlgunaReaccion(b, a), true, 'quitarla tambien es un cambio');
});

test('barrido: Waha se suscribe a message.reaction', () => {
  const src = leer('lib/waha.ts');
  const lista = src.slice(src.indexOf('export const EVENTOS_DEL_WEBHOOK'), src.indexOf('] as const'));
  if (ROTO) assert.ok(!lista.includes("'message.reaction'"), 'antes no se pedia el evento');
  else assert.ok(lista.includes("'message.reaction'"));
});

test('barrido: areListsDifferent pregunta por las reacciones', () => {
  const src = leer('app/(root)/chats/_components/chats-client.tsx');
  const f = src.slice(src.indexOf('function areListsDifferent'), src.indexOf('type ApiKeyData'));
  if (ROTO) assert.ok(!f.includes('cambioAlgunaReaccion'), 'antes una reaccion se tiraba por «igual»');
  else assert.ok(f.includes('cambioAlgunaReaccion'));
});
