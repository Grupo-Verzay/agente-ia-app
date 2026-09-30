/**
 * Los DATOS DE EJEMPLO de las capturas de la guía de Finanzas, encima de
 * `sembrar-barra.mjs` (que pone la cuenta, su clave y los módulos).
 *
 * La tostadora de café de la guía de Catálogo, ahora con su contabilidad de un
 * año: ventas y gastos de enero a hoy —con un mes en rojo, para que el resumen
 * anual enseñe cómo se ve un balance negativo—, tres cuentas de dinero con su
 * predeterminada, clientes, proveedores y una venta con su factura adjunta.
 * Con tres filas iguales una guía no enseña nada: aquí cada columna tiene algo
 * distinto que decir, y cada gasto cae en una categoría fija o variable.
 *
 * Las fechas se escriben a medianoche UTC del día, que es como las guarda la
 * pantalla (`new Date("AAAA-MM-DD")`): así caen en su mes en la rejilla anual y
 * en su día en la gráfica, esté donde esté el servidor.
 *
 * El marco —la cuenta de un cliente, su menú y la barra de arriba— es el de
 * todas las guías (`sembrar-marco-de-la-guia.mjs`).
 */
import { PrismaClient } from "@prisma/client";

import { MENU_DE_UN_CLIENTE, sembrarElMarco } from "./sembrar-marco-de-la-guia.mjs";

const db = new PrismaClient();

const marco = await sembrarElMarco(db, {
    path: "/dashboard/finance",
    title: "Guía de Finanzas",
    description: "Aprende a registrar ventas y gastos y ver tu balance en la plataforma",
    url: "/guia/finanzas",
});

const dueno = await db.user.update({
    where: { id: marco.id },
    data: { company: "Café del Monte", preferredCurrencyCode: "COP" },
});
const userId = dueno.id;

for (const [code, name, symbol, decimals] of [
    ["COP", "Peso Colombiano", "COP$", 2],
    ["USD", "US Dollar", "$", 2],
]) {
    await db.financeCurrency.upsert({ where: { code }, update: {}, create: { code, name, symbol, decimals } });
}

await db.financeAttachment.deleteMany({ where: { userId } });
await db.financeTransaction.deleteMany({ where: { userId } });
await db.financeCategory.deleteMany({ where: { userId } });
await db.financeAccount.deleteMany({ where: { userId } });
await db.financeContact.deleteMany({ where: { userId } });
await db.financeContactFieldConfig.deleteMany({ where: { userId } });

// ── Las cuentas del dinero ────────────────────────────────────────────────
const CUENTAS = [
    ["Caja principal", "COMPANY", true],
    ["Bancolombia", "COMPANY", false],
    ["Nequi", "PERSONAL", false],
];
const cuenta = {};
for (const [i, [name, type, isDefault]] of CUENTAS.entries()) {
    const c = await db.financeAccount.create({
        data: { userId, name, type, isDefault, currencyCode: "COP", createdAt: new Date(Date.UTC(2026, 0, 1 + i)) },
    });
    cuenta[name] = c.id;
}

// ── Las categorías ────────────────────────────────────────────────────────
// Las de ventas son las que la pantalla crea sola; las de gastos, las de una
// tostadora. «Salarios», «Arriendo» y «Herramientas» salen «Fijo»; «Insumos» y
// «Marketing», «Variable» (`elTipoDelGasto`).
const categoria = {};
for (const [i, name] of ["Ventas", "Servicios", "Suscripciones", "Otros"].entries()) {
    const c = await db.financeCategory.create({ data: { userId, name, type: "SALE", order: i + 1 } });
    categoria[`SALE:${name}`] = c.id;
}
for (const [i, name] of ["Salarios", "Arriendo", "Insumos", "Marketing", "Herramientas"].entries()) {
    const c = await db.financeCategory.create({ data: { userId, name, type: "EXPENSE", order: i + 1 } });
    categoria[`EXPENSE:${name}`] = c.id;
}

