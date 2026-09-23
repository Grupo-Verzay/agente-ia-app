/**
 * El banco de «el marcador de CRM › Llamadas llama por la cuenta elegida».
 *
 * Contra Postgres, con las acciones de verdad y una familia sembrada:
 *
 *   carlos ─▶ madre ─▶ ventas (número + línea QR)
 *        │         └─▶ pruebas (línea QR, SIN número)
 *        └─▶ hermana
 *   ajena (sin vínculos) · agente (equipo de la madre)
 *
 *   A. qué cuentas OFRECE el «Vía:» — hacia abajo, nunca arriba ni a los lados;
 *   B. elegida una cuenta, la llamada SALE por su número, se REGISTRA en ella y
 *      la transcripción se COBRA a ella — por los dos botones;
 *   C. la propia sigue siendo exactamente lo de antes;
 *   D. lo que llega del navegador no decide: una hija no llama por su madre.
 */
import test from "node:test";
import assert from "node:assert/strict";

const sello = `n${Date.now().toString(36)}`;

const {
    ponerAQuienMira,
    cuentasParaLlamarAction,
    startBotCallAction,
    startAstraCall,
    logOutgoingCallAction,
    lasOpcionesDeLlamada,
    laOpcionPorDefecto,
    SIN_NUMERO,
    SIN_LINEA_QR,
    ESPERA_ENTRE_INTENTOS_MS,
    db,
} = await import("./.compilado/llamar-por-cuenta/entrada-de-llamar-por-cuenta.js");

const carlos = `carlos-${sello}`;
const madre = `madre-${sello}`;
const ventas = `ventas-${sello}`;
const pruebas = `pruebas-${sello}`;
const hermana = `hermana-${sello}`;
const ajena = `ajena-${sello}`;
const agente = `agente-${sello}`;
const SID = { carlos: `sid-c-${sello}`, madre: `sid-m-${sello}`, ventas: `sid-v-${sello}`, hermana: `sid-h-${sello}`, ajena: `sid-a-${sello}` };
const LINEA = { madre: `MADRE_${sello}`, ventas: `VENTAS_${sello}`, pruebas: `PRUEBAS_${sello}`, carlos: `CARLOS_${sello}`, hermana: `HERMANA_${sello}` };
const TELEFONO = "573009998877";
const SEGUNDOS = 12;

function wavDe(segundos) {
    const canales = 2, sampleRate = 16000, bits = 16, bpm = (bits / 8) * canales, datos = segundos * sampleRate * bpm;
    const buf = Buffer.alloc(44 + datos);
    buf.write("RIFF", 0, "ascii"); buf.writeUInt32LE(36 + datos, 4); buf.write("WAVE", 8, "ascii");
    buf.write("fmt ", 12, "ascii"); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
    buf.writeUInt16LE(canales, 22); buf.writeUInt32LE(sampleRate, 24); buf.writeUInt32LE(sampleRate * bpm, 28);
    buf.writeUInt16LE(bpm, 32); buf.writeUInt16LE(bits, 34); buf.write("data", 36, "ascii"); buf.writeUInt32LE(datos, 40);
    return buf;
}
const WAV = wavDe(SEGUNDOS);

const lanzadas = [];
const fetchDeVerdad = globalThis.fetch;
const setTimeoutDeVerdad = globalThis.setTimeout;
globalThis.fetch = async (url) => {
    const u = String(url);
    const lanzar = u.match(/\/api\/sessions\/([^/]+)\/calls(\/bot)?$/);
    if (lanzar) {
        lanzadas.push({ sid: lanzar[1], ia: Boolean(lanzar[2]) });
        const callId = `call-${sello}-${lanzadas.length}`;
        return { ok: true, status: 200, json: async () => ({ call: { callId }, callId }), text: async () => "" };
    }
    if (/\/recording$/.test(u)) {
        return { ok: true, status: 200, arrayBuffer: async () => WAV.buffer.slice(WAV.byteOffset, WAV.byteOffset + WAV.byteLength) };
    }
    throw new Error(`el banco no esperaba esta petición: ${u}`);
};
globalThis.setTimeout = (fn, ms, ...resto) => setTimeoutDeVerdad(fn, ms === ESPERA_ENTRE_INTENTOS_MS ? 1 : ms, ...resto);

async function hasta(fn, ms = 8000) {
    const fin = Date.now() + ms;
    while (Date.now() < fin) {
        const v = await fn();
        if (v) return v;
        await new Promise((r) => setTimeoutDeVerdad(r, 40));
    }
    return fn();
}
const usados = async (userId) => (await db.iaCredit.findUnique({ where: { userId } }))?.used ?? null;
const fila = (u) => ({ id: u, email: `${u}@b.co`, role: "user", effectiveId: u, sessionUserId: u });
const mira = {
    madre: fila(madre),
    ventas: fila(ventas),
    agente: { ...fila(agente), ownerId: madre, advisorRole: "agente", effectiveId: madre },
};

