/**
 * Los DATOS DE EJEMPLO de las capturas de la guía de Mis macros, encima de
 * `sembrar-barra.mjs` (que pone la cuenta y su equipo).
 *
 * Nombres inventados, pero con la forma de una cuenta de verdad: ocho macros
 * que responden, clasifican, asignan y cierran, dos de ellas desactivadas; las
 * etiquetas, respuestas rápidas, flujos y asesores que esas macros eligen; tres
 * líneas —dos de WhatsApp y una de Meta— y la de una cuenta hija, para que
 * «Enviar por otra línea» enseñe el nombre de la cuenta delante; y una
 * conversación en Chats donde lanzar una macro. Con tres macros iguales una
 * guía no enseña nada.
 *
 * El marco —cuenta de cliente, su menú, «Ver tutoriales» y «Soporte»— es el de
 * todas las guías (`sembrar-marco-de-la-guia.mjs`).
 *
 * Se puede correr las veces que haga falta: borra lo suyo y lo vuelve a
 * poner. El script de capturas lo vuelve a correr antes del vídeo, porque las
 * capturas crean, desactivan y borran macros, y el vídeo tiene que salir del
 * mismo punto de partida.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { MENU_DE_UN_CLIENTE, sembrarElMarco } from "./sembrar-marco-de-la-guia.mjs";

const db = new PrismaClient();

const dueno = await sembrarElMarco(db, {
    path: "/macros",
    title: "Guía de Mis macros",
    description: "Aprende a automatizar tus chats con acciones de un clic en la plataforma",
    url: "/guia/macros",
});

/* ── El EQUIPO: a quién se asigna, se transfiere o se le crea una tarea ── */
const pass = await bcrypt.hash("banco1234", 10);
const EQUIPO = [
    { email: "sofia@banco.test", name: "Sofía Martínez", advisorRole: "administrador" },
    { email: "laura@banco.test", name: "Laura Gómez", advisorRole: "agente" },
    { email: "andres@banco.test", name: "Andrés Ruiz", advisorRole: "agente" },
];
const equipo = {};
for (const p of EQUIPO) {
    equipo[p.email] = await db.user.upsert({
        where: { email: p.email },
        update: { name: p.name, ownerId: dueno.id, advisorRole: p.advisorRole, status: true },
        create: { ...p, password: pass, role: "user", status: true, ownerId: dueno.id },
    });
}
const sofia = equipo["sofia@banco.test"];
const laura = equipo["laura@banco.test"];
const andres = equipo["andres@banco.test"];

/*
 * Una cuenta HIJA con su línea: «Enviar por otra línea» ofrece también las de
 * las cuentas que cuelgan de esta, con el nombre de la cuenta delante.
 */
const hija = await db.user.upsert({
    where: { email: "norte@guia.test" },
    update: { name: "Sucursal Norte", company: "Sucursal Norte", status: true },
    create: { email: "norte@guia.test", name: "Sucursal Norte", company: "Sucursal Norte", password: pass, role: "user", status: true },
});
await db.linkedAccount.deleteMany({ where: { OR: [{ masterUserId: dueno.id }, { linkedUserId: dueno.id }] } });
await db.linkedAccount.create({ data: { masterUserId: dueno.id, linkedUserId: hija.id, role: "administrador", label: "Sucursal Norte" } });

/* ── Las LÍNEAS ───────────────────────────────────────────────────────── */
await db.instancia.deleteMany({ where: { userId: { in: [dueno.id, hija.id] } } });
const LINEAS = [
    { instanceName: "VENTAS", displayName: "Ventas", instanceId: "inst-guia-ventas", userId: dueno.id, instanceType: "waha" },
    { instanceName: "SOPORTE", displayName: "Soporte", instanceId: "inst-guia-soporte", userId: dueno.id, instanceType: "waha" },
    { instanceName: "OFICIAL", displayName: "WhatsApp oficial", instanceId: "inst-guia-oficial", userId: dueno.id, instanceType: "meta" },
    { instanceName: "NORTE", displayName: "Principal", instanceId: "inst-guia-norte", userId: hija.id, instanceType: "waha" },
];
for (const l of LINEAS) await db.instancia.create({ data: l });

