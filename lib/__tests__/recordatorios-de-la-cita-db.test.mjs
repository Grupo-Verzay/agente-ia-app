/**
 * Los recordatorios de cita, los manuales y los de tarea, contra Postgres y por
 * las ACCIONES de verdad: el chat (`createAppointment`), la ruta del agente,
 * la confirmación de la página pública, «Recordatorios» y «Tareas».
 *
 * Lo único fingido es `currentUser()`, `revalidatePath`, el `cache()` de React
 * y la red. `MODO=roto` empaqueta ESTAS MISMAS pruebas contra el código de
 * antes (`ANTES_REF`) y AFIRMA cada fallo.
 */
import test from "node:test";
import assert from "node:assert/strict";

const ROTO = process.env.MODO === "roto";
const m = await import(
    ROTO
        ? "./.compilado/recordatorios-de-la-cita-antes/entrada-de-recordatorios-de-cita.js"
        : "./.compilado/recordatorios-de-la-cita/entrada-de-recordatorios-de-cita.js"
);
const { ponerAQuienMira, citas, rutaDelAgente, recordatorios, tareas, citaPublica, db } = m;

const V = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const CUENTA = `rc-cuenta-${V}`;
const MADRID = `rc-madrid-${V}`;
const ASESOR = `rc-asesor-${V}`;
const SERVIDOR = `rc-srv-${V}`;
const LINEA = `LINEA_RC_${V}`;
const LINEA_MADRID = `LINEA_RCM_${V}`;
const numero = (n) => `3400${String(Date.now()).slice(-6)}${n}`; // +34: un teléfono de España

const fetchDeVerdad = globalThis.fetch;
globalThis.fetch = async () => new Response(JSON.stringify({ key: { id: "X" } }), { status: 200 });

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const yo = (id) => ({ id, ownerId: null, role: "user", effectiveId: id });

let servicio;
const plantillas = {};

async function losDeLaCita(jid) {
    return db.seguimiento.findMany({ where: { remoteJid: { startsWith: jid.replace(/@.*/, "") } }, orderBy: { time: "asc" } });
}

test.before(async () => {
    await db.apiKey.create({ data: { id: SERVIDOR, url: "evo.banco.test", key: "clave" } });
    await db.user.create({ data: { id: CUENTA, email: `${CUENTA}@b.t`, name: "Cuenta", timezone: "America/Bogota", meetingDuration: 30, apiKeyId: SERVIDOR } });
    await db.user.create({ data: { id: MADRID, email: `${MADRID}@b.t`, name: "Madrid", timezone: "Europe/Madrid", apiKeyId: SERVIDOR } });
    await db.user.create({ data: { id: ASESOR, email: `${ASESOR}@b.t`, name: "Asesor", ownerId: MADRID, notificationNumber: "573001234567" } });
    await db.instancia.create({ data: { instanceName: LINEA, instanceId: `tok-${V}`, userId: CUENTA, instanceType: "Whatsapp" } });
    await db.instancia.create({ data: { instanceName: LINEA_MADRID, instanceId: `tokm-${V}`, userId: MADRID, instanceType: "Whatsapp" } });
    servicio = await db.service.create({ data: { userId: CUENTA, name: "Corte", messageText: "Cita el @appointment_datetime" } });
    plantillas.h3 = await db.reminders.create({ data: { title: "3h", description: "Hola @client_name, tu cita es el @appointment_datetime", time: "hours-3", userId: CUENTA, isSchedule: true } });
    plantillas.h1 = await db.reminders.create({ data: { title: "1h", description: "En una hora", time: "hours-1", userId: CUENTA, isSchedule: true } });
    // La «plantilla» que dejaba la acción «Recordatorio»: hora ISO.
    plantillas.basura = await db.reminders.create({ data: { title: "Recordatorio automatico", description: "basura", time: "2026-09-28T15:00:00.000Z", userId: CUENTA, isSchedule: true } });
});

test.after(async () => {
    globalThis.fetch = fetchDeVerdad;
    await db.seguimiento.deleteMany({ where: { instancia: { in: [LINEA, LINEA_MADRID] } } });
    await db.appointment.deleteMany({ where: { userId: CUENTA } });
    await db.session.deleteMany({ where: { userId: CUENTA } });
    await db.reminders.deleteMany({ where: { userId: { in: [CUENTA, MADRID] } } });
    await db.service.deleteMany({ where: { userId: CUENTA } });
    await db.instancia.deleteMany({ where: { userId: { in: [CUENTA, MADRID] } } });
    await db.user.deleteMany({ where: { id: { in: [ASESOR, CUENTA, MADRID] } } });
    await db.apiKey.deleteMany({ where: { id: SERVIDOR } });
});

// Una cita dentro de 2 días a las 10:00 de Bogotá (15:00 UTC).
function laFranja() {
    const d = new Date(Date.now() + 2 * 86400_000);
    const inicio = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 15, 0, 0));
    return { inicio, fin: new Date(inicio.getTime() + 30 * 60_000) };
}