/* ── P. La decisión, pura ───────────────────────────────────────────────── */

test("P · la propia va primero y SIN línea; lo que no puede llamar dice por qué", () => {
    const op = lasOpcionesDeLlamada([
        { id: "z", nombre: "Zeta", esLaPropia: false, lineaQr: "Z", tieneNumero: true },
        { id: "s", nombre: "Sin línea", esLaPropia: false, lineaQr: null, tieneNumero: true },
        { id: "n", nombre: "Nula", esLaPropia: false, lineaQr: "N", tieneNumero: false },
        { id: "p", nombre: "Propia", esLaPropia: true, lineaQr: "P", tieneNumero: true },
    ]);
    assert.deepEqual(op.map((o) => o.id), ["p", "n", "s", "z"]);
    assert.equal(op[0].instanceName, null, "la propia tiene que llamar como siempre, sin línea");
    assert.equal(op.find((o) => o.id === "z").instanceName, "Z");
    assert.equal(op.find((o) => o.id === "n").motivo, SIN_NUMERO);
    assert.equal(op.find((o) => o.id === "s").motivo, SIN_LINEA_QR);
    assert.equal(laOpcionPorDefecto(op), "p");
    // La propia sin línea QR SÍ puede llamar a mano: es lo que ya hacía.
    const sola = lasOpcionesDeLlamada([{ id: "p", nombre: "P", esLaPropia: true, lineaQr: null, tieneNumero: true }]);
    assert.equal(sola[0].motivo, null);
});

/* ── S. La siembra ──────────────────────────────────────────────────────── */

test("S · siembra", async () => {
    const usuarios = [
        [carlos, "Carlos Arcos", SID.carlos, null],
        [madre, "Grupo Verzay", SID.madre, null],
        [ventas, "Verzay Ventas", SID.ventas, null],
        [pruebas, "Verzay Pruebas", null, null],
        [hermana, "Verzay Atencion", SID.hermana, null],
        [ajena, "Otra Empresa", SID.ajena, null],
        [agente, "Agente de la madre", null, madre],
    ];
    for (const [id, name, sid, ownerId] of usuarios) {
        await db.user.create({ data: { id, email: `${id}@b.co`, name, role: "user", astraCallsSid: sid, ownerId, ...(ownerId ? { advisorRole: "agente" } : {}) } });
    }
    let n = 0;
    for (const [m, h] of [[carlos, madre], [carlos, hermana], [madre, ventas], [madre, pruebas]]) {
        await db.$executeRawUnsafe(`INSERT INTO "linked_accounts" ("id","master_user_id","linked_user_id") VALUES ($1,$2,$3)`, `lnk-${sello}-${++n}`, m, h);
    }
    for (const [dueno, linea] of [[madre, LINEA.madre], [ventas, LINEA.ventas], [pruebas, LINEA.pruebas], [carlos, LINEA.carlos], [hermana, LINEA.hermana]]) {
        await db.instancia.create({ data: { userId: dueno, instanceId: `i-${linea}`, instanceName: linea, instanceType: "waha" } });
    }
    const prov =
        (await db.aiProvider.findUnique({ where: { name: "openai" } })) ??
        (await db.aiProvider.create({ data: { id: `prov-${sello}`, name: "openai", aiModel: "gpt-4o-mini" } }));
    for (const u of [madre, ventas]) {
        await db.userAiConfig.create({ data: { userId: u, providerId: prov.id, apiKey: `sk-${u}`, isActive: true } });
        await db.iaCredit.create({ data: { userId: u, total: 1000, used: 0, renewalDate: new Date() } });
    }
});

/* ── A. Qué ofrece el «Vía:» ────────────────────────────────────────────── */

test("A1 · la madre: ella (preseleccionada) y sus dos hijas; nunca Carlos, su hermana ni una ajena", async () => {
    ponerAQuienMira(mira.madre);
    const r = await cuentasParaLlamarAction();
    assert.equal(r.success, true, r.message);
    assert.deepEqual(r.opciones.map((o) => o.id), [madre, pruebas, ventas]);
    assert.equal(laOpcionPorDefecto(r.opciones), madre);
    const porId = Object.fromEntries(r.opciones.map((o) => [o.id, o]));
    assert.equal(porId[madre].instanceName, null);
    assert.equal(porId[ventas].instanceName, LINEA.ventas);
    assert.equal(porId[ventas].motivo, null);
    assert.equal(porId[pruebas].motivo, SIN_NUMERO, "una cuenta sin número se enseña apagada y con su motivo");
    globalThis.__opcionVentas = porId[ventas];
});

