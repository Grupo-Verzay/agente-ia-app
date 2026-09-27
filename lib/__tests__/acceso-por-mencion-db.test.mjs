/**
 * MENCIONAR A UN COMPAÑERO en Chats, contra Postgres y con las acciones de
 * VERDAD. Lo que un banco puro no puede decir:
 *
 * 1. Mencionar a un AGENTE en una nota le avisa y le abre ESA conversación,
 *    sin cambiarle el dueño ni tocar los participantes.
 * 2. A quien no es agente se le avisa y no se le abre nada (ya lo ve); a quien
 *    no es del equipo no se le avisa ni se le abre.
 * 3. El dueño de la conversación —la asesora que la lleva— se lo quita; otro
 *    agente no puede.
 * 4. Resolver se lo quita solo. Y aunque otro camino marque la resolución sin
 *    limpiar, la lectura ya no lo deja pasar.
 *
 * `MODO=roto` corre `createInternalNoteAction` y `resolveSession` de
 * `ANTES_REF` y AFIRMA el fallo: mencionar no abría nada y se avisaba a gente
 * de fuera del equipo.
 */
import test from "node:test";
import assert from "node:assert/strict";

const ROTO = process.env.MODO === "roto";
const m = await import(
    ROTO
        ? "./.compilado/mencion/entrada-de-la-mencion-antes.js"
        : "./.compilado/mencion/entrada-de-la-mencion.js"
);
const { ponerAQuienMira, createInternalNoteAction, resolveSession, db } = m;

const V = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const CUENTA = `men-cuenta-${V}`;
const DUENA = `men-duena-${V}`; // agente que lleva la conversación
const INVITADO = `men-invitado-${V}`; // agente al que mencionan
const OTRO = `men-otro-${V}`; // agente que no tiene nada que ver
const ADMIN = `men-admin-${V}`; // administradora del equipo
const AJENO = `men-ajeno-${V}`; // de otra cuenta
const LINEA = `LINEA_MEN_${V}`;

function quien(id, extra = {}) {
    return {
        id, effectiveId: id, sessionUserId: id, ownerId: null, advisorRole: null,
        role: "user", rolDeLaPersona: "user", email: `${id}@banco.test`, name: id,
        canTakeUnassigned: false, ...extra,
    };
}
/** Alguien del equipo: la fila efectiva es la de la cuenta; la persona, la suya. */
const delEquipo = (id, rol) => quien(id, { ownerId: CUENTA, advisorRole: rol, sessionUserId: id });

async function accesosEnLaBase(sessionId) {
    return db.$queryRawUnsafe(
        `SELECT "personaId" FROM "acceso_por_mencion" WHERE "sessionId" = $1 ORDER BY "personaId"`, sessionId,
    ).catch(() => null);
}
async function avisos(recipientId, sessionId) {
    return db.collabNotification.findMany({ where: { recipientId, sessionId } });
}

const S = {};

test.before(async () => {
    await db.$executeRawUnsafe(`ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMP(3)`);
    await db.$executeRawUnsafe(`ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMP(3)`);
    await db.user.create({ data: { id: CUENTA, email: `${CUENTA}@banco.test`, name: "La Cuenta" } });
    await db.user.create({ data: { id: AJENO, email: `${AJENO}@banco.test`, name: "Ajeno" } });
    for (const [id, nombre, rol] of [[DUENA, "Dora Dueña", "agente"], [INVITADO, "Iván Invitado", "agente"], [OTRO, "Otto Otro", "agente"], [ADMIN, "Ada Admin", "administrador"]]) {
        await db.user.create({ data: { id, email: `${id}@banco.test`, name: nombre, ownerId: CUENTA, advisorRole: rol } });
    }
    await db.instancia.create({ data: { instanceName: LINEA, instanceId: LINEA, userId: CUENTA, instanceType: "Whatsapp" } });
    const crear = async (sufijo) =>
        (await db.session.create({
            data: { userId: CUENTA, instanceId: LINEA, remoteJid: `5731${V.slice(-6)}${sufijo}@s.whatsapp.net`, pushName: "Cliente", status: true, assignedAdvisorId: DUENA },
            select: { id: true },
        })).id;
    S.conv = await crear("01");
    S.otra = await crear("02");
});

