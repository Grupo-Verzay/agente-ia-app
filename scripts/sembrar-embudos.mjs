/**
 * Lo mínimo para abrir Embudos en Chromium, sobre la página servida: un dueño,
 * una administradora, dos agentes, conversaciones de cada uno y una sin asesor,
 * y un módulo que monta `/embudos` (sin ni un módulo el layout pinta un
 * esqueleto y no se mediría nada). Los embudos NO se siembran: los crea la
 * sonda por la pantalla, que es lo que se viene a probar.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();
const pass = await bcrypt.hash("banco1234", 10);

async function persona(email, name, extra = {}) {
    return db.user.upsert({
        where: { email },
        update: {},
        create: { email, name, password: pass, role: "user", status: true, ...extra },
    });
}

const dueno = await persona("dueno@embudos.test", "Carlos Dueño", { company: "Banco de Embudos" });
const admin = await persona("monica@embudos.test", "Mónica Vélez", { ownerId: dueno.id, advisorRole: "administrador" });
const ana = await persona("ana@embudos.test", "Ana Ruiz", { ownerId: dueno.id, advisorRole: "agente" });
const beto = await persona("beto@embudos.test", "Beto Gil", { ownerId: dueno.id, advisorRole: "agente" });

if ((await db.module.count({ where: { route: "/embudos" } })) === 0) {
    await db.module.create({
        data: {
            label: "Embudos",
            route: "/embudos",
            icon: "Kanban",
            order: 1,
            moduleItems: { create: [{ title: "Embudos", url: "/embudos" }] },
        },
    });
}

await db.session.deleteMany({ where: { userId: dueno.id } });
const conversaciones = [
    ["María Fernanda Gil", ana.id],
    ["Julián Restrepo", ana.id],
    ["Ferretería El Tornillo", beto.id],
    ["Marta Lucía Rendón", null],
];
for (const [i, [nombre, asesor]] of conversaciones.entries()) {
    await db.session.create({
        data: {
            userId: dueno.id,
            remoteJid: `57300000000${i}@s.whatsapp.net`,
            pushName: nombre,
            instanceId: "inst-embudos",
            status: true,
            assignedAdvisorId: asesor,
        },
    });
}

console.log(JSON.stringify({ dueno: dueno.id, admin: admin.id, ana: ana.id, beto: beto.id }));
await db.$disconnect();
