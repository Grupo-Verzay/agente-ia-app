/**
 * El chat del equipo con MUCHOS canales y directos, para ver la lista crecer.
 *
 * Encima de `sembrar-barra.mjs` (la cuenta `jefe@banco.test`): 30 canales de
 * área de su cuenta y 30 personas en su equipo. Las personas salen en
 * «Directos» aunque no haya ningún directo abierto —la lista ofrece a la gente
 * del equipo con quien todavía no se ha hablado—, así que con esto la lista
 * pasa de sesenta filas y no cabe en ningún panel.
 *
 * Las tablas del chat las crea la App la primera vez que se usan; aquí se
 * crean con su MISMA definición (`lib/chat-de-equipo-db.ts`) para poder
 * sembrar antes de abrir nada. `IF NOT EXISTS`: si la App ya las creó, no se
 * tocan.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();
const pass = await bcrypt.hash("banco1234", 10);
const CANALES = Number(process.env.CANALES ?? 30);
const PERSONAS = Number(process.env.PERSONAS ?? 30);

const jefe = await db.user.findUnique({ where: { email: "jefe@banco.test" } });
if (!jefe) throw new Error("falta la cuenta: corre antes scripts/sembrar-barra.mjs");

await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "team_channels" (
        "id" TEXT PRIMARY KEY,
        "cuentaId" TEXT NOT NULL,
        "tipo" TEXT NOT NULL,
        "nombre" TEXT NOT NULL,
        "llave" TEXT,
        "creadoPorId" TEXT,
        "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "team_channel_members" (
        "canalId" TEXT NOT NULL,
        "personaId" TEXT NOT NULL,
        "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY ("canalId", "personaId")
    )`);

for (let i = 1; i <= CANALES; i += 1) {
    const id = `banco-area-${String(i).padStart(2, "0")}`;
    await db.$executeRawUnsafe(
        `INSERT INTO "team_channels" ("id", "cuentaId", "tipo", "nombre", "creadoPorId")
         VALUES ($1, $2, 'area', $3, $2) ON CONFLICT ("id") DO NOTHING`,
        id,
        jefe.id,
        `Área ${String(i).padStart(2, "0")}`,
    );
    await db.$executeRawUnsafe(
        `INSERT INTO "team_channel_members" ("canalId", "personaId") VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        id,
        jefe.id,
    );
}

for (let i = 1; i <= PERSONAS; i += 1) {
    const email = `persona${String(i).padStart(2, "0")}@banco.test`;
    await db.user.upsert({
        where: { email },
        update: {},
        create: {
            email,
            name: `Persona ${String(i).padStart(2, "0")}`,
            password: pass,
            role: "user",
            status: true,
            ownerId: jefe.id,
            advisorRole: "agente",
        },
    });
}

// Arranca en la LISTA: sin vista recordada no hay nada que decida otra cosa,
// pero el orden guardado de una vuelta anterior sí movería filas.
await db.$executeRawUnsafe(`DELETE FROM "orden_en_tablero" WHERE "tipo" = 'directos'`).catch(() => {});
console.log(JSON.stringify({ jefe: jefe.id, canales: CANALES, personas: PERSONAS }));
await db.$disconnect();
