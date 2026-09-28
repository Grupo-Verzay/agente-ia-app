/**
 * Un flujo de la cuenta del banco, para abrir /workflow/<id> en Chromium.
 * Va DESPUÉS de `sembrar-barra.mjs`, que crea la cuenta. Escribe el id.
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const dueno = await db.user.findUniqueOrThrow({ where: { email: "jefe@banco.test" } });
const flujo = await db.workflow.upsert({
    where: { name_userId: { name: "Banco de la paleta", userId: dueno.id } },
    update: {},
    create: { name: "Banco de la paleta", userId: dueno.id, definition: "{}", status: "active" },
});
console.log(flujo.id);
await db.$disconnect();
