/**
 * MENCIONAR A LA CUENTA MADRE desde una nota interna, contra Postgres y con
 * las acciones de VERDAD. Lo que un banco puro no puede decir:
 *
 * 1. Desde la hija, el selector ofrece a los administradores de SU madre —el
 *    dueño y quien tiene papel de administrador— por su nombre real; ni a un
 *    agente de la madre ni a nadie de una hermana.
 * 2. Mencionarlos les saca la ventana que interrumpe (`task_alerts`, tipo
 *    `mencion`) con la nota ENTERA dentro.
 * 3. Y no se abre nada: ni acceso por mención, ni campanita de colaboración,
 *    ni participantes, ni la hija llega a una conversación de la madre.
 * 4. La madre —la raíz— no tiene madre: no se le ofrece a nadie de más.
 *
 * `MODO=roto` corre `createInternalNoteAction` de `ANTES_REF` y AFIRMA el
 * fallo: la mención a un administrador de la madre se descartaba y no le
 * saltaba nada.
 */
import test from "node:test";
import assert from "node:assert/strict";

const ROTO = process.env.MODO === "roto";
const m = await import(
    ROTO
        ? "./.compilado/mencion-madre/entrada-de-la-mencion-a-la-madre-antes.js"
        : "./.compilado/mencion-madre/entrada-de-la-mencion-a-la-madre.js"
);
const { ponerAQuienMira, createInternalNoteAction, avisosPorSaltar, db } = m;

const V = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const MADRE = `mm-madre-${V}`;
const HIJA = `mm-hija-${V}`;
const HERMANA = `mm-hermana-${V}`;
const ADMIN_MADRE = `mm-admin-madre-${V}`;
const AGENTE_MADRE = `mm-agente-madre-${V}`;
const AGENTE_HIJA = `mm-agente-hija-${V}`;
const ADMIN_HIJA = `mm-admin-hija-${V}`;
const ADMIN_HERMANA = `mm-admin-hermana-${V}`;
const LINEA_HIJA = `LINEA_MM_HIJA_${V}`;
const LINEA_MADRE = `LINEA_MM_MADRE_${V}`;

function quien(id, extra = {}) {
    return {
        id, effectiveId: id, sessionUserId: id, ownerId: null, advisorRole: null,
        role: "user", rolDeLaPersona: "user", email: `${id}@banco.test`, name: id,
        canTakeUnassigned: false, ...extra,
    };
}
const NOMBRES = {};
const deLaCuenta = (id, cuenta, rol) =>
    quien(id, { ownerId: cuenta, advisorRole: rol, sessionUserId: id, name: NOMBRES[id] ?? id, nombreDeLaPersona: NOMBRES[id] ?? id });

const NOTA = [
    "@Ada Madre necesito que revises esto:",
    "1. El cliente pide un descuento especial.",
    "2. Dice que lo habló con alguien de la cuenta madre.",
    "3. Quiere respuesta hoy antes de las 5.",
    "4. Tiene tres pedidos abiertos con nosotros.",
    "Gracias. ".repeat(40).trim(),
].join("\n");

const S = {};

