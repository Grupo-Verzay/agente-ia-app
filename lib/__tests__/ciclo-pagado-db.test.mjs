/**
 * Los cuatro caminos por los que se paga, contra Postgres y ejerciendo LAS
 * PUERTAS DE VERDAD —las acciones y la ruta de Wompi—, no las consultas.
 *
 * | camino | qué tiene que quedar |
 * | --- | --- |
 * | «Marcar pagado» | vencimiento +1 ciclo, créditos repuestos, cuenta habilitada, y **al día siguiente sigue activa** |
 * | «Editar pagos», fecha adelante | créditos repuestos |
 * | «Editar pagos», fecha atrás | créditos **intactos** |
 * | «Aprobar» | acceso y vencimiento vuelven, el plan personalizado y su total pactado **no se pisan** |
 * | Wompi con una suscripción pendiente | la suscripción queda **activa**, con el mismo vencimiento que la cuenta |
 *
 * Y corre en DOS modos. `MODO=roto` empaqueta este mismo fichero contra el
 * código de un commit pinchado (`ANTES_REF`) y **afirma los fallos**: la
 * cuenta que se vuelve a suspender al día siguiente, los créditos que no
 * vuelven, el total pactado pisado y la suscripción que se queda en «Pendiente
 * de pago». Sin ese modo no se sabría si lo verde arregla la causa.
 *
 * Como se corre: `scripts/banco-ciclo-pagado.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

const ROTO = process.env.MODO === "roto";
const {
    approveSubscription,
    avisoDeWompi,
    db,
    markUserAsPaid,
    ponerAQuienMira,
    setUserBillingDueDate,
    syncUserBillingLifecycle,
} = await import(
    ROTO
        ? "./.compilado/ciclo-pagado-antes/entrada-del-ciclo-pagado.js"
        : "./.compilado/ciclo-pagado/entrada-del-ciclo-pagado.js"
);

const V = `c${Date.now().toString(36)}`;
const ID = (n) => `${V}-${n}`;
const DIA = 86400000;
const hace = (d) => new Date(Date.now() - d * DIA);
const dentroDe = (d) => new Date(Date.now() + d * DIA);
const diasHasta = (f) => Math.round((new Date(f).getTime() - Date.now()) / DIA);

const CASA = ID("casa");
const COMO_CASA = { id: CASA, role: "super_admin", ownerId: null, advisorRole: null, name: "Casa" };

async function cuenta(id, { plan = "basico", status = true } = {}) {
    await db.$executeRawUnsafe(
        `INSERT INTO "User" ("id","email","name","company","role","plan","status","updatedAt")
         VALUES ($1,$2,$3,'Empresa Demo','user'::"Role",$4::"Plan",$5,NOW())`,
        id,
        `${id}@banco.test`,
        id,
        plan,
        status,
    );
}

async function suspendida(id, { dueDate = hace(5), price = null } = {}) {
    await db.userBilling.create({
        data: {
            userId: id,
            currencyCode: "COP",
            billingStatus: "UNPAID",
            accessStatus: "SUSPENDED",
            suspendedAt: hace(4),
            suspendedReason: "Vencido sin pago",
            dueDate,
            serviceEndsAt: dueDate,
            graceDays: 0,
            licenseDays: 30,
            price,
        },
    });
}

async function creditos(id, total, used) {
    await db.iaCredit.create({ data: { userId: id, total, used, renewalDate: hace(5) } });
}

const cobro = (id) => db.userBilling.findUnique({ where: { userId: id } });
const bolsa = (id) => db.iaCredit.findUnique({ where: { userId: id } });
const fila = (id) => db.user.findUnique({ where: { id }, select: { plan: true, status: true } });

let planBasico;

test.before(async () => {
    await db.$executeRawUnsafe(
        `INSERT INTO "User" ("id","email","name","role","updatedAt")
         VALUES ($1,$2,'Casa','super_admin'::"Role",NOW())`,
        CASA,
        `${CASA}@banco.test`,
    );
    // Único por (plan, tipo, reseller) y la base se reutiliza entre vueltas.
    planBasico =
        (await db.subscriptionPlan.findFirst({ where: { plan: "basico", assistanceType: "IA", isResellerPlan: false } })) ??
        (await db.subscriptionPlan.create({
            data: { plan: "basico", credits: 3000, priceUSD: 29, isActive: true, features: [] },
        }));
    await db.subscriptionPlan.update({ where: { id: planBasico.id }, data: { credits: 3000, isActive: true } });
    ponerAQuienMira(COMO_CASA);
});

/* ───────────────────────────── «Marcar pagado» ───────────────────────────── */

