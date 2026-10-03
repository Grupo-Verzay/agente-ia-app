/**
 * Los DATOS DE EJEMPLO de las capturas de la guía de Informes, encima del marco
 * común (`sembrar-marco-de-la-guia.mjs`: la cuenta de un cliente, su menú y la
 * barra de arriba).
 *
 * Una clínica dental con DOS sucursales que cuelgan de ella —para que el
 * selector de «Cuentas de la familia» tenga algo que elegir— y un mes de
 * actividad repartido entre las tres: contactos en las cinco temperaturas,
 * registros de cada tipo, seguimientos, citas, llamadas, encuestas de
 * satisfacción, caídas de sentimiento, flujos, etiquetas, ventas, gastos,
 * productos y créditos. Con todo vacío, cada sección diría «sin datos» y la
 * guía no enseñaría nada.
 *
 * Todo es inventado —nombres, números y conversaciones—: la guía es pública.
 * Se puede correr las veces que haga falta: borra lo suyo y lo vuelve a poner.
 */
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

import { MENU_DE_UN_CLIENTE, sembrarElMarco } from "./sembrar-marco-de-la-guia.mjs";

const db = new PrismaClient();

const marco = await sembrarElMarco(db, {
    path: "/crm/dashboard",
    title: "Guía de Informes",
    description: "Aprende a leer los números de tu negocio en la plataforma",
    url: "/guia/informes",
});
const dueno = await db.user.update({
    where: { id: marco.id },
    data: { name: "Clínica Sonrisa", company: "Clínica Sonrisa", preferredCurrencyCode: "COP" },
});
const pass = await bcrypt.hash("banco1234", 10);

/* ── La FAMILIA: dos sucursales que cuelgan de la clínica ──────────────── */
const SUCURSALES = [
    { email: "norte@guia-informes.test", nombre: "Sonrisa Norte" },
    { email: "sur@guia-informes.test", nombre: "Sonrisa Sur" },
];
const hijas = [];
for (const s of SUCURSALES) {
    hijas.push(
        await db.user.upsert({
            where: { email: s.email },
            update: { name: s.nombre, company: s.nombre, status: true, ownerId: null },
            create: { email: s.email, name: s.nombre, company: s.nombre, password: pass, role: "user", status: true },
        }),
    );
}
const cuentas = [dueno, ...hijas];
const ids = cuentas.map((c) => c.id);
await db.linkedAccount.deleteMany({
    where: { OR: [{ masterUserId: { in: ids } }, { linkedUserId: { in: ids } }] },
});
for (const h of hijas) {
    await db.linkedAccount.create({ data: { masterUserId: dueno.id, linkedUserId: h.id, role: "administrador", label: h.name } });
}

/* ── El EQUIPO de la clínica: los asesores del NPS y del sentimiento ──── */
const ASESORES = [
    { id: "guia-informes-paula", email: "paula@guia-informes.test", name: "Paula Ríos" },
    { id: "guia-informes-mateo", email: "mateo@guia-informes.test", name: "Mateo Vargas" },
    { id: "guia-informes-diana", email: "diana@guia-informes.test", name: "Diana López" },
];
const equipo = [];
for (const a of ASESORES) {
    equipo.push(
        await db.user.upsert({
            where: { email: a.email },
            update: { name: a.name, ownerId: dueno.id, advisorRole: "agente", status: true },
            create: { ...a, password: pass, role: "user", status: true, ownerId: dueno.id, advisorRole: "agente" },
        }),
    );
}

/* ── Lo de antes ──────────────────────────────────────────────────────── */
await db.registro.deleteMany({ where: { userId: { in: ids } } });
await db.crmFollowUp.deleteMany({ where: { userId: { in: ids } } });
await db.appointment.deleteMany({ where: { userId: { in: ids } } });
const viejas = await db.session.findMany({ where: { userId: { in: ids } }, select: { id: true } });
await db.sessionWorkflowState.deleteMany({ where: { sessionId: { in: viejas.map((s) => s.id) } } });
await db.sessionTag.deleteMany({ where: { sessionId: { in: viejas.map((s) => s.id) } } });
await db.session.deleteMany({ where: { userId: { in: ids } } });
await db.workflow.deleteMany({ where: { userId: { in: ids } } });
await db.tag.deleteMany({ where: { userId: { in: ids } } });
await db.chatMessage.deleteMany({ where: { userId: { in: ids }, messageType: "call" } });
await db.product.deleteMany({ where: { userId: { in: ids } } });
await db.financeAttachment.deleteMany({ where: { userId: { in: ids } } });
await db.financeTransaction.deleteMany({ where: { userId: { in: ids } } });
await db.financeCategory.deleteMany({ where: { userId: { in: ids } } });
await db.financeAccount.deleteMany({ where: { userId: { in: ids } } });

