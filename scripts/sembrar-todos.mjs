/**
 * Encima de `sembrar-barra.mjs`: tres conversaciones más en la MISMA línea,
 * cada una con su ficha en `Session`. Así «Todos» arranca en 4 y resolver una
 * tiene que dejarlo en 3 —con una sola conversación, bajar a 0 esconde la
 * insignia y no se sabría si bajó o si desapareció—.
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
        data: { userId: dueno.id, remoteJid: c.jid, pushName: c.nombre, instanceId: "inst-banco-1", status: true },
    });
    const id = `X${i}`;
    await db.chatMessage.create({
        data: {
            userId: dueno.id, instanceName: LINEA, instanceType: "waha", remoteJid: c.jid,
            messageId: id, fromMe: false, pushName: c.nombre, messageType: "conversation",
            content: "Hola", raw: { key: { id, remoteJid: c.jid, fromMe: false }, message: { conversation: "Hola" },
            messageTimestamp: Math.floor(cuando.getTime() / 1000) }, messageTimestamp: cuando,
        },
    });
    await db.chatConversation.create({
        data: {
            userId: dueno.id, instanceName: LINEA, instanceType: "waha", remoteJid: c.jid, pushName: c.nombre,
            lastMessageId: id, lastMessageFromMe: false, lastMessageType: "conversation", lastMessageContent: "Hola",
            lastMessageRaw: { key: { id, remoteJid: c.jid, fromMe: false }, message: { conversation: "Hola" } },
            lastMessageTimestamp: cuando,
        },
    });
}
console.log(JSON.stringify({ conversaciones: 1 + EXTRA.length }));
await db.$disconnect();
