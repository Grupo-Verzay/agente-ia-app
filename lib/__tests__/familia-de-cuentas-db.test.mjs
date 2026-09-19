/**
 * La familia de cuentas **contra Postgres de verdad**, con la malla REAL de
 * producción.
 *
 * Lo que se prueba aquí no se puede probar en memoria: que el recorrido del
 * componente **termina con ciclos dentro**, y que las cinco cuentas de la
 * misma familia calculan la MISMA raíz. La versión anterior subía un solo
 * nivel y se quedaba con la primera cuenta por `id ASC` —el orden alfabético
 * de un uuid—, y medido contra producción eso daba tres raíces distintas para
 * una sola familia, nadie era la madre, y Verzay | Ventas veía 3 de los 8
 * mensajes del General.
 *
 * Corre en **dos modos**, con la consulta vieja y con la nueva. La única
 * comprobación que cambia entre ellos es el fallo; todo el bloque de «esto no
 * se puede haber aflojado» pasa igual en los dos, y eso es lo que prueba que no
 * se abrió nada de paso.
 *
 * Cómo se corre (la base es de usar y tirar):
 *
 *     initdb -D /tmp/pgfam -U postgres -A trust
 *     pg_ctl -D /tmp/pgfam -o '-p 5433 -k /tmp' start
 *     createdb -h /tmp -p 5433 -U postgres familia
 *     npx esbuild lib/familia-de-cuentas.ts --bundle --platform=node \
 *         --format=esm --outdir=lib/__tests__/.compilado/banco \
 *         --external:@prisma/client --external:server-only
 *     sed -i '/server-only/d' lib/__tests__/.compilado/banco/familia-de-cuentas.js
 *     DATABASE_URL='postgresql://postgres@127.0.0.1:5433/familia' \
 *         node --test lib/__tests__/familia-de-cuentas-db.test.mjs
 *     MODO=viejo DATABASE_URL=… node --test …      # el modo roto
 */
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

const compilado = path.join(path.dirname(fileURLToPath(import.meta.url)), ".compilado", "banco");
const { laFamiliaDeLaCuenta, esLaCuentaMadre } = await import(
    path.join(compilado, "familia-de-cuentas.js")
);
const { PrismaClient } = await import("@prisma/client");
const db = new PrismaClient();

// Los ids REALES de producción, porque su orden alfabético es lo que decidía
// antes: los que empiezan por dígito van delante de los que empiezan por letra.
const CASA = "cm842kthc0000qd2l66nbnytv";
const ATENCION = "3c823f21-00d2-4c88-9f88-099495f97931";
const VENTAS = "cm84mjtp50000l6soenaosi2z";
const NOTIF = "f7740a22-4149-4a90-a51c-a460cde2a7c7";
const PRUEBAS = "cdfb7f70-735a-429b-9607-7d7e67600cc4";
const ASESORA = "e7646da2-bcfe-40ba-b954-2079bd8abd83"; // cuelga de la casa por owner_id
const FAMILIA = [CASA, ATENCION, VENTAS, NOTIF, PRUEBAS];
const NOMBRES = {
    [CASA]: "Carlos | Arcos",
    [ATENCION]: "Verzay | Atencion",
    [VENTAS]: "Verzay | Ventas",
    [NOTIF]: "Verzay | Notificaciones",
    [PRUEBAS]: "Verzay Pruebas",
};

/** Las diez filas de `linked_accounts` tal como están hoy en producción. */
const ENLACES = [
    [NOTIF, VENTAS], [VENTAS, CASA], [NOTIF, CASA], [VENTAS, ATENCION], [NOTIF, ATENCION],
    [CASA, ATENCION], [CASA, VENTAS], [CASA, NOTIF], [CASA, PRUEBAS], [ATENCION, VENTAS],
];

await db.$executeRawUnsafe(`DROP TABLE IF EXISTS "linked_accounts"`);
await db.$executeRawUnsafe(`DROP TABLE IF EXISTS "team_chat_messages"`);
await db.$executeRawUnsafe(`DROP TABLE IF EXISTS "User"`);
await db.$executeRawUnsafe(`CREATE TABLE "User" (id text PRIMARY KEY, company text, "owner_id" text)`);
await db.$executeRawUnsafe(`
  CREATE TABLE "linked_accounts" (
    id text PRIMARY KEY,
    "master_user_id" text NOT NULL,
    "linked_user_id" text NOT NULL,
    UNIQUE ("master_user_id", "linked_user_id"))`);
await db.$executeRawUnsafe(
    `CREATE TABLE "team_chat_messages" (id serial PRIMARY KEY, "cuentaId" text, "canalId" text)`);

