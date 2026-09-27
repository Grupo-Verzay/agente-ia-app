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

test(`[${MODO}] el banco ejerció algo`, () => {
    if (MODO === "bueno") assert.ok(hayBase, "sin base no se ejerce el cobro: el banco no puede salir verde sin él");
});
