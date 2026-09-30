/**
 * Los DATOS DE EJEMPLO de las capturas de la guía de Leads, encima de
 * `sembrar-barra.mjs` (que pone la cuenta, su clave y los módulos).
 *
 * Nombres y números inventados, pero con la forma de una cuenta de verdad: dos
 * líneas —así sale el botón «Línea» y la ventana de crear pide la línea—,
 * contactos con la sesión abierta y cerrada, alguno con el agente apagado,
 * flujos recorridos, seguimientos pendientes y etiquetas de colores. Con una
 * tabla de tres filas iguales una guía no enseña nada.
 *
 * Son 26 a propósito: la tabla va de 20 en 20, así que hay una segunda página
 * y el pie de paginación dice algo.
 *
 * Y lo que rodea a la pantalla —el menú de la izquierda y la barra de arriba—
 * es el de una cuenta CLIENTE de verdad: la cuenta pasa a `user` con plan
 * `personalizado`, el menú sale de `menu-de-un-cliente.mjs` y la barra lleva
 * «Ver tutoriales» y «Soporte». Una guía que enseña la pantalla sin su marco
 * deja al cliente sin saber dónde está.
 */
import { PrismaClient } from "@prisma/client";
import { MENU_DE_UN_CLIENTE, sembrarElMarco } from "./sembrar-marco-de-la-guia.mjs";

const db = new PrismaClient();

/*
 * El MARCO —la cuenta de un cliente, su menú y la barra de arriba con
 * «Ver tutoriales» y «Soporte»— es el mismo en todas las guías
 * (`sembrar-marco-de-la-guia.mjs`). Aquí solo se dice qué pantalla documenta.
 */
const dueno = await sembrarElMarco(db, {
    path: "/sessions",
    title: "Guía de Leads / contactos",
    description: "Aprende a organizar y filtrar tus contactos de WhatsApp en la plataforma",
    url: "/guia/leads",
});

await db.instancia.deleteMany({ where: { userId: dueno.id } });
const LINEAS = [
    { instanceName: "VENTAS", displayName: "Ventas", instanceId: "inst-guia-ventas" },
    { instanceName: "SOPORTE", displayName: "Soporte", instanceId: "inst-guia-soporte" },
];
for (const l of LINEAS) {
    await db.instancia.create({ data: { ...l, userId: dueno.id, instanceType: "waha" } });
}

await db.tag.deleteMany({ where: { userId: dueno.id } });
const ETIQUETAS = [
    { name: "Cliente VIP", color: "#8B5CF6" },
    { name: "Cotización enviada", color: "#3B82F6" },
    { name: "Interesado", color: "#22C55E" },
    { name: "Pendiente de pago", color: "#F59E0B" },
    { name: "Soporte", color: "#EF4444" },
];
const tags = [];
for (const [i, e] of ETIQUETAS.entries()) {
    tags.push(
        await db.tag.create({
            data: {
                userId: dueno.id,
                name: e.name,
                slug: e.name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, "-"),
                color: e.color,
                order: i,
            },
        }),
    );
}

const FLUJOS = [
    { id: "f1", name: "Bienvenida" },
    { id: "f2", name: "Catálogo" },
    { id: "f3", name: "Medios de pago" },
    { id: "f4", name: "Agendar cita" },
];

