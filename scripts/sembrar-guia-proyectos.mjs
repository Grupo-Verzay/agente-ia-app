/**
 * Los DATOS DE EJEMPLO de las capturas de la guía de Proyectos, encima de
 * `sembrar-barra.mjs` (que pone la cuenta, su línea y una conversación).
 *
 * Con la forma de una cuenta de verdad: proyectos en los tres estados —activos,
 * en pausa y terminados—, dos carpetas, un equipo de tres personas, y un
 * proyecto con tareas en LAS CINCO columnas del tablero: vencidas, de esta
 * semana y para más adelante, de varios tipos, con su detalle, sus adjuntos y
 * sus comentarios. Con tres tarjetas iguales una guía no enseña nada.
 *
 * Las fechas son RELATIVAS a ahora, en la zona de la cuenta (Bogotá): el color
 * de cada vencimiento sale del día, y una tarea «de esta semana» tiene que serlo
 * el día que se generan las capturas.
 *
 * Se puede correr las veces que haga falta: borra lo suyo y lo vuelve a poner.
 * El script de capturas lo vuelve a correr antes del vídeo, porque las capturas
 * crean un proyecto y una tarea, y el vídeo tiene que salir del mismo punto.
 *
 * Los adjuntos apuntan a `archivos.ejemplo.co`, que contesta el script de
 * capturas: aquí no hay bucket, y la guía es pública.
 *
 * El marco —cuenta de cliente, su menú, «Ver tutoriales» y «Soporte»— es el de
 * todas las guías (`sembrar-marco-de-la-guia.mjs`).
 */
process.env.TZ = "America/Bogota";

import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { MENU_DE_UN_CLIENTE, sembrarElMarco } from "./sembrar-marco-de-la-guia.mjs";

const db = new PrismaClient();

const dueno = await sembrarElMarco(db, {
    path: "/proyectos",
    title: "Guía de Proyectos",
    description: "Aprende a organizar tus proyectos y sus tareas en la plataforma",
    url: "/guia/proyectos",
});
await db.user.update({ where: { id: dueno.id }, data: { timezone: "America/Bogota" } });

/** Dónde contesta la receta los archivos de ejemplo. */
export const ARCHIVOS_DE_EJEMPLO = "https://archivos.ejemplo.co";