test("MODO=roto: mencionar no abría nada, y se avisaba a gente de fuera del equipo", { skip: !ROTO }, async () => {
    ponerAQuienMira(delEquipo(DUENA, "agente"));
    const res = await createInternalNoteAction({ sessionId: S.conv, content: "@Iván mira esto", mentionedUserIds: [INVITADO, AJENO] });
    assert.equal(res.success, true);
    const filas = await accesosEnLaBase(S.conv);
    assert.ok(filas === null || filas.length === 0, "el fallo: ningún acceso por mención");
    assert.equal((await avisos(AJENO, S.conv)).length, 1, "el fallo: se avisó a alguien de otra cuenta");
});

test("mencionar a un agente: aviso + acceso a ESA conversación, sin cambiar el dueño", { skip: ROTO }, async () => {
    ponerAQuienMira(delEquipo(DUENA, "agente"));
    const res = await createInternalNoteAction({
        sessionId: S.conv,
        content: "@Iván Invitado @Ada Admin mira el pedido",
        mentionedUserIds: [INVITADO, ADMIN, AJENO, DUENA],
    });
    assert.equal(res.success, true);
    assert.deepEqual(res.data.mentionedUserIds.sort(), [ADMIN, INVITADO].sort(), "fuera el ajeno y una misma");

    // El acceso: solo al agente. La admin ya lo ve todo.
    assert.deepEqual((await accesosEnLaBase(S.conv)).map((f) => f.personaId), [INVITADO]);

    // El aviso: a los dos del equipo, puntual y a su conversación; al ajeno, nada.
    assert.equal((await avisos(INVITADO, S.conv)).length, 1);
    assert.equal((await avisos(ADMIN, S.conv)).length, 1);
    assert.equal((await avisos(AJENO, S.conv)).length, 0);
    assert.equal((await avisos(INVITADO, S.conv))[0].type, "mention");

    // El dueño no cambió, y no se tocaron los participantes.
    const sesion = await db.session.findUnique({ where: { id: S.conv }, select: { assignedAdvisorId: true } });
    assert.equal(sesion.assignedAdvisorId, DUENA);
    assert.equal(await db.sessionParticipant.count({ where: { sessionId: S.conv } }), 0);
});

test("por qué ve cada uno la conversación", { skip: ROTO }, async () => {
    const motivo = async (persona) => {
        ponerAQuienMira(persona);
        return (await m.accesoALaConversacionAction(S.conv)).motivo;
    };
    assert.equal(await motivo(delEquipo(INVITADO, "agente")), "mencion");
    assert.equal(await motivo(delEquipo(DUENA, "agente")), "suya");
    assert.equal(await motivo(delEquipo(OTRO, "agente")), null, "a otro agente no se le abre");
    assert.equal(await motivo(delEquipo(ADMIN, "administrador")), "cuenta");
    assert.equal(await motivo(quien(CUENTA)), "cuenta");

    // Solo ESA conversación: la otra del mismo cliente sigue cerrada.
    ponerAQuienMira(delEquipo(INVITADO, "agente"));
    assert.equal((await m.accesoALaConversacionAction(S.otra)).motivo, null);

    const { otorgadoPorNombre } = await m.accesoALaConversacionAction(S.conv);
    assert.equal(otorgadoPorNombre, "Dora Dueña");

    // Alguien de otra cuenta ni siquiera alcanza la conversación.
    ponerAQuienMira(quien(AJENO));
    assert.equal((await m.accesoALaConversacionAction(S.conv)).motivo, null);
});

