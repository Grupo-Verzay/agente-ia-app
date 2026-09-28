/**
 * La campana contra Postgres, con la ACCIÓN de verdad (`getNotificationCenterData`)
 * y solo `currentUser()` fingido:
 *
 *  - Asignaciones: a Yair le asignan un chat y después se lo quitan con una
 *    transferencia a Sofía; los dos lo ven, cada uno lo suyo. Lo que Yair toma
 *    o suelta él mismo no le avisa, y lo de hace diez días tampoco.
 *  - Créditos bajos: sale el MISMO aviso que el motor mandó por WhatsApp
 *    (`ia_credit_alerts`), el más grave que siga siendo cierto; una cuenta que
 *    ya recargó no ve nada, y una sin aviso tampoco aunque ande baja.
 *
 * `MODO=roto` corre la acción de `ANTES_REF` sobre las mismas filas y afirma el
 * fallo: ni una asignación ni un aviso de créditos en la campana.
 */
import test from "node:test";
import assert from "node:assert/strict";

const ROTO = process.env.MODO === "roto";
const m = await import(`./.compilado/campana/${ROTO ? "antes-de-la-campana" : "entrada-de-la-campana"}.js`);
const { db, ponerAQuienMira, getNotificationCenterData } = m;
const V = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const CUENTA = `cp-cuenta-${V}`, YAIR = `cp-yair-${V}`, SOFIA = `cp-sofia-${V}`;
const RECARGO = `cp-recargo-${V}`, SIN_AVISO = `cp-sinaviso-${V}`;
const TOKENS = 3085;

const quien = (id, extra = {}) => ({
    id, effectiveId: extra.ownerId ?? id, sessionUserId: id, ownerId: null, advisorRole: null,
    role: "user", rolDeLaPersona: "user", email: `${id}@banco.test`, name: id, ...extra,
});
const hace = (dias) => new Date(Date.now() - dias * 86_400_000);
let S1, S2, S3;

