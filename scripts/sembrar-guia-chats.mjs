/**
 * Los DATOS DE EJEMPLO de las capturas de la guía de Chats, encima de
 * `sembrar-barra.mjs` (que pone la cuenta y su equipo).
 *
 * Una bandeja de una tienda de calzado con la forma de una de verdad: la
 * conversación principal (Mariana Toro) trae de todo —una foto, una nota de
 * voz ya transcrita y otra por transcribir, una respuesta de la IA, un PDF y
 * una reacción—; un cliente que escribe en inglés con su traducción debajo;
 * uno sin leer, uno esperando a un asesor, uno de una compañera, y una
 * conversación de WhatsApp oficial (Meta) con la ventana de 24 horas cerrada,
 * que es donde salen las plantillas.
 *
 * Los archivos apuntan a `localhost:9000/guia/…`, que el script de capturas
 * contesta con imágenes y audios propios (`ctx.route`): ni una foto ni una voz
 * de nadie. Todo es inventado —nombres, números y conversaciones—: la guía es
 * pública.
 *
 * Se puede correr las veces que haga falta: borra lo suyo y lo vuelve a poner.
 * El script de capturas lo vuelve a correr antes del vídeo, porque las capturas
 * escriben notas, cambian la etapa y ponen etiquetas.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { MENU_DE_UN_CLIENTE, sembrarElMarco } from "./sembrar-marco-de-la-guia.mjs";

const db = new PrismaClient();

const dueno = await sembrarElMarco(db, {
    path: "/chats",
    title: "Guía de Chats",
    description: "Aprende a atender todas tus conversaciones de WhatsApp en la plataforma",
    url: "/guia/chats",
});

// Columnas que en producción existen por un ALTER en caliente (las crea el
// backend) y no están en el esquema de Prisma.
for (const sql of [
    'ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMP(3)',
    'ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMP(3)',
    'ALTER TABLE "Instancias" ADD COLUMN IF NOT EXISTS bot_enabled BOOLEAN DEFAULT true',
]) {
    await db.$executeRawUnsafe(sql);
}

await db.user.update({ where: { id: dueno.id }, data: { astraCallsSid: "guia-sesion-de-llamadas" } });

/* ── El EQUIPO ────────────────────────────────────────────────────────── */
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
const laura = equipo["laura@banco.test"];

/* ── Las LÍNEAS ───────────────────────────────────────────────────────── */
await db.instancia.deleteMany({ where: { userId: dueno.id } });
const LINEAS = [
    { instanceName: "VENTAS", displayName: "Ventas", instanceId: "inst-guia-ventas", userId: dueno.id, instanceType: "waha" },
    { instanceName: "OFICIAL", displayName: "WhatsApp oficial", instanceId: "inst-guia-oficial", userId: dueno.id, instanceType: "meta" },
];
for (const l of LINEAS) await db.instancia.create({ data: l });

/* ── Etiquetas, respuestas rápidas y macros ───────────────────────────── */
await db.tag.deleteMany({ where: { userId: dueno.id } });
const ETIQUETAS = [
    { name: "Cliente nuevo", slug: "cliente-nuevo", color: "#3b82f6" },
    { name: "Interesado", slug: "interesado", color: "#10b981" },
    { name: "Pendiente de pago", slug: "pendiente-de-pago", color: "#f59e0b" },
    { name: "Mayorista", slug: "mayorista", color: "#8b5cf6" },
];
const tag = {};
for (const [i, t] of ETIQUETAS.entries()) tag[t.name] = await db.tag.create({ data: { ...t, userId: dueno.id, order: i } });

await db.quickReply.deleteMany({ where: { userId: dueno.id } });
const RESPUESTAS = [
    { name: "horario", mensaje: "Atendemos de lunes a sábado, de 8 a. m. a 6 p. m." },
    { name: "pago", mensaje: "Puedes pagar por transferencia o con el enlace de pago que te envío ahora." },
    { name: "envios", mensaje: "Hacemos envíos a todo el país: llegan en 2 a 4 días hábiles." },
];
for (const [i, r] of RESPUESTAS.entries()) await db.quickReply.create({ data: { ...r, userId: dueno.id, order: i } });

await db.macro.deleteMany({ where: { userId: dueno.id } });
const MACROS = [
    {
        name: "Marcar como caliente",
        color: "#EF4444",
        actions: [
            { type: "ADD_TAG", config: { tagId: tag["Interesado"].id } },
            { type: "CHANGE_STAGE", config: { stage: "CALIENTE" } },
        ],
    },
    {
        name: "Dar la bienvenida",
        color: "#6366F1",
        actions: [{ type: "SEND_TEXT", config: { text: "¡Hola! Gracias por escribirnos. En un momento te atendemos." } }],
    },
];
for (const [i, m] of MACROS.entries()) {
    await db.macro.create({ data: { userId: dueno.id, name: m.name, color: m.color, actions: m.actions, order: i, enabled: true } });
}

/* ── Las CONVERSACIONES ───────────────────────────────────────────────── */
await db.chatMessage.deleteMany({ where: { userId: dueno.id } });
await db.chatConversation.deleteMany({ where: { userId: dueno.id } });
await db.session.deleteMany({ where: { userId: dueno.id } });