/* ── Etiquetas, respuestas rápidas y flujos que las macros eligen ─────── */
await db.tag.deleteMany({ where: { userId: dueno.id } });
const ETIQUETAS = [
    { name: "Cliente nuevo", slug: "cliente-nuevo", color: "#3b82f6" },
    { name: "Venta cerrada", slug: "venta-cerrada", color: "#10b981" },
    { name: "Pendiente de pago", slug: "pendiente-de-pago", color: "#f59e0b" },
    { name: "Soporte", slug: "soporte", color: "#8b5cf6" },
];
const tag = {};
for (const [i, t] of ETIQUETAS.entries()) tag[t.name] = await db.tag.create({ data: { ...t, userId: dueno.id, order: i } });

await db.quickReply.deleteMany({ where: { userId: dueno.id } });
const RESPUESTAS = [
    { name: "Horario de atención", mensaje: "Atendemos de lunes a sábado, de 8 a. m. a 6 p. m." },
    { name: "Datos de pago", mensaje: "Puedes pagar por transferencia a la cuenta 123-456789 o con el enlace de pago." },
    { name: "Gracias por tu compra", mensaje: "¡Gracias por tu compra! En breve te llega la confirmación." },
];
const rr = {};
for (const [i, r] of RESPUESTAS.entries()) rr[r.name] = await db.quickReply.create({ data: { ...r, userId: dueno.id, order: i } });

await db.workflow.deleteMany({ where: { userId: dueno.id } });
const FLUJOS = ["Bienvenida", "Seguimiento de pago", "Encuesta de satisfacción"];
const flujo = {};
for (const [i, name] of FLUJOS.entries()) {
    flujo[name] = await db.workflow.create({ data: { userId: dueno.id, name, definition: "{}", status: "active", order: i } });
}

/* ── Las MACROS ───────────────────────────────────────────────────────── */
await db.macro.deleteMany({ where: { userId: dueno.id } });
const hace = (dias) => new Date(Date.now() - dias * 86_400_000);
const MACROS = [
    {
        name: "Venta cerrada",
        color: "#10B981",
        runCount: 23,
        actions: [
            { type: "SEND_QUICK_REPLY", config: { quickReplyId: rr["Gracias por tu compra"].id } },
            { type: "ADD_TAG", config: { tagId: tag["Venta cerrada"].id } },
            { type: "CHANGE_STAGE", config: { stage: "FINALIZADO" } },
            // La pausa antes de resolver: que el mensaje salga antes de cerrar.
            { type: "WAIT", config: { seconds: 3 } },
            { type: "RESOLVE", config: {} },
        ],
    },
    {
        name: "Dar la bienvenida",
        color: "#6366F1",
        runCount: 41,
        actions: [
            { type: "SEND_TEXT", config: { text: "¡Hola! Gracias por escribirnos. En un momento te atiende una persona del equipo." } },
            { type: "ADD_TAG", config: { tagId: tag["Cliente nuevo"].id } },
            { type: "ASSIGN_ADVISOR", config: { advisorId: laura.id } },
        ],
    },
    {
        name: "Enviar datos de pago",
        color: "#F59E0B",
        runCount: 17,
        actions: [
            { type: "SEND_QUICK_REPLY", config: { quickReplyId: rr["Datos de pago"].id } },
            { type: "WAIT", config: { seconds: 3 } },
            {
                type: "SEND_FILE",
                config: {
                    mediaUrl: "http://localhost:9000/guia/catalogo-de-precios.pdf",
                    mediatype: "document",
                    mimetype: "application/pdf",
                    fileName: "catalogo-de-precios.pdf",
                    caption: "Aquí tienes nuestros precios.",
                },
            },
            { type: "ADD_TAG", config: { tagId: tag["Pendiente de pago"].id } },
            {
                type: "CREATE_TASK",
                config: { taskTitle: "Confirmar el pago", taskType: "Seguimiento", taskDays: 1, advisorId: sofia.id },
            },
        ],
    },
    {
        name: "Marcar como caliente",
        color: "#EF4444",
        runCount: 8,
        actions: [
            { type: "ADD_TAG", config: { tagId: tag["Cliente nuevo"].id } },
            { type: "CHANGE_STAGE", config: { stage: "CALIENTE" } },
            { type: "INTERNAL_NOTE", config: { content: "Muy interesado: llamar hoy mismo." } },
        ],
    },
    {
        name: "Pasar a soporte",
        color: "#8B5CF6",
        runCount: 9,
        actions: [
            { type: "ADD_TAG", config: { tagId: tag["Soporte"].id } },
            { type: "TRANSFER_ADVISOR", config: { advisorId: andres.id } },
            { type: "TOGGLE_AI", config: { disabled: true } },
            { type: "INTERNAL_NOTE", config: { content: "El cliente reporta un problema con su pedido." } },
        ],
    },
    {
        name: "Aviso desde Soporte",
        color: "#0EA5E9",
        runCount: 4,
        actions: [
            {
                type: "SEND_TEXT_VIA",
                config: { instanceName: "SOPORTE", viaMode: "text", text: "Hola, te escribimos desde Soporte para ayudarte con tu pedido." },
            },
        ],
    },
    {
        // Corto a propósito: el menú «Macros» de un chat mide lo que va del
        // botón al filo derecho, y un nombre largo sale recortado con «…».
        name: "Pedir valoración",
        color: "#14B8A6",
        runCount: 12,
        actions: [{ type: "EXECUTE_FLOW", config: { workflowId: flujo["Encuesta de satisfacción"].id } }],
    },
    {
        name: "Promoción de octubre",
        color: "#EC4899",
        runCount: 30,
        enabled: false,
        actions: [{ type: "SEND_TEXT", config: { text: "Este mes, 2x1 en la segunda unidad. ¡Aprovecha!" } }],
    },
];
for (const [i, m] of MACROS.entries()) {
    await db.macro.create({
        data: {
            userId: dueno.id,
            name: m.name,
            color: m.color,
            actions: m.actions,
            order: i,
            enabled: m.enabled ?? true,
            runCount: m.runCount,
            lastRunAt: m.runCount ? hace(i + 1) : null,
        },
    });
}

