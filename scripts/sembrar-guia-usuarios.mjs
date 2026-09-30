/**
 * Los DATOS DE EJEMPLO de las capturas de la guía de Usuarios, encima de
 * `sembrar-barra.mjs` (que pone la cuenta y a Sofía).
 *
 * Nombres inventados, pero con la forma de un equipo de verdad: una
 * administradora y tres agentes —una de ellas no disponible, para que se vea
 * el punto gris—, conversaciones repartidas con cargas distintas (la barra de
 * carga sale verde, ámbar y roja), leads en los cinco estados para que las
 * gráficas digan algo, seis conversaciones sin asesor para «Asignar sin
 * atender» y la columna Sin asignar del Pipeline, y una automatización en la
 * columna de una persona. Con tres filas iguales una guía no enseña nada.
 *
 * El marco —cuenta de cliente, su menú, «Ver tutoriales» y «Soporte»— es el de
 * todas las guías (`sembrar-marco-de-la-guia.mjs`).
 *
 * Se puede correr las veces que haga falta: borra lo suyo y lo vuelve a
 * poner. El script de capturas lo vuelve a correr antes del vídeo, porque las
 * capturas crean a una persona, cambian roles y reparten conversaciones, y el
 * vídeo tiene que salir del mismo punto de partida.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { sembrarElMarco } from "./sembrar-marco-de-la-guia.mjs";

const db = new PrismaClient();

const dueno = await sembrarElMarco(db, {
    path: "/equipo",
    title: "Guía de Usuarios",
    description: "Aprende a crear tu equipo y repartir los chats en la plataforma",
    url: "/guia/usuarios",
});

/*
 * La auto-asignación encendida, en Máx. chats con un tope de 8: así la barra
 * de carga de cada persona tiene contra qué medirse.
 */
await db.user.update({ where: { id: dueno.id }, data: { autoAssignEnabled: true, autoAssignMaxChats: 8 } });
for (const tabla of ["reparto_porcentaje_asesor", "reparto_porcentaje"]) {
    const [{ existe }] = await db.$queryRawUnsafe(`SELECT to_regclass($1) IS NOT NULL AS existe`, tabla);
    if (existe) await db.$executeRawUnsafe(`DELETE FROM "${tabla}" WHERE "cuentaId" = $1`, dueno.id);
}

/* ── El EQUIPO ──────────────────────────────────────────────────────────── */
const pass = await bcrypt.hash("banco1234", 10);
// Con id FIJO: el color de las iniciales sale de él (`colorFor`), y la base se
// crea de cero en cada vuelta del generador. Con ids al azar, la misma persona
// salía de un color en las capturas y de otro en el vídeo. Estos cuatro dan
// cuatro colores distintos: Sofía cian, Laura rosa, Andrés azul y Valeria
// fucsia.
const EQUIPO = [
    { id: "guia-usuarios-sofia", email: "sofia@banco.test", name: "Sofía Martínez", advisorRole: "administrador", advisorAvailable: true },
    { id: "guia-usuarios-laura", email: "laura@banco.test", name: "Laura Gómez", advisorRole: "agente", advisorAvailable: true },
    { id: "guia-usuarios-andres", email: "andres@banco.test", name: "Andrés Ruiz", advisorRole: "agente", advisorAvailable: true },
    { id: "guia-usuarios-valeria", email: "valeria@banco.test", name: "Valeria Torres", advisorRole: "agente", advisorAvailable: false },
];
const correos = EQUIPO.map((p) => p.email);
// Lo que dejaron las capturas (la persona que se crea en «Crear un usuario»)
// fuera del equipo de ejemplo: el vídeo sale del mismo punto de partida.
// Con CONSERVAR_EQUIPO=1 —volver a poner lo pendiente A MITAD del recorrido—
// se queda: si no, la persona que se acaba de crear desaparecería de las
// capturas y del vídeo siguientes, y el equipo no sería el mismo de una
// sección a otra.
const conservar = process.env.CONSERVAR_EQUIPO === "1";
const sobran = conservar
    ? []
    : await db.user.findMany({ where: { ownerId: dueno.id, email: { notIn: correos } }, select: { id: true } });
if (sobran.length) {
    await db.session.updateMany({ where: { assignedAdvisorId: { in: sobran.map((u) => u.id) } }, data: { assignedAdvisorId: null } });
    await db.user.deleteMany({ where: { id: { in: sobran.map((u) => u.id) } } });
}
// La semilla común (`sembrar-barra.mjs`) ya crea a Sofía, con un id al azar:
// el `upsert` por correo la conservaría con ese id y su color cambiaría de una
// vuelta a otra (en las capturas salía cian y en el vídeo azul). Se quita la
// que no tenga el id fijo y nace con el suyo.
const conOtroId = await db.user.findMany({
    where: { email: { in: correos }, id: { notIn: EQUIPO.map((p) => p.id) } },
    select: { id: true },
});
if (conOtroId.length) {
    await db.session.updateMany({ where: { assignedAdvisorId: { in: conOtroId.map((u) => u.id) } }, data: { assignedAdvisorId: null } });
    await db.user.deleteMany({ where: { id: { in: conOtroId.map((u) => u.id) } } });
}
const equipo = {};
for (const p of EQUIPO) {
    equipo[p.email] = await db.user.upsert({
        where: { email: p.email },
        update: { name: p.name, ownerId: dueno.id, advisorRole: p.advisorRole, advisorAvailable: p.advisorAvailable, status: true },
        create: { ...p, password: pass, role: "user", status: true, ownerId: dueno.id },
    });
}
const id = (correo) => equipo[`${correo}@banco.test`].id;

