/**
 * Los DATOS DE EJEMPLO de las capturas de la guía de Integrar URLs, encima de
 * `sembrar-barra.mjs` (que pone la cuenta, su equipo y su línea de WhatsApp).
 *
 * Nombres inventados, pero con la forma de una cuenta de verdad: cuatro apps
 * web de un negocio —un formulario de pedidos, un cotizador, un catálogo y un
 * inventario— y unas cuantas conversaciones en la bandeja de Chats, porque la
 * mitad de la guía es ver esas apps como pestañas dentro de un chat. Con una
 * sola app y un solo chat la guía no enseña nada.
 *
 * Las direcciones son de `mi-negocio.co`: no se piden a la red. El script de
 * capturas las contesta con una página de ejemplo (`ctx.route`), así que las
 * pestañas de las apps se ven llenas y no dependen de una web ajena.
 *
 * `CON_UNA_ROTA=1` añade una app guardada ANTES de las reglas de hoy, con una
 * dirección que no se puede abrir: es la que enseña el aviso amarillo de su
 * fila en «Cuando una app no se abre». Va aparte porque en el resto de la
 * guía no tiene que salir.
 *
 * El marco —cuenta de cliente, su menú, «Ver tutoriales» y «Soporte»— es el de
 * todas las guías (`sembrar-marco-de-la-guia.mjs`).
 *
 * Se puede correr las veces que haga falta: borra lo suyo y lo vuelve a
 * poner. El script de capturas lo vuelve a correr antes del vídeo, porque las
 * capturas agregan, editan y reordenan apps y el vídeo tiene que salir del
 * mismo punto de partida.
 */
import { PrismaClient } from "@prisma/client";
import { MENU_DE_UN_CLIENTE, sembrarElMarco } from "./sembrar-marco-de-la-guia.mjs";

const db = new PrismaClient();

const dueno = await sembrarElMarco(db, {
    path: "/integraciones",
    title: "Guía de Integrar URLs",
    description: "Aprende a abrir tus apps web dentro de tus chats en la plataforma",
    url: "/guia/integraciones",
});

/* ── Las apps ───────────────────────────────────────────────────────────── */
const APPS = [
    { name: "Formulario de pedidos", url: "https://pedidos.mi-negocio.co/nuevo" },
    { name: "Cotizador", url: "https://cotizador.mi-negocio.co" },
    { name: "Catálogo de productos", url: "https://catalogo.mi-negocio.co" },
    { name: "Inventario", url: "https://inventario.mi-negocio.co/bodega" },
];
/** La de «Cuando una app no se abre»: guardada antes de las reglas, con espacios. */
const LA_ROTA = { name: "Hoja de precios", url: "hoja de precios" };

await db.userIntegration.deleteMany({ where: { userId: dueno.id } });
const lista = process.env.CON_UNA_ROTA === "1" ? [...APPS, LA_ROTA] : APPS;
for (const [i, a] of lista.entries()) {
    await db.userIntegration.create({ data: { userId: dueno.id, name: a.name, url: a.url, order: i } });
}

/* ── La bandeja de Chats ────────────────────────────────────────────────── */
/*
 * La línea es la de `sembrar-barra.mjs` (BANCO_VENTAS, «Ventas»). Cada
 * contacto con su ficha, su conversación y sus mensajes, igual que los guarda
 * el webhook: sin la conversación, `/chats` no la pinta.
 */
const LINEA = "BANCO_VENTAS";
const INSTANCIA = "inst-banco-1";
const CONTACTOS = [
    {
        nombre: "María Fernanda López",
        numero: "573004521876",
        mensajes: [
            [false, "Hola, quiero hacer un pedido para el viernes"],
            [true, "¡Claro, María Fernanda! Ya te tomo los datos"],
            [false, "Son dos cajas de las grandes, por favor"],
        ],
    },
    {
        nombre: "Distribuidora El Sol",
        numero: "573017789245",
        mensajes: [
            [false, "Buenas tardes, ¿nos pueden enviar la cotización?"],
            [true, "Con gusto, en un momento se la enviamos"],
        ],
    },
    {
        nombre: "Camila Andrade",
        numero: "573108842216",
        mensajes: [
            [false, "¿Tienen el catálogo actualizado?"],
            [true, "Sí, te lo comparto ahora mismo"],
        ],
    },
    {
        nombre: "Juan Pablo Restrepo",
        numero: "573125538810",
        mensajes: [[false, "¿Les queda la talla M en azul?"]],
    },
];

await db.session.deleteMany({ where: { userId: dueno.id } });
await db.chatConversation.deleteMany({ where: { userId: dueno.id } });
await db.chatMessage.deleteMany({ where: { userId: dueno.id } });

const ahora = Date.now();
for (const [c, contacto] of CONTACTOS.entries()) {
    const jid = `${contacto.numero}@s.whatsapp.net`;
    // La primera es la más reciente: sale arriba de la bandeja.
    const base = ahora - c * 45 * 60_000;
    await db.session.create({
        data: { userId: dueno.id, remoteJid: jid, pushName: contacto.nombre, instanceId: INSTANCIA, status: true },
    });
    const n = contacto.mensajes.length;
    for (const [i, [fromMe, content]] of contacto.mensajes.entries()) {
        const cuando = base - (n - 1 - i) * 90_000;
        const id = `G${c}M${i}`;
        await db.chatMessage.create({
            data: {
                userId: dueno.id,
                instanceName: LINEA,
                instanceType: "waha",
                remoteJid: jid,
                messageId: id,
                fromMe,
                pushName: contacto.nombre,
                messageType: "conversation",
                content,
                raw: { key: { id, remoteJid: jid, fromMe }, message: { conversation: content }, messageTimestamp: Math.floor(cuando / 1000) },
                messageTimestamp: new Date(cuando),
            },
        });
    }
    const [fromMe, content] = contacto.mensajes[n - 1];
    const id = `G${c}M${n - 1}`;
    await db.chatConversation.create({
        data: {
            userId: dueno.id,
            instanceName: LINEA,
            instanceType: "waha",
            remoteJid: jid,
            pushName: contacto.nombre,
            lastMessageId: id,
            lastMessageFromMe: fromMe,
            lastMessageType: "conversation",
            lastMessageContent: content,
            lastMessageRaw: { key: { id, remoteJid: jid, fromMe }, message: { conversation: content } },
            lastMessageTimestamp: new Date(base),
        },
    });
}

console.log(
    JSON.stringify({
        apps: lista.length,
        conversaciones: CONTACTOS.length,
        modulos: MENU_DE_UN_CLIENTE.length,
        conUnaRota: lista.length > APPS.length,
    }),
);
await db.$disconnect();
