/**
 * El alcance de las cuatro listas de Finanzas —Ventas, Gastos, Clientes y
 * Proveedores— **contra Postgres de verdad**.
 *
 * Lo que se prueba aquí no se puede probar en memoria: quién alcanza a quién
 * sale de `linked_accounts`, que en producción **no es un árbol sino una malla
 * con ciclos**, y de `esLaCuentaMadre`, que es lo que hace cierta la frase «los
 * enlaces solo van de madre a hija». Con la malla sembrada dentro:
 *
 *   - la **hija** ve lo suyo y nada más, toque o no toque el parámetro;
 *   - la **madre** consolida, y solo lo que es de su familia;
 *   - un id de **fuera** escrito a mano en la URL se cae aquí, no en la
 *     pantalla — esconder el selector no cierra la petición directa;
 *   - y con **monedas distintas** no sale ningún total.
 *
 * Corre en **dos modos**. En `MODO=viejo` la consulta de la lista va con el
 * `where: { userId }` de antes —o sea, sin consolidar— y se afirma que la
 * madre ve **solo lo suyo**: sin ese modo no se sabría si lo verde de al lado
 * es que la consolidación funciona o que el caso no llega a ejercerla.
 *
 * Cómo se corre (la base es de usar y tirar):
 *
 *     initdb -D /tmp/pgfin -U postgres -A trust
 *     pg_ctl -D /tmp/pgfin -o '-p 55434 -k /tmp/pgfin' start
 *     createdb -h /tmp/pgfin -p 55434 -U postgres banco
 *     npx esbuild lib/__tests__/fingido/entrada-de-finanzas.ts --bundle \
 *         --platform=node --format=esm --outdir=lib/__tests__/.compilado/finanzas \
 *         --external:@prisma/client --external:server-only \
 *         --alias:@/lib/auth=./lib/__tests__/fingido/auth-de-finanzas.ts
 *     sed -i '/server-only/d' lib/__tests__/.compilado/finanzas/entrada-de-finanzas.js
 *     DATABASE_URL='postgresql://postgres@localhost:55434/banco?host=/tmp/pgfin' \
 *         node --test lib/__tests__/cuentas-de-finanzas-db.test.mjs
 *     MODO=viejo DATABASE_URL=… node --test …      # el modo sin consolidar
 */
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

const aqui = path.dirname(fileURLToPath(import.meta.url));
const { resolverLasCuentasDeFinanzas, lasCuentasQueSeConsultan, ponerAQuienMira } = await import(
    path.join(aqui, ".compilado", "finanzas", "entrada-de-finanzas.js")
);

const { PrismaClient } = await import("@prisma/client");
const db = new PrismaClient();

const VIEJO = process.env.MODO === "viejo";

// La familia: una madre que vinculó a dos hijas, y las hijas que la vincularon
// de vuelta —que es como está la tabla en producción, recíproca—.
const MADRE = "madre";
const ATENCION = "atencion";
const VENTAS = "ventas";
const FUERA = "de-otra-empresa";

const ENLACES = [
    [MADRE, ATENCION],
    [MADRE, VENTAS],
    [ATENCION, MADRE],
    [VENTAS, MADRE],
];

await db.$executeRawUnsafe(`DROP TABLE IF EXISTS "finance_transactions"`);
await db.$executeRawUnsafe(`DROP TABLE IF EXISTS "linked_accounts"`);
await db.$executeRawUnsafe(`DROP TABLE IF EXISTS "User"`);
await db.$executeRawUnsafe(`
    CREATE TABLE "User" (
        id text PRIMARY KEY,
        name text,
        company text,
        email text,
        "preferredCurrencyCode" text,
        "owner_id" text
    )`);
await db.$executeRawUnsafe(`
    CREATE TABLE "linked_accounts" (
        id text PRIMARY KEY,
        "master_user_id" text NOT NULL,
        "linked_user_id" text NOT NULL
    )`);
await db.$executeRawUnsafe(`
    CREATE TABLE "finance_transactions" (
        id text PRIMARY KEY,
        "userId" text NOT NULL,
        type text NOT NULL,
        status text NOT NULL,
        "occurredAt" timestamptz NOT NULL,
        amount numeric(18,2) NOT NULL,
        "currencyCode" text NOT NULL,
        "accountId" text NOT NULL,
        title text,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "deletedAt" timestamptz
    )`);

