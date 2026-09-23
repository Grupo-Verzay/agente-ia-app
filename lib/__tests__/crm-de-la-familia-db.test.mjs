/**
 * El CRM de la familia, contra Postgres y por las ACCIONES de verdad.
 *
 * # Por que no se prueba `laSeleccionDelCrm` a solas
 *
 * Porque eso ya lo prueba el banco puro de al lado, y no es lo que estaba mal.
 * Lo que hay que demostrar es que **las cinco pestanas pasan por ella**: que la
 * madre ve lo de sus hijas unificado, que una hija no ve nada de su madre ni de
 * su hermana **por mucho que escriba el parametro a mano**, que el filtro
 * reduce, y que los totales cuadran con lo que el filtro tenga puesto. Eso solo
 * se ve contra Postgres, con `linked_accounts` sembrada antes: el alcance sale
 * de FILAS, no de un parametro.
 *
 * Lo UNICO que se finge es `currentUser()` —pide next-auth entero y no decide
 * nada de esto—, `revalidatePath` y el `cache()` de React.
 *
 * `MODO=roto` lleva **la consulta vieja escrita dentro, literal** —cada accion
 * acotada a `userId = la propia`— y **afirma el fallo**: la madre ve solo lo
 * suyo, que es el trabajo de entrar cuenta por cuenta que esto viene a quitar.
 *
 * Se levanta con `scripts/banco-crm-de-la-familia.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
    ponerAQuienMira,
    lasCuentasQueConsultaElCrm,
    resolverLasCuentasDelCrm,
    getRegistrosByUserId,
    getCrmDashboardStatsByUserId,
    getCallsCrmData,
    setCallDisposition,
    getKanbanSessionsAction,
    getWeeklyReports,
    getInformeSinRespuesta,
    getAnalyticsDataByUserId,
    db,
} from "./.compilado/crm/entrada-del-crm.js";

const ROTO = process.env.MODO === "roto";
/** La base se reutiliza entre ejecuciones: los ids llevan el sello de la vuelta. */
const V = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const MADRE = `crm-madre-${V}`;
const HIJA_A = `crm-hija-a-${V}`;
const HIJA_B = `crm-hija-b-${V}`;
const AJENA = `crm-ajena-${V}`;

/** Cuantas filas de cada cosa tiene cada cuenta. Distintas a proposito: con
 *  todas iguales, un total equivocado seguiria cuadrando. */
const CUANTAS = {
    [MADRE]: { sesiones: 3, registros: 3, llamadas: 2, informes: 1, sinRespuesta: 1 },
    [HIJA_A]: { sesiones: 2, registros: 2, llamadas: 3, informes: 2, sinRespuesta: 2 },
    [HIJA_B]: { sesiones: 1, registros: 1, llamadas: 1, informes: 1, sinRespuesta: 3 },
    [AJENA]: { sesiones: 4, registros: 5, llamadas: 4, informes: 3, sinRespuesta: 4 },
};

const LA_FAMILIA = [MADRE, HIJA_A, HIJA_B];

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

/** Las dos tablas que NO estan en `schema.prisma` —las crea el backend— asi que
 *  aqui se escriben a mano: sembrarlas a ojo seria probar contra otra tabla. */
async function tablasDelBackend() {
    await db.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS weekly_reports (
            id TEXT PRIMARY KEY,
            "userId" TEXT NOT NULL,
            period_start TIMESTAMP(3) NOT NULL,
            period_end TIMESTAMP(3) NOT NULL,
            summary TEXT NOT NULL,
            metrics JSONB,
            sent_at TIMESTAMP(3),
            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT NOW()
        )`);
    await db.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS ia_sin_respuesta (
            id TEXT PRIMARY KEY,
            "userId" TEXT NOT NULL,
            "grupoId" TEXT,
            pregunta TEXT NOT NULL,
            caso TEXT NOT NULL,
            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT NOW()
        )`);
}