const ahora = Date.now();
const DIA = 86_400_000;
const hace = (dias, horas = 0) => new Date(ahora - dias * DIA - horas * 3_600_000);

/* ── Los CONTACTOS: un mes de conversaciones nuevas ───────────────────── */
const NOMBRES = [
    "Ana Castillo", "Bruno Mejía", "Carolina Peña", "Daniel Ortiz", "Elena Suárez", "Fernando Rojas",
    "Gabriela Niño", "Héctor Cano", "Isabel Duarte", "Julián Prada", "Karen Molina", "Luis Benítez",
    "María Paz", "Nicolás Herrera", "Olga Patiño", "Pablo Arango", "Rosa Quintero", "Santiago León",
    "Tatiana Gil", "Úrsula Vega", "Víctor Salas", "Wendy Marín", "Ximena Cruz", "Yesid Parra",
    "Zoe Lozano", "Andrea Pinto", "Camilo Rey", "Daniela Mora", "Esteban Ruiz", "Felipe Acosta",
    "Gloria Navas", "Iván Toro", "Juana Flórez", "Kevin Ospina", "Lina Bravo", "Mario Cárdenas",
];
const TEMPERATURAS = ["FRIO", "TIBIO", "CALIENTE", "TIBIO", "FINALIZADO", "FRIO", "CALIENTE", "DESCARTADO", "TIBIO"];
const sesiones = [];
for (const [i, nombre] of NOMBRES.entries()) {
    const cuenta = cuentas[i % 3];
    const dias = (i * 5) % 29;
    const cuando = hace(dias, (i * 7) % 12);
    const asesor = equipo[i % 3];
    const s = await db.session.create({
        data: {
            userId: cuenta.id,
            remoteJid: `5731${String(10_000_000 + i * 137_911).padStart(8, "0")}@s.whatsapp.net`,
            pushName: nombre,
            instanceId: `inst-guia-informes-${i % 3}`,
            status: i % 5 !== 0,
            agentDisabled: i % 6 === 0,
            leadStatus: TEMPERATURAS[i % TEMPERATURAS.length],
            leadStatusUpdatedAt: cuando,
            assignedAdvisorId: i % 4 === 0 ? null : asesor.id,
            createdAt: cuando,
            updatedAt: cuando,
        },
    });
    sesiones.push({ ...s, cuenta, asesor });
}

/* ── Lo que el agente anotó en el CRM: registros de cada tipo ─────────── */
const TIPOS = ["REPORTE", "SOLICITUD", "RESERVA", "REPORTE", "PEDIDO", "PAGO", "RECLAMO", "PRODUCTO", "SOLICITUD", "RESERVA"];
const RESUMENES = {
    REPORTE: "Pregunta por el precio de una limpieza dental.",
    SOLICITUD: "Pide una valoración de ortodoncia para su hija.",
    RESERVA: "Quiere apartar una cita para el sábado en la mañana.",
    PEDIDO: "Compra el kit de blanqueamiento para casa.",
    PAGO: "Envía el comprobante del abono de su tratamiento.",
    RECLAMO: "La cita empezó tarde y pide que no vuelva a pasar.",
    PRODUCTO: "Pregunta si tienen cepillos eléctricos.",
};
for (const [i, s] of sesiones.entries()) {
    const tipo = TIPOS[i % TIPOS.length];
    await db.registro.create({
        data: { tipo, resumen: RESUMENES[tipo], sessionId: s.id, userId: s.cuenta.id, fecha: s.createdAt },
    });
}

/* ── Los seguimientos automáticos, en sus estados ─────────────────────── */
const ESTADOS_DEL_SEGUIMIENTO = ["SENT", "SENT", "SENT", "PENDING", "SENT", "CANCELLED", "FAILED", "SENT", "PENDING", "SKIPPED"];
for (const [i, s] of sesiones.slice(0, 30).entries()) {
    await db.crmFollowUp.create({
        data: {
            sessionId: s.id,
            userId: s.cuenta.id,
            remoteJid: s.remoteJid,
            instanceId: s.instanceId,
            leadStatusSnapshot: s.leadStatus,
            ruleKey: `regla-${i % 3}`,
            sourceHash: `guia-${i}`,
            scheduledFor: new Date(s.createdAt.getTime() + DIA),
            status: ESTADOS_DEL_SEGUIMIENTO[i % ESTADOS_DEL_SEGUIMIENTO.length],
        },
    });
}

