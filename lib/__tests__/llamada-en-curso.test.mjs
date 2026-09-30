/**
 * El banco de «una llamada con IA a la vez por número».
 *
 * Se lanzaba otra llamada con IA al mismo cliente mientras la primera seguía
 * sonando o hablando (29 s de diferencia, visto en producción), y en la
 * conversación quedaban dos «Llamada realizada». Contra Postgres, con
 * `startBotCallAction` de verdad y el servidor de llamadas fingido:
 *
 *   A. la regla, pura;
 *   B. con la primera llamada VIVA, la segunda no sale y lo dice;
 *   C. el doble clic (las dos a la vez) deja UNA;
 *   D. terminada la primera, se puede volver a llamar;
 *   E. si el servidor de llamadas no contesta, se deja llamar;
 *   F. otro número sí llama.
 *
 * `MODO=roto` corre la acción de ANTES y afirma el duplicado.
 */
import test from "node:test";
import assert from "node:assert/strict";

const ROTO = process.env.MODO === "roto";
const sello = `e${Date.now().toString(36)}`;

const {
    ponerAQuienMira, startBotCallAction, hayUnaLlamadaEnCurso, lasLlamadasVivas,
    YA_HAY_UNA_LLAMADA_EN_CURSO, ESPERA_ENTRE_INTENTOS_MS, db,
} = await import("./.compilado/llamada-en-curso/entrada-de-llamada-en-curso.js");

const cuenta = `cuenta-${sello}`;
const SID = `sid-${sello}`;
const LINEA = `LINEA_${sello}`;
const TELEFONO = "573001112233";
const OTRO = "573004445566";

/** Lo que el servidor de llamadas tiene vivo ahora. */
let vivas = [];
let listaRota = false;
const lanzadas = [];
const setTimeoutDeVerdad = globalThis.setTimeout;
globalThis.fetch = async (url, init) => {
    const u = String(url);
    if (u.endsWith(`/api/sessions/${SID}/calls/bot`)) {
        const phone = JSON.parse(init?.body ?? "{}").phone;
        const callId = `call-${sello}-${lanzadas.length + 1}`;
        lanzadas.push({ phone, callId });
        vivas.push({ callId, stale: false });
        // El servidor tarda un poco en contestar: es la ventana del doble clic.
        await new Promise((r) => setTimeoutDeVerdad(r, 60));
        return { ok: true, status: 200, json: async () => ({ call: { callId } }) };
    }
    if (u.endsWith(`/api/sessions/${SID}/calls`)) {
        if (listaRota) return { ok: false, status: 502, json: async () => ({}) };
        return { ok: true, status: 200, json: async () => ({ active: vivas.length, calls: vivas }) };
    }
    if (/\/recording$/.test(u)) return { ok: false, status: 404, json: async () => ({}) };
    throw new Error(`el banco no esperaba esta petición: ${u}`);
};
// La espera de la grabación (media hora) no es de este banco: se traga, sin
// dejar un temporizador que mantenga vivo el proceso.
globalThis.setTimeout = (fn, ms, ...r) =>
    ms === ESPERA_ENTRE_INTENTOS_MS ? setTimeoutDeVerdad(() => {}, 0) : setTimeoutDeVerdad(fn, ms, ...r);

const alNumero = (tel) => lanzadas.filter((l) => l.phone === tel).length;
const filasDe = (tel) => db.$queryRawUnsafe(
    `SELECT count(*)::int AS n FROM chat_messages WHERE "userId" = $1 AND "messageId" LIKE $2`, cuenta, `callout\\_%\\_${tel}`,
).then((r) => r[0].n);

test("A · la regla: cuenta solo lo nuestro, vivo y no colgado", () => {
    assert.equal(hayUnaLlamadaEnCurso([], [{ callId: "x" }]), false);
    assert.equal(hayUnaLlamadaEnCurso(["a"], [{ callId: "b" }]), false);
    assert.equal(hayUnaLlamadaEnCurso(["a"], [{ callId: "a" }]), true);
    assert.equal(hayUnaLlamadaEnCurso(["a"], [{ callId: "a", stale: true }]), false, "una colgada no es una conversación");
    assert.deepEqual(lasLlamadasVivas(null), []);
    assert.deepEqual(lasLlamadasVivas({ calls: "x" }), []);
});

test("S · siembra", async () => {
    await db.user.create({ data: { id: cuenta, email: `${cuenta}@b.co`, name: "El Plomero SA", role: "user", astraCallsSid: SID } });
    await db.instancia.create({ data: { userId: cuenta, instanceId: `i-${LINEA}`, instanceName: LINEA, instanceType: "waha" } });
    ponerAQuienMira({ id: cuenta, email: `${cuenta}@b.co`, role: "user", effectiveId: cuenta, sessionUserId: cuenta });
});

test("B · con la primera viva, la segunda NO sale y lo dice", async () => {
    const r1 = await startBotCallAction(TELEFONO, LINEA);
    assert.equal(r1.success, true);
    const r2 = await startBotCallAction(TELEFONO, LINEA);
    if (ROTO) {
        assert.equal(r2.success, true, "antes salía la segunda");
        assert.equal(alNumero(TELEFONO), 2);
        assert.equal(await filasDe(TELEFONO), 2, "y quedaban dos «Llamada realizada»");
        return;
    }
    assert.equal(r2.success, false);
    assert.equal(r2.message, YA_HAY_UNA_LLAMADA_EN_CURSO);
    assert.equal(alNumero(TELEFONO), 1, "al servidor de llamadas se le pidió UNA");
    assert.equal(await filasDe(TELEFONO), 1, "y en la conversación queda UNA");
});

test("C · el doble clic (las dos a la vez) deja UNA", { skip: ROTO }, async () => {
    const [a, b] = await Promise.all([startBotCallAction(OTRO, LINEA), startBotCallAction(OTRO, LINEA)]);
    assert.equal([a, b].filter((r) => r.success).length, 1);
    assert.equal(alNumero(OTRO), 1);
    assert.equal(await filasDe(OTRO), 1);
});

test("D · terminada la llamada, se puede volver a llamar", { skip: ROTO }, async () => {
    vivas = [];
    assert.equal((await startBotCallAction(TELEFONO, LINEA)).success, true);
    assert.equal(alNumero(TELEFONO), 2);
});

test("E · si el servidor no dice qué está vivo, se deja llamar", { skip: ROTO }, async () => {
    listaRota = true;
    try {
        assert.equal((await startBotCallAction(TELEFONO, LINEA)).success, true);
        assert.equal(alNumero(TELEFONO), 3);
    } finally {
        listaRota = false;
    }
});

test("F · otro número sí llama aunque haya una en curso", { skip: ROTO }, async () => {
    assert.equal((await startBotCallAction("573007778899", LINEA)).success, true);
});

test("Z · se recoge", async () => {
    await db.$executeRawUnsafe(`DELETE FROM chat_messages WHERE "userId" = $1`, cuenta);
    await db.instancia.deleteMany({ where: { userId: cuenta } });
    await db.user.deleteMany({ where: { id: cuenta } });
    await db.$disconnect();
});
