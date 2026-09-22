/**
 * Nadie envía (ni lee) por la línea de canal de otra cuenta.
 *
 * `sendChannelTextAction` —texto libre por Meta y Telegram— no comprobaba de
 * quién era la línea: con sesión y el nombre de cualquiera se le escribía a un
 * cliente por un canal ajeno. Las hermanas del mismo fichero tenían el mismo
 * hueco: plantillas de Meta (listar y enviar), respuestas rápidas, la lista de
 * chats y la conversación.
 *
 * Contra Postgres y con `currentUser()` DE VERDAD; lo único fingido es la
 * petición (sesión y cookies) y el `fetch` hacia el backend, que se CUENTA: un
 * rechazo no puede llegar al proveedor.
 *
 * El árbol: MADRE arriba; HIJA colgando de ella; NIETA colgando de la hija;
 * HERMANA colgando también de la madre; y una AJENA fuera de la familia. Más
 * Yair, administrador de la hija por `owner_id`, y un agente de la hija.
 *
 * `MODO=roto` empaqueta ESTAS MISMAS pruebas contra el código de antes y afirma
 * la fuga: la hija escribe por la línea de su madre y el backend lo recibe.
 */
import test from "node:test";
import assert from "node:assert/strict";

const ROTO = process.env.MODO === "roto";
const m = await import(
    ROTO ? "./.compilado/canal-antes/entrada-del-canal.js" : "./.compilado/canal/entrada-del-canal.js"
);
const {
    ponerLaSesion, sendChannelTextAction, sendMetaTemplate, listMetaTemplates,
    sendChannelQuickReplyAction, fetchChannelChats, warmChannelMessages, db,
} = m;

const V = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const MADRE = `m-madre-${V}`;
const HIJA = `h-hija-${V}`;
const NIETA = `n-nieta-${V}`;
const HERMANA = `e-hermana-${V}`;
const AJENA = `z-ajena-${V}`;
const YAIR = `y-yair-${V}`;
const AGENTE = `y-agente-${V}`;
const CUENTAS = [MADRE, HIJA, NIETA, HERMANA, AJENA];
const PERSONAS = [YAIR, AGENTE];
const linea = (c) => `canal-${c}`;
const JID = `57300${String(Date.now()).slice(-7)}@s.whatsapp.net`;

