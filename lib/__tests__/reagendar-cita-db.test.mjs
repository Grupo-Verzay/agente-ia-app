/**
 * «Reagendar» contra Postgres y por las ACCIONES de verdad.
 *
 * Una cuenta con sus plantillas de recordatorio de Agenda (24 h, 3 h y 1 h
 * antes, una de ellas con `isCampaign` en nulo como las viejas, y una campaña
 * que NO es de agenda), una cita con recordatorios ya programados —uno como lo
 * deja la ruta del agente (número en dígitos, `appt-reminder-*`) y otro como
 * la página pública (`idNodo` vacío)—, y seguimientos que NO son recordatorios
 * de cita (un flujo, la confirmación, otro número) que no se pueden tocar.
 *
 * Se comprueba:
 *  - la cita se mueve en la MISMA fila: mismo id, mismas citas en la cuenta,
 *    la duración se conserva y queda su historial (`audit_logs`);
 *  - los recordatorios viejos se van y los nuevos salen COMPLETOS, contados
 *    desde la nueva hora, con el `idNodo` de siempre;
 *  - no pisa otra cita, no va al pasado, una ajena no la toca;
 *  - una cancelada vuelve a Pendiente con sus recordatorios;
 *  - una cita movida a dentro de 2 horas solo lleva los que no han pasado;
 *  - editar la hora desde la ficha rehace los recordatorios igual.
 *
 * Lo único que se finge es `currentUser()`, `revalidatePath`, el `cache()` de
 * React y la red. `MODO=roto` corre las acciones de `ANTES_REF` y AFIRMA el
 * fallo: no había reagendar, y mover la cita dejaba los recordatorios viejos.
 *
 * Se levanta con `scripts/banco-reagendar-cita.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";

const ROTO = process.env.MODO === "roto";
const mod = ROTO
    ? await import("./.compilado/reagendar/entrada-de-reagendar-antes.js")
    : await import("./.compilado/reagendar/entrada-de-reagendar.js");
const { ponerAQuienMira, db } = mod;
const acciones = ROTO ? mod.antes : mod;

globalThis.fetch = async () => new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });

const V = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const CUENTA = `rg-cuenta-${V}`;
const AJENA = `rg-ajena-${V}`;
const LINEA = `LINEA_RG_${V}`;
const SERVIDOR = `evo-rg-${V}.banco.test`;
const CLAVE = `clave-rg-${V}`;
const NUMERO = `57300${String(Date.now()).slice(-7)}`;
const JID = `${NUMERO}@s.whatsapp.net`;

const H = 3_600_000;
/** Una hora redonda, dentro de `dias` días. */
function enDias(dias, hora = 15) {
    const d = new Date(Date.now() + dias * 86_400_000);
    d.setUTCHours(hora, 0, 0, 0);
    return d;
}

const ids = {};

function quien(id) {
    return { id, effectiveId: id, sessionUserId: id, ownerId: null, advisorRole: null, role: "user", rolDeLaPersona: "user", email: `${id}@banco.test`, name: id };
}

async function recordatoriosDeLaCita() {
    return db.seguimiento.findMany({
        where: { instancia: LINEA, OR: [{ idNodo: null }, { idNodo: "" }, { idNodo: { startsWith: "appt-reminder-" } }] },
        orderBy: { time: "asc" },
    });
}

async function sembrarRecordatoriosViejos(inicio) {
    await db.seguimiento.deleteMany({ where: { instancia: LINEA } });
    // Como lo deja la ruta del agente: el número como se lo dieron, en dígitos.
    await db.seguimiento.create({ data: { idNodo: `appt-reminder-${ids.p3}`, instancia: LINEA, remoteJid: NUMERO, mensaje: "viejo 3h", tipo: "text", time: new Date(inicio.getTime() - 3 * H).toISOString() } });
    // Como lo deja la página pública: el idNodo vacío.
    await db.seguimiento.create({ data: { idNodo: "", instancia: LINEA, remoteJid: JID, mensaje: "viejo 1h", tipo: "text", time: new Date(inicio.getTime() - H).toISOString() } });
    // Lo que NO es un recordatorio de la cita y se tiene que quedar.
    await db.seguimiento.create({ data: { idNodo: "nodo-flujo", instancia: LINEA, remoteJid: JID, mensaje: "flujo", tipo: "text", time: new Date(inicio.getTime() - 2 * H).toISOString() } });
    await db.seguimiento.create({ data: { idNodo: `appt-confirm-${ids.cita}`, instancia: LINEA, remoteJid: JID, mensaje: "confirma", tipo: "text", time: new Date(inicio.getTime() - 5 * H).toISOString() } });
    await db.seguimiento.create({ data: { idNodo: `appt-reminder-${ids.p3}`, instancia: LINEA, remoteJid: "573009999999@s.whatsapp.net", mensaje: "de otro cliente", tipo: "text", time: new Date(inicio.getTime() - 3 * H).toISOString() } });
}

