/**
 * El «No autorizado» del Contexto del lead, contra Postgres y por las ACCIONES
 * de verdad.
 *
 * Al abrir el panel se piden el playbook (`getSalesPlaybookAction`) y, al
 * pulsar, la puntuación (`scoreLeadBySessionId`). Las dos buscaban la
 * conversación con `userId = la cuenta de quien mira`, así que desde la cuenta
 * madre —o desde el superadministrador— un chat de una cuenta que cuelga de
 * ella, que la bandeja SÍ enseña, salía «No autorizado.» en rojo cada vez que
 * se abría el panel.
 *
 * Se comprueba:
 *  - el superadministrador y la madre alcanzan la conversación de la hija;
 *  - la hija NO alcanza la de su madre, ni una cuenta ajena la de nadie: la
 *    puerta se abrió hacia abajo y solo hacia abajo;
 *  - la valoración del playbook se guarda con la CUENTA de la conversación y la
 *    firma la PERSONA.
 *
 * `MODO=roto` corre las acciones de `ANTES_REF` y AFIRMA el fallo.
 */
import test from "node:test";
import assert from "node:assert/strict";

const ROTO = process.env.MODO === "roto";
const m = await import(
    ROTO
        ? "./.compilado/contexto/entrada-del-contexto-del-lead-antes.js"
        : "./.compilado/contexto/entrada-del-contexto-del-lead.js"
);
const { ponerAQuienMira, getSalesPlaybookAction, saveSalesPlaybookFeedbackAction, scoreLeadBySessionId, db } = m;

const V = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const SUPER = `cx-super-${V}`;
const MADRE = `cx-madre-${V}`;
const HIJA = `cx-hija-${V}`;
const AJENA = `cx-ajena-${V}`;
const ses = {};

function quien(id, role = "admin") {
    return {
        id,
        effectiveId: id,
        sessionUserId: id,
        ownerId: null,
        advisorRole: null,
        role,
        rolDeLaPersona: role,
        porImpersonacion: false,
        email: `${id}@banco.test`,
        name: id,
    };
}

test.before(async () => {
    const prov = await db.aiProvider.create({ data: { name: `openai-${V}`, aiModel: "gpt-4o-mini" } });
    for (const [id, role] of [[SUPER, "super_admin"], [MADRE, "admin"], [HIJA, "user"], [AJENA, "user"]]) {
        await db.user.create({
            data: { id, email: `${id}@banco.test`, name: id, role, ownerId: null, defaultProviderId: prov.id },
        });
        // Todas con su clave: así la puntuación no se rinde ANTES de buscar la
        // conversación, que es donde estaba el fallo.
        await db.userAiConfig.create({ data: { userId: id, providerId: prov.id, apiKey: `sk-${id}` } });
    }
    await db.$executeRawUnsafe(
        `INSERT INTO "linked_accounts" ("id", "master_user_id", "linked_user_id") VALUES ($1, $2, $3)`,
        `cx-${V}`,
        MADRE,
        HIJA,
    );
    for (const cuenta of [MADRE, HIJA]) {
        const s = await db.session.create({
            data: {
                userId: cuenta,
                remoteJid: `57300${cuenta.length}${V.slice(-4).replace(/\D/g, "1")}@s.whatsapp.net`,
                pushName: `Cliente de ${cuenta}`,
                instanceId: `LINEA_${cuenta}`,
                status: true,
            },
        });
        ses[cuenta] = s.id;
    }
});

test.after(async () => {
    await db.$disconnect();
});

const NO = "No autorizado.";

for (const [nombre, mira] of [
    ["el superadministrador", () => quien(SUPER, "super_admin")],
    ["la cuenta madre", () => quien(MADRE, "admin")],
]) {
    test(`${nombre} abre el Contexto del lead de un chat de la HIJA sin «No autorizado»`, async () => {
        ponerAQuienMira(mira());
        const playbook = await getSalesPlaybookAction(ses[HIJA]);
        const puntua = await scoreLeadBySessionId(ses[HIJA]);
        if (ROTO) {
            assert.equal(playbook.message, NO, "el «antes» tenía que contestar «No autorizado.» al abrir el panel");
            assert.equal(puntua.message, "Sesión no encontrada.", "y puntuar, «Sesión no encontrada.»");
            return;
        }
        assert.notEqual(playbook.message, NO, `el playbook contestó «No autorizado.» a ${nombre}`);
        assert.notEqual(puntua.message, NO);
        assert.notEqual(puntua.message, "Sesión no encontrada.");
    });
}

test("la HIJA no alcanza el chat de su madre: la puerta solo se abrió hacia abajo", async () => {
    ponerAQuienMira(quien(HIJA, "user"));
    assert.equal((await getSalesPlaybookAction(ses[MADRE])).message, NO);
    const puntua = await scoreLeadBySessionId(ses[MADRE]);
    assert.ok(!puntua.success, "la hija no puede puntuar el lead de su madre");
});

test("una cuenta ajena no alcanza ninguna", async () => {
    ponerAQuienMira(quien(AJENA, "user"));
    assert.equal((await getSalesPlaybookAction(ses[HIJA])).message, NO);
    assert.equal((await getSalesPlaybookAction(ses[MADRE])).message, NO);
});

test("la valoración se guarda con la CUENTA de la conversación y la firma la persona", async (t) => {
    if (ROTO) {
        t.skip("en el «antes» ni se llega a guardar: la puerta dice que no");
        return;
    }
    ponerAQuienMira(quien(MADRE, "admin"));
    const r = await saveSalesPlaybookFeedbackAction({ sessionId: ses[HIJA], product: "General", stage: "FRIO", useful: true });
    assert.equal(r.success, true);
    const fila = await db.salesPlaybookFeedback.findFirst({ where: { sessionId: ses[HIJA] } });
    assert.equal(fila?.userId, HIJA);
    assert.equal(fila?.advisorId, MADRE);
});
