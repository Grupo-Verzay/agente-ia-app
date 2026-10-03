/**
 * Los DATOS DE EJEMPLO de las capturas de la guía de Reportes, encima de
 * `sembrar-barra.mjs` (que pone la cuenta y su línea).
 *
 * Cuatro semanas de reportes ya enviados —con sus métricas, su calidad y su
 * actividad—, las preguntas que la IA no supo responder (agrupadas, con sus
 * variantes), los registros de todos los tipos y la calidad de las
 * conversaciones de tres asesores y la IA, con alguna por debajo de 60.
 *
 * Y lo que pide «Generar reporte» para salir entero: la IA de la cuenta con
 * créditos (la contesta `fingido-guia-reportes.mjs`), el número de
 * notificaciones y el servidor de WhatsApp de EJEMPLO, que dice que la línea
 * está conectada y que el mensaje salió. A nadie le llega nada.
 *
 * Se puede correr las veces que haga falta: borra lo suyo y lo vuelve a poner.
 * La receta lo vuelve a correr antes del vídeo, porque las capturas generan y
 * borran reportes.
 */
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { sembrarElMarco } from "./sembrar-marco-de-la-guia.mjs";
import { SERVIDOR_DE_EJEMPLO } from "./fingido-guia-reportes.mjs";

const db = new PrismaClient();
const DIA = 86_400_000;
const ahora = Date.now();

const dueno = await sembrarElMarco(db, {
    path: "/crm/reportes",
    title: "Guía de Reportes",
    description: "Aprende a revisar el resumen semanal de tu negocio en la plataforma",
    url: "/guia/reportes",
});

/* ── El equipo: tres asesores con nombre, para la calidad por asesor. ── */
const ASESORES = [
    { email: "sofia@banco.test", name: "Sofía Ramírez" },
    { email: "andrea@banco.test", name: "Andrea Ruiz" },
    { email: "mateo@banco.test", name: "Mateo Gómez" },
];
const asesor = {};
for (const a of ASESORES) {
    const u = await db.user.upsert({
        where: { email: a.email },
        update: { name: a.name, ownerId: dueno.id },
        create: { email: a.email, name: a.name, ownerId: dueno.id, advisorRole: "agente", role: "user" },
    });
    asesor[a.name] = u.id;
}

/* ── Lo que pide «Generar reporte». ── */
await db.siteConfig.upsert({
    where: { id: 1 },
    update: { wahaUrl: SERVIDOR_DE_EJEMPLO, wahaApiKey: "clave-de-ejemplo" },
    create: { id: 1, wahaUrl: SERVIDOR_DE_EJEMPLO, wahaApiKey: "clave-de-ejemplo" },
});
const proveedor = await db.aiProvider.upsert({
    where: { name: "openai" },
    update: {},
    create: { name: "openai", aiModel: "gpt-4o-mini" },
});
const modelo = await db.aiModel.upsert({
    where: { providerId_name: { providerId: proveedor.id, name: "gpt-4o-mini" } },
    update: {},
    create: { providerId: proveedor.id, name: "gpt-4o-mini" },
});
await db.userAiConfig.upsert({
    where: { userId_providerId: { userId: dueno.id, providerId: proveedor.id } },
    update: { apiKey: "sk-ejemplo-de-la-guia", isActive: true },
    create: { userId: dueno.id, providerId: proveedor.id, apiKey: "sk-ejemplo-de-la-guia", isActive: true },
});
await db.user.update({
    where: { id: dueno.id },
    data: { defaultProviderId: proveedor.id, defaultAiModelId: modelo.id, notificationNumber: "573009990000" },
});
await db.iaCredit.upsert({
    where: { userId: dueno.id },
    update: { total: 5000, used: 0 },
    create: { userId: dueno.id, total: 5000, used: 0, renewalDate: new Date(ahora + 30 * DIA) },
});

