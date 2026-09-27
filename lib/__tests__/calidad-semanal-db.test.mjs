/**
 * El CORTE SEMANAL de verdad contra Postgres: `runWeeklyReportForAllUsers`, el
 * mismo de las seis de la tarde, con la IA y el envío de WhatsApp fingidos.
 *
 * Lo que solo se ve aquí:
 *
 * - que el corte evalúa la calidad ANTES de mandar cada reporte, también una
 *   conversación con mensajes de hace cinco minutos (ya no hay reposo);
 * - que el reporte de una cuenta con equipo dice el promedio y el MEJOR asesor,
 *   con su nombre;
 * - que el de una cuenta donde el dueño atiende solo dice SU puntaje y no
 *   nombra a nadie;
 * - que una cuenta sin nada evaluado no lleva sección (ni un «0/100»);
 * - que la sección queda guardada en el reporte (Reportes la pinta de ahí);
 * - que generar el reporte a mano NO evalúa ni gasta créditos.
 *
 * `MODO=roto` corre el código de ANTES_REF y afirma el fallo: el reporte no
 * decía nada de la calidad, y el runner dejaba fuera lo de hace cinco minutos.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
    runWeeklyReportForAllUsers,
    generateWeeklyReportForUser,
    evaluarLaCalidadDeLaCuenta,
    persistChatMessage,
    db,
    enviados,
    pedidosALaIa,
} from "./.compilado/calidad-semanal/entrada-de-calidad-semanal.js";

const ROTO = process.env.MODO === "roto";
const V = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const EQUIPO = `cs-equipo-${V}`;
const ANA = `cs-ana-${V}`;
const BETO = `cs-beto-${V}`;
const SOLO = `cs-solo-${V}`;
const VACIA = `cs-vacia-${V}`;
const NUM = (n) => `5730${n}${String(Date.now()).slice(-6)}`;
const JID_ANA = `${NUM(11)}@s.whatsapp.net`;
const JID_BETO = `${NUM(22)}@s.whatsapp.net`;
const JID_SOLO = `${NUM(33)}@s.whatsapp.net`;
const JID_TARDE = `${NUM(44)}@s.whatsapp.net`;
const hace = (min) => new Date(Date.now() - min * 60 * 1000);

async function limpiarTodo() {
    const viejos = (await db.user.findMany({ where: { id: { startsWith: "cs-" } }, select: { id: true } })).map((u) => u.id);
    if (viejos.length === 0) return;
    for (const t of ["chat_messages", "chat_conversations"]) {
        await db.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "userId" = ANY($1::text[])`, viejos).catch(() => {});
    }
    await db.$executeRawUnsafe(`DELETE FROM "calidad_conversaciones" WHERE "cuentaId" = ANY($1::text[])`, viejos).catch(() => {});
    await db.$executeRawUnsafe(`DELETE FROM weekly_reports WHERE "userId" = ANY($1::text[])`, viejos).catch(() => {});
    await db.session.deleteMany({ where: { userId: { in: viejos } } });
    await db.instancia.deleteMany({ where: { userId: { in: viejos } } });
    await db.iaCredit.deleteMany({ where: { userId: { in: viejos } } });
    await db.userAiConfig.deleteMany({ where: { userId: { in: viejos } } });
    await db.user.deleteMany({ where: { ownerId: { in: viejos } } });
    await db.user.deleteMany({ where: { id: { in: viejos } } });
}

async function msg(userId, remoteJid, { fromMe, texto, min, id }) {
    await persistChatMessage({
        userId, instanceName: `LINEA_${userId}`, remoteJid, fromMe, messageId: id,
        messageType: "conversation", content: texto, raw: { message: { conversation: texto } },
        messageTimestamp: hace(min), puedeReabrir: false,
    });
}

async function cuenta(id, name, { ia = true, ownerId = null, reporte = true } = {}) {
    await db.user.create({
        data: { id, email: `${id}@b.t`, name, status: true, notificationNumber: reporte ? NUM(99) : "", ...(ownerId ? { ownerId } : {}) },
    });
    if (!reporte) return;
    await db.instancia.create({ data: { instanceName: `LINEA_${id}`, userId: id, instanceId: `iid-${id}`, instanceType: "Whatsapp" } });
    if (ia) {
        const proveedor = await db.aiProvider.upsert({ where: { name: "openai" }, create: { name: "openai", aiModel: "gpt-4o-mini" }, update: {} });
        await db.userAiConfig.create({ data: { userId: id, providerId: proveedor.id, apiKey: "sk-banco", isActive: true } });
        await db.iaCredit.create({ data: { userId: id, total: 100, used: 0, renewalDate: new Date(Date.now() + 864e5) } });
    }
}

async function conversacion(cuentaId, jid, asesor, quien, min, v) {
    await msg(cuentaId, jid, { fromMe: false, texto: "Hola, ¿tienen envíos a Cali?", min: min + 1, id: `${v}-1-${V}` });
    await msg(cuentaId, jid, { fromMe: true, texto: `Hola, soy ${quien}. Sí, enviamos a Cali.`, min, id: `${v}-2-${V}` });
    await db.session.create({
        data: { userId: cuentaId, remoteJid: jid, pushName: "Cliente", instanceId: `iid-${cuentaId}`, status: true, ...(asesor ? { assignedAdvisorId: asesor } : {}) },
    });
}

test.before(async () => {
    await db.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS weekly_reports (
            id TEXT PRIMARY KEY, "userId" TEXT NOT NULL,
            period_start TIMESTAMP(3) NOT NULL, period_end TIMESTAMP(3) NOT NULL,
            summary TEXT NOT NULL, metrics JSONB, sent_at TIMESTAMP(3),
            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT NOW())`);
    await limpiarTodo();
    await cuenta(EQUIPO, "Equipo");
    await cuenta(ANA, "Ana", { ownerId: EQUIPO, reporte: false });
    await cuenta(BETO, "Beto", { ownerId: EQUIPO, reporte: false });
    await cuenta(SOLO, "Dueño Solo");
    await cuenta(VACIA, "Vacía", { ia: false });
    // La de Ana es de hace CINCO MINUTOS: con el reposo de antes no se evaluaba.
    await conversacion(EQUIPO, JID_ANA, ANA, "Ana", 5, "ana");
    await conversacion(EQUIPO, JID_BETO, BETO, "Beto", 180, "beto");
    await conversacion(SOLO, JID_SOLO, null, "el dueño", 180, "solo");
});
test.after(async () => {
    await limpiarTodo();
    await db.$disconnect();
});

const elTextoDe = (cuentaId) => enviados.find((e) => e.cuentaId === cuentaId)?.text ?? "";
const filasDe = (cuentaId) =>
    db.$queryRawUnsafe(`SELECT * FROM "calidad_conversaciones" WHERE "cuentaId" = $1`, cuentaId).catch(() => []);

test("el corte semanal evalúa antes de mandar, sin esperar reposo", async () => {
    const r = await runWeeklyReportForAllUsers();
    assert.equal(r.errors, 0);
    assert.equal(enviados.length, 3, "las tres cuentas con reporte");
    const filas = await filasDe(EQUIPO);
    if (ROTO) {
        assert.equal(filas.length, 0, "EL FALLO: el reporte no hacía ningún corte de calidad");
        await evaluarLaCalidadDeLaCuenta(EQUIPO);
        const tras = (await filasDe(EQUIPO)).map((f) => f.remoteJid);
        assert.ok(!tras.includes(JID_ANA), "EL FALLO: lo de hace cinco minutos esperaba dos horas de reposo");
        return;
    }
    const jids = filas.map((f) => f.remoteJid).sort();
    assert.deepEqual(jids, [JID_ANA, JID_BETO].sort(), "las dos, también la de hace cinco minutos");
    assert.equal(pedidosALaIa.length, 3, "tres conversaciones evaluadas en el corte, una sola vez cada una");
});

test("el reporte de la cuenta con equipo dice el promedio y el mejor asesor", async () => {
    const texto = elTextoDe(EQUIPO);
    assert.ok(texto.includes("REPORTE SEMANAL"));
    if (ROTO) {
        assert.ok(!texto.includes("CALIDAD"), "EL FALLO: el reporte no decía nada de la calidad");
        return;
    }
    assert.ok(texto.includes("🎯 *CALIDAD DE ATENCIÓN*"), texto);
    assert.match(texto, /⭐ Calidad del equipo: \*\d+\/100\* \(2 conversaciones evaluadas\)/);
    assert.match(texto, /🏆 Mejor asesor: \*Ana\* \(\d+\/100\)/);
    assert.ok(!texto.includes("Tu calidad de atención"));
    // Breve: la sección son tres líneas (título y dos), sin una fila por conversación.
    const seccion = texto.slice(texto.indexOf("CALIDAD DE ATENCIÓN")).split("\n").filter((l) => /⭐|🏆/.test(l));
    assert.equal(seccion.length, 2);
});

test("el dueño que atiende solo recibe SU puntaje, sin mejor asesor", async () => {
    if (ROTO) return;
    const texto = elTextoDe(SOLO);
    assert.match(texto, /⭐ Tu calidad de atención: \*\d+\/100\* \(1 conversación evaluada\)/);
    assert.ok(!texto.includes("Mejor asesor"));
    assert.ok(!texto.includes("Calidad del equipo"));
});

test("sin nada evaluado no hay sección, ni un «0/100»", async () => {
    const texto = elTextoDe(VACIA);
    assert.ok(texto.includes("REPORTE SEMANAL"), "el reporte sale igual");
    assert.ok(!texto.includes("CALIDAD") && !texto.includes("0/100"));
});

test("la sección queda guardada en el reporte, que es de donde la pinta Reportes", async () => {
    if (ROTO) return;
    const [fila] = await db.$queryRawUnsafe(`SELECT metrics FROM weekly_reports WHERE "userId" = $1`, EQUIPO);
    assert.equal(fila.metrics.calidad.conversaciones, 2);
    assert.equal(fila.metrics.calidad.mejor.nombre, "Ana");
    assert.equal(fila.metrics.calidad.soloElDueno, false);
    const [solo] = await db.$queryRawUnsafe(`SELECT metrics FROM weekly_reports WHERE "userId" = $1`, SOLO);
    assert.equal(solo.metrics.calidad.soloElDueno, true);
    const [vacia] = await db.$queryRawUnsafe(`SELECT metrics FROM weekly_reports WHERE "userId" = $1`, VACIA);
    assert.equal(vacia.metrics.calidad ?? null, null);
});

test("generar el reporte a mano NO evalúa ni gasta créditos", async () => {
    if (ROTO) return;
    const antes = pedidosALaIa.length;
    const usados = (await db.iaCredit.findUnique({ where: { userId: EQUIPO } })).used;
    await conversacion(EQUIPO, JID_TARDE, BETO, "Beto", 1, "tarde");
    const r = await generateWeeklyReportForUser(EQUIPO);
    assert.equal(r.success, true);
    assert.equal(pedidosALaIa.length, antes, "ninguna llamada a la IA");
    assert.equal((await db.iaCredit.findUnique({ where: { userId: EQUIPO } })).used, usados);
    assert.ok(!(await filasDe(EQUIPO)).some((f) => f.remoteJid === JID_TARDE), "lo nuevo espera al botón o al próximo corte");
});
