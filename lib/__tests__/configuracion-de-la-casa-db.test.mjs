/**
 * Las ACCIONES de verdad de la configuración de la plataforma, contra Postgres.
 * Lo único que se finge es `currentUser()`.
 *
 * El invariante, en una línea:
 *
 *   **Quien no manda en la casa no cambia ni lee lo que es de la casa, y al
 *   navegador no le llega nada de una cuenta que no le toca.**
 *
 * Corre en dos modos con el MISMO fichero:
 *
 *  - normal: el código de este árbol. Se afirma que la puerta cierra, que las
 *    fichas van cortas y que un cliente cuelga de un reseller y no de dos.
 *  - `MODO=roto`: el mismo paquete construido contra el commit de ANTES
 *    (`ANTES_REF`). Ahí se AFIRMA el fallo: un cliente cambia el precio de un
 *    plan y la cuenta bancaria, lee la lista de resellers, recibe fichas con la
 *    contraseña cifrada y un cliente queda en dos resellers.
 */
import test from "node:test";
import assert from "node:assert/strict";

const ROTO = process.env.MODO === "roto";
const m = await import(
    ROTO ? "./.compilado/casa-antes/entrada-de-la-casa.js" : "./.compilado/casa/entrada-de-la-casa.js"
);

const V = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const id = (n) => `casa-${n}-${V}`;
const SUPER = id("super"), CASA = id("casa"), EQA = id("equipo-admin"), EQG = id("equipo-agente");
const CLIENTE = id("cliente"), RES_A = id("res-a"), RES_B = id("res-b");
const C1 = id("c1"), C2 = id("c2"), C3 = id("c3"), C4 = id("c4-borrado"), MIEMBRO = id("miembro");
const TIPO = `BANCO-${V}`; // assistanceType propio: no pisa los planes de nadie

function quien(uid, extra = {}) {
    return {
        id: uid, effectiveId: uid, sessionUserId: uid, ownerId: null, advisorRole: null,
        role: "user", rolDeLaPersona: "user", porImpersonacion: false,
        email: `${uid}@banco.test`, name: uid, ...extra,
    };
}
const P = {
    super: () => quien(SUPER, { role: "super_admin", rolDeLaPersona: "super_admin" }),
    casa: () => quien(CASA, { role: "admin", rolDeLaPersona: "admin" }),
    equipoAdmin: () => quien(EQA, { ownerId: CASA, advisorRole: "administrador" }),
    equipoAgente: () => quien(EQG, { ownerId: CASA, advisorRole: "agente" }),
    cliente: () => quien(CLIENTE),
    resellerA: () => quien(RES_A, { role: "reseller", rolDeLaPersona: "reseller" }),
    // Un súper administrador DENTRO de un cliente con «Ingresar»: se entra para
    // ver lo que ve el cliente, y ahí el rol propio no cuenta.
    ingresado: () => quien(CLIENTE, { sessionUserId: SUPER, rolDeLaPersona: "super_admin", porImpersonacion: true }),
};
const QUIENES_NO_MANDAN = ["cliente", "resellerA", "equipoAgente", "ingresado"];
const QUIENES_MANDAN = ["super", "casa", "equipoAdmin"];

let planId;

test.before(async () => {
    const filas = [
        [SUPER, "super_admin"], [CASA, "admin"], [CLIENTE, "user"], [RES_A, "reseller"], [RES_B, "reseller"],
        [C1, "user"], [C2, "user"], [C3, "user"], [C4, "user"],
    ];
    for (const [uid, role] of filas) {
        await m.db.user.create({
            data: {
                id: uid, email: `${uid}@banco.test`, name: uid, role,
                // Lo que NUNCA puede llegar al navegador de otra cuenta.
                password: `$2a$10$hash-de-${uid}`,
                ...(uid === C2 ? { demoResellerId: RES_A } : {}),
                ...(uid === C4 ? { deletedAt: new Date() } : {}),
            },
        });
    }
    await m.db.user.create({ data: { id: EQA, email: `${EQA}@banco.test`, name: EQA, ownerId: CASA, advisorRole: "administrador", password: "$2a$10$x" } });
    await m.db.user.create({ data: { id: EQG, email: `${EQG}@banco.test`, name: EQG, ownerId: CASA, advisorRole: "agente", password: "$2a$10$x" } });
    await m.db.user.create({ data: { id: MIEMBRO, email: `${MIEMBRO}@banco.test`, name: MIEMBRO, ownerId: C1, password: "$2a$10$x" } });
    const plan = await m.db.subscriptionPlan.create({
        data: { plan: "basico", assistanceType: TIPO, priceUSD: 50, priceWholesale: 20, credits: 3000 },
    });
    planId = plan.id;
    await m.db.paymentMethodConfig.create({
        data: { id: id("pago"), method: id("pago"), label: "Banco de la casa", isActive: false,
            accountFields: [{ label: "Cuenta", value: "111-111" }] },
    });
});