/* ── Los contactos (sesiones) de los registros y de la calidad. ── */
const CONTACTOS = [
    { nombre: "Laura Méndez", tel: "573101112201", estado: "CALIENTE", puntaje: 86 },
    { nombre: "Jorge Castillo", tel: "573101112202", estado: "TIBIO", puntaje: 64 },
    { nombre: "Paola Herrera", tel: "573101112203", estado: "CALIENTE", puntaje: 91 },
    { nombre: "Andrés Vargas", tel: "573101112204", estado: "FRIO", puntaje: 22 },
    { nombre: "Camila Torres", tel: "573101112205", estado: "FINALIZADO", puntaje: 95 },
    { nombre: "Diego Moreno", tel: "573101112206", estado: "TIBIO", puntaje: 48 },
    { nombre: "Valentina Ríos", tel: "573101112207", estado: "CALIENTE", puntaje: 78 },
    { nombre: "Sebastián Díaz", tel: "573101112208", estado: "FRIO", puntaje: 15 },
    { nombre: "Natalia Cruz", tel: "573101112209", estado: "TIBIO", puntaje: 57 },
];
// Sin tocar la conversación de `sembrar-barra.mjs` (la de la línea).
await db.session.deleteMany({ where: { userId: dueno.id, remoteJid: { in: CONTACTOS.map((c) => `${c.tel}@s.whatsapp.net`) } } });
const sesion = {};
for (const [i, c] of CONTACTOS.entries()) {
    const cuando = new Date(ahora - (i + 1) * 5 * 3_600_000);
    sesion[c.nombre] = await db.session.create({
        data: {
            userId: dueno.id,
            remoteJid: `${c.tel}@s.whatsapp.net`,
            pushName: c.nombre,
            instanceId: "inst-banco-1",
            status: true,
            leadStatus: c.estado,
            leadStatusUpdatedAt: cuando,
            leadScore: c.puntaje,
            createdAt: new Date(ahora - (i + 2) * DIA),
            updatedAt: cuando,
        },
    });
}

/* ── Los REPORTES de las últimas cuatro semanas, ya enviados. ── */
await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS weekly_reports (
        id TEXT PRIMARY KEY, "userId" TEXT NOT NULL,
        period_start TIMESTAMP(3) NOT NULL, period_end TIMESTAMP(3) NOT NULL,
        summary TEXT NOT NULL, metrics JSONB, sent_at TIMESTAMP(3),
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT NOW())`);
await db.$executeRaw`DELETE FROM weekly_reports WHERE "userId" = ${dueno.id}`;

const SEMANAS = [
    {
        haceDias: 7,
        resumen:
            "Semana movida: entraron 12 leads nuevos y cerraste 2 ventas. Lo que más preguntaron fue el precio del plan Business y si hay envíos a otras ciudades.\n\n" +
            "Tienes 3 leads calientes esperando cotización: contéstales primero. La calidad de la atención fue de 82 sobre 100.",
        total: 118, nuevos: 12, calientes: 9, finalizados: 21, frios: 52, tibios: 36, score: 54, conversiones: 2,
        actividad: { SOLICITUD: 6, PEDIDO: 3, RECLAMO: 1, PAGO: 2, RESERVA: 4, PRODUCTO: 2 },
        calidad: { conversaciones: 26, puntajePromedio: 82, soloElDueno: false, mejor: { asesorId: "a", nombre: "Andrea Ruiz", puntaje: 91, conversaciones: 9 } },
    },
    {
        haceDias: 14,
        resumen:
            "Entraron 9 leads nuevos y cerraste 1 venta. La IA contestó casi todo sola; solo 2 conversaciones pasaron a un asesor.\n\n" +
            "Varios clientes preguntaron por métodos de pago: vale la pena añadirlos al entrenamiento.",
        total: 106, nuevos: 9, calientes: 6, finalizados: 19, frios: 50, tibios: 31, score: 51, conversiones: 1,
        actividad: { SOLICITUD: 4, PEDIDO: 2, PAGO: 1, RESERVA: 3 },
        calidad: { conversaciones: 21, puntajePromedio: 78, soloElDueno: false, mejor: { asesorId: "s", nombre: "Sofía Ramírez", puntaje: 88, conversaciones: 7 } },
    },
    {
        haceDias: 21,
        resumen:
            "Semana tranquila: 7 leads nuevos y 2 ventas cerradas. Hubo un reclamo por un envío tardío que ya se resolvió.\n\n" +
            "Revisa los 5 leads tibios de la semana pasada: con un seguimiento pueden pasar a calientes.",
        total: 97, nuevos: 7, calientes: 5, finalizados: 18, frios: 46, tibios: 28, score: 49, conversiones: 2,
        actividad: { SOLICITUD: 3, PEDIDO: 2, RECLAMO: 1, RESERVA: 2 },
        calidad: { conversaciones: 18, puntajePromedio: 75, soloElDueno: false, mejor: { asesorId: "a", nombre: "Andrea Ruiz", puntaje: 84, conversaciones: 6 } },
    },
    {
        haceDias: 28,
        resumen:
            "Primera semana con el agente IA activo: 10 leads nuevos y 1 venta. Los clientes valoraron la respuesta rápida, incluso de noche.\n\n" +
            "Lo que la IA no supo responder fue sobre garantías: añádelo al entrenamiento.",
        total: 90, nuevos: 10, calientes: 4, finalizados: 17, frios: 44, tibios: 25, score: 47, conversiones: 1,
        actividad: { SOLICITUD: 5, PEDIDO: 1, PAGO: 1 },
        calidad: null,
    },
];
for (const s of SEMANAS) {
    const fin = new Date(ahora - s.haceDias * DIA + 3 * 3_600_000);
    const inicio = new Date(fin.getTime() - 7 * DIA);
    const metricas = {
        periodStart: inicio.toISOString(),
        periodEnd: fin.toISOString(),
        totalLeads: s.total,
        newLeads: s.nuevos,
        leadsByStatus: { FRIO: s.frios, TIBIO: s.tibios, CALIENTE: s.calientes, FINALIZADO: s.finalizados },
        leadsByScore: { sinScore: 8, bajo: 30, medio: 28, moderado: 22, alto: 18, listo: 10 },
        avgScore: s.score,
        topLeads: [
            { name: "Paola Herrera", score: 91, status: "CALIENTE", phone: "573101112203" },
            { name: "Laura Méndez", score: 86, status: "CALIENTE", phone: "573101112201" },
            { name: "Valentina Ríos", score: 78, status: "CALIENTE", phone: "573101112207" },
        ],
        followUpsSent: 14,
        followUpsPending: 3,
        conversions: s.conversiones,
        registrosByTipo: { PAGO: 0, CITA: 0, RESERVA: 0, SOLICITUD: 0, RECLAMO: 0, PEDIDO: 0, PRODUCTO: 0, ...s.actividad },
        calidad: s.calidad
            ? { ...s.calidad, mejor: s.calidad.mejor ? { ...s.calidad.mejor, asesorId: asesor[s.calidad.mejor.nombre] } : null }
            : null,
    };
    await db.$executeRaw`
        INSERT INTO weekly_reports (id, "userId", period_start, period_end, summary, metrics, sent_at, "createdAt")
        VALUES (${randomUUID()}, ${dueno.id}, ${inicio}, ${fin}, ${s.resumen}, ${JSON.stringify(metricas)}::jsonb, ${fin}, ${fin})
    `;
}

/* ── Lo que la IA no supo responder: grupos con sus variantes. ── */
await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS ia_sin_respuesta (
        id TEXT PRIMARY KEY, "userId" TEXT NOT NULL, "grupoId" TEXT,
        pregunta TEXT NOT NULL, caso TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT NOW())`);
