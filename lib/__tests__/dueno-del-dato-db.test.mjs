/**
 * El dueño del dato, contra Postgres y con las ACCIONES de verdad.
 *
 * Tres cuentas: A (la dueña), H (hija de A por `linked_accounts`) y B (ajena,
 * sin ningún vínculo). Cada una con su asesor. A tiene una conversación, un
 * registro, su entrenamiento maestro, el entrenamiento de su agente con una
 * revisión, y un flujo con dos pasos.
 *
 * Lo que se prueba, acción por acción: **B no alcanza nada de A** —ni leer,
 * ni escribir, ni borrar— y **A sí**, incluido lo de su hija. Y lo que no se
 * puede aflojar: la reserva pública sigue creando su lead SIN sesión.
 *
 * `MODO=roto` empaqueta EXACTAMENTE estas pruebas contra el código de antes
 * (commit pinchado en `scripts/banco-dueno-del-dato.sh`) y **afirma la fuga**:
 * B lee las notas de A, toma su chat, le reescribe el entrenamiento y le
 * vacía el flujo.
 */
import test from "node:test";
import assert from "node:assert/strict";

const ROTO = process.env.MODO === "roto";
const m = await import(
    ROTO
        ? "./.compilado/dueno-antes/entrada-del-dueno-del-dato.js"
        : "./.compilado/dueno/entrada-del-dueno-del-dato.js"
);
const { ponerLaSesion, db } = m;

const V = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const A = `a-duena-${V}`;
const H = `h-hija-${V}`;
const B = `b-ajena-${V}`;
const ASESOR_A = `aa-asesor-${V}`;
const ASESOR_B = `bb-asesor-${V}`;
const CUENTAS = [A, H, B];
const PERSONAS = [ASESOR_A, ASESOR_B];

let SES_A, SES_H, REG_A, MSG_A, PROMPT_A, VERSION_A, FLUJO_A, NODO_A1, NODO_A2;

/** Las secciones de un entrenamiento recién nacido: las de `getOrCreatePrompt`. */
const SECCIONES_VACIAS = {
    business: { nombre: "A", sector: "", ubicacion: "", horarios: "", telefono: "", email: "", sitio: "", facebook: "", instagram: "", tiktok: "", youtube: "", linkedin: "", twitter: "", telegram: "", notas: "" },
    training: { steps: [] },
    faq: { items: [] },
    products: { items: [] },
    extras: { firmaEnabled: false, firmaText: "", firmaName: "", items: [] },
    management: { items: [] },
};

/** «B no llega»: la respuesta no puede ser un éxito, ni traer datos. */
const noLlega = (r) => {
    if (r === null || r === undefined) return true;
    if (Array.isArray(r)) return r.length === 0;
    if (typeof r === "object") {
        if ("ok" in r) return r.ok === false;
        if ("success" in r) return r.success === false;
    }
    return false;
};
const lanzaONoLlega = async (fn) => {
    try {
        return noLlega(await fn());
    } catch {
        return true;
    }
};

