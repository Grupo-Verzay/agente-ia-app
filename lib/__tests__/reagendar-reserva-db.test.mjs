/**
 * Multiagenda igualada a Agenda, contra Postgres y por las ACCIONES de verdad.
 *
 * Una cuenta con su línea, su equipo (dos especialistas), un servicio, sus
 * plantillas de recordatorio de agenda, la conversación del cliente, y una
 * reserva con recordatorios ya programados como los deja la ruta del agente
 * (`booking-reminder-*`, el número en dígitos) más seguimientos que NO son
 * recordatorios de esta reserva y no se pueden tocar.
 *
 * Se comprueba lo mismo que en Agenda:
 *  - reagendar mueve la MISMA fila, conserva la duración y deja historial;
 *  - los recordatorios viejos se van y salen los nuevos desde la nueva hora;
 *  - no pisa otra reserva del especialista, no va al pasado; los huecos que se
 *    ofrecen no cuentan la propia reserva como ocupada;
 *  - cambiar el estado dispara las automatizaciones sobre la conversación del
 *    cliente, y cancelar quita los recordatorios;
 *  - el aviso al cliente sale por la línea de la cuenta, con el mensaje de
 *    Agenda; Finalizado no se avisa;
 *  - una cancelada reagendada vuelve a Pendiente con sus recordatorios;
 *  - una cuenta ajena no toca nada.
 *
 * `MODO=roto` corre las acciones de `ANTES_REF` y AFIRMA el fallo.
 * Se levanta con `scripts/banco-reagendar-reserva.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";

const ROTO = process.env.MODO === "roto";
const mod = ROTO
    ? await import("./.compilado/reagendar-reserva/entrada-de-reagendar-reserva-antes.js")
    : await import("./.compilado/reagendar-reserva/entrada-de-reagendar-reserva.js");
const { ponerAQuienMira, db } = mod;
const acciones = ROTO ? mod.antes : mod;

const llamadas = [];
globalThis.fetch = async (url, opts) => {
    llamadas.push({ url: String(url), body: String(opts?.body ?? "") });
    return new Response(JSON.stringify({ key: { id: `m-${llamadas.length}` } }), { status: 200, headers: { "Content-Type": "application/json" } });
};
const automatizaciones = () => llamadas.filter((l) => l.url.includes("/appt-automations/execute")).map((l) => JSON.parse(l.body));
const envios = () => llamadas.filter((l) => l.url.includes("/message/sendText/"));

const V = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const CUENTA = `rr-cuenta-${V}`;
const AJENA = `rr-ajena-${V}`;
const LINEA = `LINEA_RR_${V}`;
const SERVIDOR = `evo-rr-${V}.banco.test`;
const CLAVE = `clave-rr-${V}`;
const NUMERO = `57301${String(Date.now()).slice(-7)}`;
const JID = `${NUMERO}@s.whatsapp.net`;
const H = 3_600_000;
const DUR = 45;

function enDias(dias, hora = 15) {
    const d = new Date(Date.now() + dias * 86_400_000);
    d.setUTCHours(hora, 0, 0, 0);
    return d;
}
function quien(id) {
    return { id, effectiveId: id, sessionUserId: id, ownerId: null, advisorRole: null, role: "user", rolDeLaPersona: "user", email: `${id}@banco.test`, name: id };
}
const ids = {};
const ymd = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(d);

async function deLaReserva() {
    return db.seguimiento.findMany({ where: { instancia: LINEA, idNodo: { startsWith: "booking-" }, remoteJid: { in: [NUMERO, JID] } }, orderBy: { time: "asc" } });
}

test.before(async () => {
    for (const id of [CUENTA, AJENA]) {
        const ak = await db.apiKey.create({ data: { url: id === CUENTA ? SERVIDOR : `x-${V}`, key: id === CUENTA ? CLAVE : `k-${V}` } });
        await db.user.create({ data: { id, email: `${id}@banco.test`, name: id, company: id, role: "user", ownerId: null, apiKeyId: ak.id, timezone: "America/Bogota", meetingDuration: 60 } });
    }
    await db.instancia.create({ data: { userId: CUENTA, instanceName: LINEA, instanceId: `inst-${V}`, instanceType: "Whatsapp" } });
    const p24 = await db.reminders.create({ data: { title: "24h", description: "Hola @client_name, mañana tu cita de @service_name", time: "days-1", userId: CUENTA, isSchedule: true, isCampaign: false } });
    const p3 = await db.reminders.create({ data: { title: "3h", description: "Hola @client_name, en 3 horas", time: "hours-3", userId: CUENTA, isSchedule: true, isCampaign: false } });
    await db.reminders.create({ data: { title: "suelto", description: "suelto", time: "minutes-30", userId: CUENTA, isSchedule: false } });

    const team = await db.team.create({ data: { userId: CUENTA, name: "Equipo", timezone: "America/Bogota" } });
    const m1 = await db.teamMember.create({ data: { teamId: team.id, name: "Dra. Uno" } });
    const m2 = await db.teamMember.create({ data: { teamId: team.id, name: "Dr. Dos" } });
    for (const m of [m1, m2]) for (let d = 0; d < 7; d++) {
        await db.teamMemberAvailability.create({ data: { teamMemberId: m.id, dayOfWeek: d, startTime: "08:00", endTime: "18:00" } });
    }
    const svc = await db.teamService.create({ data: { teamId: team.id, name: "Limpieza", duration: DUR } });
    const sesion = await db.session.create({ data: { userId: CUENTA, remoteJid: JID, pushName: "Ana Pérez", instanceId: LINEA, status: true } });

    const inicio = enDias(2, 15);
    const reserva = await db.bookingAppointment.create({ data: { teamId: team.id, teamMemberId: m1.id, teamServiceId: svc.id, clientName: "Ana Pérez", clientPhone: NUMERO, startTime: inicio, endTime: new Date(inicio.getTime() + DUR * 60_000), timezone: "America/Bogota" } });
    const otra = await db.bookingAppointment.create({ data: { teamId: team.id, teamMemberId: m1.id, teamServiceId: svc.id, clientName: "Otra", clientPhone: "573009999999", startTime: enDias(3, 16), endTime: new Date(enDias(3, 16).getTime() + DUR * 60_000), timezone: "America/Bogota" } });
    Object.assign(ids, { team: team.id, m1: m1.id, m2: m2.id, svc: svc.id, sesion: sesion.id, reserva: reserva.id, otra: otra.id, inicio, p24: p24.id, p3: p3.id });

    // Como los deja la ruta del agente: el número como llegó, en dígitos.
    await db.seguimiento.create({ data: { idNodo: `booking-reminder-${p3.id}`, instancia: LINEA, remoteJid: NUMERO, mensaje: "viejo 3h", tipo: "text", time: new Date(inicio.getTime() - 3 * H).toISOString() } });
    await db.seguimiento.create({ data: { idNodo: `booking-reminder-${p24.id}`, instancia: LINEA, remoteJid: NUMERO, mensaje: "viejo 24h", tipo: "text", time: new Date(inicio.getTime() - 24 * H).toISOString() } });
    // Lo que NO es un recordatorio de esta reserva.
    await db.seguimiento.create({ data: { idNodo: "nodo-flujo", instancia: LINEA, remoteJid: NUMERO, mensaje: "flujo", tipo: "text", time: new Date(inicio.getTime() - 2 * H).toISOString() } });
    await db.seguimiento.create({ data: { idNodo: `booking-reminder-${p3.id}`, instancia: LINEA, remoteJid: "573009999999", mensaje: "de otro cliente", tipo: "text", time: new Date(inicio.getTime() - 3 * H).toISOString() } });
});

test.after(async () => {
    await db.$disconnect();
});

test(ROTO ? "ANTES: Multiagenda no tenía forma de reagendar" : "reagendar mueve la MISMA reserva, conserva su duración y deja su historial", async () => {
    ponerAQuienMira(quien(CUENTA));
    if (ROTO) {
        assert.equal(typeof acciones.reagendarReservaAction, "undefined");
        assert.equal(typeof acciones.datosParaReagendarReservaAction, "undefined");
        return;
    }
    const datos = await acciones.datosParaReagendarReservaAction(ids.reserva);
    assert.equal(datos.success, true, datos.message);
    assert.equal(datos.data.cuentaId, CUENTA);
    assert.equal(datos.data.duracionMinutos, DUR);
    assert.equal(datos.data.zona, "America/Bogota");
    assert.equal(datos.data.cliente, "Ana Pérez");

    const antes = await db.bookingAppointment.count({ where: { teamId: ids.team } });
    // La nueva hora sale de los huecos que ofrece el diálogo, como en la pantalla.
    const huecos = await acciones.huecosParaReagendarReservaAction(ids.reserva, ymd(enDias(5, 15)));
    assert.equal(huecos.success, true, huecos.message);
    assert.ok(huecos.data.length > 3, "hay huecos del especialista ese día");
    const nuevo = new Date(huecos.data[3].startTime);
    const fin = new Date(huecos.data[3].endTime);
    assert.equal(fin.getTime() - nuevo.getTime(), DUR * 60_000, "con la duración de la reserva");
    const res = await acciones.reagendarReservaAction(ids.reserva, nuevo.toISOString(), fin.toISOString());
    assert.equal(res.success, true, res.message);
    assert.equal(await db.bookingAppointment.count({ where: { teamId: ids.team } }), antes, "no se creó otra reserva");
    const fila = await db.bookingAppointment.findUnique({ where: { id: ids.reserva } });
    assert.equal(fila.startTime.toISOString(), nuevo.toISOString());
    assert.equal(fila.endTime.toISOString(), fin.toISOString());
    assert.equal(fila.status, "PENDIENTE");

    const historial = await db.auditLog.findMany({ where: { entityId: ids.reserva, action: "rescheduled" } });
    assert.equal(historial.length, 1);
    assert.equal(historial[0].entityType, "booking_appointment");
    assert.equal(historial[0].metadata.antes.startTime, ids.inicio.toISOString());
    ids.nuevo = nuevo;
});

test(ROTO ? "ANTES: los recordatorios de la hora vieja se quedaban" : "los recordatorios viejos se van y salen los nuevos desde la nueva hora", async () => {
    if (ROTO) {
        const quedan = await deLaReserva();
        assert.deepEqual(quedan.map((s) => s.mensaje).sort(), ["viejo 24h", "viejo 3h"]);
        return;
    }
    const todos = await db.seguimiento.findMany({ where: { instancia: LINEA } });
    const mensajes = todos.map((s) => s.mensaje);
    assert.ok(!mensajes.includes("viejo 3h") && !mensajes.includes("viejo 24h"), "los de la hora vieja se fueron");
    for (const queda of ["flujo", "de otro cliente"]) assert.ok(mensajes.includes(queda), `${queda} no es de esta reserva`);
    const nuevos = await deLaReserva();
    assert.deepEqual(nuevos.map((s) => [s.idNodo, s.time]), [
        [`booking-reminder-${ids.p24}`, new Date(ids.nuevo.getTime() - 24 * H).toISOString()],
        [`booking-reminder-${ids.p3}`, new Date(ids.nuevo.getTime() - 3 * H).toISOString()],
    ]);
    for (const s of nuevos) {
        assert.equal(s.remoteJid, NUMERO, "la misma forma del número con la que se creó");
        assert.equal(s.serverurl, `https://${SERVIDOR}`);
        assert.equal(s.apikey, CLAVE);
        assert.match(s.mensaje, /Ana Pérez/);
    }
    assert.match(nuevos[0].mensaje, /Limpieza/);
});

test("no pisa otra reserva del especialista, no va al pasado, y los huecos no cuentan la propia", async () => {
    if (ROTO) return;
    ponerAQuienMira(quien(CUENTA));
    const otra = await db.bookingAppointment.findUnique({ where: { id: ids.otra } });
    const pisa = await acciones.reagendarReservaAction(ids.reserva, otra.startTime.toISOString(), otra.endTime.toISOString());
    assert.equal(pisa.success, false);
    assert.match(pisa.message, /ya tiene una cita/);
    const pasada = await acciones.reagendarReservaAction(ids.reserva, new Date(Date.now() - H).toISOString(), new Date().toISOString());
    assert.equal(pasada.success, false);

    const suyos = await acciones.huecosParaReagendarReservaAction(ids.reserva, ymd(ids.nuevo));
    assert.equal(suyos.success, true, suyos.message);
    assert.ok(suyos.data.some((h) => h.startTime === ids.nuevo.toISOString()), "su propia hora se ofrece: no choca consigo misma");
    const deLaOtra = await acciones.huecosParaReagendarReservaAction(ids.reserva, ymd(otra.startTime));
    assert.ok(
        !deLaOtra.data.some((h) => new Date(h.startTime) < otra.endTime && new Date(h.endTime) > otra.startTime),
        "ningún hueco que pise otra reserva del especialista",
    );
    // La página pública sigue contando todas las reservas como ocupadas.
    const publica = await acciones.getAvailableBookingSlots(ids.m1, ymd(ids.nuevo), DUR, "America/Bogota");
    assert.ok(!publica.data.some((h) => h.startTime === ids.nuevo.toISOString()));
});

test(ROTO ? "ANTES: cambiar el estado no disparaba automatizaciones" : "cambiar el estado dispara las automatizaciones sobre la conversación del cliente", async () => {
    ponerAQuienMira(quien(CUENTA));
    llamadas.length = 0;
    const res = await acciones.updateBookingAppointmentStatus(ids.reserva, "CONFIRMADA");
    assert.equal(res.success, true, res.message);
    await new Promise((r) => setTimeout(r, 50));
    if (ROTO) {
        assert.equal(automatizaciones().length, 0);
        return;
    }
    assert.deepEqual(automatizaciones(), [{ sessionId: ids.sesion, apptStatus: "CONFIRMADA" }]);
    const log = await db.auditLog.findMany({ where: { entityId: ids.reserva, action: "status_changed" } });
    assert.equal(log.length, 1);
});

test(ROTO ? "ANTES: no había aviso al cliente" : "el aviso al cliente sale por la línea de la cuenta con el mensaje de Agenda", async () => {
    ponerAQuienMira(quien(CUENTA));
    if (ROTO) {
        assert.equal(typeof acciones.sendBookingStatusNotification, "undefined");
        return;
    }
    llamadas.length = 0;
    const res = await acciones.sendBookingStatusNotification(ids.reserva, "CONFIRMADA");
    assert.equal(res.success, true, res.message);
    assert.equal(res.instanceName, LINEA);
    const e = envios();
    assert.equal(e.length, 1);
    assert.ok(e[0].url.includes(`${SERVIDOR}/message/sendText/${LINEA}`), e[0].url);
    assert.match(e[0].body, new RegExp(NUMERO));
    assert.match(e[0].body, /CITA CONFIRMADA/);

    llamadas.length = 0;
    const fin = await acciones.sendBookingStatusNotification(ids.reserva, "FINALIZADO");
    assert.equal(fin.success, true);
    assert.equal(envios().length, 0, "Finalizado no se avisa, como en Agenda");
});

test(ROTO ? "ANTES: cancelar dejaba vivos sus recordatorios" : "cancelar quita los recordatorios, y reagendarla la vuelve a Pendiente con los suyos", async () => {
    ponerAQuienMira(quien(CUENTA));
    const res = await acciones.updateBookingAppointmentStatus(ids.reserva, "CANCELADA");
    assert.equal(res.success, true, res.message);
    if (ROTO) {
        assert.equal((await deLaReserva()).length, 2, "siguen ahí");
        return;
    }
    assert.equal((await deLaReserva()).length, 0);
    assert.ok((await db.seguimiento.findMany({ where: { instancia: LINEA, mensaje: "flujo" } })).length === 1, "el flujo se queda");

    llamadas.length = 0;
    const nuevo = enDias(6, 14);
    const r = await acciones.reagendarReservaAction(ids.reserva, nuevo.toISOString(), new Date(nuevo.getTime() + DUR * 60_000).toISOString());
    assert.equal(r.success, true, r.message);
    assert.equal(r.data.status, "PENDIENTE");
    assert.equal((await deLaReserva()).length, 2);
    await new Promise((x) => setTimeout(x, 50));
    assert.deepEqual(automatizaciones(), [{ sessionId: ids.sesion, apptStatus: "PENDIENTE" }]);
});

test("una cuenta ajena no toca nada", async () => {
    if (ROTO) return;
    ponerAQuienMira(quien(AJENA));
    const n = enDias(8);
    assert.equal((await acciones.reagendarReservaAction(ids.reserva, n.toISOString(), new Date(n.getTime() + H).toISOString())).message, "No autorizado.");
    assert.equal((await acciones.datosParaReagendarReservaAction(ids.reserva)).success, false);
    assert.equal((await acciones.huecosParaReagendarReservaAction(ids.reserva, "2030-01-01")).success, false);
    assert.equal((await acciones.updateBookingAppointmentStatus(ids.reserva, "ATENDIDA")).success, false);
    assert.equal((await acciones.sendBookingStatusNotification(ids.reserva, "CONFIRMADA")).success, false);
});
