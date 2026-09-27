/**
 * El contador del menú contra Postgres, con la ACCIÓN de verdad: la cuenta
 * sale de la sesión, cada contador cuenta lo suyo, y nadie cuenta lo de otra
 * cuenta.
 */
import test from "node:test";
import assert from "node:assert/strict";

const ROTO = process.env.MODO === "roto";
const m = await import("./.compilado/pendientes-del-menu/entrada-de-pendientes-del-menu.js");
const { db } = m;
const sello = Date.now().toString(36);
const A = `pm-a-${sello}`, B = `pm-b-${sello}`, AGENTE = `pm-ag-${sello}`;

test("Agenda, Multiagenda y Recordatorios: sus pendientes, de SU cuenta", { skip: ROTO }, async () => {
    for (const id of [A, B]) await db.user.create({ data: { id, email: `${id}@x.com`, name: id } });
    await db.user.create({ data: { id: AGENTE, email: `${AGENTE}@x.com`, name: "agente", ownerId: A } });
    const ses = async (userId) => (await db.session.create({ data: { userId, remoteJid: `${userId}@s.whatsapp.net`, pushName: "x", instanceId: "i", status: true } })).id;
    const sa = await ses(A), sb = await ses(B);
    const en = (h) => new Date(Date.now() + h * 3_600_000);
    const cita = (userId, sessionId, status, inicio) => db.appointment.create({ data: { userId, sessionId, status, startTime: inicio, endTime: new Date(inicio.getTime() + 1_800_000), timezone: "America/Bogota" } });
    await cita(A, sa, "PENDIENTE", en(2));
    await cita(A, sa, "PENDIENTE", en(48));
    await cita(A, sa, "PENDIENTE", en(-3));     // ya pasó
    await cita(A, sa, "CONFIRMADA", en(5));
    await cita(B, sb, "PENDIENTE", en(2));      // de otra cuenta

    const team = await db.team.create({ data: { userId: A, name: "Equipo" } });
    const miembro = await db.teamMember.create({ data: { teamId: team.id, name: "Ana" } });
    const servicio = await db.teamService.create({ data: { teamId: team.id, name: "Corte", duration: 30 } });
    const reserva = (status, inicio) => db.bookingAppointment.create({ data: { teamId: team.id, teamMemberId: miembro.id, teamServiceId: servicio.id, clientName: "c", clientPhone: "1", startTime: inicio, endTime: new Date(inicio.getTime() + 1_800_000), timezone: "America/Bogota", status } });
    await reserva("PENDIENTE", en(3));
    await reserva("PENDIENTE", en(-1));
    await reserva("CANCELADA", en(3));

    const rec = (userId, extra) => db.reminders.create({ data: { title: "r", userId, ...extra } });
    await rec(A, { time: null });
    await rec(A, { time: en(24 * 10).toISOString() });
    await rec(A, { time: en(1).toISOString() });                  // hoy o mañana: no es «Pendientes»
    await rec(A, { time: null, sentAt: new Date() });
    await rec(A, { time: null, isCampaign: true });               // campañas no son de esta pantalla
    await rec(B, { time: null });

    m.ponerAQuienMira({ id: A, ownerId: null, effectiveId: A, role: "user" });
    const r = await m.pendientesDelMenuAction(["agenda", "multiagenda", "recordatorios"], 300);
    assert.equal(r.success, true);
    assert.deepEqual(r.conteos, { agenda: 2, multiagenda: 1, recordatorios: 2 });

    // El asesor de la cuenta ve los de SU cuenta, no los suyos personales.
    m.ponerAQuienMira({ id: AGENTE, ownerId: A, effectiveId: A, role: "user" });
    const ag = await m.pendientesDelMenuAction(["agenda"], 300);
    assert.deepEqual(ag.conteos, { agenda: 2 });

    // La otra cuenta cuenta lo suyo, y sin equipo de reservas es 0, no un error.
    m.ponerAQuienMira({ id: B, ownerId: null, effectiveId: B, role: "user" });
    const b = await m.pendientesDelMenuAction(["agenda", "multiagenda", "recordatorios"], 300);
    assert.deepEqual(b.conteos, { agenda: 1, multiagenda: 0, recordatorios: 1 });

    // Solo lo que se pide: lo que el menú no tiene no se consulta.
    const solo = await m.pendientesDelMenuAction(["agenda", "cualquiera", 7], 300);
    assert.deepEqual(solo.conteos, { agenda: 1 });

    m.ponerAQuienMira(null);
    const nadie = await m.pendientesDelMenuAction(["agenda"], 300);
    assert.equal(nadie.success, false);
});