test.before(async () => {
    for (const id of CUENTAS) {
        await db.user.create({ data: { id, email: `${id}@banco.test`, name: id, role: "user", plan: "avanzado" } });
    }
    await db.user.create({ data: { id: ASESOR_A, email: `${ASESOR_A}@banco.test`, name: "Asesor A", role: "user", ownerId: A, advisorRole: "agente" } });
    await db.user.create({ data: { id: ASESOR_B, email: `${ASESOR_B}@banco.test`, name: "Asesor B", role: "user", ownerId: B, advisorRole: "agente" } });
    await db.$executeRawUnsafe(
        `INSERT INTO "linked_accounts" ("id", "master_user_id", "linked_user_id", "role") VALUES ($1, $2, $3, 'agente')`,
        `la-${V}`, A, H);

    SES_A = (await db.session.create({ data: { userId: A, remoteJid: `573001${V.slice(-6)}@s.whatsapp.net`, pushName: "Lead A", instanceId: `linea-${A}`, status: true } })).id;
    SES_H = (await db.session.create({ data: { userId: H, remoteJid: `573002${V.slice(-6)}@s.whatsapp.net`, pushName: "Lead H", instanceId: `linea-${H}`, status: true } })).id;
    REG_A = (await db.registro.create({ data: { sessionId: SES_A, userId: A, tipo: "PEDIDO", estado: "Pendiente", nombre: "Pedido de A" } })).id;
    MSG_A = (await db.systemMessage.create({ data: { userId: A, title: "Maestro A", message: "Eres el agente de A", typePrompt: "TRAINING" } })).id;

    const prompt = await db.agentPrompt.create({
        data: { userId: A, agentId: "system-prompt-ai", status: "draft", sections: SECCIONES_VACIAS, promptText: "texto A", businessName: "A" },
    });
    PROMPT_A = prompt.id;
    VERSION_A = prompt.version;
    await db.agentPromptRevision.create({
        data: { promptId: PROMPT_A, revisionNumber: 1, sectionsSnapshot: SECCIONES_VACIAS, promptTextSnapshot: "texto A", publishedBy: A },
    });

    FLUJO_A = (await db.workflow.create({ data: { userId: A, name: `FLUJO-${V}`, status: "DRAFT", definition: "workflow" } })).id;
    NODO_A1 = (await db.workflowNode.create({ data: { workflowId: FLUJO_A, message: "Hola, soy A", tipo: "text", order: 1 } })).id;
    NODO_A2 = (await db.workflowNode.create({ data: { workflowId: FLUJO_A, message: "Segundo paso", tipo: "seguimiento-text", order: 2, delay: "1h" } })).id;
});

test.after(async () => {
    await db.$executeRawUnsafe(`DELETE FROM "linked_accounts" WHERE "master_user_id" = ANY($1::text[])`, CUENTAS);
    await db.workflow.deleteMany({ where: { userId: { in: [...CUENTAS, ...PERSONAS] } } });
    await db.session.deleteMany({ where: { userId: { in: CUENTAS } } });
    await db.user.deleteMany({ where: { id: { in: PERSONAS } } });
    await db.user.deleteMany({ where: { id: { in: CUENTAS } } });
    await db.$disconnect();
});

// ── Notas internas ────────────────────────────────────────────────────────

test("notas internas: B no escribe en la conversación de A", async () => {
    ponerLaSesion(B);
    const r = await m.createInternalNoteAction({ sessionId: SES_A, content: "nota de B" });
    if (ROTO) return assert.equal(r.success, true, "antes: B escribía en la conversación de A");
    assert.equal(r.success, false);
});

test("notas internas: A escribe en la suya, y la madre en la de su hija", async () => {
    ponerLaSesion(A);
    assert.equal((await m.createInternalNoteAction({ sessionId: SES_A, content: "nota de A" })).success, true);
    assert.equal((await m.createInternalNoteAction({ sessionId: SES_H, content: "nota de A en H" })).success, true);
});

test("notas internas: B no las lee", async () => {
    ponerLaSesion(B);
    const r = await m.getInternalNotesBySessionAction(SES_A);
    if (ROTO) return assert.ok(r.success && r.data.length > 0, "antes: B leía las notas de A");
    assert.equal(r.success, false);
    ponerLaSesion(A);
    const suyas = await m.getInternalNotesBySessionAction(SES_A);
    assert.ok(suyas.success && suyas.data.some((n) => n.content === "nota de A"));
});

// ── Participantes ─────────────────────────────────────────────────────────

