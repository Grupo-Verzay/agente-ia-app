/**
 * El aviso de un ticket, contra Postgres y por las ACCIONES de verdad.
 *
 * # Por qué no se prueba `avisarDelTicketNuevo` a solas
 *
 * Porque ese es el lado que **no tiene puerta**. Lo que hay que demostrar es
 * que los dos caminos por los que entra un ticket —la ficha pública y el
 * formulario de dentro— escriben el aviso, y que la lista sale de quién
 * alcanza el módulo de verdad: con sus `_UserModules`, su rol y sus cuentas
 * vinculadas, que son filas y no un parámetro.
 *
 * Lo ÚNICO que se finge es `currentUser()` —pide next-auth entero y no decide
 * nada de esto—, `revalidatePath` y el `cache()` de React.
 *
 * `MODO=roto` reproduce la forma INGENUA —avisar a todo el equipo sin mirar el
 * módulo ni el responsable— y **afirma los dos fallos**.
 *
 * Se levanta con `scripts/banco-avisos-de-ticket.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
    ponerAQuienMira,
    enviarTicketPublicoAction,
    abrirTicketAction,
    asegurarElEnlace,
    guardarElDestino,
    quienesAtiendenYLoVen,
    aDondeLleva,
    db,
} from "./.compilado/ticket/entrada-de-ticket.js";

const ROTO = process.env.MODO === "roto";
/** La base se reutiliza entre ejecuciones: los ids llevan el sello de la vuelta. */
const V = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const DESTINO = `destino-${V}`;
const ADMIN = `admin-${V}`;      // administrador del equipo de destino
const AGENTE = `agente-${V}`;    // agente del equipo de destino
const SIN_ACCESO = `sinmod-${V}`; // del equipo, restringido a otro módulo
const VINCULADA = `vinc-${V}`;   // cuenta vinculada a destino
const CLIENTE = `cliente-${V}`;  // quien abre el ticket desde dentro
const AJENO = `ajeno-${V}`;      // de otra cuenta: no atiende nada

const MOD_TICKETS = `mod-tickets-${V}`;
const MOD_CHATS = `mod-chats-${V}`;

async function sembrar() {
    await db.module.create({
        data: {
            id: MOD_TICKETS,
            label: "Tickets",
            route: "/tickets",
            icon: "LifeBuoy",
            adminOnly: false,
        },
    });
    await db.module.create({
        data: { id: MOD_CHATS, label: "Chats", route: "/chats", icon: "MessageSquare" },
    });

    const gente = [
        { id: DESTINO, ownerId: null, advisorRole: null },
        { id: ADMIN, ownerId: DESTINO, advisorRole: "administrador" },
        { id: AGENTE, ownerId: DESTINO, advisorRole: "agente" },
        { id: SIN_ACCESO, ownerId: DESTINO, advisorRole: "agente" },
        { id: VINCULADA, ownerId: null, advisorRole: null },
        { id: CLIENTE, ownerId: null, advisorRole: null },
        { id: AJENO, ownerId: null, advisorRole: null },
    ];
    for (const g of gente) {
        await db.user.create({
            data: {
                id: g.id,
                email: `${g.id}@banco.test`,
                name: g.id,
                role: "user",
                ownerId: g.ownerId,
                advisorRole: g.advisorRole,
            },
        });
    }

    // La cuenta vinculada: `linked_accounts` es de donde sale la mitad del
    // universo que atiende, igual que en `getTeamAdvisorInfos`.
    await db.$executeRawUnsafe(
        `INSERT INTO "linked_accounts" ("id", "master_user_id", "linked_user_id")
         VALUES ($1, $2, $3)`,
        `la-${V}`,
        DESTINO,
        VINCULADA,
    );

    // **El que NO tiene que recibir nada**: una fila en `_UserModules` es un
    // TOPE, así que restringido a Chats deja de alcanzar Tickets. Es el caso
    // realista —alguien del equipo con su menú recortado—, no un id inventado.
    await db.$executeRawUnsafe(
        `INSERT INTO "_UserModules" ("A", "B") VALUES ($1, $2)`,
        MOD_CHATS,
        SIN_ACCESO,
    );

    await guardarElDestino(DESTINO);
}

async function limpiar() {
    const ids = [DESTINO, ADMIN, AGENTE, SIN_ACCESO, VINCULADA, CLIENTE, AJENO];
    await db.$executeRawUnsafe(
        `DELETE FROM "task_alerts" WHERE "ownerId" = ANY($1::text[])`, ids,
    ).catch(() => undefined);
    await db.$executeRawUnsafe(
        `DELETE FROM "tickets_de_soporte" WHERE "destinoId" = ANY($1::text[])`, ids,
    ).catch(() => undefined);
    await db.$executeRawUnsafe(
        `DELETE FROM "tickets_enlace_publico" WHERE "cuentaId" = ANY($1::text[])`, ids,
    ).catch(() => undefined);
    await db.$executeRawUnsafe(
        `DELETE FROM "linked_accounts" WHERE "master_user_id" = ANY($1::text[])`, ids,
    ).catch(() => undefined);
    await db.$executeRawUnsafe(
        `DELETE FROM "_UserModules" WHERE "B" = ANY($1::text[])`, ids,
    ).catch(() => undefined);
    await db.user.deleteMany({ where: { id: { in: ids } } }).catch(() => undefined);
    await db.module.deleteMany({ where: { id: { in: [MOD_TICKETS, MOD_CHATS] } } })
        .catch(() => undefined);
}