const ARCHIVOS = {
    foto: "http://localhost:9000/guia/chats/tenis-blancos.jpg",
    nota1: "http://localhost:9000/guia/chats/nota-de-voz-1.ogg",
    nota2: "http://localhost:9000/guia/chats/nota-de-voz-2.ogg",
    pdf: "http://localhost:9000/guia/chats/catalogo-de-tenis.pdf",
};

const ahora = Date.now();
const min = 60_000;

/** Un mensaje: `{ id, fromMe, texto?, tipo?, hace (min), extra (raw), message (raw.message) }`. */
async function mensaje(linea, tipoLinea, jid, nombre, m) {
    const cuando = ahora - m.hace * min;
    const message = m.message ?? { conversation: m.texto };
    await db.chatMessage.create({
        data: {
            userId: dueno.id,
            instanceName: linea,
            instanceType: tipoLinea,
            remoteJid: jid,
            messageId: m.id,
            fromMe: m.fromMe,
            pushName: nombre,
            messageType: m.tipo ?? "conversation",
            content: m.texto ?? "",
            ...(m.mediaUrl ? { mediaUrl: m.mediaUrl } : {}),
            raw: {
                key: { id: m.id, remoteJid: jid, fromMe: m.fromMe },
                message,
                messageTimestamp: Math.floor(cuando / 1000),
                ...(m.extra ?? {}),
            },
            messageTimestamp: new Date(cuando),
        },
    });
    return { ...m, cuando, message };
}

async function conversacion({ linea = "VENTAS", tipoLinea = "waha", numero, nombre, sesion = {}, etiquetas = [], mensajes, enEspera = false }) {
    const jid = `${numero}@s.whatsapp.net`;
    const instanceId = linea; // la ficha se une a su línea por el NOMBRE (chat-session-match)
    const s = await db.session.create({
        data: { userId: dueno.id, remoteJid: jid, pushName: nombre, instanceId, status: true, ...sesion },
    });
    for (const t of etiquetas) await db.sessionTag.create({ data: { sessionId: s.id, tagId: tag[t].id } });
    if (enEspera) await db.$executeRawUnsafe('UPDATE "Session" SET escalated_at = NOW() WHERE id = $1', s.id);
    let ultimo = null;
    for (const m of mensajes) ultimo = await mensaje(linea, tipoLinea, jid, nombre, m);
    await db.chatConversation.create({
        data: {
            userId: dueno.id,
            instanceName: linea,
            instanceType: tipoLinea,
            remoteJid: jid,
            pushName: nombre,
            lastMessageId: ultimo.id,
            lastMessageFromMe: ultimo.fromMe,
            lastMessageType: ultimo.tipo ?? "conversation",
            lastMessageContent: ultimo.texto ?? "",
            lastMessageRaw: { key: { id: ultimo.id, remoteJid: jid, fromMe: ultimo.fromMe }, message: ultimo.message },
            lastMessageTimestamp: new Date(ultimo.cuando),
        },
    });
    return s;
}

/** La conversación PRINCIPAL: trae de todo lo que la guía explica. */
await conversacion({
    numero: "573001112233",
    nombre: "Mariana Toro",
    sesion: { leadStatus: "TIBIO", assignedAdvisorId: dueno.id },
    etiquetas: ["Interesado"],
    mensajes: [
        {
            id: "GC-M1",
            fromMe: false,
            hace: 48,
            tipo: "imageMessage",
            texto: "Hola, buenas tardes. ¿Tienen estos tenis en talla 38?",
            mediaUrl: ARCHIVOS.foto,
            message: {
                imageMessage: { url: ARCHIVOS.foto, mimetype: "image/jpeg", caption: "Hola, buenas tardes. ¿Tienen estos tenis en talla 38?" },
            },
        },
        {
            id: "GC-M2",
            fromMe: true,
            hace: 47,
            texto: "¡Hola Mariana! Sí, los Clásicos blancos los tenemos en talla 38. Cuestan $189.000 y el envío a Medellín es gratis.",
            extra: { sentByAi: true },
        },
        {
            id: "GC-M3",
            fromMe: false,
            hace: 40,
            tipo: "audioMessage",
            mediaUrl: ARCHIVOS.nota1,
            message: { audioMessage: { url: ARCHIVOS.nota1, mimetype: "audio/ogg; codecs=opus", seconds: 14, ptt: true } },
            extra: { transcripcion: "Perfecto. ¿Y me los pueden enviar mañana? Es que los necesito para el fin de semana." },
        },
        {
            id: "GC-M4",
            fromMe: true,
            hace: 31,
            tipo: "documentMessage",
            texto: "Claro que sí. Te envío el catálogo con todos los colores.",
            mediaUrl: ARCHIVOS.pdf,
            message: {
                documentMessage: {
                    url: ARCHIVOS.pdf,
                    mimetype: "application/pdf",
                    fileName: "catalogo-de-tenis.pdf",
                    caption: "Claro que sí. Te envío el catálogo con todos los colores.",
                },
            },
            extra: { reaccion: "❤️" },
        },
        { id: "GC-M5", fromMe: false, hace: 9, texto: "¡Gracias! Ya lo vi, me encantan los blancos 😍" },
        {
            id: "GC-M6",
            fromMe: false,
            hace: 6,
            tipo: "audioMessage",
            mediaUrl: ARCHIVOS.nota2,
            message: { audioMessage: { url: ARCHIVOS.nota2, mimetype: "audio/ogg; codecs=opus", seconds: 9, ptt: true } },
        },
    ],
});