/* ── La LÍNEA y las CONVERSACIONES ──────────────────────────────────────── */
await db.instancia.deleteMany({ where: { userId: dueno.id } });
await db.instancia.create({
    data: { instanceName: "VENTAS", displayName: "Ventas", instanceId: "inst-guia-ventas", userId: dueno.id, instanceType: "waha" },
});

/*
 * [nombre, número, a quién, abierta, estado del lead, horas desde la última
 * actividad]. Cargas de Máx. chats 8: Laura 7 (roja), Sofía 4 (ámbar),
 * Andrés 3 y Valeria 2 (verdes). Seis sin asesor.
 */
const CONVERSACIONES = [
    ["María Fernanda López", "573004521876", "laura", true, "CALIENTE", 1],
    ["Distribuidora El Sol", "573017789245", "laura", true, "CALIENTE", 2],
    ["Juan Pablo Restrepo", "573125538810", "laura", true, "TIBIO", 3],
    ["Camila Andrade", "573108842216", "laura", true, "FINALIZADO", 5],
    ["Andrés Gómez", "573202245690", "laura", true, "FINALIZADO", 7],
    ["Óptica Visión", "573017735584", "laura", true, "FRIO", 9],
    ["Ferretería Central", "573006634418", "laura", true, "TIBIO", 12],
    ["Tienda La Esquina", "573016643327", "laura", false, "FINALIZADO", 30],
    ["Valentina Castro", "573114478832", "sofia", true, "CALIENTE", 2],
    ["Daniel Herrera", "573128819940", "sofia", true, "TIBIO", 4],
    ["Isabella Duarte", "573159954471", "sofia", true, "FINALIZADO", 6],
    ["Santiago Morales", "573187723351", "sofia", true, "FRIO", 10],
    ["Clínica Sonrisa", "573146620018", "sofia", false, "DESCARTADO", 40],
    ["Lina Ríos", "573145576023", "andres", true, "CALIENTE", 3],
    ["Carlos Mario Pineda", "573002287764", "andres", true, "FINALIZADO", 8],
    ["Sara Ramírez", "573041126658", "andres", true, "TIBIO", 11],
    ["Panadería San José", "573173346609", "andres", false, "FINALIZADO", 26],
    ["Gimnasio Vital", "573215507742", "andres", false, "DESCARTADO", 52],
    ["Natalia Suárez", "573186651230", "valeria", true, "CALIENTE", 20],
    ["Restaurante El Fogón", "573139987104", "valeria", true, "FRIO", 28],
    ["Miguel Ángel Rojas", "573057741296", "valeria", false, "FINALIZADO", 60],
    ["Hotel Los Almendros", "573224418870", null, true, null, 0.3],
    ["Paula Andrea Mejía", "573113390285", null, true, null, 0.6],
    ["Veterinaria Patitas", "573005512749", null, true, "TIBIO", 0.9],
    ["Jorge Iván Castaño", "573168873416", null, true, null, 1.2],
    ["Floristería Primavera", "573207730951", null, true, null, 1.5],
    ["Alejandra Vélez", "573124406683", null, true, "FRIO", 1.8],
];
await db.session.deleteMany({ where: { userId: dueno.id } });
const ahora = Date.now();
for (const [nombre, numero, quien, abierta, estado, horas] of CONVERSACIONES) {
    const cuando = new Date(ahora - horas * 3_600_000);
    await db.session.create({
        data: {
            userId: dueno.id,
            remoteJid: `${numero}@s.whatsapp.net`,
            pushName: nombre,
            instanceId: "VENTAS",
            status: abierta,
            leadStatus: estado,
            assignedAdvisorId: quien ? id(quien) : null,
            createdAt: new Date(cuando.getTime() - 86_400_000),
            updatedAt: cuando,
        },
    });
}
// `updatedAt` lo pisa Prisma al crear: se deja escrito a mano la última
// actividad, que es lo que enseña la columna «Última actividad».
for (const [, numero, , , , horas] of CONVERSACIONES) {
    await db.$executeRaw`
        UPDATE "Session" SET "updatedAt" = ${new Date(ahora - horas * 3_600_000)}
        WHERE "userId" = ${dueno.id} AND "remoteJid" = ${`${numero}@s.whatsapp.net`}
    `;
}

/* ── Una AUTOMATIZACIÓN en la columna de Laura ──────────────────────────── */
await db.advisorAutomation.deleteMany({ where: { userId: dueno.id } });
await db.advisorAutomation.create({
    data: {
        userId: dueno.id,
        advisorId: id("laura"),
        name: "Bienvenida de Laura",
        actions: {
            create: [
                { type: "NOTIFY_ADVISOR", order: 0, config: {} },
                {
                    type: "MESSAGE",
                    order: 1,
                    config: { text: "Hola, soy Laura y desde ahora te atiendo yo. ¿En qué te ayudo?" },
                },
                { type: "TASK", order: 2, delayMinutes: 60, config: { title: "LLAMAR SI NO HA RESPONDIDO" } },
            ],
        },
    },
});

console.log(`Usuarios: ${EQUIPO.length} personas y ${CONVERSACIONES.length} conversaciones.`);
await db.$disconnect();