const cuentas = [
    { id: MADRE, company: "Grupo Verzay", moneda: "COP" },
    { id: ATENCION, company: "Verzay | Atencion", moneda: "COP" },
    { id: VENTAS, company: "Verzay | Ventas", moneda: "COP" },
    { id: FUERA, company: "Otra Empresa", moneda: "COP" },
];
for (const c of cuentas) {
    await db.$executeRawUnsafe(
        `INSERT INTO "User" (id, name, company, email, "preferredCurrencyCode") VALUES ($1,$2,$3,$4,$5)`,
        c.id, c.company, c.company, `${c.id}@ejemplo.com`, c.moneda,
    );
}
for (const [de, a] of ENLACES) {
    await db.$executeRawUnsafe(
        `INSERT INTO "linked_accounts" (id,"master_user_id","linked_user_id") VALUES ($1,$2,$3)`,
        `${de}->${a}`, de, a,
    );
}

/** Dos ventas por cuenta, para que «cuántas ve» sea un número que distingue. */
let n = 0;
async function sembrarVenta(userId, moneda = "COP") {
    n += 1;
    await db.$executeRawUnsafe(
        `INSERT INTO "finance_transactions"
           (id,"userId",type,status,"occurredAt",amount,"currencyCode","accountId",title)
         VALUES ($1,$2,'SALE','ACTIVE',now(),$3,$4,'cta',$5)`,
        `tx${n}`, userId, 100 + n, moneda, `venta ${n} de ${userId}`,
    );
}
for (const id of [MADRE, ATENCION, VENTAS, FUERA]) {
    await sembrarVenta(id);
    await sembrarVenta(id);
}

/**
 * La consulta de la lista, con la MISMA forma que `getAllSales`: lo único que
 * cambia entre los dos modos es si acota por una cuenta o por las elegidas.
 */
async function lasVentasQueSeVen(propia, cuentasPedidas) {
    const elegidas = VIEJO ? [propia] : await lasCuentasQueSeConsultan(propia, cuentasPedidas);
    const filas = await db.$queryRawUnsafe(
        `SELECT "userId" FROM "finance_transactions"
          WHERE "userId" = ANY($1) AND "deletedAt" IS NULL AND type = 'SALE'`,
        elegidas,
    );
    return { elegidas, dueños: [...new Set(filas.map((f) => f.userId))].sort(), cuantas: filas.length };
}

// ── La hija ─────────────────────────────────────────────────────────────────

test("una HIJA ve lo suyo y nada más, aunque pida a su madre y a su hermana", async () => {
    ponerAQuienMira({ id: ATENCION, role: "user" });

    const sinPedir = await lasVentasQueSeVen(ATENCION, null);
    assert.deepEqual(sinPedir.dueños, [ATENCION]);
    assert.equal(sinPedir.cuantas, 2);

    // Y esto es lo que hace cierta la frase «de madre a hija»: la hija escribe
    // a mano el parámetro con toda su familia dentro y no alcanza nada nuevo.
    const pidiendoTodo = await lasVentasQueSeVen(ATENCION, [MADRE, ATENCION, VENTAS]);
    assert.deepEqual(pidiendoTodo.elegidas, [ATENCION]);
    assert.deepEqual(pidiendoTodo.dueños, [ATENCION]);
});

test("a una hija no se le pinta selector: no hay nada que elegir", async () => {
    ponerAQuienMira({ id: VENTAS, role: "user" });
    const res = await resolverLasCuentasDeFinanzas(VENTAS, null);
    assert.equal(res.puedeElegir, false);
    assert.deepEqual(res.disponibles, []);
    assert.deepEqual(res.elegidas, [VENTAS]);
});

// ── La madre ────────────────────────────────────────────────────────────────

test("la MADRE ve su familia en el selector, con la propia primero", async () => {
    ponerAQuienMira({ id: MADRE, role: "user" });
    const res = await resolverLasCuentasDeFinanzas(MADRE, null);

    assert.equal(res.puedeElegir, true);
    assert.equal(res.disponibles[0].id, MADRE, "la propia va primero");
    assert.deepEqual(res.disponibles.map((c) => c.id).sort(), [ATENCION, MADRE, VENTAS].sort());
    // Sin tocar el selector se consulta SOLO la suya, como antes de esto.
    assert.deepEqual(res.elegidas, [MADRE]);
});