for (const id of FAMILIA) {
    await db.$executeRawUnsafe(`INSERT INTO "User" (id, company) VALUES ($1,$2)`, id, NOMBRES[id]);
}
// Una PERSONA del equipo: cuelga de la casa por `owner_id` y no es una cuenta.
await db.$executeRawUnsafe(
    `INSERT INTO "User" (id, company, "owner_id") VALUES ($1,$2,$3)`, ASESORA, "Maria Alejandra", CASA);
// Y una cuenta de otra familia, para que no se cuele por ningún lado.
await db.$executeRawUnsafe(`INSERT INTO "User" (id, company) VALUES ('ajena','Cuenta Ajena')`);

let n = 0;
for (const [m, l] of ENLACES) {
    await db.$executeRawUnsafe(
        `INSERT INTO "linked_accounts" (id,"master_user_id","linked_user_id") VALUES ($1,$2,$3)`,
        `e${n++}`, m, l);
}

// Los 8 mensajes del General, repartidos como están hoy en producción.
for (const [cuenta, cuantos] of [[CASA, 5], [ATENCION, 2], [VENTAS, 1]]) {
    for (let i = 0; i < cuantos; i++) {
        await db.$executeRawUnsafe(
            `INSERT INTO "team_chat_messages" ("cuentaId","canalId") VALUES ($1, NULL)`, cuenta);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Los dos modos
// ─────────────────────────────────────────────────────────────────────────────

const MODO_ROTO = process.env.MODO === "viejo";

/** La resolución VIEJA, literal: un nivel arriba y un nivel abajo. */
async function familiaVieja(id) {
    const arriba = await db.$queryRawUnsafe(
        `SELECT la."master_user_id" AS id FROM "linked_accounts" la WHERE la."linked_user_id" = $1
         UNION
         SELECT u."owner_id" AS id FROM "User" u WHERE u.id = $1 AND u."owner_id" IS NOT NULL
         ORDER BY id ASC`, id);
    const raiz = arriba[0]?.id?.trim() || id;
    const abajo = await db.$queryRawUnsafe(
        `SELECT la."linked_user_id" AS id FROM "linked_accounts" la WHERE la."master_user_id" = $1`, raiz);
    const cuentas = new Set([raiz, id]);
    for (const f of abajo) cuentas.add(f.id);
    return { raiz, cuentas: [...cuentas] };
}

const familia = MODO_ROTO ? familiaVieja : laFamiliaDeLaCuenta;
const esLaMadre = (fam, id) => (MODO_ROTO ? fam.raiz === id : esLaCuentaMadre(fam, id));

/** Las tres condiciones del selector de Finanzas, tal cual. */
const seEnsenaElSelector = (a) => a.mandaEnSuCuenta && a.esLaMadre && a.cuantasCuentas > 1;

// ─────────────────────────────────────────────────────────────────────────────
// LO QUE CAMBIA ENTRE LOS DOS MODOS: el fallo reportado
// ─────────────────────────────────────────────────────────────────────────────

test("el selector de Finanzas se le pinta a la casa", async () => {
    const fam = await familia(CASA);
    const visto = seEnsenaElSelector({
        mandaEnSuCuenta: true,
        esLaMadre: esLaMadre(fam, CASA),
        cuantasCuentas: fam.cuentas.length,
    });

    if (MODO_ROTO) {
        // El fallo, reproducido: la madre colgaba de su propia hija.
        assert.equal(fam.raiz, VENTAS);
        assert.equal(fam.cuentas.length, 3);
        assert.equal(visto, false);
        return;
    }

    assert.equal(fam.raiz, CASA);
    assert.equal(fam.cuentas.length, 5);
    assert.equal(visto, true);
});

test("y NO se le pinta a ninguna de las cuatro hijas", async () => {
    for (const hija of [ATENCION, VENTAS, NOTIF, PRUEBAS]) {
        const fam = await familia(hija);
        const visto = seEnsenaElSelector({
            mandaEnSuCuenta: true,
            esLaMadre: esLaMadre(fam, hija),
            cuantasCuentas: fam.cuentas.length,
        });
        assert.equal(visto, false, `${NOMBRES[hija]} no puede ver el selector`);
    }
});

test("las cinco calculan la MISMA raíz, y hay exactamente UNA madre", async () => {
    const raices = new Set();
    let madres = 0;
    for (const c of FAMILIA) {
        const fam = await familia(c);
        raices.add(fam.raiz);
        if (esLaMadre(fam, c)) madres++;
    }

    if (MODO_ROTO) {
        assert.ok(raices.size > 1, "la versión vieja daba varias raíces para una familia");
        assert.equal(madres, 0, "y ninguna se reconocía como madre");
        return;
    }

    assert.deepEqual([...raices], [CASA]);
    assert.equal(madres, 1);
});

test("el General no está partido: las cinco ven los 8 mensajes", async () => {
    const vistos = {};
    for (const c of FAMILIA) {
        const fam = await familia(c);
        const r = await db.$queryRawUnsafe(
            `SELECT count(*)::int AS n FROM "team_chat_messages"
             WHERE ("canalId" IS NULL OR "canalId" = 'general') AND "cuentaId" = ANY($1::text[])`,
            fam.cuentas);
        vistos[NOMBRES[c]] = r[0].n;
    }

    if (MODO_ROTO) {
        // Medido igual en producción antes de tocar nada.
        assert.equal(vistos["Verzay | Ventas"], 3);
        return;
    }
    for (const [quien, cuantos] of Object.entries(vistos)) {
        assert.equal(cuantos, 8, `${quien} ve ${cuantos} de 8`);
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// LO QUE NO PUEDE HABERSE AFLOJADO: pasa igual en los DOS modos
// ─────────────────────────────────────────────────────────────────────────────

test("una cuenta ajena a la familia no entra, y no la ve nadie", async () => {
    const fam = await familia(CASA);
    assert.equal(fam.cuentas.includes("ajena"), false);

    const suya = await familia("ajena");
    assert.deepEqual(suya.cuentas, ["ajena"]);
    assert.equal(suya.raiz, "ajena");
});

test("una PERSONA del equipo no es una cuenta de la familia", async () => {
    // `owner_id` sube, pero no baja: por ahí cuelgan asesores, y meterlos en la
    // familia los ofrecería en el selector de Finanzas como si fueran cuentas.
    const fam = await familia(CASA);
    assert.equal(fam.cuentas.includes(ASESORA), false);
});

test("preguntando desde una PERSONA se sube a su cuenta", async () => {
    const fam = await familia(ASESORA);
    assert.ok(fam.cuentas.includes(CASA), "la cuenta de la asesora tiene que estar");
    assert.notEqual(fam.raiz, ASESORA, "una persona no puede ser la raíz de nada");
});

test("una cuenta sola es su propia familia y su propia raíz", async () => {
    await db.$executeRawUnsafe(
        `INSERT INTO "User" (id, company) VALUES ('sola','Sola') ON CONFLICT DO NOTHING`);
    const fam = await familia("sola");
    assert.deepEqual(fam.cuentas, ["sola"]);
    assert.equal(fam.raiz, "sola");
});

// ─────────────────────────────────────────────────────────────────────────────
// Y lo que SOLO se puede comprobar contra la base
// ─────────────────────────────────────────────────────────────────────────────

test("un CICLO no cuelga la consulta", async (t) => {
    if (MODO_ROTO) return t.skip("la versión vieja no recorre nada");

    // A -> B -> C -> A, más un recíproco dentro. Si el `UNION` del recursivo no
    // dedujera contra lo acumulado, esto no terminaría nunca.
    await db.$executeRawUnsafe(
        `INSERT INTO "User" (id, company) VALUES ('ca','A'),('cb','B'),('cc','C') ON CONFLICT DO NOTHING`);
    await db.$executeRawUnsafe(`
      INSERT INTO "linked_accounts" (id,"master_user_id","linked_user_id")
      VALUES ('z1','ca','cb'),('z2','cb','cc'),('z3','cc','ca'),('z4','cb','ca')
      ON CONFLICT DO NOTHING`);

    const fam = await familia("ca");
    assert.deepEqual([...fam.cuentas].sort(), ["ca", "cb", "cc"]);
    // ca tiene 1 saliente, cb tiene 2, cc tiene 1 -> manda cb.
    assert.equal(fam.raiz, "cb");
    for (const c of ["ca", "cb", "cc"]) assert.equal((await familia(c)).raiz, "cb");
});

test("una CADENA larga se recorre entera, no un solo nivel", async (t) => {
    if (MODO_ROTO) return t.skip("la versión vieja recorre un solo nivel, que es por lo que existe esto");

    const ids = Array.from({ length: 12 }, (_, i) => `n${String(i).padStart(2, "0")}`);
    for (const id of ids) {
        await db.$executeRawUnsafe(
            `INSERT INTO "User" (id, company) VALUES ($1,$1) ON CONFLICT DO NOTHING`, id);
    }
    for (let i = 0; i < ids.length - 1; i++) {
        await db.$executeRawUnsafe(
            `INSERT INTO "linked_accounts" (id,"master_user_id","linked_user_id") VALUES ($1,$2,$3)
             ON CONFLICT DO NOTHING`, `c${i}`, ids[i], ids[i + 1]);
    }

    // Desde la ÚLTIMA de la cadena se llega a las doce.
    const fam = await familia(ids[ids.length - 1]);
    assert.equal(fam.cuentas.length, 12);
    // Todos tienen 1 saliente menos el último, así que empatan y gana el id menor.
    assert.equal(fam.raiz, ids[0]);
});

test.after(async () => {
    await db.$disconnect();
});