/* ── El EQUIPO: con id FIJO, que el color de las iniciales sale de él ────── */
const pass = await bcrypt.hash("banco1234", 10);
const EQUIPO = [
    { id: "guia-proyectos-sofia", email: "sofia@banco.test", name: "Sofía Martínez", advisorRole: "administrador" },
    { id: "guia-proyectos-laura", email: "laura@banco.test", name: "Laura Gómez", advisorRole: "agente" },
    { id: "guia-proyectos-andres", email: "andres@banco.test", name: "Andrés Ruiz", advisorRole: "agente" },
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
    await db.task.deleteMany({ where: { assignedToId: { in: ids } } });
    await db.projectMember.deleteMany({ where: { userId: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
}
for (const p of EQUIPO) {
    await db.user.upsert({
        where: { email: p.email },
        update: { name: p.name, ownerId: dueno.id, advisorRole: p.advisorRole, advisorAvailable: true, status: true },
        create: { ...p, advisorAvailable: true, password: pass, role: "user", status: true, ownerId: dueno.id },
    });
}
const persona = (nombre) => {
    if (nombre === "Yo") return { id: dueno.id, name: dueno.name ?? "Mi Negocio" };
    const p = EQUIPO.find((e) => e.name === nombre);
    return { id: p.id, name: p.name };
};

/* ── Las tablas de la App que esto escribe (las crea la App al usarlas) ──── */
await db.$executeRawUnsafe(`
  CREATE TABLE IF NOT EXISTS "task_attachments" (
    "id" TEXT PRIMARY KEY, "taskId" INTEGER NOT NULL, "ownerId" TEXT NOT NULL,
    "url" TEXT NOT NULL, "nombre" TEXT NOT NULL, "tipo" TEXT NOT NULL,
    "mimeType" TEXT, "tamanoBytes" BIGINT, "creadoPorId" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
await db.$executeRawUnsafe(`
  CREATE TABLE IF NOT EXISTS "task_comments" (
    "id" TEXT PRIMARY KEY, "taskId" INTEGER NOT NULL, "ownerId" TEXT NOT NULL,
    "autorId" TEXT NOT NULL, "autorNombre" TEXT, "texto" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
await db.$executeRawUnsafe(`
  CREATE TABLE IF NOT EXISTS "task_details" (
    "taskId" INTEGER PRIMARY KEY, "ownerId" TEXT NOT NULL, "detalle" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
await db.$executeRawUnsafe(`
  CREATE TABLE IF NOT EXISTS "work_folders" (
    "id" TEXT PRIMARY KEY, "ownerId" TEXT NOT NULL, "tipo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL, "color" TEXT, "orden" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT NOW())`);
await db.$executeRawUnsafe(`
  CREATE TABLE IF NOT EXISTS "work_folder_items" (
    "ownerId" TEXT NOT NULL, "tipo" TEXT NOT NULL, "itemId" TEXT NOT NULL,
    "folderId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT NOW(),
    PRIMARY KEY ("ownerId", "tipo", "itemId"))`);

/* ── Se borra lo de antes ────────────────────────────────────────────────── */
const tareasViejas = await db.task.findMany({ where: { ownerId: dueno.id }, select: { id: true } });
const idsViejos = tareasViejas.map((t) => t.id);
if (idsViejos.length) {
    for (const tabla of ["task_attachments", "task_comments", "task_details"]) {
        await db.$executeRawUnsafe(`DELETE FROM "${tabla}" WHERE "taskId" = ANY($1::int[])`, idsViejos);
    }
}
await db.task.deleteMany({ where: { ownerId: dueno.id } });
await db.project.deleteMany({ where: { ownerId: dueno.id } });
await db.$executeRawUnsafe(`DELETE FROM "work_folder_items" WHERE "ownerId" = $1 AND "tipo" = 'proyecto'`, dueno.id);
await db.$executeRawUnsafe(`DELETE FROM "work_folders" WHERE "ownerId" = $1 AND "tipo" = 'proyecto'`, dueno.id);
for (const t of ["work_item_order", "orden_en_tablero"]) {
    await db.$executeRawUnsafe(`DO $$ BEGIN IF to_regclass('"${t}"') IS NOT NULL THEN DELETE FROM "${t}"; END IF; END $$`);
}

/* ── Las fechas, relativas a HOY ─────────────────────────────────────────── */
const ahora = new Date();
const elDia = (dias, h = 12) => {
    const d = new Date(ahora);
    d.setDate(d.getDate() + dias);
    d.setHours(h, 0, 0, 0);
    return d;
};
/** Un día de ESTA semana que no sea hoy ni mañana (si queda alguno). */
const estaSemana = (() => {
    const finDeSemana = 7 - ((ahora.getDay() + 6) % 7) - 1; // días hasta el domingo
    return elDia(Math.max(2, Math.min(finDeSemana, 4)));
})();

/* ── Los PROYECTOS ───────────────────────────────────────────────────────── */
const PROYECTOS = [
    {
        clave: "tienda",
        name: "Lanzamiento de la tienda en línea",
        description: "Montar la tienda, cargar el catálogo y abrir las ventas por la web.",
        status: "activo", lead: "Sofía Martínez", dueDate: elDia(21),
        equipo: ["Sofía Martínez", "Laura Gómez", "Andrés Ruiz"], carpeta: "Clientes", creador: "Yo",
    },
    {
        clave: "web",
        name: "Rediseño de la web",
        description: "Nueva portada, textos y fotos para la página del negocio.",
        status: "activo", lead: "Laura Gómez", dueDate: elDia(9),
        equipo: ["Laura Gómez", "Andrés Ruiz"], carpeta: "Clientes", creador: "Yo",
    },
    {
        clave: "capacitacion",
        name: "Capacitación del equipo",
        description: "Sesiones para que todo el equipo use la plataforma.",
        status: "activo", lead: "Yo", dueDate: elDia(3),
        equipo: ["Sofía Martínez", "Laura Gómez"], carpeta: "Interno", creador: "Sofía Martínez",
    },
    {
        clave: "navidad",
        name: "Campaña de Navidad",
        description: "Anuncios y mensajes para la temporada de fin de año.",
        status: "pausado", lead: "Andrés Ruiz", dueDate: elDia(45),
        equipo: ["Andrés Ruiz"], carpeta: null, creador: "Yo",
    },
    {
        clave: "bodega",
        name: "Mudanza de la bodega",
        description: "Trasladar el inventario a la bodega nueva.",
        status: "activo", lead: "Andrés Ruiz", dueDate: elDia(-2),
        equipo: ["Andrés Ruiz", "Sofía Martínez"], carpeta: "Interno", creador: "Yo",
    },
    {
        clave: "verano",
        name: "Catálogo de verano",
        description: "Fotos y precios de la colección de verano.",
        status: "terminado", lead: "Laura Gómez", dueDate: elDia(-20),
        equipo: ["Laura Gómez"], carpeta: null, creador: "Yo",
    },
];

const proyectos = {};
for (const pr of PROYECTOS) {
    const creado = await db.project.create({
        data: {
            ownerId: dueno.id,
            name: pr.name,
            description: pr.description,
            status: pr.status,
            leadId: persona(pr.lead).id,
            dueDate: pr.dueDate,
            createdById: persona(pr.creador).id,
            members: { create: pr.equipo.map((n) => ({ userId: persona(n).id })) },
        },
    });
    proyectos[pr.clave] = creado;
}

/* ── Las CARPETAS ────────────────────────────────────────────────────────── */
const carpetas = {};
for (const [i, [nombre, color]] of [["Clientes", "#3B82F6"], ["Interno", "#22C55E"]].entries()) {
    const id = randomUUID();
    carpetas[nombre] = id;
    await db.$executeRawUnsafe(
        `INSERT INTO "work_folders" ("id","ownerId","tipo","nombre","color","orden","createdById") VALUES ($1,$2,'proyecto',$3,$4,$5,$2)`,
        id, dueno.id, nombre, color, i,
    );
}
for (const pr of PROYECTOS) {
    if (!pr.carpeta) continue;
    await db.$executeRawUnsafe(
        `INSERT INTO "work_folder_items" ("ownerId","tipo","itemId","folderId") VALUES ($1,'proyecto',$2,$3)`,
        dueno.id, String(proyectos[pr.clave].id), carpetas[pr.carpeta],
    );
}

/*
 * Las TAREAS. Títulos cortos, como los de una tarjeta de verdad: el texto largo
 * va en «Qué hay que hacer» (`task_details`).
 */
const TAREAS = [
    // El proyecto del tablero: una o más en cada columna.
    {
        proyecto: "tienda", title: "Fotos de los productos", type: "Tarea", a: "Laura Gómez", dueDate: elDia(-2), status: "pending",
        detalle: "Fotos con fondo blanco de los 40 productos del catálogo.\nTamaño cuadrado, mínimo 1200 px.",
        adjuntos: [
            { nombre: "referencia-portada.jpg", tipo: "image", mimeType: "image/jpeg", tamanoBytes: 184_000 },
            { nombre: "lista-de-productos.pdf", tipo: "document", mimeType: "application/pdf", tamanoBytes: 96_000 },
        ],
        comentarios: [
            ["Sofía Martínez", "Laura, ¿las del catálogo viejo sirven o se repiten todas?"],
            ["Laura Gómez", "Se repiten: cambió el empaque. El jueves las tengo."],
        ],
    },
    { proyecto: "tienda", title: "Textos de la página de inicio", type: "Email", a: "Andrés Ruiz", dueDate: estaSemana, status: "pending" },
    { proyecto: "tienda", title: "Configurar la pasarela de pago", type: "Tarea", a: "Sofía Martínez", dueDate: elDia(12), status: "pending" },
    { proyecto: "tienda", title: "Montar el catálogo", type: "Tarea", a: "Andrés Ruiz", dueDate: elDia(0), status: "in_progress" },
    {
        proyecto: "tienda", title: "Llamar al proveedor de empaques", type: "Llamada", a: "Sofía Martínez", dueDate: elDia(1), status: "in_progress",
        comentarios: [["Andrés Ruiz", "Pregúntale también por las cajas pequeñas."]],
    },
    { proyecto: "tienda", title: "Revisar precios con el cliente", type: "Reunión", a: "Yo", dueDate: elDia(2), status: "in_review" },
    { proyecto: "tienda", title: "Comprar el dominio", type: "Tarea", a: "Laura Gómez", dueDate: elDia(-6), status: "done" },
    { proyecto: "tienda", title: "Reunión de arranque", type: "Reunión", a: "Yo", dueDate: elDia(-8), status: "done" },
    { proyecto: "tienda", title: "Anuncio en revista", type: "Email", a: "Andrés Ruiz", dueDate: elDia(-4), status: "cancelled" },
    // Las de los demás: para que las cifras de la lista digan algo.
    { proyecto: "web", title: "Nueva portada", type: "Tarea", a: "Laura Gómez", dueDate: elDia(5), status: "in_progress" },
    { proyecto: "web", title: "Textos del menú", type: "Tarea", a: "Andrés Ruiz", dueDate: elDia(-1), status: "pending" },
    { proyecto: "web", title: "Revisar con el cliente", type: "Reunión", a: "Laura Gómez", dueDate: elDia(7), status: "in_review" },
    { proyecto: "capacitacion", title: "Sesión de Chats", type: "Reunión", a: "Sofía Martínez", dueDate: elDia(1), status: "pending" },
    { proyecto: "capacitacion", title: "Manual de uso", type: "Tarea", a: "Laura Gómez", dueDate: elDia(3), status: "done" },
    { proyecto: "navidad", title: "Ideas de anuncios", type: "Tarea", a: "Andrés Ruiz", dueDate: elDia(30), status: "pending" },
    { proyecto: "bodega", title: "Inventario final", type: "Tarea", a: "Andrés Ruiz", dueDate: elDia(-3), status: "in_progress" },
    { proyecto: "verano", title: "Fotos de la colección", type: "Tarea", a: "Laura Gómez", dueDate: elDia(-25), status: "done" },
];

let adjuntos = 0;
let comentarios = 0;
for (const t of TAREAS) {
    const a = persona(t.a);
    const tarea = await db.task.create({
        data: {
            ownerId: dueno.id,
            assignedToId: a.id,
            assignedToName: a.name,
            title: t.title,
            type: t.type,
            dueDate: t.dueDate,
            status: t.status,
            createdById: dueno.id,
            projectId: proyectos[t.proyecto].id,
        },
    });
    if (t.detalle) {
        await db.$executeRawUnsafe(
            `INSERT INTO "task_details" ("taskId","ownerId","detalle") VALUES ($1,$2,$3)`,
            tarea.id, dueno.id, t.detalle,
        );
    }
    for (const ad of t.adjuntos ?? []) {
        await db.$executeRawUnsafe(
            `INSERT INTO "task_attachments" ("id","taskId","ownerId","url","nombre","tipo","mimeType","tamanoBytes","creadoPorId") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$3)`,
            randomUUID(), tarea.id, dueno.id, `${ARCHIVOS_DE_EJEMPLO}/proyectos/${ad.nombre}`, ad.nombre, ad.tipo, ad.mimeType, ad.tamanoBytes,
        );
        adjuntos++;
    }
    let minutos = 90;
    for (const [autor, texto] of t.comentarios ?? []) {
        const p = persona(autor);
        await db.$executeRawUnsafe(
            `INSERT INTO "task_comments" ("id","taskId","ownerId","autorId","autorNombre","texto","creadoEn") VALUES ($1,$2,$3,$4,$5,$6, NOW() - make_interval(mins => $7::int))`,
            randomUUID(), tarea.id, dueno.id, p.id, p.name, texto, minutos,
        );
        minutos -= 40;
        comentarios++;
    }
}

console.log(JSON.stringify({
    proyectos: PROYECTOS.length, tareas: TAREAS.length, adjuntos, comentarios,
    equipo: EQUIPO.length, modulos: MENU_DE_UN_CLIENTE.length,
}));
await db.$disconnect();
