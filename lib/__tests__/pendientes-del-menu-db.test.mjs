/**
 * El numerito del menú contra Postgres, con las ACCIONES de verdad, y la regla
 * que lo manda: **el número de cada apartado es la pastilla de su pantalla**.
 *
 * Se siembra el caso del reporte (27-09): una madre sin citas propias
 * pendientes y dos hijas con cuatro entre las dos —una ya pasada—, y una
 * cuenta cuyos únicos recordatorios son las plantillas de la Agenda
 * (`isSchedule`, hora `minutes-30` / `hours-2`). Se comprueba:
 *
 *  - Agenda: el menú dice lo mismo que la pastilla «Pendiente» del tablero
 *    abierto sin filtro (`getAppointmentStatusCounts` con las cuentas que
 *    resuelve la página), también para la hija, un agente y una ajena;
 *  - Multiagenda: lo mismo que su pastilla;
 *  - Recordatorios: lo mismo que la pastilla «Pendientes» y que la LISTA, que
 *    no enseña las plantillas.
 *
 * `MODO=roto` corre las consultas de ANTES escritas dentro, literales, sobre
 * las mismas filas y AFIRMA los dos fallos: la Agenda sin número con cuatro
 * pendientes en el tablero, y un 1 en Recordatorios con la lista vacía.
 */
import test from "node:test";
import assert from "node:assert/strict";

const ROTO = process.env.MODO === "roto";
const m = await import("./.compilado/pendientes-del-menu/entrada-de-pendientes-del-menu.js");
const { db } = m;
const V = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const MADRE = `pm-madre-${V}`, HIJA_A = `pm-hija-a-${V}`, HIJA_B = `pm-hija-b-${V}`, AJENA = `pm-ajena-${V}`, AGENTE = `pm-ag-${V}`;

const quien = (id, extra = {}) => ({
    id, effectiveId: extra.ownerId ?? id, sessionUserId: id, ownerId: null, advisorRole: null,
    role: "user", rolDeLaPersona: "user", email: `${id}@banco.test`, name: id, ...extra,
});
const en = (h) => new Date(Date.now() + h * 3_600_000);

test.before(async () => {
    for (const id of [MADRE, HIJA_A, HIJA_B, AJENA]) {
        await db.user.create({ data: { id, email: `${id}@banco.test`, name: id, company: id, role: "user" } });
    }
    await db.user.create({ data: { id: AGENTE, email: `${AGENTE}@banco.test`, name: "agente", ownerId: HIJA_A, advisorRole: "agente" } });
    let n = 0;
    for (const hija of [HIJA_A, HIJA_B]) {
        await db.$executeRawUnsafe(`INSERT INTO "linked_accounts" ("id","master_user_id","linked_user_id") VALUES ($1,$2,$3)`, `pm-${V}-${n++}`, MADRE, hija);
    }
    let k = 0;
    const ses = async (userId) => (await db.session.create({ data: { userId, remoteJid: `${userId}-${k++}@s.whatsapp.net`, pushName: "x", instanceId: "i", status: true } })).id;
    const cita = async (userId, status, inicio) => db.appointment.create({ data: { userId, sessionId: await ses(userId), status, startTime: inicio, endTime: new Date(inicio.getTime() + 1_800_000), timezone: "America/Bogota" } });
    // La madre: nada pendiente. Solo una confirmada.
    await cita(MADRE, "CONFIRMADA", en(5));
    // Las hijas: cuatro pendientes (una ya pasada, que el tablero también cuenta).
    await cita(HIJA_A, "PENDIENTE", en(14));
    await cita(HIJA_A, "PENDIENTE", en(15));
    await cita(HIJA_A, "PENDIENTE", en(-30));
    await cita(HIJA_B, "PENDIENTE", en(21));
    await cita(HIJA_B, "CANCELADA", en(3));
    // La ajena: dos que nadie de esta familia puede contar.
    await cita(AJENA, "PENDIENTE", en(2));
    await cita(AJENA, "PENDIENTE", en(3));

    const team = await db.team.create({ data: { userId: MADRE, name: "Equipo" } });
    const miembro = await db.teamMember.create({ data: { teamId: team.id, name: "Ana" } });
    const servicio = await db.teamService.create({ data: { teamId: team.id, name: "Corte", duration: 30 } });
    const reserva = (status, inicio) => db.bookingAppointment.create({ data: { teamId: team.id, teamMemberId: miembro.id, teamServiceId: servicio.id, clientName: "c", clientPhone: "1", startTime: inicio, endTime: new Date(inicio.getTime() + 1_800_000), timezone: "America/Bogota", status } });
    await reserva("PENDIENTE", en(3));
    await reserva("PENDIENTE", en(-1));
    await reserva("CANCELADA", en(3));

    const rec = (userId, extra) => db.reminders.create({ data: { title: "r", userId, ...extra } });
    // La madre: SOLO plantillas de la Agenda —lo que se ve en el reporte—.
    await rec(MADRE, { time: "minutes-30", isSchedule: true });
    await rec(MADRE, { time: "hours-2", isSchedule: true });
    // La hija A: dos de verdad pendientes, una plantilla, una campaña y una enviada.
    await rec(HIJA_A, { time: null });
    await rec(HIJA_A, { time: en(24 * 10).toISOString() });
    await rec(HIJA_A, { time: "minutes-30", isSchedule: true });
    await rec(HIJA_A, { time: null, isCampaign: true });
    await rec(HIJA_A, { time: null, sentAt: new Date() });
});

