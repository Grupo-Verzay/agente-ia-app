/**
 * El banco de «la llamada es de la cuenta DUEÑA de la conversación».
 *
 * El encargo: estando la madre (Grupo Verzay) en una conversación de Verzay
 * Ventas y llamando, la llamada quedaba en la madre. Las cuatro cosas que tiene
 * que cumplir, cada una con su sección:
 *
 *   A. se REGISTRA en la cuenta dueña de la conversación;
 *   B. los CRÉDITOS salen de esa cuenta, no de la madre ni de la persona;
 *   C. SALE por la sesión de llamadas (el `sid`) de esa cuenta — de ahí saca
 *      AstraCalls la línea, el asistente y su configuración — y, si esa cuenta
 *      no tiene número, NO se llama con el de quien mira;
 *   D. aparece en el CRM de Llamadas de esa cuenta, con su línea.
 *
 * `MODO=roto` corre este MISMO fichero contra el código de un commit pinchado
 * y **afirma el fallo**.
 */
import test from "node:test";
import assert from "node:assert/strict";

const ROTO = process.env.MODO === "roto";
const sello = `${ROTO ? "r" : "n"}${Date.now().toString(36)}`;

const {
    ponerAQuienMira,
    olvidarLoPedido,
    startBotCallAction,
    startAstraCall,
    processCallRecordingAction,
    getCallsCrmData,
    ESPERA_ENTRE_INTENTOS_MS,
    costoDeLaNota,
    db,
} = await import(`./.compilado/${ROTO ? "cuenta-llamada-antes" : "cuenta-llamada"}/entrada-de-la-cuenta-de-la-llamada.js`);

/* ── La siembra: la familia de la casa ──────────────────────────────────── */

const madre = `madre-${sello}`;
const ventas = `ventas-${sello}`;
const pruebas = `pruebas-${sello}`;
const SID_MADRE = `sid-madre-${sello}`;
const SID_VENTAS = `sid-ventas-${sello}`;
const LINEA_MADRE = `MADRE_${sello}`;
const LINEA_VENTAS = `VENTAS_${sello}`;
const LINEA_PRUEBAS = `PRUEBAS_${sello}`;
const TELEFONO = "573001234567";
const SEGUNDOS = 20;

function wavDe(segundos) {
    const canales = 2, sampleRate = 16000, bits = 16;
    const bpm = (bits / 8) * canales;
    const datos = segundos * sampleRate * bpm;
    const buf = Buffer.alloc(44 + datos);
    buf.write("RIFF", 0, "ascii"); buf.writeUInt32LE(36 + datos, 4); buf.write("WAVE", 8, "ascii");
    buf.write("fmt ", 12, "ascii"); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
    buf.writeUInt16LE(canales, 22); buf.writeUInt32LE(sampleRate, 24); buf.writeUInt32LE(sampleRate * bpm, 28);
    buf.writeUInt16LE(bpm, 32); buf.writeUInt16LE(bits, 34); buf.write("data", 36, "ascii"); buf.writeUInt32LE(datos, 40);
    return buf;
}
const WAV = wavDe(SEGUNDOS);

/** A qué sesión de llamadas se habló, por orden. */
const lanzadas = [];
const fetchDeVerdad = globalThis.fetch;
const setTimeoutDeVerdad = globalThis.setTimeout;

function montarLaRed() {
    globalThis.fetch = async (url) => {
        const u = String(url);
        const lanzar = u.match(/\/api\/sessions\/([^/]+)\/calls(\/bot)?$/);
        if (lanzar) {
            lanzadas.push({ sid: lanzar[1], ia: Boolean(lanzar[2]) });
            const callId = `call-${sello}-${lanzadas.length}`;
            return { ok: true, status: 200, json: async () => ({ call: { callId }, callId }), text: async () => "" };
        }
        if (/\/api\/sessions\/[^/]+\/calls\/[^/]+\/recording$/.test(u)) {
            return { ok: true, status: 200, arrayBuffer: async () => WAV.buffer.slice(WAV.byteOffset, WAV.byteOffset + WAV.byteLength) };
        }
        throw new Error(`el banco no esperaba esta petición: ${u}`);
    };
    globalThis.setTimeout = (fn, ms, ...resto) =>
        setTimeoutDeVerdad(fn, ms === ESPERA_ENTRE_INTENTOS_MS ? 1 : ms, ...resto);
}

async function creditosUsados(userId) {
    return (await db.iaCredit.findUnique({ where: { userId } }))?.used ?? null;
}

async function laFila(id) {
    return db.chatMessage.findFirst({ where: { id: BigInt(id) }, select: { userId: true, instanceName: true, raw: true } });
}

async function hasta(fn, ms = 8000) {
    const fin = Date.now() + ms;
    while (Date.now() < fin) {
        const v = await fn();
        if (v) return v;
        await new Promise((r) => setTimeoutDeVerdad(r, 40));
    }
    return fn();
}

