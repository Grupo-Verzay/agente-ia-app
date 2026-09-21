/**
 * Los valores guardados siguen en la base, aunque la fila ya no los pinte.
 *
 * # Qué se quitó
 *
 * La fila de la lista de Chats llevaba dos selectores con icono de
 * interrogación —el **estado del cliente** (Activo / Inactivo / Sin clasificar)
 * y el **tipo de asistencia** (IA / Humana / Sin asignar)— y el menú de «⌄»
 * ofrecía sus cuatro filtros. Se fueron los seis.
 *
 * # Lo que este banco protege
 *
 * Que eso fue **solo de pantalla**. `Session.client_status` y
 * `Session.service_type` siguen existiendo, con sus valores intactos, y la
 * consulta que alimenta la bandeja los sigue devolviendo: el día que vuelvan a
 * hacer falta —o que alguien mire el CRM— el dato está.
 *
 * Y la otra mitad, que es la que de verdad puede romperse sin que nadie se
 * entere: **abrir Chats no los toca**. Se leen antes y después de llamar a la
 * consulta de la bandeja y tienen que valer exactamente lo mismo.
 *
 * `MODO=roto` reproduce lo que habría pasado con la lectura ablandada —el
 * mapeador devolviendo `null` porque «ya no se pinta»— y **afirma la pérdida**.
 * Sin ese modo, lo verde de al lado no diría si el dato de verdad sobrevive o
 * si el caso no se llega a ejercer.
 *
 * Se levanta con `scripts/banco-fila-de-chats.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
    ponerAQuienMira,
    getSesionesDeLaCuenta,
    db,
} from "./.compilado/fila/entrada-de-la-fila.js";

const ROTO = process.env.MODO === "roto";
const VUELTA = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/** Ids con el sello de la vuelta: la base se reutiliza entre ejecuciones. */
const CUENTA = `cuenta-fila-${VUELTA}`;
const LINEA = `LINEA_FILA_${VUELTA}`;

async function sembrar() {
    await db.user.create({
        data: {
            id: CUENTA,
            email: `fila-${VUELTA}@banco.test`,
            name: "Cuenta del banco de la fila",
            role: "user",
        },
    });
    await db.instancia.create({
        data: {
            userId: CUENTA,
            instanceName: LINEA,
            instanceId: `i-${VUELTA}`,
            instanceType: "waha",
        },
    });

    // Las tres combinaciones que los selectores sabían escribir, más la que
    // deja los dos en nulo: si al leer se perdiera alguna, el banco lo dice.
    const filas = [
        { jid: `5730011122${VUELTA.slice(-2)}@s.whatsapp.net`, clientStatus: "ACTIVO", serviceType: "IA" },
        { jid: `5730011133${VUELTA.slice(-2)}@s.whatsapp.net`, clientStatus: "INACTIVO", serviceType: "HUMANO" },
        { jid: `5730011144${VUELTA.slice(-2)}@s.whatsapp.net`, clientStatus: null, serviceType: null },
    ];
    for (const fila of filas) {
        await db.session.create({
            data: {
                userId: CUENTA,
                instanceId: `i-${VUELTA}`,
                remoteJid: fila.jid,
                pushName: "Contacto del banco",
                status: true,
                clientStatus: fila.clientStatus,
                serviceType: fila.serviceType,
            },
        });
    }
    return filas;
}

async function limpiar() {
    await db.session.deleteMany({ where: { userId: CUENTA } }).catch(() => undefined);
    await db.instancia.deleteMany({ where: { userId: CUENTA } }).catch(() => undefined);
    await db.user.deleteMany({ where: { id: CUENTA } }).catch(() => undefined);
}

/** Lo guardado, leído de la fila y sin pasar por ninguna capa de la App. */
async function loQueHayEnLaBase() {
    const filas = await db.session.findMany({
        where: { userId: CUENTA },
        select: { remoteJid: true, clientStatus: true, serviceType: true },
        orderBy: { remoteJid: "asc" },
    });
    return filas;
}

