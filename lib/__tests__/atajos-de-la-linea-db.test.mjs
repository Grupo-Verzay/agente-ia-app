/**
 * Los atajos por línea, contra Postgres y por las ACCIONES de verdad, con
 * `currentUser()` DE VERDAD (solo se finge la sesión de la petición).
 *
 * La familia es la de producción en pequeño: una madre (superadministradora)
 * que vinculó a Atención y a Ventas, y un asesor de Atención. Cada cuenta tiene
 * su línea de Waha, y Atención además un canal de Meta.
 *
 *   - Madre: un workflow y una respuesta rápida.
 *   - Atención: un workflow, otro creado por su asesor, y una respuesta rápida.
 *   - Ventas: NADA.
 *
 * Lo que se demuestra:
 *  1. El panel de una conversación de Atención ofrece solo lo de Atención —el
 *     del asesor incluido—, desde la madre y desde el asesor.
 *  2. Una conversación de Ventas sale vacía: ni lo de la madre ni lo de su
 *     hermana.
 *  3. El servidor NO deja lanzar un workflow ni mandar una respuesta rápida de
 *     otra cuenta por una línea, en los tres caminos (Evolution/Waha, Waha y
 *     canal). Y no sale NADA hacia el proveedor.
 *  4. `getWorkFlowByUserIds` ya no devuelve los de una cuenta que no se alcanza.
 *
 * `MODO=roto` empaqueta EXACTAMENTE estas pruebas contra el código de antes
 * (commit pinchado en el script) y afirma el fallo.
 */
import test from "node:test";
import assert from "node:assert/strict";

const ROTO = process.env.MODO === "roto";
const m = await import(
    ROTO ? "./.compilado/atajos-antes/entrada-de-atajos.js" : "./.compilado/atajos/entrada-de-atajos.js"
);
const {
    ponerLaSesion, loadChatBootstrapData, getWorkFlowByUserIds,
    sendWahaWorkflowAction, sendWahaQuickReplyAction, sendChannelQuickReplyAction, db,
} = m;
const { atajosDeLaConversacion } = await import("./.compilado/atajos/atajos-de-la-linea.js");

// Lo que el panel pintaba: antes, la lista entera; ahora, la de la cuenta.
const ofrecer = (todos, cuenta) => (ROTO ? [...todos] : atajosDeLaConversacion(todos, cuenta));

const V = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const MADRE = `at-madre-${V}`;
const ATENCION = `at-atencion-${V}`;
const VENTAS = `at-ventas-${V}`;
const ASESOR = `at-asesor-${V}`;
const CUENTAS = [MADRE, ATENCION, VENTAS];
const L = { madre: `LM_${V}`, atencion: `LA_${V}`, ventas: `LV_${V}`, meta: `LMETA_${V}` };
const CLIENTE = "573001112233@s.whatsapp.net";
const W = {};
const R = {};

