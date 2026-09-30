/**
 * El primer mensaje a un lead recién guardado en el CRM.
 *
 * Visto en producción el 2026-09-30 (línea MULTIGAMA, WhatsApp Mensajería):
 * «Crear contacto» guardaba el número TAL CUAL se tecleó, con el `+` dentro
 * (`+50760270754@s.whatsapp.net`), y el envío salía a Waha como
 * `+50760270754@c.us`. Waha no contesta a eso: el envío agotaba sus 15 s, en
 * pantalla salía «el servidor no contestó a tiempo» y al cliente no le llegaba
 * nada. A una conversación que empezó el lead no le pasaba: ese número lo pone
 * WhatsApp, limpio.
 *
 * El Waha de este banco se comporta como el de producción en lo que importa:
 * con un `chatId` que no es solo dígitos NO contesta; con uno limpio, sí; y
 * `check-exists` contesta con el número (`pn`) y el `@lid`, que es la forma
 * medida contra el servidor real.
 *
 * `MODO=roto` corre la MISMA cadena con `lib/waha.ts`, `lib/waha-jid.ts` y
 * `lib/whatsapp-jid.ts` de ANTES_REF y AFIRMA el fallo: el envío se cuelga.
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createRequire } from 'node:module';

const ROTO = process.env.MODO === 'roto';
const DIR = new URL('./.compilado/primer-mensaje/', import.meta.url);
const m = await import(new URL(ROTO ? 'antes/entrada-primer-mensaje.js' : 'entrada-primer-mensaje.js', DIR));
const r = ROTO ? null : await import(new URL('entrada-primer-mensaje-reglas.js', DIR));

/* ── El Waha de mentira ─────────────────────────────────────────────────── */

const peticiones = [];
const CONOCIDOS = {
  '50760270754': { numberExists: true, chatId: '201172006744296@lid', pn: '50760270754@c.us' },
  '50761112222': { numberExists: true, chatId: '201172006700001@lid', pn: '50761112222@c.us' },
  // Un móvil mexicano guardado con el 1 que ya no existe: WhatsApp dice cuál es.
  '5215512345678': { numberExists: true, chatId: '201172006700002@lid', pn: '525512345678@c.us' },
  '50769990000': { numberExists: false },
  '50762223333': { numberExists: true, chatId: '201172006700003@lid', pn: '50762223333@c.us' },
};
const LIMPIO = /^\d+@(c\.us|lid|g\.us)$/;

const servidor = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  let cuerpo = '';
  req.on('data', (c) => (cuerpo += c));
  req.on('end', () => {
    const json = cuerpo ? JSON.parse(cuerpo) : null;
    peticiones.push({ metodo: req.method, ruta: url.pathname, query: Object.fromEntries(url.searchParams), json });
    if (url.pathname === '/api/contacts/check-exists') {
      const tel = (url.searchParams.get('phone') ?? '').replace(/\D/g, '');
      if (tel === '50764445555') return; // se cuelga: la consulta no puede frenar el envío
      const fila = CONOCIDOS[tel] ?? { numberExists: true, chatId: `${tel}@c.us` };
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify(fila));
    }
    if (url.pathname === '/api/startTyping' || url.pathname === '/api/stopTyping') {
      res.writeHead(200);
      return res.end('{}');
    }
    if (url.pathname.startsWith('/api/send')) {
      // Como el Waha GOWS de producción: con un chatId que no reconoce, NO contesta.
      if (!LIMPIO.test(json?.chatId ?? '')) return;
      res.writeHead(201, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ id: `true_${json.chatId}_ABC${peticiones.length}` }));
    }
    res.writeHead(404);
    res.end('{}');
  });
});
await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok));
process.env.WAHA_FALSO = `http://127.0.0.1:${servidor.address().port}`;
after(() => {
  servidor.closeAllConnections();
  servidor.close();
});

const enviosA = (chatId) => peticiones.filter((p) => p.ruta.startsWith('/api/send') && p.json?.chatId === chatId);
const consultasDe = (tel) => peticiones.filter((p) => p.ruta === '/api/contacts/check-exists' && p.query.phone === tel);

/* ── La cadena de verdad: el lead como lo guardaba «Crear contacto» ──────── */