test.after(async () => {
    await m.db.reseller.deleteMany({ where: { OR: [{ resellerid: { in: [RES_A, RES_B] } }, { userId: { contains: V } }] } });
    await m.db.resellerLicensePool.deleteMany({ where: { resellerUserId: { in: [RES_A, RES_B] } } });
    await m.db.planDetail.deleteMany({ where: { subscriptionPlanId: planId } });
    await m.db.subscriptionPlan.deleteMany({ where: { assistanceType: TIPO } });
    await m.db.paymentMethodConfig.deleteMany({ where: { method: { contains: V } } });
    await m.db.user.deleteMany({ where: { id: { in: [MIEMBRO, EQA, EQG] } } });
    await m.db.user.deleteMany({ where: { id: { contains: V } } });
    await m.db.$disconnect();
});

const elPlan = () => m.db.subscriptionPlan.findUnique({ where: { id: planId } });
const elPago = () => m.db.paymentMethodConfig.findUnique({ where: { id: id("pago") } });

async function intentarCambiarElPrecio(p, precio) {
    m.ponerAQuienMira(P[p]());
    return m.upsertSubscriptionPlan({
        plan: "basico", assistanceType: TIPO, priceUSD: precio, credits: 1, features: [],
    });
}

// ── Precios, créditos y datos bancarios ─────────────────────────────────────

test("EL CASO: quien no manda en la casa NO cambia el precio ni los créditos de un plan", async () => {
    for (const p of QUIENES_NO_MANDAN) {
        const antes = await elPlan();
        const r = await intentarCambiarElPrecio(p, 1);
        const despues = await elPlan();
        if (ROTO) {
            if (p === "cliente") {
                assert.equal(r.success, true, "antes: un cliente cambiaba el precio");
                assert.equal(Number(despues.priceUSD), 1);
                assert.equal(despues.credits, 1);
                await m.db.subscriptionPlan.update({ where: { id: planId }, data: { priceUSD: 50, credits: 3000 } });
            }
            continue;
        }
        assert.equal(r.success, false, `${p} no puede cambiar el precio`);
        assert.equal(Number(despues.priceUSD), Number(antes.priceUSD), `${p}: el precio no se movió`);
        assert.equal(despues.credits, antes.credits, `${p}: los créditos no se movieron`);
    }
});

test("ni activarlo o desactivarlo, ni tocar la ficha de venta, ni los créditos por plan", async () => {
    for (const p of QUIENES_NO_MANDAN) {
        m.ponerAQuienMira(P[p]());
        const t = await m.toggleSubscriptionPlanActive(planId, false);
        const d = await m.upsertPlanDetail(planId, { heroTitle: `hackeado por ${p}` });
        const c = await m.updatePlanConfigAction("personalizado", 999999);
        if (ROTO) {
            if (p === "cliente") {
                assert.equal(t.success, true, "antes: un cliente desactivaba un plan");
                assert.equal(d.success, true, "antes: un cliente reescribía la ficha de venta");
                await m.db.subscriptionPlan.update({ where: { id: planId }, data: { isActive: true } });
                await m.db.planDetail.deleteMany({ where: { subscriptionPlanId: planId } });
            }
            continue;
        }
        assert.equal(t.success, false, `${p}: toggle`);
        assert.equal(d.success, false, `${p}: ficha de venta`);
        assert.equal(c.success, false, `${p}: créditos por plan`);
        assert.equal((await elPlan()).isActive, true);
        assert.equal(await m.db.planDetail.findUnique({ where: { subscriptionPlanId: planId } }), null);
    }
});