// ── El backend, fingido y contado ──────────────────────────────────────────
let llamadas = [];
const fetchDeVerdad = globalThis.fetch;
globalThis.fetch = async (url, init) => {
    llamadas.push({ url: String(url), body: init?.body ? String(init.body) : null });
    if (String(url).includes("/meta-templates/")) {
        return new Response(JSON.stringify({ templates: [{ name: "t", language: "es", category: "", bodyText: "hola", paramCount: 0 }] }), { status: 200 });
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
};
const alBackend = () => llamadas.filter((l) => l.url.startsWith("http://backend.banco"));

async function como(quien, fn) {
    ponerLaSesion(quien);
    llamadas = [];
    return fn();
}
async function statusDe(cuenta) {
    const s = await db.session.findFirst({ where: { userId: cuenta, remoteJid: JID } });
    return s?.status;
}
const MENSAJE = "Oferta de prueba";
const enviar = (quien, dueno) => como(quien, () => sendChannelTextAction(linea(dueno), JID, { kind: "text", text: MENSAJE }));

let RR_DE_LA_HIJA;

test.before(async () => {
    for (const id of CUENTAS) {
        await db.user.create({ data: { id, email: `${id}@banco.test`, name: id, company: id, role: "admin" } });
        await db.instancia.create({ data: { instanceName: linea(id), instanceId: `iid-${id}`, userId: id, instanceType: "meta" } });
        await db.session.create({ data: { userId: id, remoteJid: JID, pushName: "Cliente", instanceId: `iid-${id}`, status: true } });
    }
    await db.user.create({ data: { id: YAIR, email: `${YAIR}@banco.test`, name: "Yair", role: "user", ownerId: HIJA, advisorRole: "administrador" } });
    await db.user.create({ data: { id: AGENTE, email: `${AGENTE}@banco.test`, name: "Agente", role: "user", ownerId: HIJA, advisorRole: "agente" } });

    const enlaces = [[MADRE, HIJA], [MADRE, HERMANA], [HIJA, NIETA]];
    let n = 0;
    for (const [de, a] of enlaces) {
        await db.$executeRawUnsafe(
            `INSERT INTO "linked_accounts" ("id", "master_user_id", "linked_user_id", "role")
             VALUES ($1, $2, $3, 'agente')`, `lc-${V}-${n++}`, de, a);
    }
    RR_DE_LA_HIJA = (await db.quickReply.create({ data: { userId: HIJA, mensaje: "Respuesta de la hija" } })).id;
});

test.after(async () => {
    globalThis.fetch = fetchDeVerdad;
    await db.$executeRawUnsafe(
        `DELETE FROM "linked_accounts" WHERE "master_user_id" = ANY($1::text[]) OR "linked_user_id" = ANY($1::text[])`,
        [...CUENTAS, ...PERSONAS]);
    await db.quickReply.deleteMany({ where: { userId: { in: CUENTAS } } });
    await db.session.deleteMany({ where: { userId: { in: CUENTAS } } });
    await db.instancia.deleteMany({ where: { userId: { in: CUENTAS } } });
    await db.user.deleteMany({ where: { id: { in: PERSONAS } } });
    await db.user.deleteMany({ where: { id: { in: CUENTAS } } });
    await db.$disconnect();
});

// ── La fuga de verdad: la hija escribe por la línea de su madre ─────────────

test("la HIJA no puede escribir por la línea de su MADRE: rechazo claro, nada llega al proveedor y la IA no se pausa", async () => {
    const r = await enviar(HIJA, MADRE);
    if (ROTO) {
        assert.equal(r.success, true, "antes: el envío salía");
        assert.equal(alBackend().length, 1, "antes: el backend lo recibía");
        assert.ok(alBackend()[0].url.includes(`/send-channel/${linea(MADRE)}`));
        return;
    }
    assert.equal(r.success, false);
    assert.match(r.message, /No tienes acceso a la línea .*: es de otra cuenta\./);
    assert.equal(alBackend().length, 0, "no puede llegar al proveedor");
    assert.equal(await statusDe(MADRE), true, "la IA de la conversación ajena no se pausa");
});

test("la HIJA tampoco por la de su HERMANA ni por la de una cuenta AJENA", async () => {
    for (const dueno of [HERMANA, AJENA]) {
        const r = await enviar(HIJA, dueno);
        if (ROTO) { assert.equal(r.success, true); continue; }
        assert.equal(r.success, false, dueno);
        assert.equal(alBackend().length, 0, dueno);
        assert.equal(await statusDe(dueno), true, dueno);
    }
});

test("un archivo tampoco: el envío de media por la línea de la madre se rechaza igual", async () => {
    const r = await como(HIJA, () => sendChannelTextAction(linea(MADRE), JID, {
        kind: "media", mediatype: "image", mediaUrl: "https://x.test/a.png",
    }));
    if (ROTO) return assert.equal(r.success, true);
    assert.equal(r.success, false);
    assert.equal(alBackend().length, 0);
});

test("sin sesión no se envía por ninguna línea", async () => {
    const r = await enviar(null, HIJA);
    if (ROTO) return assert.equal(alBackend().length, 1, "antes: sin sesión también salía");
    assert.equal(r.success, false);
    assert.equal(alBackend().length, 0);
});

test("una línea que no existe se dice con su nombre", async () => {
    const r = await como(HIJA, () => sendChannelTextAction(`no-existe-${V}`, JID, { kind: "text", text: "x" }));
    if (ROTO) return;
    assert.equal(r.success, false);
    assert.match(r.message, /No se encontró la línea/);
    assert.equal(alBackend().length, 0);
});

// ── Lo que tiene que seguir funcionando ─────────────────────────────────────

test("la HIJA sí escribe por su propia línea: llega al backend y la IA se pausa", async () => {
    const r = await enviar(HIJA, HIJA);
    assert.equal(r.success, true, r.message);
    assert.equal(alBackend().length, 1);
    assert.ok(alBackend()[0].url.endsWith(`/whatsapp/channels/send-channel/${linea(HIJA)}`));
    assert.equal(JSON.parse(alBackend()[0].body).text, MENSAJE);
    assert.equal(await statusDe(HIJA), false, "el asesor interviene: la IA se calla");
});

test("hacia ABAJO sí: la MADRE escribe por la de su hija y por la de su nieta", async () => {
    for (const dueno of [HIJA, NIETA]) {
        const r = await enviar(MADRE, dueno);
        assert.equal(r.success, true, `${dueno}: ${r.message}`);
        assert.equal(alBackend().length, 1, dueno);
    }
});

test("Yair, administrador de la hija por owner_id: su cuenta y la nieta sí; la madre no", async () => {
    assert.equal((await enviar(YAIR, HIJA)).success, true);
    assert.equal((await enviar(YAIR, NIETA)).success, true);
    const r = await enviar(YAIR, MADRE);
    if (ROTO) return assert.equal(r.success, true);
    assert.equal(r.success, false);
    assert.equal(alBackend().length, 0);
});

// ── Las hermanas del mismo fichero ──────────────────────────────────────────

test("plantilla de Meta: la hija no la envía por la línea de la madre; por la suya sí", async () => {
    const tpl = { name: "t", language: "es", category: "", bodyText: "hola", paramCount: 0 };
    const mala = await como(HIJA, () => sendMetaTemplate(linea(MADRE), JID, tpl, []));
    if (ROTO) {
        assert.equal(mala.success, true, "antes: la plantilla salía por la línea ajena");
    } else {
        assert.equal(mala.success, false);
        assert.match(mala.message, /es de otra cuenta/);
        assert.equal(alBackend().length, 0);
    }
    const buena = await como(HIJA, () => sendMetaTemplate(linea(HIJA), JID, tpl, []));
    assert.equal(buena.success, true, buena.message);
    assert.ok(alBackend().some((l) => l.url.includes(`/send-template/${linea(HIJA)}`)));
});

test("listar plantillas de la línea de la madre devuelve nada y no pregunta al backend", async () => {
    const r = await como(HIJA, () => listMetaTemplates(linea(MADRE)));
    if (ROTO) return assert.equal(r.templates.length, 1, "antes: se leían las plantillas ajenas");
    assert.deepEqual(r, { success: false, templates: [] });
    assert.equal(alBackend().length, 0);
    const propia = await como(HIJA, () => listMetaTemplates(linea(HIJA)));
    assert.equal(propia.templates.length, 1);
});

test("respuesta rápida por la línea de la madre: se rechaza por la LÍNEA y no llega al backend", async () => {
    const r = await como(HIJA, () => sendChannelQuickReplyAction(linea(MADRE), JID, RR_DE_LA_HIJA));
    assert.equal(r.success, false);
    assert.equal(alBackend().length, 0);
    if (!ROTO) assert.match(r.message, /No tienes acceso a la línea/);
    const buena = await como(HIJA, () => sendChannelQuickReplyAction(linea(HIJA), JID, RR_DE_LA_HIJA));
    assert.equal(buena.success, true, buena.message);
});

test("leer la lista y la conversación de la línea de la madre, llamando a la acción directa, se rechaza", async () => {
    const lista = await como(HIJA, () => fetchChannelChats(linea(MADRE)));
    const conv = await como(HIJA, () => warmChannelMessages(linea(MADRE), JID));
    if (ROTO) {
        assert.equal(lista.success, true, "antes: la lista ajena se leía");
        assert.equal(conv.success, true, "antes: la conversación ajena se leía");
        return;
    }
    assert.equal(lista.success, false);
    assert.equal(conv.success, false);
    assert.equal((await como(HIJA, () => fetchChannelChats(linea(HIJA)))).success, true);
    assert.equal((await como(HIJA, () => warmChannelMessages(linea(HIJA), JID))).success, true);
});

// ── La decisión, pura ───────────────────────────────────────────────────────

test("juzgarLaLineaDelCanal: sin sesión, sin línea, otra cuenta y la propia", { skip: ROTO }, async () => {
    const { juzgarLaLineaDelCanal } = await import("./.compilado/canal/linea-del-canal.js");
    assert.equal(juzgarLaLineaDelCanal({ instanceName: "L", cuentasQueAlcanza: null, duenoId: "a" }).motivo, "sin_sesion");
    assert.equal(juzgarLaLineaDelCanal({ instanceName: "L", cuentasQueAlcanza: ["a"], duenoId: null }).motivo, "sin_linea");
    assert.equal(juzgarLaLineaDelCanal({ instanceName: "L", cuentasQueAlcanza: ["a"], duenoId: "b" }).motivo, "otra_cuenta");
    assert.deepEqual(juzgarLaLineaDelCanal({ instanceName: "L", cuentasQueAlcanza: ["a", "b"], duenoId: "b" }), { ok: true, duenoId: "b" });
});