test('un lead guardado con el + tecleado: el primer mensaje LLEGA, y en segundos', { timeout: 40_000 }, async () => {
  // Así quedó en producción la ficha que se guardó a mano.
  const comoSeGuardo = '+50760270754@s.whatsapp.net';
  const chatId = m.canonicalToWahaJid(comoSeGuardo);
  const empezo = Date.now();
  const envio = await m.sendWahaText({ session: 'MULTIGAMA', chatId, text: 'Hola, te escribimos de la tienda' });
  const tardo = Date.now() - empezo;

  if (ROTO) {
    assert.equal(chatId, '+50760270754@c.us', 'el + llegaba al servidor');
    assert.equal(envio.ok, false);
    assert.match(envio.message, /no contestó a tiempo/);
    assert.ok(tardo >= 14_000, `se colgaba hasta agotar el plazo (tardó ${tardo} ms)`);
    return;
  }
  assert.equal(chatId, '50760270754@c.us');
  assert.equal(envio.ok, true, envio.message);
  assert.ok(tardo < 5_000, `tardó ${tardo} ms`);
  assert.equal(enviosA('50760270754@c.us').length, 1, 'salió al NÚMERO limpio');
  assert.equal(consultasDe('50760270754').length, 1, 'se confirmó el destinatario con WhatsApp');
});

test('con espacios y guiones también', { timeout: 40_000, skip: ROTO }, async () => {
  const chatId = m.canonicalToWahaJid('+507 6111-2222@s.whatsapp.net');
  assert.equal(chatId, '50761112222@c.us');
  const envio = await m.sendWahaText({ session: 'MULTIGAMA', chatId, text: 'hola' });
  assert.equal(envio.ok, true, envio.message);
});

test('la ficha se GUARDA limpia: el servidor limpia lo que llegue tecleado', () => {
  const guardado = m.resolvePreferredRemoteJid(['+507 6027-0754@s.whatsapp.net']);
  if (ROTO) {
    assert.equal(guardado, '+507 6027-0754@s.whatsapp.net', 'antes se guardaba tal cual');
    return;
  }
  assert.equal(guardado, '50760270754@s.whatsapp.net');
});

test('las fichas ya guardadas con el + se siguen encontrando', { skip: ROTO }, () => {
  const candidatos = m.buildWhatsAppJidCandidates('+50760270754@s.whatsapp.net');
  assert.ok(candidatos.includes('50760270754@s.whatsapp.net'), 'la forma limpia');
  assert.ok(candidatos.includes('+50760270754@s.whatsapp.net'), 'y la literal, para la ficha vieja');
});

/* ── Confirmar el destinatario: la hermana de `resolveWhatsAppJid` ───────── */

test('WhatsApp dice a qué número entregar: se manda ahí (el móvil mexicano sin el 1)', { skip: ROTO, timeout: 20_000 }, async () => {
  const envio = await m.sendWahaText({ session: 'L', chatId: '5215512345678@c.us', text: 'hola' });
  assert.equal(envio.ok, true, envio.message);
  assert.equal(enviosA('525512345678@c.us').length, 1);
  assert.equal(enviosA('5215512345678@c.us').length, 0);
});

test('un número sin WhatsApp se DICE al momento, sin colgarse ni enviar', { skip: ROTO, timeout: 20_000 }, async () => {
  const empezo = Date.now();
  const envio = await m.sendWahaText({ session: 'L', chatId: '50769990000@c.us', text: 'hola' });
  assert.equal(envio.ok, false);
  assert.match(envio.message, /no tiene WhatsApp/);
  assert.match(envio.message, /\+50769990000/);
  assert.ok(Date.now() - empezo < 3_000);
  assert.equal(enviosA('50769990000@c.us').length, 0, 'no se intentó enviar');
});

test('si la consulta se cuelga, se envía igual con lo que había (no bloquea)', { skip: ROTO, timeout: 30_000 }, async () => {
  const envio = await m.sendWahaText({ session: 'L', chatId: '50764445555@c.us', text: 'hola' });
  assert.equal(envio.ok, true, envio.message);
  assert.equal(enviosA('50764445555@c.us').length, 1);
});

test('se pregunta UNA vez por contacto, no en cada mensaje', { skip: ROTO, timeout: 20_000 }, async () => {
  await m.sendWahaText({ session: 'L', chatId: '50762223333@c.us', text: 'uno' });
  await m.sendWahaText({ session: 'L', chatId: '50762223333@c.us', text: 'dos' });
  assert.equal(consultasDe('50762223333').length, 1);
  assert.equal(enviosA('50762223333@c.us').length, 2);
});

test('un adjunto confirma igual que un texto (simetría)', { skip: ROTO, timeout: 30_000 }, async () => {
  const envio = await m.sendWahaMedia({
    session: 'L',
    chatId: m.canonicalToWahaJid('+52 1 55 1234 5678@s.whatsapp.net'),
    mediatype: 'image',
    mediaUrl: 'https://ejemplo.com/foto.jpg',
  });
  assert.equal(envio.ok, true, envio.message);
  assert.equal(enviosA('525512345678@c.us').filter((p) => p.ruta === '/api/sendImage').length, 1);
});