/** La pastilla «Pendiente» del tablero de Agenda, como la pide su pantalla. */
async function laPastillaDeAgenda(cuenta) {
    const cuentas = await m.resolverLasCuentasDelCrm(cuenta, undefined);
    const r = await m.getAppointmentStatusCounts(cuenta, cuentas.elegidas);
    assert.equal(r.success, true);
    return m.lasPendientesDelConteo(r.data);
}

/** La pastilla «Pendientes» de Recordatorios: lo que su LISTA enseña. */
async function laPastillaDeRecordatorios(cuenta) {
    const filas = await db.reminders.findMany({ where: { userId: cuenta, isCampaign: false } });
    return m.cuantosRecordatoriosPendientes(filas, new Date(), 300);
}

test("Agenda: el menú es la pastilla «Pendiente» del tablero, con TODAS sus cuentas", { skip: ROTO }, async () => {
    const casos = [
        [quien(MADRE), MADRE, 4, "la madre suma lo de sus hijas, pasadas incluidas, como su tablero"],
        [quien(HIJA_A), HIJA_A, 3, "la hija, lo suyo: ni su madre ni su hermana"],
        [quien(AGENTE, { ownerId: HIJA_A, advisorRole: "agente" }), HIJA_A, 3, "un agente, lo de su cuenta"],
        [quien(AJENA), AJENA, 2, "la ajena, lo suyo"],
    ];
    for (const [persona, cuenta, esperado, motivo] of casos) {
        m.ponerAQuienMira(persona);
        const menu = await m.pendientesDelMenuAction(["agenda"], 300);
        assert.equal(menu.success, true);
        const pastilla = await laPastillaDeAgenda(cuenta);
        assert.equal(menu.conteos.agenda, pastilla, `menú = pastilla (${motivo})`);
        assert.equal(menu.conteos.agenda, esperado, motivo);
    }
});

test("Multiagenda: el menú es la pastilla «Pendiente» de su tablero", { skip: ROTO }, async () => {
    m.ponerAQuienMira(quien(MADRE));
    const menu = await m.pendientesDelMenuAction(["multiagenda"], 300);
    const team = await db.team.findUnique({ where: { userId: MADRE } });
    const pastilla = await m.getBookingStatusCounts(team.id);
    assert.equal(menu.conteos.multiagenda, m.lasPendientesDelConteo(pastilla.data));
    assert.equal(menu.conteos.multiagenda, 2);
    m.ponerAQuienMira(quien(HIJA_B));
    assert.deepEqual((await m.pendientesDelMenuAction(["multiagenda"], 300)).conteos, { multiagenda: 0 }, "sin equipo es 0, no un error");
});

test("Recordatorios: el menú es la pastilla «Pendientes» y lo que su LISTA enseña", { skip: ROTO }, async () => {
    m.ponerAQuienMira(quien(MADRE));
    const madre = await m.pendientesDelMenuAction(["recordatorios"], 300);
    const listaMadre = (await db.reminders.findMany({ where: { userId: MADRE, isCampaign: false } })).filter(m.seVeEnLaListaDeRecordatorios);
    assert.equal(listaMadre.length, 0, "la lista de la madre está vacía: todo son plantillas de la Agenda");
    assert.equal(madre.conteos.recordatorios, 0, "con la lista vacía, el menú no pinta nada");
    assert.equal(madre.conteos.recordatorios, await laPastillaDeRecordatorios(MADRE));

    m.ponerAQuienMira(quien(HIJA_A));
    const hija = await m.pendientesDelMenuAction(["recordatorios"], 300);
    assert.equal(hija.conteos.recordatorios, 2, "las dos de verdad; ni la plantilla, ni la campaña, ni la enviada");
    assert.equal(hija.conteos.recordatorios, await laPastillaDeRecordatorios(HIJA_A));
});

test("solo se cuenta lo pedido, y sin sesión no se cuenta nada", { skip: ROTO }, async () => {
    m.ponerAQuienMira(quien(AJENA));
    assert.deepEqual((await m.pendientesDelMenuAction(["agenda", "cualquiera", 7], 300)).conteos, { agenda: 2 });
    m.ponerAQuienMira(null);
    assert.equal((await m.pendientesDelMenuAction(["agenda"], 300)).success, false);
});

test("ANTES: la Agenda sin número con 4 en el tablero, y un 1 en Recordatorios con la lista vacía", { skip: !ROTO }, async () => {
    // Las consultas de antes, literales.
    const ahora = new Date();
    const agendaDeAntes = await db.appointment.count({ where: { userId: MADRE, status: "PENDIENTE", startTime: { gte: ahora } } });
    assert.equal(agendaDeAntes, 0, "el menú no pintaba número");
    const tablero = await db.appointment.count({ where: { userId: { in: [MADRE, HIJA_A, HIJA_B] }, status: "PENDIENTE" } });
    assert.equal(tablero, 4, "…con la pastilla del tablero diciendo 4");

    const filas = await db.reminders.findMany({ where: { userId: MADRE, isCampaign: false }, select: { time: true, sentAt: true, repeatType: true } });
    const recordatoriosDeAntes = m.cuantosRecordatoriosPendientes(filas, ahora, 300);
    assert.equal(recordatoriosDeAntes, 1, "el menú decía 1 (la plantilla `minutes-30`)");
    const lista = await db.reminders.findMany({ where: { userId: MADRE, isCampaign: false, isSchedule: false } });
    assert.equal(lista.length, 0, "…sobre una lista que no enseña ninguno");
});
