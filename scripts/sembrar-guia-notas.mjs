/**
 * Los DATOS DE EJEMPLO de las capturas de la guía de Mis notas, encima de
 * `sembrar-barra.mjs` (que pone la cuenta y su equipo).
 *
 * Nombres inventados, pero con la forma de un cuaderno de verdad: tres
 * carpetas de colores, notas con su icono y su color, una fijada arriba, una
 * vinculada a un contacto, dos en el Archivo, y dos que el equipo le compartió
 * a la cuenta —una de solo lectura y otra editable—, así la pestaña Compartidas
 * enseña el ojo y el lápiz. Con tres notas iguales una guía no enseña nada.
 *
 * El marco —cuenta de cliente, su menú, «Ver tutoriales» y «Soporte»— es el de
 * todas las guías (`sembrar-marco-de-la-guia.mjs`).
 *
 * Se puede correr las veces que haga falta: borra lo suyo y lo vuelve a
 * poner. El script de capturas lo vuelve a correr antes del vídeo, porque las
 * capturas crean notas y cambian colores y el vídeo tiene que salir del mismo
 * punto de partida.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { MENU_DE_UN_CLIENTE, sembrarElMarco } from "./sembrar-marco-de-la-guia.mjs";

const db = new PrismaClient();

const dueno = await sembrarElMarco(db, {
    path: "/notas",
    title: "Guía de Mis notas",
    description: "Aprende a escribir, organizar y compartir tus notas en la plataforma",
    url: "/guia/notas",
});

/*
 * El EQUIPO: con quién se comparte («Compartir con el equipo» lista las
 * cuentas del equipo) y quién le compartió notas a la cuenta.
 */
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

const personas = [dueno.id, ...Object.values(equipo).map((u) => u.id)];
await db.noteShare.deleteMany({ where: { OR: [{ userId: { in: personas } }, { note: { userId: { in: personas } } }] } });
await db.userNote.deleteMany({ where: { userId: { in: personas } } });
await db.noteFolder.deleteMany({ where: { userId: { in: personas } } });

/*
 * Los CONTACTOS, para «Vincular contacto»: conversaciones de la cuenta en su
 * línea, como las de Chats.
 */
await db.instancia.deleteMany({ where: { userId: dueno.id } });
await db.instancia.create({
    data: { instanceName: "VENTAS", displayName: "Ventas", instanceId: "inst-guia-ventas", userId: dueno.id, instanceType: "waha" },
});
const CONTACTOS = [
    ["María Fernanda López", "573004521876"],
    ["Distribuidora El Sol", "573017789245"],
    ["Juan Pablo Restrepo", "573125538810"],
    ["Camila Andrade", "573108842216"],
    ["Andrés Gómez", "573202245690"],
    ["Óptica Visión", "573017735584"],
    ["Ferretería Central", "573006634418"],
    ["Valentina Castro", "573114478832"],
];
await db.session.deleteMany({ where: { userId: dueno.id } });
const ahora = Date.now();
for (const [i, [nombre, numero]] of CONTACTOS.entries()) {
    await db.session.create({
        data: {
            userId: dueno.id,
            remoteJid: `${numero}@s.whatsapp.net`,
            pushName: nombre,
            instanceId: "VENTAS",
            status: true,
            createdAt: new Date(ahora - (i + 1) * 3_600_000),
            updatedAt: new Date(ahora - (i + 1) * 3_600_000),
        },
    });
}
const jidDe = (nombre) => `${CONTACTOS.find((c) => c[0] === nombre)[1]}@s.whatsapp.net`;

/* ── El contenido de tiptap, sin ceremonias ─────────────────────────────── */
const texto = (t, marcas) => (marcas ? { type: "text", text: t, marks: marcas.map((m) => ({ type: m })) } : { type: "text", text: t });
const parrafo = (...trozos) => ({ type: "paragraph", content: trozos.map((t) => (typeof t === "string" ? texto(t) : t)) });
const titulo = (nivel, t) => ({ type: "heading", attrs: { level: nivel }, content: [texto(t)] });
const lista = (...items) => ({ type: "bulletList", content: items.map((t) => ({ type: "listItem", content: [parrafo(t)] })) });
const tareas = (...items) => ({
    type: "taskList",
    content: items.map(([hecha, t]) => ({ type: "taskItem", attrs: { checked: hecha }, content: [parrafo(t)] })),
});
const doc = (...bloques) => ({ type: "doc", content: bloques });

/* ── Carpetas ───────────────────────────────────────────────────────────── */
const CARPETAS = [
    { name: "Clientes", color: "#3b82f6" },
    { name: "Reuniones", color: "#8b5cf6" },
    { name: "Ideas", color: "#f59e0b" },
];
const carpetas = {};
for (const [i, c] of CARPETAS.entries()) {
    carpetas[c.name] = await db.noteFolder.create({ data: { userId: dueno.id, name: c.name, color: c.color, order: i } });
}

