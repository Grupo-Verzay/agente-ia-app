/**
 * Los DATOS DE EJEMPLO de las capturas de la guía de Cobros, encima de
 * `sembrar-barra.mjs` (que pone la cuenta y su línea de WhatsApp).
 *
 * Con la forma de una cartera de verdad: deudas en TODAS las situaciones
 * —comprobante recibido, vencida (una pasada de la gracia), por vencer, al día
 * y sin fecha—, con su historial de ciclos pagados, una con su cuenta de cobro
 * adjunta (y otra con un archivo que no salió) y una con sus propios datos de
 * pago. Y la configuración de la cuenta con sus datos de pago y sus tres
 * avisos. Con tres deudas iguales una guía no enseña nada.
 *
 * Las fechas son RELATIVAS a hoy, en la zona de la cuenta (Bogotá): la
 * situación de una deuda sale de su vencimiento. Todos los números y nombres
 * son de ejemplo: la guía es pública.
 *
 * Se puede correr las veces que haga falta: borra lo suyo y lo vuelve a poner.
 * El script de capturas lo vuelve a correr antes del vídeo, porque las
 * capturas crean, confirman y marcan deudas.
 */
process.env.TZ = "America/Bogota";

import { PrismaClient } from "@prisma/client";
import { MENU_DE_UN_CLIENTE, sembrarElMarco } from "./sembrar-marco-de-la-guia.mjs";

const db = new PrismaClient();

const dueno = await sembrarElMarco(db, {
    path: "/cobros",
    title: "Guía de Cobros",
    description: "Aprende a cobrar a tus clientes con recordatorios por WhatsApp",
    url: "/guia/cobros",
});
await db.user.update({ where: { id: dueno.id }, data: { timezone: "America/Bogota" } });

