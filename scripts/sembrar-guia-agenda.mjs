/**
 * Los DATOS DE EJEMPLO de las capturas de la guía de Agenda, encima de
 * `sembrar-barra.mjs` (que pone la cuenta, su línea y una conversación).
 *
 * Con la forma de una agenda de verdad: cuatro servicios, horarios de lunes a
 * sábado, citas de esta semana en todos los estados —así el calendario, el
 * Kanban y las cifras tienen qué enseñar—, recordatorios antes de la cita, un
 * formulario de calificación con sus tres tipos de pregunta y respuestas
 * guardadas.
 *
 * Corre en la zona de la cuenta (Bogotá): con la del contenedor (UTC) las
 * citas caerían a las cinco de la mañana.
 *
 * Se puede correr las veces que haga falta: borra lo suyo y lo vuelve a poner.
 * El script de capturas lo vuelve a correr antes del vídeo, porque las
 * capturas cambian estados, crean servicios y preguntas.
 */
process.env.TZ = "America/Bogota";

import { PrismaClient } from "@prisma/client";
import { MENU_DE_UN_CLIENTE, sembrarElMarco } from "./sembrar-marco-de-la-guia.mjs";

const db = new PrismaClient();

const dueno = await sembrarElMarco(db, {
    path: "/schedule",
    title: "Guía de Agenda",
    description: "Aprende a gestionar tus citas y tu agenda en la plataforma",
    url: "/guia/agenda",
});

await db.user.update({
    where: { id: dueno.id },
    data: {
        timezone: "America/Bogota",
        meetingDuration: 60,
        meetingUrl: "https://meet.google.com/abc-defg-hij",
        minNoticeMinutes: 120,
        googleCalendarId: "agenda@minegocio.co",
        googleCalendarSyncEnabled: true,
        // Un servidor de ejemplo: sin él el formulario de recordatorio abre con
        // «No tienes una API Key asignada», que una cuenta de verdad no ve.
        apiKey: {
            connectOrCreate: {
                where: { id: "guia-agenda-servidor" },
                create: { id: "guia-agenda-servidor", url: "https://evolution.minegocio.co", key: "clave-de-ejemplo" },
            },
        },
    },
});

const LINEA = "BANCO_VENTAS";
const INSTANCIA = "inst-banco-1";

/* Limpieza de lo suyo. */
await db.bookingFormResponse.deleteMany({ where: { userId: dueno.id } });
await db.appointment.deleteMany({ where: { userId: dueno.id } });
await db.bookingQuestion.deleteMany({ where: { userId: dueno.id } });
await db.service.deleteMany({ where: { userId: dueno.id } });
await db.userAvailability.deleteMany({ where: { userId: dueno.id } });
await db.reminders.deleteMany({ where: { userId: dueno.id } });

/* Los SERVICIOS. */
const SERVICIOS = [
    ["VALORACIÓN INICIAL", "Primera cita para conocer tu caso", "¡Hola! Tu valoración inicial quedó agendada. Te esperamos."],
    ["LIMPIEZA DENTAL", "Limpieza completa y revisión", "Tu limpieza dental quedó agendada. Llega 10 minutos antes."],
    ["BLANQUEAMIENTO", "Sesión de blanqueamiento", "Tu sesión de blanqueamiento quedó agendada."],
    ["CONTROL", "Cita de seguimiento", "Tu cita de control quedó agendada."],
];
const servicios = [];
for (const [i, [name, description, messageText]] of SERVICIOS.entries()) {
    servicios.push(await db.service.create({ data: { userId: dueno.id, name, description, messageText, order: i } }));
}

/* La DISPONIBILIDAD: lunes a viernes mañana y tarde, sábado por la mañana. */
for (const dia of [1, 2, 3, 4, 5]) {
    await db.userAvailability.create({ data: { userId: dueno.id, dayOfWeek: dia, startTime: "08:00", endTime: "12:00" } });
    await db.userAvailability.create({ data: { userId: dueno.id, dayOfWeek: dia, startTime: "14:00", endTime: "18:00" } });
}
await db.userAvailability.create({ data: { userId: dueno.id, dayOfWeek: 6, startTime: "09:00", endTime: "13:00" } });

/* Los CLIENTES: una conversación por cliente en la línea de la cuenta. */
const CLIENTES = [
    ["573001112233@s.whatsapp.net", "Mariana Toro"],
    ["573104445566@s.whatsapp.net", "Andrés Pérez"],
    ["573157778899@s.whatsapp.net", "Lucía Gómez"],
    ["573208889900@s.whatsapp.net", "Carlos Ruiz"],
    ["573012223344@s.whatsapp.net", "Sofía Martínez"],
    ["573125556677@s.whatsapp.net", "Jorge Ramírez"],
    ["573186667788@s.whatsapp.net", "Valentina López"],
    ["573019990011@s.whatsapp.net", "Daniel Castro"],
];
const sesiones = [];
for (const [jid, nombre] of CLIENTES) {
    const s = await db.session.upsert({
        where: { userId_instanceId_remoteJid: { userId: dueno.id, instanceId: INSTANCIA, remoteJid: jid } },
        update: { pushName: nombre },
        create: { userId: dueno.id, remoteJid: jid, pushName: nombre, instanceId: INSTANCIA, status: true },
    });
    sesiones.push(s);
}

