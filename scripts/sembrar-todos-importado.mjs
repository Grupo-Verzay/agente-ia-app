/**
 * Encima de `sembrar-barra.mjs`: lo que deja un historial IMPORTADO, en dos
 * lineas. Es el caso del reporte («el cliente importó historial y ahí falla»):
 * el numero de «Todos» contaba FICHAS (`Session`) y la lista enseña
 * conversaciones, y el historial importado deja las dos a medias.
 *
 * BANCO_VENTAS (fichas guardadas con el NOMBRE de la linea, que es como las
 * escribe el backend —`registerSession`—):
 *   - 3 conversaciones normales con su ficha;
 *   - 2 guardadas por el @lid, la ficha por el numero y ARCHIVADAS bajo el @lid;
 *   - 2 fichas cuya conversacion es solo una reaccion (la lista no la enseña);
 *   - 1 contacto con el sufijo de dispositivo: dos fichas, un contacto;
 *   - 1 conversacion cuyo ultimo mensaje es del asesor, sin ficha.
 * BANCO_SOPORTE (otra linea, con las fichas guardadas por el ID de la linea):
 *   - 3 conversaciones con ficha, una de un contacto que tambien esta en Ventas.
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const VENTAS = "BANCO_VENTAS";
const SOPORTE = "BANCO_SOPORTE";
const dueno = await db.user.findUniqueOrThrow({ where: { email: "jefe@banco.test" } });

await db.instancia.create({
  data: { instanceName: SOPORTE, displayName: "Soporte", userId: dueno.id, instanceId: "inst-banco-2", instanceType: "waha" },
});

const ahora = Date.now();
let min = 10;
async function conversacion(linea, jid, { alt = null, fromMe = false, tipo = "conversation", nombre = "Cliente" } = {}) {
  const cuando = new Date(ahora - (min += 3) * 60000);
  const id = `I${min}`;
  await db.chatConversation.create({
    data: {
      userId: dueno.id, instanceName: linea, instanceType: "waha", remoteJid: jid, remoteJidAlt: alt, pushName: nombre,
      lastMessageId: id, lastMessageFromMe: fromMe, lastMessageType: tipo, lastMessageContent: "Hola",
      lastMessageRaw: { key: { id, remoteJid: jid, fromMe }, message: { conversation: "Hola" } },
      lastMessageTimestamp: cuando,
    },
  });
}
async function ficha(jid, instanceId = VENTAS, nombre = "Cliente") {
  await db.session.create({ data: { userId: dueno.id, remoteJid: jid, pushName: nombre, instanceId, status: true } });
}

for (let i = 0; i < 3; i++) {
  const jid = `57300222000${i}@s.whatsapp.net`;
  await conversacion(VENTAS, jid, { nombre: `Normal ${i}` });
  await ficha(jid, VENTAS, `Normal ${i}`);
}
for (let i = 0; i < 2; i++) {
  const num = `57300333000${i}@s.whatsapp.net`;
  const lid = `8800333000${i}@lid`;
  await conversacion(VENTAS, lid, { alt: num, nombre: `Archivada ${i}` });
  await ficha(num);
  await db.chatConversationPreference.create({
    data: { userId: dueno.id, instanceName: VENTAS, remoteJid: lid, archivedAt: new Date(ahora - 60000) },
  });
}
for (let i = 0; i < 2; i++) {
  const jid = `57300444000${i}@s.whatsapp.net`;
  await conversacion(VENTAS, jid, { tipo: "reactionMessage" });
  await ficha(jid);
}
await ficha("573005550000@s.whatsapp.net", VENTAS, "Sufijo");
await ficha("573005550000:39@s.whatsapp.net", VENTAS, "Sufijo");
await conversacion(VENTAS, "573006660000@s.whatsapp.net", { fromMe: true, nombre: "Solo asesor" });

for (let i = 0; i < 3; i++) {
  const jid = i === 0 ? "573002220000@s.whatsapp.net" : `57300777000${i}@s.whatsapp.net`;
  await conversacion(SOPORTE, jid, { nombre: `Soporte ${i}` });
  await ficha(jid, "inst-banco-2", `Soporte ${i}`);
}
console.log("sembrado");
await db.$disconnect();
