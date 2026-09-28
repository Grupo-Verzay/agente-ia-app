/**
 * Lo mínimo para abrir Equipo en Chromium: un dueño con tres asesores
 * disponibles y el módulo de Equipo. Lo usa `scripts/probar-reparto.mjs`.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();
const pass = await bcrypt.hash("banco1234", 10);

const dueno = await db.user.upsert({
    where: { email: "jefe-reparto@banco.test" },
    update: {},
    create: { email: "jefe-reparto@banco.test", name: "Carlos Jefe", password: pass, role: "admin", status: true, company: "Banco del Reparto" },
});
for (const [nombre, correo] of [["Ana Asesora", "ana"], ["Beto Asesor", "beto"], ["Caro Asesora", "caro"]]) {
    await db.user.upsert({
        where: { email: `${correo}-reparto@banco.test` },
        update: { advisorAvailable: true },
        create: { email: `${correo}-reparto@banco.test`, name: nombre, password: pass, role: "user", status: true, ownerId: dueno.id, advisorRole: "agente", advisorAvailable: true },
    });
}
await db.$executeRawUnsafe(`UPDATE "User" SET auto_assign_enabled = true, auto_assign_max_chats = 5 WHERE id = $1`, dueno.id);
await db.$executeRawUnsafe(`DELETE FROM "reparto_porcentaje" WHERE "cuentaId" = $1`, dueno.id).catch(() => {});
await db.$executeRawUnsafe(`DELETE FROM "reparto_porcentaje_asesor" WHERE "cuentaId" = $1`, dueno.id).catch(() => {});
if (!(await db.module.findFirst({ where: { route: "/equipo" } }))) {
    await db.module.create({
        data: { label: "Equipo", route: "/equipo", icon: "Users", order: 1, moduleItems: { create: [{ title: "Equipo", url: "/equipo" }] } },
    });
}
await db.$disconnect();
console.log("sembrado");
