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
    llamarALaPuerta,
    dejarPasar,
    latidoDeLaSalaAction,
    levantarLaManoAction,
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

test("EL ESCENARIO REPORTADO: el INVITADO levanta la mano y el de la cuenta la ve", async () => {
    // A entra con su cuenta; un invitado llama a la puerta y A lo deja pasar.
    const t = randomUUID().slice(0, 8);
    const A = `A-${t}`;
    await crearCuenta(A);
    const sala = await crearLaSala({
        cuentaId: A,
        canalId: null,
        anfitrionId: A,
        anfitrionNombre: "A",
        titulo: "Reunión",
        expiraEn: null,
    });
    await entrarConCuenta({ salaId: sala.id, personaId: A, nombre: "A" });
    const invitado = await llamarALaPuerta({ salaId: sala.id, nombre: "Invitado" });
    assert.ok(invitado, "el invitado llama a la puerta");
    assert.equal(await dejarPasar({ salaId: sala.id, participanteId: invitado.id }), "pasa");

    // El INVITADO levanta la mano por la MISMA acción que usa el navegador, con
    // su token (no tiene sesión). Es la ruta que no cubrían los otros casos.
    const res = await levantarLaManoAction({ token: invitado.invitadoToken, levantada: true });
    assert.ok(res.success, `el invitado levanta la mano: ${res.message ?? ""}`);

    // Lo que ve A (el de la cuenta): el invitado con la mano arriba.
    __setUser({ id: A, name: "A" });
    const visto = await latidoDeLaSalaAction({ codigo: sala.codigo });
    assert.ok(visto.success);
    const elInvitado = visto.datos.dentro.find((d) => d.nombre === "Invitado");
    assert.ok(elInvitado, "el invitado sale en el latido de A");
    assert.equal(elInvitado.manoLevantada, true, "A ve la mano del invitado");

    // Y el propio invitado la ve en su latido (con su token).
    const suyo = await latidoDeLaSalaAction({ token: invitado.invitadoToken });
    assert.ok(suyo.success);
    assert.equal(suyo.datos.yo.manoLevantada, true, "el invitado ve su propia mano");

    // La baja: A deja de verla.
    assert.ok((await levantarLaManoAction({ token: invitado.invitadoToken, levantada: false })).success);
    __setUser({ id: A, name: "A" });
    const despues = await latidoDeLaSalaAction({ codigo: sala.codigo });
    assert.equal(
        despues.datos.dentro.find((d) => d.nombre === "Invitado").manoLevantada,
        false,
        "A deja de ver la mano del invitado",
    );
});

test.after(async () => {
    await db.$disconnect();
});
