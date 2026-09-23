/**
 * Reuniones › Grabaciones, **contra Postgres**: quién ve qué grabación.
 *
 * La regla es la de siempre en esta plataforma: cada cuenta ve lo suyo y lo que
 * cuelga de ella HACIA ABAJO (la misma puerta que el CRM), nunca lo de su madre
 * ni lo de una hermana. Se ejercen las ACCIONES de verdad
 * (`lasGrabacionesDeLasReunionesAction` y `transcribirLaReunionAction`); lo
 * único fingido es `currentUser()`.
 *
 * `MODO=roto` lleva escrito dentro el filtro VIEJO —solo la cuenta propia— y
 * afirma que con él la madre no ve las grabaciones de sus hijas.
 */
import test, { before, after } from "node:test";
import assert from "node:assert/strict";

import {
    ponerAQuienMira,
    lasGrabacionesDeLasReunionesAction,
    transcribirLaReunionAction,
    crearLaSala,
    empezarLaGrabacion,
    cerrarLaGrabacion,
    lasGrabacionesDeLasSalas,
    RUTA_DE_GRABACIONES,
    db,
} from "./.compilado/grabaciones-de-reuniones/entrada-de-grabaciones-de-reuniones.js";

const ROTO = process.env.MODO === "roto";
const V = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const MADRE = `madre-${V}`;
const HIJA = `hija-${V}`;
const HERMANA = `hermana-${V}`;
const AJENA = `ajena-${V}`;
const AGENTE = `agente-${V}`;
const CUENTAS = [MADRE, HIJA, HERMANA, AJENA];

function cuenta(id) {
    return {
        id, effectiveId: id, sessionUserId: id, ownerId: null, advisorRole: null,
        role: "admin", rolDeLaPersona: "admin", porImpersonacion: false, name: id,
    };
}
function agente() {
    return {
        id: AGENTE, effectiveId: MADRE, sessionUserId: AGENTE, ownerId: MADRE,
        advisorRole: "agente", role: "user", rolDeLaPersona: "user", rolDeLaCuenta: "admin",
        porImpersonacion: false, name: AGENTE,
    };
}

const salas = {};
const grabacionDe = {};
let modulo = null;

before(async () => {
    for (const id of CUENTAS) {
        await db.user.create({ data: { id, email: `${id}@banco.test`, name: id, role: "admin" } });
    }
    await db.user.create({
        data: { id: AGENTE, email: `${AGENTE}@banco.test`, name: AGENTE, role: "user", ownerId: MADRE, advisorRole: "agente" },
    });
    // La madre vincula a sus dos hijas; la ajena no es de la familia.
    let n = 0;
    for (const [de, a] of [[MADRE, HIJA], [MADRE, HERMANA]]) {
        await db.$executeRawUnsafe(
            `INSERT INTO "linked_accounts" ("id","master_user_id","linked_user_id") VALUES ($1,$2,$3)`,
            `grb-${V}-${n++}`, de, a,
        );
    }
    // El módulo de grabación: solo la DEFINICIÓN, sin restricciones, así que
    // cualquier cuenta lo alcanza (que es como lo lee `laCuentaPuedeGrabar`).
    modulo = await db.module.create({
        data: { label: `Grabaciones ${V}`, route: RUTA_DE_GRABACIONES, icon: "video" },
    });

    for (const c of CUENTAS) {
        const sala = await crearLaSala({
            cuentaId: c, canalId: null, anfitrionId: c, anfitrionNombre: c,
            titulo: `Sala de ${c}`, expiraEn: null,
        });
        salas[c] = sala.id;
        const g = await empezarLaGrabacion({
            salaId: sala.id, cuentaId: c, salaTitulo: sala.titulo,
            pedidaPorId: c, pedidaPorNombre: c, modo: "video",
        });
        await cerrarLaGrabacion({
            grabacionId: g.id, salaId: sala.id, estado: "lista", segundos: 60,
            audioUrl: `http://localhost/b/${c}/a.webm`, videoUrl: `http://localhost/b/${c}/v.webm`,
        });
        grabacionDe[c] = g.id;
    }
});