/* ── Las tablas son de la App: se crean como las crea `lib/cobros-db.ts` ─── */
const ddl = [
    `CREATE TABLE IF NOT EXISTS "cobros" (
        "id" TEXT PRIMARY KEY, "ownerId" TEXT NOT NULL, "creadoPorId" TEXT NOT NULL,
        "contactoNombre" TEXT NOT NULL, "contactoTelefono" TEXT NOT NULL, "contactoJid" TEXT,
        "concepto" TEXT NOT NULL DEFAULT '', "monto" NUMERIC(18,2), "moneda" TEXT NOT NULL DEFAULT 'COP',
        "vence" TIMESTAMP(3), "estado" TEXT NOT NULL DEFAULT 'pendiente',
        "diasDeLicencia" INTEGER NOT NULL DEFAULT 30, "diasDeGracia" INTEGER NOT NULL DEFAULT 3,
        "ultimoRecordatorioEn" TIMESTAMP(3), "ultimoRecordatorioVence" TIMESTAMP(3), "ultimoHito" TEXT,
        "confirmadaEn" TIMESTAMP(3), "confirmadaPorId" TEXT,
        "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "actualizadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
    `ALTER TABLE "cobros" ADD COLUMN IF NOT EXISTS "notaDePago" TEXT`,
    `CREATE TABLE IF NOT EXISTS "cobro_adjuntos" (
        "id" TEXT PRIMARY KEY, "cobroId" TEXT NOT NULL, "url" TEXT NOT NULL, "nombre" TEXT NOT NULL,
        "tipo" TEXT NOT NULL, "mimeType" TEXT, "tamanoBytes" BIGINT,
        "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
    `ALTER TABLE "cobro_adjuntos" ADD COLUMN IF NOT EXISTS "ultimoEnvioEn" TIMESTAMP(3),
        ADD COLUMN IF NOT EXISTS "ultimoFalloEn" TIMESTAMP(3), ADD COLUMN IF NOT EXISTS "ultimoFallo" TEXT`,
    `CREATE TABLE IF NOT EXISTS "cobro_ciclos" (
        "id" TEXT PRIMARY KEY, "cobroId" TEXT NOT NULL, "ownerId" TEXT NOT NULL, "vencia" TIMESTAMP(3),
        "siguienteVence" TIMESTAMP(3) NOT NULL, "monto" NUMERIC(18,2), "moneda" TEXT NOT NULL DEFAULT 'COP',
        "diasDeLicencia" INTEGER NOT NULL, "confirmadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "confirmadaPorId" TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS "cobros_config" (
        "ownerId" TEXT PRIMARY KEY, "datosDePago" TEXT NOT NULL DEFAULT '',
        "mensajeAntes" TEXT, "mensajeElDia" TEXT, "mensajeDespues" TEXT,
        "diasAntes" INTEGER DEFAULT 3, "avisarElDia" BOOLEAN NOT NULL DEFAULT TRUE, "diasDespues" INTEGER DEFAULT 3,
        "actualizadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
];
for (const sql of ddl) await db.$executeRawUnsafe(sql);

await db.$executeRawUnsafe(
    `DELETE FROM "cobro_adjuntos" WHERE "cobroId" IN (SELECT "id" FROM "cobros" WHERE "ownerId" = $1)`,
    dueno.id,
);
await db.$executeRawUnsafe(`DELETE FROM "cobro_ciclos" WHERE "ownerId" = $1`, dueno.id);
await db.$executeRawUnsafe(`DELETE FROM "cobros" WHERE "ownerId" = $1`, dueno.id);
await db.$executeRawUnsafe(`DELETE FROM "cobros_config" WHERE "ownerId" = $1`, dueno.id);

/* ── Las fechas, relativas a HOY ─────────────────────────────────────────── */
const elDia = (dias) => {
    const d = new Date();
    d.setDate(d.getDate() + dias);
    d.setHours(12, 0, 0, 0);
    return d;
};

/*
 * Las DEUDAS. `ciclos` son los pagos ya confirmados, del más viejo al más
 * nuevo: cada uno saltó 30 días. Nombres cortos para que nada salga con «…».
 */
const DEUDAS = [
    { id: "guia-cobro-marta", nombre: "Marta Restrepo", tel: "573001112233", concepto: "Internet hogar 300 Mb", monto: 89000, vence: 0, estado: "comprobante", ciclos: 5 },
    { id: "guia-cobro-andres", nombre: "Andrés Pérez", tel: "573014445566", concepto: "Plan streaming familiar", monto: 45000, vence: -6, ciclos: 2 },
    { id: "guia-cobro-valentina", nombre: "Valentina Ruiz", tel: "573105556677", concepto: "Mensualidad gimnasio", monto: 120000, vence: -2, ciclos: 7 },
    { id: "guia-cobro-carlos", nombre: "Carlos Gómez", tel: "573157778899", concepto: "Hosting y dominio", monto: 65000, vence: 2, ciclos: 11, adjunto: true },
    { id: "guia-cobro-laura", nombre: "Laura Méndez", tel: "573201234567", concepto: "Clases de inglés", monto: 180000, vence: 3, ciclos: 3, nota: "Daviplata 3201234567 a nombre de Laura Méndez" },
    { id: "guia-cobro-felipe", nombre: "Felipe Ríos", tel: "573186543210", concepto: "Soporte técnico mensual", monto: 150000, vence: 12, ciclos: 4, fallo: true },
    { id: "guia-cobro-sara", nombre: "Sara Castaño", tel: "573125550044", concepto: "Plan de datos empresa", monto: 230000, vence: 21, ciclos: 9 },
    { id: "guia-cobro-julian", nombre: "Julián Vargas", tel: "573168881122", concepto: "Asesoría contable", monto: 300000, vence: null, ciclos: 0 },
];

const CUENTA_DE_COBRO = "https://archivos.ejemplo.co/cobros/cuenta-de-cobro.pdf";

for (const d of DEUDAS) {
    const vence = d.vence === null ? null : elDia(d.vence);
    await db.$executeRawUnsafe(
        `INSERT INTO "cobros" ("id","ownerId","creadoPorId","contactoNombre","contactoTelefono","concepto","monto","moneda",
            "vence","estado","diasDeLicencia","diasDeGracia","notaDePago","creadoEn")
         VALUES ($1,$2,$2,$3,$4,$5,$6,'COP',$7,$8,30,3,$9,$10)`,
        d.id,
        dueno.id,
        d.nombre,
        d.tel,
        d.concepto,
        d.monto,
        vence,
        d.estado ?? "pendiente",
        d.nota ?? null,
        elDia(-30 * (d.ciclos + 1)),
    );
    // El historial: cada ciclo cerró un vencimiento y saltó 30 días.
    for (let i = 0; i < d.ciclos; i++) {
        const base = vence ?? elDia(0);
        const vencia = new Date(base.getTime() - (d.ciclos - i) * 30 * 86_400_000);
        const siguiente = new Date(vencia.getTime() + 30 * 86_400_000);
        await db.$executeRawUnsafe(
            `INSERT INTO "cobro_ciclos" ("id","cobroId","ownerId","vencia","siguienteVence","monto","moneda","diasDeLicencia","confirmadaEn","confirmadaPorId")
             VALUES ($1,$2,$3,$4,$5,$6,'COP',30,$7,$3)`,
            `${d.id}-ciclo-${i + 1}`,
            d.id,
            dueno.id,
            vencia,
            siguiente,
            d.monto,
            new Date(vencia.getTime() - 86_400_000),
        );
    }
    if (d.adjunto || d.fallo) {
        await db.$executeRawUnsafe(
            `INSERT INTO "cobro_adjuntos" ("id","cobroId","url","nombre","tipo","mimeType","tamanoBytes","ultimoEnvioEn","ultimoFalloEn","ultimoFallo")
             VALUES ($1,$2,$3,$4,'document','application/pdf',48213,$5,$6,$7)`,
            `${d.id}-adjunto`,
            d.id,
            CUENTA_DE_COBRO,
            d.fallo ? "factura-septiembre.pdf" : "cuenta-de-cobro.pdf",
            d.fallo ? null : elDia(-1),
            d.fallo ? elDia(-1) : null,
            d.fallo ? "El servidor de WhatsApp no aceptó el archivo." : null,
        );
    }
}

/* ── La CONFIGURACIÓN de la cuenta ──────────────────────────────────────── */
await db.$executeRawUnsafe(
    `INSERT INTO "cobros_config" ("ownerId","datosDePago","diasAntes","avisarElDia","diasDespues")
     VALUES ($1,$2,3,TRUE,3)`,
    dueno.id,
    "Nequi 3009990000\nBancolombia ahorros 123-456789-00 a nombre de Mi Negocio",
);

console.log(JSON.stringify({ deudas: DEUDAS.length, modulos: MENU_DE_UN_CLIENTE.length }));
await db.$disconnect();
