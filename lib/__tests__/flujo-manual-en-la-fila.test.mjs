/**
 * La marca de «flujo ejecutado» de la fila de Chats (`Session.flujos`) cuando
 * el flujo se lanza A MANO desde la conversación. El motor la escribía al
 * ejecutarlo él; el camino manual no la escribía nunca.
 *
 * Dos mitades: la regla pura (`conElFlujo`) y la acción de verdad contra
 * Postgres (`sendWahaWorkflowAction` → `sendManualWorkflowAction`), con
 * `currentUser()` DE VERDAD. `MODO=roto` corre la acción del commit de antes
 * y AFIRMA que la marca no aparecía.
 */
import test from "node:test";
import assert from "node:assert/strict";

const ROTO = process.env.MODO === "roto";
const m = await import(
    ROTO ? "./.compilado/flujo-manual-antes/entrada-de-atajos.js" : "./.compilado/flujo-manual/entrada-de-atajos.js"
);
const { ponerLaSesion, sendWahaWorkflowAction, db } = m;
const { conElFlujo, losFlujosGuardados } = await import("./.compilado/flujo-manual/flujos-ejecutados.js");

test("regla: JSON nuevo, CSV de antes, sin repetir y sin perder lo del motor", () => {
    assert.deepEqual(JSON.parse(conElFlujo(null, { id: "w1", name: "Uno" })), [{ id: "w1", name: "Uno" }]);
    assert.deepEqual(JSON.parse(conElFlujo("", { id: "w1", name: "Uno" })), [{ id: "w1", name: "Uno" }]);
    const conMotor = JSON.stringify([{ id: "w0", name: "Del motor" }]);
    assert.deepEqual(JSON.parse(conElFlujo(conMotor, { id: "w1", name: "Uno" })), [
        { id: "w0", name: "Del motor" },
        { id: "w1", name: "Uno" },
    ]);
    assert.equal(conElFlujo(JSON.stringify([{ id: "w1", name: "Uno" }]), { id: "w1", name: "Uno" }), null);
    const csv = conElFlujo("Viejo A, Viejo B", { id: "w1", name: "Uno" });
    assert.ok(csv && losFlujosGuardados(csv).some((f) => f.name === "Viejo A"));
    assert.ok(losFlujosGuardados(csv).some((f) => f.id === "w1"));
});

const V = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const CUENTA = `fm-cuenta-${V}`;
const LINEA = `LFM_${V}`;
const CLIENTE = "573004445566@s.whatsapp.net";
const LID = "998877665544@lid";
let W;
let FICHA;
let FICHA_LID;

const fetchDeVerdad = globalThis.fetch;
globalThis.fetch = async () =>
    new Response(JSON.stringify({ id: "msg-banco", key: { id: "msg-banco" } }), {
        status: 200, headers: { "content-type": "application/json" },
    });

test.before(async () => {
    await db.user.create({ data: { id: CUENTA, email: `${CUENTA}@b.t`, name: "Cuenta", role: "admin" } });
    await db.instancia.create({ data: { instanceName: LINEA, userId: CUENTA, instanceId: `i-${LINEA}`, instanceType: "waha" } });
    W = await db.workflow.create({ data: { userId: CUENTA, name: `BIENVENIDA-${V}`, definition: "{}", status: "active" } });
    await db.workflowNode.create({ data: { workflowId: W.id, tipo: "text", message: `hola-${V}`, order: 0 } });
    FICHA = await db.session.create({
        data: { userId: CUENTA, remoteJid: CLIENTE, pushName: "Ana", instanceId: LINEA, status: true,
            flujos: JSON.stringify([{ id: "w-motor", name: "Del motor" }]) },
    });
    // Un contacto abierto por su @lid con el número guardado en la alterna.
    FICHA_LID = await db.session.create({
        data: { userId: CUENTA, remoteJid: LID, remoteJidAlt: "573007778899@s.whatsapp.net", pushName: "Beto", instanceId: LINEA, status: true },
    });
    await db.siteConfig.upsert({
        where: { id: 1 },
        create: { id: 1, wahaUrl: "http://waha.banco", wahaApiKey: "banco" },
        update: { wahaUrl: "http://waha.banco", wahaApiKey: "banco" },
    });
    ponerLaSesion(CUENTA);
});

test.after(async () => {
    globalThis.fetch = fetchDeVerdad;
    await db.session.deleteMany({ where: { userId: CUENTA } });
    await db.workflowNode.deleteMany({ where: { workflowId: W.id } });
    await db.workflow.deleteMany({ where: { userId: CUENTA } });
    await db.instancia.deleteMany({ where: { userId: CUENTA } });
    await db.chatMessage?.deleteMany?.({ where: { userId: CUENTA } }).catch(() => {});
    await db.user.deleteMany({ where: { id: CUENTA } });
    await db.$disconnect();
});

const losFlujos = async (id) => losFlujosGuardados((await db.session.findUnique({ where: { id } })).flujos);

test("lanzar el flujo a mano lo marca en la fila, sin perder lo del motor", async () => {
    const r = await sendWahaWorkflowAction(LINEA, CLIENTE, W.id);
    assert.equal(r.success, true, r.message);
    const f = await losFlujos(FICHA.id);
    if (ROTO) {
        assert.ok(!f.some((x) => x.id === W.id), "antes: la marca no aparecía");
        return;
    }
    assert.ok(f.some((x) => x.id === W.id && x.name === W.name), JSON.stringify(f));
    assert.ok(f.some((x) => x.id === "w-motor"), "lo que puso el motor se queda");
});

test("lanzarlo otra vez no lo repite", { skip: ROTO }, async () => {
    const r = await sendWahaWorkflowAction(LINEA, CLIENTE, W.id);
    assert.equal(r.success, true, r.message);
    const f = await losFlujos(FICHA.id);
    assert.equal(f.filter((x) => x.id === W.id).length, 1);
});

test("la ficha guardada bajo el @lid se encuentra por su número", async () => {
    const r = await sendWahaWorkflowAction(LINEA, LID, W.id);
    assert.equal(r.success, true, r.message);
    const f = await losFlujos(FICHA_LID.id);
    if (ROTO) return assert.equal(f.length, 0);
    assert.ok(f.some((x) => x.id === W.id), JSON.stringify(f));
});