test.before(async () => {
    await db.$executeRawUnsafe(`ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMP(3)`);
    await db.$executeRawUnsafe(`ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMP(3)`);
    for (const [id, nombre] of [[MADRE, "Carlos Madre"], [HIJA, "Verzay Hija"], [HERMANA, "Verzay Hermana"]]) {
        await db.user.create({ data: { id, email: `${id}@banco.test`, name: nombre, company: nombre } });
    }
    for (const [id, nombre, cuenta, rol] of [
        [ADMIN_MADRE, "Ada Madre", MADRE, "administrador"],
        [AGENTE_MADRE, "Agustín Madre", MADRE, "agente"],
        [AGENTE_HIJA, "Hugo Hija", HIJA, "agente"],
        [ADMIN_HIJA, "Helena Hija", HIJA, "administrador"],
        [ADMIN_HERMANA, "Sara Hermana", HERMANA, "administrador"],
    ]) {
        NOMBRES[id] = nombre;
        await db.user.create({ data: { id, email: `${id}@banco.test`, name: nombre, ownerId: cuenta, advisorRole: rol } });
    }
    // La malla de producción: la madre vinculó a sus dos hijas, y la hija la
    // había vinculado a ella de vuelta.
    for (const [de, a] of [[MADRE, HIJA], [MADRE, HERMANA], [HIJA, MADRE]]) {
        await db.$executeRawUnsafe(
            `INSERT INTO "linked_accounts" ("id", "master_user_id", "linked_user_id") VALUES ($1, $2, $3)`,
            `la-${de}-${a}`, de, a,
        );
    }
    await db.instancia.create({ data: { instanceName: LINEA_HIJA, instanceId: LINEA_HIJA, userId: HIJA, instanceType: "Whatsapp" } });
    await db.instancia.create({ data: { instanceName: LINEA_MADRE, instanceId: LINEA_MADRE, userId: MADRE, instanceType: "Whatsapp" } });
    S.conv = (await db.session.create({
        data: { userId: HIJA, instanceId: LINEA_HIJA, remoteJid: `5731${V.slice(-6)}01@s.whatsapp.net`, pushName: "Cliente", status: true, assignedAdvisorId: AGENTE_HIJA },
        select: { id: true },
    })).id;
    S.deLaMadre = (await db.session.create({
        data: { userId: MADRE, instanceId: LINEA_MADRE, remoteJid: `5731${V.slice(-6)}02@s.whatsapp.net`, pushName: "Otro", status: true },
        select: { id: true },
    })).id;
});

async function accesosPorMencion(sessionId) {
    return db.$queryRawUnsafe(
        `SELECT "personaId" FROM "acceso_por_mencion" WHERE "sessionId" = $1`, sessionId,
    ).catch(() => []);
}

test("MODO=roto: la mención a un administrador de la madre se descartaba", { skip: !ROTO }, async () => {
    ponerAQuienMira(deLaCuenta(AGENTE_HIJA, HIJA, "agente"));
    const res = await createInternalNoteAction({ sessionId: S.conv, content: NOTA, mentionedUserIds: [ADMIN_MADRE] });
    assert.equal(res.success, true);
    assert.deepEqual(res.data.mentionedUserIds, [], "el fallo: no quedaba mencionada");
    assert.equal((await avisosPorSaltar(ADMIN_MADRE)).length, 0, "el fallo: no le saltaba nada");
});

test("desde la hija se ofrecen los administradores de SU madre, por su nombre", { skip: ROTO }, async () => {
    ponerAQuienMira(deLaCuenta(AGENTE_HIJA, HIJA, "agente"));
    const lista = await m.mencionablesDeLaMadreAction();
    assert.deepEqual(lista.map((a) => a.id).sort(), [ADMIN_MADRE, MADRE].sort());
    assert.deepEqual(lista.map((a) => a.name).sort(), ["Ada Madre", "Carlos Madre"]);
    assert.ok(lista.every((a) => a.cuentaId === MADRE && a.cuentaNombre === "Carlos Madre"));
    assert.ok(!lista.some((a) => a.id === AGENTE_MADRE), "un agente de la madre no manda");
    assert.ok(!lista.some((a) => a.id === ADMIN_HERMANA || a.id === HERMANA), "la hermana no es la madre");
});

test("la madre (la raíz) no tiene madre, aunque la hija la vinculara de vuelta", { skip: ROTO }, async () => {
    ponerAQuienMira(quien(MADRE));
    assert.deepEqual(await m.mencionablesDeLaMadreAction(), []);
    ponerAQuienMira(deLaCuenta(ADMIN_MADRE, MADRE, "administrador"));
    assert.deepEqual(await m.mencionablesDeLaMadreAction(), []);
});

