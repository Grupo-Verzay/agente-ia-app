/**
 * Los DATOS DE EJEMPLO de las capturas de la guía de Respuestas Rápidas,
 * encima de `sembrar-barra.mjs` (que pone la cuenta, su línea y una
 * conversación).
 *
 * Con la forma de una cuenta de verdad: respuestas de texto con su atajo en
 * las cinco categorías, tres que ejecutan un flujo, y una que creó una asesora
 * del equipo —así sale la marca «De un asesor»—. Con tres respuestas iguales
 * una guía no enseña nada, y sin ninguna de flujo no hay nada que filtrar.
 *
 * La conversación de `sembrar-barra.mjs` se vuelve a escribir con una
 * pregunta de verdad («¿hacen envíos a Medellín?»): la sección de Chats enseña
 * cómo se contesta con «/envio», y la respuesta tiene que venir a cuento.
 *
 * Se puede correr las veces que haga falta: borra lo suyo y lo vuelve a poner.
 * El script de capturas lo vuelve a correr antes del vídeo, porque las
 * capturas crean y editan respuestas y el vídeo tiene que salir del mismo punto
 * de partida.
 *
 * El marco —cuenta de cliente, su menú, «Ver tutoriales» y «Soporte»— es el de
 * todas las guías (`sembrar-marco-de-la-guia.mjs`).
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { MENU_DE_UN_CLIENTE, sembrarElMarco } from "./sembrar-marco-de-la-guia.mjs";

const db = new PrismaClient();

const dueno = await sembrarElMarco(db, {
    path: "/auto-replies",
    title: "Guía de Respuestas Rápidas",
    description: "Aprende a crear y usar tus respuestas rápidas en la plataforma",
    url: "/guia/respuestas-rapidas",
});

/* La asesora que tiene una respuesta suya. */
const pass = await bcrypt.hash("banco1234", 10);
const laura = await db.user.upsert({
    where: { email: "laura@banco.test" },
    update: { name: "Laura Gómez", ownerId: dueno.id, advisorRole: "agente", status: true },
    create: {
        email: "laura@banco.test",
        name: "Laura Gómez",
        password: pass,
        role: "user",
        status: true,
        ownerId: dueno.id,
        advisorRole: "agente",
    },
});

/*
 * Los FLUJOS: los que ejecutan las respuestas de flujo, y uno (Bienvenida)
 * libre para crear una nueva en la guía. `isPro` para que «Editar flujo» lleve
 * al creador de flujos de siempre.
 */
await db.quickReply.deleteMany({ where: { userId: { in: [dueno.id, laura.id] } } });
await db.workflow.deleteMany({ where: { userId: dueno.id } });
const FLUJOS = ["Bienvenida", "Catálogo de productos", "Medios de pago", "Agendar cita"];
const flujos = {};
for (const [i, name] of FLUJOS.entries()) {
    flujos[name] = await db.workflow.create({
        data: {
            userId: dueno.id,
            name,
            definition: JSON.stringify({ nodes: [], edges: [] }),
            status: "active",
            isPro: true,
            order: i,
        },
    });
}

/*
 * Las RESPUESTAS, en su orden. `[atajo o nombre, mensaje, categoría, flujo]`:
 * con flujo, el nombre es libre y no hay mensaje.
 */