await db.$executeRaw`DELETE FROM ia_sin_respuesta WHERE "userId" = ${dueno.id}`;
const SIN_RESPUESTA = [
    { grupo: "g-garantia", preguntas: [
        ["¿Qué garantía tienen los productos?", "escalo_sin_saber", 2],
        ["¿Cuánto dura la garantía?", "dijo_que_no_sabia", 5],
        ["Si se daña, ¿me lo cambian?", "escalo_sin_saber", 9],
        ["¿La garantía cubre el envío?", "dijo_que_no_sabia", 20],
        ["¿Tienen garantía extendida?", "dijo_que_no_sabia", 30],
    ] },
    { grupo: "g-pagos", preguntas: [
        ["¿Puedo pagar con tarjeta de crédito?", "dijo_que_no_sabia", 3],
        ["¿Aceptan pagos a cuotas?", "escalo_sin_saber", 12],
        ["¿Se puede pagar contra entrega?", "dijo_que_no_sabia", 26],
    ] },
    { grupo: "g-mayoristas", preguntas: [
        ["¿Tienen precios para mayoristas?", "escalo_sin_saber", 6],
        ["Si compro 50 unidades, ¿hay descuento?", "escalo_sin_saber", 40],
    ] },
    { grupo: "g-domingos", preguntas: [
        ["¿Abren los domingos?", "dijo_que_no_sabia", 8],
    ] },
];
for (const g of SIN_RESPUESTA) {
    for (const [pregunta, caso, horas] of g.preguntas) {
        await db.$executeRaw`
            INSERT INTO ia_sin_respuesta (id, "userId", "grupoId", pregunta, caso, "createdAt")
            VALUES (${randomUUID()}, ${dueno.id}, ${g.grupo}, ${pregunta}, ${caso}, ${new Date(ahora - horas * 3_600_000)})
        `;
    }
}

