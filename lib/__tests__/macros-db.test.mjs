/**
 * Mis macros contra Postgres y por las ACCIONES de verdad.
 *
 * Una cuenta madre con tres líneas —una de Evolution, una de WhatsApp
 * Mensajería y una de Meta— más una de Telegram, una hija con su línea de
 * WhatsApp Mensajería (vinculada por `linked_accounts`) y una cuenta ajena. La
 * madre se llama «Empresa Demo» en `company`, que es como nace toda cuenta.
 *
 * Se comprueba:
 *  - lo que ENVÍA una macro sale por la línea de la conversación y por SU
 *    proveedor: Waha por sus acciones, Meta por las de canales, Evolution por
 *    las suyas (con la clave puesta en el servidor, nunca desde aquí);
 *  - una acción que contesta `success: false` es un FALLO con su motivo, y el
 *    aviso no dice «aplicada»;
 *  - una acción a medias no se corre y se cuenta como fallida, con su motivo;
 *  - una línea que no es de las cuentas que se alcanzan no se usa;
 *  - el Agente IA se toca con la cuenta DUEÑA de la conversación;
 *  - «Enviar por otra línea» ofrece las de WhatsApp Mensajería, con el nombre
 *    visible de la línea y el de la cuenta de verdad (no «Empresa Demo»);
 *  - guardar una macro con una acción a medias se rechaza también en el
 *    servidor, y activar o desactivar una vieja no.
 *
 * Lo único que se finge es `currentUser()`, `revalidatePath`, el `cache()` de
 * React y las ocho acciones que la macro llama por dentro, que se APUNTAN para
 * poder afirmar por cuál salió cada cosa.
 *
 * `MODO=roto` corre las acciones de `ANTES_REF` y AFIRMA el fallo: en una
 * línea de WhatsApp Mensajería no salía nada y el aviso decía «Macro
 * aplicada.», una acción a medias contaba como hecha, un envío rechazado
 * también, y «Enviar por otra línea» no ofrecía esas líneas.
 *
 * Se levanta con `scripts/banco-macros.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";

const ROTO = process.env.MODO === "roto";
const mod = ROTO
    ? await import("./.compilado/macros/entrada-de-macros-antes.js")
    : await import("./.compilado/macros/entrada-de-macros.js");
const { ponerAQuienMira, db, llamadas, contestar, limpiar } = mod;

const V = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const MADRE = `mc-madre-${V}`;
const HIJA = `mc-hija-${V}`;
const AJENA = `mc-ajena-${V}`;
const L = {
    evo: `MADRE_EVO_${V}`,
    waha: `MADRE_WAHA_${V}`,
    meta: `MADRE_META_${V}`,
    tg: `MADRE_TG_${V}`,
    hija: `HIJA_WAHA_${V}`,
    ajena: `AJENA_${V}`,
};
const JID = `57300${String(Date.now()).slice(-7)}@s.whatsapp.net`;
const ids = {};

function quien(id) {
    return { id, effectiveId: id, sessionUserId: id, ownerId: null, advisorRole: null, role: "user", rolDeLaPersona: "user", email: `${id}@banco.test`, name: id };
}

async function unaMacro(nombre, actions, extra = {}) {
    const m = await db.macro.create({ data: { userId: MADRE, name: nombre, actions, ...extra } });
    return m.id;
}

const correr = (macroId, sessionId, linea, extra = {}) =>
    mod.executeMacroAction({
        macroId,
        sessionId,
        remoteJid: JID,
        instanceName: linea,
        // La forma de ANTES: el chat solo mandaba el contexto si la línea
        // tenía clave de Evolution. Una de WhatsApp Mensajería no la tiene.
        context: null,
        ...extra,
    });

const envios = () => llamadas.filter((l) => /^send/.test(l.fn));

test.before(async () => {
    await db.user.create({ data: { id: MADRE, email: `${MADRE}@banco.test`, name: "Casa Verzay", company: "Empresa Demo", role: "user", ownerId: null } });
    await db.user.create({ data: { id: HIJA, email: `${HIJA}@banco.test`, name: "Verzay Ventas", company: "Empresa Demo", role: "user", ownerId: null } });
    await db.user.create({ data: { id: AJENA, email: `${AJENA}@banco.test`, name: "Otra", company: "Otra", role: "user", ownerId: null } });
    await db.$executeRawUnsafe(
        `INSERT INTO "linked_accounts" ("id", "master_user_id", "linked_user_id") VALUES ($1, $2, $3)`,
        `mc-enlace-${V}`, MADRE, HIJA,
    );
    await db.instancia.createMany({
        data: [
            { userId: MADRE, instanceName: L.evo, instanceId: `i1-${V}`, instanceType: "Whatsapp" },
            { userId: MADRE, instanceName: L.waha, instanceId: `i2-${V}`, instanceType: "waha", displayName: "Atención" },
            { userId: MADRE, instanceName: L.meta, instanceId: `i3-${V}`, instanceType: "meta" },
            { userId: MADRE, instanceName: L.tg, instanceId: `i4-${V}`, instanceType: "telegram" },
            { userId: HIJA, instanceName: L.hija, instanceId: `i5-${V}`, instanceType: "waha" },
            { userId: AJENA, instanceName: L.ajena, instanceId: `i6-${V}`, instanceType: "waha" },
        ],
    });
    const s1 = await db.session.create({ data: { userId: MADRE, remoteJid: JID, pushName: "Ana", instanceId: L.waha, status: true } });
    const s2 = await db.session.create({ data: { userId: HIJA, remoteJid: JID, pushName: "Ana", instanceId: L.hija, status: true } });
    Object.assign(ids, { sMadre: s1.id, sHija: s2.id });

    ids.hola = await unaMacro("Hola", [{ type: "SEND_TEXT", config: { text: "Hola, gracias por escribir" } }]);
    ids.todo = await unaMacro("Todo lo que envía", [
        { type: "SEND_TEXT", config: { text: "Hola" } },
        { type: "SEND_QUICK_REPLY", config: { quickReplyId: 7 } },
        { type: "EXECUTE_FLOW", config: { workflowId: "flujo-1" } },
        { type: "SEND_FILE", config: { mediaUrl: "https://s3.banco.test/a.pdf", mediatype: "document", fileName: "a.pdf" } },
    ]);
    ids.aMedias = await unaMacro("A medias", [{ type: "SEND_TEXT", config: { text: "" } }, { type: "RESOLVE" }]);
    ids.mixta = await unaMacro("Mixta", [{ type: "SEND_TEXT", config: { text: "Hola" } }, { type: "ADD_TAG", config: { tagId: 3 } }]);
    ids.ia = await unaMacro("Apagar IA", [{ type: "TOGGLE_AI", config: { disabled: true } }]);
    ids.otraLinea = await unaMacro("Por otra línea", [{ type: "SEND_TEXT_VIA", config: { instanceName: L.ajena, text: "Hola" } }]);
    ids.apagada = await unaMacro("Apagada", [{ type: "RESOLVE" }], { enabled: false });
});

test.beforeEach(() => {
    limpiar();
    ponerAQuienMira(quien(MADRE));
});

test.after(async () => {
    await db.$disconnect();
});

test(ROTO ? "ANTES: en una línea de WhatsApp Mensajería no salía nada y decía «Macro aplicada.»" : "en una línea de WhatsApp Mensajería el mensaje sale por Waha", async () => {
    const r = await correr(ids.hola, ids.sMadre, L.waha);
    if (ROTO) {
        assert.equal(envios().length, 0, "no se envió nada");
        assert.equal(r.success, true);
        assert.equal(r.message, "Macro aplicada.");
        assert.equal(r.failed, 0);
        return;
    }
    assert.deepEqual(envios().map((l) => l.fn), ["sendWahaTextAction"]);
    assert.equal(envios()[0].args[0], L.waha);
    assert.equal(envios()[0].args[1], JID);
    assert.deepEqual(envios()[0].args[2], { kind: "text", text: "Hola, gracias por escribir" });
    assert.equal(r.tono, "ok");
    assert.equal(r.message, "Macro aplicada: 1 acción.");
});

test("en una línea de Meta el mensaje sale por los canales, y en una de Evolution por las suyas sin clave desde aquí", { skip: ROTO }, async () => {
    await correr(ids.hola, ids.sMadre, L.meta);
    assert.deepEqual(envios().map((l) => l.fn), ["sendChannelTextAction"]);
    assert.equal(envios()[0].args[0], L.meta);

    limpiar();
    await correr(ids.hola, ids.sMadre, L.evo);
    assert.deepEqual(envios().map((l) => l.fn), ["sendManualChatPayloadAction"]);
    // La clave la pone el servidor a partir de la línea: nunca viaja desde aquí.
    assert.deepEqual(envios()[0].args[0], { apiKeyData: null, instanceName: L.evo });
});

test("respuesta rápida, flujo y archivo también van por el proveedor de la línea", { skip: ROTO }, async () => {
    const r = await correr(ids.todo, ids.sMadre, L.waha);
    assert.deepEqual(envios().map((l) => l.fn), ["sendWahaTextAction", "sendWahaQuickReplyAction", "sendWahaWorkflowAction", "sendWahaTextAction"]);
    assert.equal(envios()[3].args[2].kind, "media");
    assert.equal(envios()[3].args[2].mediaUrl, "https://s3.banco.test/a.pdf");
    assert.equal(r.applied, 4);

    limpiar();
    await correr(ids.todo, ids.sMadre, L.meta);
    assert.deepEqual(envios().map((l) => l.fn), ["sendChannelTextAction", "sendChannelQuickReplyAction", "sendChannelWorkflowAction", "sendChannelTextAction"]);

    limpiar();
    await correr(ids.todo, ids.sMadre, L.evo);
    assert.deepEqual(envios().map((l) => l.fn), ["sendManualChatPayloadAction", "sendManualQuickReplyAction", "sendManualWorkflowAction", "sendManualChatPayloadAction"]);
});

test(ROTO ? "ANTES: un envío rechazado se contaba como hecho" : "un envío rechazado es un FALLO con su motivo, y el aviso no dice «aplicada»", async () => {
    const fn = ROTO ? "sendManualChatPayloadAction" : "sendWahaTextAction";
    contestar(fn, { success: false, message: "La línea está desconectada." });
    const r = ROTO
        ? await correr(ids.hola, ids.sMadre, L.evo, { context: { apiKeyData: { url: "x", key: "y" }, instanceName: L.evo } })
        : await correr(ids.hola, ids.sMadre, L.waha);
    if (ROTO) {
        assert.equal(envios().length, 1);
        assert.equal(r.message, "Macro aplicada.");
        assert.equal(r.failed, 0);
        return;
    }
    assert.equal(r.success, false);
    assert.equal(r.tono, "error");
    assert.equal(r.failed, 1);
    assert.match(r.message, /No se aplicó ninguna acción/);
    assert.match(r.message, /«Enviar mensaje»: La línea está desconectada\./);
});

test(ROTO ? "ANTES: una acción a medias se saltaba en silencio y contaba como hecha" : "una acción a medias NO se corre y se cuenta como fallida, con su motivo", async () => {
    const r = await correr(ids.aMedias, ids.sMadre, L.evo, ROTO ? { context: { apiKeyData: { url: "x", key: "y" }, instanceName: L.evo } } : {});
    assert.equal(envios().length, 0, "el mensaje vacío no se envía");
    if (ROTO) {
        assert.equal(r.message, "Macro aplicada.");
        assert.equal(r.applied, 2);
        return;
    }
    assert.equal(r.tono, "parcial");
    assert.equal(r.applied, 1, "resolver sí sale");
    assert.match(r.message, /Se aplicaron 1 de 2 acciones/);
    assert.match(r.message, /«Enviar mensaje»: está a medias \(Escribe el mensaje\.\)/);
    assert.ok(llamadas.some((l) => l.fn === "resolveSession"));
});

test("si una acción sale y otra no, el aviso lo dice con los números delante", { skip: ROTO }, async () => {
    contestar("assignTagToSessionAction", { success: false, message: "Tag no encontrado." });
    const r = await correr(ids.mixta, ids.sMadre, L.waha);
    assert.equal(r.tono, "parcial");
    assert.equal(r.success, true);
    assert.equal(r.message, "Se aplicaron 1 de 2 acciones. No se pudo «Agregar etiqueta»: Tag no encontrado.");
    assert.deepEqual(r.resultados.map((x) => x.ok), [true, false]);
});

test("una línea que no es de las cuentas que se alcanzan no se usa", { skip: ROTO }, async () => {
    const r = await correr(ids.hola, ids.sMadre, L.ajena);
    assert.equal(envios().length, 0);
    assert.equal(r.tono, "error");
    assert.match(r.message, /no es de tu cuenta o ya no existe/);

    limpiar();
    const r2 = await correr(ids.otraLinea, ids.sMadre, L.waha);
    assert.equal(envios().length, 0);
    assert.match(r2.message, /no es de tu cuenta o ya no existe/);
});

test("la madre llega a la línea de su hija, y la hija no a la de su madre", { skip: ROTO }, async () => {
    const r = await correr(ids.hola, ids.sHija, L.hija);
    assert.equal(r.tono, "ok");
    assert.deepEqual(envios().map((l) => [l.fn, l.args[0]]), [["sendWahaTextAction", L.hija]]);

    // La hija no alcanza la macro de la madre (es de la cuenta madre) ni su línea.
    limpiar();
    ponerAQuienMira(quien(HIJA));
    const r2 = await correr(ids.hola, ids.sMadre, L.waha);
    assert.equal(r2.success, false);
    assert.equal(envios().length, 0);
});

test(ROTO ? "ANTES: el Agente IA se tocaba con la cuenta de quien pulsa" : "el Agente IA se toca con la cuenta DUEÑA de la conversación", async () => {
    await correr(ids.ia, ids.sHija, L.hija);
    const t = llamadas.find((l) => l.fn === "toggleAgentDisabled");
    assert.ok(t, "se llamó a toggleAgentDisabled");
    assert.equal(t.args[0], ROTO ? MADRE : HIJA);
    assert.equal(t.args[1], ids.sHija);
    assert.equal(t.args[2], true);
});

test("una macro desactivada no se corre, y la que sí suma su ejecución", { skip: ROTO }, async () => {
    const r = await correr(ids.apagada, ids.sMadre, L.waha);
    assert.equal(r.success, false);
    assert.equal(r.message, "Macro no encontrada o desactivada.");
    assert.equal(llamadas.length, 0);

    const antes = (await db.macro.findUnique({ where: { id: ids.hola } })).runCount;
    await correr(ids.hola, ids.sMadre, L.waha);
    const despues = await db.macro.findUnique({ where: { id: ids.hola } });
    assert.equal(despues.runCount, antes + 1);
    assert.ok(despues.lastRunAt);
});

test(ROTO ? "ANTES: «Enviar por otra línea» no ofrecía las de WhatsApp Mensajería" : "«Enviar por otra línea» ofrece las de WhatsApp, con su nombre visible y el de la cuenta de verdad", async () => {
    const r = await mod.getAccountLinesAction();
    assert.equal(r.success, true);
    const porNombre = new Map(r.data.map((l) => [l.instanceName, l]));
    if (ROTO) {
        assert.ok(!porNombre.has(L.waha), "la línea de Waha de la madre no salía");
        assert.ok(!porNombre.has(L.hija), "la de la hija tampoco");
        return;
    }
    assert.ok(porNombre.has(L.evo));
    assert.ok(porNombre.has(L.meta));
    assert.equal(porNombre.get(L.waha)?.label, "Atención", "con su nombre visible");
    assert.ok(!porNombre.has(L.tg), "Telegram no es WhatsApp");
    assert.ok(!porNombre.has(L.ajena), "ni una línea de una cuenta ajena");
    // La de la hija lleva delante el nombre de la cuenta: «Verzay Ventas», no
    // «Empresa Demo», que es como nace `company`.
    assert.equal(porNombre.get(L.hija)?.label, `Verzay Ventas · ${L.hija}`);
});

test(ROTO ? "ANTES: el servidor guardaba una macro con una acción a medias" : "guardar una acción a medias se rechaza en el servidor, y activar una vieja no", async () => {
    const r = await mod.createMacroAction({ name: "Vacía", actions: [{ type: "ADD_TAG", config: {} }] });
    if (ROTO) {
        assert.equal(r.success, true);
        return;
    }
    assert.equal(r.success, false);
    assert.equal(r.message, "Acción 1 (Agregar etiqueta): Elige la etiqueta.");

    const r2 = await mod.updateMacroAction(ids.hola, { actions: [{ type: "WAIT", config: { seconds: 99 } }] });
    assert.equal(r2.success, false);
    assert.match(r2.message, /1 a 20/);

    // Una macro vieja con una acción a medias se sigue pudiendo apagar y encender.
    assert.equal((await mod.updateMacroAction(ids.aMedias, { enabled: false })).success, true);
    assert.equal((await mod.updateMacroAction(ids.aMedias, { enabled: true })).success, true);

    const bien = await mod.createMacroAction({ name: "Bien", actions: [{ type: "RESOLVE" }] });
    assert.equal(bien.success, true);
});
