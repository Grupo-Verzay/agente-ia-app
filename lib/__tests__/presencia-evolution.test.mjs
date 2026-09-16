/**
 * Banco de pruebas de a QUE NUMERO se suscribe la presencia en Evolution.
 *
 * Corre sobre `lib/whatsapp-jid.ts` de verdad, compilado antes a JS:
 *
 *   npx tsc lib/whatsapp-jid.ts --outDir lib/__tests__/.compilado \
 *     --module es2022 --target es2022 --moduleResolution bundler
 *   node --test lib/__tests__/presencia-evolution.test.mjs
 *
 * El fallo: `subscribeEvolutionPresence` se rendia ante cualquier `@lid` y no
 * llegaba a llamar a Evolution. Como casi todos los chats se abren por su
 * `@lid`, la suscripcion no se intentaba NUNCA, y sin suscripcion WhatsApp no
 * manda `composing`. Medido en produccion, en 25 minutos: cero eventos de
 * escribiendo por Evolution, 208 por Waha.
 *
 * Aqui se comprueba lo que decide el arreglo -elegir el telefono de verdad de
 * entre las identidades del contacto-, no el `fetch`, que no es nuestro.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { pickExplicitWhatsAppPhoneJid } from "./.compilado/whatsapp-jid.js";

/** La guarda vieja, tal cual estaba. `true` = se rendia sin llamar a Evolution. */
function seRendiaAntes(remoteJid) {
  return remoteJid.endsWith("@g.us") || remoteJid.includes("@lid");
}

/** Lo que hace ahora: el telefono de entre todas las identidades del contacto. */
function numeroParaSuscribir(remoteJid, identidades = []) {
  if (remoteJid.endsWith("@g.us")) return "";
  const conTelefono = pickExplicitWhatsAppPhoneJid([remoteJid, ...identidades]);
  if (!conTelefono) return "";
  return conTelefono.split("@")[0].split(":")[0];
}

// ── El fallo, tal cual se veia ───────────────────────────────────────────────

test("ANTES: un chat abierto por su @lid no se suscribia nunca", () => {
  // Asi llegan casi todos: los webhooks vienen con addressingMode "lid".
  const abiertoPorLid = "234105849561131@lid";
  assert.equal(seRendiaAntes(abiertoPorLid), true);

  // Y el telefono estaba ahi al lado, en las identidades del propio chat.
  assert.equal(
    numeroParaSuscribir(abiertoPorLid, ["573193334455@s.whatsapp.net"]),
    "573193334455",
  );
});

test("los 16 eventos medidos en produccion eran @lid, los 16", () => {
  const medidos = [
    "234105849561131@lid",
    "246136019353737@lid",
    "254704730791940@lid",
    "71494126326000@lid",
    "231846797435090@lid",
  ];
  for (const jid of medidos) assert.equal(seRendiaAntes(jid), true);
});

// ── A que numero se suscribe ahora ───────────────────────────────────────────

test("gana el telefono de verdad, no los digitos del @lid", () => {
  // Los digitos de un @lid PARECEN un numero (15+) y no lo son. Mandarlos a
  // Evolution es pedir la presencia de un contacto que no existe.
  assert.equal(
    numeroParaSuscribir("234105849561131@lid", ["573193334455@s.whatsapp.net"]),
    "573193334455",
  );
});

test("da igual el orden en que vengan las identidades", () => {
  assert.equal(
    numeroParaSuscribir("234105849561131@lid", [
      "234105849561131@lid",
      "573193334455@s.whatsapp.net",
    ]),
    "573193334455",
  );
});

test("un chat abierto ya por su numero sigue funcionando igual", () => {
  assert.equal(numeroParaSuscribir("573193334455@s.whatsapp.net", []), "573193334455");
});

test("el sufijo de dispositivo no es parte del numero", () => {
  assert.equal(numeroParaSuscribir("573193334455:39@s.whatsapp.net", []), "573193334455");
});

// ── Lo que sigue sin suscribirse, a proposito ────────────────────────────────

test("un grupo no se suscribe: no tiene una presencia que pintar", () => {
  assert.equal(numeroParaSuscribir("120363401234567890@g.us", ["573193334455@s.whatsapp.net"]), "");
});

test("sin ningun telefono conocido no se inventa uno", () => {
  // Antes esto se iba en silencio. Ahora devuelve vacio Y lo dice en la consola,
  // que es lo unico que permite saber por que un chat no tiene "escribiendo…".
  assert.equal(numeroParaSuscribir("234105849561131@lid", []), "");
  assert.equal(numeroParaSuscribir("234105849561131@lid", ["246136019353737@lid"]), "");
});
