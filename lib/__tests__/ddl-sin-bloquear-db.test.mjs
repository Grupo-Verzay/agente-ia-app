// El DDL "por proceso" no puede bloquear la base (caída del 2026-10-05).
// Una lectura larga tiene la tabla cogida; el arranque de un proceso vuelve a
// asegurar sus columnas. Las lecturas de los demás no pueden quedarse en cola.
import { test } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";

const URL = process.env.DATABASE_URL;
const ROTO = process.env.MODO === "roto";
// Un cliente de Prisma con UNA conexión: se comporta como una sesión suelta.
const nuevo = async () => {
  const p = new PrismaClient({ datasources: { db: { url: URL + "&connection_limit=1" } } });
  return { query: (sql) => p.$executeRawUnsafe(sql), filas: (sql) => p.$queryRawUnsafe(sql), end: () => p.$disconnect(), p };
};

// Una transacción que lee la tabla y la tiene cogida (AccessShareLock) hasta
// que se la suelta: es el SELECT largo de producción.
async function conLaTablaCogida(tabla, fn) {
  const larga = await nuevo();
  let soltar; const suelta = new Promise((r) => (soltar = r));
  let cogida; const yaCogida = new Promise((r) => (cogida = r));
  const tx = larga.p.$transaction(async (t) => {
    await t.$queryRawUnsafe(`SELECT 1 FROM "${tabla}" LIMIT 1`);
    cogida(); await suelta;
  }, { timeout: 60000 });
  await yaCogida;
  try { return await fn(); } finally { soltar(); await tx; await larga.end(); }
}

// ¿Una lectura normal de la tabla vuelve en menos de 1,5 s mientras corre el DDL?
async function laLecturaVuelve(tabla) {
  const c = await nuevo();
  try {
    await c.p.$transaction(async (t) => {
      await t.$executeRawUnsafe("SET LOCAL statement_timeout = '1500ms'");
      await t.$queryRawUnsafe(`SELECT count(*) FROM "${tabla}"`);
    });
    return true;
  } catch { return false; } finally { await c.end(); }
}

const casos = [
  ["ChatConversationPreference", 'ALTER TABLE "ChatConversationPreference" ADD COLUMN IF NOT EXISTS "purgedAt" TIMESTAMP(3)', "ensurePurgedAtColumn"],
  ["Session", 'ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMP(3)', "ensureResolvedAtColumn"],
];

const m = ROTO ? null : await import("./.compilado/ddl-sin-bloquear/entrada-de-ddl-sin-bloquear.js");

for (const [tabla, alterViejo, fn] of casos) {
  test(`${tabla}: el DDL de arranque no deja en cola las lecturas`, async () => {
    // que la columna exista, como en producción
    { const c = await nuevo(); await c.query(alterViejo); await c.end(); }
    let ddl;
    await conLaTablaCogida(tabla, async () => {
      if (ROTO) {
        // lo de antes: el ALTER a pelo, que pide AccessExclusive aunque no haga nada
        const c = await nuevo();
        ddl = c.query(alterViejo).catch(() => {}).finally(() => c.end());
      } else {
        const t0 = Date.now();
        ddl = m[fn]().then(() => assert.ok(Date.now() - t0 < 4000, "el ensure tardó demasiado"));
      }
      await new Promise((r) => setTimeout(r, 300));
      const vuelve = await laLecturaVuelve(tabla);
      if (ROTO) {
        assert.equal(vuelve, false, "con el ALTER a pelo la lectura tenía que quedarse en cola");
      } else {
        assert.equal(vuelve, true, "la lectura se quedó en cola detrás del DDL");
        await ddl;
      }
    });
    if (ROTO) await ddl;
  });
}

if (!ROTO) {
  test("si falta la columna y la tabla está cogida, se rinde en ~3 s y no bloquea", async () => {
    const c0 = await nuevo(); await c0.query('ALTER TABLE "Session" DROP COLUMN IF EXISTS "banco_x"'); await c0.end();
    await conLaTablaCogida("Session", async () => {
      const t0 = Date.now();
      const p = m.asegurarColumna("Session", "banco_x", 'ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "banco_x" int').then(() => "ok", (e) => e);
      await new Promise((r) => setTimeout(r, 300));
      // mientras espera el candado, las lecturas sí quedan detrás: tiene que ser poco rato
      const r = await p;
      assert.ok(r instanceof Error, "tenía que rendirse por lock_timeout");
      assert.ok(Date.now() - t0 < 5000);
    });
    // y sin nadie cogiendo la tabla, la crea
    await m.asegurarColumna("Session", "banco_x", 'ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "banco_x" int');
    const c = await nuevo();
    const rows = await c.filas("SELECT 1 FROM information_schema.columns WHERE table_name='Session' AND column_name='banco_x'");
    await c.query('ALTER TABLE "Session" DROP COLUMN "banco_x"'); await c.end();
    assert.equal(rows.length, 1);
  });
}