test("la ficha: quién entra por mención, y quién puede quitarlo", { skip: ROTO }, async () => {
    ponerAQuienMira(delEquipo(DUENA, "agente"));
    const deLaDuena = await m.accesosPorMencionAction(S.conv);
    assert.equal(deLaDuena.success, true);
    assert.deepEqual(deLaDuena.data.map((a) => [a.personaId, a.nombre, a.sePuedeQuitar]), [[INVITADO, "Iván Invitado", true]]);

    ponerAQuienMira(delEquipo(OTRO, "agente"));
    const delOtro = await m.accesosPorMencionAction(S.conv);
    assert.equal(delOtro.data[0].sePuedeQuitar, false);
    const intento = await m.quitarAccesoPorMencionAction(S.conv, INVITADO);
    assert.equal(intento.success, false, "otro agente no le cierra la puerta");
    assert.deepEqual((await accesosEnLaBase(S.conv)).map((f) => f.personaId), [INVITADO]);
});

test("el dueño se lo quita a mano, y volver a mencionar lo devuelve", { skip: ROTO }, async () => {
    ponerAQuienMira(delEquipo(DUENA, "agente"));
    const res = await m.quitarAccesoPorMencionAction(S.conv, INVITADO);
    assert.equal(res.success, true);
    assert.deepEqual(await accesosEnLaBase(S.conv), []);
    ponerAQuienMira(delEquipo(INVITADO, "agente"));
    assert.equal((await m.accesoALaConversacionAction(S.conv)).motivo, null);

    ponerAQuienMira(delEquipo(DUENA, "agente"));
    await createInternalNoteAction({ sessionId: S.conv, content: "@Iván otra vez", mentionedUserIds: [INVITADO] });
    ponerAQuienMira(delEquipo(INVITADO, "agente"));
    assert.equal((await m.accesoALaConversacionAction(S.conv)).motivo, "mencion");
});

test("resolver se lo quita solo, y a los participantes no los toca", { skip: ROTO }, async () => {
    ponerAQuienMira(quien(CUENTA));
    assert.equal((await m.addSessionParticipantAction(S.conv, OTRO)).success, true);

    ponerAQuienMira(delEquipo(DUENA, "agente"));
    assert.equal((await resolveSession(S.conv)).success, true);
    assert.deepEqual(await accesosEnLaBase(S.conv), [], "resolver borró el acceso");
    ponerAQuienMira(delEquipo(INVITADO, "agente"));
    assert.equal((await m.accesoALaConversacionAction(S.conv)).motivo, null);

    // El participante sigue: es otra cosa, y no caduca.
    ponerAQuienMira(delEquipo(OTRO, "agente"));
    assert.equal((await m.accesoALaConversacionAction(S.conv)).motivo, "participante");
});

test("aunque otro camino resuelva SIN limpiar, la lectura ya no deja pasar", { skip: ROTO }, async () => {
    ponerAQuienMira(delEquipo(DUENA, "agente"));
    await createInternalNoteAction({ sessionId: S.otra, content: "@Iván", mentionedUserIds: [INVITADO] });
    ponerAQuienMira(delEquipo(INVITADO, "agente"));
    assert.equal((await m.accesoALaConversacionAction(S.otra)).motivo, "mencion");

    // Una resolución escrita por otro camino (el backend, una macro vieja).
    await new Promise((r) => setTimeout(r, 20));
    await db.$executeRawUnsafe(`UPDATE "Session" SET resolved_at = NOW() WHERE id = $1`, S.otra);
    assert.equal((await m.accesoALaConversacionAction(S.otra)).motivo, null);
    ponerAQuienMira(delEquipo(DUENA, "agente"));
    assert.deepEqual((await m.accesosPorMencionAction(S.otra)).data, [], "la ficha tampoco lo enseña");

    // Mencionar después de resolver vuelve a abrir: la mención es posterior.
    await new Promise((r) => setTimeout(r, 20));
    await createInternalNoteAction({ sessionId: S.otra, content: "@Iván ayúdame a reabrirla", mentionedUserIds: [INVITADO] });
    ponerAQuienMira(delEquipo(INVITADO, "agente"));
    assert.equal((await m.accesoALaConversacionAction(S.otra)).motivo, "mencion");
});