test.before(async () => {
    for (const id of [CUENTA, AJENA]) {
        const ak = await db.apiKey.create({ data: { url: id === CUENTA ? SERVIDOR : `x-${V}`, key: id === CUENTA ? CLAVE : `k-${V}` } });
        await db.user.create({ data: { id, email: `${id}@banco.test`, name: id, company: id, role: "user", ownerId: null, apiKeyId: ak.id, timezone: "America/Bogota", meetingDuration: 60 } });
    }
    await db.instancia.create({ data: { userId: CUENTA, instanceName: LINEA, instanceId: `inst-${V}`, instanceType: "Whatsapp" } });
    const p24 = await db.reminders.create({ data: { title: "24h", description: "Hola @client_name, mañana es tu cita", time: "days-1", userId: CUENTA, isSchedule: true, isCampaign: false } });
    const p3 = await db.reminders.create({ data: { title: "3h", description: "Hola @client_name, en 3 horas", time: "hours-3", userId: CUENTA, isSchedule: true, isCampaign: false } });
    // Una plantilla VIEJA, con `isCampaign` en nulo: tiene que contar.
    const p1 = await db.reminders.create({ data: { title: "1h", description: "Hola @client_name, en 1 hora", time: "hours-1", userId: CUENTA, isSchedule: true, isCampaign: null } });
    // Una campaña y un recordatorio suelto: NO son de agenda.
    await db.reminders.create({ data: { title: "camp", description: "campaña", time: "hours-2", userId: CUENTA, isSchedule: true, isCampaign: true } });
    await db.reminders.create({ data: { title: "suelto", description: "suelto", time: "minutes-30", userId: CUENTA, isSchedule: false } });
    Object.assign(ids, { p24: p24.id, p3: p3.id, p1: p1.id });

    const servicio = await db.service.create({ data: { userId: CUENTA, name: "Consulta", messageText: "ok" } });
    const sesion = await db.session.create({ data: { userId: CUENTA, remoteJid: JID, pushName: "Ana Pérez", instanceId: LINEA, status: true } });
    const inicio = enDias(2);
    const cita = await db.appointment.create({ data: { userId: CUENTA, sessionId: sesion.id, clientName: "Ana Pérez", startTime: inicio, endTime: new Date(inicio.getTime() + 90 * 60_000), timezone: "America/Bogota", serviceId: servicio.id } });
    const otra = await db.appointment.create({ data: { userId: CUENTA, sessionId: sesion.id, clientName: "Otra", startTime: enDias(3, 16), endTime: new Date(enDias(3, 16).getTime() + H), timezone: "America/Bogota", serviceId: servicio.id } });
    Object.assign(ids, { cita: cita.id, otra: otra.id, sesion: sesion.id, inicio });
    await sembrarRecordatoriosViejos(inicio);
});

test.after(async () => {
    await db.$disconnect();
});