test("participantes: A agrega a su asesor; B no los ve, ni los quita", async () => {
    ponerLaSesion(A);
    assert.equal((await m.addSessionParticipantAction(SES_A, ASESOR_A)).success, true);

    ponerLaSesion(B);
    const vistos = await m.getSessionParticipantsAction(SES_A);
    const quitado = await m.removeSessionParticipantAction(SES_A, ASESOR_A);
    const quedan = await db.sessionParticipant.count({ where: { sessionId: SES_A } });
    if (ROTO) {
        assert.ok(vistos.data.length > 0, "antes: B veía quién llevaba la conversación de A");
        assert.equal(quedan, 0, "antes: B quitaba participantes ajenos");
        return;
    }
    assert.equal(vistos.success, false);
    assert.equal(quitado.success, false);
    assert.equal(quedan, 1, "el participante de A sigue ahí");
});

test("participantes: B no agrega a su asesor en la conversación de A", async () => {
    ponerLaSesion(B);
    const r = await m.addSessionParticipantAction(SES_A, ASESOR_B);
    // Antes esto ya fallaba por otro lado (el asesor no era del equipo de B…
    // sí lo era: pasaba). Lo que se afirma es que ahora NO pasa.
    if (ROTO) return;
    assert.equal(r.success, false);
});

// ── Asignar y tomar ───────────────────────────────────────────────────────

test("tomar: el asesor de B no se queda con la conversación de A", async () => {
    ponerLaSesion(ASESOR_B);
    const r = await m.takeSession(SES_A);
    const fila = await db.$queryRawUnsafe(`SELECT assigned_advisor_id AS a FROM "Session" WHERE id = $1`, SES_A);
    if (ROTO) {
        assert.equal(fila[0].a, ASESOR_B, "antes: el asesor de B tomaba el chat de A");
        await db.$executeRawUnsafe(`UPDATE "Session" SET assigned_advisor_id = NULL WHERE id = $1`, SES_A);
        return;
    }
    assert.equal(r.success, false);
    assert.equal(fila[0].a, null);
});

test("tomar: el asesor de A sí", async () => {
    ponerLaSesion(ASESOR_A);
    assert.equal((await m.takeSession(SES_A)).success, true);
    await db.$executeRawUnsafe(`UPDATE "Session" SET assigned_advisor_id = NULL WHERE id = $1`, SES_A);
});

test("asignar: B no asigna la conversación de A", async () => {
    ponerLaSesion(B);
    const r = await m.assignSessionToAdvisor(SES_A, ASESOR_B);
    const fila = await db.$queryRawUnsafe(`SELECT assigned_advisor_id AS a FROM "Session" WHERE id = $1`, SES_A);
    if (ROTO) {
        assert.equal(fila[0].a, ASESOR_B, "antes: B le colgaba la conversación de A a su asesor");
        await db.$executeRawUnsafe(`UPDATE "Session" SET assigned_advisor_id = NULL WHERE id = $1`, SES_A);
        return;
    }
    assert.equal(r.success, false);
    assert.equal(fila[0].a, null);
});

test("asignar: A no se la cuelga a un asesor de B; sí al suyo", async () => {
    ponerLaSesion(A);
    const ajeno = await m.assignSessionToAdvisor(SES_A, ASESOR_B);
    if (!ROTO) assert.equal(ajeno.success, false, "un asesor de otra cuenta no es gente de A");
    assert.equal((await m.assignSessionToAdvisor(SES_A, ASESOR_A)).success, true);
    const fila = await db.$queryRawUnsafe(`SELECT assigned_advisor_id AS a FROM "Session" WHERE id = $1`, SES_A);
    assert.equal(fila[0].a, ASESOR_A);
});

test("historial de asignación: B no lo lee", async () => {
    ponerLaSesion(B);
    const r = await m.getAssignmentHistory(SES_A);
    if (ROTO) return assert.ok(r.length > 0, "antes: B leía quién tuvo el chat de A");
    assert.deepEqual(r, []);
    ponerLaSesion(A);
    assert.ok((await m.getAssignmentHistory(SES_A)).length > 0);
});