/** Un cliente que escribe en INGLÉS y lo atiende una persona: su traducción va debajo. */
await conversacion({
    numero: "14155550123",
    nombre: "John Miller",
    sesion: { status: false, leadStatus: "CALIENTE" },
    etiquetas: ["Mayorista"],
    mensajes: [
        {
            id: "GC-J1",
            fromMe: false,
            hace: 26,
            texto: "Hi! Do you ship to Miami? I want ten pairs of the white sneakers for my store.",
            extra: {
                traduccion: {
                    espanol: "¡Hola! ¿Hacen envíos a Miami? Quiero diez pares de los tenis blancos para mi tienda.",
                    idioma: "en",
                    como: "automatica",
                    en: new Date(ahora - 26 * min).toISOString(),
                },
            },
        },
        {
            id: "GC-J2",
            fromMe: true,
            hace: 22,
            texto: "Yes, we ship to Miami. It takes 5 business days.",
            extra: {
                traduccion: {
                    espanol: "Sí, hacemos envíos a Miami. Tarda 5 días hábiles.",
                    idioma: "en",
                    como: "al_enviar",
                    en: new Date(ahora - 22 * min).toISOString(),
                },
            },
        },
        // Sin traducir a propósito: en su «⋯» sale «Traducir».
        { id: "GC-J3", fromMe: false, hace: 20, texto: "Great, can I pay half now and half on delivery?" },
    ],
});

await conversacion({
    numero: "573157778899",
    nombre: "Camila Rojas",
    sesion: { leadStatus: "FRIO" },
    etiquetas: ["Cliente nuevo"],
    mensajes: [{ id: "GC-C1", fromMe: false, hace: 3, texto: "Buenas, ¿tienen sandalias para niña en talla 30?" }],
});

await conversacion({
    numero: "573225556677",
    nombre: "Jorge Méndez",
    sesion: { status: false },
    enEspera: true,
    mensajes: [
        { id: "GC-G1", fromMe: false, hace: 15, texto: "Mi pedido llegó en otra talla." },
        { id: "GC-G2", fromMe: true, hace: 14, texto: "Lo siento mucho, Jorge. Ya te comunico con una persona del equipo.", extra: { sentByAi: true } },
        { id: "GC-G3", fromMe: false, hace: 12, texto: "Quiero hablar con una persona, por favor." },
    ],
});

await conversacion({
    numero: "573186667788",
    nombre: "Valentina Ortiz",
    sesion: { leadStatus: "CALIENTE", assignedAdvisorId: laura.id },
    etiquetas: ["Pendiente de pago"],
    mensajes: [
        { id: "GC-V1", fromMe: false, hace: 95, texto: "¿Me mandas el enlace de pago?" },
        { id: "GC-V2", fromMe: true, hace: 90, texto: "Claro, aquí lo tienes. Avísame cuando pagues 🙌" },
    ],
});

await conversacion({
    numero: "573004441122",
    nombre: "Felipe Castro",
    sesion: { leadStatus: "FINALIZADO" },
    mensajes: [
        { id: "GC-F1", fromMe: false, hace: 300, texto: "Ya me llegaron los tenis, muchas gracias." },
        { id: "GC-F2", fromMe: true, hace: 290, texto: "¡Qué bueno, Felipe! Que los disfrutes.", extra: { sentByAi: true } },
    ],
});

await conversacion({
    numero: "573012223344",
    nombre: "Lucía Ramírez",
    sesion: { leadStatus: "TIBIO" },
    mensajes: [
        { id: "GC-L1", fromMe: false, hace: 1440, texto: "¿Cuánto cuestan las botas negras?" },
        { id: "GC-L2", fromMe: true, hace: 1430, texto: "Las botas negras cuestan $249.000.", extra: { sentByAi: true } },
    ],
});

/** WhatsApp oficial (Meta), con la ventana de 24 horas cerrada: se escribe con una plantilla. */
await conversacion({
    linea: "OFICIAL",
    tipoLinea: "meta",
    numero: "573209990011",
    nombre: "Daniela Herrera",
    sesion: { leadStatus: "TIBIO" },
    mensajes: [
        { id: "GC-D1", fromMe: false, hace: 3 * 1440, texto: "Quiero que me avisen cuando lleguen las nuevas colecciones." },
        { id: "GC-D2", fromMe: true, hace: 3 * 1440 - 5, texto: "¡Claro, Daniela! Te escribimos apenas lleguen." },
    ],
});

console.log(JSON.stringify({ conversaciones: 8, lineas: LINEAS.length, etiquetas: ETIQUETAS.length, modulos: MENU_DE_UN_CLIENTE.length }));
await db.$disconnect();
