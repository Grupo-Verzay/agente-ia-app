/**
 * La ENCUESTA DE SATISFACCIÓN contra Postgres, con las acciones de VERDAD.
 *
 * Lo que un banco puro no puede decir, y es lo que importa:
 *
 * 1. Que **resolver** —la única puerta, `resolveSession`— manda la pregunta por
 *    la línea de la conversación cuando la cuenta la tiene encendida, y NO la
 *    manda cuando está apagada (que es lo de por defecto).
 * 2. Que no se repite: resolver dos veces la misma conversación no le pregunta
 *    dos veces al mismo cliente.
 * 3. Que la respuesta del cliente —un mensaje guardado en `chat_messages`, por
 *    la identidad que sea— queda en su ficha y en el NPS del CRM, con el asesor
 *    que tenía la conversación.
 * 4. Que el alcance es el del CRM: la madre ve el NPS de su hija, la hija no ve
 *    el de su madre, y una cuenta ajena no ve nada.
 *
 * `MODO=roto` corre el `resolveSession` de `ANTES_REF` —sacado de git— con la
 * encuesta ENCENDIDA y AFIRMA el fallo: resolver no preguntaba nada y no quedaba
 * ninguna fila. Sin ese modo, lo verde del bueno no diría si el enganche está
 * puesto o si el caso no se llega a ejercer.
 *
 * Se levanta con `scripts/banco-encuesta-de-satisfaccion.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";

const ROTO = process.env.MODO === "roto";
const m = await import(
    ROTO
        ? "./.compilado/encuesta/entrada-de-la-encuesta-antes.js"
        : "./.compilado/encuesta/entrada-de-la-encuesta.js"
);
const { ponerAQuienMira, resolveSession, db, persistChatMessage, guardarLosAjustesDeLaEncuesta } = m;

/** La base se reutiliza entre vueltas: los ids llevan el sello de la vuelta. */
const V = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const MADRE = `nps-madre-${V}`;
const HIJA = `nps-hija-${V}`;
const AJENA = `nps-ajena-${V}`;
const ASESORA = `nps-asesora-${V}`;
const AGENTE = `nps-agente-${V}`;
const LINEA = `LINEA_NPS_${V}`;
const LINEA_HIJA = `LINEA_NPS_HIJA_${V}`;
const SERVIDOR = "https://evo.banco.test";

/* ── La red a Evolution, fingida y APUNTADA ─────────────────────────── */
const enviados = [];
let respuestaDeEvolution = { status: 200, body: { key: { id: "msg-evo" } } };
globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    if (u.includes("/instance/connectionState/")) {
        return new Response(JSON.stringify({ instance: { state: "open" } }), { status: 200 });
    }
    if (u.includes("/message/sendText/")) {
        enviados.push({ url: u, body: JSON.parse(String(init.body ?? "{}")) });
        return new Response(JSON.stringify(respuestaDeEvolution.body), { status: respuestaDeEvolution.status });
    }
    return new Response("{}", { status: 404 });
};

function quien(id, extra = {}) {
    return {
        id, effectiveId: id, sessionUserId: id, ownerId: null, advisorRole: null,
        role: "user", rolDeLaPersona: "user", email: `${id}@banco.test`, name: id, ...extra,
    };
}

/** La cola de la encuesta es de fondo: se espera a que la fila deje de estar pendiente. */
async function esperarLaEncuesta(sessionId, { estados = ["enviada", "fallida"], ms = 5000 } = {}) {
    const hasta = Date.now() + ms;
    while (Date.now() < hasta) {
        const filas = await db.$queryRawUnsafe(
            `SELECT "estado" FROM "encuestas_satisfaccion" WHERE "sessionId" = $1 ORDER BY "creadaEn" DESC LIMIT 1`,
            sessionId,
        ).catch(() => []);
        if (filas[0] && estados.includes(filas[0].estado)) return filas[0].estado;
        await new Promise((r) => setTimeout(r, 50));
    }
    return null;
}