test("EL CASO: quien no manda en la casa NO lee ni cambia las cuentas bancarias", async () => {
    for (const p of QUIENES_NO_MANDAN) {
        m.ponerAQuienMira(P[p]());
        const lista = await m.getAllPaymentMethodConfigs();
        const g = await m.savePaymentMethodConfig({
            id: id("pago"), method: id("pago"), label: "Banco del atacante", isActive: true,
            instructions: "", accountFields: [{ label: "Cuenta", value: "999-999" }],
        });
        const o = await m.reorderPaymentMethods([id("pago")]);
        const pago = await elPago();
        if (ROTO) {
            if (p === "cliente") {
                assert.ok(lista.data.some((x) => x.id === id("pago")), "antes: un cliente leía las cuentas inactivas");
                assert.equal(g.success, true, "antes: un cliente cambiaba el número de cuenta");
                assert.equal(pago.accountFields[0].value, "999-999");
                await m.db.paymentMethodConfig.update({ where: { id: id("pago") }, data: {
                    label: "Banco de la casa", isActive: false, accountFields: [{ label: "Cuenta", value: "111-111" }] } });
            }
            continue;
        }
        assert.equal(lista.success, false, `${p}: no lee`);
        assert.equal(lista.data.length, 0, `${p}: no le llega ninguna fila`);
        assert.equal(g.success, false, `${p}: no guarda`);
        assert.equal(o.success, false, `${p}: no reordena`);
        assert.equal(pago.accountFields[0].value, "111-111", `${p}: el número de cuenta no se movió`);
        assert.equal(pago.isActive, false);
        const borrar = await m.deletePaymentMethodConfig(id("pago"));
        assert.equal(borrar.success, false, `${p}: no borra`);
        assert.ok(await elPago(), `${p}: la cuenta sigue ahí`);
    }
});

test("lo ACTIVO sí se lee sin mandar: es donde paga un cliente", { skip: ROTO }, async () => {
    m.ponerAQuienMira(P.cliente());
    const r = await m.getActivePaymentMethodConfigs();
    assert.equal(r.success, true);
    assert.ok(!r.data.some((x) => x.id === id("pago")), "la inactiva no viaja");
});

test("la casa —cuenta admin, su administrador y el súper admin— SÍ configura", { skip: ROTO }, async () => {
    let precio = 60;
    for (const p of QUIENES_MANDAN) {
        const r = await intentarCambiarElPrecio(p, precio);
        assert.equal(r.success, true, `${p}: ${r.message}`);
        assert.equal(Number((await elPlan()).priceUSD), precio);
        m.ponerAQuienMira(P[p]());
        assert.equal((await m.getAllPaymentMethodConfigs()).success, true, `${p}: lee los métodos de pago`);
        assert.equal((await m.getAllPlanConfigs()).success, true, `${p}: lee los créditos por plan`);
        precio += 5;
    }
});

test("un precio o unos créditos que no son números no se guardan", { skip: ROTO }, async () => {
    m.ponerAQuienMira(P.casa());
    for (const [priceUSD, credits] of [[NaN, 1], [-5, 1], [10, -1], [10, 1.5], [10, "mucho"]]) {
        const r = await m.upsertSubscriptionPlan({ plan: "basico", assistanceType: TIPO, priceUSD, credits, features: [] });
        assert.equal(r.success, false, `${priceUSD}/${credits}`);
    }
    const c = await m.updatePlanConfigAction("personalizado", -3);
    assert.equal(c.success, false);
});

// ── La lista de resellers ───────────────────────────────────────────────────

test("EL CASO: la lista de resellers —licencias, nombres, correos— no la lee cualquiera", async () => {
    for (const p of QUIENES_NO_MANDAN) {
        m.ponerAQuienMira(P[p]());
        const r = await m.getResellersWithPools();
        if (ROTO) {
            if (p === "cliente") {
                assert.equal(r.success, true, "antes: un cliente leía la lista de resellers");
                assert.ok(r.data.some((x) => x.email === `${RES_A}@banco.test`), "antes: con su correo");
            }
            continue;
        }
        assert.equal(r.success, false, `${p}`);
        assert.equal(r.data.length, 0, `${p}: no le llega ni una fila`);
    }
    if (ROTO) return;
    m.ponerAQuienMira(P.casa());
    const r = await m.getResellersWithPools();
    assert.equal(r.success, true);
    assert.ok(r.data.some((x) => x.id === RES_A));
});