/* Las ETIQUETAS: el Kanban filtra por ellas. */
await db.sessionTag.deleteMany({ where: { session: { userId: dueno.id } } });
await db.tag.deleteMany({ where: { userId: dueno.id, slug: { in: ["primera-vez", "recurrente", "vip"] } } });
const ETIQUETAS = [
    ["Primera vez", "primera-vez", "#3B82F6", [0, 2, 4, 6]],
    ["Recurrente", "recurrente", "#10B981", [1, 3, 5]],
    ["VIP", "vip", "#F59E0B", [1, 7]],
];
for (const [i, [name, slug, color, quienes]] of ETIQUETAS.entries()) {
    const t = await db.tag.create({ data: { userId: dueno.id, name, slug, color, order: i } });
    for (const q of quienes) await db.sessionTag.create({ data: { sessionId: sesiones[q].id, tagId: t.id } });
}

/*
 * Las CITAS de esta semana, en los siete estados. La de hoy a las 10 es la
 * que se abre en la guía (Mariana, Pendiente).
 */
function aLas(diasDesdeHoy, hora, minuto = 0) {
    const d = new Date();
    d.setDate(d.getDate() + diasDesdeHoy);
    d.setHours(hora, minuto, 0, 0);
    return d;
}
// El lunes de esta semana, para repartir citas por la semana.
const hoy = new Date();
const desdeElLunes = (hoy.getDay() + 6) % 7;
const CITAS = [
    // [cliente, servicio, díasDesdeHoy, hora, estado]
    [0, 0, 0, 10, "PENDIENTE"],
    [1, 1, 0, 8, "CONFIRMADA"],
    [2, 2, 0, 15, "CONFIRMADA"],
    [3, 3, 0, 17, "PENDIENTE"],
    [4, 1, 1, 9, "PENDIENTE"],
    [5, 0, 1, 14, "CONFIRMADA"],
    [6, 2, 2, 11, "PENDIENTE"],
    [7, 3, 2, 16, "CONFIRMADA"],
    [1, 3, -desdeElLunes, 9, "ATENDIDA"],
    [2, 0, -desdeElLunes, 15, "NO_ASISTIDA"],
    [3, 1, 3, 10, "CANCELADA"],
    [4, 2, -1, 11, "FINALIZADO"],
    [5, 3, -1, 16, "DESCARTADO"],
    [6, 1, 4, 9, "ATENDIDA"],
];
const citas = [];
for (const [c, sv, dias, hora, status] of CITAS) {
    const inicio = aLas(dias, hora);
    citas.push(
        await db.appointment.create({
            data: {
                userId: dueno.id,
                sessionId: sesiones[c].id,
                clientName: CLIENTES[c][1],
                startTime: inicio,
                endTime: new Date(inicio.getTime() + 60 * 60000),
                timezone: "America/Bogota",
                status,
                serviceId: servicios[sv].id,
            },
        }),
    );
}

/* Los RECORDATORIOS antes de la cita. */
const RECORDATORIOS = [
    ["Un día antes", "Hola {{nombre}}, te recordamos tu cita de mañana. Responde SÍ para confirmar.", "days-1"],
    ["Tres horas antes", "Hola {{nombre}}, tu cita es en 3 horas. ¡Te esperamos!", "hours-3"],
    ["Una hora antes", "Tu cita empieza en una hora. Si no puedes venir, avísanos por aquí.", "hours-1"],
];
for (const [i, [title, description, time]] of RECORDATORIOS.entries()) {
    await db.reminders.create({
        data: { title, description, time, isSchedule: true, isCampaign: false, userId: dueno.id, instanceName: LINEA, order: i },
    });
}

/* El FORMULARIO de calificación: sus tres tipos de pregunta. */
const PREGUNTAS = [
    ["¿Es tu primera vez con nosotros?", "SELECT", ["Sí", "No"], true],
    ["¿Qué te gustaría mejorar?", "TEXT", [], true],
    ["¿Algo que debamos saber antes de la cita?", "TEXTAREA", [], false],
];
const preguntas = [];
for (const [i, [label, type, options, required]] of PREGUNTAS.entries()) {
    preguntas.push(
        await db.bookingQuestion.create({ data: { userId: dueno.id, label, type, options, required, order: i, active: true } }),
    );
}

/* Los REGISTROS: respuestas del formulario de algunas citas. */
const RESPUESTAS = [
    [0, ["Sí", "La sensibilidad en los dientes", "Tengo brackets desde hace un año"], true],
    [1, ["No", "Quiero mantener la limpieza al día", ""], true],
    [2, ["Sí", "El color de los dientes", "Tomo café todos los días"], false],
    [4, ["No", "Revisar una muela que me duele", ""], false],
    [6, ["Sí", "La sonrisa para mi boda", "La boda es en un mes"], true],
];
for (const [i, [cita, respuestas, sincronizado]] of RESPUESTAS.entries()) {
    await db.bookingFormResponse.create({
        data: {
            userId: dueno.id,
            appointmentId: citas[cita].id,
            answers: preguntas.map((p, k) => ({ questionId: p.id, label: p.label, answer: respuestas[k] })),
            syncedToSheets: sincronizado,
            sheetsSyncedAt: sincronizado ? new Date() : null,
            createdAt: new Date(Date.now() - (RESPUESTAS.length - i) * 3600000),
        },
    });
}

console.log(
    JSON.stringify({ servicios: servicios.length, citas: citas.length, preguntas: preguntas.length, modulos: MENU_DE_UN_CLIENTE.length }),
);
await db.$disconnect();