async function lasEncuestas(sessionId) {
    return db.$queryRawUnsafe(
        `SELECT * FROM "encuestas_satisfaccion" WHERE "sessionId" = $1 ORDER BY "creadaEn" ASC`,
        sessionId,
    ).catch(() => []);
}

const S = {};

test.before(async () => {
    await db.$executeRawUnsafe(`ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMP(3)`);
    const servidor = await db.apiKey.create({ data: { url: SERVIDOR, key: `clave-${V}` } });
    await db.user.create({ data: { id: MADRE, email: `${MADRE}@banco.test`, name: "Madre", company: "Tienda Sol", apiKeyId: servidor.id } });
    await db.user.create({ data: { id: HIJA, email: `${HIJA}@banco.test`, name: "Hija", apiKeyId: servidor.id } });
    await db.user.create({ data: { id: AJENA, email: `${AJENA}@banco.test`, name: "Ajena" } });
    await db.user.create({ data: { id: ASESORA, email: `${ASESORA}@banco.test`, name: "Ana Asesora", ownerId: MADRE, advisorRole: "agente" } });
    await db.user.create({ data: { id: AGENTE, email: `${AGENTE}@banco.test`, name: "Agente", ownerId: MADRE, advisorRole: "agente" } });
    await db.$executeRawUnsafe(
        `INSERT INTO "linked_accounts" ("id", "master_user_id", "linked_user_id") VALUES ($1, $2, $3)`,
        `nps-la-${V}`, MADRE, HIJA,
    );
    await db.instancia.create({ data: { instanceName: LINEA, instanceId: LINEA, userId: MADRE, instanceType: "Whatsapp" } });
    await db.instancia.create({ data: { instanceName: LINEA_HIJA, instanceId: LINEA_HIJA, userId: HIJA, instanceType: "Whatsapp" } });

    const crear = (userId, instanceId, remoteJid, extra = {}) =>
        db.session.create({
            data: { userId, instanceId, remoteJid, pushName: "Cliente", status: true, ...extra },
            select: { id: true },
        });
    S.conAsesora = (await crear(MADRE, LINEA, `5731${V.slice(-6)}01@s.whatsapp.net`, { assignedAdvisorId: ASESORA })).id;
    S.sinAsesor = (await crear(MADRE, LINEA, `99${V.slice(-6)}02@lid`, { remoteJidAlt: `5731${V.slice(-6)}02@s.whatsapp.net` })).id;
    S.apagada = (await crear(MADRE, LINEA, `5731${V.slice(-6)}03@s.whatsapp.net`)).id;
    S.grupo = (await crear(MADRE, LINEA, `1203${V.slice(-6)}@g.us`)).id;
    S.falla = (await crear(MADRE, LINEA, `5731${V.slice(-6)}05@s.whatsapp.net`)).id;
    S.deLaHija = (await crear(HIJA, LINEA_HIJA, `5731${V.slice(-6)}06@s.whatsapp.net`)).id;
});

test("apagada por defecto: resolver NO pregunta nada", { skip: ROTO }, async () => {
    ponerAQuienMira(quien(MADRE));
    const res = await resolveSession(S.apagada);
    assert.equal(res.success, true);
    await new Promise((r) => setTimeout(r, 300));
    assert.equal((await lasEncuestas(S.apagada)).length, 0);
    assert.equal(enviados.length, 0);
});

test("el interruptor: la cuenta lo enciende, un agente no", { skip: ROTO }, async () => {
    ponerAQuienMira(quien(MADRE));
    assert.equal((await m.getAjustesDeLaEncuesta()).activa, false);
    assert.match((await m.getAjustesDeLaEncuesta()).mensaje, /Tienda Sol/, "la vista previa es el mensaje de verdad");

    ponerAQuienMira(quien(AGENTE, { ownerId: MADRE, advisorRole: "agente", effectiveId: MADRE }));
    const delAgente = await m.guardarEncuestaActiva(true);
    assert.equal(delAgente.success, false);

    ponerAQuienMira(quien(MADRE));
    assert.equal((await m.guardarEncuestaActiva(true)).success, true);
    assert.equal((await m.getAjustesDeLaEncuesta()).activa, true);
    await m.guardarLosAjustesDeLaEncuesta(HIJA, true);
});