test("la madre CONSOLIDA lo que elige, y solo eso", async () => {
    ponerAQuienMira({ id: MADRE, role: "user" });

    const sola = await lasVentasQueSeVen(MADRE, null);
    assert.deepEqual(sola.dueños, [MADRE]);
    assert.equal(sola.cuantas, 2);

    const dos = await lasVentasQueSeVen(MADRE, [MADRE, VENTAS]);
    if (VIEJO) {
        // El modo roto: la consulta iba con `where: { userId }` a secas, así
        // que elegir en el selector no cambiaba nada de lo que se veía.
        assert.deepEqual(dos.dueños, [MADRE]);
        assert.equal(dos.cuantas, 2);
    } else {
        assert.deepEqual(dos.dueños, [MADRE, VENTAS].sort());
        assert.equal(dos.cuantas, 4);
    }

    const todas = await lasVentasQueSeVen(MADRE, [MADRE, ATENCION, VENTAS]);
    assert.equal(todas.cuantas, VIEJO ? 2 : 6);
});

test("un id de FUERA en la URL se cae, y no arrastra a los buenos", async () => {
    ponerAQuienMira({ id: MADRE, role: "user" });

    const soloAjena = await lasVentasQueSeVen(MADRE, [FUERA]);
    assert.deepEqual(soloAjena.dueños, [MADRE], "se cae a la propia");

    const mezclada = await lasVentasQueSeVen(MADRE, [MADRE, FUERA, VENTAS]);
    assert.ok(!mezclada.elegidas.includes(FUERA), "la ajena no entra");
    assert.ok(!mezclada.dueños.includes(FUERA), "y ninguna de sus filas sale");
    if (!VIEJO) assert.deepEqual(mezclada.dueños, [MADRE, VENTAS].sort());
});

// ── El agente, y el fallo que no puede ser ruidoso ──────────────────────────

test("un AGENTE participa, no consolida", async () => {
    // Es la puerta de siempre, `canManageWorkspace`, y va antes de tocar la
    // base: sin permiso no hay ninguna consulta que hacer.
    ponerAQuienMira({ id: MADRE, role: "user", ownerId: MADRE, advisorRole: "agente" });
    const res = await resolverLasCuentasDeFinanzas(MADRE, [MADRE, VENTAS]);
    assert.equal(res.puedeElegir, false);
    assert.deepEqual(res.elegidas, [MADRE]);
});

test("sin sesión se contesta con la cuenta propia, nunca con la familia", async () => {
    ponerAQuienMira(null);
    const res = await resolverLasCuentasDeFinanzas(MADRE, [MADRE, VENTAS]);
    assert.deepEqual(res.elegidas, [MADRE]);
});

// ── El camino de siempre no paga nada ──────────────────────────────────────

test("sin parámetro no se hace NI UNA consulta: es la mayoría de las cargas", async () => {
    // Si esto dejara de ser cierto, toda cuenta hija y todo agente pagarían el
    // recorrido de la familia en cada carga de cada una de las cuatro listas.
    // Se prueba haciendo que preguntar quién mira REVIENTE: si alguien lo
    // pregunta, este caso se pone en rojo.
    ponerAQuienMira(() => {
        throw new Error("no se debería preguntar quién mira sin parámetro");
    });
    assert.deepEqual(await lasCuentasQueSeConsultan(MADRE, null), [MADRE]);
    assert.deepEqual(await lasCuentasQueSeConsultan(MADRE, []), [MADRE]);
    assert.deepEqual(await lasCuentasQueSeConsultan(MADRE, ""), [MADRE]);
});

// ── Las monedas ────────────────────────────────────────────────────────────

test("con MONEDAS DISTINTAS el selector las trae tal cual, cada una la suya", async () => {
    // La regla de «sin total» es pura y vive en `finanzas-de-la-familia`; lo
    // que se comprueba aquí es que el dato con el que decide sale de la base y
    // no de un valor por defecto: sin la moneda de verdad, dos cuentas en
    // monedas distintas parecerían compartirla y se sumarían.
    await db.$executeRawUnsafe(
        `UPDATE "User" SET "preferredCurrencyCode" = 'USD' WHERE id = $1`, VENTAS,
    );
    ponerAQuienMira({ id: MADRE, role: "user" });

    const res = await resolverLasCuentasDeFinanzas(MADRE, [MADRE, VENTAS]);
    const monedas = res.disponibles
        .filter((c) => res.elegidas.includes(c.id))
        .map((c) => c.moneda)
        .sort();
    assert.deepEqual(monedas, ["COP", "USD"]);

    await db.$executeRawUnsafe(
        `UPDATE "User" SET "preferredCurrencyCode" = 'COP' WHERE id = $1`, VENTAS,
    );
});

test.after(async () => {
    await db.$disconnect();
});
