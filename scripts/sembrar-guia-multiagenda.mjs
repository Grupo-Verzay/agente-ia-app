/**
 * Los DATOS DE EJEMPLO de las capturas de la guía de Multiagenda, encima del
 * marco común (`sembrar-marco-de-la-guia.mjs`: la cuenta de un cliente con su
 * menú de verdad).
 *
 * Con la forma de un equipo de verdad: una clínica con tres especialistas,
 * cada uno con sus días, sus horas y los servicios que atiende; cuatro
 * servicios con su color, su mensaje y recordatorios propios; citas de esta
 * semana en los siete estados —así el calendario, el Kanban y las cifras tienen
 * qué enseñar—; un formulario por servicio y una automatización en la columna
 * Confirmada.
 *
 * Corre en la zona de la cuenta (Bogotá): con la del contenedor (UTC) las
 * citas caerían a las cinco de la mañana.
 *
 * Se puede correr las veces que haga falta: borra lo suyo y lo vuelve a poner.
 * El script de capturas lo vuelve a correr antes del vídeo, porque las
 * capturas cambian estados y crean servicios y recordatorios.
 */
process.env.TZ = "America/Bogota";

import { PrismaClient } from "@prisma/client";
import { MENU_DE_UN_CLIENTE, sembrarElMarco } from "./sembrar-marco-de-la-guia.mjs";

const db = new PrismaClient();

const dueno = await sembrarElMarco(db, {
    path: "/bookings",
    title: "Guía de Multiagenda",
    description: "Aprende a gestionar las citas de tu equipo en la plataforma",
    url: "/guia/multiagenda",
});

await db.user.update({ where: { id: dueno.id }, data: { timezone: "America/Bogota" } });

/* El EQUIPO: uno por cuenta. Se borra y se vuelve a crear con todo lo suyo. */
await db.bookingFormResponse.deleteMany({ where: { userId: dueno.id } });
await db.bookingQuestion.deleteMany({ where: { userId: dueno.id } });
await db.team.deleteMany({ where: { userId: dueno.id } });
await db.apptAutomation.deleteMany({ where: { userId: dueno.id } });

const equipo = await db.team.create({
    data: {
        userId: dueno.id,
        name: "Clínica Sonrisa",
        description: "Odontología general y estética",
        timezone: "America/Bogota",
        minNoticeMinutes: 120,
    },
});

/* Los SERVICIOS, con su color, su mensaje y sus recordatorios propios. */
const SERVICIOS = [
    {
        name: "VALORACIÓN INICIAL",
        description: "Primera cita para conocer tu caso",
        duration: 30,
        color: "#3B82F6",
        messageText: "¡Hola @client_name! Tu @service_name quedó agendada para el @appointment_datetime. Te esperamos.",
        recordatorios: [
            { timeMinutes: 1440, message: "Hola @client_name, mañana es tu valoración. Responde SÍ para confirmar." },
            { timeMinutes: 120, message: "Hola @client_name, tu valoración es en 2 horas. ¡Te esperamos!" },
        ],
    },
    {
        name: "LIMPIEZA DENTAL",
        description: "Limpieza completa y revisión",
        duration: 45,
        color: "#10B981",
        messageText: "Tu @service_name quedó agendada para el @appointment_datetime. Llega 10 minutos antes.",
        recordatorios: [{ timeMinutes: 1440, message: "Hola @client_name, te recordamos tu limpieza dental de mañana." }],
    },
    {
        name: "ORTODONCIA",
        description: "Control de brackets",
        duration: 30,
        color: "#8B5CF6",
        messageText: "Tu control de @service_name quedó agendado para el @appointment_datetime.",
        recordatorios: [{ timeMinutes: 180, message: "Hola @client_name, tu control de ortodoncia es en 3 horas." }],
    },
    {
        name: "BLANQUEAMIENTO",
        description: "Sesión de blanqueamiento",
        duration: 60,
        color: "#F59E0B",
        messageText: "Tu sesión de @service_name quedó agendada para el @appointment_datetime.",
        recordatorios: [],
    },
];
const servicios = [];
for (const [i, s] of SERVICIOS.entries()) {
    servicios.push(
        await db.teamService.create({
            data: {
                teamId: equipo.id,
                name: s.name,
                description: s.description,
                duration: s.duration,
                color: s.color,
                messageText: s.messageText,
                remindersConfig: s.recordatorios,
                order: i,
            },
        }),
    );
}