/** Los avisos que se escribieron para un ticket, leídos de la tabla. */
async function losAvisosDe(ticketId) {
    return await db.$queryRawUnsafe(
        `SELECT "destinatarioId", "tipo", "titulo", "texto", "enlace", "taskId", "projectId"
         FROM "task_alerts" WHERE "enlace" = $1 ORDER BY "destinatarioId" ASC`,
        `/tickets?ticket=${ticketId}`,
    );
}

/**
 * La forma INGENUA: todo el equipo, sin mirar el módulo ni el responsable.
 * El modo roto la ejecuta contra la MISMA semilla para afirmar sus dos fallos.
 */
async function comoSiFueraIngenuo() {
    const filas = await db.$queryRawUnsafe(
        `SELECT u."id" FROM "User" u WHERE u."id" = $1
         UNION SELECT u."id" FROM "User" u WHERE u."owner_id" = $1
         UNION SELECT la."linked_user_id" FROM "linked_accounts" la
               WHERE la."master_user_id" = $1`,
        DESTINO,
    );
    return filas.map((f) => f.id).sort();
}

test("quien ATIENDE y lo VE: el modulo decide, y `_UserModules` es un TOPE", async () => {
    await limpiar();
    await sembrar();
    try {
        if (ROTO) {
            const ingenuo = await comoSiFueraIngenuo();
            // EL FALLO: sin mirar el módulo, entra quien tiene el menú recortado.
            assert.ok(ingenuo.includes(SIN_ACCESO), "ingenuo: entra quien no lo ve");
            return;
        }

        const ven = (await quienesAtiendenYLoVen(DESTINO)).sort();
        // La cuenta de destino entra: su fila no cuelga de nadie, así que
        // `owner_id = destino` no la devuelve — es el agujero que ya costó una
        // vuelta en los directos del chat de equipo.
        assert.deepEqual(ven, [ADMIN, AGENTE, DESTINO, VINCULADA].sort());
        assert.ok(!ven.includes(SIN_ACCESO), "quien no alcanza el modulo no atiende");
        assert.ok(!ven.includes(AJENO), "quien no es de la cuenta no atiende");
    } finally {
        await limpiar();
    }
});

test("ticket NUEVO por el enlace publico: salta a todos, y NO al que no lo ve", async () => {
    await limpiar();
    await sembrar();
    try {
        const enlace = await asegurarElEnlace(DESTINO);
        const res = await enviarTicketPublicoAction({
            codigo: enlace.codigo,
            nombre: "Marta",
            indicativo: "+57",
            telefono: "3001234567",
            titulo: "No me carga el panel",
            descripcion: "Desde ayer no abre.",
            adjuntos: [],
        });
        assert.equal(res.success, true, res.message);

        const avisos = await losAvisosDe(res.data.id);
        const aQuien = avisos.map((a) => a.destinatarioId).sort();

        if (ROTO) {
            const ingenuo = await comoSiFueraIngenuo();
            assert.ok(ingenuo.includes(SIN_ACCESO), "ingenuo: avisa a quien no lo ve");
            return;
        }

        assert.deepEqual(aQuien, [ADMIN, AGENTE, DESTINO, VINCULADA].sort());
        assert.ok(!aQuien.includes(SIN_ACCESO), "no recibe quien no alcanza el modulo");

        // Y es la MISMA tubería de una mención: sin tarea y con su tipo.
        const uno = avisos[0];
        assert.equal(uno.tipo, "ticket");
        assert.equal(uno.taskId, null, "un ticket NO cuelga de ninguna tarea");
        assert.equal(uno.projectId, null);
        assert.equal(uno.titulo, "Marta abrió un ticket de soporte");
        assert.equal(uno.texto, "No me carga el panel");
    } finally {
        await limpiar();
    }
});

test("al pulsar el aviso se abre ESE ticket", async (t) => {
    if (ROTO) return t.skip("el modo roto ya afirma sus dos fallos");
    await limpiar();
    await sembrar();
    try {
        const enlace = await asegurarElEnlace(DESTINO);
        const res = await enviarTicketPublicoAction({
            codigo: enlace.codigo,
            nombre: "Marta",
            indicativo: "+57",
            telefono: "3001234567",
            titulo: "Otro más",
            descripcion: "Texto.",
            adjuntos: [],
        });
        assert.equal(res.success, true, res.message);

        const [aviso] = await losAvisosDe(res.data.id);
        assert.ok(aviso, "tiene que haberse escrito el aviso");
        // Lo calcula la MISMA función que usa la ventana emergente. Sin el
        // `enlace`, un aviso sin tarea aterriza en `/chat-equipo` — el respaldo
        // del chat—, y ahí no hay nada que leer.
        assert.equal(aDondeLleva(aviso), `/tickets?ticket=${res.data.id}`);
    } finally {
        await limpiar();
    }
});

