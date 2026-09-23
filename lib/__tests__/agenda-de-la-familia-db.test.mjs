/**
 * La Agenda de la familia, contra Postgres y por las ACCIONES de verdad.
 *
 * Una madre con dos hijas y una cuenta ajena, con `linked_accounts` sembrada:
 * el alcance sale de FILAS, no de un parámetro. Se comprueba:
 *
 *  - la madre ve sus citas y las de sus dos hijas, en una sola lista, en el
 *    calendario, en el Kanban y en los conteos; y nunca las de la ajena;
 *  - una hija no ve ni a su madre ni a su hermana, **aunque escriba el
 *    parámetro a mano**;
 *  - el filtro reduce a una sola cuenta;
 *  - la madre cambia el estado de una cita de una hija, y el cambio se ve
 *    **desde las dos cuentas** (es la misma fila); la hija no puede tocar la de
 *    su madre;
 *  - el aviso de ese cambio sale por la línea y con la clave de la cuenta
 *    DUEÑA de la cita, no de la madre.
 *
 * Lo UNICO que se finge es `currentUser()`, `revalidatePath`, el `cache()` de
 * React y la red (`fetch`, para ver a qué servidor y línea se habló).
 *
 * `MODO=roto` corre **la forma vieja escrita dentro, literal** —la consulta
 * acotada a `userId = la propia` y el aviso del calendario con la clave y la
 * primera línea de quien mira— y AFIRMA el fallo.
 *
 * Se levanta con `scripts/banco-agenda-de-la-familia.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
    ponerAQuienMira,
    resolverLasCuentasDelCrm,
    getAppointmentsByUser,
    getAppointmentsForKanban,
    getAppointmentStatusCounts,
    updateAppointmentStatus,
    sendAppointmentStatusNotification,
    db,
} from "./.compilado/agenda/entrada-de-la-agenda.js";

const ROTO = process.env.MODO === "roto";
const V = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const MADRE = `ag-madre-${V}`;
const HIJA_A = `ag-hija-a-${V}`;
const HIJA_B = `ag-hija-b-${V}`;
const AJENA = `ag-ajena-${V}`;
const TODAS = [MADRE, HIJA_A, HIJA_B, AJENA];
const LA_FAMILIA = [MADRE, HIJA_A, HIJA_B];

/** Citas por cuenta: distintas a propósito, para que un total mal hecho no cuadre. */
const CUANTAS = { [MADRE]: 2, [HIJA_A]: 3, [HIJA_B]: 1, [AJENA]: 4 };

const linea = (cuenta) => `LINEA_${cuenta}`;
const servidor = (cuenta) => `evo-${cuenta}.banco.test`;
const clave = (cuenta) => `clave-${cuenta}`;

/** cuenta → ids de sus citas */
const citas = {};

function quien(id) {
    return {
        id,
        effectiveId: id,
        sessionUserId: id,
        ownerId: null,
        advisorRole: null,
        role: "user",
        rolDeLaPersona: "user",
        email: `${id}@banco.test`,
        name: id,
    };
}

