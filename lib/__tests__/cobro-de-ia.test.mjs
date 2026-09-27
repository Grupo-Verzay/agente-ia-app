/**
 * El banco de la REGLA de la plataforma: todo uso de IA descuenta créditos de
 * la cuenta DUEÑA de lo que se analiza, nunca de otra ni lo asume la
 * plataforma. Y del análisis de sentimiento SOLO al abrir Chats.
 *
 * Tres mitades:
 *
 *   1. Las REGLAS, puras (`lib/cobro-de-ia.ts`): cuánto se descuenta y si
 *      alcanza.
 *   2. Un BARRIDO del código: la lista de Chats (cada 20 s) y el cron diario ya
 *      no analizan; lo lanza abrir Chats; el sentimiento, la sugerencia de Chats
 *      y la de Correo pasan por la misma puerta de cobro.
 *   3. Contra POSTGRES, con el cliente de IA fingido (apunta sus llamadas):
 *      abrir Chats analiza TODO lo pendiente —también lo de hace horas y más de
 *      una página—, lo cobra a cada cuenta dueña, no vuelve a pagar lo ya
 *      analizado, y una cuenta sin créditos o sin bolsa no llama a la IA. Las
 *      dos sugerencias cobran a la dueña y sin créditos lo dicen.
 *
 * `MODO=roto` lee el código de `ANTES_REF` —pinchado a un commit, nunca
 * `origin/main`— y AFIRMA el fallo: la lista lanzaba el análisis cada vuelta,
 * el cron barría la plataforma, y ni el sentimiento ni las sugerencias
 * descontaban un crédito.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..", "..");
const COMPILADO = join(AQUI, ".compilado", "cobro-de-ia");
const MODO = process.env.MODO === "roto" ? "roto" : "bueno";
const ANTES_REF = process.env.ANTES_REF || "9f73cf3";

function leer(ruta) {
    if (MODO === "roto") {
        try {
            return execFileSync("git", ["show", `${ANTES_REF}:${ruta}`], { cwd: RAIZ, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
        } catch {
            return "";
        }
    }
    return fs.readFileSync(join(RAIZ, ruta), "utf8");
}
const sinComentarios = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

// ─────────────────────────────────────────────────────────────────────────────
// 1. Las reglas
// ─────────────────────────────────────────────────────────────────────────────

const hayCompilado = MODO === "bueno" && fs.existsSync(join(COMPILADO, "entrada-del-cobro-de-ia.js"));
const c = hayCompilado ? await import(join(COMPILADO, "entrada-del-cobro-de-ia.js")) : null;

test("se descuentan los tokens del proveedor; sin ellos se estiman; nunca cero", { skip: !c }, () => {
    assert.equal(c.losTokensDelUso({ tokens: 321 }), 321);
    assert.equal(c.losTokensDelUso({ tokens: 12.2 }), 13);
    assert.equal(c.losTokensDelUso({ tokens: null, entrada: "a".repeat(40), salida: "b".repeat(4) }), 11);
    assert.equal(c.losTokensDelUso({ tokens: 0 }), 1, "un uso que no mueve el contador es gratis");
    assert.equal(c.losTokensDelUso({ tokens: Number.NaN }), 1);
});

test("si alcanza: con créditos sí; sin bolsa o en cero no; ilimitado sí", { skip: !c }, () => {
    assert.deepEqual(c.puedeUsarLaIa({ estado: "quedan", creditos: 5 }), { ok: true });
    assert.deepEqual(c.puedeUsarLaIa({ estado: "ilimitado" }), { ok: true });
    assert.deepEqual(c.puedeUsarLaIa({ estado: "quedan", creditos: 0 }), { ok: false, motivo: "sin_creditos" });
    assert.deepEqual(c.puedeUsarLaIa({ estado: "sin_bolsa" }), { ok: false, motivo: "sin_bolsa" });
    assert.match(c.elAvisoSinCreditos("sin_creditos", "Ventas"), /«Ventas».*créditos/);
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. El barrido del código
// ─────────────────────────────────────────────────────────────────────────────

test(`[${MODO}] ni la lista (cada 20 s) ni el cron analizan: lo lanza ABRIR Chats`, () => {
    const lista = sinComentarios(leer("app/api/chats/lista/route.ts"));
    const cron = sinComentarios(leer("app/api/cron/billing/route.ts"));
    const pagina = sinComentarios(leer("app/(root)/chats/page.tsx"));
    const listaAnaliza = /barrerElSentimiento|analizarElSentimiento/.test(lista);
    const cronAnaliza = /barrerElSentimiento|analizarElSentimiento/.test(cron);
    const abrirAnaliza = /void\s+analizarElSentimientoAlAbrirChats\(/.test(pagina);
    if (MODO === "roto") {
        assert.ok(listaAnaliza, "antes cada vuelta de la lista lanzaba el análisis de fondo");
        assert.ok(cronAnaliza, "antes el cron barría la plataforma entera cada día");
        assert.ok(!abrirAnaliza);
        return;
    }
    assert.ok(!listaAnaliza, "la lista solo LEE el sentimiento");
    assert.ok(!cronAnaliza, "sin repaso diario");
    assert.ok(abrirAnaliza, "abrir Chats lo lanza, de fondo");
});

test(`[${MODO}] el sentimiento y las DOS sugerencias pasan por la misma puerta de cobro`, () => {
    const ficheros = [
        "lib/sentimiento-runner.server.ts",
        "actions/ai-suggested-reply-action.ts",
        "lib/sugerencia-de-correo.server.ts",
    ];
    for (const f of ficheros) {
        const t = sinComentarios(leer(f));
        const cobra = t.includes("antesDeUsarLaIa(") && t.includes("cobrarElUsoDeIa(");
        if (MODO === "roto") assert.ok(!cobra, `antes ${f} usaba la IA sin descontar nada`);
        else assert.ok(cobra, `${f} comprueba el saldo y descuenta`);
    }
    if (MODO === "bueno") {
        const chats = sinComentarios(leer("app/(root)/chats/_components/chat-main.tsx"));
        assert.ok(/generateSuggestedReplyAction\(\{[\s\S]*?instanceName:/.test(chats), "la sugerencia sabe de qué línea es la conversación");
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Contra Postgres
// ─────────────────────────────────────────────────────────────────────────────

const hayBase = Boolean(c) && Boolean(process.env.DATABASE_URL);
const sello = Date.now().toString(36);
const MADRE = `cob-${sello}-madre`;
const HIJA = `cob-${sello}-hija`;
const SINBOLSA = `cob-${sello}-sinbolsa`;
const POBRE = `cob-${sello}-pobre`;
const LINEA = { [MADRE]: `COBM_${sello}`, [HIJA]: `COBH_${sello}`, [SINBOLSA]: `COBS_${sello}`, [POBRE]: `COBP_${sello}` };

async function crearTablasDelChat(db) {
    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "chat_messages" (
        "id" BIGSERIAL PRIMARY KEY, "userId" TEXT NOT NULL, "instanceName" TEXT NOT NULL,
        "instanceType" TEXT, "remoteJid" TEXT NOT NULL, "remoteJidAlt" TEXT, "senderPn" TEXT,
        "messageId" TEXT NOT NULL, "fromMe" BOOLEAN NOT NULL DEFAULT FALSE, "pushName" TEXT,
        "messageType" TEXT NOT NULL DEFAULT 'conversation', "content" TEXT, "mediaUrl" TEXT,
        "raw" JSONB, "messageTimestamp" TIMESTAMP(3) NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "chat_conversations" (
        "id" BIGSERIAL PRIMARY KEY, "userId" TEXT NOT NULL, "instanceName" TEXT NOT NULL,
        "instanceType" TEXT, "remoteJid" TEXT NOT NULL, "remoteJidAlt" TEXT, "senderPn" TEXT,
        "pushName" TEXT, "lastMessageId" TEXT, "lastMessageFromMe" BOOLEAN, "lastMessageType" TEXT,
        "lastMessageContent" TEXT, "lastMessageMediaUrl" TEXT, "lastMessageRaw" JSONB,
        "lastMessageTimestamp" TIMESTAMP(3),
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
    await db.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "chat_conversations_user_instance_jid_unique"
      ON "chat_conversations" ("userId", "instanceName", "remoteJid")`);
}

let n = 0;
async function mensaje(cuenta, jid, { fromMe = false, texto = "esto es un desastre", hace = 60 } = {}) {
    n += 1;
    const id = `c-${sello}-${n}`;
    const linea = LINEA[cuenta];
    await c.db.$executeRawUnsafe(
        `INSERT INTO "chat_messages" ("userId","instanceName","remoteJid","messageId","fromMe","messageType","content","messageTimestamp","updatedAt")
         VALUES ($1,$2,$3,$4,$5,'conversation',$6, NOW() - make_interval(secs => $7::int), NOW())`,
        cuenta, linea, jid, id, fromMe, texto, hace,
    );
    await c.db.$executeRawUnsafe(
        `INSERT INTO "chat_conversations" ("userId","instanceName","remoteJid","lastMessageId","lastMessageFromMe","lastMessageTimestamp","updatedAt")
         VALUES ($1,$2,$3,$4,$5, NOW() - make_interval(secs => $6::int), NOW())
         ON CONFLICT ("userId","instanceName","remoteJid") DO UPDATE SET
           "lastMessageId" = EXCLUDED."lastMessageId",
           "lastMessageTimestamp" = GREATEST("chat_conversations"."lastMessageTimestamp", EXCLUDED."lastMessageTimestamp")`,
        cuenta, linea, jid, id, fromMe, hace,
    );
}
const jid = (i, pre = "57301") => `${pre}${String(i).padStart(5, "0")}${sello.slice(-3)}@s.whatsapp.net`;

async function usados(cuenta) {
    const f = await c.db.iaCredit.findUnique({ where: { userId: cuenta }, select: { used: true } });
    return f?.used ?? null;
}
async function analizadas(cuenta) {
    const r = await c.db.$queryRawUnsafe(
        `SELECT COUNT(*)::int AS n FROM "sentimiento_de_conversacion" WHERE "userId"=$1 AND "mensajeId" IS NOT NULL`, cuenta);
    return Number(r[0].n);
}
const TODAS = () => [MADRE, HIJA, SINBOLSA, POBRE];
const TODAS_LAS_LINEAS = () => TODAS().map((x) => LINEA[x]);

test("PREPARAR: cuentas, IA de cada cuenta, bolsas, líneas y 130 conversaciones pendientes en la hija", { skip: !hayBase }, async () => {
    await crearTablasDelChat(c.db);
    const prov = await c.db.aiProvider.upsert({ where: { name: "openai" }, update: {}, create: { name: "openai", aiModel: "gpt" } });
    let modelo = await c.db.aiModel.findFirst({ where: { providerId: prov.id, name: "gpt-banco" } });
    modelo ??= await c.db.aiModel.create({ data: { providerId: prov.id, name: "gpt-banco" } });
    for (const id of TODAS()) {
        await c.db.user.upsert({
            where: { id },
            update: {},
            create: { id, email: `${id}@banco.test`, name: id, defaultProviderId: prov.id, defaultAiModelId: modelo.id },
        });
        await c.db.userAiConfig.create({ data: { userId: id, providerId: prov.id, apiKey: `sk-${id}`, isActive: true } });
        await c.db.instancia.create({ data: { userId: id, instanceName: LINEA[id], instanceId: LINEA[id], instanceType: "Whatsapp" } });
    }
    const renueva = new Date(Date.now() + 864e5);
    for (const [id, total, used] of [[MADRE, 1000, 0], [HIJA, 1000, 0], [POBRE, 5, 5 * 3085]]) {
        await c.db.iaCredit.create({ data: { userId: id, total, used, renewalDate: renueva } });
    }
    await c.db.linkedAccount.create({ data: { masterUserId: MADRE, linkedUserId: HIJA } });

    // 130 conversaciones en la hija: más de una página (100), y la mitad de hace
    // HORAS —antes la ventana era de media hora y el tope de 25 por vuelta—.
    for (let i = 0; i < 130; i++) {
        await mensaje(HIJA, jid(i), { hace: i % 2 ? 60 * 60 * 6 : 120 });
        // La IA contestó después: el último mensaje no es del cliente.
        await mensaje(HIJA, jid(i), { fromMe: true, texto: "Lo sentimos", hace: i % 2 ? 60 * 60 * 6 - 10 : 100 });
    }
    await mensaje(MADRE, jid(1, "57302"), { texto: "todo pésimo" });
    await mensaje(SINBOLSA, jid(1, "57303"));
    await mensaje(POBRE, jid(1, "57304"));
    // Las tablas del sentimiento las crea su módulo al primer uso (y `db push`
    // las borra entre vueltas: no están en el esquema de Prisma).
    await c.losPendientes({ cuentas: [HIJA], tope: 1 });
    c.olvidarLoRecordado();
});

test("si nadie abre Chats no se analiza nada ni se consume nada", { skip: !hayBase }, async () => {
    assert.equal(c.llamadasALaIa.length, 0);
    assert.equal(await analizadas(HIJA), 0);
    assert.equal(await usados(HIJA), 0);
    const pendientes = await c.losPendientes({ cuentas: [HIJA], lineas: [LINEA[HIJA]], tope: 500 });
    assert.equal(pendientes.length, 130, "sigue todo pendiente, sin ventana de tiempo");
});

test("abrir Chats analiza TODO lo pendiente, y cada análisis lo paga SU cuenta dueña", { skip: !hayBase }, async () => {
    c.ponerTokensQueDice(321);
    const r = await c.analizarElSentimientoAlAbrirChats(TODAS(), TODAS_LAS_LINEAS());
    assert.equal(r.analizados, 131, "las 130 de la hija (más de una página) y la de la madre");
    assert.equal(await analizadas(HIJA), 130);
    assert.equal(await usados(HIJA), 130 * 321, "la hija paga sus 130, con los tokens del proveedor");
    assert.equal(await usados(MADRE), 321, "la madre paga solo la suya, aunque fue ella quien abrió");
    assert.equal(r.tokens, 131 * 321);
});

test("sin bolsa o sin créditos no se llama a la IA, y lo suyo queda pendiente", { skip: !hayBase }, async () => {
    assert.equal(await analizadas(SINBOLSA), 0);
    assert.equal(await analizadas(POBRE), 0);
    assert.equal(await usados(POBRE), 5 * 3085, "no se le descuenta nada");
    assert.equal(c.llamadasALaIa.filter((l) => l.apiKey === `sk-${SINBOLSA}` || l.apiKey === `sk-${POBRE}`).length, 0);
    const pend = await c.losPendientes({ cuentas: [SINBOLSA, POBRE], lineas: TODAS_LAS_LINEAS(), tope: 10 });
    assert.equal(pend.length, 2, "siguen pendientes para cuando recarguen");
});

test("volver a abrir no reanaliza: lo analizado sin mensajes nuevos conserva su color", { skip: !hayBase }, async () => {
    c.olvidarLoRecordado();
    const antes = c.llamadasALaIa.length;
    const r = await c.analizarElSentimientoAlAbrirChats([MADRE, HIJA], [LINEA[MADRE], LINEA[HIJA]]);
    assert.equal(r.pendientes, 0);
    assert.equal(c.llamadasALaIa.length, antes, "ni una llamada");
    assert.equal(await usados(HIJA), 130 * 321, "ni un token más");
});

test("un mensaje NUEVO del cliente: se analiza solo esa conversación", { skip: !hayBase }, async () => {
    await mensaje(HIJA, jid(7), { texto: "sigo esperando", hace: 5 });
    c.olvidarLoRecordado();
    const r = await c.analizarElSentimientoAlAbrirChats([MADRE, HIJA], [LINEA[MADRE], LINEA[HIJA]]);
    assert.equal(r.analizados, 1);
    assert.equal(await usados(HIJA), 131 * 321);
});

test("al recargar, lo pendiente de la cuenta pobre se analiza en la apertura siguiente", { skip: !hayBase }, async () => {
    await c.db.iaCredit.update({ where: { userId: POBRE }, data: { total: 50 } });
    c.olvidarLoRecordado();
    const r = await c.analizarElSentimientoAlAbrirChats([POBRE], [LINEA[POBRE]]);
    assert.equal(r.analizados, 1);
    assert.equal(await usados(POBRE), 5 * 3085 + 321);
});

test("la sugerencia de Chats la paga la cuenta DUEÑA de la conversación, no quien mira", { skip: !hayBase }, async () => {
    c.ponerAQuienMira({ id: MADRE, effectiveId: MADRE, role: "user", ownerId: null });
    const antesM = await usados(MADRE);
    const antesH = await usados(HIJA);
    const r = await c.generateSuggestedReplyAction({
        userId: MADRE,
        instanceName: LINEA[HIJA],
        messages: [{ key: { fromMe: false }, message: { conversation: "¿Tienen envíos?" } }],
    });
    assert.equal(r.success, true, r.message);
    assert.equal(c.llamadasALaIa.at(-1).apiKey, `sk-${HIJA}`, "con la IA de la dueña");
    assert.equal(await usados(HIJA), antesH + 321, "la paga la hija");
    assert.equal(await usados(MADRE), antesM, "la madre no paga lo de su hija");
});

test("sin créditos, la sugerencia NO llama a la IA y lo dice", { skip: !hayBase }, async () => {
    await c.db.iaCredit.update({ where: { userId: POBRE }, data: { total: 0 } });
    c.ponerAQuienMira({ id: POBRE, effectiveId: POBRE, role: "user", ownerId: null });
    const antes = c.llamadasALaIa.length;
    const r = await c.generateSuggestedReplyAction({
        userId: POBRE,
        instanceName: LINEA[POBRE],
        messages: [{ key: { fromMe: false }, message: { conversation: "hola" } }],
    });
    assert.equal(r.success, false);
    assert.match(r.message, /créditos/);
    assert.equal(c.llamadasALaIa.length, antes);
});

test("una cuenta HIJA no puede cargarle la sugerencia a su madre", { skip: !hayBase }, async () => {
    c.ponerAQuienMira({ id: HIJA, effectiveId: HIJA, role: "user", ownerId: null });
    const antesM = await usados(MADRE);
    const r = await c.generateSuggestedReplyAction({
        userId: HIJA,
        instanceName: LINEA[MADRE],
        messages: [{ key: { fromMe: false }, message: { conversation: "hola" } }],
    });
    assert.equal(r.success, false);
    assert.equal(await usados(MADRE), antesM);
    c.ponerAQuienMira(null);
});

test("la sugerencia de Correo descuenta de la cuenta del buzón; sin créditos lo dice", { skip: !hayBase }, async () => {
    c.ponerAQuienMira({ id: MADRE, effectiveId: MADRE, role: "user", ownerId: null });
    const antes = await usados(MADRE);
    c.ponerTokensQueDice(undefined); // el proveedor no dice tokens: se estiman, nunca cero
    const r = await c.pedirSugerenciaALaIa(MADRE, { de: "a@b.co", asunto: "Hola", texto: "¿Precio?" }, "");
    assert.equal(r.ok, true);
    assert.ok((await usados(MADRE)) > antes, "se descontó");
    c.ponerAQuienMira({ id: POBRE, effectiveId: POBRE, role: "user", ownerId: null });
    const sin = await c.pedirSugerenciaALaIa(POBRE, { de: "a@b.co", asunto: "Hola", texto: "¿Precio?" }, "");
    assert.equal(sin.ok, false);
    assert.match(sin.motivo, /créditos/);
    c.ponerAQuienMira(null);
    c.ponerTokensQueDice(321);
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Los NUEVE usos que no cobraban (el copiloto, el asistente de prompts, el
//    resumen al cerrar, la puntuación del lead, el informe semanal, el
//    aprendizaje de ventas, las imágenes, el simulador y el generador del
//    agente). Su «antes» es el commit de justo antes de este cambio: ahí la
//    sugerencia y el sentimiento YA cobraban, y estos no.
// ─────────────────────────────────────────────────────────────────────────────

const ANTES_DE_LOS_NUEVE = process.env.ANTES_DE_LOS_NUEVE || "2017da3";
const LOS_NUEVE = [
    "actions/ai-chat-actions.ts",
    "actions/ai-prompt-chat-actions.ts",
    "actions/ai-inject-section-action.ts",
    "actions/conversation-intelligence-actions.ts",
    "actions/lead-score-action.ts",
    "lib/weekly-report-runner.server.ts",
    "lib/sales-learning.ts",
    "actions/ai-image-actions.ts",
    "actions/simulate-chat-actions.ts",
    "actions/generate-agent-flow.ts",
];
function leerDe(ref, ruta) {
    if (MODO !== "roto") return fs.readFileSync(join(RAIZ, ruta), "utf8");
    try {
        return execFileSync("git", ["show", `${ref}:${ruta}`], { cwd: RAIZ, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    } catch {
        return "";
    }
}

test(`[${MODO}] los NUEVE usos pasan por la puerta de cobro`, () => {
    for (const f of LOS_NUEVE) {
        const t = sinComentarios(leerDe(ANTES_DE_LOS_NUEVE, f));
        const cobra = /usarLaIaCobrando\(|pedirAOpenAiCobrando\(/.test(t);
        if (MODO === "roto") assert.ok(!cobra, `antes ${f} usaba la IA sin descontar nada`);
        else assert.ok(cobra, `${f} pasa por la puerta de cobro`);
    }
});

test(`[${MODO}] el BARRIDO: ninguna llamada a la IA fuera de la puerta de cobro`, () => {
    // Todo fichero que llama a un proveedor tiene que pasar por la puerta de
    // cobro. Las excepciones son las que YA cobran por su camino (las
    // transcripciones y la calidad) o no cobran APARTE a propósito, con su motivo.
    const EXCEPCIONES = {
        "actions/open-ai-actions.ts": "es el cliente (`OpenAiClient`), no un uso: lo cobra quien lo llama",
        "lib/grabacion-de-reunion.server.ts": "el resumen de una reunión va incluido en el precio de su transcripción",
        "lib/grabacion-de-llamada.server.ts": "cobra la transcripción por minutos (`costoDeLaNota`)",
        "lib/creditos-de-transcripcion.ts": "es el descuento mismo",
        "lib/calidad-runner.server.ts": "cobra por su camino (`descontarLaTranscripcion`)",
    };
    const PATRON = "\\.complete\\(\\{|chat\\.completions\\.create|generateContent\\(|generateImages\\(|transcriptions\\.create|api\\.openai\\.com/v1/chat";
    // En `roto` el barrido corre sobre el árbol de ANTES (`git grep` en ese
    // commit), para afirmar que ahí SÍ había usos sin cobrar.
    const salida = MODO === "roto"
        ? execFileSync("git", ["grep", "-lE", PATRON, ANTES_DE_LOS_NUEVE, "--", "actions", "lib", "app"], { cwd: RAIZ, encoding: "utf8" })
            .split("\n").map((l) => l.replace(`${ANTES_DE_LOS_NUEVE}:`, "")).join("\n")
        : execFileSync("grep", ["-rlE", PATRON, "actions", "lib", "app"], { cwd: RAIZ, encoding: "utf8" });
    const ficheros = salida.split("\n").filter((f) => f && !f.includes("__tests__") && /\.(ts|tsx)$/.test(f));
    const sinCobro = ficheros.filter((f) => {
        if (EXCEPCIONES[f]) return false;
        const t = leerDe(ANTES_DE_LOS_NUEVE, f);
        return !/usarLaIaCobrando|cobrarElUsoDeIa|pedirAOpenAiCobrando|descontarLaTranscripcion/.test(t);
    });
    if (MODO === "roto") {
        assert.ok(sinCobro.length >= 8, `antes había usos sin cobrar: ${sinCobro.join(", ")}`);
        return;
    }
    assert.deepEqual(sinCobro, [], "estos usan la IA sin cobrar");
    for (const [f, motivo] of Object.entries(EXCEPCIONES)) assert.ok(motivo.trim(), `${f} necesita su motivo`);
});

test("los tokens del proveedor: OpenAI (`usage`) y Gemini (`usageMetadata`); sin ellos, null", { skip: !c }, () => {
    assert.equal(c.losTokensDelProveedor({ usage: { total_tokens: 99 } }), 99);
    assert.equal(c.losTokensDelProveedor({ usage: { prompt_tokens: 10, completion_tokens: 5 } }), 15);
    assert.equal(c.losTokensDelProveedor({ usageMetadata: { totalTokenCount: 1290 } }), 1290);
    assert.equal(c.losTokensDelProveedor({ usageMetadata: { promptTokenCount: 7, candidatesTokenCount: 3 } }), 10);
    assert.equal(c.losTokensDelProveedor({}), null);
    assert.equal(c.losTokensDelProveedor(null), null);
    assert.equal(c.losTokensDelProveedor({ usage: { total_tokens: -3 } }), null);
});

const HIJA2 = `cob-${sello}-hija2`;
const PROMPT_H2 = crypto.randomUUID();
const LINEA_H2 = `COBH2_${sello}`;
let SESION_H2 = 0;

/** El `fetch` a OpenAI de mentira: apunta la llamada y dice `usage`. */
function fingirOpenAiPorFetch() {
    const original = globalThis.fetch;
    globalThis.fetch = async (url, opts) => {
        if (String(url).includes("api.openai.com")) {
            const h = opts?.headers ?? {};
            const auth = h.Authorization ?? h.authorization ?? "";
            c.llamadasALaIa.push({ provider: "openai-fetch", model: "gpt-4o", apiKey: String(auth).replace(/^Bearer /, "") });
            return new Response(
                JSON.stringify({ choices: [{ message: { content: "{}" } }], usage: { total_tokens: 321 } }),
                { status: 200, headers: { "content-type": "application/json" } },
            );
        }
        return original(url, opts);
    };
    return () => { globalThis.fetch = original; };
}