test("MODO=roto: con la encuesta ENCENDIDA, el resolver de antes no preguntaba nada", { skip: !ROTO }, async () => {
    await guardarLosAjustesDeLaEncuesta(MADRE, true);
    ponerAQuienMira(quien(MADRE));
    const res = await resolveSession(S.conAsesora);
    assert.equal(res.success, true);
    await new Promise((r) => setTimeout(r, 500));
    assert.equal(enviados.length, 0, "el fallo: no salió ninguna pregunta");
    assert.equal((await lasEncuestas(S.conAsesora)).length, 0, "el fallo: no quedó ninguna encuesta");
});

test("resolver con la encuesta encendida: sale por la línea de la conversación", { skip: ROTO }, async () => {
    ponerAQuienMira(quien(MADRE));
    assert.equal((await resolveSession(S.conAsesora)).success, true);
    assert.equal(await esperarLaEncuesta(S.conAsesora), "enviada");
    const [envio] = enviados;
    assert.ok(envio, "salió una petición a Evolution");
    assert.equal(envio.url, `${SERVIDOR}/message/sendText/${encodeURIComponent(LINEA)}`);
    assert.match(envio.body.number, new RegExp(`5731${V.slice(-6)}01`));
    assert.match(envio.body.text, /Del 1 al 10/);
    assert.match(envio.body.text, /Tienda Sol/);
    const [fila] = await lasEncuestas(S.conAsesora);
    assert.equal(fila.asesorId, ASESORA, "el asesor que tenía la conversación al resolverla");
    assert.equal(fila.instanceName, LINEA);
});

test("no se repite: resolver otra vez no le pregunta dos veces", { skip: ROTO }, async () => {
    const antes = enviados.length;
    ponerAQuienMira(quien(MADRE));
    await resolveSession(S.conAsesora);
    await resolveSession(S.conAsesora);
    await new Promise((r) => setTimeout(r, 500));
    assert.equal(enviados.length, antes);
    assert.equal((await lasEncuestas(S.conAsesora)).length, 1);
});

test("a un grupo no se le pregunta", { skip: ROTO }, async () => {
    const antes = enviados.length;
    const r = await m.mandarLaEncuestaDeSatisfaccion(S.grupo, null);
    assert.equal(r.estado, "omitida");
    assert.equal(enviados.length, antes);
});

test("si Evolution no la acepta, queda FALLIDA con su motivo, y no bloquea otra", { skip: ROTO }, async () => {
    respuestaDeEvolution = { status: 500, body: { error: "caído" } };
    const r = await m.mandarLaEncuestaDeSatisfaccion(S.falla, null);
    assert.equal(r.estado, "fallida");
    const [fila] = await lasEncuestas(S.falla);
    assert.equal(fila.estado, "fallida");
    assert.match(fila.motivo, /500/);
    respuestaDeEvolution = { status: 200, body: { key: { id: "msg-2" } } };
    assert.equal((await m.mandarLaEncuestaDeSatisfaccion(S.falla, null)).estado, "enviada");
});