/* Los ESPECIALISTAS: sus horarios y los servicios que atiende cada uno. */
const ESPECIALISTAS = [
    {
        name: "Dra. Laura Méndez",
        bio: "Odontóloga general, 10 años de experiencia",
        color: "#3B82F6",
        defaultDuration: 30,
        meetingLink: "https://meet.google.com/abc-defg-hij",
        franjas: [1, 2, 3, 4, 5].flatMap((d) => [
            [d, "08:00", "12:00"],
            [d, "14:00", "18:00"],
        ]),
        servicios: [0, 1],
    },
    {
        name: "Dr. Andrés Rojas",
        bio: "Ortodoncista",
        color: "#8B5CF6",
        defaultDuration: 30,
        meetingLink: null,
        franjas: [1, 3, 5].map((d) => [d, "09:00", "17:00"]),
        servicios: [0, 2],
    },
    {
        name: "Dra. Sofía Pardo",
        bio: "Estética dental",
        color: "#F59E0B",
        defaultDuration: 60,
        meetingLink: null,
        franjas: [
            [2, "10:00", "18:00"],
            [4, "10:00", "18:00"],
            [6, "09:00", "13:00"],
        ],
        servicios: [1, 3],
    },
];
const especialistas = [];
for (const e of ESPECIALISTAS) {
    const m = await db.teamMember.create({
        data: {
            teamId: equipo.id,
            name: e.name,
            bio: e.bio,
            color: e.color,
            defaultDuration: e.defaultDuration,
            meetingLink: e.meetingLink,
        },
    });
    for (const [dayOfWeek, startTime, endTime] of e.franjas) {
        await db.teamMemberAvailability.create({ data: { teamMemberId: m.id, dayOfWeek, startTime, endTime } });
    }
    for (const sv of e.servicios) {
        await db.teamMemberService.create({ data: { teamMemberId: m.id, teamServiceId: servicios[sv].id } });
    }
    especialistas.push(m);
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
const hoy = new Date();
const desdeElLunes = (hoy.getDay() + 6) % 7;
const CLIENTES = [
    ["Mariana Toro", "573001112233"],
    ["Andrés Pérez", "573104445566"],
    ["Lucía Gómez", "573157778899"],
    ["Carlos Ruiz", "573208889900"],
    ["Sofía Martínez", "573012223344"],
    ["Jorge Ramírez", "573125556677"],
    ["Valentina López", "573186667788"],
    ["Daniel Castro", "573019990011"],
];
const CITAS = [
    // [cliente, especialista, servicio, díasDesdeHoy, hora, estado]
    [0, 0, 0, 0, 10, "PENDIENTE"],
    [1, 0, 1, 0, 8, "CONFIRMADA"],
    [2, 1, 2, 0, 15, "CONFIRMADA"],
    [3, 2, 3, 0, 17, "PENDIENTE"],
    [4, 0, 1, 1, 9, "PENDIENTE"],
    [5, 1, 0, 1, 14, "CONFIRMADA"],
    [6, 2, 1, 2, 11, "PENDIENTE"],
    [7, 1, 2, 2, 16, "CONFIRMADA"],
    [1, 0, 0, -desdeElLunes, 9, "ATENDIDA"],
    [2, 1, 2, -desdeElLunes, 15, "NO_ASISTIDA"],
    [3, 0, 1, 3, 10, "CANCELADA"],
    [4, 2, 3, -1, 11, "FINALIZADO"],
    [5, 1, 0, -1, 16, "DESCARTADO"],
    [6, 0, 1, 4, 9, "ATENDIDA"],
];
const citas = [];
for (const [c, e, sv, dias, hora, status] of CITAS) {
    const inicio = aLas(dias, hora);
    citas.push(
        await db.bookingAppointment.create({
            data: {
                teamId: equipo.id,
                teamMemberId: especialistas[e].id,
                teamServiceId: servicios[sv].id,
                clientName: CLIENTES[c][0],
                clientPhone: CLIENTES[c][1],
                startTime: inicio,
                endTime: new Date(inicio.getTime() + SERVICIOS[sv].duration * 60000),
                timezone: "America/Bogota",
                status,
            },
        }),
    );
}

/* El FORMULARIO de cada servicio. */
const PREGUNTAS = [
    [0, "¿Es tu primera vez con nosotros?", "SELECT", ["Sí", "No"], true],
    [0, "¿Qué te gustaría mejorar?", "TEXT", [], true],
    [0, "¿Algo que debamos saber antes de la cita?", "TEXTAREA", [], false],
    [1, "¿Cuándo fue tu última limpieza?", "SELECT", ["Hace menos de 6 meses", "Hace más de 6 meses", "No recuerdo"], true],
    [2, "¿Llevas brackets con nosotros?", "SELECT", ["Sí", "No"], true],
];
const preguntas = [];
for (const [i, [sv, label, type, options, required]] of PREGUNTAS.entries()) {
    preguntas.push(
        await db.bookingQuestion.create({
            data: { userId: dueno.id, teamServiceId: servicios[sv].id, label, type, options, required, order: i, active: true },
        }),
    );
}
await db.bookingFormResponse.create({
    data: {
        userId: dueno.id,
        bookingAppointmentId: citas[0].id,
        answers: preguntas
            .slice(0, 3)
            .map((p, k) => ({ questionId: p.id, label: p.label, answer: ["Sí", "La sensibilidad en los dientes", ""][k] })),
    },
});

/* Las CONVERSACIONES de los clientes: un recordatorio sale por la de cada uno. */
for (const [nombre, numero] of CLIENTES) {
    const jid = `${numero}@s.whatsapp.net`;
    await db.session.upsert({
        where: { userId_instanceId_remoteJid: { userId: dueno.id, instanceId: "inst-banco-1", remoteJid: jid } },
        update: { pushName: nombre },
        create: { userId: dueno.id, remoteJid: jid, pushName: nombre, instanceId: "inst-banco-1", status: true },
    });
}

/* Una AUTOMATIZACIÓN en la columna Confirmada, para que su panel tenga qué enseñar. */
await db.apptAutomation.create({
    data: {
        userId: dueno.id,
        apptStatus: "CONFIRMADA",
        name: "Agradecer la confirmación",
        actions: {
            create: [
                {
                    type: "MESSAGE",
                    order: 0,
                    config: { text: "¡Gracias por confirmar tu cita! Te esperamos." },
                },
            ],
        },
    },
});

console.log(
    JSON.stringify({
        cuenta: dueno.id,
        servicios: servicios.length,
        especialistas: especialistas.length,
        citas: citas.length,
        preguntas: preguntas.length,
        modulos: MENU_DE_UN_CLIENTE.length,
    }),
);
await db.$disconnect();
