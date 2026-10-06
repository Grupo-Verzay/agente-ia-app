/**
 * La acción de verdad contra Postgres: cambiar el tipo de un flujo ya creado
 * por todas las transiciones, y que el tipo que se DEDUCE después (el que lee
 * la lista y el motor) sea el pedido, sin restos del viejo.
 *
 * En `MODO=roto` reproduce lo que pasaba editando a mano el campo nuevo sin
 * quitar el viejo, y afirma que el flujo seguía con su tipo original.
 */
import test from "node:test";
import assert from "node:assert/strict";

const ROTO = process.env.MODO === "roto";
const m = await import("./.compilado/tipo-de-flujo/entrada-de-tipo-de-flujo.js");

const V = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const DUENO = `tipo-dueno-${V}`;
const AJENA = `tipo-ajena-${V}`;
const FLUJO = `tipo-flujo-${V}`;
const OTRA_BIENVENIDA = `tipo-bienv-${V}`;

const quien = (id) => ({ id, effectiveId: id, sessionUserId: id, ownerId: null, advisorRole: null,
    role: "user", rolDeLaPersona: "user", email: `${id}@banco.test`, name: id });
const t = ROTO ? test.skip : test;

async function elTipoDeHoy(id = FLUJO) {
    const wf = await m.db.workflow.findUnique({ where: { id } });
    const ia = await m.db.intentTrigger.count({ where: { workflowId: id } });
    return m.elTipoDelFlujo(wf, new Set(ia ? [id] : []));
}

test.before(async () => {
    const { db } = m;
    await db.user.create({ data: { id: DUENO, email: `${DUENO}@banco.test`, name: DUENO, role: "user" } });
    await db.user.create({ data: { id: AJENA, email: `${AJENA}@banco.test`, name: AJENA, role: "user" } });
    await db.workflow.create({ data: { id: FLUJO, userId: DUENO, name: `PAGOS ${V}`, definition: "{}", status: "active" } });
    await db.workflow.create({ data: { id: OTRA_BIENVENIDA, userId: DUENO, name: `HOLA ${V}`, definition: "{}", status: "active", triggerOnNewSession: true } });
});

test.after(async () => {
    const { db } = m;
    await db.intentTrigger.deleteMany({ where: { workflowId: { in: [FLUJO, OTRA_BIENVENIDA] } } });
    await db.workflow.deleteMany({ where: { id: { in: [FLUJO, OTRA_BIENVENIDA] } } });
    await db.user.deleteMany({ where: { id: { in: [DUENO, AJENA] } } });
    await db.$disconnect();
});

const PEDIDAS = {
    flujo: { tipo: "flujo" },
    chatbot: { tipo: "chatbot", palabras: ["pagar", "Pago"], coincidencia: "contiene" },
    ia: { tipo: "ia", condicion: "El cliente quiere pagar" },
    inicio: { tipo: "inicio" },
};

t("todas las transiciones: el tipo que queda es el pedido", async () => {
    m.ponerAQuienMira(quien(DUENO));
    const orden = ["chatbot", "ia", "flujo", "ia", "chatbot", "flujo", "inicio", "chatbot", "inicio", "ia", "inicio", "flujo"];
    for (const tipo of orden) {
        const r = await m.cambiarElTipoDelFlujoAction(FLUJO, PEDIDAS[tipo]);
        assert.equal(r.success, true, `${tipo}: ${r.message}`);
        assert.equal(await elTipoDeHoy(), tipo, `pasar a ${tipo}`);
        const wf = await m.db.workflow.findUnique({ where: { id: FLUJO } });
        const ia = await m.db.intentTrigger.findMany({ where: { workflowId: FLUJO } });
        assert.equal(wf.triggerOnNewSession, tipo === "inicio", tipo);
        assert.equal(Boolean(wf.description), tipo === "chatbot", tipo);
        assert.equal(ia.length, tipo === "ia" ? 1 : 0, tipo);
    }
});

t("el chatbot guarda sus palabras limpias y la IA su intención", async () => {
    m.ponerAQuienMira(quien(DUENO));
    await m.cambiarElTipoDelFlujoAction(FLUJO, PEDIDAS.chatbot);
    const wf = await m.db.workflow.findUnique({ where: { id: FLUJO } });
    assert.deepEqual(JSON.parse(wf.description), { matchType: "contiene", keywords: ["pagar", "pago"] });
    await m.cambiarElTipoDelFlujoAction(FLUJO, PEDIDAS.ia);
    const [d] = await m.db.intentTrigger.findMany({ where: { workflowId: FLUJO } });
    assert.equal(d.condition, "El cliente quiere pagar");
    assert.equal(d.userId, DUENO);
});

t("pasar a Inicio apaga la otra bienvenida de la cuenta", async () => {
    m.ponerAQuienMira(quien(DUENO));
    await m.db.workflow.update({ where: { id: OTRA_BIENVENIDA }, data: { triggerOnNewSession: true } });
    await m.cambiarElTipoDelFlujoAction(FLUJO, PEDIDAS.inicio);
    assert.equal(await elTipoDeHoy(OTRA_BIENVENIDA), "flujo");
    assert.equal(await m.db.workflow.count({ where: { userId: DUENO, triggerOnNewSession: true } }), 1);
});

t("chatbot sin palabras no se guarda y no toca nada", async () => {
    m.ponerAQuienMira(quien(DUENO));
    const antes = await elTipoDeHoy();
    const r = await m.cambiarElTipoDelFlujoAction(FLUJO, { tipo: "chatbot", palabras: [] });
    assert.equal(r.success, false);
    assert.equal(await elTipoDeHoy(), antes);
});

t("otra cuenta no cambia el tipo de un flujo ajeno", async () => {
    m.ponerAQuienMira(quien(DUENO));
    await m.cambiarElTipoDelFlujoAction(FLUJO, PEDIDAS.flujo);
    m.ponerAQuienMira(quien(AJENA));
    const r = await m.cambiarElTipoDelFlujoAction(FLUJO, PEDIDAS.chatbot);
    assert.equal(r.success, false);
    assert.equal(await elTipoDeHoy(), "flujo");
});

(ROTO ? test : test.skip)("ANTES: poner las palabras clave sin quitar el disparador deja el flujo en IA", async () => {
    // Lo único que había: editar un campo a mano, sin quitar el artefacto viejo.
    await m.db.intentTrigger.create({ data: { userId: DUENO, name: "x", mode: "prompt", condition: "quiere pagar", workflowId: FLUJO } });
    await m.db.workflow.update({ where: { id: FLUJO }, data: { description: JSON.stringify({ matchType: "exacta", keywords: ["pagar"] }) } });
    assert.equal(await elTipoDeHoy(), "ia", "se pidió chatbot y sigue siendo IA");
});