async function sembrar() {
    await tablasDelBackend();

    for (const id of [MADRE, HIJA_A, HIJA_B, AJENA]) {
        await db.user.create({
            data: {
                id,
                email: `${id}@banco.test`,
                name: id,
                role: "user",
                ownerId: null,
            },
        });
    }

    // La familia: la madre vinculo a sus dos hijas BAJO la suya, asi que es la
    // raiz por votos (`laRaizQueManda`) y las dos hijas no lo son. De ahi sale,
    // sin ninguna condicion aparte, que una hija no vea ni a su madre ni a su
    // hermana.
    let n = 0;
    for (const hija of [HIJA_A, HIJA_B]) {
        await db.$executeRawUnsafe(
            `INSERT INTO "linked_accounts" ("id", "master_user_id", "linked_user_id")
             VALUES ($1, $2, $3)`,
            `la-${V}-${n++}`,
            MADRE,
            hija,
        );
    }

    const ahora = Date.now();

    for (const cuenta of [MADRE, HIJA_A, HIJA_B, AJENA]) {
        const cuantas = CUANTAS[cuenta];

        const sesiones = [];
        for (let i = 0; i < cuantas.sesiones; i++) {
            const s = await db.session.create({
                data: {
                    userId: cuenta,
                    remoteJid: `5730000${i}-${cuenta}@s.whatsapp.net`,
                    pushName: `Contacto ${i} de ${cuenta}`,
                    instanceId: `inst-${cuenta}`,
                    status: true,
                    leadStatus: "TIBIO",
                },
            });
            sesiones.push(s);
        }

        for (let i = 0; i < cuantas.registros; i++) {
            await db.registro.create({
                data: {
                    // En produccion lo rellena un disparador de la base; con
                    // `db push` no hay disparador, asi que se pone a mano.
                    userId: cuenta,
                    sessionId: sesiones[i % sesiones.length].id,
                    tipo: "PEDIDO",
                    fecha: new Date(ahora - i * 60_000),
                    resumen: `registro ${i} de ${cuenta}`,
                },
            });
        }

        for (let i = 0; i < cuantas.llamadas; i++) {
            await db.chatMessage.create({
                data: {
                    userId: cuenta,
                    instanceName: `inst-${cuenta}`,
                    remoteJid: `5730000${i}-${cuenta}@s.whatsapp.net`,
                    messageId: `call-${cuenta}-${i}`,
                    fromMe: true,
                    messageType: "call",
                    messageTimestamp: new Date(ahora - i * 60_000),
                    raw: { call: { direction: "outgoing", durationSecs: 30, status: "completed" } },
                },
            });
        }

        for (let i = 0; i < cuantas.informes; i++) {
            await db.$executeRawUnsafe(
                `INSERT INTO weekly_reports (id, "userId", period_start, period_end, summary, metrics, "createdAt")
                 VALUES ($1, $2, NOW(), NOW(), $3, '{}'::jsonb, NOW())`,
                `wr-${cuenta}-${i}`,
                cuenta,
                `informe ${i} de ${cuenta}`,
            );
        }

        for (let i = 0; i < cuantas.sinRespuesta; i++) {
            await db.$executeRawUnsafe(
                `INSERT INTO ia_sin_respuesta (id, "userId", "grupoId", pregunta, caso, "createdAt")
                 VALUES ($1, $2, $3, $4, 'dijo_que_no_sabia', NOW())`,
                `sr-${cuenta}-${i}`,
                cuenta,
                // El MISMO `grupoId` en dos cuentas a proposito: sin la cuenta
                // en la clave de agrupacion las dos se fundirian en una fila.
                `grupo-comun-${i}`,
                `pregunta ${i} de ${cuenta}`,
            );
        }
    }
}

