/**
 * Campañas contra Postgres y por las ACCIONES de verdad.
 *
 * Una cuenta, su línea y tres contactos. Se comprueba lo que la guía promete y
 * documentarla destapó roto:
 *  - creada desde Campañas, una campaña de UN contacto sigue siendo campaña;
 *  - cada contacto recibe su mensaje con sus variables, escalonado con la pausa;
 *  - una campaña sale UNA vez (la repetición se ignora);
 *  - pausar y reanudar: lo reanudado sale escalonado, no de golpe;
 *  - editarla rehace lo pendiente (mensaje y contactos) y deja lo enviado;
 *  - reintentar los fallidos los vuelve a poner en cola;
 *  - el historial cuenta enviados y fallidos;
 *  - eliminarla se lleva también sus envíos pendientes.
 *
 * `MODO=roto` corre las acciones de `ANTES_REF` y AFIRMA los fallos.
 * Se levanta con `scripts/banco-campanas.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";

const ROTO = process.env.MODO === "roto";
const mod = ROTO
    ? await import("./.compilado/campanas/entrada-de-campanas-antes.js")
    : await import("./.compilado/campanas/entrada-de-campanas.js");
const { ponerAQuienMira, db } = mod;
const a = ROTO ? mod.antes : mod;

globalThis.fetch = async () => new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });

const V = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const CUENTA = `cp-cuenta-${V}`;
const LINEA = `LINEA_CP_${V}`;
const JIDS = ["573001110001", "573001110002", "573001110003"].map((n) => `${n}${String(Date.now()).slice(-3)}@s.whatsapp.net`);
const HORA = new Date(Date.now() + 3 * 86_400_000).toISOString();

const quien = { id: CUENTA, effectiveId: CUENTA, sessionUserId: CUENTA, ownerId: null, advisorRole: null, role: "user", rolDeLaPersona: "user", email: `${CUENTA}@banco.test`, name: "Café" };

function datos(extra = {}) {
    return {
        title: "Promoción de octubre",
        description: "Hola {{nombre}}, tu número es {{telefono}}.",
        time: HORA,
        repeatType: "NONE",
        userId: CUENTA,
        instanceName: LINEA,
        campaignMinDelay: 30,
        campaignMaxDelay: 30,
        ...(ROTO ? {} : { esCampana: true }),
        ...extra,
    };
}

async function envios(id) {
    return db.seguimiento.findMany({ where: { idNodo: { startsWith: `camping-${id}-` } }, orderBy: { id: "asc" } });
}

async function crear(extra) {
    const r = await a.createReminder(datos(extra));
    assert.equal(r.success, true, r.message);
    return db.reminders.findFirst({ where: { userId: CUENTA }, orderBy: { createdAt: "desc" } });
}

test.before(async () => {
    await db.user.create({ data: { id: CUENTA, email: `${CUENTA}@banco.test`, name: "Café", timezone: "America/Bogota" } });
    ponerAQuienMira(quien);
});

test.after(async () => {
    await db.seguimiento.deleteMany({ where: { instancia: LINEA } });
    await db.reminders.deleteMany({ where: { userId: CUENTA } });
    await db.user.deleteMany({ where: { id: CUENTA } });
    await db.$disconnect();
});

test("1) desde Campañas, una campaña de UN contacto sigue siendo campaña", async () => {
    const r = await crear({ remoteJid: JIDS[0], pushName: "Ana" });
    if (ROTO) {
        // EL FALLO: se guardaba como recordatorio y desaparecía de Campañas.
        assert.equal(r.isCampaign, false);
        return;
    }
    assert.equal(r.isCampaign, true);
    const e = await envios(r.id);
    assert.equal(e.length, 1);
    assert.equal(e[0].mensaje, `Hola Ana, tu número es ${JIDS[0].replace(/@.*/, "")}.`);
});

test("2) varios contactos: cada uno con sus variables, escalonados, y sale UNA vez", async () => {
    const r = await crear({ remoteJid: JIDS.join(","), pushName: "Ana,,Luis", repeatType: "DAILY" });
    const e = await envios(r.id);
    assert.equal(e.length, 3);
    if (ROTO) {
        // EL FALLO: se guardaba con su repetición, que el motor no sabe repetir.
        assert.equal(r.repeatType, "DAILY");
        return;
    }
    assert.equal(r.repeatType, "NONE");
    assert.equal(e[1].mensaje, `Hola ${JIDS[1].replace(/@.*/, "")}, tu número es ${JIDS[1].replace(/@.*/, "")}.`);
    const t = e.map((x) => new Date(x.time).getTime());
    assert.equal(t[1] - t[0], 30_000);
    assert.equal(t[2] - t[1], 30_000);
});

test("3) pausar y reanudar: lo reanudado sale escalonado, no de golpe", async () => {
    const r = await crear({ remoteJid: JIDS.join(","), pushName: "Ana,Bea,Luis" });
    const p = await a.cancelReminderPendingDeliveries(r.id);
    assert.equal(p.success, true);
    assert.ok((await envios(r.id)).every((x) => x.followUpStatus === "canceled"));
    const s = await a.resumeReminderCanceledDeliveries(r.id);
    assert.equal(s.success, true);
    const e = await envios(r.id);
    assert.ok(e.every((x) => x.followUpStatus === "pending"));
    const horas = new Set(e.map((x) => x.time));
    if (ROTO) {
        // EL FALLO: se les ponía a todos la misma hora y salían de golpe.
        assert.equal(horas.size, 1);
        return;
    }
    assert.equal(horas.size, 3);
});

test("4) editar rehace lo pendiente y deja lo enviado", async () => {
    const r = await crear({ remoteJid: JIDS.join(","), pushName: "Ana,Bea,Luis" });
    const antes = await envios(r.id);
    await db.seguimiento.update({ where: { id: antes[0].id }, data: { followUpStatus: "sent" } });
    const u = await a.updateReminder(r.id, datos({ description: "Nuevo: {{nombre}}", remoteJid: JIDS.join(","), pushName: "Ana,Bea,Luis" }));
    const e = await envios(r.id);
    if (ROTO) {
        // EL FALLO: editar no tocaba los envíos: salía el mensaje viejo.
        assert.ok(e.filter((x) => x.followUpStatus === "pending").every((x) => x.mensaje.startsWith("Hola")));
        return;
    }
    assert.equal(u.success, true, u.message);
    const enviado = e.find((x) => x.id === antes[0].id);
    assert.equal(enviado.followUpStatus, "sent");
    assert.match(enviado.mensaje, /^Hola/);
    const pendientes = e.filter((x) => x.followUpStatus === "pending");
    assert.deepEqual(pendientes.map((x) => x.mensaje), ["Nuevo: Bea", "Nuevo: Luis"]);
});

test("5) reintentar los fallidos y el historial con enviados y fallidos", async () => {
    const r = await crear({ remoteJid: JIDS.join(","), pushName: "Ana,Bea,Luis" });
    const e = await envios(r.id);
    await db.seguimiento.update({ where: { id: e[0].id }, data: { followUpStatus: "sent" } });
    await db.seguimiento.update({ where: { id: e[1].id }, data: { followUpStatus: "failed", errorReason: "sin WhatsApp", followUpAttempt: 3 } });
    const h = await a.getReminderDeliverySummaries([r.id]);
    const resumen = h.data?.[r.id];
    assert.equal(resumen.sent, 1);
    assert.equal(resumen.failed, 1);
    assert.equal(resumen.pending, 1);
    const x = await a.retryReminderFailedDeliveries(r.id);
    assert.equal(x.success, true);
    const f = (await envios(r.id)).find((y) => y.id === e[1].id);
    assert.equal(f.followUpStatus, "pending");
    assert.equal(f.followUpAttempt, 0);
});

test("6) eliminar la campaña se lleva sus envíos pendientes", async () => {
    const r = await crear({ remoteJid: JIDS.join(","), pushName: "Ana,Bea,Luis" });
    await a.deleteReminder(r.id);
    const quedan = await envios(r.id);
    if (ROTO) {
        // EL FALLO: la campaña desaparecía y sus mensajes seguían saliendo.
        assert.equal(quedan.length, 3);
        return;
    }
    assert.equal(quedan.length, 0);
});