/* ── Los REGISTROS: de todos los tipos que filtra la pestaña. ── */
const REGISTROS = [
    ["REPORTE", "Laura Méndez", "Pidió la cotización del plan Business para su clínica.", 2],
    ["SOLICITUD", "Paola Herrera", "Solicita 3 sillas ergonómicas negras con entrega en Medellín.", 4],
    ["PEDIDO", "Camila Torres", "Pedido confirmado: 2 cajas de café de origen, envío a domicilio.", 7],
    ["RECLAMO", "Andrés Vargas", "Su pedido llegó con un día de retraso.", 10],
    ["PAGO", "Camila Torres", "Envió el comprobante de la transferencia.", 12],
    ["RESERVA", "Valentina Ríos", "Reservó una cita para el jueves a las 3 p. m.", 15],
    ["PRODUCTO", "Jorge Castillo", "Preguntó por la disponibilidad de la cafetera de 12 tazas.", 18],
    ["SOLICITUD", "Natalia Cruz", "Solicita el catálogo de mayoristas con 50 unidades de lámparas.", 22],
    ["REPORTE", "Diego Moreno", "Interesado en el plan básico; vuelve a escribir el lunes.", 27],
    ["PEDIDO", "Laura Méndez", "Pedido de 1 kit de bienvenida para su equipo.", 30],
];
await db.registro.deleteMany({ where: { userId: dueno.id } });
for (const [tipo, nombre, resumen, horas] of REGISTROS) {
    const cuando = new Date(ahora - horas * 3_600_000);
    await db.registro.create({
        data: {
            tipo,
            resumen,
            nombre,
            estado: tipo === "RECLAMO" ? "Resuelto" : "Nuevo",
            sessionId: sesion[nombre].id,
            userId: dueno.id, // en producción lo pone un disparador; aquí no hay
            fecha: cuando,
            createdAt: cuando,
        },
    });
}

/* ── La CALIDAD: tres asesores y la IA, con alguna por debajo de 60. ── */
await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "calidad_conversaciones" (
        "id" TEXT PRIMARY KEY, "cuentaId" TEXT NOT NULL, "instanceName" TEXT NOT NULL,
        "remoteJid" TEXT NOT NULL, "sessionId" INTEGER, "contacto" TEXT, "asesorId" TEXT,
        "responsable" TEXT NOT NULL DEFAULT 'sin_asignar', "puntaje" INTEGER, "saludo" INTEGER,
        "tono" INTEGER, "resolvio" TEXT, "primeraRespuestaSeg" INTEGER, "resolucionSeg" INTEGER,
        "mejora" TEXT NOT NULL DEFAULT '', "ejemplo" BOOLEAN NOT NULL DEFAULT FALSE, "motivo" TEXT,
        "mensajes" INTEGER NOT NULL DEFAULT 0, "tokens" INTEGER NOT NULL DEFAULT 0,
        "ultimoMensajeEn" TIMESTAMP(3) NOT NULL, "evaluadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
await db.$executeRaw`DELETE FROM "calidad_conversaciones" WHERE "cuentaId" = ${dueno.id}`;
const CALIDAD = [
    ["Paola Herrera", "Andrea Ruiz", "asesor", 94, "si", 45, 1500, ""],
    ["Camila Torres", "Andrea Ruiz", "asesor", 89, "si", 60, 2400, ""],
    ["Laura Méndez", "Sofía Ramírez", "asesor", 86, "si", 120, 3600, ""],
    ["Valentina Ríos", "Sofía Ramírez", "asesor", 79, "parcial", 300, 7200, "Confirmar la hora de la cita antes de despedirse."],
    ["Jorge Castillo", "Mateo Gómez", "asesor", 71, "parcial", 600, 10800, "Responder la disponibilidad con un dato concreto."],
    ["Andrés Vargas", "Mateo Gómez", "asesor", 52, "no", 2700, null, "Disculparse por el retraso y dar una fecha de entrega."],
    ["Diego Moreno", null, "ia", 83, "si", 5, 600, ""],
    ["Natalia Cruz", null, "ia", 58, "no", 4, null, "Pasar a un asesor cuando preguntan por precios de mayorista."],
    ["Sebastián Díaz", null, "ia", 76, "parcial", 6, 900, "Ofrecer el catálogo al final de la conversación."],
];
for (const [i, [nombre, quien, responsable, puntaje, resolvio, primera, resolucion, mejora]] of CALIDAD.entries()) {
    const s = sesion[nombre];
    const cuando = new Date(ahora - (i + 1) * 4 * 3_600_000);
    await db.$executeRaw`
        INSERT INTO "calidad_conversaciones" ("id","cuentaId","instanceName","remoteJid","sessionId","contacto","asesorId",
            "responsable","puntaje","saludo","tono","resolvio","primeraRespuestaSeg","resolucionSeg","mejora","ejemplo",
            "mensajes","ultimoMensajeEn","evaluadoEn")
        VALUES (${randomUUID()}, ${dueno.id}, ${"BANCO_VENTAS"}, ${s.remoteJid}, ${s.id}, ${nombre},
            ${quien ? asesor[quien] : null}, ${responsable}, ${puntaje}, ${puntaje >= 60 ? 15 : 8}, ${puntaje >= 60 ? 22 : 12},
            ${resolvio}, ${primera}, ${resolucion}, ${mejora}, ${puntaje < 60}, ${8 + i * 2}, ${cuando}, ${new Date(ahora - 30 * 60_000)})
    `;
}

console.log(JSON.stringify({ cuenta: dueno.id, reportes: SEMANAS.length, registros: REGISTROS.length, calidad: CALIDAD.length }));
await db.$disconnect();