// Todo lo que intente salir hacia un proveedor queda anotado aquí.
const salidas = [];
const fetchDeVerdad = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
    salidas.push({ url: String(url), body: String(init.body ?? "") });
    return new Response(JSON.stringify({ id: "msg-banco", key: { id: "msg-banco" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
    });
};
const salioElTexto = (texto) => salidas.some((s) => s.body.includes(texto));

test.before(async () => {
    await db.user.create({ data: { id: MADRE, email: `${MADRE}@b.t`, name: "Madre", role: "super_admin" } });
    for (const id of [ATENCION, VENTAS]) {
        await db.user.create({ data: { id, email: `${id}@b.t`, name: id, role: "admin" } });
    }
    await db.user.create({
        data: { id: ASESOR, email: `${ASESOR}@b.t`, name: "Asesor", role: "user", ownerId: ATENCION, advisorRole: "administrador" },
    });
    let n = 0;
    for (const hija of [ATENCION, VENTAS]) {
        await db.$executeRawUnsafe(
            `INSERT INTO "linked_accounts" ("id","master_user_id","linked_user_id","role") VALUES ($1,$2,$3,'agente')`,
            `at-la-${V}-${n++}`, MADRE, hija,
        );
    }
    await db.instancia.createMany({
        data: [
            { instanceName: L.madre, userId: MADRE, instanceId: `i-${L.madre}`, instanceType: "waha" },
            { instanceName: L.atencion, userId: ATENCION, instanceId: `i-${L.atencion}`, instanceType: "waha" },
            { instanceName: L.ventas, userId: VENTAS, instanceId: `i-${L.ventas}`, instanceType: "waha" },
            { instanceName: L.meta, userId: ATENCION, instanceId: `i-${L.meta}`, instanceType: "meta" },
        ],
    });
    const wf = (userId, name) =>
        db.workflow.create({ data: { userId, name: `${name}-${V}`, definition: "{}", status: "active" } });
    W.madre = await wf(MADRE, "BIENVENIDA MADRE");
    W.atencion = await wf(ATENCION, "SOPORTE ATENCION");
    W.asesor = await wf(ASESOR, "DEL ASESOR");
    const rr = (userId, mensaje) => db.quickReply.create({ data: { userId, mensaje, name: `rr${userId.slice(3, 6)}` } });
    R.madre = await rr(MADRE, `texto-de-la-madre-${V}`);
    R.atencion = await rr(ATENCION, `texto-de-atencion-${V}`);
    // El servidor de Waha: sin él la línea ni siquiera intenta salir.
    await db.siteConfig.upsert({
        where: { id: 1 },
        create: { id: 1, wahaUrl: "http://waha.banco", wahaApiKey: "banco" },
        update: { wahaUrl: "http://waha.banco", wahaApiKey: "banco" },
    });
});

test.after(async () => {
    globalThis.fetch = fetchDeVerdad;
    await db.quickReply.deleteMany({ where: { userId: { in: [...CUENTAS, ASESOR] } } });
    await db.workflow.deleteMany({ where: { userId: { in: [...CUENTAS, ASESOR] } } });
    await db.instancia.deleteMany({ where: { userId: { in: CUENTAS } } });
    await db.$executeRawUnsafe(`DELETE FROM "linked_accounts" WHERE "master_user_id" = $1`, MADRE);
    await db.chatMessage?.deleteMany?.({ where: { userId: { in: CUENTAS } } }).catch(() => {});
    await db.user.deleteMany({ where: { id: ASESOR } });
    await db.user.deleteMany({ where: { id: { in: CUENTAS } } });
    await db.$disconnect();
});

async function elPanel(sesion, cuentasDeLaBandeja) {
    ponerLaSesion(sesion);
    const r = await loadChatBootstrapData({ sessionUserIds: cuentasDeLaBandeja });
    assert.equal(r.success, true, r.message);
    return r.data;
}

// ── 1 y 2. Lo que ofrece el panel ─────────────────────────────────────────

test("1. desde la madre, una conversación de Atención ofrece solo lo de Atención", async () => {
    const data = await elPanel(MADRE, CUENTAS);
    const wf = ofrecer(data.workflows, ATENCION).map((w) => w.id).sort();
    const rr = ofrecer(data.quickReplies, ATENCION).map((q) => q.id);
    if (ROTO) {
        assert.ok(wf.includes(W.madre.id), "antes: el workflow de la madre salía en Atención");
        assert.ok(rr.includes(R.madre.id), "antes: la respuesta de la madre salía en Atención");
        return;
    }
    // El creado por el asesor cuelga de su PERSONA y la bandeja de la madre no
    // lo pide (eso no cambia aquí); lo que se prueba es que no se cuela nada
    // de otra cuenta.
    assert.deepEqual(wf, [W.atencion.id]);
    assert.deepEqual(rr, [R.atencion.id]);
});

test("2. una conversación de Ventas sale VACÍA: ni la madre ni la hermana", async () => {
    const data = await elPanel(MADRE, CUENTAS);
    const wf = ofrecer(data.workflows, VENTAS);
    const rr = ofrecer(data.quickReplies, VENTAS);
    if (ROTO) {
        assert.ok(wf.some((w) => w.id === W.atencion.id), "antes: Ventas ofrecía los de Atención");
        return;
    }
    assert.deepEqual(wf, []);
    assert.deepEqual(rr, []);
});

test("1. la conversación de la madre ofrece solo lo de la madre", async () => {
    const data = await elPanel(MADRE, CUENTAS);
    const wf = ofrecer(data.workflows, MADRE).map((w) => w.id);
    if (ROTO) return assert.ok(wf.includes(W.atencion.id));
    assert.deepEqual(wf, [W.madre.id]);
});

test("4. el asesor de Atención ve lo de su línea, con la misma regla", async () => {
    const data = await elPanel(ASESOR, [ATENCION]);
    const wf = ofrecer(data.workflows, ATENCION).map((w) => w.id).sort();
    assert.deepEqual(wf, [W.atencion.id, W.asesor.id].sort());
    assert.deepEqual(ofrecer(data.quickReplies, ATENCION).map((q) => q.id), [R.atencion.id]);
});

// ── 3. La puerta del servidor ─────────────────────────────────────────────

const RECHAZO = /no es de la cuenta de la línea/;

test("3. no se lanza el workflow de la madre por la línea de Ventas", async () => {
    ponerLaSesion(MADRE);
    const r = await sendWahaWorkflowAction(L.ventas, CLIENTE, W.madre.id);
    if (ROTO) return assert.doesNotMatch(r.message ?? "", RECHAZO, "antes: pasaba la puerta");
    assert.equal(r.success, false);
    assert.match(r.message, RECHAZO);
});

test("3. ni el de Atención por la línea de la madre", async () => {
    ponerLaSesion(MADRE);
    const r = await sendWahaWorkflowAction(L.madre, CLIENTE, W.atencion.id);
    if (ROTO) return assert.doesNotMatch(r.message ?? "", RECHAZO);
    assert.equal(r.success, false);
    assert.match(r.message, RECHAZO);
});

test("3. el workflow de Atención (y el de su asesor) SÍ pasan la puerta por su línea", async () => {
    for (const [quien, w] of [[MADRE, W.atencion], [ASESOR, W.atencion], [ASESOR, W.asesor]]) {
        ponerLaSesion(quien);
        const r = await sendWahaWorkflowAction(L.atencion, CLIENTE, w.id);
        // Sin nodos, se para después de la puerta: con eso basta para saber
        // que la puerta lo dejó pasar.
        assert.doesNotMatch(r.message ?? "", RECHAZO, w.name);
        assert.match(r.message ?? "", /no tiene nodos/, w.name);
    }
});

test("3. Waha: la respuesta rápida de la madre NO sale por Atención", async () => {
    ponerLaSesion(MADRE);
    salidas.length = 0;
    const r = await sendWahaQuickReplyAction(L.atencion, CLIENTE, R.madre.id);
    if (ROTO) return assert.ok(salioElTexto(R.madre.mensaje), "antes: se le mandaba al cliente");
    assert.equal(r.success, false);
    assert.match(r.message, RECHAZO);
    assert.equal(salioElTexto(R.madre.mensaje), false, "no salió nada hacia el proveedor");
});

test("3. Waha: la de Atención sí sale por Atención", async () => {
    ponerLaSesion(MADRE);
    salidas.length = 0;
    const r = await sendWahaQuickReplyAction(L.atencion, CLIENTE, R.atencion.id);
    assert.doesNotMatch(r.message ?? "", RECHAZO);
    assert.equal(salioElTexto(R.atencion.mensaje), true, `salió: ${r.message}`);
});

test("3. canal: la respuesta rápida de la madre NO sale por el Meta de Atención", async () => {
    ponerLaSesion(MADRE);
    salidas.length = 0;
    const r = await sendChannelQuickReplyAction(L.meta, CLIENTE, R.madre.id);
    if (ROTO) return assert.ok(salioElTexto(R.madre.mensaje), "antes: se le mandaba al cliente");
    assert.equal(r.success, false);
    assert.match(r.message, RECHAZO);
    assert.equal(salioElTexto(R.madre.mensaje), false);
});

test("3. canal: la de Atención sí sale", async () => {
    ponerLaSesion(MADRE);
    salidas.length = 0;
    await sendChannelQuickReplyAction(L.meta, CLIENTE, R.atencion.id);
    assert.equal(salioElTexto(R.atencion.mensaje), true);
});

// ── 4. La lista de workflows ya tiene puerta ──────────────────────────────

test("4. getWorkFlowByUserIds no devuelve los de una cuenta que no se alcanza", async () => {
    ponerLaSesion(ASESOR);
    const r = await getWorkFlowByUserIds([MADRE, VENTAS]);
    const ids = (r.data ?? []).map((w) => w.id);
    if (ROTO) return assert.ok(ids.includes(W.madre.id), "antes: devolvía los de cualquier cuenta");
    assert.equal(ids.includes(W.madre.id), false);
});
