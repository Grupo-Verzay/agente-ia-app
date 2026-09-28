/**
 * El banco de «la llamada y su transcripción las paga la MISMA cuenta».
 *
 * El reporte: la transcripción de una llamada falla con «No hay créditos
 * suficientes: hacen falta 14 y quedan 0» sobre una cuenta que sí tiene
 * créditos. La llamada la cobra el backend (`api-webhook`, #182) a la cuenta
 * dueña del `sid` de la sesión de llamadas, con desempate por el `id` menor;
 * la App leía el saldo —y cobraba— la cuenta bajo la que quedó la FILA. Con
 * dos cuentas compartiendo sid, esas dos preguntas contestan distinto.
 *
 *   P. la regla pura, idéntica a la del backend;
 *   Q. contra Postgres, con dos cuentas compartiendo sid: la transcripción la
 *      paga —y su saldo se lee de— la MISMA cuenta que devuelve la consulta
 *      del backend, escrita aquí literal, y con la clave de IA de esa cuenta;
 *   R. lo de siempre no cambia: sid propio paga la fila; sid de nadie, la fila.
 *
 * `MODO=roto` ejerce lo que había —pagaba la fila— sobre la MISMA siembra y
 * **afirma el fallo con su mensaje**, y que el backend cobró a otra cuenta.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const ROTO = process.env.MODO === "roto";
const sello = Date.now().toString(36);

const {
    ponerLoQueDiceLaIa,
    loQueSeLePidioALaIa,
    olvidarLoPedido,
    processCallRecordingForUser,
    queHacerConLaGrabacion,
    porQueNoSeTranscribio,
    cuantosTrozosDeVerdad,
    TOPE_DE_BYTES_DE_AUDIO,
    costoDeLaNota,
    elSaldoDeLaCuenta,
    laCuentaDelSid,
    laCuentaQuePaga,
    elDuenoDelSid,
    laMarcaDeLaLlamada,
    db,
} = await import("./.compilado/grabacion/entrada-de-grabacion.js");

/**
 * La consulta del BACKEND, literal (`voicebot.service.ts`, sus cuatro sitios
 * desde api-webhook#182). Es la otra punta: el banco encadena las dos en vez
 * de dar por hecho que coinciden.
 */
async function aQuienCobraElBackend(sid) {
    const filas = await db.$queryRawUnsafe(
        `SELECT "id" FROM "User" WHERE "astra_calls_sid" = $1 ORDER BY "id" ASC LIMIT 1`,
        sid,
    );
    return filas[0]?.id ?? null;
}

/* ── P. La regla ────────────────────────────────────────────────────────── */

test("P1 · la cuenta de un sid es la de `id` menor, llegue en el orden que llegue", () => {
    assert.equal(laCuentaDelSid(["b", "a", "c"]), "a");
    assert.equal(laCuentaDelSid(["c", "b", "a"]), "a");
    assert.equal(laCuentaDelSid([" ", null, undefined]), null);
    assert.equal(laCuentaDelSid([]), null);
});

test("P2 · sin dueño del sid paga la fila; con dueño, el dueño", () => {
    assert.equal(laCuentaQuePaga({ cuentaDeLaFila: "fila", duenoDelSid: null }), "fila");
    assert.equal(laCuentaQuePaga({ cuentaDeLaFila: "fila", duenoDelSid: "dueno" }), "dueno");
});

test("P3 · la consulta de la App lleva el MISMO desempate que la del backend", () => {
    if (ROTO) return;
    const app = readFileSync("lib/cuenta-que-paga-la-llamada.server.ts", "utf8");
    assert.match(app, /"astra_calls_sid"\s*=\s*\$\{limpio\}\s*ORDER BY "id" ASC LIMIT 1/);
    // Y si el backend está clonado al lado, se compara contra el de verdad.
    const backend = "/home/user/api-webhook/src/modules/voicebot/cuenta-del-sid.ts";
    if (existsSync(backend)) {
        assert.match(readFileSync(backend, "utf8"), /DESEMPATE_DEL_SID = 'ORDER BY "id" ASC LIMIT 1'/);
    }
});