/* ── Notas de la cuenta ─────────────────────────────────────────────────── */
const NOTAS = [
    {
        title: "PENDIENTES DE LA SEMANA",
        emoji: "✅",
        color: "#dcfce7",
        isPinned: true,
        content: doc(
            titulo(2, "Esta semana"),
            tareas(
                [true, "Enviar la cotización a Distribuidora El Sol"],
                [true, "Confirmar la cita de María Fernanda"],
                [false, "Revisar los precios de temporada"],
                [false, "Llamar a Ferretería Central"],
            ),
        ),
    },
    {
        title: "LLAMAR A DISTRIBUIDORA EL SOL",
        emoji: "📞",
        folder: "Clientes",
        contacto: "Distribuidora El Sol",
        content: doc(
            parrafo("Quieren ", texto("200 cajas", ["bold"]), " para el próximo mes. Preguntar por el descuento por volumen."),
            lista("Precio por caja", "Tiempo de entrega", "Forma de pago"),
        ),
    },
    {
        title: "PEDIDO DE MARÍA FERNANDA",
        emoji: "📌",
        folder: "Clientes",
        contacto: "María Fernanda López",
        content: doc(parrafo("Talla M en azul y en negro. Entregar el jueves en la tarde."), parrafo("Pagó el 50 % por transferencia.")),
    },
    {
        title: "REUNIÓN DE EQUIPO DEL LUNES",
        emoji: "📋",
        folder: "Reuniones",
        compartidaCon: [{ persona: "sofia", canEdit: false }],
        content: doc(
            titulo(2, "Temas"),
            lista("Resultados de la semana", "Nuevos horarios de atención", "Campaña de diciembre"),
            titulo(2, "Acuerdos"),
            parrafo("Sofía arma el calendario de turnos y lo comparte el miércoles."),
        ),
    },
    {
        title: "IDEAS PARA LA CAMPAÑA DE DICIEMBRE",
        emoji: "💡",
        color: "#ede9fe",
        folder: "Ideas",
        content: doc(
            parrafo("Regalo sorpresa en compras de más de ", texto("$150.000", ["bold"]), "."),
            lista("Mensaje de bienvenida con temática navideña", "Catálogo de regalos", "Sorteo entre clientes frecuentes"),
        ),
    },
    {
        title: "PROVEEDORES DE EMPAQUE",
        emoji: "💼",
        content: doc(parrafo("Cajas Andinas: entrega en 3 días."), parrafo("Empaques del Valle: más barato, entrega en una semana.")),
    },
    {
        title: "PRECIOS DE TEMPORADA",
        emoji: "📊",
        color: "#fef9c3",
        content: doc(
            titulo(3, "Lista vigente"),
            lista("Plan básico: $49.000", "Plan completo: $89.000", "Instalación: sin costo"),
        ),
    },
    {
        title: "GUION DE BIENVENIDA",
        emoji: "💬",
        content: doc(parrafo("Hola, gracias por escribirnos. ¿En qué te podemos ayudar hoy?")),
    },
    {
        title: "PROMOCIÓN DE OCTUBRE",
        emoji: "🎉",
        isArchived: true,
        content: doc(parrafo("2x1 en la segunda unidad. Terminó el 31 de octubre.")),
    },
    {
        title: "INVENTARIO DEL TRIMESTRE PASADO",
        emoji: "📚",
        isArchived: true,
        content: doc(parrafo("Conteo cerrado. Se pasó a la hoja de cálculo.")),
    },
];

for (const [i, n] of NOTAS.entries()) {
    const nota = await db.userNote.create({
        data: {
            userId: dueno.id,
            title: n.title,
            emoji: n.emoji ?? null,
            color: n.color ?? null,
            isPinned: Boolean(n.isPinned),
            isArchived: Boolean(n.isArchived),
            folderId: n.folder ? carpetas[n.folder].id : null,
            contactJid: n.contacto ? jidDe(n.contacto) : null,
            contactName: n.contacto ?? null,
            order: i,
            content: n.content,
            updatedAt: new Date(ahora - i * 7_200_000),
        },
    });
    for (const c of n.compartidaCon ?? []) {
        await db.noteShare.create({ data: { noteId: nota.id, userId: equipo[`${c.persona}@banco.test`].id, canEdit: c.canEdit } });
    }
}

/*
 * Lo que el EQUIPO le compartió a la cuenta: una de solo lectura (el ojo) y
 * otra editable (el lápiz). Sin estas, la pestaña Compartidas sale vacía y la
 * sección de compartir no enseña lo que ve quien recibe.
 */
const DEL_EQUIPO = [
    {
        de: laura,
        title: "CLIENTES POR VISITAR",
        emoji: "🔖",
        canEdit: false,
        content: doc(lista("Óptica Visión: martes 10 a. m.", "Ferretería Central: jueves 3 p. m.")),
    },
    {
        de: sofia,
        title: "TURNOS DE ATENCIÓN",
        emoji: "📅",
        canEdit: true,
        content: doc(lista("Mañana: Laura", "Tarde: Andrés", "Sábados: Sofía")),
    },
];
for (const [i, n] of DEL_EQUIPO.entries()) {
    const nota = await db.userNote.create({
        data: { userId: n.de.id, title: n.title, emoji: n.emoji, content: n.content, order: i },
    });
    await db.noteShare.create({ data: { noteId: nota.id, userId: dueno.id, canEdit: n.canEdit, order: i } });
}

console.log(
    JSON.stringify({
        notas: NOTAS.length,
        carpetas: CARPETAS.length,
        compartidasConLaCuenta: DEL_EQUIPO.length,
        contactos: CONTACTOS.length,
        modulos: MENU_DE_UN_CLIENTE.length,
    }),
);
await db.$disconnect();