test(ROTO ? "ANTES: no había forma de reagendar" : "reagendar mueve la MISMA cita, conserva su duración y deja su historial", async () => {
    ponerAQuienMira(quien(CUENTA));
    if (ROTO) {
        assert.equal(typeof acciones.reagendarCitaAction, "undefined");
        assert.equal(typeof acciones.datosParaReagendarAction, "undefined");
        return;
    }
    const datos = await acciones.datosParaReagendarAction(ids.cita);
    assert.equal(datos.success, true, datos.message);
    assert.equal(datos.data.cuentaId, CUENTA);
    assert.equal(datos.data.duracionMinutos, 90);
    assert.equal(datos.data.zona, "America/Bogota");

    const antes = await db.appointment.count({ where: { userId: CUENTA } });
    const nuevo = enDias(5);
    const fin = new Date(nuevo.getTime() + 90 * 60_000);
    const res = await acciones.reagendarCitaAction(ids.cita, nuevo.toISOString(), fin.toISOString());
    assert.equal(res.success, true, res.message);
    assert.equal(res.data.id, ids.cita, "la misma fila, no una cita nueva");
    assert.equal(await db.appointment.count({ where: { userId: CUENTA } }), antes, "no se creó ninguna cita");

    const fila = await db.appointment.findUnique({ where: { id: ids.cita } });
    assert.equal(fila.startTime.toISOString(), nuevo.toISOString());
    assert.equal(fila.endTime.toISOString(), fin.toISOString());
    assert.equal(fila.createdAt.getTime() <= Date.now(), true);

    const historial = await db.auditLog.findMany({ where: { entityId: ids.cita, action: "rescheduled" } });
    assert.equal(historial.length, 1);
    assert.equal(historial[0].metadata.antes.startTime, ids.inicio.toISOString());
    assert.equal(historial[0].metadata.ahora.startTime, nuevo.toISOString());
    ids.nuevo = nuevo;
});

test(ROTO ? "ANTES: mover la hora dejaba vivos los recordatorios de la hora vieja" : "los recordatorios viejos se van y salen los nuevos COMPLETOS desde la nueva hora", async () => {
    ponerAQuienMira(quien(CUENTA));
    if (ROTO) {
        const nuevo = enDias(5);
        const res = await acciones.updateAppointmentDetails(ids.cita, { startTime: nuevo.toISOString(), endTime: new Date(nuevo.getTime() + H).toISOString() });
        assert.equal(res.success, true, res.message);
        const quedan = await recordatoriosDeLaCita();
        const deAna = quedan.filter((s) => s.remoteJid === JID || s.remoteJid === NUMERO);
        assert.deepEqual(deAna.map((s) => s.mensaje).sort(), ["viejo 1h", "viejo 3h"], "siguen los de la hora vieja y no hay nuevos");
        return;
    }
    const todos = await db.seguimiento.findMany({ where: { instancia: LINEA } });
    const mensajes = todos.map((s) => s.mensaje);
    assert.ok(!mensajes.includes("viejo 3h"), "el del agente (número en dígitos) se fue");
    assert.ok(!mensajes.includes("viejo 1h"), "el de la página pública (idNodo vacío) se fue");
    for (const queda of ["flujo", "confirma", "de otro cliente"]) assert.ok(mensajes.includes(queda), `${queda} no es un recordatorio de esta cita`);

    const nuevos = todos.filter((s) => s.remoteJid === JID && s.idNodo?.startsWith("appt-reminder-")).sort((a, b) => a.time.localeCompare(b.time));
    assert.deepEqual(
        nuevos.map((s) => [s.idNodo, s.time]),
        [
            [`appt-reminder-${ids.p24}`, new Date(ids.nuevo.getTime() - 24 * H).toISOString()],
            [`appt-reminder-${ids.p3}`, new Date(ids.nuevo.getTime() - 3 * H).toISOString()],
            [`appt-reminder-${ids.p1}`, new Date(ids.nuevo.getTime() - H).toISOString()],
        ],
    );
    for (const s of nuevos) {
        assert.equal(s.serverurl, `https://${SERVIDOR}`, "el servidor de la cuenta dueña, como al agendar");
        assert.equal(s.apikey, CLAVE);
        assert.equal(s.tipo, "text");
        assert.match(s.mensaje, /Ana Pérez/);
    }
    assert.ok(!todos.some((s) => s.mensaje === "campaña" || s.mensaje === "suelto"), "ni campañas ni sueltos");
});