test("reparto automático: B no reparte las conversaciones de A", async () => {
    ponerLaSesion(B);
    const r = await m.autoAssignUnassignedSessionsForOwner(A, { assignedBy: B, onlyIfEnabled: false });
    if (ROTO) return;
    assert.equal(r.assigned, 0);
    assert.equal(r.skippedReason, "not_authorized");
});

// ── Registros ─────────────────────────────────────────────────────────────

test("registros: B no lee los pedidos del lead de A", async () => {
    ponerLaSesion(B);
    const r = await m.getRegistrosBySessionId(SES_A);
    if (ROTO) return assert.ok(r.success && r.data.length > 0, "antes: B leía los registros de A");
    assert.equal(r.success, false);
    ponerLaSesion(A);
    const suyos = await m.getRegistrosBySessionId(SES_A);
    assert.ok(suyos.success && suyos.data.some((x) => x.id === REG_A));
});

// ── Leads ─────────────────────────────────────────────────────────────────

test("leads: B no crea un lead en la cuenta de A", async () => {
    ponerLaSesion(B);
    const jid = `573009${V.slice(-6)}@s.whatsapp.net`;
    const r = await m.registerSession({ userId: A, remoteJid: jid, pushName: "Colado", instanceId: `linea-${A}` });
    const n = await db.session.count({ where: { userId: A, remoteJid: jid } });
    if (ROTO) return assert.equal(n, 1, "antes: B creaba leads en A");
    assert.equal(r.success, false);
    assert.equal(n, 0);
});

test("leads: A crea el suyo", async () => {
    ponerLaSesion(A);
    const r = await m.registerSession({ userId: A, remoteJid: `573008${V.slice(-6)}@s.whatsapp.net`, pushName: "Nuevo", instanceId: `linea-${A}` });
    assert.equal(r.success, true);
});

test("etiquetas: B no le pone etiquetas al lead de A, ni con una etiqueta de A", async () => {
    const tag = await db.tag.create({ data: { userId: A, name: `VIP-${V}`, slug: `vip-${V}` } });
    ponerLaSesion(B);
    const r = await m.addTagsToSessionAction({ userId: A, sessionId: SES_A, tagIds: [tag.id] });
    const puestas = await db.sessionTag.count({ where: { sessionId: SES_A, tagId: tag.id } });
    if (ROTO) return assert.equal(puestas, 1, "antes: B etiquetaba el lead de A nombrando su cuenta");
    assert.equal(r.success, false);
    assert.equal(puestas, 0);
    ponerLaSesion(A);
    assert.equal((await m.addTagsToSessionAction({ userId: A, sessionId: SES_A, tagIds: [tag.id] })).success, true);
});

// ── Entrenamiento maestro (SystemMessage) ─────────────────────────────────

test("entrenamiento maestro: B no lo lee, no lo reescribe, no lo borra", async () => {
    ponerLaSesion(B);
    const leido = await m.getPromptAiByUserId(A);
    await m.updatePromptAi({ id: MSG_A, userId: B, title: "hackeado", message: "hackeado", typePrompt: "TRAINING" });
    const creado = await m.createPromptAi({ userId: A, title: "colado", message: "colado", typePrompt: "TRAINING" });
    const fila = await db.systemMessage.findUnique({ where: { id: MSG_A } });
    if (ROTO) {
        assert.ok(leido.data?.length > 0, "antes: B leía el entrenamiento de A");
        assert.equal(fila.message, "hackeado", "antes: B lo reescribía");
        assert.equal(creado.success, true, "antes: B le metía mensajes");
        return;
    }
    assert.equal(leido.success, false);
    assert.equal(fila.message, "Eres el agente de A");
    assert.equal(creado.success, false);
    assert.equal((await m.deletePromptAi(MSG_A)).success, false);
    assert.ok(await db.systemMessage.findUnique({ where: { id: MSG_A } }), "sigue ahí");
});