async function limpiar() {
    await tablasDelBackend();
    const ids = [MADRE, HIJA_A, HIJA_B, AJENA];
    await db.$executeRawUnsafe(
        `DELETE FROM weekly_reports WHERE "userId" = ANY($1::text[])`, ids);
    await db.$executeRawUnsafe(
        `DELETE FROM ia_sin_respuesta WHERE "userId" = ANY($1::text[])`, ids);
    await db.$executeRawUnsafe(
        `DELETE FROM "linked_accounts" WHERE "master_user_id" = ANY($1::text[])
            OR "linked_user_id" = ANY($1::text[])`, ids);
    await db.chatMessage.deleteMany({ where: { userId: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
}

/* ────────────────────────────────────────────────────────────────────────────
 * Lo que habia ANTES, escrito literal: cada pantalla acotada a la cuenta con la
 * que se abre. No se deduce de nada — es la consulta que corria.
 * ──────────────────────────────────────────────────────────────────────────── */
async function comoSeMirabaAntes(propia) {
    const llamadas = await db.$queryRawUnsafe(
        `SELECT m."id" FROM "chat_messages" m
          WHERE m."userId" = $1 AND m."messageType" = 'call'`,
        propia,
    );
    const registros = await db.registro.count({ where: { userId: propia } });
    const informes = await db.$queryRawUnsafe(
        `SELECT id FROM weekly_reports WHERE "userId" = $1`,
        propia,
    );
    return { llamadas: llamadas.length, registros, informes: informes.length };
}

const total = (cuentas, campo) =>
    cuentas.reduce((suma, c) => suma + CUANTAS[c][campo], 0);

async function conLaBaseSembrada(hacer) {
    await limpiar();
    await sembrar();
    try {
        await hacer();
    } finally {
        await limpiar();
    }
}

test("la MADRE ve las llamadas de sus dos hijas, y ninguna de una cuenta ajena", async () => {
    await conLaBaseSembrada(async () => {
        ponerAQuienMira(quien(MADRE));

        if (ROTO) {
            const antes = await comoSeMirabaAntes(MADRE);
            // EL FALLO: acotada a la cuenta propia, la madre solo veia lo suyo
            // y habia que entrar cuenta por cuenta.
            assert.equal(antes.llamadas, CUANTAS[MADRE].llamadas);
            assert.notEqual(antes.llamadas, total(LA_FAMILIA, "llamadas"));
            return;
        }

        const alcanza = await lasCuentasQueConsultaElCrm(MADRE);
        assert.deepEqual([...alcanza].sort(), [...LA_FAMILIA].sort());

        const datos = await getCallsCrmData({ days: 30 });
        assert.equal(datos.calls.length, total(LA_FAMILIA, "llamadas"));

        const deCadaUna = new Set(datos.calls.map((c) => c.cuentaId));
        assert.deepEqual([...deCadaUna].sort(), [...LA_FAMILIA].sort());
        assert.ok(!deCadaUna.has(AJENA), "una cuenta de fuera de la familia no entra");
    });
});

test("una HIJA no ve nada de su madre ni de su hermana, ni escribiendo el parametro a mano", async (t) => {
    if (ROTO) return t.skip("el modo roto ya afirma su fallo");
    await conLaBaseSembrada(async () => {
        ponerAQuienMira(quien(HIJA_A));

        // Lo que llega del navegador no decide a que se llega: se re-resuelve.
        const pedidasAMano = await lasCuentasQueConsultaElCrm(HIJA_A, [MADRE, HIJA_B, HIJA_A]);
        assert.deepEqual(pedidasAMano, [HIJA_A]);

        const filtro = await resolverLasCuentasDelCrm(HIJA_A);
        assert.equal(filtro.puedeElegir, false, "una hija no consolida, asi que no ve el filtro");
        assert.deepEqual(filtro.elegidas, [HIJA_A]);

        const datos = await getCallsCrmData({ days: 30, cuentas: [MADRE, HIJA_B] });
        assert.equal(datos.calls.length, CUANTAS[HIJA_A].llamadas);
        assert.ok(
            datos.calls.every((c) => c.cuentaId === HIJA_A),
            "ni una fila de la madre ni de la hermana",
        );

        const lista = await getRegistrosByUserId(HIJA_A, 0, 50, undefined, undefined, [MADRE, HIJA_B]);
        assert.equal(lista.data.length, CUANTAS[HIJA_A].registros);

        const tablero = await getKanbanSessionsAction([MADRE, HIJA_B]);
        assert.equal(tablero.data.length, CUANTAS[HIJA_A].sesiones);

        const informes = await getWeeklyReports([MADRE, HIJA_B]);
        assert.equal(informes.data.length, CUANTAS[HIJA_A].informes);
    });
});

test("el filtro REDUCE a una sola cuenta, en las cinco pestanas", async (t) => {
    if (ROTO) return t.skip("el modo roto ya afirma su fallo");
    await conLaBaseSembrada(async () => {
        ponerAQuienMira(quien(MADRE));
        const soloUna = [HIJA_A];

        const llamadas = await getCallsCrmData({ days: 30, cuentas: soloUna });
        assert.equal(llamadas.calls.length, CUANTAS[HIJA_A].llamadas);
        assert.ok(llamadas.calls.every((c) => c.cuentaId === HIJA_A));

        const lista = await getRegistrosByUserId(MADRE, 0, 50, undefined, undefined, soloUna);
        assert.equal(lista.data.length, CUANTAS[HIJA_A].registros);
        assert.ok(lista.data.every((r) => r.userId === HIJA_A));

        const tablero = await getKanbanSessionsAction(soloUna);
        assert.equal(tablero.data.length, CUANTAS[HIJA_A].sesiones);
        assert.ok(tablero.data.every((c) => c.cuentaId === HIJA_A));

        const informes = await getWeeklyReports(soloUna);
        assert.equal(informes.data.length, CUANTAS[HIJA_A].informes);
        assert.ok(informes.data.every((r) => r.cuentaId === HIJA_A));

        const analitica = await getAnalyticsDataByUserId(MADRE, "30d", soloUna);
        assert.equal(analitica.data.sessions.total, CUANTAS[HIJA_A].sesiones);
    });
});

test("los TOTALES de Reportes cuadran con el filtro que este puesto", async (t) => {
    if (ROTO) return t.skip("el modo roto ya afirma su fallo");
    await conLaBaseSembrada(async () => {
        ponerAQuienMira(quien(MADRE));

        // Sin filtro: la familia entera, y el total es exactamente lo que la
        // lista enseña. Con una cifra calculada sobre otro conjunto, el total y
        // la lista se leen como dos datos que se contradicen.
        const todos = await getCrmDashboardStatsByUserId(MADRE);
        assert.equal(todos.data.totalRegistros, total(LA_FAMILIA, "registros"));

        const listaEntera = await getRegistrosByUserId(MADRE, 0, 200, undefined, undefined, null);
        assert.equal(listaEntera.data.length, todos.data.totalRegistros);

        // Y con el filtro puesto, los dos bajan a la vez.
        const unaSola = await getCrmDashboardStatsByUserId(MADRE, undefined, [HIJA_A]);
        assert.equal(unaSola.data.totalRegistros, CUANTAS[HIJA_A].registros);
        const listaUna = await getRegistrosByUserId(MADRE, 0, 200, undefined, undefined, [HIJA_A]);
        assert.equal(listaUna.data.length, unaSola.data.totalRegistros);

        // El informe de lo que la IA no supo, igual.
        const informe = await getInformeSinRespuesta({ userId: MADRE });
        assert.equal(informe.resumen.veces, total(LA_FAMILIA, "sinRespuesta"));
        const soloB = await getInformeSinRespuesta({ userId: MADRE, cuentas: [HIJA_B] });
        assert.equal(soloB.resumen.veces, CUANTAS[HIJA_B].sinRespuesta);

        // Y dos cuentas con el MISMO `grupoId` no se funden en una fila: la
        // cuenta entra en la clave, asi que el mismo hueco del entrenamiento en
        // dos lineas son dos grupos, cada uno con su cuenta.
        const deCadaUna = new Set(informe.grupos.map((g) => g.cuentaId));
        assert.deepEqual([...deCadaUna].sort(), [...LA_FAMILIA].sort());
        assert.equal(informe.grupos.length, total(LA_FAMILIA, "sinRespuesta"));

        const informes = await getWeeklyReports();
        assert.equal(informes.data.length, total(LA_FAMILIA, "informes"));
    });
});

test("una cuenta de FUERA de la familia ve solo lo suyo", async (t) => {
    if (ROTO) return t.skip("el modo roto ya afirma su fallo");
    await conLaBaseSembrada(async () => {
        ponerAQuienMira(quien(AJENA));

        const alcanza = await lasCuentasQueConsultaElCrm(AJENA, [MADRE, HIJA_A, HIJA_B]);
        assert.deepEqual(alcanza, [AJENA]);

        const llamadas = await getCallsCrmData({ days: 30, cuentas: [MADRE, HIJA_A] });
        assert.equal(llamadas.calls.length, CUANTAS[AJENA].llamadas);

        const stats = await getCrmDashboardStatsByUserId(AJENA, undefined, [MADRE]);
        assert.equal(stats.data.totalRegistros, CUANTAS[AJENA].registros);
    });
});

test("sin parametro, el tablero de /tags y /asesores sigue siendo el de SU cuenta", async (t) => {
    if (ROTO) return t.skip("el modo roto ya afirma su fallo");
    await conLaBaseSembrada(async () => {
        ponerAQuienMira(quien(MADRE));
        // Este tablero lo pintan TRES pantallas y solo la del CRM unifica:
        // llamarlo a secas tiene que devolver lo de siempre.
        const suyo = await getKanbanSessionsAction();
        assert.equal(suyo.data.length, CUANTAS[MADRE].sesiones);
        assert.ok(suyo.data.every((c) => c.cuentaId === MADRE));
    });
});

/* ────────────────────────────────────────────────────────────────────────────
 * Marcar el resultado de una llamada: se ESCRIBE con el mismo alcance con el
 * que se LEE. Antes la madre veía la llamada de su hija y no podía marcarla —la
 * acción buscaba la fila solo bajo las ids de su propia identidad— y por eso la
 * pantalla pintaba un «—» donde va «Marcar resultado».
 * ──────────────────────────────────────────────────────────────────────────── */
async function laLlamadaDe(cuenta) {
    const fila = await db.chatMessage.findFirst({
        where: { userId: cuenta, messageType: "call" },
        select: { id: true },
    });
    return String(fila.id);
}

async function elResultadoDe(id) {
    const fila = await db.chatMessage.findUnique({ where: { id: BigInt(id) }, select: { raw: true } });
    return fila?.raw?.call?.disposition ?? null;
}

test("marcar resultado: la MADRE marca la llamada de su hija; la hija no toca la de su madre", async () => {
    await conLaBaseSembrada(async () => {
        const deLaHija = await laLlamadaDe(HIJA_A);
        const deLaMadre = await laLlamadaDe(MADRE);
        const ajena = await laLlamadaDe(AJENA);

        if (ROTO) {
            // Lo que había, literal: solo las ids de la identidad de quien mira.
            const scopeIds = [MADRE];
            const fila = await db.chatMessage.findFirst({
                where: { id: BigInt(deLaHija), userId: { in: scopeIds }, messageType: "call" },
            });
            assert.equal(fila, null, "el roto no reproduce: la madre ya encontraba la llamada de la hija");
            return;
        }

        ponerAQuienMira(quien(MADRE));
        const r = await setCallDisposition(deLaHija, "link_enviado");
        assert.equal(r.success, true, r.message);
        assert.equal(await elResultadoDe(deLaHija), "link_enviado");

        // Una cuenta de fuera de la familia no, aunque se nombre su id.
        const fuera = await setCallDisposition(ajena, "link_enviado");
        assert.equal(fuera.success, false);
        assert.equal(await elResultadoDe(ajena), null);

        // Y hacia ARRIBA tampoco: la hija no marca la llamada de su madre.
        ponerAQuienMira(quien(HIJA_A));
        const arriba = await setCallDisposition(deLaMadre, "link_enviado");
        assert.equal(arriba.success, false);
        assert.equal(await elResultadoDe(deLaMadre), null);

        // Lo suyo sí.
        const propia = await setCallDisposition(deLaHija, "no_contesta");
        assert.equal(propia.success, true, propia.message);
    });
});
