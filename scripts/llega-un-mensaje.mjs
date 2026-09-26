/**
 * Un contacto escribe: el mensaje entrante que la bandeja tiene que sacar SIN
 * LEER. Es exactamente lo que hace el webhook en producción —una fila en
 * `chat_messages` y el último mensaje de la conversación—, sin tocar nada más:
 * ni contador del proveedor, ni aviso de tiempo real, ni IA.
 *
 * `JID` dice a qué conversación llega. Por defecto, la de Camilo. Si esa
 * conversación no existe todavía se CREA, que es el caso de un contacto que
 * escribe por primera vez —el que el mecanismo de antes descartaba a propósito
 * y por el que un chat nuevo nacía siempre leído—.
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const LINEA = "BANCO_VENTAS";
const JID = process.env.JID ?? "573001112255@s.whatsapp.net";
const TEXTO = process.env.TEXTO ?? "Oye, sigo esperando";
const ID = process.env.ID ?? `N${Date.now()}`;
const NOMBRE = process.env.NOMBRE ?? "Contacto Nuevo";

const dueno = await db.user.findUniqueOrThrow({ where: { email: "jefe@banco.test" } });
const cuando = new Date();
const raw = {
  key: { id: ID, remoteJid: JID, fromMe: false },
  message: { conversation: TEXTO },
  messageTimestamp: Math.floor(cuando.getTime() / 1000),
};

await db.chatMessage.create({
  data: {
    userId: dueno.id,
    instanceName: LINEA,
    instanceType: "waha",
    remoteJid: JID,
    messageId: ID,
    fromMe: false,
    pushName: NOMBRE,
    messageType: "conversation",
    content: TEXTO,
    raw,
    messageTimestamp: cuando,
  },
});

const ultimo = {
  lastMessageId: ID,
  lastMessageFromMe: false,
  lastMessageType: "conversation",
  lastMessageContent: TEXTO,
  lastMessageRaw: raw,
  lastMessageTimestamp: cuando,
};

const tocadas = await db.chatConversation.updateMany({
  where: { userId: dueno.id, instanceName: LINEA, remoteJid: JID },
  data: ultimo,
});

// Un contacto que escribe por PRIMERA vez: la conversación y su ficha nacen
// con él, igual que en producción.
if (tocadas.count === 0) {
  await db.chatConversation.create({
    data: {
      userId: dueno.id,
      instanceName: LINEA,
      instanceType: "waha",
      remoteJid: JID,
      pushName: NOMBRE,
      ...ultimo,
    },
  });
  await db.session.create({
    data: {
      userId: dueno.id,
      remoteJid: JID,
      pushName: NOMBRE,
      instanceId: "inst-banco-1",
      status: true,
    },
  });
}

console.log(JSON.stringify({ jid: JID, id: ID, nueva: tocadas.count === 0 }));
await db.$disconnect();