test("ticket YA asignado: el aviso es SOLO de su responsable", async () => {
    await limpiar();
    await sembrar();
    ponerAQuienMira({ id: CLIENTE, role: "user", ownerId: null, sessionUserId: CLIENTE });
    try {
        const res = await abrirTicketAction({
            titulo: "Con responsable",
            descripcion: "Que lo vea solo quien lo atiende.",
            whatsapp: "3001234567",
            adjuntos: [],
            responsableId: AGENTE,
        });
        assert.equal(res.success, true, res.message);

        const aQuien = (await losAvisosDe(res.data.id))
            .map((a) => a.destinatarioId)
            .sort();

        if (ROTO) {
            const ingenuo = await comoSiFueraIngenuo();
            // EL SEGUNDO FALLO: el ticket tiene dueño y despierta al equipo entero.
            assert.ok(ingenuo.length > 1, "ingenuo: avisa a todos con responsable puesto");
            return;
        }

        assert.deepEqual(aQuien, [AGENTE]);
    } finally {
        ponerAQuienMira(null);
        await limpiar();
    }
});

test("desde dentro y sin responsable: a todos, y NUNCA a quien lo abrio", async (t) => {
    if (ROTO) return t.skip("el modo roto ya afirma sus dos fallos");
    await limpiar();
    await sembrar();
    // La cuenta VINCULADA atiende los tickets —está en `linked_accounts`— y a
    // la vez puede abrir los suyos, que es el caso que hace falta aquí: quien
    // lo teclea está dentro de la lista a la que se avisa, así que se tiene que
    // ver que **se descuenta a sí misma**.
    ponerAQuienMira({ id: VINCULADA, role: "user", ownerId: null, sessionUserId: VINCULADA });
    try {
        const res = await abrirTicketAction({
            titulo: "Lo registro yo",
            descripcion: "Me escribió por WhatsApp.",
            whatsapp: "3001234567",
            adjuntos: [],
        });
        assert.equal(res.success, true, res.message);

        const aQuien = (await losAvisosDe(res.data.id))
            .map((a) => a.destinatarioId)
            .sort();
        assert.deepEqual(aQuien, [ADMIN, AGENTE, DESTINO].sort());
        assert.ok(!aQuien.includes(VINCULADA),
            "a uno mismo no se le avisa de lo que acaba de hacer");
        assert.ok(!aQuien.includes(SIN_ACCESO));
    } finally {
        ponerAQuienMira(null);
        await limpiar();
    }
});

test("un responsable que NO es del equipo que atiende se RECHAZA", async (t) => {
    if (ROTO) return t.skip("el modo roto ya afirma sus dos fallos");
    await limpiar();
    await sembrar();
    ponerAQuienMira({ id: CLIENTE, role: "user", ownerId: null, sessionUserId: CLIENTE });
    try {
        const res = await abrirTicketAction({
            titulo: "Con un responsable de fuera",
            descripcion: "No tiene que dejar.",
            whatsapp: "3001234567",
            adjuntos: [],
            responsableId: AJENO,
        });
        assert.equal(res.success, false);
        // Y es la MISMA lista con la que se avisa: a quien se puede asignar un
        // ticket es a quien le llega su aviso. Con dos universos se asigna a
        // alguien que nunca recibió nada y nadie sabe por qué.
        assert.match(res.message, /equipo que atiende/i);
    } finally {
        ponerAQuienMira(null);
        await limpiar();
    }
});

test("el aviso NO puede tumbar el ticket", async (t) => {
    if (ROTO) return t.skip("el modo roto ya afirma sus dos fallos");
    await limpiar();
    await sembrar();
    try {
        // Sin la tabla de avisos debajo, el ticket tiene que entrar igual: el
        // ticket ya está guardado cuando se avisa, y un fallo del aviso no
        // puede deshacerlo. La tabla se recupera sola en la vuelta siguiente,
        // porque el recuerdo de «ya la creé» es del proceso.
        await db.$executeRawUnsafe(`DROP TABLE IF EXISTS "task_alerts"`);

        const enlace = await asegurarElEnlace(DESTINO);
        const res = await enviarTicketPublicoAction({
            codigo: enlace.codigo,
            nombre: "Marta",
            indicativo: "+57",
            telefono: "3001234567",
            titulo: "Sin tabla de avisos",
            descripcion: "El ticket entra igual.",
            adjuntos: [],
        });
        assert.equal(res.success, true, res.message);

        const filas = await db.$queryRawUnsafe(
            `SELECT "id" FROM "tickets_de_soporte" WHERE "id" = $1`, res.data.id,
        );
        assert.equal(filas.length, 1, "el ticket se guarda aunque el aviso no salga");
    } finally {
        await limpiar();
    }
});
