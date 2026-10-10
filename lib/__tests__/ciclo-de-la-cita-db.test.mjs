/**
 * El ciclo automático de la cita contra Postgres, con el código de verdad:
 * recordatorios al agendar y reagendar, el reloj de la espera, Atendida al
 * entrar, el «Sí»/«No» del recordatorio, Descartado, la decisión de la llamada
 * y las rutas que llama el backend.
 *
 * Lo único fingido es `currentUser()` y la red (`globalThis.fetch`), que
 * apunta cada envío: así se ve qué le llegó al cliente, qué a la cuenta y qué
 * se le pidió al backend.
 *
 * Se levanta con `scripts/banco-ciclo-de-la-cita.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";

const m = await import("./.compilado/ciclo-de-la-cita/entrada-del-ciclo-de-la-cita.js");
const { ponerAQuienMira, ciclo, cicloDb, recordatorios, reagendar, citas, videollamada, rutaDelTic, rutaDelMensaje, rutaDeLaLlamada, db } = m;

const V = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const CUENTA = `cc-cuenta-${V}`;
const APAGADA = `cc-apagada-${V}`;
const SERVIDOR = `cc-srv-${V}`;
const LINEA = `LINEA_CC_${V}`;
const LINEA_APAGADA = `LINEA_CCA_${V}`;
const DUENO = "573009998877";
let n = 0;
const numero = () => `57300${String(Date.now()).slice(-5)}${String(++n).padStart(2, "0")}`;

/* ── La red, fingida y apuntada ─────────────────────────────────────────── */
const fetchDeVerdad = globalThis.fetch;
let pedidos = [];
let respuestaDelBackend = { ok: true };
globalThis.fetch = async (url, init = {}) => {
    const cuerpo = typeof init.body === "string" ? init.body : "";
    pedidos.push({ url: String(url), cuerpo });
    if (String(url).includes("/citas/llamada-de-espera")) return new Response(JSON.stringify(respuestaDelBackend), { status: 200 });
    return new Response(JSON.stringify({ ok: true, key: { id: "X" } }), { status: 200 });
};
const mensajesA = (tel) => pedidos.filter((p) => p.url.includes("/message/sendText/") && p.cuerpo.includes(tel));
const llamadasPedidas = (citaId) => pedidos.filter((p) => p.url.endsWith("/citas/llamada-de-espera") && p.cuerpo.includes(citaId));
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const yo = (id) => ({ id, ownerId: null, role: "user", effectiveId: id });

const ahora = () => new Date();
const enMin = (min, desde = ahora()) => new Date(desde.getTime() + min * 60_000);

async function unaCita({ cuenta = CUENTA, linea = LINEA, inicio, estado = "PENDIENTE", nombre = "Ana" } = {}) {
    const tel = numero();
    const ses = await db.session.create({
        data: { userId: cuenta, remoteJid: `${tel}@s.whatsapp.net`, pushName: nombre, instanceId: linea, status: true },
    });
    const cita = await db.appointment.create({
        data: {
            userId: cuenta, sessionId: ses.id, clientName: nombre, startTime: inicio, endTime: enMin(30, inicio),
            timezone: "America/Bogota", status: estado,
        },
    });
    return { cita, ses, tel };
}
const elEstado = async (id) => (await db.appointment.findUnique({ where: { id }, select: { status: true } })).status;
const losSeguimientos = (citaId) =>
    db.seguimiento.findMany({ where: { idempotencyKey: { startsWith: `appt-reminder:${citaId}:` } }, orderBy: { time: "asc" } });

test.before(async () => {
    await db.apiKey.create({ data: { id: SERVIDOR, url: "evo.banco.test", key: "clave" } });
    await db.user.create({ data: { id: CUENTA, email: `${CUENTA}@b.t`, name: "Cuenta", timezone: "America/Bogota", apiKeyId: SERVIDOR, notificationNumber: DUENO } });
    await db.user.create({ data: { id: APAGADA, email: `${APAGADA}@b.t`, name: "Apagada", timezone: "America/Bogota", apiKeyId: SERVIDOR } });
    await db.instancia.create({ data: { instanceName: LINEA, instanceId: `tok-${V}`, userId: CUENTA, instanceType: "Whatsapp" } });
    await db.instancia.create({ data: { instanceName: LINEA_APAGADA, instanceId: `toka-${V}`, userId: APAGADA, instanceType: "Whatsapp" } });
    await db.reminders.create({ data: { title: "1h", description: "Plantilla de 1 hora", time: "hours-1", userId: CUENTA, isSchedule: true } });
    await db.reminders.create({ data: { title: "1h", description: "Plantilla de 1 hora", time: "hours-1", userId: APAGADA, isSchedule: true } });
    await cicloDb.guardarElCicloActivo(CUENTA, true);
    await videollamada.guardarLosAjustes(CUENTA, { modo: "tavus", limiteMinutos: 30 });
});