const mira = {
    madre: { id: madre, email: `${madre}@b.co`, role: "admin", effectiveId: madre, sessionUserId: madre },
    ventas: { id: ventas, email: `${ventas}@b.co`, role: "user", effectiveId: ventas, sessionUserId: ventas },
};

test("S · siembra: madre, Ventas con su número y Pruebas sin número", async () => {
    await db.user.create({ data: { id: madre, email: `${madre}@b.co`, name: "Grupo Verzay", role: "admin", astraCallsSid: SID_MADRE } });
    await db.user.create({ data: { id: ventas, email: `${ventas}@b.co`, name: "Verzay Ventas", role: "user", astraCallsSid: SID_VENTAS } });
    await db.user.create({ data: { id: pruebas, email: `${pruebas}@b.co`, name: "Verzay Pruebas", role: "user" } });
    for (const [hija, n] of [[ventas, 1], [pruebas, 2]]) {
        await db.$executeRawUnsafe(
            `INSERT INTO "linked_accounts" ("id","master_user_id","linked_user_id") VALUES ($1,$2,$3)`,
            `lnk-${sello}-${n}`, madre, hija,
        );
    }
    for (const [dueno, linea] of [[madre, LINEA_MADRE], [ventas, LINEA_VENTAS], [pruebas, LINEA_PRUEBAS]]) {
        await db.instancia.create({ data: { userId: dueno, instanceId: `i-${linea}`, instanceName: linea, instanceType: "waha" } });
    }
    const prov =
        (await db.aiProvider.findUnique({ where: { name: "openai" } })) ??
        (await db.aiProvider.create({ data: { id: `prov-${sello}`, name: "openai", aiModel: "gpt-4o-mini" } }));
    for (const u of [madre, ventas]) {
        await db.userAiConfig.create({ data: { userId: u, providerId: prov.id, apiKey: `sk-${u}`, isActive: true } });
        await db.iaCredit.create({ data: { userId: u, total: 1000, used: 0, renewalDate: new Date() } });
    }
    montarLaRed();
});

/* ── A + C. Llamar con IA desde una conversación de Ventas ──────────────── */

test("A1/C1 · la madre llama con IA desde Ventas: sale por el número de VENTAS y se registra en Ventas", async () => {
    ponerAQuienMira(mira.madre);
    olvidarLoPedido();
    const antes = lanzadas.length;
    const r = await startBotCallAction(TELEFONO, LINEA_VENTAS);
    assert.equal(r.success, true, r.message);
    const lanzada = lanzadas.at(-1);
    assert.equal(lanzadas.length, antes + 1);
    assert.equal(lanzada.ia, true);

    if (ROTO) {
        assert.equal(lanzada.sid, SID_MADRE, "el modo roto tiene que llamar con el número de la MADRE");
    } else {
        assert.equal(lanzada.sid, SID_VENTAS, "la llamada salió con el número de otra cuenta");
    }

    const fila = await db.chatMessage.findFirst({
        where: { messageType: "call", remoteJid: { startsWith: TELEFONO }, instanceName: LINEA_VENTAS },
        orderBy: { id: "desc" },
        select: { id: true, userId: true, raw: true },
    });
    assert.ok(fila, "la llamada no quedó registrada en la conversación de Ventas");
    assert.equal(fila.userId, ventas);
    if (!ROTO) assert.equal(fila.raw?.call?.astraSid, SID_VENTAS, "el registro apunta a la sesión de otra cuenta");
    globalThis.__filaIa = String(fila.id);
});

/* ── B. Los créditos ────────────────────────────────────────────────────── */

test("B1 · la transcripción la paga VENTAS, no la madre", async () => {
    const call = await hasta(async () => (await laFila(globalThis.__filaIa))?.raw?.call?.transcript);
    assert.ok(call, "la llamada no llegó a transcribirse");
    const esperado = costoDeLaNota(SEGUNDOS).tokens;
    if (ROTO) {
        assert.equal(await creditosUsados(madre), esperado, "el modo roto tiene que cobrarle a la MADRE");
        assert.equal(await creditosUsados(ventas), 0);
    } else {
        assert.equal(await creditosUsados(ventas), esperado, "no se le cobró a la cuenta de la conversación");
        assert.equal(await creditosUsados(madre), 0, "se le cobró a la madre una llamada de Ventas");
    }
});