after(async () => {
    await db.$executeRawUnsafe(`DELETE FROM "grabaciones_de_reunion" WHERE "cuentaId" = ANY($1::text[])`, CUENTAS);
    await db.$executeRawUnsafe(`DELETE FROM "salas_de_video" WHERE "cuentaId" = ANY($1::text[])`, CUENTAS);
    await db.$executeRawUnsafe(
        `DELETE FROM "linked_accounts" WHERE "master_user_id" = ANY($1::text[]) OR "linked_user_id" = ANY($1::text[])`,
        CUENTAS,
    );
    if (modulo) await db.module.delete({ where: { id: modulo.id } });
    await db.user.deleteMany({ where: { id: AGENTE } });
    await db.user.deleteMany({ where: { id: { in: CUENTAS } } });
    await db.$disconnect();
});

const TODAS = () => CUENTAS.map((c) => salas[c]);

/** De quién son las grabaciones que devuelve la acción, pidiendo TODAS las salas. */
async function loQueVe(quien) {
    ponerAQuienMira(quien);
    if (ROTO) {
        // El filtro de antes, literal: `f.cuentaId === yo.cuentaId`.
        const mapa = await lasGrabacionesDeLasSalas(TODAS());
        const yo = quien.ownerId || quien.id;
        return [...mapa.values()].flat().filter((f) => f.cuentaId === yo).map((f) => f.cuentaId).sort();
    }
    const res = await lasGrabacionesDeLasReunionesAction(TODAS());
    assert.equal(res.success, true, res.message);
    assert.equal(res.puedeGrabar, true);
    const ids = Object.values(res.porSala).flat().map((g) => g.id);
    return CUENTAS.filter((c) => ids.includes(grabacionDe[c])).sort();
}

test("la madre ve las suyas y las de sus dos hijas, y nada de la ajena", async () => {
    const ve = await loQueVe(cuenta(MADRE));
    if (ROTO) {
        assert.deepEqual(ve, [MADRE], "el roto no reproduce: la madre ya veía las de sus hijas");
        return;
    }
    assert.deepEqual(ve, [MADRE, HIJA, HERMANA].sort());
});

test("una hija ve las suyas: ni las de su madre ni las de su hermana", async () => {
    const ve = await loQueVe(cuenta(HIJA));
    assert.deepEqual(ve, [HIJA]);
});

test("un agente de la madre ve las de su cuenta y nada de abajo", async () => {
    const ve = await loQueVe(agente());
    assert.deepEqual(ve, [MADRE]);
});

test("la ajena, pidiendo a mano las salas de la familia, solo ve la suya", async () => {
    const ve = await loQueVe(cuenta(AJENA));
    assert.deepEqual(ve, [AJENA]);
});

test("transcribir sigue la MISMA puerta: hacia abajo sí, hacia arriba no", async (t) => {
    if (ROTO) return t.skip("el modo roto afirma el alcance de la lista");
    // La hija NO puede con la de su madre.
    ponerAQuienMira(cuenta(HIJA));
    const arriba = await transcribirLaReunionAction({ grabacionId: grabacionDe[MADRE] });
    assert.deepEqual(arriba, { success: false, message: "No autorizado." });
    const hermana = await transcribirLaReunionAction({ grabacionId: grabacionDe[HERMANA] });
    assert.deepEqual(hermana, { success: false, message: "No autorizado." });

    // La madre SÍ pasa la puerta con la de su hija: lo que la pare después
    // (créditos, clave de IA) ya no es «No autorizado».
    ponerAQuienMira(cuenta(MADRE));
    const abajo = await transcribirLaReunionAction({ grabacionId: grabacionDe[HIJA] });
    assert.notEqual(abajo.success === false ? abajo.message : "", "No autorizado.");
});
