/**
 * Los DATOS DE EJEMPLO de las capturas de la guía de Campañas, encima de
 * `sembrar-barra.mjs` (que pone la cuenta, su línea y una conversación).
 *
 * Con la forma de una cuenta de verdad: campañas en las SEIS columnas del
 * tablero —pendientes, para hoy, mañana, una que se repite (de antes de que las
 * campañas salieran una sola vez), enviadas y una vencida—, cada una con
 * VARIOS contactos (las dos listas separadas por comas que guarda la fila) y su
 * historial de envíos tal como lo deja el motor: una fila de `seguimientos` por
 * contacto, con `idNodo camping-<id>-<n>`, en todos sus estados —pendiente,
 * enviado, pausado y uno que falló tres veces—. Y leads con su estado, su
 * puntaje y sus etiquetas, para que la segmentación tenga a quién encontrar.
 *
 * Las horas son RELATIVAS a ahora, en la zona de la cuenta (Bogotá), porque la
 * columna en la que cae una campaña sale de su hora.
 *
 * Se puede correr las veces que haga falta: borra lo suyo y lo vuelve a poner.
 * El script de capturas lo vuelve a correr antes del vídeo.
 */
process.env.TZ = "America/Bogota";

import { PrismaClient } from "@prisma/client";
import { MENU_DE_UN_CLIENTE, sembrarElMarco } from "./sembrar-marco-de-la-guia.mjs";

const db = new PrismaClient();

const dueno = await sembrarElMarco(db, {
    path: "/campaigns",
    title: "Guía de Campañas",
    description: "Aprende a enviar campañas por WhatsApp a tus contactos en la plataforma",
    url: "/guia/campanas",
});

/* El SERVIDOR de la cuenta: sin él la pantalla no pinta nada. Uno de ejemplo. */
await db.user.update({ where: { id: dueno.id }, data: { apiKeyId: null } });
await db.apiKey.deleteMany({ where: { url: "https://servidor.ejemplo.co" } });
const servidor = await db.apiKey.create({ data: { url: "https://servidor.ejemplo.co", key: "clave-de-ejemplo" } });
await db.user.update({ where: { id: dueno.id }, data: { apiKeyId: servidor.id, timezone: "America/Bogota" } });

const LINEA = "BANCO_VENTAS";
const INSTANCIA = "inst-banco-1";

/* Los LEADS, con su estado, su puntaje y sus etiquetas (los que segmentan). */
const CONTACTOS = [
    ["573001112233", "Mariana Toro", "CALIENTE", 88, ["Cliente VIP"]],
    ["573014445566", "Andrés Pérez", "TIBIO", 62, ["Interesado"]],
    ["573105556677", "Valentina Ruiz", "CALIENTE", 91, ["Cliente VIP", "Interesado"]],
    ["573157778899", "Carlos Gómez", "FRIO", 24, []],
    ["573201234567", "Laura Méndez", "TIBIO", 55, ["Interesado"]],
    ["573186543210", "Felipe Ríos", "FINALIZADO", 70, ["Cliente VIP"]],
    ["573224567890", "Sofía Castro", "CALIENTE", 80, ["Interesado"]],
    ["573137654321", "Diego Vargas", "FRIO", 18, []],
];
await db.session.deleteMany({ where: { userId: dueno.id } });
await db.tag.deleteMany({ where: { userId: dueno.id } });
const ETIQUETAS = { "Cliente VIP": "#7C3AED", Interesado: "#2563EB", Recompra: "#16A34A" };
const etiquetas = {};
for (const [i, [name, color]] of Object.entries(ETIQUETAS).entries()) {
    etiquetas[name] = await db.tag.create({
        data: { userId: dueno.id, name, slug: name.toLowerCase().replace(/\s+/g, "-"), color, order: i },
    });
}
for (const [numero, nombre, estado, puntaje, tags] of CONTACTOS) {
    const s = await db.session.create({
        data: {
            userId: dueno.id,
            remoteJid: `${numero}@s.whatsapp.net`,
            pushName: nombre,
            instanceId: INSTANCIA,
            status: true,
            leadStatus: estado,
            leadScore: puntaje,
        },
    });
    for (const t of tags) await db.sessionTag.create({ data: { sessionId: s.id, tagId: etiquetas[t].id } });
}
const jid = (nombre) => `${CONTACTOS.find(([, n]) => n === nombre)[0]}@s.whatsapp.net`;

/* Los FLUJOS que se pueden asociar. Nombres cortos: la tarjeta los enseña enteros. */
await db.reminders.deleteMany({ where: { userId: dueno.id } });
await db.seguimiento.deleteMany({ where: { OR: [{ idNodo: { startsWith: "camping-" } }, { idNodo: { startsWith: "reminder-" } }] } });
await db.workflow.deleteMany({ where: { userId: dueno.id } });
const FLUJOS = ["Catálogo", "Pedir pago", "Agendar cita", "Encuesta"];
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
const comoSeGuarda = (d) => `${dos(d.getDate())}/${dos(d.getMonth() + 1)}/${d.getFullYear()} ${dos(d.getHours())}:${dos(d.getMinutes())}`;
const elDia = (dias, h, m = 0) => {
    const d = new Date(ahora);
    d.setDate(d.getDate() + dias);
    d.setHours(h, m, 0, 0);
    return d;
};
const hoy = (() => {
    const d = new Date(ahora.getTime() + 2 * 3_600_000);
    const tope = elDia(0, 23, 30);
    const r = d > tope ? tope : d;
    r.setMinutes(Math.floor(r.getMinutes() / 5) * 5, 0, 0);
    return r;
})();