// ── Clientes y proveedores ────────────────────────────────────────────────
const CLIENTES = [
    ["CLI-001", "Hotel Andino", "573105550101", "compras@hotelandino.test", "Cundinamarca", "Bogotá", "Cra 7 # 72-41"],
    ["CLI-002", "Oficinas Nube", "573105550102", "admin@oficinasnube.test", "Antioquia", "Medellín", "Cl 10 # 43-12"],
    ["CLI-003", "Laura Gómez", "573105550103", "laura.gomez@correo.test", "Cundinamarca", "Bogotá", "Cl 85 # 15-20"],
    ["CLI-004", "Restaurante Fogón", "573105550104", "pedidos@fogon.test", "Valle del Cauca", "Cali", "Av 6N # 23-10"],
    ["CLI-005", "Andrés Rincón", "573105550105", "andres.rincon@correo.test", "Santander", "Bucaramanga", "Cra 33 # 48-05"],
];
const PROVEEDORES = [
    ["PRO-001", "Finca La Esperanza", "573115550201", "ventas@laesperanza.test", "Huila", "Pitalito", "Vereda El Cedro"],
    ["PRO-002", "Empaques del Valle", "573115550202", "comercial@empaquesvalle.test", "Valle del Cauca", "Palmira", "Zona Franca, bodega 4"],
    ["PRO-003", "Inmobiliaria Centro", "573115550203", "arriendos@inmocentro.test", "Cundinamarca", "Bogotá", "Cl 26 # 13-19"],
    ["PRO-004", "Tostadores Pro", "573115550204", "soporte@tostadorespro.test", "Antioquia", "Medellín", "Cra 50 # 30-88"],
];
for (const [kind, filas] of [["CLIENT", CLIENTES], ["SUPPLIER", PROVEEDORES]]) {
    for (const [i, [code, name, phone, email, department, city, address]] of filas.entries()) {
        await db.financeContact.create({
            data: {
                userId,
                kind,
                code,
                name,
                phone,
                email,
                department,
                city,
                address,
                createdAt: new Date(Date.UTC(2026, 0, 2, 12, i)),
            },
        });
    }
}

// ── Los movimientos del año ───────────────────────────────────────────────
const dia = (mes, d) => new Date(Date.UTC(2026, mes - 1, d));

/** [mes, día, concepto, categoría, cuenta, valor, extra, descuento, cliente] */
const VENTAS = [];
/** [mes, día, concepto, categoría, cuenta, valor, proveedor] */
const GASTOS = [];

// Enero a agosto: la base de cada mes, con su ritmo. Junio lleva la compra del
// tostador nuevo y sale en rojo.
const BASE = [
    [1, 9_800_000], [2, 10_400_000], [3, 11_200_000], [4, 10_900_000],
    [5, 12_300_000], [6, 11_800_000], [7, 13_100_000], [8, 13_600_000],
];
for (const [mes, total] of BASE) {
    VENTAS.push(
        [mes, 3, "Ventas de la tienda — semana 1", "Ventas", "Caja principal", Math.round(total * 0.24), 0, 0, null],
        [mes, 5, "Suscripción mensual — Hotel Andino", "Suscripciones", "Bancolombia", 1_800_000, 0, 0, "Hotel Andino"],
        [mes, 11, "Ventas de la tienda — semana 2", "Ventas", "Caja principal", Math.round(total * 0.2), 0, 0, null],
        [mes, 16, "Catering evento — Oficinas Nube", "Servicios", "Bancolombia", 2_200_000, 150_000, 0, "Oficinas Nube"],
        [mes, 19, "Ventas de la tienda — semana 3", "Ventas", "Caja principal", Math.round(total * 0.18), 0, 0, null],
        [mes, 26, "Pedido Restaurante Fogón", "Ventas", "Nequi", 950_000, 0, 50_000, "Restaurante Fogón"],
    );
    GASTOS.push(
        [mes, 1, "Arriendo del local", "Arriendo", "Bancolombia", 2_500_000, "Inmobiliaria Centro"],
        [mes, 6, "Café verde — Finca La Esperanza", "Insumos", "Bancolombia", 2_900_000, "Finca La Esperanza"],
        [mes, 15, "Bolsas y etiquetas", "Insumos", "Caja principal", 640_000, "Empaques del Valle"],
        [mes, 30 > 28 && mes === 2 ? 27 : 28, "Nómina del mes", "Salarios", "Bancolombia", 3_400_000, null],
        [mes, 20, "Pauta en redes sociales", "Marketing", "Nequi", 420_000, null],
    );
}
GASTOS.push([6, 12, "Tostador nuevo — Tostadores Pro", "Herramientas", "Bancolombia", 14_500_000, "Tostadores Pro"]);