test("mencionar al administrador de la madre le saca la ventana con la nota ENTERA", { skip: ROTO }, async () => {
    ponerAQuienMira(deLaCuenta(AGENTE_HIJA, HIJA, "agente"));
    const res = await createInternalNoteAction({
        sessionId: S.conv,
        content: NOTA,
        mentionedUserIds: [ADMIN_MADRE, ADMIN_HERMANA, AGENTE_MADRE],
    });
    assert.equal(res.success, true);
    assert.deepEqual(res.data.mentionedUserIds, [ADMIN_MADRE], "fuera la hermana y el agente de la madre");

    const avisos = await avisosPorSaltar(ADMIN_MADRE);
    assert.equal(avisos.length, 1);
    const [aviso] = avisos;
    assert.equal(aviso.tipo, "mencion", "la MISMA ventana de una mención del chat de equipo");
    assert.equal(aviso.texto, NOTA, "la nota entera, sin recortar");
    assert.equal(aviso.titulo, "Hugo Hija te mencionó en una nota interna de Verzay Hija");
    assert.ok(aviso.enlace.startsWith("/chats?jid="), "el clic lleva a la conversación");

    // A la hermana y al agente de la madre no les salta nada.
    assert.equal((await avisosPorSaltar(ADMIN_HERMANA)).length, 0);
    assert.equal((await avisosPorSaltar(AGENTE_MADRE)).length, 0);
});

test("y no se abre nada: ni acceso por mención, ni campanita, ni participantes", { skip: ROTO }, async () => {
    const filas = await accesosPorMencion(S.conv);
    assert.ok(!filas.some((f) => f.personaId === ADMIN_MADRE), "sin acceso por mención");
    assert.equal(await db.collabNotification.count({ where: { recipientId: ADMIN_MADRE } }), 0);
    assert.equal(await db.sessionParticipant.count({ where: { sessionId: S.conv } }), 0);
    const sesion = await db.session.findUnique({ where: { id: S.conv }, select: { assignedAdvisorId: true } });
    assert.equal(sesion.assignedAdvisorId, AGENTE_HIJA, "el dueño no cambia");
});

test("una hija sin enlace de vuelta sigue sin llegar a la madre, y ve a SU madre", { skip: ROTO }, async () => {
    // La hermana no vinculó a la madre de vuelta: es la hija «limpia».
    ponerAQuienMira(deLaCuenta(ADMIN_HERMANA, HERMANA, "administrador"));
    assert.deepEqual((await m.mencionablesDeLaMadreAction()).map((a) => a.id).sort(), [ADMIN_MADRE, MADRE].sort());
    const leer = await m.getInternalNotesBySessionAction(S.deLaMadre);
    assert.equal(leer.success, false, "mencionar no abre la madre a la hija");
    const escribir = await createInternalNoteAction({ sessionId: S.deLaMadre, content: "hola", mentionedUserIds: [] });
    assert.equal(escribir.success, false);
    // Y tampoco llega a la conversación de su hermana por haber podido mencionar.
    assert.equal((await m.getInternalNotesBySessionAction(S.conv)).success, false);
});

test("mencionar a la gente de la propia cuenta sigue igual", { skip: ROTO }, async () => {
    ponerAQuienMira(deLaCuenta(AGENTE_HIJA, HIJA, "agente"));
    const res = await createInternalNoteAction({ sessionId: S.conv, content: "@Helena Hija mira", mentionedUserIds: [ADMIN_HIJA] });
    assert.equal(res.success, true);
    assert.deepEqual(res.data.mentionedUserIds, [ADMIN_HIJA]);
    assert.equal(await db.collabNotification.count({ where: { recipientId: ADMIN_HIJA, sessionId: S.conv } }), 1);
    assert.equal((await avisosPorSaltar(ADMIN_HIJA)).length, 0, "el equipo va por su campanita, como siempre");
});

test.after(async () => {
    await db.$disconnect();
});