test("B2 · procesar la grabación DESDE LA TARJETA encuentra la fila de Ventas y cobra a Ventas", async () => {
    ponerAQuienMira(mira.madre);
    const fila = await db.chatMessage.create({
        data: {
            userId: ventas,
            instanceName: LINEA_VENTAS,
            remoteJid: `${TELEFONO}@s.whatsapp.net`,
            messageId: `tarjeta-${sello}`,
            fromMe: true,
            messageType: "call",
            messageTimestamp: new Date(),
            raw: { call: { astraSid: SID_VENTAS, astraCallId: `tarjeta-${sello}`, durationSecs: 0 } },
        },
    });
    const antesVentas = await creditosUsados(ventas);
    const antesMadre = await creditosUsados(madre);
    const r = await processCallRecordingAction({
        chatMessageId: String(fila.id),
        astraSid: SID_VENTAS,
        astraCallId: `tarjeta-${sello}`,
    });
    if (ROTO) {
        // La acción buscaba la fila con la cuenta de quien mira (la madre) y
        // no la encontraba: la llamada se quedaba sin transcripción.
        assert.equal(r.success, false, "el modo roto no tiene que encontrar la fila");
        return;
    }
    assert.equal(r.success, true, r.message);
    assert.ok((await laFila(fila.id)).raw?.call?.transcript, "la fila de Ventas se quedó sin transcripción");
    assert.ok((await creditosUsados(ventas)) > antesVentas, "no se cobró a Ventas");
    assert.equal(await creditosUsados(madre), antesMadre, "se cobró a la madre");
});

/* ── C. Si la cuenta de la conversación no tiene número, NO se llama ────── */

test("C2 · a mano, desde Pruebas (sin número): no sale con el número de la madre", async () => {
    ponerAQuienMira(mira.madre);
    const antes = lanzadas.length;
    const r = await startAstraCall(`+${TELEFONO}`, LINEA_PRUEBAS);
    if (ROTO) {
        assert.equal(r.success, true, "el modo roto tiene que caer en el número de la madre");
        assert.equal(lanzadas.at(-1).sid, SID_MADRE);
        return;
    }
    assert.equal(r.success, false);
    assert.match(r.message ?? "", /número vinculado/);
    assert.equal(lanzadas.length, antes, "se llamó igualmente");
});

test("C3 · con IA, desde Pruebas (sin número): tampoco", async () => {
    ponerAQuienMira(mira.madre);
    const antes = lanzadas.length;
    const r = await startBotCallAction(TELEFONO, LINEA_PRUEBAS);
    if (ROTO) {
        assert.equal(r.success, true);
        assert.equal(lanzadas.at(-1).sid, SID_MADRE, "el modo roto tiene que llamar con el número de la madre");
        return;
    }
    assert.equal(r.success, false);
    assert.equal(lanzadas.length, antes, "se llamó igualmente");
});

test("C4 · a mano desde Ventas: número de Ventas", async () => {
    ponerAQuienMira(mira.madre);
    const r = await startAstraCall(`+${TELEFONO}`, LINEA_VENTAS);
    assert.equal(r.success, true, r.message);
    assert.equal(lanzadas.at(-1).sid, SID_VENTAS);
});

test("C5 · una hija NO llama desde la línea de su madre", async () => {
    ponerAQuienMira(mira.ventas);
    const antes = lanzadas.length;
    const r = await startBotCallAction(TELEFONO, LINEA_MADRE);
    if (ROTO) {
        // Antes la línea se ignoraba: salía con el número de Ventas igual.
        assert.equal(r.success, true);
        assert.equal(lanzadas.at(-1).sid, SID_VENTAS);
        return;
    }
    assert.equal(r.success, false);
    assert.equal(lanzadas.length, antes, "la hija llamó desde la línea de la madre");
});

test("C6 · sin línea (el marcador del CRM) sigue siendo la cuenta de quien mira", async () => {
    ponerAQuienMira(mira.madre);
    const r = await startBotCallAction(TELEFONO);
    assert.equal(r.success, true, r.message);
    assert.equal(lanzadas.at(-1).sid, SID_MADRE);
});

/* ── D. El CRM de Llamadas ──────────────────────────────────────────────── */

test("D1 · la llamada aparece en el CRM de VENTAS, con su línea", async () => {
    ponerAQuienMira(mira.ventas);
    const { calls } = await getCallsCrmData({ days: 7 });
    const de = calls.filter((c) => c.id === globalThis.__filaIa);
    assert.equal(de.length, 1, "la llamada no aparece en el CRM de Ventas");
    assert.equal(de[0].cuentaId, ventas);
    if (!ROTO) assert.equal(de[0].instanceName, LINEA_VENTAS, "sin línea, volver a llamar desde el CRM sale por otra");
});

test("D2 · en el CRM unificado de la madre sale como de Ventas, no como suya", async () => {
    ponerAQuienMira(mira.madre);
    const { calls } = await getCallsCrmData({ days: 7 });
    const fila = calls.find((c) => c.id === globalThis.__filaIa);
    assert.ok(fila);
    assert.equal(fila.cuentaId, ventas);
});

test("Z · se recoge", async () => {
    // Deja que terminen las esperas de fondo antes de cerrar la conexión.
    await new Promise((r) => setTimeoutDeVerdad(r, 300));
    globalThis.fetch = fetchDeVerdad;
    globalThis.setTimeout = setTimeoutDeVerdad;
    await db.$disconnect();
});