/* ── Las CITAS: unas pasadas y otras de esta semana ───────────────────── */
const ESTADOS_DE_CITA = ["CONFIRMADA", "PENDIENTE", "ATENDIDA", "ATENDIDA", "CANCELADA", "CONFIRMADA", "NO_ASISTIDA", "ATENDIDA", "PENDIENTE"];
for (const [i, s] of sesiones.slice(0, 27).entries()) {
    const futura = i % 3 === 0;
    const inicio = futura ? new Date(ahora + ((i % 6) + 1) * DIA) : hace((i * 3) % 25, 2);
    inicio.setHours(9 + (i % 8), 0, 0, 0);
    await db.appointment.create({
        data: {
            userId: s.cuenta.id,
            sessionId: s.id,
            clientName: s.pushName,
            startTime: inicio,
            endTime: new Date(inicio.getTime() + 45 * 60_000),
            timezone: "America/Bogota",
            status: futura ? (i % 2 ? "PENDIENTE" : "CONFIRMADA") : ESTADOS_DE_CITA[i % ESTADOS_DE_CITA.length],
            createdAt: hace((i * 2) % 26),
        },
    });
}

/* ── Las LLAMADAS: salientes y entrantes, unas contestadas ────────────── */
for (const [i, s] of sesiones.slice(0, 32).entries()) {
    const cuando = hace((i * 11) % 28, (i * 5) % 10).getTime();
    const saliente = i % 3 !== 2;
    const contestada = i % 4 !== 3;
    const numero = s.remoteJid.split("@")[0];
    const messageId = saliente ? `callout_${cuando}_${numero}` : `callin_${cuando}_${numero}`;
    const segundos = contestada ? 40 + ((i * 37) % 260) : 0;
    const call = {
        direction: saliente ? "outgoing" : "incoming",
        durationSecs: segundos,
        ...(i % 2 ? { isBot: true } : {}),
        status: saliente ? (contestada ? "completed" : "no_answer") : contestada ? "completed" : "missed",
        hasRecording: false,
    };
    await db.chatMessage.create({
        data: {
            userId: s.cuenta.id,
            instanceName: `LINEA_${["CLINICA", "NORTE", "SUR"][cuentas.indexOf(s.cuenta)]}`,
            instanceType: "waha",
            remoteJid: s.remoteJid,
            messageId,
            fromMe: saliente,
            pushName: s.pushName,
            messageType: "call",
            content: saliente ? "Llamada realizada" : contestada ? "Llamada recibida" : "Llamada perdida",
            raw: { key: { id: messageId, remoteJid: s.remoteJid, fromMe: saliente }, call },
            messageTimestamp: new Date(cuando),
        },
    });
}

