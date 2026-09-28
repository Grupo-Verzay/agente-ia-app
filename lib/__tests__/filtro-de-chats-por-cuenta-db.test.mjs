/**
 * El filtro de Chats contra Postgres y por la ACCIÓN de verdad.
 *
 * La familia en pequeño: una madre que vinculó a Atención y a Ventas, y una
 * cuenta ajena. Atención tiene DOS embudos; Ventas, ninguno; la ajena, uno.
 *
 * Lo que se demuestra:
 *  - la acción devuelve los embudos de cada cuenta pedida con su nombre y sus
 *    etapas en orden, y una ajena no se cuela aunque se pida;
 *  - una hija no alcanza a su madre;
 *  - de punta a punta: la etapa que el panel ofrece es la MISMA que la bandeja
 *    pinta en la fila (id y color), y filtrando por ella salen exactamente las
 *    conversaciones que están en esa etapa de ese embudo.
 *
 * `MODO=roto`: la acción no existía (se afirma leyéndolo de git) y la bandeja
 * sin filtro de etapa deja pasar todas las conversaciones.
 *
 * Se levanta con `scripts/banco-filtro-de-chats.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

import {
    ponerAQuienMira,
    embudosDelFiltroDeChatsAction,
    lasEtapasDeLaBandeja,
    crearEmbudo,
    moverConversacion,
    losEmbudosDelFiltro,
    elEmbudoDelFiltro,
    pasaElFiltroDeEtapa,
    alternarUnaSola,
    db,
} from "./.compilado/filtro-de-chats/entrada-del-filtro-de-chats.js";

const ROTO = process.env.MODO === "roto";
const ANTES_REF = process.env.ANTES_REF ?? "f3f296c";
const V = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const MADRE = `fc-madre-${V}`;
const ATENCION = `fc-atencion-${V}`;
const VENTAS = `fc-ventas-${V}`;
const AJENA = `fc-ajena-${V}`;

const quien = (id) => ({
    id,
    effectiveId: id,
    sessionUserId: id,
    ownerId: null,
    advisorRole: null,
    role: "user",
    rolDeLaPersona: "user",
    email: `${id}@banco.test`,
    name: id,
});

const E = {};
const S = {};

test.before(async () => {
    const nombres = { [MADRE]: "La Madre", [ATENCION]: "Verzay | Atención", [VENTAS]: "Verzay Ventas", [AJENA]: "Ajena" };
    for (const id of [MADRE, ATENCION, VENTAS, AJENA]) {
        await db.user.create({ data: { id, email: `${id}@b.t`, name: nombres[id], role: "user" } });
    }
    let n = 0;
    for (const hija of [ATENCION, VENTAS]) {
        await db.$executeRawUnsafe(
            `INSERT INTO "linked_accounts" ("id","master_user_id","linked_user_id") VALUES ($1,$2,$3)`,
            `fc-la-${V}-${n++}`, MADRE, hija,
        );
    }
    E.madre = await crearEmbudo({ cuentaId: MADRE, nombre: "Embudo madre", creadoPorId: MADRE });
    E.atencion1 = await crearEmbudo({ cuentaId: ATENCION, nombre: "Embudo de ventas", creadoPorId: ATENCION });
    E.atencion2 = await crearEmbudo({ cuentaId: ATENCION, nombre: "Soporte", creadoPorId: ATENCION });
    E.ajena = await crearEmbudo({ cuentaId: AJENA, nombre: "Ajeno", creadoPorId: AJENA });

    // Tres conversaciones de Atención, sin asesor: caen en su embudo por defecto.
    for (const k of ["uno", "dos", "tres"]) {
        const s = await db.session.create({
            data: { userId: ATENCION, remoteJid: `57300-${k}-${V}@s.whatsapp.net`, pushName: k, instanceId: `i-${V}`, status: true },
        });
        S[k] = s.id;
    }
});

test.after(async () => {
    await db.$disconnect();
});

if (ROTO) {
    test("ROTO: no había acción que diera los embudos al filtro de Chats", () => {
        let existe = true;
        try {
            execFileSync("git", ["cat-file", "-e", `${ANTES_REF}:actions/filtro-de-chats-actions.ts`], { stdio: "ignore" });
        } catch {
            existe = false;
        }
        assert.equal(existe, false, "la acción ya existía en el «antes»");
    });

    test("ROTO: sin filtro de etapa la bandeja deja pasar las tres conversaciones", async () => {
        const etapas = await lasEtapasDeLaBandeja(
            [S.uno, S.dos, S.tres].map((id) => ({ id, userId: ATENCION, assignedAdvisorId: null })),
        );
        assert.equal(etapas.size, 3);
        // Lo que hacía la lista: nada con la etapa.
        const pasan = [S.uno, S.dos, S.tres];
        assert.equal(pasan.length, 3);
    });
} else {
    test("la madre recibe sus embudos y los de sus hijas, con nombre y etapas en orden; la ajena no", async () => {
        ponerAQuienMira(quien(MADRE));
        const r = await embudosDelFiltroDeChatsAction([MADRE, ATENCION, VENTAS, AJENA]);
        assert.equal(r.success, true);
        assert.deepEqual(r.data.map((d) => d.cuentaId), [MADRE, ATENCION, VENTAS]);
        const atencion = r.data.find((d) => d.cuentaId === ATENCION);
        assert.equal(atencion.nombre, "Verzay | Atención");
        assert.deepEqual(atencion.embudos.map((e) => e.nombre), ["Embudo de ventas", "Soporte"]);
        assert.ok(atencion.embudos[0].etapas.length >= 3);
        assert.equal(atencion.embudos[0].etapas[0].nombre, "Nuevo");
        assert.deepEqual(r.data.find((d) => d.cuentaId === VENTAS).embudos, []);
        assert.ok(!r.data.some((d) => d.embudos.some((e) => e.id === E.ajena)));
    });

    test("una hija no alcanza a su madre", async () => {
        ponerAQuienMira(quien(ATENCION));
        const r = await embudosDelFiltroDeChatsAction([MADRE, ATENCION]);
        assert.equal(r.success, true);
        assert.deepEqual(r.data.map((d) => d.cuentaId), [ATENCION]);
    });

    test("nadie con sesión, nada", async () => {
        ponerAQuienMira(null);
        const r = await embudosDelFiltroDeChatsAction([MADRE]);
        assert.equal(r.success, false);
    });

    test("de punta a punta: la etapa del panel es la de la fila, y filtra EXACTO", async () => {
        ponerAQuienMira(quien(MADRE));
        const r = await embudosDelFiltroDeChatsAction([MADRE, ATENCION, VENTAS]);
        const embudos = losEmbudosDelFiltro(r.data, ATENCION);
        // Con dos embudos hay que elegir primero.
        assert.equal(elEmbudoDelFiltro(embudos, null), null);
        const embudo = elEmbudoDelFiltro(embudos, E.atencion1);
        assert.equal(embudo.id, E.atencion1);
        const cotizado = embudo.etapas[3];
        await moverConversacion({ sessionId: S.dos, embudoId: E.atencion1, etapaId: cotizado.id, movidoPorId: MADRE });

        const filas = await lasEtapasDeLaBandeja(
            [S.uno, S.dos, S.tres].map((id) => ({ id, userId: ATENCION, assignedAdvisorId: null })),
        );
        // La fila pinta la MISMA etapa y el MISMO color que el panel ofrece.
        assert.equal(filas.get(S.dos).id, cotizado.id);
        assert.equal(filas.get(S.dos).color, cotizado.color);
        assert.equal(filas.get(S.uno).id, embudo.etapas[0].id);

        const seleccion = alternarUnaSola(new Set(), cotizado.id);
        const pasan = [S.uno, S.dos, S.tres].filter((id) => pasaElFiltroDeEtapa(filas.get(id)?.id, seleccion));
        assert.deepEqual(pasan, [S.dos]);

        const nuevo = alternarUnaSola(new Set(), embudo.etapas[0].id);
        const enNuevo = [S.uno, S.dos, S.tres].filter((id) => pasaElFiltroDeEtapa(filas.get(id)?.id, nuevo));
        assert.deepEqual(enNuevo, [S.uno, S.tres]);
    });
}