test('un @lid y un grupo no se consultan: ya son la forma que Waha entiende', { skip: ROTO, timeout: 20_000 }, async () => {
  const antes = peticiones.filter((p) => p.ruta === '/api/contacts/check-exists').length;
  assert.equal((await m.sendWahaText({ session: 'L', chatId: '201172006744296@lid', text: 'x' })).ok, true);
  assert.equal((await m.sendWahaText({ session: 'L', chatId: '120363000000000000@g.us', text: 'x' })).ok, true);
  assert.equal(peticiones.filter((p) => p.ruta === '/api/contacts/check-exists').length, antes);
});

/* ── Las reglas puras ───────────────────────────────────────────────────── */

test('sinFormatoDeTelefono: solo toca un teléfono', { skip: ROTO }, () => {
  const f = r.sinFormatoDeTelefono;
  assert.equal(f('+57 300 123-4567@s.whatsapp.net'), '573001234567@s.whatsapp.net');
  assert.equal(f('+507 (6027) 0754@c.us'), '50760270754@c.us');
  assert.equal(f('+57 300 123 4567'), '573001234567');
  assert.equal(f('573001234567@s.whatsapp.net'), '573001234567@s.whatsapp.net');
  assert.equal(f('201172006744296@lid'), '201172006744296@lid');
  assert.equal(f('120363000000000000@g.us'), '120363000000000000@g.us');
  assert.equal(f('status@broadcast'), 'status@broadcast');
  assert.equal(f('hola mundo'), 'hola mundo');
  assert.equal(f(''), '');
  assert.equal(f(null), '');
});

test('jidDelTelefonoTecleado: las dos pantallas de crear un lead', { skip: ROTO }, () => {
  const j = r.jidDelTelefonoTecleado;
  assert.equal(j('+507 6027-0754'), '50760270754@s.whatsapp.net');
  assert.equal(j(' 57 300 123 4567 '), '573001234567@s.whatsapp.net');
  assert.equal(j('1234567'), null, `menos de ${r.DIGITOS_MINIMOS_DE_UN_TELEFONO} dígitos no es un teléfono`);
  assert.equal(j(''), null);
});

test('elDestinoDeLaRespuesta: el número manda, y lo que no se entiende no bloquea', { skip: ROTO }, () => {
  const d = r.elDestinoDeLaRespuesta;
  assert.deepEqual(d({ numberExists: true, chatId: '1@lid', pn: '507@c.us' }), { tipo: 'confirmado', chatId: '507@c.us' });
  assert.deepEqual(d({ numberExists: true, chatId: '507@c.us' }), { tipo: 'confirmado', chatId: '507@c.us' });
  assert.deepEqual(d({ numberExists: true, chatId: '1@lid' }), { tipo: 'confirmado', chatId: '1@lid' });
  assert.deepEqual(d({ numberExists: false }), { tipo: 'sin_whatsapp' });
  assert.deepEqual(d(null), { tipo: 'sin_respuesta' });
  assert.deepEqual(d({ numberExists: 'quizá' }), { tipo: 'sin_respuesta' });
  assert.deepEqual(d({ numberExists: true }), { tipo: 'sin_respuesta' });
});

/* ── Barrido: las dos pantallas de crear un lead usan la misma regla ─────── */

test('barrido: «Crear contacto» y el formulario de lead no pegan el sufijo a lo tecleado', () => {
  const require = createRequire(import.meta.url);
  const fs = require('node:fs');
  const { execSync } = require('node:child_process');
  const leer = (f) =>
    ROTO ? execSync(`git show ${process.env.ANTES_REF}:"${f}"`, { encoding: 'utf8' }) : fs.readFileSync(f, 'utf8');
  const dialogo = leer('app/(root)/sessions/_components/CreateContactDialog.tsx');
  const formulario = leer('app/(root)/sessions/_components/LeadCreateForm.tsx');
  if (ROTO) {
    assert.match(dialogo, /\$\{phone\.trim\(\)\}@s\.whatsapp\.net/, 'antes se pegaba el sufijo a lo tecleado');
    return;
  }
  for (const [nombre, src] of [['CreateContactDialog', dialogo], ['LeadCreateForm', formulario]]) {
    assert.match(src, /jidDelTelefonoTecleado\(/, `${nombre} usa la regla común`);
    assert.doesNotMatch(src, /@s\.whatsapp\.net`/, `${nombre} no arma el JID a mano`);
  }
});