test("Marcar pagado: el vencimiento avanza, los créditos vuelven y al día siguiente SIGUE activa", async () => {
    const id = ID("marcar");
    await cuenta(id, { status: false });
    await suspendida(id);
    await creditos(id, 3000, 2800);

    const r = await markUserAsPaid(id);
    assert.equal(r.success, true, r.message);

    // El trabajo diario de mañana.
    await syncUserBillingLifecycle({ userId: id, now: dentroDe(1), sendStateChangeMessage: false });

    const b = await cobro(id);
    const c = await bolsa(id);
    const u = await fila(id);

    if (ROTO) {
        assert.ok(diasHasta(b.dueDate) < 0, "ANTES: el vencimiento se quedaba en el pasado");
        assert.equal(b.accessStatus, "SUSPENDED", "ANTES: al día siguiente volvía a suspenderla");
        assert.equal(c.used, 2800, "ANTES: los créditos no volvían");
        return;
    }
    assert.equal(diasHasta(b.dueDate), 30, "un ciclo desde hoy (ya estaba vencida)");
    assert.equal(b.billingStatus, "PAID");
    assert.equal(b.accessStatus, "ACTIVE", "al día siguiente no se vuelve a suspender");
    assert.equal(c.used, 0, "créditos repuestos");
    assert.equal(diasHasta(c.renewalDate), 30, "créditos y plan renuevan el mismo día");
    assert.equal(u.status, true, "la cuenta vuelve a estar habilitada");
});

test("Marcar pagado a una cuenta al día suma el ciclo a SU vencimiento", async () => {
    if (ROTO) return;
    const id = ID("aldia");
    await cuenta(id);
    await db.userBilling.create({
        data: {
            userId: id,
            billingStatus: "PAID",
            accessStatus: "ACTIVE",
            dueDate: dentroDe(3),
            graceDays: 0,
            licenseDays: 30,
        },
    });
    const r = await markUserAsPaid(id);
    assert.equal(r.success, true, r.message);
    assert.equal(diasHasta((await cobro(id)).dueDate), 33);
});

/* ───────────────────────────── «Editar pagos» ───────────────────────────── */

test("Editar pagos: mover la fecha ADELANTE repone los créditos", async () => {
    const id = ID("editar");
    await cuenta(id);
    await suspendida(id);
    await creditos(id, 3000, 2500);

    const r = await setUserBillingDueDate(id, dentroDe(30));
    assert.equal(r.success, true, r.message);
    const c = await bolsa(id);

    if (ROTO) {
        assert.equal(c.used, 2500, "ANTES: la fecha se movía y los créditos no");
        return;
    }
    assert.equal(c.used, 0);
    assert.equal(diasHasta(c.renewalDate), 30);
    assert.equal((await cobro(id)).accessStatus, "ACTIVE");
});

test("Editar pagos: corregir la fecha HACIA ATRÁS no regala créditos", async () => {
    const id = ID("atras");
    await cuenta(id);
    await db.userBilling.create({
        data: { userId: id, billingStatus: "PAID", accessStatus: "ACTIVE", dueDate: dentroDe(20), graceDays: 3 },
    });
    await creditos(id, 3000, 1200);

    const r = await setUserBillingDueDate(id, dentroDe(18));
    assert.equal(r.success, true, r.message);
    assert.equal((await bolsa(id)).used, 1200, "los créditos no se tocan");
});

/* ───────────────────────────── «Aprobar» ───────────────────────────── */

test("Aprobar: el acceso y el vencimiento vuelven, y el total PACTADO no se pisa", async () => {
    const id = ID("aprobar");
    await cuenta(id, { plan: "personalizado", status: false });
    await suspendida(id);
    await creditos(id, 50000, 900);
    const sub = await db.userSubscription.create({
        data: {
            userId: id,
            subscriptionPlanId: planBasico.id,
            status: "PENDING_APPROVAL",
            paymentMethod: "NEQUI",
            amountUSD: 29,
        },
    });

    const vence = dentroDe(30);
    const r = await approveSubscription(sub.id, { startDate: new Date(), expiresAt: vence });
    assert.equal(r.success, true, r.message);

    const b = await cobro(id);
    const c = await bolsa(id);
    const u = await fila(id);

    if (ROTO) {
        assert.equal(b.accessStatus, "SUSPENDED", "ANTES: aprobar no reactivaba el acceso");
        assert.ok(diasHasta(b.dueDate) < 0, "ANTES: ni movía el vencimiento");
        assert.equal(c.total, 3000, "ANTES: pisaba el total pactado con el de lista");
        assert.equal(u.plan, "basico", "ANTES: le quitaba el plan personalizado");
        return;
    }
    assert.equal(b.billingStatus, "PAID");
    assert.equal(b.accessStatus, "ACTIVE");
    assert.equal(new Date(b.dueDate).getTime(), vence.getTime(), "vence cuando la suscripción aprobada");
    assert.equal(c.total, 50000, "el total pactado se conserva");
    assert.equal(c.used, 0, "el consumo sí se repone");
    assert.equal(u.plan, "personalizado");
    assert.equal(u.status, true);

    const otra = await approveSubscription(sub.id, { startDate: new Date(), expiresAt: dentroDe(60) });
    assert.equal(otra.success, false, "una activa no se vuelve a aprobar");
    assert.equal(new Date((await cobro(id)).dueDate).getTime(), vence.getTime());
});