test("una cita agendada desde el CHAT lleva sus recordatorios de 3 h y 1 h", async () => {
    ponerAQuienMira(yo(CUENTA));
    const tel = numero(1);
    const jid = `${tel}@s.whatsapp.net`;
    const ses = await db.session.create({ data: { userId: CUENTA, remoteJid: jid, pushName: "Ana", instanceId: LINEA, status: true } });
    const { inicio, fin } = laFranja();
    const res = await citas.createAppointment({
        userId: CUENTA, sessionId: ses.id, pushName: "Ana", phone: tel, instanceName: LINEA,
        startTime: inicio.toISOString(), endTime: fin.toISOString(), timezone: "America/Bogota", serviceId: servicio.id,
    });
    assert.equal(res.success, true, res.message);
    const segs = await losDeLaCita(jid);

    if (ROTO) {
        assert.equal(segs.length, 0, "antes el chat no programaba ninguno");
        return;
    }
    assert.deepEqual(segs.map((s) => s.time), [
        new Date(inicio.getTime() - 3 * 3600_000).toISOString(),
        new Date(inicio.getTime() - 3600_000).toISOString(),
    ]);
    assert.ok(segs.every((s) => s.idNodo.startsWith("appt-reminder-") && s.instancia === LINEA));
    assert.match(segs[0].mensaje, /Hola Ana, tu cita es el .* 10:00 AM \(hora Bogota\)\./);

    // Programar otra vez la misma cita no duplica (la página pública lo hace).
    await citaPublica.confirmarLaCitaPublica({ appointmentId: res.data.id }).catch(() => {});
    assert.equal((await losDeLaCita(jid)).length, 2);
});

test("una cita del AGENTE con un cliente de otro país: dos recordatorios, en la hora de la CUENTA y sin el de 34 minutos", async () => {
    const tel = numero(2);
    const { inicio, fin } = laFranja();
    const alt = new Date(inicio.getTime() + 3600_000);
    const res = await rutaDelAgente.POST(new Request("http://localhost/api/schedule/appointment", {
        method: "POST",
        headers: { "content-type": "application/json", "x-internal-secret": "banco" },
        body: JSON.stringify({
            userId: CUENTA, serviceId: servicio.id, pushName: "Luis", phone: tel, instanceName: LINEA,
            startTime: alt.toISOString(), endTime: new Date(alt.getTime() + 30 * 60_000).toISOString(),
            timezone: "America/Bogota",
        }),
    }));
    assert.equal(res.status, 201, await res.clone().text());
    await esperar(1500); // lo de después de la cita va de fondo
    const segs = await losDeLaCita(tel);

    if (ROTO) {
        // El de 34 minutos: la plantilla con hora ISO leída como 2026 segundos.
        assert.ok(segs.some((s) => s.time === new Date(alt.getTime() - 2026 * 1000).toISOString()), JSON.stringify(segs.map((s) => s.time)));
        // Y la hora del texto en la zona del TELÉFONO (+34, España): 11:00 de Bogotá eran las 18:00.
        assert.ok(segs.some((s) => /6:00 PM \(hora Madrid\)/.test(s.mensaje ?? "")), JSON.stringify(segs.map((s) => s.mensaje)));
        return;
    }
    assert.equal(segs.length, 2, JSON.stringify(segs.map((s) => [s.idNodo, s.time])));
    assert.deepEqual(segs.map((s) => s.time), [
        new Date(alt.getTime() - 3 * 3600_000).toISOString(),
        new Date(alt.getTime() - 3600_000).toISOString(),
    ]);
    assert.match(segs[0].mensaje, /11:00 AM \(hora Bogota\)\./);
});

test("un recordatorio de la pantalla Recordatorios se guarda en el reloj de SU cuenta (Madrid)", async () => {
    ponerAQuienMira(yo(MADRID));
    const jid = `${numero(3)}@s.whatsapp.net`;
    const res = await recordatorios.createReminder({
        title: "Llamar", description: "Te llamamos", time: "15/10/2026 09:00", userId: MADRID,
        instanceName: LINEA_MADRID, remoteJid: jid, pushName: "Eva", repeatType: "NONE",
    });
    assert.equal(res.success, true, JSON.stringify(res));
    const seg = await db.seguimiento.findFirst({ where: { remoteJid: jid } });
    if (ROTO) {
        // Guardado como reloj de pared, que el motor leía en hora de Colombia.
        assert.equal(seg.time, "15/10/2026 09:00");
        return;
    }
    assert.equal(seg.time, "2026-10-15T07:00:00.000Z", "las 9 de Madrid");
});

test("un recordatorio de TAREA se guarda como instante y dice la hora de la cuenta", async () => {
    ponerAQuienMira(yo(MADRID));
    const vence = "2026-10-15T07:00:00.000Z"; // las 9 de Madrid
    const res = await tareas.createTaskAction({
        title: `Tarea ${V}`, type: "Llamada", dueDate: vence, assignedToId: ASESOR, sendWhatsApp: true,
    });
    assert.equal(res.success, true, res.message);
    const seg = await db.seguimiento.findFirst({ where: { instancia: LINEA_MADRID, idNodo: { startsWith: "task-reminder-" } } });
    if (ROTO) {
        // Pedía `Instancias.apiKeyId`, que no existe: Prisma lo rechazaba, el
        // `catch` lo callaba y el recordatorio de la tarea no se creaba nunca.
        assert.equal(seg, null);
        return;
    }
    assert.ok(seg, "hay recordatorio de tarea");
    assert.equal(seg.time, vence);
    assert.match(seg.mensaje, /15\/10\/2026 09:00/);
});
