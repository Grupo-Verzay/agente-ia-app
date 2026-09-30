/**
 * Los DATOS DE EJEMPLO de las capturas de la guía de Copiloto, encima de
 * `sembrar-barra.mjs` (que pone la cuenta, su línea y una conversación).
 *
 * Copiloto casi no tiene datos en la plataforma: lo que se ve dentro es el
 * copiloto de IA (LibreChat), y sus conversaciones las prepara el guion de
 * capturas en el copiloto LOCAL (`copiloto-de-la-guia/preparar.mjs`). Aquí va
 * lo que sí es de la plataforma:
 *
 * - El MARCO —cuenta de cliente, su menú, «Ver tutoriales» y «Soporte»—, el de
 *   todas las guías (`sembrar-marco-de-la-guia.mjs`).
 * - Ninguna integración: el copiloto empieza SIN fijar en Chats, así la
 *   captura enseña «Fijar en Chats» y no «Quitar de Chats».
 * - La conversación de Chats donde sale la pestaña del copiloto, con una
 *   clienta que pregunta por su cita: es de lo que habla la guía.
 *
 * Se puede correr las veces que haga falta: borra lo suyo y lo vuelve a
 * poner. El guion de capturas lo vuelve a correr antes del vídeo, porque las
 * capturas fijan y quitan el copiloto de Chats.
 */
import { PrismaClient } from "@prisma/client";
import { sembrarElMarco } from "./sembrar-marco-de-la-guia.mjs";

const db = new PrismaClient();

const dueno = await sembrarElMarco(db, {
    path: "/copiloto",
    title: "Guía de Copiloto",
    description: "Aprende a redactar mensajes y resolver dudas con IA en la plataforma",
    url: "/guia/copiloto",
});

// Sin integraciones: «Fijar en Chats» empieza sin fijar.
await db.userIntegration.deleteMany({ where: { userId: dueno.id } });

/*
 * La conversación de Chats: la misma línea y el mismo número que
 * `sembrar-barra.mjs`, con una clienta que pregunta por su cita de mañana.
 */
const LINEA = "BANCO_VENTAS";
const JID = "573001112233@s.whatsapp.net";
const NOMBRE = "Camila Andrade";

await db.session.updateMany({ where: { userId: dueno.id, remoteJid: JID }, data: { pushName: NOMBRE } });
await db.chatConversation.deleteMany({ where: { userId: dueno.id } });
await db.chatMessage.deleteMany({ where: { userId: dueno.id } });

const ahora = Date.now();
const mensajes = [
    { id: "C1", fromMe: false, content: "Hola, buenas tardes 👋" },
    { id: "C2", fromMe: false, content: "¿Me confirman la cita de mañana? No recuerdo la hora" },
    { id: "C3", fromMe: true, content: "¡Hola, Camila! Ya te confirmo" },
];
for (const [i, m] of mensajes.entries()) {
    const cuando = ahora - (mensajes.length - i) * 60000;
    await db.chatMessage.create({
        data: {
            userId: dueno.id,
            instanceName: LINEA,
            instanceType: "waha",
            remoteJid: JID,
            messageId: m.id,
            fromMe: m.fromMe,
            pushName: NOMBRE,
            messageType: "conversation",
            content: m.content,
            raw: {
                key: { id: m.id, remoteJid: JID, fromMe: m.fromMe },
                message: { conversation: m.content },
                messageTimestamp: Math.floor(cuando / 1000),
            },
            messageTimestamp: new Date(cuando),
        },
    });
}
const ultimo = mensajes.at(-1);
await db.chatConversation.create({
    data: {
        userId: dueno.id,
        instanceName: LINEA,
        instanceType: "waha",
        remoteJid: JID,
        pushName: NOMBRE,
        lastMessageId: ultimo.id,
        lastMessageFromMe: ultimo.fromMe,
        lastMessageType: "conversation",
        lastMessageContent: ultimo.content,
        lastMessageRaw: {
            key: { id: ultimo.id, remoteJid: JID, fromMe: ultimo.fromMe },
            message: { conversation: ultimo.content },
        },
        lastMessageTimestamp: new Date(ahora - 60000),
    },
});

console.log(JSON.stringify({ cuenta: dueno.id, linea: LINEA, jid: JID }));
await db.$disconnect();
