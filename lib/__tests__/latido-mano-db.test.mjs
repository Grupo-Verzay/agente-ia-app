/**
 * La mano levantada, END TO END: corre el `latidoDeLaSalaAction` REAL con una
 * sesión fingida y comprueba que **lo que recibe cada cliente** trae la mano de
 * los demás. Es la mitad que le faltaba al banco de `losDeLaSala`: aquella
 * probaba la consulta; esta prueba la ACCIÓN entera (el `dentro` que viaja).
 *
 * Montaje: A es la cuenta dueña de la sala; B es de su equipo (owner_id = A),
 * así que las dos pertenecen a la sala. Cuando A levanta la mano, el latido que
 * recibe B tiene que traer a A con la mano arriba.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import {
    db,
    crearLaSala,
    entrarConCuenta,
    levantarLaMano,
    latidoDeLaSalaAction,
    __setUser,
} from "./.compilado/latido/entrada-de-latido.js";

async function crearCuenta(id, ownerId = null) {
    await db.$executeRawUnsafe(
        `INSERT INTO "User" ("id","email","name","role","owner_id","updatedAt")
         VALUES ($1,$2,$3,'user',$4,NOW()) ON CONFLICT ("id") DO NOTHING`,
        id,
        `${id}@banco.test`,
        id,
        ownerId,
    );
}

/** A (dueña) y B (de su equipo), las dos dentro de una sala de la cuenta A. */
async function unaSalaConDos() {
    const t = randomUUID().slice(0, 8);
    const A = `A-${t}`;
    const B = `B-${t}`;
    await crearCuenta(A);
    await crearCuenta(B, A); // B cuelga de A: su cuenta es A, pertenece a la sala
    const sala = await crearLaSala({
        cuentaId: A,
        canalId: null,
        anfitrionId: A,
        anfitrionNombre: "A",
        titulo: "Reunión",
        expiraEn: null,
    });
    await entrarConCuenta({ salaId: sala.id, personaId: A, nombre: "A" });
    await entrarConCuenta({ salaId: sala.id, personaId: B, nombre: "B" });
    return { codigo: sala.codigo, A, B };
}

test("EL FALLO: A levanta la mano y B la ve en su latido", async () => {
    const { codigo, A, B } = await unaSalaConDos();
    // `quienFirma` resuelve la cuenta de B con `user.ownerId`, así que se lo
    // pasamos (A). Con eso B pertenece a la sala de la cuenta A.
    const verB = async () => {
        __setUser({ id: B, name: "B", ownerId: A });
        const res = await latidoDeLaSalaAction({ codigo });
        if (!res.success) throw new Error(`latido de B: ${res.message}`);
        const mano = {};
        for (const d of res.datos.dentro) mano[d.nombre] = d.manoLevantada;
        return mano;
    };

    // Al principio, nadie.
    assert.deepEqual(await verB(), { A: false, B: false });

    // A levanta la mano.
    __setUser({ id: A, name: "A" });
    const filaA = await latidoDeLaSalaAction({ codigo }); // asegura que A pertenece/está
    assert.ok(filaA.success, "A puede latir");
    await levantarLaMano(filaA.datos.yo.participanteId, true);

    // Lo que recibe B: A con la mano ARRIBA. Este es el dato que pinta el
    // recuadro de A en la pantalla de B.
    const visto = await verB();
    assert.equal(visto.A, true, "B ve la mano de A");
    assert.equal(visto.B, false, "B no ha levantado la suya");
});

test("al bajarla, B deja de verla", async () => {
    const { codigo, A, B } = await unaSalaConDos();
    __setUser({ id: A, name: "A" });
    const la = await latidoDeLaSalaAction({ codigo });
    await levantarLaMano(la.datos.yo.participanteId, true);

    __setUser({ id: B, name: "B", ownerId: A });
    let res = await latidoDeLaSalaAction({ codigo });
    assert.equal(res.datos.dentro.find((d) => d.nombre === "A").manoLevantada, true);

    __setUser({ id: A, name: "A" });
    await levantarLaMano(la.datos.yo.participanteId, false);

    __setUser({ id: B, name: "B", ownerId: A });
    res = await latidoDeLaSalaAction({ codigo });
    assert.equal(res.datos.dentro.find((d) => d.nombre === "A").manoLevantada, false, "B ya no la ve");
});

test.after(async () => {
    await db.$disconnect();
});