test("P4 · barrido: las dos grabaciones preguntan quién paga, y la CLAVE sale de quien paga", () => {
    if (ROTO) return;
    const s = readFileSync("lib/grabacion-de-llamada.server.ts", "utf8");
    assert.ok(!/getUserAiConfig\((input\.)?userId\)/.test(s), "la clave no puede salir de la fila");
    assert.equal((s.match(/getUserAiConfig\(paga\)/g) ?? []).length, 2);
    assert.match(s, /laCuentaQuePagaLaLlamada\(\{\s*cuentaDeLaFila: input\.userId,\s*astraSid: input\.astraSid/);
});

/* ── La red: el servidor de llamadas entrega la grabación ─────────────────── */

function wavDe(segundos) {
    const canales = 2, sampleRate = 16000, bits = 16;
    const bpm = (bits / 8) * canales;
    const datos = segundos * sampleRate * bpm;
    const buf = Buffer.alloc(44 + datos);
    buf.write("RIFF", 0, "ascii");
    buf.writeUInt32LE(36 + datos, 4);
    buf.write("WAVE", 8, "ascii");
    buf.write("fmt ", 12, "ascii");
    buf.writeUInt32LE(16, 16);
    buf.writeUInt16LE(1, 20);
    buf.writeUInt16LE(canales, 22);
    buf.writeUInt32LE(sampleRate, 24);
    buf.writeUInt32LE(sampleRate * bpm, 28);
    buf.writeUInt16LE(bpm, 32);
    buf.writeUInt16LE(bits, 34);
    buf.write("data", 36, "ascii");
    buf.writeUInt32LE(datos, 40);
    return buf;
}

// 140 s: los 14 créditos de la captura.
const SEGUNDOS = 140;
const WAV = wavDe(SEGUNDOS);
const fetchDeVerdad = globalThis.fetch;

/* ── Q. Dos cuentas, un sid ─────────────────────────────────────────────── */

// `a-` < `b-`: la que devuelve el backend es la PAGADORA, no la de la fila.
const pagadora = `a-pagadora-${sello}`;
const fila = `b-fila-${sello}`;
const SID_COMPARTIDO = `sid-compartido-${sello}`;
const LINEA = `FILA_${sello}`;

async function laLlamada(id) {
    const f = await db.chatMessage.findFirst({ where: { id: BigInt(id) }, select: { raw: true } });
    return f?.raw?.call ?? {};
}

async function usados(userId) {
    return (await db.iaCredit.findUnique({ where: { userId } }))?.used ?? null;
}

async function unaLlamada(userId, instanceName, sid, callId) {
    const r = await db.chatMessage.create({
        data: {
            userId,
            instanceName,
            instanceType: "evolution",
            remoteJid: "573001118888@s.whatsapp.net",
            messageId: `callout_${callId}`,
            fromMe: true,
            messageType: "call",
            content: "Llamada con IA realizada",
            messageTimestamp: new Date(),
            raw: { call: { astraSid: sid, astraCallId: callId, durationSecs: SEGUNDOS } },
        },
        select: { id: true },
    });
    return String(r.id);
}

test("Q0 · siembra: la pagadora con créditos, la cuenta de la fila a cero, el MISMO sid", async () => {
    const prov =
        (await db.aiProvider.findUnique({ where: { name: "openai" } })) ??
        (await db.aiProvider.create({ data: { id: `prov-${sello}`, name: "openai", aiModel: "gpt-4o-mini" } }));

    await db.user.create({
        data: { id: pagadora, email: `${pagadora}@b.co`, company: "Verzay | Ventas", name: "ventas", role: "user", astraCallsSid: SID_COMPARTIDO },
    });
    await db.user.create({
        data: { id: fila, email: `${fila}@b.co`, company: "Grupo Verzay", name: "madre", role: "user", astraCallsSid: SID_COMPARTIDO },
    });
    await db.instancia.create({ data: { userId: fila, instanceId: `i-${fila}`, instanceName: LINEA, instanceType: "waha" } });
    await db.userAiConfig.create({ data: { userId: pagadora, providerId: prov.id, apiKey: "sk-de-la-pagadora", isActive: true } });
    await db.userAiConfig.create({ data: { userId: fila, providerId: prov.id, apiKey: "sk-de-la-fila", isActive: true } });
    // La forma exacta del reporte: la fila a cero y quien pagó la llamada con créditos.
    await db.iaCredit.create({ data: { userId: pagadora, total: 1000, used: 0, renewalDate: new Date() } });
    await db.iaCredit.create({ data: { userId: fila, total: 100, used: 100 * 3085, renewalDate: new Date() } });

    globalThis.fetch = async (url) => {
        const u = String(url);
        if (/\/api\/sessions\/[^/]+\/calls\/[^/]+\/recording$/.test(u)) {
            return { ok: true, status: 200, arrayBuffer: async () => WAV.buffer.slice(WAV.byteOffset, WAV.byteOffset + WAV.byteLength) };
        }
        throw new Error(`el banco no esperaba esta petición: ${u}`);
    };
});

test("Q1 · el backend cobra la llamada a la de `id` menor, no a la de la fila", async () => {
    assert.equal(await aQuienCobraElBackend(SID_COMPARTIDO), pagadora);
    if (!ROTO) assert.equal(await elDuenoDelSid(SID_COMPARTIDO), pagadora, "la App y el backend eligen la MISMA");
});

test("Q2 · la transcripción la paga la MISMA cuenta que pagó la llamada", async () => {
    const callId = `call-q2-${sello}`;
    const id = await unaLlamada(fila, LINEA, SID_COMPARTIDO, callId);
    const costo = costoDeLaNota(SEGUNDOS);
    assert.equal(costo.creditos, 14, "los 14 créditos de la captura");

    if (ROTO) {
        // Lo que había: el saldo se leía de la cuenta de la FILA.
        const saldo = await elSaldoDeLaCuenta(fila);
        const que = queHacerConLaGrabacion({
            segundos: SEGUNDOS,
            bytes: WAV.length,
            trozos: cuantosTrozosDeVerdad(WAV, TOPE_DE_BYTES_DE_AUDIO),
            saldo,
        });
        assert.equal(que.hacer, "sin_creditos");
        assert.match(porQueNoSeTranscribio(que), /cuesta 14 y quedan 0/);
        // …sobre una llamada que el backend acababa de cobrarle a OTRA cuenta con créditos.
        assert.notEqual(await aQuienCobraElBackend(SID_COMPARTIDO), fila);
        assert.equal((await elSaldoDeLaCuenta(pagadora)).estado, "quedan");
        return;
    }

    olvidarLoPedido();
    ponerLoQueDiceLaIa({ transcripcion: "Cliente: sí, me interesa.", resumen: "- Interesado." });
    const antesPag = await usados(pagadora);
    const antesFila = await usados(fila);

    const res = await processCallRecordingForUser({
        userId: fila,
        chatMessageId: id,
        astraSid: SID_COMPARTIDO,
        astraCallId: callId,
    });
    assert.equal(res.success, true, res.message);

    const call = await laLlamada(id);
    assert.ok(call.transcript, "con créditos en la cuenta que paga, se transcribe");
    assert.ok(call.summary, "y hay Resumen IA");
    assert.equal(call.transcripcion ?? null, null, "sin marca de «no hay créditos»");

    const cobrado = (await usados(pagadora)) - antesPag;
    assert.equal(cobrado, costo.tokens, "se descuenta de la cuenta que pagó la llamada");
    assert.equal(await usados(fila), antesFila, "y NADA de la cuenta de la fila");

    // Encadenado: quien cobró la transcripción es quien cobró la llamada.
    assert.equal(await aQuienCobraElBackend(SID_COMPARTIDO), pagadora);
});

test("Q3 · y con la CLAVE de IA de esa misma cuenta, no la de la fila", async () => {
    if (ROTO) return;
    const claves = new Set(loQueSeLePidioALaIa().map((p) => p.clave));
    assert.deepEqual([...claves], ["sk-de-la-pagadora"]);
});

test("Q4 · si la cuenta que pagó se queda sin créditos, la marca NOMBRA esa cuenta", async () => {
    if (ROTO) return;
    const callId = `call-q4-${sello}`;
    const id = await unaLlamada(fila, LINEA, SID_COMPARTIDO, callId);
    const antes = await usados(pagadora);
    await db.iaCredit.update({ where: { userId: pagadora }, data: { used: 1000 * 3085 } });
    olvidarLoPedido();

    const res = await processCallRecordingForUser({ userId: fila, chatMessageId: id, astraSid: SID_COMPARTIDO, astraCallId: callId });
    assert.equal(res.motivo, "sin_creditos");
    const marca = laMarcaDeLaLlamada((await laLlamada(id)).transcripcion);
    assert.equal(marca?.cuenta, "Verzay | Ventas", "el aviso manda a mirar la bolsa que de verdad paga");
    assert.deepEqual(loQueSeLePidioALaIa(), []);
    await db.iaCredit.update({ where: { userId: pagadora }, data: { used: antes } });
});

/* ── R. Lo de siempre no cambia ─────────────────────────────────────────── */

test("R1 · sid propio: paga la cuenta de la fila, como siempre", async () => {
    if (ROTO) return;
    const sola = `c-sola-${sello}`;
    const sid = `sid-sola-${sello}`;
    const prov = await db.aiProvider.findUnique({ where: { name: "openai" } });
    await db.user.create({ data: { id: sola, email: `${sola}@b.co`, name: "sola", role: "user", astraCallsSid: sid } });
    await db.userAiConfig.create({ data: { userId: sola, providerId: prov.id, apiKey: "sk-sola", isActive: true } });
    await db.iaCredit.create({ data: { userId: sola, total: 1000, used: 0, renewalDate: new Date() } });
    const callId = `call-r1-${sello}`;
    const id = await unaLlamada(sola, `SOLA_${sello}`, sid, callId);
    olvidarLoPedido();

    const res = await processCallRecordingForUser({ userId: sola, chatMessageId: id, astraSid: sid, astraCallId: callId });
    assert.equal(res.success, true, res.message);
    assert.equal(await usados(sola), costoDeLaNota(SEGUNDOS).tokens);
    assert.equal(await aQuienCobraElBackend(sid), sola);
});

test("R2 · un sid que ya no es de nadie no inventa a nadie: paga la fila", async () => {
    if (ROTO) return;
    assert.equal(await elDuenoDelSid(`sid-de-nadie-${sello}`), null);
    assert.equal(await elDuenoDelSid(""), null);
    assert.equal(await elDuenoDelSid(null), null);
});

test("Z · se recoge", async () => {
    globalThis.fetch = fetchDeVerdad;
    await db.$disconnect();
});