// Septiembre, el mes que se mira al abrir: movimiento casi a diario, para que
// la gráfica del mes tenga forma.
const SEPTIEMBRE_VENTAS = [
    [1, 410_000], [2, 380_000], [3, 455_000], [4, 520_000], [5, 610_000], [7, 390_000], [8, 430_000],
    [9, 470_000], [10, 505_000], [11, 560_000], [12, 640_000], [14, 400_000], [15, 445_000], [16, 480_000],
    [17, 515_000], [18, 590_000], [19, 660_000], [21, 420_000], [22, 455_000], [23, 490_000], [24, 530_000],
    [25, 605_000], [26, 690_000], [28, 440_000], [29, 470_000],
];
for (const [d, valor] of SEPTIEMBRE_VENTAS) VENTAS.push([9, d, "Ventas de la tienda del día", "Ventas", "Caja principal", valor, 0, 0, null]);
VENTAS.push(
    [9, 5, "Suscripción mensual — Hotel Andino", "Suscripciones", "Bancolombia", 1_800_000, 0, 0, "Hotel Andino"],
    [9, 16, "Catering evento — Oficinas Nube", "Servicios", "Bancolombia", 2_200_000, 150_000, 0, "Oficinas Nube"],
    [9, 22, "Kit barista — Laura Gómez", "Ventas", "Nequi", 380_000, 0, 30_000, "Laura Gómez"],
    [9, 27, "Pedido Restaurante Fogón", "Ventas", "Nequi", 950_000, 0, 50_000, "Restaurante Fogón"],
    [9, 29, "Taller de métodos de filtrado", "Servicios", "Bancolombia", 600_000, 0, 0, "Andrés Rincón"],
);
GASTOS.push(
    [9, 1, "Arriendo del local", "Arriendo", "Bancolombia", 2_500_000, "Inmobiliaria Centro"],
    [9, 6, "Café verde — Finca La Esperanza", "Insumos", "Bancolombia", 2_900_000, "Finca La Esperanza"],
    [9, 13, "Bolsas y etiquetas", "Insumos", "Caja principal", 640_000, "Empaques del Valle"],
    [9, 20, "Pauta en redes sociales", "Marketing", "Nequi", 420_000, null],
    [9, 24, "Mantenimiento del tostador", "Herramientas", "Caja principal", 380_000, "Tostadores Pro"],
    [9, 28, "Nómina del mes", "Salarios", "Bancolombia", 3_400_000, null],
);

let creados = 0;
for (const [mes, d, title, cat, cta, amount, extra, discount, cliente] of VENTAS) {
    await db.financeTransaction.create({
        data: {
            userId,
            type: "SALE",
            occurredAt: dia(mes, d),
            amount,
            extra,
            discount,
            currencyCode: "COP",
            accountId: cuenta[cta],
            categoryId: categoria[`SALE:${cat}`],
            title,
            counterparty: cliente,
            createdAt: new Date(dia(mes, d).getTime() + 12 * 3_600_000),
        },
    });
    creados += 1;
}
for (const [mes, d, title, cat, cta, amount, proveedor] of GASTOS) {
    await db.financeTransaction.create({
        data: {
            userId,
            type: "EXPENSE",
            occurredAt: dia(mes, d),
            amount,
            currencyCode: "COP",
            accountId: cuenta[cta],
            categoryId: categoria[`EXPENSE:${cat}`],
            title,
            counterparty: proveedor,
            createdAt: new Date(dia(mes, d).getTime() + 13 * 3_600_000),
        },
    });
    creados += 1;
}

// La venta con su soporte: una factura en PDF, que la columna Soportes pinta
// con su icono y el detalle ofrece para abrir.
const conSoporte = await db.financeTransaction.findFirst({
    where: { userId, type: "SALE", title: "Catering evento — Oficinas Nube", occurredAt: dia(9, 16) },
});
if (conSoporte) {
    await db.financeAttachment.create({
        data: {
            userId,
            transactionId: conSoporte.id,
            url: "https://imagenes.guia.test/factura-0916.pdf",
            fileName: "factura-0916.pdf",
            mimeType: "application/pdf",
            sizeBytes: 84_000,
        },
    });
}

console.log(
    JSON.stringify({
        movimientos: creados,
        cuentas: CUENTAS.length,
        clientes: CLIENTES.length,
        proveedores: PROVEEDORES.length,
        modulos: MENU_DE_UN_CLIENTE.length,
    }),
);
await db.$disconnect();