test("licencias, demos y perfil de un reseller: solo la casa, y solo sobre un reseller", async () => {
    for (const p of QUIENES_NO_MANDAN) {
        m.ponerAQuienMira(P[p]());
        const l = await m.assignLicenses(RES_A, planId, 500);
        const d = await m.updateDemoLimit(RES_A, 500);
        const a = await m.adminUpdateResellerProfile(RES_A, { slug: `hack-${V}`, businessName: "hack" });
        assert.equal(l.success, false, `${p}: licencias`);
        assert.equal(d.success, false, `${p}: demos`);
        assert.equal(a.success, false, `${p}: perfil`);
    }
    if (ROTO) return;
    assert.equal(await m.db.resellerLicensePool.count({ where: { resellerUserId: RES_A } }), 0);
    m.ponerAQuienMira(P.casa());
    const noEsReseller = await m.assignLicenses(C1, planId, 5);
    assert.equal(noEsReseller.success, false, "un pool no se cuelga de un cliente");
    const ok = await m.assignLicenses(RES_A, planId, 5);
    assert.equal(ok.success, true, ok.message);
    const mal = await m.assignLicenses(RES_A, planId, -1);
    assert.equal(mal.success, false, "un total negativo no se guarda");
});

// ── Asignar clientes a un reseller ──────────────────────────────────────────

const CAMPOS_PERMITIDOS = ["company", "email", "id", "name"];

test("EL CASO: al navegador llega la ficha CORTA, nunca la fila entera", async () => {
    m.ponerAQuienMira(P.casa());
    const r = await m.getClientsByReseller(RES_A);
    const todas = [...r.assignedClients, ...r.unassignedClients].filter(Boolean);
    assert.ok(todas.length > 0);
    if (ROTO) {
        assert.ok(todas.some((f) => "password" in f), "antes: viajaba la contraseña cifrada");
        return;
    }
    for (const f of todas) {
        assert.deepEqual(Object.keys(f).sort(), CAMPOS_PERMITIDOS, `ficha de ${f.id}`);
        assert.ok(!JSON.stringify(f).includes("$2a$"), "ningún hash de contraseña");
    }
});

test("«sin asignar» son clientes sin reseller: ni equipo, ni eliminados, ni los de otro", { skip: ROTO }, async () => {
    m.ponerAQuienMira(P.casa());
    const ids = (await m.getClientsByReseller(RES_A)).unassignedClients.map((f) => f.id);
    assert.ok(ids.includes(C1) && ids.includes(C3), "los libres salen");
    assert.ok(!ids.includes(C2), "el que ya es de un reseller por el camino nuevo, no");
    assert.ok(!ids.includes(C4), "el eliminado, no");
    assert.ok(!ids.includes(MIEMBRO) && !ids.includes(EQA), "la gente del equipo de una cuenta, no");
    assert.ok(!ids.includes(RES_A) && !ids.includes(CASA), "ni resellers ni la casa");
});

test("EL CASO: un cliente cuelga de UN reseller, nunca de dos", async () => {
    m.ponerAQuienMira(P.casa());
    const a = await m.assignClientToReseller(C1, RES_A);
    const b = await m.assignClientToReseller(C1, RES_B);
    const filas = await m.db.reseller.count({ where: { userId: C1 } });
    if (ROTO) {
        assert.equal(filas, 2, "antes: el mismo cliente quedaba en dos resellers");
        return;
    }
    assert.equal(a.success, true, a.message);
    assert.equal(b.success, false, "el segundo reseller se rechaza");
    assert.match(b.message, /otro reseller/);
    assert.equal(filas, 1);
    const otraVez = await m.assignClientToReseller(C1, RES_A);
    assert.equal(otraVez.success, false, "ni dos veces el mismo");
    const porElCaminoNuevo = await m.assignClientToReseller(C2, RES_B);
    assert.equal(porElCaminoNuevo.success, false, "el que ya es de A por demoResellerId no pasa a B");
});

test("a la vez desde dos pestañas: gana uno y el otro se rechaza", { skip: ROTO }, async () => {
    m.ponerAQuienMira(P.casa());
    const [x, y] = await Promise.all([
        m.assignClientToReseller(C3, RES_A),
        m.assignClientToReseller(C3, RES_B),
    ]);
    assert.equal([x, y].filter((r) => r.success).length, 1, `${x.message} / ${y.message}`);
    assert.equal(await m.db.reseller.count({ where: { userId: C3 } }), 1);
});

test("no se asigna lo que no es un cliente, ni a lo que no es un reseller", { skip: ROTO }, async () => {
    m.ponerAQuienMira(P.casa());
    for (const [cli, res] of [[MIEMBRO, RES_A], [C4, RES_A], [CASA, RES_A], [id("no-existe"), RES_A], [C1, C3]]) {
        const r = await m.assignClientToReseller(cli, res);
        assert.equal(r.success, false, `${cli} → ${res}`);
    }
});

