/**
 * Al confirmarse un pago la cuenta VUELVE: a «Activos», a Instancias y al cobro
 * diario. Contra Postgres y por las PUERTAS de verdad: «Marcar pagado»,
 * «Aprobar», el aviso de Wompi, «Activar» y «Editar pagos».
 *
 * Qué pasaba: el pago solo volvía a habilitar la cuenta (`User.status`) si su
 * acceso venía de `SUSPENDED`. Una cuenta deshabilitada por cualquier otro
 * motivo quedaba «Pagado / Activo» con `status` en falso, y eso la dejaba:
 *
 *  - invisible en Instancias (la lista pedía `status: true`),
 *  - fuera de «Activos» en Clientes (`tieneServicioActivo`),
 *  - y FUERA DEL COBRO DIARIO, que también pide `status: true`: su próximo
 *    cobro no salía nunca.
 *
 * Y la suspendida por impago desaparecía de Instancias, que es justo donde se
 * la cobra.
 *
 * Corre en DOS modos. `MODO=roto` empaqueta este mismo fichero contra el código
 * de un commit pinchado (`ANTES_ACCESO_REF` en `scripts/banco-ciclo-pagado.sh`)
 * y AFIRMA esos fallos.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

const ROTO = process.env.MODO === "roto";
const {
    activateUserService,
    approveSubscription,
    avisoDeWompi,
    db,
    dondeEntraEnElCobro,
    getClientsWithBilling,
    markUserAsPaid,
    ponerAQuienMira,
    setUserBillingDueDate,
    syncUserBillingLifecycle,
} = await import(
    ROTO
        ? "./.compilado/acceso-al-pagar-antes/entrada-del-ciclo-pagado.js"
        : "./.compilado/ciclo-pagado/entrada-del-ciclo-pagado.js"
);

const V = `a${Date.now().toString(36)}`;
const ID = (n) => `${V}-${n}`;
const DIA = 86400000;
const hace = (d) => new Date(Date.now() - d * DIA);
const dentroDe = (d) => new Date(Date.now() + d * DIA);
const diasHasta = (f) => Math.round((new Date(f).getTime() - Date.now()) / DIA);

const CASA = ID("casa");
const COMO_CASA = { id: CASA, role: "super_admin", ownerId: null, advisorRole: null, name: "Casa" };

async function cuenta(id, { status = true, borrada = false } = {}) {
    await db.$executeRawUnsafe(
        `INSERT INTO "User" ("id","email","name","company","role","plan","status","deletedAt","updatedAt")
         VALUES ($1,$2,$3,'Empresa Demo','user'::"Role",'basico'::"Plan",$4,$5,NOW())`,
        id,
        `${id}@banco.test`,
        id,
        status,
        borrada ? hace(1) : null,
    );
}

/** Deshabilitada por un motivo que NO es la suspensión: el acceso dice ACTIVE. */
async function deshabilitadaAlDia(id, { dueDate = hace(2), price = null, billingStatus = "UNPAID" } = {}) {
    await cuenta(id, { status: false });
    await db.userBilling.create({
        data: {
            userId: id,
            currencyCode: "COP",
            billingStatus,
            accessStatus: "ACTIVE",
            dueDate,
            serviceEndsAt: dueDate,
            graceDays: 3,
            licenseDays: 30,
            price,
        },
    });
}

async function suspendidaPorImpago(id) {
    await cuenta(id, { status: false });
    await db.userBilling.create({
        data: {
            userId: id,
            currencyCode: "COP",
            billingStatus: "UNPAID",
            accessStatus: "SUSPENDED",
            suspendedAt: hace(3),
            suspendedReason: "Vencido sin pago",
            dueDate: hace(5),
            serviceEndsAt: hace(5),
            graceDays: 0,
            licenseDays: 30,
        },
    });
}

const fila = (id) => db.user.findUnique({ where: { id }, select: { status: true } });
const cobro = (id) => db.userBilling.findUnique({ where: { userId: id } });

async function seVeEnInstancias(id) {
    const r = await getClientsWithBilling();
    assert.equal(r.success, true, r.message);
    return r.data.some((u) => u.id === id);
}