test("la respuesta del cliente queda en su FICHA y en el NPS, por la identidad que sea", { skip: ROTO }, async () => {
    ponerAQuienMira(quien(MADRE));
    // Sin asesor, y el cliente contesta por su número —la conversación está
    // abierta por su @lid—.
    await resolveSession(S.sinAsesor);
    assert.equal(await esperarLaEncuesta(S.sinAsesor), "enviada");
    const luego = new Date(Date.now() + 2000);
    await persistChatMessage({
        userId: MADRE, instanceName: LINEA, remoteJid: `5731${V.slice(-6)}02@s.whatsapp.net`,
        messageId: `r2-${V}`, fromMe: false, content: "un 3", messageTimestamp: luego,
    });
    await persistChatMessage({
        userId: MADRE, instanceName: LINEA, remoteJid: `5731${V.slice(-6)}01@s.whatsapp.net`,
        messageId: `r1a-${V}`, fromMe: false, content: "Gracias!", messageTimestamp: luego,
    });
    await persistChatMessage({
        userId: MADRE, instanceName: LINEA, remoteJid: `5731${V.slice(-6)}01@s.whatsapp.net`,
        messageId: `r1b-${V}`, fromMe: false, content: "Le doy un 10", messageTimestamp: new Date(luego.getTime() + 1000),
    });

    const ficha = await m.getEncuestasDelContactoAction(S.conAsesora);
    assert.equal(ficha.success, true);
    assert.equal(ficha.encuestas[0].puntuacion, 10);
    assert.equal(ficha.encuestas[0].categoria, "promotor");
    assert.equal(ficha.encuestas[0].asesor, "Ana Asesora");

    const nps = await m.getNpsDelCrm({ days: 30 });
    assert.equal(nps.resumen.respuestas, 2);
    assert.equal(nps.resumen.promotores, 1);
    assert.equal(nps.resumen.detractores, 1);
    assert.equal(nps.resumen.nps, 0);
    const ana = nps.porAsesor.find((f) => f.asesorId === ASESORA);
    const sin = nps.porAsesor.find((f) => f.asesorId === null);
    assert.equal(ana.nombre, "Ana Asesora");
    assert.equal(ana.nps, 100);
    assert.equal(sin.nombre, "Sin asesor (IA)");
    assert.equal(sin.nps, -100);
});

test("el alcance es el del CRM: la madre ve a su hija; la hija y la ajena, no hacia arriba", { skip: ROTO }, async () => {
    ponerAQuienMira(quien(MADRE));
    // La madre resuelve una conversación de su HIJA: manda el interruptor de la
    // hija, y sale por la línea de la hija.
    assert.equal((await resolveSession(S.deLaHija)).success, true);
    assert.equal(await esperarLaEncuesta(S.deLaHija), "enviada");
    assert.equal(enviados.at(-1).url, `${SERVIDOR}/message/sendText/${encodeURIComponent(LINEA_HIJA)}`);
    await persistChatMessage({
        userId: HIJA, instanceName: LINEA_HIJA, remoteJid: `5731${V.slice(-6)}06@s.whatsapp.net`,
        messageId: `r6-${V}`, fromMe: false, content: "8", messageTimestamp: new Date(Date.now() + 2000),
    });

    const deLaMadre = await m.getNpsDelCrm({ days: 30 });
    assert.equal(deLaMadre.resumen.respuestas, 3, "la madre suma lo de su hija");
    const soloLaHija = await m.getNpsDelCrm({ days: 30, cuentas: [HIJA] });
    assert.equal(soloLaHija.resumen.respuestas, 1);
    assert.equal(soloLaHija.resumen.pasivos, 1);

    ponerAQuienMira(quien(HIJA));
    const deLaHija = await m.getNpsDelCrm({ days: 30, cuentas: [MADRE, HIJA] });
    assert.equal(deLaHija.resumen.respuestas, 1, "la hija no ve lo de su madre ni pidiéndolo");
    assert.equal((await m.getEncuestasDelContactoAction(S.conAsesora)).success, false);

    ponerAQuienMira(quien(AJENA));
    assert.equal((await m.getNpsDelCrm({ days: 30, cuentas: [MADRE] })).resumen.respuestas, 0);
    assert.equal((await m.getEncuestasDelContactoAction(S.conAsesora)).encuestas.length, 0);
});

test("sin respuesta en la ventana, se cierra como «sin respuesta»", { skip: ROTO }, async () => {
    // S.falla quedó enviada y el cliente no contestó nada.
    const dentroDeUnMes = new Date(Date.now() + 30 * 86_400_000);
    const r = await m.recogerLasRespuestas({ sessionId: S.falla }, dentroDeUnMes);
    assert.equal(r.cerradas, 1);
    const filas = await lasEncuestas(S.falla);
    assert.equal(filas.at(-1).estado, "sin_respuesta");
});

test.after(async () => {
    await db.$disconnect();
});