test("quien no manda en la casa no asigna ni quita", async () => {
    for (const p of QUIENES_NO_MANDAN) {
        m.ponerAQuienMira(P[p]());
        const a = await m.assignClientToReseller(id("no-existe-2"), RES_A).catch(() => null);
        const q = await m.removeClientFromReseller(C1, RES_A).catch(() => null);
        await assert.rejects(() => m.getClientsByReseller(RES_A), `${p}: no lee la cartera`);
        if (ROTO) continue;
        assert.equal(a?.success, false, `${p}: asignar`);
        assert.equal(q?.success, false, `${p}: quitar`);
    }
    if (ROTO) return;
    assert.equal(await m.db.reseller.count({ where: { userId: C1, resellerid: RES_A } }), 1, "C1 sigue en A");
    m.ponerAQuienMira(P.casa());
    const q = await m.removeClientFromReseller(C1, RES_A);
    assert.equal(q.success, true, q.message);
    assert.equal(await m.db.reseller.count({ where: { userId: C1 } }), 0);
    const b = await m.assignClientToReseller(C1, RES_B);
    assert.equal(b.success, true, "quitado de A, ya puede ir a B");
});

// ── El selector de clientes de Datos externos ───────────────────────────────

test("EL CASO: el selector de un reseller no devuelve la plataforma entera", async () => {
    m.ponerAQuienMira(P.resellerA());
    const r = await m.getClientsForSelector();
    const ids = (r.data ?? []).map((c) => c.id);
    if (ROTO) {
        assert.ok(ids.includes(SUPER) && ids.includes(CASA), "antes: un reseller recibía todos los usuarios");
        return;
    }
    assert.equal(r.success, true, r.message);
    assert.ok(ids.includes(C2), "su cliente sale");
    // (C3 no entra: la carrera de dos pestañas de arriba lo deja en A o en B.)
    for (const ajeno of [SUPER, CASA, CLIENTE, MIEMBRO, RES_B, C4]) {
        assert.ok(!ids.includes(ajeno), `${ajeno} no sale`);
    }
    // Y pedir la cartera de otro no cambia nada: el alcance lo pone la sesión.
    const pidiendoOtra = await m.getClientsForSelector({ resellerId: RES_B });
    assert.deepEqual(pidiendoOtra.data.map((c) => c.id).sort(), ids.sort());
});

test("el selector de la casa: cuentas cliente, sin equipo ni eliminadas; un cliente, nada", { skip: ROTO }, async () => {
    m.ponerAQuienMira(P.casa());
    const ids = (await m.getClientsForSelector()).data.map((c) => c.id);
    assert.ok(ids.includes(C1) && ids.includes(C2));
    assert.ok(!ids.includes(MIEMBRO) && !ids.includes(EQA), "el equipo de una cuenta no es un cliente");
    assert.ok(!ids.includes(C4), "una cuenta eliminada no");
    for (const p of ["cliente", "equipoAgente", "ingresado"]) {
        m.ponerAQuienMira(P[p]());
        const r = await m.getClientsForSelector();
        assert.equal(r.success, false, p);
        assert.equal((r.data ?? []).length, 0, p);
    }
});

// ── Todos los planes: el precio mayorista es de la casa ─────────────────────

test("todos los planes: la casa ve el mayorista, un reseller no, un cliente nada", { skip: ROTO }, async () => {
    // Los casos de arriba guardaron el plan sin mayorista: se le vuelve a poner.
    await m.db.subscriptionPlan.update({ where: { id: planId }, data: { priceWholesale: 20 } });
    m.ponerAQuienMira(P.casa());
    const casa = (await m.getAllSubscriptionPlans()).data.find((p) => p.id === planId);
    assert.equal(casa.priceWholesale, 20);
    m.ponerAQuienMira(P.resellerA());
    const res = await m.getAllSubscriptionPlans();
    assert.equal(res.success, true);
    assert.equal(res.data.find((p) => p.id === planId).priceWholesale, null);
    m.ponerAQuienMira(P.cliente());
    const cli = await m.getAllSubscriptionPlans();
    assert.equal(cli.success, false);
    assert.equal(cli.data.length, 0);
    const pub = await m.getActiveSubscriptionPlans();
    assert.ok(pub.data.every((p) => p.priceWholesale === null), "lo público no lleva el mayorista");
});