async function conCreditos(cuenta, total) {
    await c.db.iaCredit.upsert({
        where: { userId: cuenta },
        update: { total, used: 0 },
        create: { userId: cuenta, total, used: 0, renewalDate: new Date(Date.now() + 864e5) },
    });
}

test("PREPARAR: una hija con su IA de OpenAI y de Google, un lead con reporte y una conversación", { skip: !hayBase }, async () => {
    c.ponerTokensQueDice(321);
    const prov = await c.db.aiProvider.findUnique({ where: { name: "openai" } });
    const modelo = await c.db.aiModel.findFirst({ where: { providerId: prov.id, name: "gpt-banco" } });
    const google = await c.db.aiProvider.upsert({ where: { name: "google" }, update: {}, create: { name: "google", aiModel: "gemini" } });
    await c.db.user.upsert({
        where: { id: HIJA2 },
        update: {},
        create: { id: HIJA2, email: `${HIJA2}@banco.test`, name: HIJA2, defaultProviderId: prov.id, defaultAiModelId: modelo.id },
    });
    await c.db.userAiConfig.create({ data: { userId: HIJA2, providerId: prov.id, apiKey: `sk-${HIJA2}`, isActive: true } });
    await c.db.userAiConfig.create({ data: { userId: HIJA2, providerId: google.id, apiKey: `g-${HIJA2}`, isActive: true } });
    await c.db.instancia.create({ data: { userId: HIJA2, instanceName: LINEA_H2, instanceId: LINEA_H2, instanceType: "Whatsapp" } });
    await c.db.linkedAccount.create({ data: { masterUserId: MADRE, linkedUserId: HIJA2 } });
    await conCreditos(HIJA2, 100000);
    const JID_L = `5739${sello.slice(-6)}01@s.whatsapp.net`;
    const s = await c.db.session.create({
        data: { userId: HIJA2, remoteJid: JID_L, pushName: "Lead", instanceId: LINEA_H2, status: true },
    });
    SESION_H2 = s.id;
    await c.db.registro.create({ data: { sessionId: s.id, userId: HIJA2, tipo: "REPORTE", resumen: "Quiere tres sillas negras" } });
    await c.db.$executeRawUnsafe(
        `INSERT INTO "chat_messages" ("userId","instanceName","remoteJid","messageId","fromMe","messageType","content","messageTimestamp","updatedAt")
         VALUES ($1,$2,$3,$4,false,'conversation','Quiero tres sillas negras', NOW() - interval '5 minutes', NOW())`,
        HIJA2, LINEA_H2, JID_L, `l-${sello}-1`,
    );
    await c.db.agentPrompt.create({
        data: { id: PROMPT_H2, userId: HIJA2, sections: {}, promptText: "Eres el agente de la hija." },
    });
});