test("no pisa otra cita, no va al pasado, y la misma hora no es un cambio", async () => {
    ponerAQuienMira(quien(CUENTA));
    if (ROTO) return;
    const otra = await db.appointment.findUnique({ where: { id: ids.otra } });
    const pisa = await acciones.reagendarCitaAction(ids.cita, otra.startTime.toISOString(), otra.endTime.toISOString());
    assert.equal(pisa.success, false);
    assert.match(pisa.message, /Ya existe una cita/);

    const pasada = await acciones.reagendarCitaAction(ids.cita, new Date(Date.now() - H).toISOString(), new Date().toISOString());
    assert.equal(pasada.success, false);

    const fila = await db.appointment.findUnique({ where: { id: ids.cita } });
    assert.equal(fila.startTime.toISOString(), ids.nuevo.toISOString(), "la cita no se movió");
    const igual = await acciones.reagendarCitaAction(ids.cita, fila.startTime.toISOString(), fila.endTime.toISOString());
    assert.equal(igual.success, false);
});

test("una cuenta ajena no la reagenda ni la lee", async () => {
    if (ROTO) return;
    ponerAQuienMira(quien(AJENA));
    const res = await acciones.reagendarCitaAction(ids.cita, enDias(8).toISOString(), new Date(enDias(8).getTime() + H).toISOString());
    assert.equal(res.success, false);
    assert.equal(res.message, "No autorizado.");
    assert.equal((await acciones.datosParaReagendarAction(ids.cita)).success, false);
    const fila = await db.appointment.findUnique({ where: { id: ids.cita } });
    assert.equal(fila.startTime.toISOString(), ids.nuevo.toISOString());
});

test("una cancelada vuelve a Pendiente con sus recordatorios", async () => {
    if (ROTO) return;
    ponerAQuienMira(quien(CUENTA));
    const cancelar = await acciones.updateAppointmentStatus(ids.cita, "CANCELADA");
    assert.equal(cancelar.success, true);
    assert.equal((await recordatoriosDeLaCita()).filter((s) => s.remoteJid === JID).length, 0, "cancelar los borró");

    const nuevo = enDias(6);
    const res = await acciones.reagendarCitaAction(ids.cita, nuevo.toISOString(), new Date(nuevo.getTime() + 90 * 60_000).toISOString());
    assert.equal(res.success, true, res.message);
    assert.equal(res.data.status, "PENDIENTE");
    assert.equal(res.recordatorios.creados, 3);
    assert.equal((await recordatoriosDeLaCita()).filter((s) => s.remoteJid === JID).length, 3);
});

test("movida a dentro de 2 horas, solo lleva el recordatorio que no ha pasado", async () => {
    if (ROTO) return;
    ponerAQuienMira(quien(CUENTA));
    const pronto = new Date(Date.now() + 2 * H + 5 * 60_000);
    const res = await acciones.reagendarCitaAction(ids.cita, pronto.toISOString(), new Date(pronto.getTime() + H).toISOString());
    assert.equal(res.success, true, res.message);
    const suyos = (await recordatoriosDeLaCita()).filter((s) => s.remoteJid === JID);
    assert.deepEqual(suyos.map((s) => s.idNodo), [`appt-reminder-${ids.p1}`], "solo el de 1 hora");
});

test("editar la hora desde la ficha rehace los recordatorios igual que reagendar", async () => {
    if (ROTO) return;
    ponerAQuienMira(quien(CUENTA));
    const nuevo = enDias(7);
    await sembrarRecordatoriosViejos(ids.inicio);
    const res = await acciones.updateAppointmentDetails(ids.cita, { startTime: nuevo.toISOString(), endTime: new Date(nuevo.getTime() + H).toISOString() });
    assert.equal(res.success, true, res.message);
    const suyos = (await recordatoriosDeLaCita()).filter((s) => s.remoteJid === JID || s.remoteJid === NUMERO);
    assert.deepEqual(
        suyos.map((s) => s.time).sort(),
        [24, 3, 1].map((h) => new Date(nuevo.getTime() - h * H).toISOString()).sort(),
    );
});

test("correrla media hora no choca consigo misma: la cita no se cuenta como la que pisa", async () => {
    if (ROTO) return;
    ponerAQuienMira(quien(CUENTA));
    const fila = await db.appointment.findUnique({ where: { id: ids.cita } });
    const inicio = new Date(fila.startTime.getTime() + 30 * 60_000);
    const res = await acciones.reagendarCitaAction(ids.cita, inicio.toISOString(), new Date(inicio.getTime() + H).toISOString());
    assert.equal(res.success, true, res.message);
    assert.equal(res.data.startTime.toISOString(), inicio.toISOString());
});