test.after(async () => {
    globalThis.fetch = fetchDeVerdad;
    await db.seguimiento.deleteMany({ where: { instancia: { in: [LINEA, LINEA_APAGADA] } } });
    await db.$executeRaw`DELETE FROM "cita_ciclo" WHERE "cuentaId" IN (${CUENTA}, ${APAGADA})`;
    await db.$executeRaw`DELETE FROM "cita_ciclo_ajustes" WHERE "cuentaId" IN (${CUENTA}, ${APAGADA})`;
    await db.$executeRaw`DELETE FROM "videollamada_ajustes" WHERE "cuentaId" IN (${CUENTA}, ${APAGADA})`;
    await db.appointment.deleteMany({ where: { userId: { in: [CUENTA, APAGADA] } } });
    await db.session.deleteMany({ where: { userId: { in: [CUENTA, APAGADA] } } });
    await db.reminders.deleteMany({ where: { userId: { in: [CUENTA, APAGADA] } } });
    await db.instancia.deleteMany({ where: { userId: { in: [CUENTA, APAGADA] } } });
    await db.user.deleteMany({ where: { id: { in: [CUENTA, APAGADA] } } });
    await db.apiKey.deleteMany({ where: { id: SERVIDOR } });
    await db.$disconnect();
});

/* ── Recordatorios ──────────────────────────────────────────────────────── */

