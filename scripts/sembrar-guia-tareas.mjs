/**
 * Los DATOS DE EJEMPLO de las capturas de la guía de Mis tareas, encima de
 * `sembrar-barra.mjs` (que pone la cuenta, su línea y una conversación).
 *
 * Con la forma de una cuenta de verdad: tareas en TODOS los grupos de la lista
 * —vencidas, hoy, mañana, esta semana, más adelante y completadas con su
 * resultado—, de los cinco tipos de fábrica y de uno propio («Visita»), con su
 * contacto y su asesor, y una automatización en el tipo «Llamada» para que el
 * panel de automatizaciones no salga vacío. Con tres tareas iguales una guía no
 * enseña nada.
 *
 * Las horas son RELATIVAS a ahora, en la zona de la cuenta (Bogotá): el grupo de
 * una tarea sale de su hora, y una de «mañana» tiene que ser de mañana el día
 * que se generan las capturas. La de «hoy» va dentro de unas horas sin pasarse
 * de la noche, para que no se vuelva vencida a mitad de las capturas.
 *
 * Se puede correr las veces que haga falta: borra lo suyo y lo vuelve a poner.
 * El script de capturas lo vuelve a correr antes del vídeo, porque las capturas
 * crean, completan y cancelan tareas y el vídeo tiene que salir del mismo punto
 * de partida.
 *
 * El marco —cuenta de cliente, su menú, «Ver tutoriales» y «Soporte»— es el de
 * todas las guías (`sembrar-marco-de-la-guia.mjs`).
 */
process.env.TZ = "America/Bogota";

import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { MENU_DE_UN_CLIENTE, sembrarElMarco } from "./sembrar-marco-de-la-guia.mjs";

const db = new PrismaClient();

const dueno = await sembrarElMarco(db, {
    path: "/tareas",
    title: "Guía de Mis tareas",
    description: "Aprende a organizar y completar tus tareas en la plataforma",
    url: "/guia/tareas",
});
// El número de aviso de cada asesor sale debajo de su nombre en la lista: con
// el de fábrica («0000000000») la guía enseñaría un teléfono imposible.
await db.user.update({ where: { id: dueno.id }, data: { timezone: "America/Bogota", notificationNumber: "573009990000" } });

