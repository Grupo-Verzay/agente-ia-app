/**
 * Una familia de Finanzas con cifras que no se pueden confundir.
 *
 * La madre («Casa Madre») vinculó a dos hijas («Sucursal Norte», «Sucursal
 * Sur») por `linked_accounts`, así que ve el selector de cuentas. Cada cuenta
 * tiene SUS ventas en tres meses, con importes distintos en cada una: así,
 * leyendo la cifra de un mes en la rejilla, se sabe de qué cuenta es.
 *
 *   mes       Casa Madre   Sucursal Norte   Sucursal Sur
 *   2026-03      100.000          200.000        300.000
 *   2026-05    1.111.000        2.222.000      3.333.000
 *   2025-05       10.000           20.000         30.000
 *
 * Lo usa `scripts/banco-cuenta-del-resumen-navegador.sh`.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();
const CLAVE = "banco1234";
const pass = await bcrypt.hash(CLAVE, 10);

const CUENTAS = [
    { email: "madre-resumen@banco.test", name: "Casa Madre", importes: [100000, 1111000, 10000] },
    { email: "norte-resumen@banco.test", name: "Sucursal Norte", importes: [200000, 2222000, 20000] },
    { email: "sur-resumen@banco.test", name: "Sucursal Sur", importes: [300000, 3333000, 30000] },
];
const MESES = [
    new Date(2026, 2, 10, 12, 0, 0),
    new Date(2026, 4, 10, 12, 0, 0),
    new Date(2025, 4, 10, 12, 0, 0),
];

/*
 * Sin ni un módulo el layout devuelve el esqueleto y ninguna pantalla se pinta.
 * Finanzas no está en ninguno, así que el guardián del layout no la cierra.
 */
if ((await db.module.count()) === 0) {
    await db.module.create({
        data: {
            label: "Chats",
            route: "/chats",
            icon: "MessageCircle",
            order: 1,
            moduleItems: { create: [{ title: "Chats", url: "/chats" }] },
        },
    });
}

await db.financeCurrency.upsert({
    where: { code: "COP" },
    update: { decimals: 0 },
    create: { code: "COP", name: "Peso colombiano", symbol: "$", decimals: 0 },
});

const ids = [];
for (const c of CUENTAS) {
    const u = await db.user.upsert({
        where: { email: c.email },
        update: { name: c.name, company: c.name, ownerId: null, status: true, preferredCurrencyCode: "COP" },
        create: {
            email: c.email,
            name: c.name,
            company: c.name,
            password: pass,
            role: "admin",
            status: true,
            preferredCurrencyCode: "COP",
        },
    });
    ids.push(u.id);

    await db.financeTransaction.deleteMany({ where: { userId: u.id } });
    await db.financeAccount.deleteMany({ where: { userId: u.id } });
    const cuenta = await db.financeAccount.create({
        data: { userId: u.id, name: "Caja", type: "COMPANY", isDefault: true, currencyCode: "COP" },
    });

    for (const [i, importe] of c.importes.entries()) {
        await db.financeTransaction.create({
            data: {
                userId: u.id,
                type: "SALE",
                occurredAt: MESES[i],
                amount: importe,
                currencyCode: "COP",
                accountId: cuenta.id,
                title: `Venta de ${c.name}`,
            },
        });
    }
}

const [madre, norte, sur] = ids;
await db.linkedAccount.deleteMany({ where: { OR: [{ masterUserId: { in: ids } }, { linkedUserId: { in: ids } }] } });
for (const hija of [norte, sur]) {
    await db.linkedAccount.create({ data: { masterUserId: madre, linkedUserId: hija, role: "administrador" } });
}

console.log(JSON.stringify({ madre, norte, sur }));
await db.$disconnect();