/* ── La ENCUESTA de satisfacción: notas del 1 al 10 por asesor ────────── */
await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "encuesta_satisfaccion_ajustes" (
        "cuentaId" TEXT PRIMARY KEY,
        "activa" BOOLEAN NOT NULL DEFAULT FALSE,
        "actualizadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "encuestas_satisfaccion" (
        "id" TEXT PRIMARY KEY,
        "cuentaId" TEXT NOT NULL,
        "sessionId" INTEGER NOT NULL,
        "instanceName" TEXT NOT NULL,
        "remoteJid" TEXT NOT NULL,
        "identidades" TEXT[] NOT NULL DEFAULT '{}',
        "asesorId" TEXT,
        "estado" TEXT NOT NULL,
        "motivo" TEXT,
        "puntuacion" INTEGER,
        "creadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "enviadaEn" TIMESTAMP(3),
        "respondidaEn" TIMESTAMP(3)
    )`);
await db.$executeRaw`DELETE FROM "encuestas_satisfaccion" WHERE "cuentaId" = ANY(${ids}::text[])`;
for (const id of ids) {
    await db.$executeRaw`
        INSERT INTO "encuesta_satisfaccion_ajustes" ("cuentaId", "activa") VALUES (${id}, true)
        ON CONFLICT ("cuentaId") DO UPDATE SET "activa" = true`;
}
// Paula saca notas altas, Mateo mezcla y Diana tiene un par de detractores.
const NOTAS = [[10, 9, 10, 9, 8, 10], [9, 7, 8, 10, 6, 9], [10, 5, 9, 8, 4, 9]];
let n = 0;
for (const [a, notas] of NOTAS.entries()) {
    for (const [k, nota] of notas.entries()) {
        const s = sesiones[(a * 7 + k * 3) % sesiones.length];
        const enviada = hace((n * 3) % 26, 4);
        await db.$executeRaw`
            INSERT INTO "encuestas_satisfaccion"
              ("id", "cuentaId", "sessionId", "instanceName", "remoteJid", "asesorId", "estado", "puntuacion", "creadaEn", "enviadaEn", "respondidaEn")
            VALUES (${`guia-informes-nps-${n}`}, ${s.cuenta.id}, ${s.id}, 'LINEA_CLINICA', ${s.remoteJid}, ${equipo[a].id},
                    'respondida', ${nota}, ${enviada}, ${enviada}, ${new Date(enviada.getTime() + 600_000)})`;
        n++;
    }
}
for (let k = 0; k < 4; k++) {
    const s = sesiones[(k * 5 + 2) % sesiones.length];
    const enviada = hace(k * 4 + 1, 2);
    await db.$executeRaw`
        INSERT INTO "encuestas_satisfaccion"
          ("id", "cuentaId", "sessionId", "instanceName", "remoteJid", "asesorId", "estado", "creadaEn", "enviadaEn")
        VALUES (${`guia-informes-nps-sin-${k}`}, ${s.cuenta.id}, ${s.id}, 'LINEA_CLINICA', ${s.remoteJid}, ${equipo[k % 3].id},
                'sin_respuesta', ${enviada}, ${enviada})`;
}

/* ── El SENTIMIENTO: conversaciones que pasaron a un cliente molesto ──── */
await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "sentimiento_ajustes" (
        "cuentaId" TEXT PRIMARY KEY,
        "activa" BOOLEAN NOT NULL DEFAULT false,
        "actualizadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "sentimiento_caidas" (
        "userId" TEXT NOT NULL,
        "instanceName" TEXT NOT NULL,
        "remoteJid" TEXT NOT NULL,
        "dia" DATE NOT NULL,
        "asesorId" TEXT,
        "sucedioEn" TIMESTAMP(3) NOT NULL,
        PRIMARY KEY ("userId", "instanceName", "remoteJid", "dia")
    )`);
await db.$executeRawUnsafe(`ALTER TABLE "sentimiento_caidas" ADD COLUMN IF NOT EXISTS "calibracion" INTEGER`);
await db.$executeRaw`DELETE FROM "sentimiento_caidas" WHERE "userId" = ANY(${ids}::text[])`;
for (const id of ids) {
    await db.$executeRaw`
        INSERT INTO "sentimiento_ajustes" ("cuentaId", "activa") VALUES (${id}, true)
        ON CONFLICT ("cuentaId") DO UPDATE SET "activa" = true`;
}
for (let k = 0; k < 11; k++) {
    const s = sesiones[(k * 3 + 1) % sesiones.length];
    const cuando = hace((k * 5) % 27, 3);
    const dia = cuando.toISOString().slice(0, 10);
    await db.$executeRaw`
        INSERT INTO "sentimiento_caidas" ("userId", "instanceName", "remoteJid", "dia", "asesorId", "sucedioEn", "calibracion")
        VALUES (${s.cuenta.id}, 'LINEA_CLINICA', ${s.remoteJid}, ${dia}::date, ${k % 4 === 3 ? null : equipo[k % 3].id}, ${cuando}, 2)
        ON CONFLICT DO NOTHING`;
}

/* ── Los FLUJOS: publicados y borradores, con conversaciones en marcha ─ */
const FLUJOS = [
    ["Bienvenida", "PUBLISHED"],
    ["Agendar valoración", "PUBLISHED"],
    ["Recordar limpieza", "PUBLISHED"],
    ["Ortodoncia", "PUBLISHED"],
    ["Promoción blanqueamiento", "DRAFT"],
];
const flujos = [];
for (const [i, [name, status]] of FLUJOS.entries()) {
    flujos.push(
        await db.workflow.create({
            data: { userId: cuentas[i % 2].id, name, status, definition: "{}", order: i, createdAt: hace(40 - i) },
        }),
    );
}
for (const [i, s] of sesiones.entries()) {
    const f = flujos[[0, 0, 1, 0, 1, 2, 0, 3, 1][i % 9]];
    await db.sessionWorkflowState.create({ data: { sessionId: s.id, workflowId: f.id } });
}