/**
 * Cada uso, dos veces: CON créditos llama a la IA con la llave de la cuenta
 * dueña y le descuenta lo que dijo el proveedor; SIN créditos no llama a nada.
 * `quien` es quien mira: la MADRE, para comprobar que no paga lo de su hija.
 */
const USOS = [
    {
        nombre: "el copiloto",
        cuenta: HIJA2,
        quien: () => ({ id: HIJA2, effectiveId: HIJA2, role: "user", ownerId: null }),
        pedir: () => c.sendChatAction({ messages: [{ id: "1", role: "user", content: "Redacta un saludo corto", createdAt: 1 }], context: { pathname: "/x", params: {}, search: {} } }),
        salio: (r) => r.success === true,
        sinCreditos: (r) => r.success === false && /créditos/.test(r.message),
    },
    {
        nombre: "el asistente de prompts",
        cuenta: HIJA2,
        quien: () => ({ id: HIJA2, effectiveId: HIJA2, role: "user", ownerId: null }),
        pedir: () => c.sendAgentPromptChatAction({ messages: [{ id: "1", role: "user", content: "Mejora el saludo", createdAt: 1 }], context: { activeSection: "FAQ", sectionDraft: "", promptPreview: "" } }),
        salio: (r) => r.success === true,
        sinCreditos: (r) => r.success === false && /créditos/.test(r.message),
    },
    {
        nombre: "analizar una instrucción del prompt",
        cuenta: HIJA2,
        quien: () => ({ id: HIJA2, effectiveId: HIJA2, role: "user", ownerId: null }),
        pedir: () => c.analyzeInstructionAction("Que diga los medios de pago"),
        salio: (r) => r.success === true,
        sinCreditos: (r) => r.success === false && /créditos/.test(r.message),
    },
    {
        nombre: "la puntuación del lead (mirando la MADRE)",
        cuenta: HIJA2,
        quien: () => ({ id: MADRE, effectiveId: MADRE, role: "user", ownerId: null }),
        pedir: () => c.scoreLeadBySessionId(SESION_H2),
        salio: (r) => r.success === true && r.score === 72,
        sinCreditos: (r) => r.success === false && r.sinCreditos === true && /créditos/.test(r.message),
    },
    {
        nombre: "el resumen al cerrar la conversación",
        cuenta: HIJA2,
        quien: () => null,
        pedir: () => c.generateConversationIntelligence({ sessionId: SESION_H2, actorId: MADRE, reason: "resolved" }),
        salio: () => true,
        sinCreditos: () => true,
    },
    {
        nombre: "el informe semanal",
        cuenta: HIJA2,
        quien: () => null,
        pedir: () => c.generateNarrative(HIJA2, { periodStart: new Date().toISOString(), periodEnd: new Date().toISOString(), totalLeads: 1, newLeads: 1, avgScore: null, leadsByStatus: {}, conversions: 0, followUpsSent: 0, leadsByScore: { sinScore: 1 } }),
        salio: (r) => typeof r === "string",
        // Sin créditos sale el resumen de respaldo, con los números.
        sinCreditos: (r) => /Total de leads/.test(r),
    },
    {
        nombre: "el playbook de venta",
        cuenta: HIJA2,
        quien: () => null,
        pedir: () => c.buildDynamicSalesPlaybook(SESION_H2),
        salio: (r) => Boolean(r),
        // Sin créditos sale la guía base.
        sinCreditos: (r) => Boolean(r) && r.questions.length > 0,
    },
    {
        nombre: "el aprendizaje de una venta cerrada",
        cuenta: HIJA2,
        quien: () => null,
        pedir: () => c.recordConfirmedSalesOutcome(SESION_H2, "WON"),
        salio: () => true,
        sinCreditos: () => true,
    },
    {
        nombre: "una imagen con IA",
        cuenta: HIJA2,
        quien: () => ({ id: HIJA2, effectiveId: HIJA2, role: "user", ownerId: null }),
        pedir: () => c.generateAdImage("data:image/png;base64,QUJD", "moderno", "", "hero").catch((e) => e),
        salio: (r) => typeof r === "string" && r.startsWith("data:image/png"),
        sinCreditos: (r) => r instanceof Error && /créditos/.test(r.message),
    },
    {
        nombre: "el copy del anuncio",
        cuenta: HIJA2,
        quien: () => ({ id: HIJA2, effectiveId: HIJA2, role: "user", ownerId: null }),
        pedir: () => c.generarCopyDelAnuncio("data:image/png;base64,QUJD", "1:1"),
        salio: (r) => r.ok === true,
        sinCreditos: (r) => r.ok === false && /créditos/.test(r.motivo),
    },
    {
        nombre: "el simulador de chat",
        cuenta: HIJA2,
        quien: () => ({ id: HIJA2, effectiveId: HIJA2, role: "user", ownerId: null }),
        pedir: () => c.simulateChatMessage({ promptId: PROMPT_H2, messages: [{ role: "user", content: "hola" }] }),
        // El `fetch` fingido devuelve «{}»: basta con que no sea un aviso de créditos.
        salio: (r) => !(r.ok === false && /créditos/.test(r.error)),
        sinCreditos: (r) => r.ok === false && /créditos/.test(r.error),
    },
    {
        nombre: "el generador del agente",
        cuenta: HIJA2,
        quien: () => ({ id: HIJA2, effectiveId: HIJA2, role: "user", ownerId: null }),
        pedir: () => c.generateFlowSections({ description: "Vendemos sillas" }),
        salio: (r) => !(r.ok === false && /créditos/.test(r.error)),
        sinCreditos: (r) => r.ok === false && /créditos/.test(r.error),
    },
];