// [nombre, número, sesión abierta, agente apagado, flujos, seguimientos, etiquetas, línea, horas atrás]
const CONTACTOS = [
    ["María Fernanda López", "573004521876", true, false, [0, 1, 2], 2, [0, 1], 0, 1],
    ["Juan Pablo Restrepo", "573125538810", true, false, [0, 1], 1, [2], 0, 3],
    ["Distribuidora El Sol", "573017789245", true, true, [0, 3], 0, [1, 3], 0, 5],
    ["Camila Andrade", "573108842216", false, false, [0], 0, [], 1, 8],
    ["Andrés Gómez", "573202245690", true, false, [0, 1, 2, 3], 3, [0, 2], 0, 12],
    ["Laura Valentina Ríos", "573145576023", true, false, [0], 1, [2], 0, 20],
    ["Ferretería Central", "573006634418", false, true, [0, 2], 0, [3], 1, 26],
    ["Santiago Morales", "573187723351", true, false, [0, 1], 0, [], 0, 30],
    ["Valentina Castro", "573114478832", true, false, [0, 3], 2, [1], 0, 40],
    ["Carlos Mario Pineda", "573002287764", false, false, [], 0, [4], 1, 48],
    ["Isabella Duarte", "573159954471", true, false, [0, 1], 1, [2, 1], 0, 52],
    ["Tienda La Esquina", "573016643327", true, true, [0], 0, [4], 1, 60],
    ["Daniel Herrera", "573128819940", true, false, [0, 2], 0, [], 0, 70],
    ["Sofía Ramírez", "573041126658", false, false, [0], 0, [3], 0, 80],
    ["Alejandro Vargas", "573105563392", true, false, [0, 1, 3], 1, [0], 0, 90],
    ["Paula Jiménez", "573206617745", true, false, [], 0, [2], 1, 100],
    ["Óptica Visión", "573017735584", true, false, [0, 1], 2, [1], 0, 110],
    ["Mateo Salazar", "573136642279", false, false, [0], 0, [], 0, 120],
    ["Gabriela Ortiz", "573002248813", true, false, [0, 2], 0, [2], 0, 130],
    ["Sebastián Cardona", "573118897760", true, false, [0], 1, [], 1, 140],
    ["Natalia Mejía", "573154426631", true, false, [0, 1], 0, [0], 0, 150],
    ["Restaurante Sazón", "573006689924", false, true, [0, 3], 0, [3], 0, 160],
    ["Tomás Arango", "573142231187", true, false, [0], 0, [], 0, 170],
    ["Mariana Toro", "573187764402", true, false, [0, 1, 2], 1, [2], 0, 180],
    ["Felipe Ospina", "573101125569", true, false, [], 0, [], 1, 190],
    ["Luisa Fernanda Gil", "573209987736", true, false, [0], 0, [1], 0, 200],
];

const jids = CONTACTOS.map((c) => `${c[1]}@s.whatsapp.net`);
await db.seguimiento.deleteMany({ where: { remoteJid: { in: jids } } });
await db.session.deleteMany({ where: { userId: dueno.id } });

const ahora = Date.now();
for (const [nombre, numero, abierta, agenteApagado, flujos, seguimientos, etiquetas, linea, horas] of CONTACTOS) {
    const jid = `${numero}@s.whatsapp.net`;
    const l = LINEAS[linea];
    const s = await db.session.create({
        data: {
            userId: dueno.id,
            remoteJid: jid,
            pushName: nombre,
            instanceId: l.instanceName,
            status: abierta,
            agentDisabled: agenteApagado,
            flujos: flujos.length ? JSON.stringify(flujos.map((i) => FLUJOS[i])) : "",
            createdAt: new Date(ahora - horas * 3600_000),
        },
    });
    for (const t of etiquetas) {
        await db.sessionTag.create({ data: { sessionId: s.id, tagId: tags[t].id } });
    }
    for (let k = 0; k < seguimientos; k += 1) {
        await db.seguimiento.create({
            data: {
                instancia: l.instanceName,
                remoteJid: jid,
                mensaje: ["¿Pudiste revisar la cotización?", "Te recuerdo tu cita de mañana", "¿Te ayudo con algo más?"][k % 3],
                tipo: k % 2 === 0 ? "seguimiento-text" : "seguimiento-image",
                time: new Date(ahora + (k + 1) * 86_400_000).toISOString(),
                followUpStatus: "pending",
            },
        });
    }
}

console.log(JSON.stringify({ contactos: CONTACTOS.length, lineas: LINEAS.length, etiquetas: ETIQUETAS.length, modulos: MENU_DE_UN_CLIENTE.length }));
await db.$disconnect();