/* ── Las ETIQUETAS de la clínica (las de la cuenta con la que se entra) ─ */
const ETIQUETAS = [
    ["Lead", "#3B82F6"],
    ["Prospecto", "#F59E0B"],
    ["Cliente", "#10B981"],
    ["Ortodoncia", "#8B5CF6"],
    ["Urgencia", "#EF4444"],
];
const etiqueta = {};
for (const [i, [name, color]] of ETIQUETAS.entries()) {
    etiqueta[name] = await db.tag.create({
        data: { userId: dueno.id, name, slug: name.toLowerCase(), color, order: i },
    });
}
const propias = sesiones.filter((s) => s.cuenta.id === dueno.id);
for (const [i, s] of propias.entries()) {
    const madurez = ["Lead", "Lead", "Prospecto", "Cliente", "Lead", "Prospecto"][i % 6];
    await db.sessionTag.create({ data: { sessionId: s.id, tagId: etiqueta[madurez].id } });
    if (i % 3 === 0) await db.sessionTag.create({ data: { sessionId: s.id, tagId: etiqueta.Ortodoncia.id } });
    if (i % 5 === 1) await db.sessionTag.create({ data: { sessionId: s.id, tagId: etiqueta.Urgencia.id } });
}

/* ── Los PRODUCTOS de la clínica ──────────────────────────────────────── */
const PRODUCTOS = [
    ["Kit de blanqueamiento", "Estética", 180000, 24],
    ["Cepillo eléctrico", "Higiene", 150000, 12],
    ["Hilo dental x3", "Higiene", 18000, 40],
    ["Enjuague bucal 500 ml", "Higiene", 22000, 4],
    ["Protector nocturno", "Ortodoncia", 260000, 3],
    ["Retenedor transparente", "Ortodoncia", 320000, 0],
    ["Gel para encías", "Higiene", 26000, 15],
];
for (const [i, [title, category, price, stock]] of PRODUCTOS.entries()) {
    await db.product.create({
        data: { userId: cuentas[i % 2].id, title, category, price, stock, sku: `SON-${i + 1}`, tags: [], images: [], isActive: true, order: i },
    });
}

/* ── Las VENTAS y los GASTOS del mes (lo que se anotó en Finanzas) ────── */
for (const [code, name, symbol] of [["COP", "Peso Colombiano", "COP$"]]) {
    await db.financeCurrency.upsert({ where: { code }, update: {}, create: { code, name, symbol, decimals: 2 } });
}
for (const c of cuentas) {
    const caja = await db.financeAccount.create({
        data: { userId: c.id, name: "Caja", type: "COMPANY", isDefault: true, currencyCode: "COP" },
    });
    const venta = await db.financeCategory.create({ data: { userId: c.id, name: "Tratamientos", type: "SALE", order: 1 } });
    const gastos = {};
    for (const [i, name] of ["Arriendo", "Insumos", "Marketing", "Nómina"].entries()) {
        gastos[name] = await db.financeCategory.create({ data: { userId: c.id, name, type: "EXPENSE", order: i + 1 } });
    }
    const k = cuentas.indexOf(c);
    for (let i = 0; i < 12; i++) {
        const valor = 220000 + ((i * 47 + k * 13) % 9) * 45000;
        await db.financeTransaction.create({
            data: {
                userId: c.id, type: "SALE", amount: valor, currencyCode: "COP",
                title: "Tratamiento", accountId: caja.id, categoryId: venta.id,
                occurredAt: hace((i * 3 + k) % 28, 2),
            },
        });
    }
    for (const [name, valor] of [["Arriendo", 700000], ["Insumos", 280000], ["Marketing", 160000], ["Nómina", 1100000]]) {
        await db.financeTransaction.create({
            data: {
                userId: c.id, type: "EXPENSE", amount: valor - k * 60000, currencyCode: "COP",
                title: name, accountId: caja.id, categoryId: gastos[name].id,
                occurredAt: hace(5 + k * 3, 4),
            },
        });
    }
}

/* ── Los CRÉDITOS de IA de la cuenta (1 crédito = 3.085 tokens) ───────── */
await db.iaCredit.upsert({
    where: { userId: dueno.id },
    update: { total: 12000, used: 4200 * 3085, renewalDate: new Date(ahora + 12 * DIA) },
    create: { userId: dueno.id, total: 12000, used: 4200 * 3085, renewalDate: new Date(ahora + 12 * DIA) },
});

console.log(JSON.stringify({ cuentas: cuentas.length, contactos: sesiones.length, modulos: MENU_DE_UN_CLIENTE.length }));
await db.$disconnect();