for (const uso of USOS) {
    test(`${uso.nombre}: CON créditos llama con la IA de la cuenta dueña y le cobra lo que dijo el proveedor`, { skip: !hayBase }, async () => {
        await conCreditos(HIJA2, 100000);
        const antesM = await usados(MADRE);
        const antesLlamadas = c.llamadasALaIa.length;
        c.ponerAQuienMira(uso.quien());
        const restaurar = fingirOpenAiPorFetch();
        let r;
        try {
            r = await uso.pedir();
        } finally {
            restaurar();
            c.ponerAQuienMira(null);
        }
        assert.ok(uso.salio(r), `salió bien: ${JSON.stringify(r)?.slice(0, 200)}`);
        const nuevas = c.llamadasALaIa.slice(antesLlamadas);
        assert.ok(nuevas.length >= 1, "se llamó a la IA");
        assert.ok(nuevas.every((l) => l.apiKey.endsWith(HIJA2)), "con la llave de la cuenta dueña");
        const usadosH = await usados(HIJA2);
        // Cada llamada cobra 321 tokens (los que dice el proveedor fingido),
        // salvo una imagen de `imagen-4`, que no los dice: 1.290.
        assert.equal(usadosH, nuevas.length * 321, "se le descontó lo que dijo el proveedor, por cada llamada");
        assert.equal(await usados(MADRE), antesM, "la madre no paga lo de su hija, aunque mire ella");
    });

    test(`${uso.nombre}: SIN créditos no llama a la IA y no descuenta`, { skip: !hayBase }, async () => {
        await conCreditos(HIJA2, 0);
        const antesLlamadas = c.llamadasALaIa.length;
        c.ponerAQuienMira(uso.quien());
        const restaurar = fingirOpenAiPorFetch();
        let r;
        try {
            r = await uso.pedir();
        } finally {
            restaurar();
            c.ponerAQuienMira(null);
        }
        assert.equal(c.llamadasALaIa.length, antesLlamadas, "ni una llamada");
        assert.equal(await usados(HIJA2), 0, "ni un token");
        assert.ok(uso.sinCreditos(r), `lo dice (o sale el respaldo): ${JSON.stringify(r)?.slice(0, 200)}`);
    });
}