test("entrenamiento maestro: A sí lo edita", async () => {
    ponerLaSesion(A);
    const r = await m.updatePromptAi({ id: MSG_A, userId: A, title: "Maestro A", message: "Eres el agente de A (v2)", typePrompt: "TRAINING" });
    assert.equal(r.success, true);
    assert.ok((await m.getPromptAiByUserId(A)).data.some((x) => x.id === MSG_A));
});

// ── El editor del agente ──────────────────────────────────────────────────

test("editor del agente: B no guarda una sección del entrenamiento de A", async () => {
    ponerLaSesion(B);
    const ok = !(await lanzaONoLlega(() =>
        m.patchTrainingSection({ promptId: PROMPT_A, version: VERSION_A, data: { steps: [{ id: "x", title: "B", mainMessage: "de B", elements: [] }] } })));
    const fila = await db.agentPrompt.findUnique({ where: { id: PROMPT_A } });
    if (ROTO) return assert.ok(ok && fila.version === VERSION_A + 1, "antes: B guardaba en el agente de A");
    assert.equal(ok, false);
    assert.equal(fila.version, VERSION_A);
});

test("editor del agente: B no lee, no publica y no restaura", async () => {
    ponerLaSesion(B);
    const leido = await m.getAgentPromptByUserAndAgentId({ userId: A, agentId: "system-prompt-ai" });
    const revisiones = await m.listPromptRevisions(PROMPT_A);
    const publicado = await m.publishPrompt({ promptId: PROMPT_A, version: VERSION_A, publishedBy: B });
    const restaurado = await m.restoreRevision({ promptId: PROMPT_A, revisionNumber: 1 });
    if (ROTO) {
        assert.ok(leido, "antes: B leía el entrenamiento de A");
        assert.equal(revisiones.ok, true, "antes: B listaba sus versiones");
        assert.equal(restaurado.ok, true, "antes: B restauraba una versión vieja");
        return;
    }
    assert.equal(leido, null);
    assert.equal(revisiones.ok, false);
    assert.equal(publicado.ok, false);
    assert.equal(restaurado.ok, false);
    assert.equal(await db.agentPromptRevision.count({ where: { promptId: PROMPT_A } }), 1, "ninguna revisión de más");
});

test("editor del agente: B no le aplica una plantilla", async () => {
    ponerLaSesion(B);
    const r = await m.applyTemplateToPrompt({ promptId: PROMPT_A, templateId: "venta-directa" });
    if (ROTO) return assert.equal(r.ok, true, "antes: B le reescribía el agente con una plantilla");
    assert.equal(r.ok, false);
});

test("editor del agente: A guarda, lista y publica el suyo", async () => {
    ponerLaSesion(A);
    const actual = await db.agentPrompt.findUnique({ where: { id: PROMPT_A } });
    const g = await m.patchTrainingSection({ promptId: PROMPT_A, version: actual.version, data: { steps: [] } });
    assert.equal(g.ok, true);
    assert.equal((await m.listPromptRevisions(PROMPT_A)).ok, true);
    const p = await m.publishPrompt({ promptId: PROMPT_A, version: g.data.version, publishedBy: A });
    assert.equal(p.ok, true);
});

// ── Pasos de un flujo ─────────────────────────────────────────────────────

test("flujo: B no lee los pasos del flujo de A", async () => {
    ponerLaSesion(B);
    const r = await m.getNodeforUser(FLUJO_A);
    if (ROTO) return assert.equal(r.length, 2, "antes: B leía los pasos de A");
    assert.deepEqual(r, []);
    ponerLaSesion(A);
    assert.equal((await m.getNodeforUser(FLUJO_A)).length, 2);
});

