/**
 * Los DATOS DE EJEMPLO de las capturas de la guía de Recordatorios, encima de
 * `sembrar-barra.mjs` (que pone la cuenta, su línea y una conversación).
 *
 * Con la forma de una cuenta de verdad: recordatorios en las SEIS columnas del
 * tablero —pendientes, para hoy, mañana, que se repiten, enviados y uno
 * vencido—, con sus flujos, un documento y una nota de voz adjuntos, y el
 * historial de envíos que deja el motor (`seguimientos` con `idNodo
 * reminder-<id>`): pendiente, enviado, pausado y uno que falló tres veces. Con
 * tres recordatorios iguales una guía no enseña nada, y sin historial no hay
 * nada que pausar ni reintentar.
 *
 * Las horas son RELATIVAS a ahora, en la zona de la cuenta (Bogotá), porque la
 * columna en la que cae un recordatorio sale de su hora: uno de «mañana» tiene
 * que ser de mañana el día que se generan las capturas.
 *
 * Se puede correr las veces que haga falta: borra lo suyo y lo vuelve a poner.
 * El script de capturas lo vuelve a correr antes del vídeo, porque las
 * capturas crean un recordatorio y el vídeo tiene que salir del mismo punto de
 * partida.
 *
 * El marco —cuenta de cliente, su menú, «Ver tutoriales» y «Soporte»— es el de
 * todas las guías (`sembrar-marco-de-la-guia.mjs`).
 */
process.env.TZ = "America/Bogota";

import { PrismaClient } from "@prisma/client";
import { MENU_DE_UN_CLIENTE, sembrarElMarco } from "./sembrar-marco-de-la-guia.mjs";

const db = new PrismaClient();

const dueno = await sembrarElMarco(db, {
    path: "/reminders",
    title: "Guía de Recordatorios",
    description: "Aprende a programar recordatorios por WhatsApp en la plataforma",
    url: "/guia/recordatorios",
});

/*
 * El SERVIDOR de la cuenta: sin él la pantalla dice «No se encontró una API Key
 * válida» y no pinta nada. Uno de ejemplo: en la guía no sale ninguna clave.
 */
await db.user.update({ where: { id: dueno.id }, data: { apiKeyId: null } });
await db.apiKey.deleteMany({ where: { url: "https://servidor.ejemplo.co" } });
const servidor = await db.apiKey.create({ data: { url: "https://servidor.ejemplo.co", key: "clave-de-ejemplo" } });
await db.user.update({ where: { id: dueno.id }, data: { apiKeyId: servidor.id, timezone: "America/Bogota" } });

const LINEA = "BANCO_VENTAS";
const INSTANCIA = "inst-banco-1";

/* Los CONTACTOS (los leads de la lista de «Contacto»). */
const CONTACTOS = [
    ["573001112233", "Mariana Toro"],
    ["573014445566", "Andrés Pérez"],
    ["573105556677", "Valentina Ruiz"],
    ["573157778899", "Carlos Gómez"],
    ["573201234567", "Laura Méndez"],
    ["573186543210", "Felipe Ríos"],
];
await db.session.deleteMany({ where: { userId: dueno.id } });
for (const [numero, nombre] of CONTACTOS) {
    await db.session.create({
        data: { userId: dueno.id, remoteJid: `${numero}@s.whatsapp.net`, pushName: nombre, instanceId: INSTANCIA, status: true },
    });
}
const jid = (nombre) => `${CONTACTOS.find(([, n]) => n === nombre)[0]}@s.whatsapp.net`;

/* Los FLUJOS que se pueden asociar. Nombres cortos: la tarjeta y el campo los enseñan enteros. */
await db.reminders.deleteMany({ where: { userId: dueno.id } });
await db.seguimiento.deleteMany({ where: { idNodo: { startsWith: "reminder-" } } });
await db.workflow.deleteMany({ where: { userId: dueno.id } });
const FLUJOS = ["Confirmar cita", "Pedir pago", "Catálogo", "Encuesta"];
const flujos = {};
for (const [i, name] of FLUJOS.entries()) {
    flujos[name] = await db.workflow.create({
        data: { userId: dueno.id, name, definition: JSON.stringify({ nodes: [], edges: [] }), status: "active", isPro: true, order: i },
    });
}

/* ------------------------------------------------------------------ */
/* Las horas, relativas a AHORA y en la zona de la cuenta              */
/* ------------------------------------------------------------------ */

const ahora = new Date();
const dos = (n) => String(n).padStart(2, "0");
/** Como la guarda la pantalla: `dd/MM/yyyy HH:mm`, hora local de la cuenta. */
const comoSeGuarda = (d) => `${dos(d.getDate())}/${dos(d.getMonth() + 1)}/${d.getFullYear()} ${dos(d.getHours())}:${dos(d.getMinutes())}`;
/** Un día a `dias` de hoy, a la hora y los minutos dados. */
const elDia = (dias, h, m = 0) => {
    const d = new Date(ahora);
    d.setDate(d.getDate() + dias);
    d.setHours(h, m, 0, 0);
    return d;
};
/** Para hoy: dentro de dos horas, sin pasarse de las 23:30. */
const hoy = (() => {
    const d = new Date(ahora.getTime() + 2 * 3_600_000);
    const tope = elDia(0, 23, 30);
    const r = d > tope ? tope : d;
    r.setMinutes(Math.floor(r.getMinutes() / 5) * 5, 0, 0);
    return r;
})();

/*
 * Los RECORDATORIOS, en el orden de la lista. Cada uno con su historial de
 * envíos: lo que el motor dejaría escrito.
 */