/* La red, fingida: se anota a quién se le habló. */
const llamadas = [];
globalThis.fetch = async (url, init) => {
    llamadas.push({ url: String(url), apikey: init?.headers?.apikey ?? null });
    return new Response(JSON.stringify({ key: { id: `msg-${llamadas.length}` }, instance: { state: "open" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
    });
};

test.before(async () => {
    for (const id of TODAS) {
        const ak = await db.apiKey.create({ data: { url: servidor(id), key: clave(id) } });
        await db.user.create({
            data: { id, email: `${id}@banco.test`, name: id, company: id, role: "user", ownerId: null, apiKeyId: ak.id },
        });
        await db.instancia.create({
            data: { userId: id, instanceName: linea(id), instanceId: `inst-${id}`, instanceType: "Whatsapp" },
        });
    }
    let n = 0;
    for (const hija of [HIJA_A, HIJA_B]) {
        await db.$executeRawUnsafe(
            `INSERT INTO "linked_accounts" ("id", "master_user_id", "linked_user_id") VALUES ($1, $2, $3)`,
            `ag-${V}-${n++}`,
            MADRE,
            hija,
        );
    }

    const base = Date.now() + 86_400_000;
    for (const cuenta of TODAS) {
        citas[cuenta] = [];
        const servicio = await db.service.create({ data: { userId: cuenta, name: `Consulta ${cuenta}`, messageText: "ok" } });
        for (let i = 0; i < CUANTAS[cuenta]; i++) {
            const s = await db.session.create({
                data: {
                    userId: cuenta,
                    remoteJid: `57300${i}${cuenta.length}@s.whatsapp.net`,
                    pushName: `Cliente ${i} de ${cuenta}`,
                    instanceId: linea(cuenta),
                    status: true,
                },
            });
            // A la MISMA hora en todas las cuentas: son los cruces de horario
            // que el tablero unificado viene a enseñar.
            const inicio = new Date(base + i * 3_600_000);
            const a = await db.appointment.create({
                data: {
                    userId: cuenta,
                    sessionId: s.id,
                    startTime: inicio,
                    endTime: new Date(inicio.getTime() + 1_800_000),
                    timezone: "America/Bogota",
                    serviceId: servicio.id,
                },
            });
            citas[cuenta].push(a.id);
        }
    }
});

test.after(async () => {
    await db.$disconnect();
});

/** Las citas que ve una cuenta en el tablero, como el tablero las pide. */
async function lasQueVe(propia, pedidas) {
    ponerAQuienMira(quien(propia));
    if (ROTO) {
        // La consulta de antes, literal: `where: { userId: cuenta }`.
        return db.appointment.findMany({ where: { userId: propia } });
    }
    const res = await getAppointmentsByUser(propia, pedidas);
    assert.equal(res.success, true, res.message);
    return res.data;
}

function porCuenta(lista) {
    const r = {};
    for (const a of lista) r[a.userId] = (r[a.userId] ?? 0) + 1;
    return r;
}

test(ROTO ? "ANTES: la madre solo veía sus propias citas" : "la madre ve sus citas y las de sus dos hijas, en una sola lista, y ninguna ajena", async () => {
    ponerAQuienMira(quien(MADRE));
    const cuentas = await resolverLasCuentasDelCrm(MADRE, undefined);
    assert.deepEqual([...cuentas.elegidas].sort(), [...LA_FAMILIA].sort());

    const vistas = await lasQueVe(MADRE, cuentas.elegidas);
    if (ROTO) {
        assert.deepEqual(porCuenta(vistas), { [MADRE]: CUANTAS[MADRE] });
        return;
    }
    assert.deepEqual(porCuenta(vistas), { [MADRE]: 2, [HIJA_A]: 3, [HIJA_B]: 1 });
    assert.ok(!vistas.some((a) => a.userId === AJENA));
    // Una sola lista, en orden de hora: las tres cuentas se intercalan.
    const horas = vistas.map((a) => new Date(a.startTime).getTime());
    assert.deepEqual(horas, [...horas].sort((x, y) => x - y));
});

test(ROTO ? "ANTES: el Kanban y los conteos también eran de la cuenta propia" : "el Kanban y los conteos cuentan las mismas citas, y el Kanban sabe de qué cuenta y línea es cada una", async () => {
    ponerAQuienMira(quien(MADRE));
    if (ROTO) {
        const n = await db.appointment.count({ where: { userId: MADRE } });
        assert.equal(n, CUANTAS[MADRE]);
        return;
    }
    const kanban = await getAppointmentsForKanban(MADRE, LA_FAMILIA);
    assert.equal(kanban.success, true);
    assert.equal(kanban.data.length, 6);
    const deA = kanban.data.find((c) => c.cuentaId === HIJA_A);
    assert.equal(deA.linea, linea(HIJA_A));

    const conteos = await getAppointmentStatusCounts(MADRE, LA_FAMILIA);
    const total = conteos.data.reduce((s, c) => s + c.count, 0);
    assert.equal(total, 6);
});

test("una hija no ve ni a su madre ni a su hermana, aunque escriba el parámetro a mano", async () => {
    ponerAQuienMira(quien(HIJA_A));
    const cuentas = await resolverLasCuentasDelCrm(HIJA_A, [MADRE, HIJA_B, HIJA_A]);
    assert.deepEqual(cuentas.elegidas, [HIJA_A]);
    assert.equal(cuentas.puedeElegir, false, "una hija sin cuentas debajo no ve el filtro");

    const vistas = await lasQueVe(HIJA_A, [MADRE, HIJA_B, HIJA_A, AJENA]);
    assert.deepEqual(porCuenta(vistas), { [HIJA_A]: 3 });

    if (!ROTO) {
        // Y pidiendo desde la cuenta de su madre, ni eso.
        const desdeLaMadre = await getAppointmentsByUser(MADRE, LA_FAMILIA);
        assert.equal(desdeLaMadre.success, false);
        const kanban = await getAppointmentsForKanban(HIJA_A, [MADRE, HIJA_B]);
        assert.deepEqual(new Set(kanban.data.map((c) => c.cuentaId)), new Set([HIJA_A]));
    }
});

test("el filtro reduce: la madre esconde cuentas y ve solo la elegida", async () => {
    if (ROTO) return;
    ponerAQuienMira(quien(MADRE));
    const cuentas = await resolverLasCuentasDelCrm(MADRE, [HIJA_B]);
    assert.deepEqual(cuentas.elegidas, [HIJA_B]);
    assert.deepEqual(porCuenta(await lasQueVe(MADRE, cuentas.elegidas)), { [HIJA_B]: 1 });

    const dos = await resolverLasCuentasDelCrm(MADRE, [MADRE, HIJA_A]);
    assert.deepEqual(porCuenta(await lasQueVe(MADRE, dos.elegidas)), { [MADRE]: 2, [HIJA_A]: 3 });
    // Una ajena colada en el parámetro se cae y no arrastra a las buenas.
    const colada = await resolverLasCuentasDelCrm(MADRE, [AJENA, HIJA_A]);
    assert.deepEqual(colada.elegidas, [HIJA_A]);
});

test("la madre cambia el estado de una cita de su hija, y el cambio se ve en las dos cuentas", async () => {
    const cita = citas[HIJA_A][0];
    ponerAQuienMira(quien(MADRE));
    const res = await updateAppointmentStatus(cita, "CONFIRMADA");
    assert.equal(res.success, true, res.message);

    // Desde la hija: es la MISMA fila.
    ponerAQuienMira(quien(HIJA_A));
    const deLaHija = await getAppointmentsByUser(HIJA_A);
    assert.equal(deLaHija.data.find((a) => a.id === cita).status, "CONFIRMADA");
    const conteosHija = await getAppointmentStatusCounts(HIJA_A);
    assert.equal(conteosHija.data.find((c) => c.status === "CONFIRMADA")?.count, 1);

    // Desde la madre, también.
    if (!ROTO) {
        ponerAQuienMira(quien(MADRE));
        const deLaMadre = await getAppointmentsByUser(MADRE, LA_FAMILIA);
        assert.equal(deLaMadre.data.find((a) => a.id === cita).status, "CONFIRMADA");
    }
});

test("una hija no puede cambiar el estado de una cita de su madre ni de su hermana", async () => {
    ponerAQuienMira(quien(HIJA_A));
    for (const cita of [citas[MADRE][0], citas[HIJA_B][0]]) {
        const res = await updateAppointmentStatus(cita, "CANCELADA");
        assert.equal(res.success, false);
        const fila = await db.appointment.findUnique({ where: { id: cita } });
        assert.equal(fila.status, "PENDIENTE", "no se tocó");
    }
});

test(ROTO ? "ANTES: el aviso de la cita de la hija salía por la línea de la MADRE" : "el aviso de la cita de la hija sale por la línea y con la clave de la HIJA, no de la madre", async () => {
    const cita = citas[HIJA_A][1];
    llamadas.length = 0;

    if (ROTO) {
        // El calendario de antes, literal: la clave y la primera línea de QUIEN MIRA.
        const madre = await db.user.findUnique({
            where: { id: MADRE },
            include: { apiKey: true, instancias: true },
        });
        const instanceName = madre.instancias[0]?.instanceName ?? "";
        const url = `https://${madre.apiKey.url}/message/sendText/${instanceName}`;
        assert.equal(url, `https://${servidor(MADRE)}/message/sendText/${linea(MADRE)}`);
        assert.notEqual(instanceName, linea(HIJA_A), "salía por la línea equivocada");
        return;
    }

    ponerAQuienMira(quien(MADRE));
    assert.equal((await updateAppointmentStatus(cita, "ATENDIDA")).success, true);
    const aviso = await sendAppointmentStatusNotification(cita, "ATENDIDA");
    assert.equal(aviso.success, true, aviso.message);
    assert.equal(aviso.instanceName, linea(HIJA_A));

    const envio = llamadas.find((l) => l.url.includes("/message/sendText/"));
    assert.ok(envio, `se mandó algo: ${JSON.stringify(llamadas)}`);
    assert.equal(envio.url, `https://${servidor(HIJA_A)}/message/sendText/${linea(HIJA_A)}`);
    assert.equal(envio.apikey, clave(HIJA_A));
    assert.ok(!llamadas.some((l) => l.url.includes(linea(MADRE)) || l.url.includes(servidor(MADRE))), "nada salió por la madre");
});
