/**
 * Los DATOS DE EJEMPLO de las capturas de la guía de Llamadas, encima de
 * `sembrar-barra.mjs` (la cuenta, su línea BANCO_VENTAS y una conversación).
 *
 * Con la forma de un historial de verdad: llamadas salientes hechas a mano y
 * con la IA, entrantes que no se contestaron, unas con su resultado puesto por
 * una persona, otras propuesto por la IA (con su destello) y una sin marcar;
 * las que tienen grabación traen su resumen y su transcripción separada por
 * quién habla. Una llamada es una fila de `chat_messages` con
 * `messageType: 'call'` y sus datos en `raw.call`, que es como las escribe la
 * plataforma.
 *
 * La grabación apunta a una dirección de ejemplo (`localhost:9000`) que el
 * script de capturas contesta con un audio propio: ni una voz de nadie.
 *
 * Todo es inventado —nombres, números y conversaciones—: la guía es pública.
 * Se puede correr las veces que haga falta: borra lo suyo y lo vuelve a poner.
 */
import { PrismaClient } from "@prisma/client";
import { MENU_DE_UN_CLIENTE, sembrarElMarco } from "./sembrar-marco-de-la-guia.mjs";

const db = new PrismaClient();

const dueno = await sembrarElMarco(db, {
    path: "/crm/llamadas",
    title: "Guía de Llamadas",
    description: "Aprende a llamar a tus clientes y revisar cada llamada en la plataforma",
    url: "/guia/llamadas",
});

/*
 * Sin número de llamadas vinculado, la ventana de Llamar enseña la cuenta
 * apagada («sin número de llamadas»). El sid es de ejemplo: las capturas no
 * llaman a nadie, solo señalan los botones.
 */
await db.user.update({
    where: { id: dueno.id },
    data: { astraCallsSid: "guia-sesion-de-llamadas", missedCallReplyEnabled: false, missedCallReplyText: null },
});

const LINEA = "BANCO_VENTAS";
export const GRABACION = "http://localhost:9000/guia/llamada-de-ejemplo.ogg";

const RESUMEN_MARIANA =
    "- Mariana quiere el plan Business para su tienda de ropa.\n" +
    "- Pidió el enlace para agendar una demostración el jueves.\n" +
    "- Pendiente: enviarle la cotización con dos usuarios más.";
const TRANSCRIPCION_MARIANA = [
    "Asistente: Hola Mariana, te habla Verzy, de Mi Negocio. Te llamo por el mensaje que nos dejaste sobre los planes.",
    "Cliente: Hola, sí. Tengo una tienda de ropa y quiero que me ayuden a responder los chats.",
    "Asistente: Perfecto. Para una tienda como la tuya te recomiendo el plan Business: incluye la IA y tres usuarios.",
    "Cliente: Me interesa. ¿Me pueden mostrar cómo funciona?",
    "Asistente: Claro. Te envío por WhatsApp el enlace para agendar una demostración. ¿El jueves te queda bien?",
    "Cliente: Sí, el jueves en la tarde. Y mándame también la cotización con dos usuarios más.",
    "Asistente: Listo, te llega en un momento. ¡Gracias, Mariana!",
].join("\n");

/*
 * `[nombre o null, número, dirección, segundos, quién, resultado, de dónde, horas atrás, resumen, transcripción]`.
 * Sin nombre la fila enseña «Poner nombre», que es lo que explica un paso.
 */
const LLAMADAS = [
    ["Mariana Toro", "573001112233", "outgoing", 187, "ia", "interesado", "ia", 1, RESUMEN_MARIANA, TRANSCRIPCION_MARIANA],
    [
        "Andrés Gómez",
        "573104445566",
        "outgoing",
        102,
        "tu",
        "link_enviado",
        "manual",
        3,
        "- Andrés pidió el enlace de pago del plan Esencial.\n- Se le envió por WhatsApp durante la llamada.",
        "Asistente: Hola Andrés, ¿cómo vas?\nCliente: Bien, quería pagar el plan Esencial.\nAsistente: Te envío el enlace de pago ahora mismo por WhatsApp.\nCliente: Perfecto, gracias.",
    ],
    ["Lucía Ramírez", "573157778899", "incoming", 0, "tu", null, null, 5, null, null],
    ["Pedro Salazar", "573209990011", "outgoing", 0, "tu", "no_contesta", "manual", 8, null, null],
    [
        "Camila Rojas",
        "573012223344",
        "outgoing",
        135,
        "ia",
        "volver_llamar",
        "ia",
        22,
        "- Camila está de viaje y prefiere hablar el lunes.\n- Le interesa el catálogo de productos para su panadería.",
        "Asistente: Hola Camila, te habla Verzy, de Mi Negocio.\nCliente: Hola, ahora estoy de viaje. ¿Me puedes llamar el lunes?\nAsistente: Claro, el lunes te llamo. ¿Te envío mientras el catálogo?\nCliente: Sí, por favor.",
    ],
    [
        "Jorge Méndez",
        "573225556677",
        "outgoing",
        48,
        "tu",
        null,
        null,
        26,
        "- Jorge preguntó por el horario de atención y por los envíos a Cali.",
        "Asistente: Hola Jorge.\nCliente: Hola, ¿hasta qué hora atienden? ¿Y envían a Cali?\nAsistente: Atendemos hasta las seis y sí, enviamos a todo el país.",
    ],
    ["Valentina Ortiz", "573186667788", "incoming", 0, "tu", null, null, 30, null, null],
    [
        "Felipe Castro",
        "573004441122",
        "outgoing",
        242,
        "tu",
        "no_interesado",
        "manual",
        46,
        "- Felipe ya trabaja con otro proveedor y no quiere cambiar por ahora.",
        "Asistente: Hola Felipe, te llamo por la propuesta.\nCliente: Gracias, pero por ahora seguimos con nuestro proveedor.",
    ],
    [null, "573118889900", "outgoing", 70, "tu", null, null, 50, null, null],
];

