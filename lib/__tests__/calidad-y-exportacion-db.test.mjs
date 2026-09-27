/**
 * Calidad y exportación contra POSTGRES, por las acciones y el runner de verdad.
 *
 * Lo que solo se ve aquí:
 *
 * - que la exportación encuentra el historial guardado bajo OTRA identidad del
 *   contacto (el `@lid` y el número), y que una conversación de otra cuenta se
 *   contesta como una que no existe;
 * - que el runner lee `chat_conversations`, deja fuera lo que no está en
 *   reposo y los grupos, cobra los tokens a la cuenta dueña, apunta sin puntaje
 *   lo que nadie contestó y NO vuelve a evaluar lo que no tiene mensajes nuevos;
 * - que la calidad del CRM se reparte por asesor con su nombre.
 *
 * Se finge `currentUser()` y el pedido a la IA (se inyecta: sin red).
 *
 * `MODO=roto` afirma el fallo de la lectura ingenua —preguntar por una sola
 * identidad devuelve la conversación VACÍA sin ningún error— y que antes de esto
 * no había dónde guardar ninguna evaluación.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
    ponerAQuienMira,
    exportarConversacionesAction,
    calidadDelCrmAction,
    evaluarLaCalidadDeLaCuenta,
    persistChatMessage,
    getPersistedMessages,
    db,
} from "./.compilado/calidad/entrada-de-calidad.js";

const ROTO = process.env.MODO === "roto";
const V = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const MADRE = `q-madre-${V}`;
const AJENA = `q-ajena-${V}`;
const ASESORA = `q-asesora-${V}`;
const LINEA = `Q_LINEA_${V}`;
const LINEA_AJENA = `Q_AJENA_${V}`;
const NUMERO = `57300${String(Date.now()).slice(-7)}`;
const JID = `${NUMERO}@s.whatsapp.net`;
const LID = `9${String(Date.now()).slice(-10)}@lid`;
const JID_SIN_RESPUESTA = `57311${String(Date.now()).slice(-7)}@s.whatsapp.net`;
const JID_VIVA = `57322${String(Date.now()).slice(-7)}@s.whatsapp.net`;
const GRUPO = `1203${String(Date.now()).slice(-9)}@g.us`;

const hace = (min) => new Date(Date.now() - min * 60 * 1000);

function quien(id, extra = {}) {
    return { id, effectiveId: id, sessionUserId: id, ownerId: null, advisorRole: null, role: "user", rolDeLaPersona: "user", email: `${id}@b.t`, name: id, ...extra };
}

async function limpiar() {
    const ids = [MADRE, AJENA, ASESORA];
    await db.$executeRawUnsafe(`DELETE FROM "chat_messages" WHERE "userId" = ANY($1::text[])`, ids).catch(() => {});
    await db.$executeRawUnsafe(`DELETE FROM "chat_conversations" WHERE "userId" = ANY($1::text[])`, ids).catch(() => {});
    await db.$executeRawUnsafe(`DELETE FROM "calidad_conversaciones" WHERE "cuentaId" = ANY($1::text[])`, ids).catch(() => {});
    await db.session.deleteMany({ where: { userId: { in: ids } } });
    await db.instancia.deleteMany({ where: { userId: { in: ids } } });
    await db.iaCredit.deleteMany({ where: { userId: { in: ids } } });
    await db.userAiConfig.deleteMany({ where: { userId: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
}

async function msg(userId, instanceName, remoteJid, { fromMe, texto, min, ia = false, alt = null, id }) {
    await persistChatMessage({
        userId, instanceName, remoteJid, remoteJidAlt: alt, fromMe, messageId: id,
        messageType: "conversation", content: texto,
        raw: { message: { conversation: texto }, ...(ia ? { sentByAi: true } : {}) },
        messageTimestamp: hace(min), puedeReabrir: false,
    });
}

async function sembrar() {
    for (const [id, name] of [[MADRE, "Madre"], [AJENA, "Ajena"], [ASESORA, "Ana Asesora"]]) {
        await db.user.create({ data: { id, email: `${id}@b.t`, name, ...(id === ASESORA ? { ownerId: MADRE } : {}) } });
    }
    await db.instancia.create({ data: { instanceName: LINEA, userId: MADRE, instanceId: `iid-${V}`, instanceType: "Whatsapp", displayName: "Línea de Ventas" } });
    await db.instancia.create({ data: { instanceName: LINEA_AJENA, userId: AJENA, instanceId: `iid-a-${V}`, instanceType: "Whatsapp" } });
    const proveedor = await db.aiProvider.upsert({ where: { name: "openai" }, create: { name: "openai", aiModel: "gpt-4o-mini" }, update: {} });
    await db.userAiConfig.create({ data: { userId: MADRE, providerId: proveedor.id, apiKey: "sk-banco", isActive: true } });
    await db.iaCredit.create({ data: { userId: MADRE, total: 100, used: 0, renewalDate: new Date(Date.now() + 864e5) } });

    // La conversación buena: entra por el número, sigue por el @lid (como pasa
    // de verdad cuando el proveedor cambia de forma de entregar al contacto).
    await msg(MADRE, LINEA, JID, { fromMe: false, texto: "Hola, ¿tienen envíos a Cali?", min: 300, id: `a1-${V}` });
    await msg(MADRE, LINEA, JID, { fromMe: true, texto: "¡Hola! Te paso con una asesora", min: 299, ia: true, id: `a2-${V}` });
    await msg(MADRE, LINEA, LID, { fromMe: true, texto: "Hola, soy Ana. Sí, enviamos a Cali.", min: 280, alt: JID, id: `a3-${V}` });
    await msg(MADRE, LINEA, LID, { fromMe: false, texto: "Perfecto, gracias", min: 275, alt: JID, id: `a4-${V}` });
    // La ficha del lead (la escribe el backend al entrar el mensaje).
    await db.session.deleteMany({ where: { userId: MADRE, remoteJid: { in: [JID, LID] } } });
    await db.session.create({ data: { userId: MADRE, remoteJid: JID, remoteJidAlt: LID, pushName: "Juan", customName: "Juan Pérez", instanceId: `iid-${V}`, status: true, assignedAdvisorId: ASESORA } });
    // Nadie contestó.
    await msg(MADRE, LINEA, JID_SIN_RESPUESTA, { fromMe: false, texto: "¿hola?", min: 400, id: `b1-${V}` });
    // Sigue viva: no se evalúa todavía.
    await msg(MADRE, LINEA, JID_VIVA, { fromMe: false, texto: "¿y el precio?", min: 10, id: `c1-${V}` });
    await msg(MADRE, LINEA, JID_VIVA, { fromMe: true, texto: "Ya te digo", min: 5, id: `c2-${V}` });
    // Un grupo: no es CRM.
    await msg(MADRE, LINEA, GRUPO, { fromMe: false, texto: "hola grupo", min: 300, id: `g1-${V}` });
    await msg(MADRE, LINEA, GRUPO, { fromMe: true, texto: "hola", min: 299, id: `g2-${V}` });
    // La de otra cuenta.
    await msg(AJENA, LINEA_AJENA, JID, { fromMe: false, texto: "secreto de la ajena", min: 300, id: `z1-${V}` });
}

const pedidos = [];
const iaDeMentira = async ({ texto }) => {
    pedidos.push(texto);
    return { texto: '```json\n{"saludo": 90, "tono": 80, "resolvio": "si", "mejora": "Presentarse por el nombre desde el primer mensaje."}\n```', tokens: 1500 };
};

test.before(async () => {
    await limpiar();
    await sembrar();
});
test.after(async () => {
    await limpiar();
    await db.$disconnect();
});

test("exportar encuentra el historial bajo TODAS las identidades del contacto", async () => {
    ponerAQuienMira(quien(MADRE));
    if (ROTO) {
        // La lectura ingenua: por la identidad que se tiene delante, a secas.
        const solo = await getPersistedMessages({ userIds: [MADRE], remoteJid: LID, instanceName: LINEA, aliases: [], take: 50 });
        assert.equal(solo.length, 2, "EL FALLO: preguntando solo por el @lid faltan la mitad de los mensajes, sin ningún error");
        return;
    }
    const r = await exportarConversacionesAction([{ instanceName: LINEA, remoteJid: LID, aliases: [JID] }], "UTC");
    assert.equal(r.success, true, r.message);
    assert.equal(r.archivos.length, 1);
    const txt = r.archivos[0].contenido;
    assert.equal(r.archivos[0].nombre, "Chat con Juan Pérez.txt", "el nombre sale de NUESTRA base");
    assert.ok(txt.includes("Línea: Línea de Ventas"));
    for (const t of ["Hola, ¿tienen envíos a Cali?", "Agente IA: ¡Hola! Te paso", "Hola, soy Ana", "Perfecto, gracias"]) assert.ok(txt.includes(t), t);
});

test("exportar en lote: lo ajeno se cuenta como omitido y no se cuela ni una línea", async () => {
    ponerAQuienMira(quien(MADRE));
    if (ROTO) return;
    const r = await exportarConversacionesAction([
        { instanceName: LINEA, remoteJid: JID },
        { instanceName: LINEA_AJENA, remoteJid: JID },
        { instanceName: LINEA, remoteJid: JID }, // repetida: una sola vez
    ]);
    assert.equal(r.success, true);
    assert.equal(r.archivos.length, 1);
    assert.equal(r.omitidas, 1);
    assert.ok(!r.archivos.some((a) => a.contenido.includes("secreto de la ajena")));
    ponerAQuienMira(null);
    const sin = await exportarConversacionesAction([{ instanceName: LINEA, remoteJid: JID }]);
    assert.equal(sin.success, false, "sin sesión no se exporta nada");
});

test("el runner evalúa lo que está en reposo, deja fuera grupos y vivas, y cobra a la cuenta", async () => {
    if (ROTO) {
        // La selección ingenua —todas las conversaciones de la cuenta— mete un
        // grupo (que no es un cliente) y una conversación que sigue viva, y la
        // IA se pagaría por las dos.
        const todas = await db.$queryRawUnsafe(`SELECT "remoteJid" FROM "chat_conversations" WHERE "userId" = $1`, MADRE);
        const jids = todas.map((f) => f.remoteJid);
        assert.ok(jids.includes(GRUPO), "EL FALLO: el grupo entraría en la evaluación");
        assert.ok(jids.includes(JID_VIVA), "EL FALLO: la conversación viva se evaluaría a medias");
        return;
    }
    const r = await evaluarLaCalidadDeLaCuenta(MADRE, { pedir: iaDeMentira });
    assert.equal(r.motivo, null);
    assert.equal(r.evaluadas, 1, "la buena");
    assert.equal(r.sinRespuesta, 1, "la que nadie contestó se apunta sin puntaje");
    assert.equal(pedidos.length, 1);
    assert.ok(pedidos[0].includes("CLIENTE: Hola, ¿tienen envíos") && pedidos[0].includes("ASESOR: Hola, soy Ana"));
    const filas = await db.$queryRawUnsafe(`SELECT * FROM "calidad_conversaciones" WHERE "cuentaId" = $1 ORDER BY "remoteJid"`, MADRE);
    const jids = filas.map((f) => f.remoteJid);
    assert.ok(!jids.includes(GRUPO), "un grupo no es un cliente");
    assert.ok(!jids.includes(JID_VIVA), "la viva espera a estar en reposo");
    const buena = filas.find((f) => f.puntaje !== null);
    assert.equal(buena.asesorId, ASESORA);
    assert.equal(buena.responsable, "asesor");
    assert.equal(buena.primeraRespuestaSeg, 20 * 60, "la de la PERSONA, no la de la IA");
    assert.equal(buena.resolucionSeg, 20 * 60, "resuelta según la IA: hasta el último de la cuenta");
    assert.equal(buena.puntaje, Math.round((90 * 15 + 80 * 25 + 100 * 35 + 70 * 15 + 100 * 10) / 100));
    assert.equal(filas.find((f) => f.remoteJid === JID_SIN_RESPUESTA).motivo, "sin_respuesta");
    const credito = await db.iaCredit.findUnique({ where: { userId: MADRE } });
    assert.equal(credito.used, 1500, "se cobran los tokens a la cuenta dueña");

    // Sin mensajes nuevos, no se vuelve a pagar.
    const otra = await evaluarLaCalidadDeLaCuenta(MADRE, { pedir: iaDeMentira });
    assert.equal(otra.evaluadas + otra.sinRespuesta, 0);
    assert.equal(pedidos.length, 1);
});

test("la calidad del CRM se reparte por asesor con su nombre, y la ajena no ve nada", async () => {
    if (ROTO) return;
    ponerAQuienMira(quien(MADRE));
    const r = await calidadDelCrmAction([MADRE], 30);
    assert.equal(r.success, true, r.message);
    assert.equal(r.data.conversaciones.length, 1, "las que no tienen puntaje no llenan la lista");
    assert.equal(r.data.asesores[0].nombre, "Ana Asesora");
    assert.equal(r.data.asesores[0].primeraRespuestaPromedioSeg, 20 * 60);
    ponerAQuienMira(quien(AJENA));
    const ajena = await calidadDelCrmAction([MADRE], 30);
    assert.equal(ajena.success, true);
    assert.equal(ajena.data.conversaciones.length, 0, "pedir la cuenta de otra a mano no abre nada");
    ponerAQuienMira(quien(ASESORA, { ownerId: MADRE, advisorRole: "agente", effectiveId: MADRE }));
    const agente = await calidadDelCrmAction([MADRE], 30);
    assert.equal(agente.success, false, "un agente no ve la calidad del equipo");
});

test("sin IA configurada no se evalúa ni se cobra, y se dice", async () => {
    if (ROTO) return;
    const r = await evaluarLaCalidadDeLaCuenta(AJENA, { pedir: iaDeMentira });
    assert.equal(r.motivo, "sin_ia");
    assert.equal(r.evaluadas, 0);
});
