/**
 * La fuga de Llamadas: un administrador de una cuenta INTERMEDIA veía las
 * llamadas de la cuenta que está POR ENCIMA de la suya.
 *
 * Es el caso de producción, con sus nombres: Carlos Arcos (superadministrador)
 * arriba, Verzay | Atencion colgando de él, Verzay Ventas colgando de las dos,
 * y Yair —administrador de Atencion por `owner_id`— desde su propia sesión.
 * `linked_accounts` se siembra como MALLA, con los enlaces de vuelta que esa
 * tabla ha tenido: son justo los que le daban a Atencion el recuento de la raíz.
 *
 * Se ejercen las ACCIONES de verdad (`getCallsCrmData` y la puerta común de las
 * cinco pestañas); lo único fingido es `currentUser()`.
 *
 * `MODO=roto` lleva la regla VIEJA escrita dentro —la raíz por votos ve el
 * componente entero— y afirma que con ella Yair ve las llamadas de Carlos.
 *
 * Se levanta con `scripts/banco-crm-de-la-familia.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
    ponerAQuienMira,
    lasCuentasQueConsultaElCrm,
    resolverLasCuentasDelCrm,
    getCallsCrmData,
    db,
} from "./.compilado/crm/entrada-del-crm.js";

const ROTO = process.env.MODO === "roto";
const V = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

// Los prefijos reproducen el ORDEN de los ids de producción: Atencion empieza
// por dígito y gana los empates del recuento; Carlos, por letra.
const ATENCION = `3-atencion-${V}`;
const CARLOS = `c-carlos-${V}`;
const VENTAS = `c-ventas-${V}`;
const NOTIF = `f-notif-${V}`;
const AJENA = `z-ajena-${V}`;
const YAIR = `y-yair-${V}`;
const AGENTE = `y-agente-${V}`;

const CUENTAS = [CARLOS, ATENCION, VENTAS, NOTIF, AJENA];
const LLAMADAS = { [CARLOS]: 5, [ATENCION]: 3, [VENTAS]: 4, [NOTIF]: 2, [AJENA]: 6 };

const MALLA = [
    [CARLOS, ATENCION],
    [CARLOS, VENTAS],
    [CARLOS, NOTIF],
    [ATENCION, VENTAS],
    [ATENCION, CARLOS], // de vuelta
    [ATENCION, NOTIF], // entre hermanas
];

function cuenta(id, role = "admin") {
    return {
        id, effectiveId: id, sessionUserId: id, ownerId: null, advisorRole: null,
        role, rolDeLaPersona: role, porImpersonacion: false, name: id,
    };
}

/** Yair: su fila cuelga de Atencion por `owner_id`, como en producción. */
function persona(id, advisorRole) {
    return {
        id, effectiveId: ATENCION, sessionUserId: id, ownerId: ATENCION,
        advisorRole, role: "user", rolDeLaPersona: "user", rolDeLaCuenta: "admin",
        porImpersonacion: false, name: id,
    };
}

async function limpiar() {
    const ids = [...CUENTAS, YAIR, AGENTE];
    await db.$executeRawUnsafe(
        `DELETE FROM "linked_accounts" WHERE "master_user_id" = ANY($1::text[])
            OR "linked_user_id" = ANY($1::text[])`, ids);
    await db.chatMessage.deleteMany({ where: { userId: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: [YAIR, AGENTE] } } });
    await db.user.deleteMany({ where: { id: { in: CUENTAS } } });
}

async function sembrar() {
    for (const id of CUENTAS) {
        await db.user.create({
            data: { id, email: `${id}@banco.test`, name: id, role: id === CARLOS ? "super_admin" : "admin" },
        });
    }
    for (const [id, rol] of [[YAIR, "administrador"], [AGENTE, "agente"]]) {
        await db.user.create({
            data: { id, email: `${id}@banco.test`, name: id, role: "user", ownerId: ATENCION, advisorRole: rol },
        });
    }
    let n = 0;
    for (const [de, a] of MALLA) {
        await db.$executeRawUnsafe(
            `INSERT INTO "linked_accounts" ("id", "master_user_id", "linked_user_id") VALUES ($1, $2, $3)`,
            `alc-${V}-${n++}`, de, a,
        );
    }
    const ahora = Date.now();
    for (const c of CUENTAS) {
        for (let i = 0; i < LLAMADAS[c]; i++) {
            await db.chatMessage.create({
                data: {
                    userId: c, instanceName: `inst-${c}`,
                    remoteJid: `5731${i}-${c}@s.whatsapp.net`, messageId: `alc-call-${c}-${i}`,
                    fromMe: true, messageType: "call",
                    messageTimestamp: new Date(ahora - i * 60_000),
                    raw: { call: { direction: "outgoing", durationSecs: 20 } },
                },
            });
        }
    }
}