// Lo de antes de la cuenta: llamadas, conversaciones y tareas de la guía.
await db.chatMessage.deleteMany({ where: { userId: dueno.id } });
await db.chatConversation.deleteMany({ where: { userId: dueno.id } });
await db.task.deleteMany({ where: { ownerId: dueno.id } }).catch(() => {});

const ahora = Date.now();
for (const [i, [nombre, numero, direccion, segundos, quien, resultado, fuente, horas, resumen, transcripcion]] of LLAMADAS.entries()) {
    const jid = `${numero}@s.whatsapp.net`;
    const cuando = ahora - horas * 3_600_000;
    const saliente = direccion === "outgoing";
    const conGrabacion = Boolean(transcripcion);
    const messageId = saliente ? `callout_${cuando}_${numero}` : `callin_${cuando}_${numero}`;
    const content = saliente ? (quien === "ia" ? "Llamada con IA realizada" : "Llamada realizada") : "Llamada perdida";
    const call = {
        direction: direccion,
        durationSecs: segundos,
        ...(quien === "ia" ? { isBot: true } : {}),
        status: saliente ? (segundos > 0 ? "completed" : "no_answer") : "missed",
        ...(resultado ? { disposition: resultado, dispositionSource: fuente } : {}),
        ...(resultado && fuente === "ia" ? { dispositionIa: resultado } : {}),
        hasRecording: conGrabacion,
        ...(conGrabacion ? { recordingUrl: GRABACION, transcript: transcripcion, summary: resumen } : {}),
    };
    // Un texto del cliente antes de la llamada: el chat no abre vacío.
    if (nombre) {
        const previo = cuando - 10 * 60_000;
        await db.chatMessage.create({
            data: {
                userId: dueno.id,
                instanceName: LINEA,
                instanceType: "waha",
                remoteJid: jid,
                messageId: `guia-texto-${i}`,
                fromMe: false,
                pushName: nombre,
                messageType: "conversation",
                content: "Hola, quiero más información sobre los planes.",
                raw: {
                    key: { id: `guia-texto-${i}`, remoteJid: jid, fromMe: false },
                    message: { conversation: "Hola, quiero más información sobre los planes." },
                    messageTimestamp: Math.floor(previo / 1000),
                },
                messageTimestamp: new Date(previo),
            },
        });
    }
    await db.chatMessage.create({
        data: {
            userId: dueno.id,
            instanceName: LINEA,
            instanceType: "waha",
            remoteJid: jid,
            messageId,
            fromMe: saliente,
            pushName: nombre ?? undefined,
            messageType: "call",
            content,
            raw: { key: { id: messageId, remoteJid: jid, fromMe: saliente }, call },
            messageTimestamp: new Date(cuando),
        },
    });
    if (nombre) {
        await db.chatConversation.create({
            data: {
                userId: dueno.id,
                instanceName: LINEA,
                instanceType: "waha",
                remoteJid: jid,
                pushName: nombre,
                lastMessageId: messageId,
                lastMessageFromMe: saliente,
                lastMessageType: "call",
                lastMessageContent: content,
                lastMessageRaw: { key: { id: messageId, remoteJid: jid, fromMe: saliente }, call },
                lastMessageTimestamp: new Date(cuando),
            },
        });
        await db.session.updateMany({ where: { userId: dueno.id, remoteJid: jid }, data: { pushName: nombre } });
    }
}

console.log(JSON.stringify({ llamadas: LLAMADAS.length, modulos: MENU_DE_UN_CLIENTE.length }));
await db.$disconnect();
