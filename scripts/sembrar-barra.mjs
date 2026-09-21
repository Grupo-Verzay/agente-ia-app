/**
 * Lo mínimo para que las DOS barras de escribir se puedan abrir en Chromium.
 *
 * Una cuenta con su equipo, los dos módulos que dan las dos pantallas, y una
 * conversación de verdad en la bandeja — sin ella `/chats` abre sin
 * conversación y la barra de Chats no se pinta, así que la comparación
 * quedaría a medias y el banco diría que todo va bien habiendo medido una
 * sola barra. Eso ya pasó una vez.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

const CLAVE = "banco1234";
const LINEA = "BANCO_VENTAS";
const JID = "573001112233@s.whatsapp.net";

const pass = await bcrypt.hash(CLAVE, 10);

const dueno = await db.user.upsert({
    where: { email: "jefe@banco.test" },
    update: {},
    create: {
        email: "jefe@banco.test",
        name: "Carlos Jefe",
        password: pass,
        role: "admin",
        status: true,
        company: "Banco de la Barra",
    },
});

await db.user.upsert({
    where: { email: "sofia@banco.test" },
    update: {},
    create: {
        email: "sofia@banco.test",
        name: "Sofia Equipo",
        password: pass,
        role: "user",
        status: true,
        ownerId: dueno.id,
        advisorRole: "administrador",
    },
});

/*
 * Sin ni un módulo, el layout devuelve `AppSkeleton` y NINGUNA pantalla se
 * pinta: la medida se quedaría midiendo un esqueleto.
 */
if ((await db.module.count()) === 0) {
    await db.module.create({
        data: {
            label: "Chats",
            route: "/chats",
            icon: "MessageCircle",
            order: 1,
            moduleItems: { create: [{ title: "Chats", url: "/chats" }] },
        },
    });
    await db.module.create({
        data: {
            label: "Equipo",
            route: "/chat-equipo",
            icon: "Users",
            order: 2,
            moduleItems: { create: [{ title: "Chat de equipo", url: "/chat-equipo" }] },
        },
    });
}

await db.instancia.deleteMany({ where: { userId: dueno.id } });
await db.instancia.create({
    data: {
        instanceName: LINEA,
        displayName: "Ventas",
        userId: dueno.id,
        instanceId: "inst-banco-1",
        instanceType: "waha",
    },
});

await db.session.deleteMany({ where: { userId: dueno.id } });
await db.session.create({
    data: {
        userId: dueno.id,
        remoteJid: JID,
        pushName: "Alexis Cliente",
        instanceId: "inst-banco-1",
        status: true,
    },
});

await db.chatConversation.deleteMany({ where: { userId: dueno.id } });
await db.chatMessage.deleteMany({ where: { userId: dueno.id } });

const ahora = Date.now();
const mensajes = [
    { id: "M1", fromMe: false, content: "Hola, quiero informacion de los planes" },
    { id: "M2", fromMe: true, content: "Claro que si, te cuento" },
    { id: "M3", fromMe: false, content: "Perfecto, gracias" },
];

for (const [i, m] of mensajes.entries()) {
    const cuando = ahora - (3 - i) * 60000;
    await db.chatMessage.create({
        data: {
            userId: dueno.id,
            instanceName: LINEA,
            instanceType: "waha",
            remoteJid: JID,
            messageId: m.id,
            fromMe: m.fromMe,
            pushName: "Alexis Cliente",
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

const ultimo = mensajes[mensajes.length - 1];
await db.chatConversation.create({
    data: {
        userId: dueno.id,
        instanceName: LINEA,
        instanceType: "waha",
        remoteJid: JID,
        pushName: "Alexis Cliente",
        lastMessageId: ultimo.id,
        lastMessageFromMe: ultimo.fromMe,
        lastMessageType: "conversation",
        lastMessageContent: ultimo.content,
        lastMessageRaw: {
            key: { id: ultimo.id, remoteJid: JID, fromMe: ultimo.fromMe },
            message: { conversation: ultimo.content },
        },
        lastMessageTimestamp: new Date(ahora),
    },
});

console.log(JSON.stringify({ cuenta: dueno.id, linea: LINEA, jid: JID }));
await db.$disconnect();