async function conLaBase(hacer) {
    await limpiar();
    await sembrar();
    try { await hacer(); } finally { await limpiar(); }
}

/** De qué cuentas vienen las llamadas que devuelve la acción. */
async function deQuienSon() {
    const datos = await getCallsCrmData({ days: 30 });
    return new Set(datos.calls.map((c) => c.cuentaId));
}

/** La regla VIEJA, literal: la raíz por votos ve el componente entero. */
async function lasCuentasDeAntes(propia) {
    const enlaces = await db.$queryRawUnsafe(
        `SELECT "master_user_id" AS de, "linked_user_id" AS a FROM "linked_accounts"
          WHERE "master_user_id" = ANY($1::text[])`, CUENTAS);
    const familia = [CARLOS, ATENCION, VENTAS, NOTIF];
    const votos = new Map(familia.map((c) => [c, 0]));
    for (const { de } of enlaces) votos.set(de, (votos.get(de) ?? 0) + 1);
    const orden = [...familia].sort();
    let raiz = orden[0];
    for (const c of orden) if (votos.get(c) > votos.get(raiz)) raiz = c;
    return raiz === propia ? familia : [propia];
}

test("Yair (admin de Atencion) NO ve las llamadas de Carlos, que está por encima", async () => {
    await conLaBase(async () => {
        if (ROTO) {
            // EL FALLO: Atencion gana el recuento y su administrador ve hacia
            // arriba — las llamadas de Carlos incluidas.
            const antes = await lasCuentasDeAntes(ATENCION);
            assert.ok(antes.includes(CARLOS), "con la regla vieja, Yair alcanzaba a Carlos");
            return;
        }
        ponerAQuienMira(persona(YAIR, "administrador"));
        const de = await deQuienSon();
        assert.ok(!de.has(CARLOS), "Yair no puede ver llamadas de Carlos");
        assert.ok(!de.has(AJENA));
        assert.ok(de.has(ATENCION), "lo suyo");
        assert.ok(de.has(VENTAS), "y lo de su hija");
        // Notif cuelga de Atencion por su enlace directo, no a través de Carlos.
        assert.ok(de.has(NOTIF));
    });
});

test("pedir a Carlos a mano en el parámetro tampoco lo trae", async (t) => {
    if (ROTO) return t.skip("el modo roto ya afirma su fallo");
    await conLaBase(async () => {
        ponerAQuienMira(persona(YAIR, "administrador"));
        const elegidas = await lasCuentasQueConsultaElCrm(ATENCION, [CARLOS]);
        assert.ok(!elegidas.includes(CARLOS));
        const datos = await getCallsCrmData({ days: 30, cuentas: [CARLOS] });
        assert.ok(!datos.calls.some((c) => c.cuentaId === CARLOS));
        const { disponibles } = await resolverLasCuentasDelCrm(ATENCION);
        assert.ok(!disponibles.some((c) => c.id === CARLOS), "Carlos ni se ofrece en el filtro");
    });
});

test("Carlos, superadministrador, ve las llamadas de todas las de su familia", async (t) => {
    if (ROTO) return t.skip("el modo roto ya afirma su fallo");
    await conLaBase(async () => {
        ponerAQuienMira(cuenta(CARLOS, "super_admin"));
        const de = await deQuienSon();
        for (const c of [CARLOS, ATENCION, VENTAS, NOTIF]) assert.ok(de.has(c), `Carlos ve ${c}`);
        assert.ok(!de.has(AJENA), "la cuenta de fuera de la familia no");
        const datos = await getCallsCrmData({ days: 30 });
        assert.equal(datos.calls.length, 5 + 3 + 4 + 2);
    });
});

test("Ventas, una hoja, solo ve lo suyo", async (t) => {
    if (ROTO) return t.skip("el modo roto ya afirma su fallo");
    await conLaBase(async () => {
        ponerAQuienMira(cuenta(VENTAS));
        const de = await deQuienSon();
        assert.deepEqual([...de], [VENTAS]);
    });
});

test("un AGENTE de Atencion sigue viendo solo Atencion", async (t) => {
    if (ROTO) return t.skip("el modo roto ya afirma su fallo");
    await conLaBase(async () => {
        ponerAQuienMira(persona(AGENTE, "agente"));
        const de = await deQuienSon();
        assert.ok(!de.has(CARLOS) && !de.has(VENTAS));
        assert.ok(de.has(ATENCION));
    });
});