test("una imagen de `imagen-4` (sin tokens del proveedor) cobra lo de una imagen, no el prompt", { skip: !hayBase }, async () => {
    await conCreditos(HIJA2, 100000);
    c.ponerAQuienMira({ id: HIJA2, effectiveId: HIJA2, role: "user", ownerId: null });
    const r = await c.generateAdImage("data:image/png;base64,QUJD", "moderno", "", "hero", "1:1", undefined, undefined, false, "imagen-4.0-generate-001");
    c.ponerAQuienMira(null);
    assert.ok(String(r).startsWith("data:image/png"));
    assert.equal(await usados(HIJA2), c.TOKENS_DE_UNA_IMAGEN);
});

test("puntuar TODOS se para al quedarse sin créditos y lo dice", { skip: !hayBase }, async () => {
    // Un lead SIN puntuar (el de arriba ya se puntuó hace nada y no entra).
    const s2 = await c.db.session.create({
        data: { userId: HIJA2, remoteJid: `5738${sello.slice(-6)}02@s.whatsapp.net`, pushName: "Otro", instanceId: LINEA_H2, status: true },
    });
    await c.db.registro.create({ data: { sessionId: s2.id, userId: HIJA2, tipo: "REPORTE", resumen: "Pregunta por mesas" } });
    await conCreditos(HIJA2, 0);
    c.ponerAQuienMira({ id: HIJA2, effectiveId: HIJA2, role: "user", ownerId: null });
    const r = await c.scoreAllLeadsByUserId();
    c.ponerAQuienMira(null);
    assert.equal(r.scored, 0);
    assert.match(r.message ?? "", /créditos/);
});

test(`[${MODO}] el banco ejerció algo`, () => {
    if (MODO === "bueno") assert.ok(hayBase, "sin base no se ejerce el cobro: el banco no puede salir verde sin él");
});