test("con el ciclo encendido, la cita lleva SUS cuatro recordatorios (y no las plantillas)", async () => {
    const { cita } = await unaCita({ inicio: enMin(24 * 60) });
    const r = await recordatorios.programarLosRecordatoriosDeLaCita(cita.id);
    assert.equal(r.nuevos, 4);
    const segs = await losSeguimientos(cita.id);
    assert.deepEqual(segs.map((s) => s.idempotencyKey.split(":")[2]), ["ciclo-3h", "ciclo-1h", "ciclo-30m", "ciclo-0"]);
    assert.deepEqual(segs.map((s) => s.tipo), ["text", "botones", "text", "text"]);
    assert.ok(segs.every((s) => s.idNodo.startsWith("appt-reminder-ciclo-") && s.instancia === LINEA));
    assert.match(segs[3].mensaje, /https:\/\/app\.banco\/videollamada\//, "a la hora va el enlace de SU videollamada");
    assert.ok(!segs.some((s) => s.mensaje === "Plantilla de 1 hora"));
    // Otra vez no duplica.
    assert.equal((await recordatorios.programarLosRecordatoriosDeLaCita(cita.id)).nuevos, 0);
});

test("con el ciclo apagado, todo como antes: las plantillas", async () => {
    const { cita } = await unaCita({ cuenta: APAGADA, linea: LINEA_APAGADA, inicio: enMin(24 * 60) });
    await recordatorios.programarLosRecordatoriosDeLaCita(cita.id);
    const segs = await losSeguimientos(cita.id);
    assert.deepEqual(segs.map((s) => s.mensaje), ["Plantilla de 1 hora"]);
});

test("reagendar rehace los cuatro desde la nueva hora y el ciclo empieza de cero", async () => {
    const { cita } = await unaCita({ inicio: enMin(24 * 60) });
    await recordatorios.programarLosRecordatoriosDeLaCita(cita.id);
    await cicloDb.apuntarLaAsistencia(cita.id, CUENTA, "no");
    const nueva = enMin(48 * 60);
    await db.appointment.update({ where: { id: cita.id }, data: { startTime: nueva, endTime: enMin(30, nueva) } });
    await reagendar.reprogramarLosRecordatoriosDeLaCita(cita.id);
    const segs = await losSeguimientos(cita.id);
    assert.equal(segs.length, 4);
    assert.equal(segs[3].time, nueva.toISOString());
    assert.equal(segs[1].tipo, "botones");
    assert.equal(await cicloDb.laFilaDelCiclo(cita.id), null, "la respuesta de la hora vieja no vale para la nueva");
});

/* ── La espera ─────────────────────────────────────────────────────────── */

test("minuto 5 sin entrar: UNA llamada de la IA de voz; minuto 10: No asistida, aviso al cliente y a la cuenta", async () => {
    const t0 = ahora();
    const { cita, tel } = await unaCita({ inicio: enMin(-6, t0) });
    pedidos = [];
    await ciclo.elTicDeLaEspera(t0);
    assert.equal(llamadasPedidas(cita.id).length, 1, "se le pide la llamada al backend");
    const pedido = JSON.parse(llamadasPedidas(cita.id)[0].cuerpo);
    assert.equal(pedido.citaId, cita.id);
    assert.match(String(pedido.enlace), /videollamada/);
    await ciclo.elTicDeLaEspera(enMin(1, t0));
    assert.equal(llamadasPedidas(cita.id).length, 1, "una sola llamada");
    assert.equal(await elEstado(cita.id), "PENDIENTE");

    pedidos = [];
    await ciclo.elTicDeLaEspera(enMin(4, t0)); // minuto 10
    assert.equal(await elEstado(cita.id), "NO_ASISTIDA");
    assert.ok(mensajesA(tel).some((p) => p.cuerpo.includes("NO ASISTIDA")), "al cliente le llega el aviso con el enlace para reagendar");
    assert.ok(mensajesA(DUENO).some((p) => p.cuerpo.includes("No asistida") && p.cuerpo.includes("no se conect")), "y a la cuenta");
    assert.ok(pedidos.some((p) => p.url.endsWith("/appt-automations/execute") && p.cuerpo.includes("NO_ASISTIDA")), "se disparan las automatizaciones (mueve la tarjeta)");
    const log = await db.$queryRaw`SELECT "actor_id", "summary" FROM audit_logs WHERE "entity_id" = ${cita.id}`;
    assert.equal(log[0]?.actor_id, null, "lo hizo el sistema, y queda escrito");
});

test("entra el prospecto: Atendida en el acto, sin mensaje en mitad de la reunión", async () => {
    const t0 = ahora();
    const { cita, tel } = await unaCita({ inicio: enMin(-2, t0), estado: "CONFIRMADA" });
    pedidos = [];
    assert.equal(await ciclo.alEntrarElCliente(cita.id, t0), "atendida");
    assert.equal(await elEstado(cita.id), "ATENDIDA");
    assert.equal(mensajesA(tel).length, 0);
    await ciclo.elTicDeLaEspera(enMin(20, t0));
    assert.equal(await elEstado(cita.id), "ATENDIDA", "el reloj ya no la toca");
});

test("pide más tiempo en la llamada: se le espera; dice que no puede: No asistida, nunca Cancelada", async () => {
    const t0 = ahora();
    const a = await unaCita({ inicio: enMin(-6, t0) });
    await ciclo.elTicDeLaEspera(t0);
    const r = await rutaDeLaLlamada.POST(new Request("http://x/api/ciclo-de-citas/llamada", {
        method: "POST",
        headers: { "content-type": "application/json", "x-internal-secret": "banco" },
        body: JSON.stringify({ citaId: a.cita.id, args: { decision: "mas_tiempo", minutos: 15 } }),
    }));
    assert.equal(r.status, 200);
    assert.match((await r.json()).mensaje, /15 minutos/);
    await ciclo.elTicDeLaEspera(enMin(6, t0)); // minuto 12
    assert.equal(await elEstado(a.cita.id), "PENDIENTE", "dentro de la prórroga");
    await ciclo.elTicDeLaEspera(enMin(16, t0)); // minuto 22
    assert.equal(await elEstado(a.cita.id), "NO_ASISTIDA");

    const b = await unaCita({ inicio: enMin(-6, t0) });
    const d = await ciclo.alDecidirEnLaLlamada({ citaId: b.cita.id, args: { decision: "no_puede" } }, t0);
    assert.equal(d.ok, true);
    assert.equal(await elEstado(b.cita.id), "NO_ASISTIDA");
});

test("ningún automático pisa a una persona: Cancelada, Finalizado o un cambio en el último segundo", async () => {
    const t0 = ahora();
    const cancelada = await unaCita({ inicio: enMin(-11, t0), estado: "CANCELADA" });
    const finalizada = await unaCita({ inicio: enMin(-11, t0), estado: "FINALIZADO" });
    await ciclo.elTicDeLaEspera(t0);
    assert.equal(await elEstado(cancelada.cita.id), "CANCELADA");
    assert.equal(await elEstado(finalizada.cita.id), "FINALIZADO");
    assert.equal(llamadasPedidas(cancelada.cita.id).length, 0);

    // La persona la cancela justo antes de que el reloj la marque.
    const carrera = await unaCita({ inicio: enMin(-11, t0) });
    await db.appointment.update({ where: { id: carrera.cita.id }, data: { status: "CANCELADA" } });
    await ciclo.elTicDeLaEspera(t0);
    assert.equal(await elEstado(carrera.cita.id), "CANCELADA");
});

test("la espera NO corre con el enlace fijo, ni con el ciclo apagado", async () => {
    const t0 = ahora();
    const apagada = await unaCita({ cuenta: APAGADA, linea: LINEA_APAGADA, inicio: enMin(-11, t0) });
    await ciclo.elTicDeLaEspera(t0);
    assert.equal(await elEstado(apagada.cita.id), "PENDIENTE");

    await videollamada.guardarLosAjustes(CUENTA, { modo: "enlace", limiteMinutos: 30 });
    try {
        const fija = await unaCita({ inicio: enMin(-11, t0) });
        await ciclo.elTicDeLaEspera(t0);
        assert.equal(await elEstado(fija.cita.id), "PENDIENTE", "sin saber si entró, no se inventa un No asistida");
    } finally {
        await videollamada.guardarLosAjustes(CUENTA, { modo: "tavus", limiteMinutos: 30 });
    }
});

test("la llamada que no sale se dice, y la espera sigue al minuto 10", async () => {
    const t0 = ahora();
    const { cita } = await unaCita({ inicio: enMin(-6, t0) });
    respuestaDelBackend = { ok: false, motivo: "la cuenta no tiene número de llamadas" };
    try {
        await ciclo.elTicDeLaEspera(t0);
    } finally {
        respuestaDelBackend = { ok: true };
    }
    const fila = await cicloDb.laFilaDelCiclo(cita.id);
    assert.match(fila.llamadaResultado, /no salió: la cuenta no tiene número de llamadas/);
    await ciclo.elTicDeLaEspera(enMin(4, t0));
    assert.equal(await elEstado(cita.id), "NO_ASISTIDA");
});

/* ── Lo que escribe el cliente ─────────────────────────────────────────── */

test("«Sí» al recordatorio: se apunta y se contesta; el agente no lo contesta otra vez", async () => {
    const t0 = ahora();
    const { cita, ses, tel } = await unaCita({ inicio: enMin(50, t0) });
    pedidos = [];
    const res = await rutaDelMensaje.POST(new Request("http://x/api/ciclo-de-citas/mensaje", {
        method: "POST",
        headers: { "content-type": "application/json", "x-internal-secret": "banco" },
        body: JSON.stringify({ sessionId: ses.id, texto: "Sí" }),
    }));
    assert.deepEqual(await res.json(), { manejado: true, que: "asistencia_si" });
    assert.equal((await cicloDb.laFilaDelCiclo(cita.id)).asistencia, "si");
    assert.ok(mensajesA(tel).some((p) => p.cuerpo.includes("Te esperamos")));
    assert.equal(await elEstado(cita.id), "PENDIENTE", "el «Sí» NO es Confirmada: eso lo decide una persona");
    // Un segundo «sí» ya no es la respuesta.
    assert.equal((await ciclo.alEscribirElCliente({ sessionId: ses.id, texto: "si" }, t0)).manejado, false);
});

test("«Sí» antes de que salga la pregunta no se toma como respuesta", async () => {
    const t0 = ahora();
    const { ses } = await unaCita({ inicio: enMin(3 * 60, t0) });
    assert.equal((await ciclo.alEscribirElCliente({ sessionId: ses.id, texto: "Sí" }, t0)).manejado, false);
});

test("«No» al recordatorio: se ofrece reagendar, se quitan los avisos de 30 min y el enlace, y no se le llama", async () => {
    const t0 = ahora();
    const { cita, ses, tel } = await unaCita({ inicio: enMin(24 * 60, t0) });
    await recordatorios.programarLosRecordatoriosDeLaCita(cita.id, t0);
    // Una hora antes de la cita, contesta «No».
    const unaHoraAntes = enMin(-55, cita.startTime);
    pedidos = [];
    const r = await ciclo.alEscribirElCliente({ sessionId: ses.id, texto: "No" }, unaHoraAntes);
    assert.deepEqual(r, { manejado: true, que: "asistencia_no" });
    assert.deepEqual((await losSeguimientos(cita.id)).map((s) => s.idempotencyKey.split(":")[2]), ["ciclo-3h", "ciclo-1h"]);
    assert.ok(mensajesA(tel).some((p) => p.cuerpo.includes("reagendar")));
    assert.ok(mensajesA(DUENO).some((p) => p.cuerpo.includes("NO")), "la cuenta se entera");
    assert.equal(await elEstado(cita.id), "PENDIENTE", "no se cancela: Cancelada la decide una persona");
});

test("«No me interesa»: Descartado y fuera los recordatorios; «la voy a cancelar» no toca nada", async () => {
    const t0 = ahora();
    const a = await unaCita({ inicio: enMin(24 * 60, t0) });
    await recordatorios.programarLosRecordatoriosDeLaCita(a.cita.id, t0);
    assert.equal((await ciclo.alEscribirElCliente({ sessionId: a.ses.id, texto: "la voy a cancelar" }, t0)).que, "nada");
    assert.equal(await elEstado(a.cita.id), "PENDIENTE");

    pedidos = [];
    const r = await ciclo.alEscribirElCliente({ sessionId: a.ses.id, texto: "Gracias, pero no me interesa" }, t0);
    assert.deepEqual(r, { manejado: false, que: "descartada" }, "el agente sigue contestando");
    assert.equal(await elEstado(a.cita.id), "DESCARTADO");
    assert.equal((await losSeguimientos(a.cita.id)).length, 0);
    assert.ok(mensajesA(DUENO).some((p) => p.cuerpo.includes("Descartada") && p.cuerpo.includes("no me interesa")));

    // Una cita Finalizada no se descarta.
    const f = await unaCita({ inicio: enMin(-60, t0), estado: "FINALIZADO" });
    await ciclo.alEscribirElCliente({ sessionId: f.ses.id, texto: "no me interesa" }, t0);
    assert.equal(await elEstado(f.cita.id), "FINALIZADO");
});

/* ── Las rutas y la acción del tablero ─────────────────────────────────── */

test("las rutas del backend no abren sin la clave interna", async () => {
    for (const [ruta, url] of [[rutaDelTic, "tic"], [rutaDelMensaje, "mensaje"], [rutaDeLaLlamada, "llamada"]]) {
        const r = await ruta.POST(new Request(`http://x/api/ciclo-de-citas/${url}`, { method: "POST", headers: { "x-internal-secret": "otra" }, body: "{}" }));
        assert.equal(r.status, 401, url);
    }
    const ok = await rutaDelTic.POST(new Request("http://x/api/ciclo-de-citas/tic", { method: "POST", headers: { authorization: "Bearer banco" } }));
    assert.equal(ok.status, 200);
    assert.equal((await ok.json()).ok, true);
});

test("la acción del tablero sigue igual: cambia, dispara y al cancelar limpia los recordatorios", async () => {
    ponerAQuienMira(yo(CUENTA));
    const { cita } = await unaCita({ inicio: enMin(24 * 60) });
    await recordatorios.programarLosRecordatoriosDeLaCita(cita.id);
    pedidos = [];
    const r = await citas.updateAppointmentStatus(cita.id, "CANCELADA");
    assert.equal(r.success, true, r.message);
    assert.equal(r.data.status, "CANCELADA");
    assert.equal((await losSeguimientos(cita.id)).length, 0);
    await esperar(50);
    assert.ok(pedidos.some((p) => p.url.endsWith("/appt-automations/execute")));

    ponerAQuienMira(yo(APAGADA));
    const ajena = await citas.updateAppointmentStatus(cita.id, "PENDIENTE");
    assert.equal(ajena.success, false, "la puerta sigue en su sitio");
});