/**
 * La lectura ABLANDADA que el modo roto reproduce.
 *
 * Es lo que se habría escrito dando por hecho que «como ya no se pinta, no
 * hace falta traerlo»: la consulta sigue igual y el mapeador tira las dos
 * columnas. Desde fuera no se ve ningún error — se ve una pantalla igual y un
 * dato que desapareció.
 */
function comoSiSeHubieraAblandado(sesiones) {
    return sesiones.map((s) => ({ ...s, clientStatus: null, serviceType: null }));
}

test("los tres estados se guardan y se leen TAL CUAL de la base", async () => {
    await limpiar();
    const sembradas = await sembrar();
    try {
        const enLaBase = await loQueHayEnLaBase();
        assert.equal(enLaBase.length, 3, "las tres filas tienen que estar");

        for (const esperada of sembradas) {
            const fila = enLaBase.find((f) => f.remoteJid === esperada.jid);
            assert.ok(fila, `falta la fila ${esperada.jid}`);
            assert.equal(fila.clientStatus, esperada.clientStatus);
            assert.equal(fila.serviceType, esperada.serviceType);
        }
    } finally {
        await limpiar();
    }
});

test("la consulta de la bandeja SIGUE devolviendo los dos campos", async () => {
    await limpiar();
    const sembradas = await sembrar();
    ponerAQuienMira({ id: CUENTA, role: "user", ownerId: null, sessionUserId: CUENTA });
    try {
        const res = await getSesionesDeLaCuenta(CUENTA);
        assert.equal(res.success, true, res.message ?? "la consulta tiene que salir bien");

        const sesiones = ROTO ? comoSiSeHubieraAblandado(res.data ?? []) : res.data ?? [];
        const activa = sesiones.find((s) => s.remoteJid === sembradas[0].jid);
        assert.ok(activa, "la sesion sembrada tiene que venir en la bandeja");

        if (ROTO) {
            // EL FALLO: la bandeja devuelve la fila y el dato se ha perdido.
            assert.equal(activa.clientStatus, null, "ablandado: el estado se pierde");
            assert.equal(activa.serviceType, null, "ablandado: la asistencia se pierde");
            return;
        }

        assert.equal(activa.clientStatus, "ACTIVO");
        assert.equal(activa.serviceType, "IA");

        const inactiva = sesiones.find((s) => s.remoteJid === sembradas[1].jid);
        assert.equal(inactiva?.clientStatus, "INACTIVO");
        assert.equal(inactiva?.serviceType, "HUMANO");

        // Y «sin clasificar» tiene que seguir siendo nulo, no una cadena vacia:
        // son dos respuestas distintas y confundirlas es lo que hace que un
        // filtro de CRM deje de encontrar sus filas.
        const sinClasificar = sesiones.find((s) => s.remoteJid === sembradas[2].jid);
        assert.equal(sinClasificar?.clientStatus, null);
        assert.equal(sinClasificar?.serviceType, null);
    } finally {
        ponerAQuienMira(null);
        await limpiar();
    }
});

test("abrir la bandeja NO escribe en esas dos columnas", async (t) => {
    if (ROTO) return t.skip("el modo roto solo afirma la perdida de arriba");
    await limpiar();
    await sembrar();
    ponerAQuienMira({ id: CUENTA, role: "user", ownerId: null, sessionUserId: CUENTA });
    try {
        const antes = await loQueHayEnLaBase();
        await getSesionesDeLaCuenta(CUENTA);
        await getSesionesDeLaCuenta(CUENTA);
        const despues = await loQueHayEnLaBase();
        assert.deepEqual(despues, antes, "leer la bandeja no puede tocar el dato");
    } finally {
        ponerAQuienMira(null);
        await limpiar();
    }
});

test("las dos COLUMNAS siguen en el esquema, con su nombre de la base", async () => {
    // En SQL en crudo Prisma no traduce los `@map`, asi que el nombre se
    // comprueba contra el catalogo y no se deduce del campo.
    const filas = await db.$queryRaw`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'Session'
          AND column_name IN ('client_status', 'service_type')
    `;
    const nombres = filas.map((f) => f.column_name).sort();
    assert.deepEqual(nombres, ["client_status", "service_type"]);
});