/*
 * Una CONVERSACIÓN en Chats, en la línea de Ventas, donde lanzar una macro.
 * La forma es la de `sembrar-barra.mjs`, que es la que Chats sabe abrir.
 */
const JID = "573004521876@s.whatsapp.net";
const CONTACTO = "María Fernanda López";
await db.session.deleteMany({ where: { userId: dueno.id } });
await db.chatConversation.deleteMany({ where: { userId: dueno.id } });
await db.chatMessage.deleteMany({ where: { userId: dueno.id } });
await db.session.create({
    data: { userId: dueno.id, remoteJid: JID, pushName: CONTACTO, instanceId: "inst-guia-ventas", status: true },
});
const ahora = Date.now();
const MENSAJES = [
    { id: "GM1", fromMe: false, content: "Hola, quiero comprar el plan completo" },
    { id: "GM2", fromMe: true, content: "¡Claro! Te cuento cómo funciona." },
    { id: "GM3", fromMe: false, content: "¿Cuánto cuesta el envío a Medellín?" },
];
for (const [i, m] of MENSAJES.entries()) {
    const cuando = ahora - (MENSAJES.length - i) * 60_000;
    await db.chatMessage.create({
        data: {
            userId: dueno.id,
            instanceName: "VENTAS",
            instanceType: "waha",
            remoteJid: JID,
            messageId: m.id,
            fromMe: m.fromMe,
            pushName: CONTACTO,
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
        instanceName: "VENTAS",
        instanceType: "waha",
        remoteJid: JID,
        pushName: CONTACTO,
        lastMessageId: ultimo.id,
        lastMessageFromMe: ultimo.fromMe,
        lastMessageType: "conversation",
        lastMessageContent: ultimo.content,
        lastMessageRaw: { key: { id: ultimo.id, remoteJid: JID, fromMe: ultimo.fromMe }, message: { conversation: ultimo.content } },
        lastMessageTimestamp: new Date(ahora),
    },
});

console.log(
    JSON.stringify({
        macros: MACROS.length,
        inactivas: MACROS.filter((m) => m.enabled === false).length,
        lineas: LINEAS.length,
        etiquetas: ETIQUETAS.length,
        chat: JID,
        modulos: MENU_DE_UN_CLIENTE.length,
    }),
);
await db.$disconnect();