const RECORDATORIOS = [
    {
        title: "CONFIRMAR CITA",
        description: "Hola @client_name, te esperamos mañana a las 10:00 a. m. ¿Nos confirmas tu asistencia?",
        contacto: "Mariana Toro",
        cuando: elDia(1, 9, 0),
        flujo: "Confirmar cita",
        envios: [{ estado: "pending" }],
    },
    {
        title: "RECORDAR CUOTA",
        description: "Hola @client_name, hoy vence la cuota de tu plan. Te comparto el recibo.",
        contacto: "Andrés Pérez",
        cuando: hoy,
        flujo: "Pedir pago",
        envios: [{ estado: "pending", tipo: "seguimiento-document", media: "https://archivos.ejemplo.co/recibo-cuota.pdf", nameFile: "recibo-cuota.pdf" }],
    },
    {
        title: "ENTREGA DEL PEDIDO",
        description: "Hola @client_name, mañana te llega tu pedido entre las 2:00 y las 5:00 p. m.",
        contacto: "Valentina Ruiz",
        cuando: elDia(1, 11, 30),
        envios: [{ estado: "pending" }],
    },
    {
        title: "COTIZACIÓN",
        description: "Hola @client_name, ¿pudiste revisar la cotización que te envié? Quedo atento.",
        contacto: "Carlos Gómez",
        cuando: elDia(5, 10, 0),
        flujo: "Catálogo",
        envios: [{ estado: "pending" }],
    },
    {
        title: "PROMOCIÓN",
        description: "Hola @client_name, esta semana tienes 20 % de descuento en toda la tienda.",
        contacto: "Laura Méndez",
        cuando: elDia(3, 16, 0),
        envios: [{ estado: "canceled" }],
    },
    {
        title: "CUMPLEAÑOS",
        description: "¡Feliz cumpleaños, @client_name! Hoy tienes un regalo esperándote en la tienda.",
        contacto: "Felipe Ríos",
        cuando: elDia(40, 8, 0),
        repeatType: "YEARLY",
        envios: [{ estado: "pending" }],
    },
    {
        title: "REPORTE SEMANAL",
        description: "Hola @client_name, te comparto el reporte de tus pedidos de la semana.",
        contacto: "Mariana Toro",
        cuando: elDia(4, 8, 30),
        repeatType: "WEEKLY",
        envios: [{ estado: "pending" }],
    },
    {
        title: "PAGO MENSUAL",
        description: "Hola @client_name, te dejo una nota de voz con lo de tu pago de este mes.",
        contacto: "Andrés Pérez",
        cuando: elDia(12, 9, 0),
        repeatType: "MONTHLY",
        flujo: "Pedir pago",
        envios: [{ estado: "pending", tipo: "seguimiento-audio", media: "https://archivos.ejemplo.co/nota-de-pago.webm", nameFile: "nota-de-pago.webm" }],
    },
    {
        title: "RESUMEN DEL DÍA",
        description: "Hola @client_name, este es el resumen de lo que quedó pendiente hoy.",
        contacto: "Carlos Gómez",
        cuando: elDia(1, 18, 0),
        repeatType: "WEEKDAYS",
        envios: [{ estado: "pending" }],
    },
    {
        title: "BIENVENIDA",
        description: "Hola @client_name, ¡bienvenido al curso! Aquí tienes el primer módulo.",
        contacto: "Valentina Ruiz",
        cuando: elDia(-3, 9, 0),
        enviado: true,
        envios: [{ estado: "sent", intento: 1 }],
    },
    {
        title: "ENCUESTA",
        description: "Hola @client_name, ¿cómo te pareció la atención? Respóndenos en un minuto.",
        contacto: "Laura Méndez",
        cuando: elDia(-1, 15, 0),
        flujo: "Encuesta",
        enviado: true,
        envios: [{ estado: "sent", intento: 1 }],
    },
    {
        title: "RENOVAR PLAN",
        description: "Hola @client_name, tu plan vence esta semana. ¿Te llamo para renovarlo?",
        contacto: "Felipe Ríos",
        cuando: elDia(-1, 10, 0),
        envios: [{ estado: "failed", intento: 3, error: "El número no tiene WhatsApp" }],
    },
];

for (const [i, r] of RECORDATORIOS.entries()) {
    const remoteJid = jid(r.contacto);
    const fila = await db.reminders.create({
        data: {
            title: r.title,
            description: r.description,
            time: comoSeGuarda(r.cuando),
            repeatType: r.repeatType ?? "NONE",
            instanceName: LINEA,
            serverUrl: servidor.url,
            userId: dueno.id,
            workflowId: r.flujo ? flujos[r.flujo].id : null,
            remoteJid,
            pushName: r.contacto,
            isSchedule: false,
            isCampaign: false,
            order: i,
            sentAt: r.enviado ? r.cuando : null,
        },
    });
    for (const e of r.envios) {
        await db.seguimiento.create({
            data: {
                idNodo: `reminder-${fila.id}`,
                serverurl: servidor.url,
                instancia: LINEA,
                remoteJid,
                mensaje: r.description.replace("@client_name", r.contacto.split(" ")[0]),
                tipo: e.tipo ?? "text",
                media: e.media ?? null,
                nameFile: e.nameFile ?? null,
                time: r.cuando.toISOString(),
                workflowId: r.flujo ? flujos[r.flujo].id : null,
                followUpStatus: e.estado,
                followUpAttempt: e.intento ?? 0,
                followUpMaxAttempts: 3,
                errorReason: e.error ?? null,
            },
        });
    }
}

console.log(JSON.stringify({ recordatorios: RECORDATORIOS.length, contactos: CONTACTOS.length, flujos: FLUJOS.length, modulos: MENU_DE_UN_CLIENTE.length }));
await db.$disconnect();