test("Aprobar a una cuenta sin créditos le crea su bolsa con el cupo del plan", async () => {
    const id = ID("sinbolsa");
    await cuenta(id, { plan: "lite" });
    const sub = await db.userSubscription.create({
        data: { userId: id, subscriptionPlanId: planBasico.id, status: "PENDING_APPROVAL", amountUSD: 29 },
    });
    const r = await approveSubscription(sub.id, { startDate: new Date(), expiresAt: dentroDe(30) });
    assert.equal(r.success, true, r.message);
    const c = await bolsa(id);
    assert.equal(c?.total, 3000);
    assert.equal(c?.used, 0);
    assert.equal((await fila(id)).plan, "basico");
});

test("Aprobar también la que espera el pago (Wompi)", async () => {
    const id = ID("aprobarwompi");
    await cuenta(id);
    const sub = await db.userSubscription.create({
        data: { userId: id, subscriptionPlanId: planBasico.id, status: "PENDING_PAYMENT", paymentMethod: "WOMPI", amountUSD: 29 },
    });
    const r = await approveSubscription(sub.id, { startDate: new Date(), expiresAt: dentroDe(30) });
    assert.equal(r.success, true, r.message);
    const s = await db.userSubscription.findUnique({ where: { id: sub.id } });
    assert.equal(s.status, "ACTIVE");
    if (!ROTO) assert.equal((await cobro(id)).accessStatus, "ACTIVE");
});

/* ───────────────────────────── Wompi ───────────────────────────── */

function eventoFirmado({ id, reference, cents, secreto }) {
    const data = { transaction: { id, status: "APPROVED", reference, amount_in_cents: cents, currency: "COP", payment_method_type: "CARD" } };
    const properties = ["transaction.id", "transaction.status", "transaction.amount_in_cents"];
    const timestamp = Math.floor(Date.now() / 1000);
    const cadena = `${id}APPROVED${cents}${timestamp}${secreto}`;
    const checksum = createHash("sha256").update(cadena).digest("hex");
    return { event: "transaction.updated", data, signature: { properties, checksum }, timestamp };
}

test("Wompi: la suscripción que esperaba el pago queda ACTIVA con el vencimiento de la cuenta", async () => {
    const id = ID("wompi");
    await cuenta(id, { status: false });
    await suspendida(id, { price: 100000 });
    await creditos(id, 3000, 3000);
    const sub = await db.userSubscription.create({
        data: { userId: id, subscriptionPlanId: planBasico.id, status: "PENDING_PAYMENT", paymentMethod: "WOMPI", amountUSD: 29 },
    });

    const cuerpo = eventoFirmado({
        id: `tx-${V}`,
        reference: `verzay-${id}-basico-${Date.now()}`,
        cents: 10000000,
        secreto: process.env.WOMPI_EVENTS_SECRET,
    });
    const res = await avisoDeWompi(
        new Request("http://localhost/api/payment/wompi", { method: "POST", body: JSON.stringify(cuerpo) }),
    );
    const json = await res.json();
    assert.equal(res.status, 200);
    assert.equal(json.applied, true, json.message);

    const b = await cobro(id);
    const s = await db.userSubscription.findUnique({ where: { id: sub.id } });
    const c = await bolsa(id);

    assert.equal(b.accessStatus, "ACTIVE", "el pago de Wompi ya reactivaba: eso no cambia");
    assert.equal(diasHasta(b.dueDate), 30);

    if (ROTO) {
        assert.equal(s.status, "PENDING_PAYMENT", "ANTES: la suscripción se quedaba pendiente para siempre");
        return;
    }
    assert.equal(s.status, "ACTIVE");
    assert.equal(new Date(s.expiresAt).getTime(), new Date(b.dueDate).getTime(), "una sola fecha");
    assert.equal(c.used, 0);
    assert.equal((await fila(id)).status, true, "la cuenta vuelve a estar habilitada");
});
