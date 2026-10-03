/**
 * Compras de Finanzas contra Postgres y por las ACCIONES de verdad.
 *
 * Una cuenta con sus proveedores (uno borrado), un cliente, y otra cuenta con
 * su propio proveedor. Se comprueba lo que el formulario «Nueva compra»
 * promete:
 *  - una compra se guarda como un gasto con el nombre del proveedor
 *    (`counterparty`) y su referencia (`proveedor:<id>`), y lo pone el
 *    SERVIDOR, no lo que mande el navegador;
 *  - un proveedor de otra cuenta, un cliente o un proveedor borrado no se
 *    aceptan, y no se crea nada;
 *  - un gasto normal sigue siendo un gasto, sin proveedor;
 *  - editar cambia de proveedor con la misma comprobación, y editar una compra
 *    cuyo proveedor se borró después sigue funcionando si no se toca;
 *  - lo que llegue de más en una edición no toca la identidad de la fila;
 *  - el proveedor que se crea desde el formulario sale en la lista de
 *    Proveedores, con su código.
 *
 * `MODO=roto` corre las acciones de `ANTES_REF` y AFIRMA los fallos: una compra
 * no guardaba proveedor, y una edición podía mover el gasto a otra cuenta.
 * Se levanta con `scripts/banco-compras-de-finanzas.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";

const ROTO = process.env.MODO === "roto";
const mod = ROTO
    ? await import("./.compilado/compras-de-finanzas/entrada-de-compras-antes.js")
    : await import("./.compilado/compras-de-finanzas/entrada-de-compras.js");
const { ponerAQuienMira, db, getFinanceContacts, createFinanceContact } = mod;
const a = ROTO ? mod.antes : mod;

const V = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const CUENTA = `cf-cuenta-${V}`;
const OTRA = `cf-otra-${V}`;

const quien = {
    id: CUENTA,
    effectiveId: CUENTA,
    sessionUserId: CUENTA,
    ownerId: null,
    advisorRole: null,
    role: "user",
    rolDeLaPersona: "user",
    email: `${CUENTA}@banco.test`,
    name: "Café de la Montaña",
};

let cuentaDeDinero;
const P = {};

async function contacto(userId, kind, name, extra = {}) {
    const c = await db.financeContact.create({ data: { userId, kind, name, ...extra } });
    return c.id;
}

test.before(async () => {
    for (const [id, email] of [[CUENTA, `${CUENTA}@banco.test`], [OTRA, `${OTRA}@banco.test`]]) {
        await db.user.create({ data: { id, email, name: id, role: "user", status: true } });
    }
    ponerAQuienMira(quien);
    await db.financeCurrency.upsert({ where: { code: "COP" }, update: {}, create: { code: "COP", name: "Peso Colombiano", symbol: "COP$", decimals: 2 } });
    cuentaDeDinero = (await db.financeAccount.create({ data: { userId: CUENTA, name: "Empresa", type: "COMPANY", isDefault: true } })).id;
    P.finca = await contacto(CUENTA, "SUPPLIER", "Finca La Esperanza", { code: "P-1" });
    P.empaques = await contacto(CUENTA, "SUPPLIER", "Empaques del Valle", { code: "P-2" });
    P.borrado = await contacto(CUENTA, "SUPPLIER", "Proveedor Viejo", { code: "P-3", status: "DELETED" });
    P.cliente = await contacto(CUENTA, "CLIENT", "Hotel Andino", { code: "C-1" });
    P.ajeno = await contacto(OTRA, "SUPPLIER", "Proveedor De Otra Cuenta", { code: "P-1" });
});

test.after(async () => {
    await db.financeTransaction.deleteMany({ where: { userId: { in: [CUENTA, OTRA] } } });
    await db.financeContact.deleteMany({ where: { userId: { in: [CUENTA, OTRA] } } });
    await db.financeCategory.deleteMany({ where: { userId: { in: [CUENTA, OTRA] } } });
    await db.financeAccount.deleteMany({ where: { userId: { in: [CUENTA, OTRA] } } });
    await db.user.deleteMany({ where: { id: { in: [CUENTA, OTRA] } } });
    await db.$disconnect();
});

function gasto(extra = {}) {
    return {
        userId: CUENTA,
        occurredAt: new Date("2026-10-02T15:00:00Z"),
        amount: 250000,
        currencyCode: "COP",
        accountId: cuentaDeDinero,
        categoryId: null,
        title: "Café verde",
        description: null,
        ...extra,
    };
}

const cuantos = () => db.financeTransaction.count({ where: { userId: CUENTA } });
const ultimo = () => db.financeTransaction.findFirst({ where: { userId: CUENTA }, orderBy: { createdAt: "desc" } });

if (ROTO) {
    test("ANTES una compra no guardaba a quién se le compró", async () => {
        const r = await a.createExpense(gasto({ proveedorId: P.finca }));
        assert.equal(r.success, true, r.message);
        const fila = await db.financeTransaction.findUnique({ where: { id: r.data.id } });
        assert.equal(fila.counterparty, null, "ANTES ya guardaba el proveedor de una compra");
        assert.equal(fila.reference, null);
        assert.equal(r.message, "Gasto creado correctamente.");
    });

    test("ANTES una edición podía mover el gasto a OTRA cuenta", async () => {
        const r = await a.createExpense(gasto({ title: "Para mover" }));
        assert.equal(r.success, true, r.message);
        const res = await a.updateExpense(r.data.id, CUENTA, { userId: OTRA });
        assert.equal(res.success, true, res.message);
        const fila = await db.financeTransaction.findUnique({ where: { id: r.data.id } });
        assert.equal(fila.userId, OTRA, "ANTES ya no dejaba mover la fila de cuenta");
    });
} else {
    test("la lista de Proveedores del formulario: solo los activos de la cuenta", async () => {
        const res = await getFinanceContacts(CUENTA, "SUPPLIER");
        assert.equal(res.success, true, res.message);
        const nombres = res.data.map((c) => c.name).sort();
        assert.deepEqual(nombres, ["Empaques del Valle", "Finca La Esperanza"]);
    });

    test("una compra guarda el proveedor, y lo pone el servidor", async () => {
        const r = await a.createExpense(gasto({ proveedorId: P.finca, counterparty: "Inventado por el navegador" }));
        assert.equal(r.success, true, r.message);
        assert.equal(r.message, "Compra creada correctamente.");
        const fila = await db.financeTransaction.findUnique({ where: { id: r.data.id } });
        assert.equal(fila.type, "EXPENSE", "una compra sigue siendo un gasto");
        assert.equal(fila.counterparty, "Finca La Esperanza");
        assert.equal(fila.reference, `proveedor:${P.finca}`);
        assert.equal(fila.title, "Café verde");
    });

    for (const [cual, id] of [
        ["de OTRA cuenta", () => P.ajeno],
        ["que es un CLIENTE", () => P.cliente],
        ["BORRADO", () => P.borrado],
        ["que no existe", () => "no-existe"],
    ]) {
        test(`un proveedor ${cual} no se acepta, y no se crea nada`, async () => {
            const antes = await cuantos();
            const r = await a.createExpense(gasto({ proveedorId: id() }));
            assert.equal(r.success, false);
            assert.match(r.message, /no está en tu lista de proveedores/);
            assert.equal(await cuantos(), antes);
        });
    }

    test("un gasto normal sigue siendo un gasto, sin proveedor", async () => {
        const r = await a.createExpense(gasto({ title: "Publicidad" }));
        assert.equal(r.success, true, r.message);
        assert.equal(r.message, "Gasto creado correctamente.");
        const fila = await db.financeTransaction.findUnique({ where: { id: r.data.id } });
        assert.equal(fila.counterparty, null);
        assert.equal(fila.reference, null);
    });

    test("editar cambia de proveedor con la misma comprobación", async () => {
        const r = await a.createExpense(gasto({ proveedorId: P.finca }));
        const id = r.data.id;
        const bien = await a.updateExpense(id, CUENTA, { proveedorId: P.empaques });
        assert.equal(bien.success, true, bien.message);
        let fila = await db.financeTransaction.findUnique({ where: { id } });
        assert.equal(fila.counterparty, "Empaques del Valle");
        assert.equal(fila.reference, `proveedor:${P.empaques}`);

        const mal = await a.updateExpense(id, CUENTA, { proveedorId: P.ajeno, amount: 1 });
        assert.equal(mal.success, false);
        fila = await db.financeTransaction.findUnique({ where: { id } });
        assert.equal(fila.counterparty, "Empaques del Valle", "un proveedor ajeno no puede pisar el de la compra");
        assert.equal(Number(fila.amount), 250000, "una edición rechazada no toca nada");
    });

    test("una compra cuyo proveedor se borró después se puede seguir corrigiendo", async () => {
        const temporal = await contacto(CUENTA, "SUPPLIER", "Se Va A Borrar", { code: "P-9" });
        const r = await a.createExpense(gasto({ proveedorId: temporal }));
        await db.financeContact.update({ where: { id: temporal }, data: { status: "DELETED" } });
        // El formulario no manda el proveedor si no cambió (`elProveedorQueSeManda`).
        const res = await a.updateExpense(r.data.id, CUENTA, { amount: 99000 });
        assert.equal(res.success, true, res.message);
        const fila = await db.financeTransaction.findUnique({ where: { id: r.data.id } });
        assert.equal(Number(fila.amount), 99000);
        assert.equal(fila.counterparty, "Se Va A Borrar", "el proveedor que tenía se conserva");
    });

    test("lo que llega de más en una edición no toca la identidad de la fila", async () => {
        const r = await a.createExpense(gasto({ title: "No se mueve" }));
        const res = await a.updateExpense(r.data.id, CUENTA, { userId: OTRA, type: "SALE", status: "DELETED", title: "Sigue aquí" });
        assert.equal(res.success, true, res.message);
        const fila = await db.financeTransaction.findUnique({ where: { id: r.data.id } });
        assert.equal(fila.userId, CUENTA);
        assert.equal(fila.type, "EXPENSE");
        assert.notEqual(fila.status, "DELETED");
        assert.equal(fila.title, "Sigue aquí");
    });

    test("el proveedor creado desde el formulario sale en Proveedores, con su código", async () => {
        const res = await createFinanceContact("SUPPLIER", { userId: CUENTA, values: { name: "Tostadores Pro" } });
        assert.equal(res.success, true, res.message);
        assert.equal(res.data.kind, "SUPPLIER");
        assert.match(res.data.code ?? "", /^P-\d+$/);
        const lista = await getFinanceContacts(CUENTA, "SUPPLIER");
        assert.ok(lista.data.some((c) => c.id === res.data.id));
        const compra = await a.createExpense(gasto({ proveedorId: res.data.id }));
        assert.equal(compra.success, true, compra.message);
        assert.equal((await ultimo()).counterparty, "Tostadores Pro");
    });
}
