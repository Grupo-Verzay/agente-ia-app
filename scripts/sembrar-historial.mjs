/**
 * Lo mínimo para abrir el chat de equipo en Chromium con un SÚPER
 * ADMINISTRADOR y su equipo: la casa (rol `super_admin`), tres personas y el
 * módulo que da la pantalla. Los directos no hace falta sembrarlos: la lista
 * ofrece a la gente del equipo aunque todavía no haya ningún directo abierto.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();
const pass = await bcrypt.hash("banco1234", 10);

const casa = await db.user.upsert({
    where: { email: "casa@banco.test" },
    update: { role: "super_admin" },
    create: { email: "casa@banco.test", name: "Casa Verzay", password: pass, role: "super_admin", status: true, company: "Casa" },
});
for (const [email, name, advisorRole] of [
    ["ana@banco.test", "Ana Admin", "administrador"],
    ["beto@banco.test", "Beto Agente", "agente"],
    ["carla@banco.test", "Carla Agente", "agente"],
]) {
    await db.user.upsert({
        where: { email },
        update: {},
        create: { email, name, password: pass, role: "user", status: true, ownerId: casa.id, advisorRole },
    });
}
if ((await db.module.count({ where: { route: "/chat-equipo" } })) === 0) {
    await db.module.create({
        data: {
            label: "Equipo",
            route: "/chat-equipo",
            icon: "Users",
            order: 1,
            moduleItems: { create: [{ title: "Chat de equipo", url: "/chat-equipo" }] },
        },
    });
}
// Arranca limpio: el orden guardado de una vuelta anterior no cuenta.
await db.$executeRawUnsafe(`DELETE FROM "orden_en_tablero" WHERE "tipo" = 'directos'`).catch(() => {});
console.log(JSON.stringify({ casa: casa.id }));
await db.$disconnect();