test("flujo: B no edita, reordena, retrasa ni mueve un paso de A", async () => {
    ponerLaSesion(B);
    await m.updateNode(NODO_A1, "mensaje de B");
    await m.updateNodeOrder(NODO_A1, 99);
    await m.updateDelayNode(NODO_A2, "999h");
    await m.updateFollowUpNodeConfig({ nodeId: NODO_A2, followUpGoal: "de B" });
    await m.updateWorkflowNodePosition({ nodeId: NODO_A1, posX: 1, posY: 1 });
    const n1 = await db.workflowNode.findUnique({ where: { id: NODO_A1 } });
    const n2 = await db.workflowNode.findUnique({ where: { id: NODO_A2 } });
    if (ROTO) return assert.equal(n1.message, "mensaje de B", "antes: B reescribía lo que el agente de A dice");
    assert.equal(n1.message, "Hola, soy A");
    assert.equal(n1.order, 1);
    assert.equal(n1.posX, null);
    assert.equal(n2.delay, "1h");
});

test("flujo: A edita el suyo", async () => {
    ponerLaSesion(A);
    assert.equal((await m.updateNode(NODO_A1, "Hola, soy A (v2)")).success, true);
    assert.equal((await db.workflowNode.findUnique({ where: { id: NODO_A1 } })).message, "Hola, soy A (v2)");
});

test("flujo: B no borra un paso de A", async () => {
    ponerLaSesion(B);
    const r = await m.deleteNode(NODO_A2, FLUJO_A);
    const sigue = await db.workflowNode.findUnique({ where: { id: NODO_A2 } });
    if (ROTO) {
        assert.equal(sigue, null, "antes: B borraba un paso de A");
        NODO_A2 = (await db.workflowNode.create({ data: { workflowId: FLUJO_A, message: "Segundo paso", tipo: "seguimiento-text", order: 2, delay: "1h" } })).id;
        return;
    }
    assert.equal(r.success, false);
    assert.ok(sigue);
});

test("flujo: borrar el flujo de A desde B NO lo vacía antes de comprobar", async () => {
    ponerLaSesion(B);
    const r = await m.deleteEntireWorkflow(B, FLUJO_A);
    const pasos = await db.workflowNode.count({ where: { workflowId: FLUJO_A } });
    const flujo = await db.workflow.findUnique({ where: { id: FLUJO_A } });
    if (ROTO) {
        // El fallo del encargo: el flujo sigue ahí (la comprobación del último
        // paso sí rechazaba)… pero VACÍO.
        assert.ok(flujo, "antes: el flujo sobrevivía");
        assert.equal(pasos, 0, "antes: pero se quedaba sin un solo paso");
        assert.equal(r.success, false);
        return;
    }
    assert.equal(r.success, false);
    assert.ok(flujo);
    assert.equal(pasos, 2, "los dos pasos de A siguen ahí");
});

test("flujo: B no vacía el flujo de A de golpe, ni le cambia el dueño", async () => {
    if (ROTO) return;
    ponerLaSesion(B);
    assert.equal((await m.deleteAllNodes(FLUJO_A)).success, false);
    assert.equal((await m.updateWorkflow(FLUJO_A, { userId: B, name: "ROBADO" })).success, false);
    assert.equal(await db.workflowNode.count({ where: { workflowId: FLUJO_A } }), 2);
    const f = await db.workflow.findUnique({ where: { id: FLUJO_A } });
    assert.equal(f.userId, A);
    assert.equal((await m.getWorkFlowByUser(A)).success, false, "B tampoco lista los flujos de A");
});

test("flujo: A no puede mover su flujo a otra cuenta editándolo", async () => {
    if (ROTO) return;
    ponerLaSesion(A);
    assert.equal((await m.updateWorkflow(FLUJO_A, { userId: B, description: "editado" })).success, true);
    const f = await db.workflow.findUnique({ where: { id: FLUJO_A } });
    assert.equal(f.userId, A, "el userId que llega del navegador se ignora");
    assert.equal(f.description, "editado");
});

test("flujo: A borra el suyo entero", async () => {
    ponerLaSesion(A);
    const r = await m.deleteEntireWorkflow(A, FLUJO_A);
    assert.equal(r.success, true);
    assert.equal(await db.workflow.findUnique({ where: { id: FLUJO_A } }), null);
});
