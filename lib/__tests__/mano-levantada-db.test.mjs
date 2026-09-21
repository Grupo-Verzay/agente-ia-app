/**
 * La mano levantada, **contra Postgres de verdad**.
 *
 * El fallo reportado: cuando alguien levanta la mano, solo la ve él; los demás
 * no ven ninguna señal. Este banco reconstruye **lo que el latido le manda a
 * cada cliente sobre los demás** —que es lo que decide si «llega a los demás»—:
 * `comoSeVe` en `latidoDeLaSalaAction` hace, por cada participante,
 * `manoLevantada: tieneLaManoLevantada(f.manoLevantadaEn)` sobre `losDeLaSala`.
 *
 * Así que `loQueVenLosDemas(sala)` = esa misma cuenta, y es exactamente el
 * booleano que pinta cada recuadro remoto. Si A levanta la mano, B y C tienen
 * que verla; al bajarla, tiene que desaparecer para todos.
 */
import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import {
    db,
    crearLaSala,
    entrarConCuenta,
    levantarLaMano,
    losDeLaSala,
    tieneLaManoLevantada,
} from "./.compilado/mano/entrada-de-mano.js";

async function crearCuenta(id) {
    await db.$executeRawUnsafe(
        `INSERT INTO "User" ("id","email","name","role","updatedAt")
         VALUES ($1,$2,$3,'user',NOW()) ON CONFLICT ("id") DO NOTHING`,
        id,
        `${id}@banco.test`,
        id,
    );
}

/** Una sala con tres personas dentro: A, B y C. */
async function unaSalaConTres() {
    const t = randomUUID().slice(0, 8);
    const dueno = `d-${t}`;
    await crearCuenta(dueno);
    const sala = await crearLaSala({
        cuentaId: dueno,
        canalId: null,
        anfitrionId: dueno,
        anfitrionNombre: dueno,
        titulo: "Reunión de prueba",
        expiraEn: null,
    });
    const gente = {};
    for (const nombre of ["A", "B", "C"]) {
        const id = `${nombre}-${t}`;
        await crearCuenta(id);
        const fila = await entrarConCuenta({ salaId: sala.id, personaId: id, nombre });
        gente[nombre] = fila.id;
    }
    return { salaId: sala.id, gente };
}

/**
 * Lo que cada cliente ve sobre los demás: el booleano `manoLevantada` que el
 * latido calcula por participante. Es `comoSeVe`, replicado con las funciones
 * reales.
 */
async function loQueVenLosDemas(salaId) {
    const todos = await losDeLaSala(salaId);
    const mano = {};
    for (const f of todos) mano[f.nombre] = tieneLaManoLevantada(f.manoLevantadaEn);
    return mano;
}

beforeEach(async () => {
    // Las tablas no se limpian entre tests; cada uno arma su sala con ids
    // únicos, así que no hace falta borrar nada.
});

test("una mano levantada por A la ven TODOS, no solo A", async () => {
    const { salaId, gente } = await unaSalaConTres();

    // Al principio nadie tiene la mano levantada.
    assert.deepEqual(await loQueVenLosDemas(salaId), { A: false, B: false, C: false });

    // A levanta la mano.
    await levantarLaMano(gente.A, true);

    // Lo que ve CADA cliente sobre los participantes: A con la mano arriba.
    // Esto es lo que pintarían los recuadros de B y de C, no solo el de A.
    const visto = await loQueVenLosDemas(salaId);
    assert.equal(visto.A, true, "A tiene la mano levantada para todos");
    assert.equal(visto.B, false, "B no la ha levantado");
    assert.equal(visto.C, false, "C no la ha levantado");
});

test("al bajarla, desaparece para TODOS", async () => {
    const { salaId, gente } = await unaSalaConTres();
    await levantarLaMano(gente.A, true);
    assert.equal((await loQueVenLosDemas(salaId)).A, true);

    await levantarLaMano(gente.A, false);
    assert.deepEqual(await loQueVenLosDemas(salaId), { A: false, B: false, C: false });
});

test("dos manos a la vez: cada una es independiente", async () => {
    const { salaId, gente } = await unaSalaConTres();
    await levantarLaMano(gente.A, true);
    await levantarLaMano(gente.C, true);

    const visto = await loQueVenLosDemas(salaId);
    assert.equal(visto.A, true);
    assert.equal(visto.B, false);
    assert.equal(visto.C, true);

    // A baja la suya; la de C sigue en pie.
    await levantarLaMano(gente.A, false);
    const despues = await loQueVenLosDemas(salaId);
    assert.equal(despues.A, false, "A la bajó");
    assert.equal(despues.C, true, "la de C no se toca");
});

test("una mano vieja (fuera de la vigencia) ya no se ve", async () => {
    const { salaId, gente } = await unaSalaConTres();
    // Se siembra una marca de hace tres minutos: por encima de la vigencia
    // (2 min), así que caducó y no la ve nadie.
    await db.$executeRawUnsafe(
        `UPDATE "sala_participantes" SET "manoLevantadaEn" = NOW() - INTERVAL '3 minutes' WHERE "id" = $1`,
        gente.A,
    );
    assert.equal((await loQueVenLosDemas(salaId)).A, false, "una mano caducada no se ve");
});

test.after(async () => {
    await db.$disconnect();
});