test.before(async () => {
    for (const id of [CUENTA, RECARGO, SIN_AVISO]) {
        await db.user.create({ data: { id, email: `${id}@banco.test`, name: id, role: "user" } });
    }
    await db.user.create({ data: { id: YAIR, email: `${YAIR}@banco.test`, name: "Yair Silvera", ownerId: CUENTA, advisorRole: "agente" } });
    await db.user.create({ data: { id: SOFIA, email: `${SOFIA}@banco.test`, name: "Sofía", ownerId: CUENTA, advisorRole: "agente" } });
    let k = 0;
    const ses = async (nombre) => (await db.session.create({
        data: { userId: CUENTA, remoteJid: `57300${V.length}${k++}@s.whatsapp.net`, pushName: nombre, instanceId: "i", status: true },
    })).id;
    S1 = await ses("Marta López");
    S2 = await ses("Pedro");
    S3 = await ses("Viejo");
    const log = (sessionId, advisorId, assignedBy, action, cuando) => db.$executeRawUnsafe(
        `INSERT INTO "AssignmentLog" ("sessionId","advisorId","assignedBy","action","createdAt") VALUES ($1,$2,$3,$4,$5)`,
        sessionId, advisorId, assignedBy, action, cuando,
    );
    // S1: Carlos se la asigna a Yair y después se la transfiere a Sofía.
    await log(S1, YAIR, CUENTA, "assigned", hace(2));
    await log(S1, SOFIA, CUENTA, "transferred", hace(1));
    // S2: Yair la toma y la suelta él mismo.
    await log(S2, YAIR, YAIR, "taken", hace(1));
    await log(S2, null, YAIR, "released", hace(0.5));
    // S3: una asignación de hace diez días, fuera de la ventana.
    await log(S3, YAIR, CUENTA, "assigned", hace(10));

    // La tabla del motor, con su misma forma.
    await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "ia_credit_alerts" (
        "id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL, "threshold" INTEGER NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(), UNIQUE ("userId","threshold"))`);
    const credito = (userId, total, disponibles) => db.iaCredit.create({
        data: { userId, total, used: (total - disponibles) * TOKENS, renewalDate: new Date(Date.now() + 20 * 86_400_000) },
    });
    const alerta = (userId, threshold) => db.$executeRawUnsafe(
        `INSERT INTO "ia_credit_alerts" ("id","userId","threshold") VALUES ($1,$2,$3)`, `${userId}-${threshold}`, userId, threshold,
    );
    // La cuenta: 40 de 1000 (4 %), y el WhatsApp ya mandó 50, 25 y 5.
    await credito(CUENTA, 1000, 40);
    for (const t of [50, 25, 5]) await alerta(CUENTA, t);
    // Recargó a mano: 800 de 1000, con los avisos del ciclo todavía escritos.
    await credito(RECARGO, 1000, 800);
    for (const t of [50, 25]) await alerta(RECARGO, t);
    // Anda baja, pero el WhatsApp no mandó nada todavía.
    await credito(SIN_AVISO, 1000, 30);
});

async function campanaDe(persona) {
    ponerAQuienMira(persona);
    const res = await getNotificationCenterData();
    assert.equal(res.success, true, res.message);
    return res.data.items;
}
const de = (items, kind) => items.filter((i) => i.kind === kind);

test("Yair: le asignaron el chat de Marta y se lo quitaron; lo suyo propio no avisa", async () => {
    const items = de(await campanaDe(quien(YAIR, { ownerId: CUENTA, effectiveId: CUENTA, advisorRole: "agente" })), "asignacion");
    if (ROTO) {
        assert.equal(items.length, 0, "antes la campana no sabía de asignaciones");
        return;
    }
    assert.deepEqual(items.map((i) => i.title), [
        "Te quitaron el chat con Marta López",
        "Te asignaron el chat con Marta López",
    ]);
    assert.match(items[1].href, /^\/chats\?jid=/);
    assert.equal(items[0].href, "/chats", "quitada: ya no es suya, a la bandeja");
    assert.ok(!items.some((i) => /Pedro|Viejo/.test(i.title)), "ni lo que tomó él ni lo de hace diez días");
});

test("Sofía: ve que se lo asignaron a ella, no lo de Yair", async () => {
    const items = de(await campanaDe(quien(SOFIA, { ownerId: CUENTA, effectiveId: CUENTA, advisorRole: "agente" })), "asignacion");
    if (ROTO) return assert.equal(items.length, 0);
    assert.deepEqual(items.map((i) => i.title), ["Te asignaron el chat con Marta López"]);
});

test("créditos: la cuenta ve el aviso del 5 %, con sus cifras", async () => {
    const items = de(await campanaDe(quien(CUENTA)), "creditos");
    if (ROTO) return assert.equal(items.length, 0, "antes los créditos bajos solo llegaban por WhatsApp");
    assert.equal(items.length, 1, "uno por cuenta, el más grave");
    assert.match(items[0].title, /5 %/);
    assert.match(items[0].description, /40 de 1000/);
    assert.match(items[0].id, /^creditos:5:/);
});

test("créditos: su asesor ve el de la cuenta", async () => {
    const items = de(await campanaDe(quien(YAIR, { ownerId: CUENTA, effectiveId: CUENTA, advisorRole: "agente" })), "creditos");
    if (ROTO) return assert.equal(items.length, 0);
    assert.equal(items.length, 1);
});

test("créditos: quien ya recargó no ve nada, y quien no recibió el WhatsApp tampoco", async () => {
    assert.equal(de(await campanaDe(quien(RECARGO)), "creditos").length, 0);
    assert.equal(de(await campanaDe(quien(SIN_AVISO)), "creditos").length, 0);
});

test("los conteos van con las clases nuevas", async () => {
    ponerAQuienMira(quien(YAIR, { ownerId: CUENTA, effectiveId: CUENTA, advisorRole: "agente" }));
    const res = await getNotificationCenterData();
    if (ROTO) return assert.equal(res.data.counts.asignacion, undefined);
    assert.equal(res.data.counts.asignacion, 2);
    assert.equal(res.data.counts.creditos, 1);
    assert.equal(res.data.counts.correo, 0, "el número de correos lo pide la campana aparte");
});