/** ¿La recoge el cobro diario cuando se acerque su próximo vencimiento? */
async function entraEnElProximoCobro(id) {
    const b = await cobro(id);
    // El día en que el cobro diario empieza a mirarla: 3 días antes de vencer.
    const cuando = new Date(new Date(b.dueDate).getTime() - 2 * DIA);
    const candidatos = await db.userBilling.findMany({ where: dondeEntraEnElCobro(cuando), select: { userId: true } });
    return candidatos.some((c) => c.userId === id);
}

let planBasico;

test.before(async () => {
    await db.$executeRawUnsafe(
        `INSERT INTO "User" ("id","email","name","role","updatedAt") VALUES ($1,$2,'Casa','super_admin'::"Role",NOW())`,
        CASA,
        `${CASA}@banco.test`,
    );
    planBasico =
        (await db.subscriptionPlan.findFirst({ where: { plan: "basico", assistanceType: "IA", isResellerPlan: false } })) ??
        (await db.subscriptionPlan.create({ data: { plan: "basico", credits: 3000, priceUSD: 29, isActive: true, features: [] } }));
    ponerAQuienMira(COMO_CASA);
});

/* ─────────────── la suspendida por impago no desaparece ─────────────── */

test("Instancias: la suspendida por impago SE VE, para poder cobrarla", async () => {
    const id = ID("suspendida");
    await suspendidaPorImpago(id);
    const visible = await seVeEnInstancias(id);
    if (ROTO) {
        assert.equal(visible, false, "ANTES: al suspenderse desaparecía de Instancias");
        return;
    }
    assert.equal(visible, true);
});

test("Instancias: lo eliminado sigue sin salir", async () => {
    const id = ID("eliminadalista");
    await cuenta(id, { status: false, borrada: true });
    await db.userBilling.create({ data: { userId: id, billingStatus: "UNPAID", accessStatus: "SUSPENDED", dueDate: hace(40) } });
    assert.equal(await seVeEnInstancias(id), false);
});

/* ─────────────── los caminos que reactivan ─────────────── */

async function comprobarQueVuelve(id, camino) {
    const u = await fila(id);
    const b = await cobro(id);
    const visible = await seVeEnInstancias(id);
    const cobra = await entraEnElProximoCobro(id);
    if (ROTO) {
        assert.equal(b.accessStatus, "ACTIVE", `${camino}: el acceso ya quedaba activo`);
        assert.equal(u.status, false, `ANTES (${camino}): la cuenta se quedaba deshabilitada`);
        assert.equal(visible, false, `ANTES (${camino}): invisible en Instancias`);
        assert.equal(cobra, false, `ANTES (${camino}): fuera del cobro diario`);
        return;
    }
    assert.equal(b.accessStatus, "ACTIVE", camino);
    assert.equal(b.billingStatus, "PAID", camino);
    assert.equal(u.status, true, `${camino}: la cuenta vuelve a estar habilitada`);
    assert.equal(visible, true, `${camino}: vuelve a Instancias`);
    assert.equal(cobra, true, `${camino}: su próximo cobro sale`);
    assert.ok(diasHasta(b.dueDate) > 0, `${camino}: vencimiento en el futuro`);
    assert.equal(b.lastReminderAt, null, `${camino}: el primer aviso del ciclo nuevo no nace mudo`);
}

test("Marcar pagado: vuelve aunque NO la hubiera cortado la suspensión", async () => {
    const id = ID("marcar");
    await deshabilitadaAlDia(id);
    const r = await markUserAsPaid(id);
    assert.equal(r.success, true, r.message);
    await comprobarQueVuelve(id, "Marcar pagado");
});

test("Aprobar suscripción: vuelve aunque NO la hubiera cortado la suspensión", async () => {
    const id = ID("aprobar");
    await deshabilitadaAlDia(id);
    const sub = await db.userSubscription.create({
        data: { userId: id, subscriptionPlanId: planBasico.id, status: "PENDING_APPROVAL", amountUSD: 29 },
    });
    const r = await approveSubscription(sub.id, { startDate: new Date(), expiresAt: dentroDe(30) });
    assert.equal(r.success, true, r.message);
    await comprobarQueVuelve(id, "Aprobar");
});