/* ── El EQUIPO: con id FIJO, que el color de las iniciales sale de él ────── */
const pass = await bcrypt.hash("banco1234", 10);
const EQUIPO = [
    { id: "guia-tareas-sofia", email: "sofia@banco.test", name: "Sofía Martínez", advisorRole: "administrador", notificationNumber: "573009990011" },
    { id: "guia-tareas-laura", email: "laura@banco.test", name: "Laura Gómez", advisorRole: "agente", notificationNumber: "573009990022" },
    { id: "guia-tareas-andres", email: "andres@banco.test", name: "Andrés Ruiz", advisorRole: "agente", notificationNumber: "573009990033" },
];
const correos = EQUIPO.map((p) => p.email);
// La semilla común crea a Sofía con un id al azar: se quita para que nazca con el fijo.
const conOtroId = await db.user.findMany({
    where: { email: { in: correos }, id: { notIn: EQUIPO.map((p) => p.id) } },
    select: { id: true },
});
if (conOtroId.length) {
    const ids = conOtroId.map((u) => u.id);
    await db.session.updateMany({ where: { assignedAdvisorId: { in: ids } }, data: { assignedAdvisorId: null } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
}
for (const p of EQUIPO) {
    await db.user.upsert({
        where: { email: p.email },
        update: { name: p.name, notificationNumber: p.notificationNumber, ownerId: dueno.id, advisorRole: p.advisorRole, advisorAvailable: true, status: true },
        create: { ...p, advisorAvailable: true, password: pass, role: "user", status: true, ownerId: dueno.id },
    });
}
const asesor = (nombre) => {
    if (nombre === "Mi Negocio") return { id: dueno.id, name: "Mi Negocio" };
    const p = EQUIPO.find((e) => e.name === nombre);
    return { id: p.id, name: p.name };
};

/* ── Los CONTACTOS ───────────────────────────────────────────────────────── */
const INSTANCIA = "inst-banco-1";
const CONTACTOS = [
    ["573001112233", "Mariana Toro"],
    ["573014445566", "Andrés Pérez"],
    ["573105556677", "Valentina Ruiz"],
    ["573157778899", "Carlos Gómez"],
    ["573201234567", "Laura Méndez"],
    ["573186543210", "Felipe Ríos"],
];
// Las tareas primero: cuelgan de las sesiones.
await db.task.deleteMany({ where: { ownerId: dueno.id } });
await db.session.deleteMany({ where: { userId: dueno.id } });
const sesiones = {};
for (const [numero, nombre] of CONTACTOS) {
    sesiones[nombre] = await db.session.create({
        data: { userId: dueno.id, remoteJid: `${numero}@s.whatsapp.net`, pushName: nombre, instanceId: INSTANCIA, status: true },
    });
}

/* ── Un TIPO PROPIO y una AUTOMATIZACIÓN ────────────────────────────────── */
await db.userTaskType.deleteMany({ where: { ownerId: dueno.id } });
await db.userTaskType.create({ data: { ownerId: dueno.id, name: "Visita", order: 0 } });

await db.taskTypeAutomation.deleteMany({ where: { userId: dueno.id } });
await db.taskTypeAutomation.create({
    data: {
        userId: dueno.id,
        taskType: "Llamada",
        name: "Avisar antes de llamar",
        enabled: true,
        actions: {
            create: [
                { type: "NOTIFY_ADVISOR", order: 0, delayMinutes: 0, config: { message: "Tienes una llamada programada" } },
                { type: "MESSAGE", order: 1, delayMinutes: 30, config: { text: "Hola, en un momento te llamamos" } },
            ],
        },
    },
});

/* ── Las horas, relativas a AHORA ────────────────────────────────────────── */
const ahora = new Date();
const elDia = (dias, h, m = 0) => {
    const d = new Date(ahora);
    d.setDate(d.getDate() + dias);
    d.setHours(h, m, 0, 0);
    return d;
};
/** Hoy, dentro de unas horas y sin pasarse de las 23:30. */
const hoy = (horas) => {
    const d = new Date(ahora.getTime() + horas * 3_600_000);
    const tope = elDia(0, 23, 30);
    const r = d > tope ? tope : d;
    r.setMinutes(Math.floor(r.getMinutes() / 5) * 5, 0, 0);
    return r;
};
/** Vencida hoy: hace dos horas, o ayer a última hora si es de madrugada. */
const vencidaHoy = (() => {
    const d = new Date(ahora.getTime() - 2 * 3_600_000);
    if (d.getDate() !== ahora.getDate()) return elDia(-1, 18, 0);
    d.setMinutes(0, 0, 0);
    return d;
})();

/*
 * Las TAREAS. Títulos cortos y en mayúscula, como las crea la pantalla: la
 * descripción ES el título que se ve en la lista.
 */
const TAREAS = [
    { title: "LLAMAR PARA CONFIRMAR EL PEDIDO", type: "Llamada", contacto: "Mariana Toro", asesor: "Laura Gómez", dueDate: elDia(-2, 10, 0) },
    { title: "ENVIAR LA COTIZACIÓN", type: "Email", contacto: "Carlos Gómez", asesor: "Andrés Ruiz", dueDate: vencidaHoy },
    { title: "SEGUIMIENTO DE LA PROPUESTA", type: "Seguimiento", contacto: "Andrés Pérez", asesor: "Sofía Martínez", dueDate: hoy(2) },
    { title: "REUNIÓN DE CIERRE", type: "Reunión", contacto: "Valentina Ruiz", asesor: "Mi Negocio", dueDate: hoy(4) },
    { title: "LLAMAR PARA AGENDAR LA DEMO", type: "Llamada", contacto: "Laura Méndez", asesor: "Laura Gómez", dueDate: elDia(1, 9, 0) },
    { title: "PREPARAR EL CONTRATO", type: "Tarea", contacto: "Felipe Ríos", asesor: "Sofía Martínez", dueDate: elDia(1, 15, 0) },
    { title: "VISITA A LA BODEGA", type: "Visita", contacto: "Carlos Gómez", asesor: "Andrés Ruiz", dueDate: elDia(3, 11, 0) },
    { title: "RECORDAR EL PAGO DE LA CUOTA", type: "Seguimiento", contacto: "Mariana Toro", asesor: "Laura Gómez", dueDate: elDia(4, 10, 0) },
    { title: "RENOVAR EL PLAN", type: "Llamada", contacto: "Felipe Ríos", asesor: "Mi Negocio", dueDate: elDia(12, 9, 0) },
    { title: "ENVIAR EL CATÁLOGO NUEVO", type: "Email", contacto: "Laura Méndez", asesor: "Andrés Ruiz", dueDate: elDia(20, 9, 0) },
    { title: "LLAMAR PARA PRESENTAR EL PLAN", type: "Llamada", contacto: "Valentina Ruiz", asesor: "Laura Gómez", dueDate: elDia(-1, 9, 0), status: "done", result: "Interesado" },
    { title: "ENVIAR LA FACTURA", type: "Email", contacto: "Andrés Pérez", asesor: "Sofía Martínez", dueDate: elDia(-3, 16, 0), status: "done", result: "Contactado" },
];

for (const t of TAREAS) {
    const a = asesor(t.asesor);
    const s = sesiones[t.contacto];
    await db.task.create({
        data: {
            ownerId: dueno.id,
            assignedToId: a.id,
            assignedToName: a.name,
            sessionId: s.id,
            contactName: t.contacto,
            contactJid: s.remoteJid,
            title: t.title,
            type: t.type,
            dueDate: t.dueDate,
            status: t.status ?? "pending",
            result: t.result ?? null,
            createdById: dueno.id,
        },
    });
}

console.log(JSON.stringify({ tareas: TAREAS.length, contactos: CONTACTOS.length, equipo: EQUIPO.length, modulos: MENU_DE_UN_CLIENTE.length }));
await db.$disconnect();