/*
 * Las CAMPAÑAS, en el orden de la lista. `envios` dice el estado de cada
 * contacto, en el mismo orden que `contactos`.
 */
const CAMPANAS = [
    {
        title: "PROMOCIÓN DE OCTUBRE",
        description: "Hola {{nombre}}, este mes tienes 20 % de descuento en toda la tienda.",
        contactos: ["Mariana Toro", "Valentina Ruiz", "Sofía Castro", "Andrés Pérez"],
        cuando: elDia(1, 10, 0),
        flujo: "Catálogo",
        envios: ["pending", "pending", "pending", "pending"],
    },
    {
        title: "RECORDAR PAGO",
        description: "Hola {{nombre}}, hoy vence tu cuota. Te comparto el recibo.",
        contactos: ["Andrés Pérez", "Laura Méndez"],
        cuando: hoy,
        flujo: "Pedir pago",
        media: { tipo: "seguimiento-document", url: "https://archivos.ejemplo.co/recibo.pdf", nombre: "recibo.pdf" },
        envios: ["pending", "pending"],
    },
    {
        title: "NUEVA COLECCIÓN",
        description: "Hola {{nombre}}, ya llegó la nueva colección. Mira el catálogo.",
        contactos: ["Mariana Toro", "Felipe Ríos", "Sofía Castro"],
        cuando: elDia(5, 9, 30),
        flujo: "Catálogo",
        media: { tipo: "seguimiento-image", url: "https://archivos.ejemplo.co/coleccion.png", nombre: "coleccion.png" },
        envios: ["pending", "pending", "pending"],
    },
    {
        title: "INVITACIÓN AL TALLER",
        description: "Hola {{nombre}}, te dejo una nota de voz con la invitación al taller.",
        contactos: ["Carlos Gómez", "Diego Vargas", "Laura Méndez"],
        cuando: elDia(3, 16, 0),
        flujo: "Agendar cita",
        media: { tipo: "seguimiento-audio", url: "https://archivos.ejemplo.co/invitacion.webm", nombre: "invitacion.webm" },
        envios: ["canceled", "canceled", "canceled"],
    },
    {
        title: "BOLETÍN SEMANAL",
        description: "Hola {{nombre}}, estas son las novedades de la semana.",
        contactos: ["Mariana Toro", "Valentina Ruiz"],
        cuando: elDia(4, 8, 30),
        repeatType: "WEEKLY",
        envios: ["pending", "pending"],
    },
    {
        title: "ENCUESTA DE SERVICIO",
        description: "Hola {{nombre}}, ¿cómo te pareció la atención? Respóndenos en un minuto.",
        contactos: ["Mariana Toro", "Andrés Pérez", "Valentina Ruiz", "Laura Méndez", "Felipe Ríos"],
        cuando: elDia(-2, 11, 0),
        flujo: "Encuesta",
        enviado: true,
        envios: ["sent", "sent", "sent", "sent", "failed"],
    },
    {
        title: "BIENVENIDA",
        description: "Hola {{nombre}}, ¡gracias por escribirnos! Aquí tienes nuestro catálogo.",
        contactos: ["Sofía Castro", "Diego Vargas"],
        cuando: elDia(-1, 9, 0),
        enviado: true,
        envios: ["sent", "sent"],
    },
    {
        title: "REACTIVAR CLIENTES",
        description: "Hola {{nombre}}, hace tiempo no hablamos. ¿Te puedo ayudar en algo?",
        contactos: ["Carlos Gómez", "Diego Vargas"],
        cuando: elDia(-1, 15, 0),
        envios: ["failed", "pending"],
    },
];

const telefono = (j) => j.replace(/@.*/, "");
for (const [i, c] of CAMPANAS.entries()) {
    const jids = c.contactos.map(jid);
    const fila = await db.reminders.create({
        data: {
            title: c.title,
            description: c.description,
            time: comoSeGuarda(c.cuando),
            repeatType: c.repeatType ?? "NONE",
            instanceName: LINEA,
            serverUrl: servidor.url,
            userId: dueno.id,
            workflowId: c.flujo ? flujos[c.flujo].id : null,
            remoteJid: jids.join(","),
            pushName: c.contactos.join(","),
            isSchedule: false,
            isCampaign: true,
            order: i,
            sentAt: c.enviado ? c.cuando : null,
        },
    });
    for (const [n, j] of jids.entries()) {
        const estado = c.envios[n];
        const sale = new Date(c.cuando.getTime() + (n + 1) * 45_000);
        await db.seguimiento.create({
            data: {
                idNodo: `camping-${fila.id}-${n + 1}`,
                serverurl: servidor.url,
                instancia: LINEA,
                remoteJid: j,
                mensaje: c.description.replace("{{nombre}}", c.contactos[n].split(" ")[0]).replace("{{telefono}}", telefono(j)),
                tipo: c.media?.tipo ?? "text",
                media: c.media?.url ?? null,
                nameFile: c.media?.nombre ?? null,
                time: sale.toISOString(),
                workflowId: c.flujo ? flujos[c.flujo].id : null,
                followUpStatus: estado,
                followUpAttempt: estado === "sent" ? 1 : estado === "failed" ? 3 : 0,
                followUpMaxAttempts: 3,
                errorReason: estado === "failed" ? "El número no tiene WhatsApp" : null,
            },
        });
    }
}

console.log(JSON.stringify({ campanas: CAMPANAS.length, contactos: CONTACTOS.length, flujos: FLUJOS.length, modulos: MENU_DE_UN_CLIENTE.length }));
await db.$disconnect();
