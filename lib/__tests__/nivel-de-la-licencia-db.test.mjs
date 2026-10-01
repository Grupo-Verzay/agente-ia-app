/**
 * El nivel de un cliente de reseller, contra Postgres y ejerciendo LAS PUERTAS
 * DE VERDAD: editar la ficha en Clientes, crear un cliente (las dos formas),
 * elegir plan para pagar y aprobar una suscripción. Y el script que corrige los
 * datos que ya estaban.
 *
 * El caso que lo destapó: «Asesor DAYRA», cliente de Daniel Peralta, consumía
 * una licencia de Nivel 6 y estaba en Nivel 5 —sin poder crear usuarios—. Lo
 * último que lo tocó fue «Editar cliente» guardando el nivel del formulario.
 *
 * | puerta | lo que tiene que quedar |
 * | --- | --- |
 * | Editar cliente, pidiendo Nivel 5 | **Nivel 6**, y el aviso lo dice |
 * | Editar cliente, sin mandar el nivel | **Nivel 6**: guardar la ficha endereza |
 * | Editar un cliente SIN licencia | lo pedido, como siempre |
 * | Crear un cliente con la licencia de Nivel 6 | nace en **Nivel 6**, no en el del formulario |
 * | Elegir otro nivel para pagar | **rechazado**, se queda en el suyo |
 * | Aprobar una suscripción de otro nivel | se queda en el de **su licencia** |
 * | El script con `--aplicar` | sube SOLO a los que están por debajo |
 *
 * Corre en DOS modos. `MODO=roto` empaqueta este mismo fichero contra el código
 * de un commit PINCHADO (`ANTES_REF`) y **afirma los fallos**.
 *
 * Como se corre: `scripts/banco-nivel-de-la-licencia.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";

const ROTO = process.env.MODO === "roto";
const {
    activarLaSuscripcion,
    createClientAccount,
    createUserWithPausar,
    db,
    elegirPlanParaPagar,
    ponerAQuienMira,
    updateClientData,
} = await import(
    ROTO
        ? "./.compilado/nivel-de-la-licencia-antes/entrada-del-nivel-de-la-licencia.js"
        : "./.compilado/nivel-de-la-licencia/entrada-del-nivel-de-la-licencia.js"
);
const script = await import("../../scripts/subir-clientes-a-su-licencia.mjs");

const V = `n${Date.now().toString(36)}`;
const ID = (n) => `${V}-${n}`;

// Quien edita: una cuenta de la casa con rol `admin`, como «Verzay | Atencion».
const CASA = ID("casa");
const COMO_CASA = { id: CASA, role: "admin", ownerId: null, advisorRole: null, name: "Casa" };
// El reseller y sus licencias.
const DANIEL = ID("daniel");
const COMO_DANIEL = { id: DANIEL, role: "reseller", ownerId: null, advisorRole: null, name: "Daniel", apiUrl: "https://api.banco.test" };

let N6; // licencia de Nivel 6 (personalizado)
let N4; // licencia de Nivel 4 (avanzado)
let SUELTO_PLAN; // un plan que Daniel NO tiene como licencia

async function cuenta(id, { plan = "basico", role = "user", reseller = null, licencia = null, demo = false } = {}) {
    await db.$executeRawUnsafe(
        `INSERT INTO "User" ("id","email","name","company","role","plan","status","updatedAt",
                             "demo_reseller_id","reseller_subscription_plan_id","is_demo")
         VALUES ($1,$2,$3,$3,$4::"Role",$5::"Plan",true,NOW(),$6,$7,$8)`,
        id,
        `${id}@banco.test`,
        id,
        role,
        plan,
        reseller,
        licencia,
        demo,
    );
}

async function planDeLaPlataforma(plan, isResellerPlan) {
    const fila = await db.subscriptionPlan.upsert({
        where: { plan_assistanceType_isResellerPlan: { plan, assistanceType: "IA", isResellerPlan } },
        update: {},
        create: { plan, assistanceType: "IA", isResellerPlan, credits: 1000, name: `Banco ${plan}` },
    });
    return fila.id;
}

const elPlan = async (id) => (await db.user.findUnique({ where: { id }, select: { plan: true } }))?.plan;

function formulario(campos) {
    const f = new FormData();
    for (const [k, v] of Object.entries(campos)) f.append(k, v);
    return f;
}

test.before(async () => {
    N6 = await planDeLaPlataforma("personalizado", true);
    N4 = await planDeLaPlataforma("avanzado", true);
    SUELTO_PLAN = await planDeLaPlataforma("enterprise", true);

    await cuenta(CASA, { role: "admin", plan: "personalizado" });
    await cuenta(DANIEL, { role: "reseller", plan: "personalizado" });
    await db.resellerLicensePool.create({ data: { resellerUserId: DANIEL, subscriptionPlanId: N6, totalLicenses: 10 } });
    await db.resellerLicensePool.create({ data: { resellerUserId: DANIEL, subscriptionPlanId: N4, totalLicenses: 5 } });
    // Precios del reseller: elegir plan solo llega a escribir con un precio.
    for (const plan of ["avanzado", "personalizado"]) {
        await db.resellerPlan.create({
            data: { resellerUserId: DANIEL, plan, assistanceType: "IA", priceMonthly: 10, priceCop: 50000 },
        });
    }
});

test.after(async () => {
    await db.$disconnect();
});

// ── Editar la ficha ──────────────────────────────────────────────────────

test("Editar cliente pidiendo Nivel 5 a un cliente de licencia Nivel 6", async () => {
    const dayra = ID("dayra");
    await cuenta(dayra, { plan: "personalizado", reseller: DANIEL, licencia: N6 });
    ponerAQuienMira(COMO_CASA);

    const r = await updateClientData(dayra, formulario({ name: "Asesor DAYRA", plan: "enterprise" }));
    assert.equal(r.success, true, r.message);
    if (ROTO) {
        assert.equal(await elPlan(dayra), "enterprise", "ANTES: se guardaba el nivel del formulario");
        return;
    }
    assert.equal(await elPlan(dayra), "personalizado", "se queda en el nivel de su licencia");
    assert.match(r.message, /Nivel 6/, "y el aviso dice que se quedó en el de su licencia");
});

test("Editar cliente SIN mandar el nivel endereza a uno que se quedó por debajo", async () => {
    const bajo = ID("bajo");
    await cuenta(bajo, { plan: "enterprise", reseller: DANIEL, licencia: N6 });
    ponerAQuienMira(COMO_CASA);

    const r = await updateClientData(bajo, formulario({ name: "Cliente por debajo" }));
    assert.equal(r.success, true, r.message);
    assert.equal(await elPlan(bajo), ROTO ? "enterprise" : "personalizado");
});

test("Editar cliente de una licencia de Nivel 4 lo deja en Nivel 4", async () => {
    const n4 = ID("n4");
    await cuenta(n4, { plan: "avanzado", reseller: DANIEL, licencia: N4 });
    ponerAQuienMira(COMO_CASA);

    await updateClientData(n4, formulario({ name: "Cliente N4", plan: "personalizado" }));
    assert.equal(await elPlan(n4), ROTO ? "personalizado" : "avanzado");
});

test("Editar un cliente SIN licencia guarda el nivel pedido (en los dos modos)", async () => {
    const suelto = ID("suelto");
    await cuenta(suelto, { plan: "basico" });
    ponerAQuienMira(COMO_CASA);

    const r = await updateClientData(suelto, formulario({ plan: "avanzado" }));
    assert.equal(r.success, true, r.message);
    assert.equal(await elPlan(suelto), "avanzado");
});

test("Un cliente con un plan que su reseller NO tiene como licencia se edita libre", async () => {
    const sinPool = ID("sinpool");
    await cuenta(sinPool, { plan: "enterprise", reseller: DANIEL, licencia: SUELTO_PLAN });
    ponerAQuienMira(COMO_CASA);

    await updateClientData(sinPool, formulario({ plan: "intermedio" }));
    assert.equal(await elPlan(sinPool), "intermedio", "sin licencia que exista no hay nivel que heredar");
});

// ── Crear un cliente ─────────────────────────────────────────────────────

test("Crear un cliente con la licencia de Nivel 6 (Clientes › + Nuevo)", async () => {
    ponerAQuienMira(COMO_DANIEL);
    const email = `${ID("nuevo")}@banco.test`;
    const r = await createUserWithPausar({
        name: "Cliente nuevo",
        email,
        company: "Cliente nuevo",
        role: "user",
        // El campo de nivel está oculto para el reseller y llega con su valor
        // por defecto.
        plan: "basico",
        subscriptionPlanId: N6,
    });
    assert.equal(r.success, true, r.message);
    const fila = await db.user.findUnique({ where: { email }, select: { plan: true, resellerSubscriptionPlanId: true } });
    assert.equal(fila.resellerSubscriptionPlanId, N6, "consume la licencia de Nivel 6");
    assert.equal(fila.plan, ROTO ? "basico" : "personalizado");
});

test("Crear un cliente desde la cuenta de licencias del reseller", async () => {
    ponerAQuienMira(COMO_DANIEL);
    const email = `${ID("cuenta")}@banco.test`;
    const r = await createClientAccount({
        name: "Cliente por licencia",
        email,
        company: "Cliente por licencia",
        password: "banco-123456",
        subscriptionPlanId: N6,
        plan: "intermedio",
    });
    assert.equal(r.success, true, r.message);
    assert.equal((await db.user.findUnique({ where: { email }, select: { plan: true } })).plan, ROTO ? "intermedio" : "personalizado");
});

// ── El Perfil y las suscripciones ────────────────────────────────────────

test("Un cliente de licencia NO elige otro nivel para pagar", async () => {
    const cliente = ID("perfil");
    await cuenta(cliente, { plan: "personalizado", reseller: DANIEL, licencia: N6 });
    await db.userBilling.create({ data: { userId: cliente, currencyCode: "COP" } });
    ponerAQuienMira({ id: cliente, role: "user", ownerId: null, advisorRole: null });

    const r = await elegirPlanParaPagar("avanzado", "IA");
    if (ROTO) {
        assert.equal(r.success, true, "ANTES: se dejaba elegir");
        assert.equal(await elPlan(cliente), "avanzado", "ANTES: salía de su licencia de Nivel 6");
        return;
    }
    assert.equal(r.success, false);
    assert.match(r.message, /licencia/);
    assert.equal(await elPlan(cliente), "personalizado");

    // Su propio nivel sí se puede elegir: es pagar lo que ya tiene.
    const mismo = await elegirPlanParaPagar("personalizado", "IA");
    assert.equal(mismo.success, true, mismo.message);
    assert.equal(await elPlan(cliente), "personalizado");
});

test("Aprobar una suscripción de otro nivel deja al cliente en el de su licencia", async () => {
    const cliente = ID("susc");
    await cuenta(cliente, { plan: "enterprise", reseller: DANIEL, licencia: N6 });
    const sub = await db.userSubscription.create({
        data: { userId: cliente, subscriptionPlanId: N4, status: "PENDING_APPROVAL", amountUSD: 10 },
    });
    await activarLaSuscripcion({ id: sub.id, inicio: new Date(), vence: new Date(Date.now() + 30 * 86400000), aprobadoPor: CASA });
    assert.equal(await elPlan(cliente), ROTO ? "avanzado" : "personalizado");
});

test("Aprobar la suscripción de un cliente SIN licencia le pone su plan (en los dos modos)", async () => {
    const cliente = ID("susc-suelto");
    await cuenta(cliente, { plan: "basico" });
    const sub = await db.userSubscription.create({
        data: { userId: cliente, subscriptionPlanId: N4, status: "PENDING_APPROVAL", amountUSD: 10 },
    });
    await activarLaSuscripcion({ id: sub.id, inicio: new Date(), vence: new Date(Date.now() + 30 * 86400000), aprobadoPor: CASA });
    assert.equal(await elPlan(cliente), "avanzado");
});

// ── Los datos que ya estaban ─────────────────────────────────────────────

test("El script sube SOLO a los que están por debajo de su licencia", async () => {
    const S = {
        bajo: ID("s-bajo"), // el caso de DAYRA: licencia N6, cuenta N5
        muyBajo: ID("s-muybajo"), // licencia N6, cuenta N1
        bien: ID("s-bien"),
        encima: ID("s-encima"), // licencia N4, cuenta N6: no se toca
        sinPool: ID("s-sinpool"), // un plan que su reseller no tiene
        demo: ID("s-demo"), // una prueba no consume licencia
        suelto: ID("s-suelto"), // sin reseller
    };
    await cuenta(S.bajo, { plan: "enterprise", reseller: DANIEL, licencia: N6 });
    await cuenta(S.muyBajo, { plan: "lite", reseller: DANIEL, licencia: N6 });
    await cuenta(S.bien, { plan: "personalizado", reseller: DANIEL, licencia: N6 });
    await cuenta(S.encima, { plan: "personalizado", reseller: DANIEL, licencia: N4 });
    await cuenta(S.sinPool, { plan: "enterprise", reseller: DANIEL, licencia: SUELTO_PLAN });
    await cuenta(S.demo, { plan: "basico", reseller: DANIEL, licencia: N6, demo: true });
    await cuenta(S.suelto, { plan: "basico" });

    const antes = Object.fromEntries(await Promise.all(Object.entries(S).map(async ([k, id]) => [k, await elPlan(id)])));
    const lineas = [];

    // Sin `--aplicar` no toca nada.
    const ensayo = await script.correr({ prisma: db, aplicar: false, log: (l) => lineas.push(l) });
    assert.ok(ensayo.subir.some((s) => s.id === S.bajo));
    for (const [k, id] of Object.entries(S)) assert.equal(await elPlan(id), antes[k], `${k}: el ensayo no escribe`);

    const hecho = await script.correr({ prisma: db, aplicar: true, log: (l) => lineas.push(l) });
    assert.ok(hecho.hechos.some((s) => s.id === S.bajo));
    assert.equal(await elPlan(S.bajo), "personalizado");
    assert.equal(await elPlan(S.muyBajo), "personalizado");
    assert.equal(await elPlan(S.bien), "personalizado");
    assert.equal(await elPlan(S.encima), "personalizado", "por encima no se baja");
    assert.ok(hecho.porEncima.some((p) => p.id === S.encima), "y se dice");
    assert.equal(await elPlan(S.sinPool), "enterprise", "sin licencia que exista no se toca");
    assert.equal(await elPlan(S.demo), "basico", "una demo no se toca");
    assert.equal(await elPlan(S.suelto), "basico", "un cliente sin reseller no se toca");

    // Una segunda vuelta no tiene nada que subir de estos.
    const otra = await script.correr({ prisma: db, aplicar: true, log: () => {} });
    for (const id of Object.values(S)) assert.ok(!otra.subir.some((s) => s.id === id));
});
