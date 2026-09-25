/**
 * Lo mínimo para abrir Embudos en Chromium, sobre la página servida: un dueño,
 * una administradora, dos agentes, conversaciones de cada uno y una sin asesor,
 * y un módulo que monta `/embudos` (sin ni un módulo el layout pinta un
 * esqueleto y no se mediría nada). Los embudos NO se siembran: los crea la
 * sonda por la pantalla, que es lo que se viene a probar.
 *
 * Y una cuenta HIJA con sus propias conversaciones, vinculada bajo la del dueño:
 * es lo que hace que el selector de cuenta se pinte. Sin ella, el servidor
 * devuelve `puedeElegirCuenta: false` —con una sola cuenta no hay nada que
 * elegir— y la sonda mediría una pantalla sin el mando que viene a probar.
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

// Embudos, y Etiquetas: la sonda compara la fila de colores del panel de etapas
// contra la de Etiquetas en la misma sesión, así que esa pantalla tiene que
// poder abrirse.
for (const [label, route, icon, title] of [
    ["Embudos", "/embudos", "Kanban", "Embudos"],
    ["Etiquetas", "/tags", "Tag", "Etiquetas"],
]) {
    if ((await db.module.count({ where: { route } })) === 0) {
        await db.module.create({
            data: {
                label,
                route,
                icon,
                order: 1,
                moduleItems: { create: [{ title, url: route }] },
            },
        });
    }
}

// La cuenta hija y su equipo. Es una cuenta de verdad —sin `ownerId`—, así que
// lo único que la cuelga del dueño es la fila de `linked_accounts`.
const hija = await persona("hija@embudos.test", "Verzay Ventas", { company: "Verzay Ventas" });
const hijaAsesor = await persona("sofia@embudos.test", "Sofía Ramos", {
    ownerId: hija.id,
    advisorRole: "agente",
});
await db.linkedAccount.upsert({
    where: { masterUserId_linkedUserId: { masterUserId: dueno.id, linkedUserId: hija.id } },
    update: {},
    create: { masterUserId: dueno.id, linkedUserId: hija.id },
});

await db.session.deleteMany({ where: { userId: { in: [dueno.id, hija.id] } } });
const conversaciones = [
    [dueno.id, "María Fernanda Gil", ana.id],
    [dueno.id, "Julián Restrepo", ana.id],
    [dueno.id, "Ferretería El Tornillo", beto.id],
    [dueno.id, "Marta Lucía Rendón", null],
    [hija.id, "Panadería La Espiga", hijaAsesor.id],
    [hija.id, "Distribuidora Andina", null],
];
for (const [i, [cuenta, nombre, asesor]] of conversaciones.entries()) {
    await db.session.create({
        data: {
            userId: cuenta,
            remoteJid: `57300000000${i}@s.whatsapp.net`,
            pushName: nombre,
            instanceId: "inst-embudos",
            status: true,
            assignedAdvisorId: asesor,
        },
    });
}

console.log(
    JSON.stringify({
        dueno: dueno.id,
        admin: admin.id,
        ana: ana.id,
        beto: beto.id,
        hija: hija.id,
        hijaAsesor: hijaAsesor.id,
    }),
);
await db.$disconnect();