const RESPUESTAS = [
    ["hola", "¡Hola! Gracias por escribir a Mi Negocio. ¿En qué te puedo ayudar hoy?", "general"],
    ["precios", "Nuestros planes van desde $49.000 al mes. ¿Quieres que te envíe el catálogo completo?", "ventas"],
    ["envio", "Hacemos envíos a todo el país. A Medellín y Bogotá llega en 24 a 48 horas.", "ventas"],
    ["Enviar catálogo", null, "ventas", "Catálogo de productos"],
    ["horario", "Atendemos de lunes a viernes de 8:00 a. m. a 6:00 p. m. y los sábados hasta el mediodía.", "general"],
    ["pago", "Puedes pagar por transferencia, Nequi o tarjeta. Te envío los datos cuando me confirmes.", "pago"],
    ["Medios de pago", null, "pago", "Medios de pago"],
    ["comprobante", "Recibimos tu comprobante. En unos minutos te confirmamos el pago.", "pago"],
    ["garantia", "Todos nuestros productos tienen garantía de 6 meses. Cuéntame qué pasó y lo revisamos.", "soporte"],
    ["seguimiento", "Ya revisé tu pedido: va en camino y te llega mañana. Te comparto la guía de envío.", "soporte"],
    ["Agendar una cita", null, "cierre", "Agendar cita"],
    ["gracias", "Fue un gusto atenderte. Cualquier cosa, aquí estamos. ¡Que tengas un excelente día!", "cierre"],
];

for (const [i, [name, mensaje, category, flujo]] of RESPUESTAS.entries()) {
    await db.quickReply.create({
        data: {
            userId: dueno.id,
            name,
            mensaje,
            category,
            workflowId: flujo ? flujos[flujo].id : null,
            order: i,
        },
    });
}

/* La de la asesora: vive en la cuenta y lleva su marca de «personal». */
const personal = await db.quickReply.create({
    data: {
        userId: dueno.id,
        name: "demora",
        mensaje: "Disculpa la demora, ya estoy revisando tu caso y te respondo en un momento.",
        category: "soporte",
        order: RESPUESTAS.length,
    },
});
await db.$executeRaw`
    CREATE TABLE IF NOT EXISTS "respuestas_personales" (
        "rrId" INTEGER PRIMARY KEY,
        "personaId" TEXT NOT NULL,
        "cuentaId" TEXT NOT NULL,
        "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
`;
await db.$executeRaw`DELETE FROM "respuestas_personales" WHERE "cuentaId" = ${dueno.id}`;
await db.$executeRaw`
    INSERT INTO "respuestas_personales" ("rrId", "personaId", "cuentaId")
    VALUES (${personal.id}, ${laura.id}, ${dueno.id})
`;

/*
 * La CONVERSACIÓN de la sección de Chats: la misma de `sembrar-barra.mjs`
 * (línea y número), con una pregunta que se contesta con «/envio».
 */
const LINEA = "BANCO_VENTAS";
const JID = "573001112233@s.whatsapp.net";
const CLIENTA = "Mariana Toro";
await db.session.updateMany({ where: { userId: dueno.id, remoteJid: JID }, data: { pushName: CLIENTA } });
await db.chatConversation.deleteMany({ where: { userId: dueno.id } });
await db.chatMessage.deleteMany({ where: { userId: dueno.id } });

const ahora = Date.now();
const MENSAJES = [
    { id: "RR1", fromMe: false, content: "Hola, buenas tardes" },
    { id: "RR2", fromMe: true, content: "¡Hola! Gracias por escribir a Mi Negocio. ¿En qué te puedo ayudar hoy?" },
    { id: "RR3", fromMe: false, content: "¿Hacen envíos a Medellín? ¿Cuánto se demora?" },
];
for (const [i, m] of MENSAJES.entries()) {
    const cuando = ahora - (MENSAJES.length - i) * 60000;
    await db.chatMessage.create({
        data: {
            userId: dueno.id,
            instanceName: LINEA,
            instanceType: "waha",
            remoteJid: JID,
            messageId: m.id,
            fromMe: m.fromMe,
            pushName: CLIENTA,
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
const ultimo = MENSAJES[MENSAJES.length - 1];
await db.chatConversation.create({
    data: {
        userId: dueno.id,
        instanceName: LINEA,
        instanceType: "waha",
        remoteJid: JID,
        pushName: CLIENTA,
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

console.log(
    JSON.stringify({
        respuestas: RESPUESTAS.length + 1,
        flujos: FLUJOS.length,
        modulos: MENU_DE_UN_CLIENTE.length,
    }),
);
await db.$disconnect();
