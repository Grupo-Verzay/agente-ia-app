/**
 * Una madre con dos hijas, para probar el panel de filtros de Chats en la
 * página servida.
 *
 *  - Madre (la que entra): su línea con un chat y la etiqueta «VIP».
 *  - Atención: tres chats, etiquetas «Interesado» y «Reclamo», y DOS embudos
 *    («Embudo de ventas» y «Soporte»). Beto está en «Cotizado» y Caro en
 *    «Contactado»; Ana se queda en «Nuevo».
 *  - Ventas: un chat y OTRA «Interesado» —mismo nombre, otra cuenta: es lo que
 *    el filtro mezclaba— y un solo embudo.
 *
 * Los embudos se crean con las funciones de la App (el paquete del banco), que
 * crean sus tablas la primera vez: son de la App y no están en Prisma.
 */
import bcrypt from "bcryptjs";
import {
    db,
    crearEmbudo,
    moverConversacion,
    lasEtapasDe,
} from "../lib/__tests__/.compilado/filtro-de-chats/entrada-del-filtro-de-chats.js";

const CLAVE = "banco1234";
const pass = await bcrypt.hash(CLAVE, 10);

async function cuenta(email, name, company, extra = {}) {
    const vieja = await db.user.findUnique({ where: { email } });
    if (vieja) await db.user.delete({ where: { id: vieja.id } });
    return db.user.create({ data: { email, name, company, password: pass, role: "user", status: true, ...extra } });
}

const madre = await cuenta("jefe@filtro.test", "Carlos Madre", "Casa Madre", { role: "admin" });
const atencion = await cuenta("atencion@filtro.test", "Atencion", "Hija Atencion");
const ventas = await cuenta("ventas@filtro.test", "Ventas", "Hija Ventas");

for (const hija of [atencion, ventas]) {
    await db.linkedAccount.create({ data: { masterUserId: madre.id, linkedUserId: hija.id } });
}

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
}

const ahora = Date.now();
let orden = 0;

async function linea(duena, instanceName, instanceId) {
    await db.instancia.deleteMany({ where: { instanceName } });
    await db.instancia.create({
        data: { instanceName, displayName: instanceName, userId: duena.id, instanceId, instanceType: "waha" },
    });
}

async function chat(duena, instanceName, instanceId, jid, nombre, etiquetas = []) {
    const sesion = await db.session.create({
        data: { userId: duena.id, remoteJid: jid, pushName: nombre, instanceId, status: true },
    });
    for (const tagId of etiquetas) await db.sessionTag.create({ data: { sessionId: sesion.id, tagId } });
    const cuando = ahora - (orden += 1) * 60000;
    const id = `F${orden}`;
    await db.chatMessage.create({
        data: {
            userId: duena.id,
            instanceName,
            instanceType: "waha",
            remoteJid: jid,
            messageId: id,
            fromMe: false,
            pushName: nombre,
            messageType: "conversation",
            content: `Hola, soy ${nombre}`,
            raw: { key: { id, remoteJid: jid, fromMe: false }, message: { conversation: `Hola, soy ${nombre}` } },
            messageTimestamp: new Date(cuando),
        },
    });
    await db.chatConversation.create({
        data: {
            userId: duena.id,
            instanceName,
            instanceType: "waha",
            remoteJid: jid,
            pushName: nombre,
            lastMessageId: id,
            lastMessageFromMe: false,
            lastMessageType: "conversation",
            lastMessageContent: `Hola, soy ${nombre}`,
            lastMessageRaw: { key: { id, remoteJid: jid, fromMe: false }, message: { conversation: `Hola, soy ${nombre}` } },
            lastMessageTimestamp: new Date(cuando),
        },
    });
    return sesion.id;
}

const tag = (duena, name, color) =>
    db.tag.create({ data: { userId: duena.id, name, slug: name.toLowerCase(), color } });

await linea(madre, "FILTRO_MADRE", "inst-filtro-m");
await linea(atencion, "FILTRO_ATENCION", "inst-filtro-a");
await linea(ventas, "FILTRO_VENTAS", "inst-filtro-v");

const vip = await tag(madre, "VIP", "#7C3AED");
const interesadoA = await tag(atencion, "Interesado", "#2563EB");
const reclamo = await tag(atencion, "Reclamo", "#DC2626");
const interesadoV = await tag(ventas, "Interesado", "#16A34A");

await chat(madre, "FILTRO_MADRE", "inst-filtro-m", "573000000001@s.whatsapp.net", "Mario Madre", [vip.id]);
const ana = await chat(atencion, "FILTRO_ATENCION", "inst-filtro-a", "573000000002@s.whatsapp.net", "Ana Atencion", [interesadoA.id]);
const beto = await chat(atencion, "FILTRO_ATENCION", "inst-filtro-a", "573000000003@s.whatsapp.net", "Beto Atencion", [reclamo.id]);
const caro = await chat(atencion, "FILTRO_ATENCION", "inst-filtro-a", "573000000004@s.whatsapp.net", "Caro Atencion");
await chat(ventas, "FILTRO_VENTAS", "inst-filtro-v", "573000000005@s.whatsapp.net", "Vera Ventas", [interesadoV.id]);

const eVentasA = await crearEmbudo({ cuentaId: atencion.id, nombre: "Embudo de ventas", creadoPorId: atencion.id });
await crearEmbudo({ cuentaId: atencion.id, nombre: "Soporte", creadoPorId: atencion.id });
await crearEmbudo({ cuentaId: ventas.id, nombre: "Embudo de ventas", creadoPorId: ventas.id });

const etapas = await lasEtapasDe([eVentasA]);
const por = (nombre) => etapas.find((e) => e.nombre === nombre).id;
await moverConversacion({ sessionId: beto, embudoId: eVentasA, etapaId: por("Cotizado"), movidoPorId: madre.id });
await moverConversacion({ sessionId: caro, embudoId: eVentasA, etapaId: por("Contactado"), movidoPorId: madre.id });
void ana;

console.log(JSON.stringify({ madre: madre.id, atencion: atencion.id, ventas: ventas.id }));
await db.$disconnect();