test("A2 · una hija solo se ve a sí misma: no a su madre ni a su hermana", async () => {
    ponerAQuienMira(mira.ventas);
    const r = await cuentasParaLlamarAction();
    assert.equal(r.success, true);
    assert.deepEqual(r.opciones.map((o) => o.id), [ventas]);
});

test("A3 · un agente de la madre llama solo con la madre", async () => {
    ponerAQuienMira(mira.agente);
    const r = await cuentasParaLlamarAction();
    assert.equal(r.success, true);
    assert.deepEqual(r.opciones.map((o) => o.id), [madre]);
});

/* ── B. Elegida Ventas ──────────────────────────────────────────────────── */

test("B1 · Llamar IA por Ventas: sale por el número de Ventas y se registra en Ventas", async () => {
    ponerAQuienMira(mira.madre);
    const r = await startBotCallAction(TELEFONO, globalThis.__opcionVentas.instanceName);
    assert.equal(r.success, true, r.message);
    assert.deepEqual(lanzadas.at(-1), { sid: SID.ventas, ia: true });
    const f = await db.chatMessage.findFirst({
        where: { messageType: "call", remoteJid: { startsWith: TELEFONO }, raw: { path: ["call", "isBot"], equals: true } },
        orderBy: { id: "desc" },
        select: { id: true, userId: true, instanceName: true },
    });
    assert.ok(f, "la llamada con IA no quedó registrada");
    assert.equal(f.userId, ventas);
    assert.equal(f.instanceName, LINEA.ventas);
    globalThis.__filaIa = f.id;
});

test("B2 · los créditos de la transcripción salen de Ventas, no de la madre", async () => {
    const t = await hasta(async () =>
        (await db.chatMessage.findFirst({ where: { id: globalThis.__filaIa }, select: { raw: true } }))?.raw?.call?.transcript,
    );
    assert.ok(t, "la llamada no llegó a transcribirse");
    assert.ok((await usados(ventas)) > 0, "no se cobró a Ventas");
    assert.equal(await usados(madre), 0, "se cobró a la madre una llamada de Ventas");
});

test("B3 · Llamar (a mano) por Ventas: número de Ventas y registro en Ventas", async () => {
    ponerAQuienMira(mira.madre);
    const linea = globalThis.__opcionVentas.instanceName;
    const r = await startAstraCall(`+${TELEFONO}`, linea);
    assert.equal(r.success, true, r.message);
    assert.deepEqual(lanzadas.at(-1), { sid: SID.ventas, ia: false });
    const reg = await logOutgoingCallAction(TELEFONO, 30, false, undefined, { astraSid: r.sid, astraCallId: r.callId, provider: "astra" }, linea);
    assert.equal(reg.userId, ventas);
});

/* ── C. La propia, como siempre ─────────────────────────────────────────── */

test("C1 · por la propia (sin línea): número y registro de la madre", async () => {
    ponerAQuienMira(mira.madre);
    const r = await startBotCallAction(TELEFONO, null);
    assert.equal(r.success, true, r.message);
    assert.deepEqual(lanzadas.at(-1), { sid: SID.madre, ia: true });
    const m = await startAstraCall(`+${TELEFONO}`, null);
    assert.equal(m.success, true);
    assert.equal(lanzadas.at(-1).sid, SID.madre);
    const reg = await logOutgoingCallAction(TELEFONO, 5, false, undefined, {}, null);
    assert.equal(reg.userId, madre);
});

/* ── D. La puerta sigue en el servidor ──────────────────────────────────── */

test("D1 · una hija que manda a mano la línea de su madre no llama", async () => {
    ponerAQuienMira(mira.ventas);
    const antes = lanzadas.length;
    for (const r of [await startBotCallAction(TELEFONO, LINEA.madre), await startAstraCall(`+${TELEFONO}`, LINEA.madre)]) {
        assert.equal(r.success, false);
    }
    assert.equal(lanzadas.length, antes, "la hija llamó por la cuenta de su madre");
});

test("D2 · la madre tampoco sube a Carlos ni cruza a su hermana", async () => {
    ponerAQuienMira(mira.madre);
    const antes = lanzadas.length;
    for (const l of [LINEA.carlos, LINEA.hermana]) {
        assert.equal((await startBotCallAction(TELEFONO, l)).success, false);
        assert.equal((await startAstraCall(`+${TELEFONO}`, l)).success, false);
    }
    assert.equal(lanzadas.length, antes);
});

test("Z · se recoge", async () => {
    await new Promise((r) => setTimeoutDeVerdad(r, 300));
    globalThis.fetch = fetchDeVerdad;
    globalThis.setTimeout = setTimeoutDeVerdad;
    await db.$disconnect();
});