function eventoFirmado({ id, reference, cents, secreto }) {
    const data = { transaction: { id, status: "APPROVED", reference, amount_in_cents: cents, currency: "COP", payment_method_type: "CARD" } };
    const properties = ["transaction.id", "transaction.status", "transaction.amount_in_cents"];
    const timestamp = Math.floor(Date.now() / 1000);
    const checksum = createHash("sha256").update(`${id}APPROVED${cents}${timestamp}${secreto}`).digest("hex");
    return { event: "transaction.updated", data, signature: { properties, checksum }, timestamp };
}

test("Wompi: vuelve aunque NO la hubiera cortado la suspensión", async () => {
    const id = ID("wompi");
    await deshabilitadaAlDia(id, { price: 100000 });
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
    await comprobarQueVuelve(id, "Wompi");
});

test("Editar pagos (fecha adelante): vuelve aunque NO la hubiera cortado la suspensión", async () => {
    const id = ID("editar");
    // Al día y pagada: mover la fecha no cambia ningún estado, así que el
    // trabajo diario no se entera y la cuenta se quedaba deshabilitada.
    await deshabilitadaAlDia(id, { dueDate: dentroDe(2), billingStatus: "PAID" });
    const r = await setUserBillingDueDate(id, dentroDe(32));
    assert.equal(r.success, true, r.message);
    // «Editar pagos» mueve la fecha; no marca PAID. Se comprueba lo que toca.
    const u = await fila(id);
    const visible = await seVeEnInstancias(id);
    if (ROTO) {
        assert.equal(u.status, false, "ANTES: la fecha avanzaba y la cuenta seguía deshabilitada");
        assert.equal(visible, false);
        return;
    }
    assert.equal(u.status, true);
    assert.equal(visible, true);
    assert.equal(await entraEnElProximoCobro(id), true);
});

test("Activar: devuelve la cuenta, no solo el acceso", async () => {
    const id = ID("activar");
    await suspendidaPorImpago(id);
    const r = await activateUserService(id);
    assert.equal(r.success, true, r.message);
    const u = await fila(id);
    if (ROTO) {
        assert.equal(u.status, false, "ANTES: Activar dejaba el acceso en ACTIVE con la cuenta deshabilitada");
        return;
    }
    assert.equal(u.status, true);
    assert.equal(await seVeEnInstancias(id), true);
});

test("la suspendida por impago que paga (Marcar pagado) vuelve y sigue en el cobro", async () => {
    const id = ID("suspendidapaga");
    await suspendidaPorImpago(id);
    const r = await markUserAsPaid(id);
    assert.equal(r.success, true, r.message);
    const u = await fila(id);
    assert.equal(u.status, true, "esto ya funcionaba: no se puede haber aflojado");
    assert.equal(await seVeEnInstancias(id), true);
    assert.equal(await entraEnElProximoCobro(id), true);
    // Y al llegar su próximo vencimiento el trabajo diario la trata como a
    // cualquiera: la vuelve a suspender si no paga, no la olvida.
    const b = await cobro(id);
    const s = await syncUserBillingLifecycle({
        userId: id,
        now: new Date(new Date(b.dueDate).getTime() + 2 * DIA),
        sendStateChangeMessage: false,
    });
    assert.equal(s.billing.accessStatus, "SUSPENDED", "el ciclo siguiente se cobra con normalidad");
});

/* ─────────────── lo que NO puede aflojarse ─────────────── */

test("pagar NO resucita una cuenta eliminada", async () => {
    const id = ID("eliminada");
    await cuenta(id, { status: false, borrada: true });
    await db.userBilling.create({
        data: { userId: id, billingStatus: "UNPAID", accessStatus: "SUSPENDED", dueDate: hace(40), licenseDays: 30 },
    });
    const r = await markUserAsPaid(id);
    assert.equal(r.success, true, r.message);
    if (ROTO) {
        assert.equal((await fila(id)).status, true, "ANTES: pagar la volvía a habilitar estando eliminada");
        return;
    }
    assert.equal((await fila(id)).status, false, "sigue deshabilitada");
    assert.equal(await seVeEnInstancias(id), false, "sigue fuera de Instancias");
});
