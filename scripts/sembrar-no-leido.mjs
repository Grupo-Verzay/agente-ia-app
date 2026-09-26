/**
 * Encima de `sembrar-barra.mjs`: la bandeja tal como estaba ANTES de entrar.
 *
 * Tres conversaciones en la MISMA línea, todas con el último mensaje **del
 * contacto** y la línea de tipo `waha`, que es el caso de producción: ahí la
 * lista sale de nuestra base y `unreadCount` vale 0 siempre para WhatsApp.
 *
 * Con esto la primera entrada siembra el corte y las tres salen LEÍDAS —lo que
 * ya estaba no se pone en rojo—; el mensaje que llega después
 * (`scripts/llega-un-mensaje.mjs`) es el que tiene que salir sin leer.
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const LINEA = "BANCO_VENTAS";

const dueno = await db.user.findUniqueOrThrow({ where: { email: "jefe@banco.test" } });

const EXTRA = [
  { jid: "573001112244@s.whatsapp.net", nombre: "Beatriz Cliente" },
  { jid: "573001112255@s.whatsapp.net", nombre: "Camilo Cliente" },
  { jid: "573001112266@s.whatsapp.net", nombre: "Diana Cliente" },
];

const ahora = Date.now();
for (const [i, c] of EXTRA.entries()) {
  const cuando = new Date(ahora - (i + 5) * 60000);
  await db.session.create({
    data: {
      userId: dueno.id,
      remoteJid: c.jid,
      pushName: c.nombre,
      instanceId: "inst-banco-1",
      status: true,
    },
  });
  const id = `X${i}`;
  const raw = {
    key: { id, remoteJid: c.jid, fromMe: false },
    message: { conversation: "Hola" },
    messageTimestamp: Math.floor(cuando.getTime() / 1000),
  };
  await db.chatMessage.create({
    data: {
      userId: dueno.id,
      instanceName: LINEA,
      instanceType: "waha",
      remoteJid: c.jid,
      messageId: id,
      fromMe: false,
      pushName: c.nombre,
      messageType: "conversation",
      content: "Hola",
      raw,
      messageTimestamp: cuando,
    },
  });
  await db.chatConversation.create({
    data: {
      userId: dueno.id,
      instanceName: LINEA,
      instanceType: "waha",
      remoteJid: c.jid,
      pushName: c.nombre,
      lastMessageId: id,
      lastMessageFromMe: false,
      lastMessageType: "conversation",
      lastMessageContent: "Hola",
      lastMessageRaw: raw,
      lastMessageTimestamp: cuando,
    },
  });
}

console.log(JSON.stringify({ conversaciones: 1 + EXTRA.length }));
await db.$disconnect();
