/**
 * El banco de la traducción automática de Chats.
 *
 * Tres mitades:
 *
 *   1. Las REGLAS, puras: el detector de idioma (`lib/idioma-del-cliente.ts`),
 *      qué se traduce solo, qué se ofrece a mano y cómo se guarda. Y que el
 *      detector es BYTE A BYTE el del backend: la IA contesta en el idioma que
 *      decide el motor y la pantalla traduce con el que decide la App.
 *   2. Un BARRIDO del código: los TRES caminos de envío guardan la traducción,
 *      el `ON CONFLICT` la conserva, la burbuja la pinta, el menú «⋯» ofrece
 *      «Traducir», la pantalla la pide sola y traduce lo que escribe el asesor,
 *      y la IA de la traducción pasa por el cobro.
 *   3. Las ACCIONES contra POSTGRES, con el cliente de IA fingido: un cliente
 *      en inglés con la conversación en manos de una persona se traduce solo y
 *      se cobra a la cuenta dueña; con la IA llevándola no se traduce nada; un
 *      cliente en español no cambia nada; «Traducir» del menú; lo que escribe
 *      el asesor sale en inglés con el original en español guardado; sin
 *      créditos sale sin traducir y se dice; una cuenta ajena no pasa; y volver
 *      a guardar el mensaje no borra su traducción.
 *
 * `MODO=roto` lee el código de `ANTES_REF` —pinchado a un commit, nunca
 * `origin/main`— y AFIRMA el fallo: no había detección de idioma, ni
 * traducción, ni opción en el menú.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..", "..");
const COMPILADO = join(AQUI, ".compilado", "traduccion-de-chats");
const MODO = process.env.MODO === "roto" ? "roto" : "bueno";
const ANTES_REF = process.env.ANTES_REF || "97ae916";

function leer(ruta) {
    if (MODO === "roto") {
        try {
            return execFileSync("git", ["show", `${ANTES_REF}:${ruta}`], {
                cwd: RAIZ,
                encoding: "utf8",
                stdio: ["ignore", "pipe", "ignore"],
                maxBuffer: 64 * 1024 * 1024,
            });
        } catch {
            return "";
        }
    }
    return fs.readFileSync(join(RAIZ, ruta), "utf8");
}
const sinComentarios = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const hayCompilado = MODO === "bueno" && fs.existsSync(join(COMPILADO, "entrada-de-la-traduccion.js"));
const c = hayCompilado ? await import(join(COMPILADO, "entrada-de-la-traduccion.js")) : null;

// ─────────────────────────────────────────────────────────────────────────────
// 1. Las reglas
// ─────────────────────────────────────────────────────────────────────────────

test("el detector: con dudas no decide; con claridad sí", { skip: !c }, () => {
    const { elIdiomaDelTexto: t, elIdiomaDeLaConversacion: conv } = c.idioma;
    assert.equal(t("Hola"), null, "una palabra suelta no decide");
    assert.equal(t("Hi"), null);
    assert.equal(t("Hola buenas, quiero saber el precio"), "es");
    assert.equal(t("I need some information about your prices"), "en");
    assert.equal(t("Olá, gostaria de saber o preço"), "pt");
    assert.equal(t("Bonjour, je voudrais des informations"), "fr");
    assert.equal(t("Guten Tag, ich möchte Informationen über die Preise"), "de");
    assert.equal(t("Здравствуйте, сколько это стоит?"), "ru");
    assert.equal(t("你好，我想知道价格"), "zh");
    assert.equal(conv(["Hi", "I need info about prices"]), "en", "decide con los primeros mensajes juntos");
    assert.equal(conv(["Hola", "ok", "👍"]), null, "sin claridad no se inventa un idioma");
});

test("reglas: la lleva una persona, qué se traduce solo, qué se ofrece a mano", { skip: !c }, () => {
    const r = c.reglas;
    assert.equal(r.laLlevaUnaPersona({ iaActiva: false, enEspera: false }), true);
    assert.equal(r.laLlevaUnaPersona({ iaActiva: true, enEspera: true }), true);
    assert.equal(r.laLlevaUnaPersona({ iaActiva: true, enEspera: false }), false, "con la IA llevándola no se traduce");
    assert.equal(r.seTraduceSolo({ idioma: "es", laLlevaUnaPersona: true }), false, "el español sigue igual");
    assert.equal(r.seTraduceSolo({ idioma: "en", laLlevaUnaPersona: true }), true);
    assert.equal(r.seTraduceAlEnviar({ idioma: "en", texto: "Claro, te ayudo con el precio" }), true);
    assert.equal(r.seTraduceAlEnviar({ idioma: "en", texto: "Sure, I can help you with the price" }), false, "ya está en su idioma");
    assert.equal(r.seTraduceAlEnviar({ idioma: "en", texto: "Hola", reenviado: true }), false);
    assert.equal(r.seOfreceTraducir({ texto: "Hola buenas, quiero saber el precio", traduccion: null }), false);
    assert.equal(r.seOfreceTraducir({ texto: "I need some information", traduccion: null }), true);
    const t = r.unaTraduccion("Necesito información", "en", "automatica", new Date(0));
    assert.equal(r.seOfreceTraducir({ texto: "I need some information", traduccion: t }), false, "ya traducido");
    assert.equal(r.elRotuloDeLaTraduccion(t), "Traducido del inglés");
    assert.equal(r.elRotuloDeLaTraduccion({ ...t, como: "al_enviar" }), "Enviado en inglés · original en español");
    assert.equal(r.elAvisoDeLaCajaDeEscribir("es"), null);
    assert.match(r.elAvisoDeLaCajaDeEscribir("en"), /se enviará en inglés/);
    assert.deepEqual(r.laTraduccionDelEnvio({ traduccion: { espanol: "", idioma: "en" } }), {}, "lo que no encaja se descarta");
    assert.equal(r.laTraduccionDelEnvio({ traduccion: t }).traduccion.como, "al_enviar");
    assert.deepEqual(r.losIdsQueSePreguntan([{ id: "local-1", content: "Hi there" }, { id: "a", content: "Hi there" }, { id: "b", content: "👍" }, { id: "n", content: "nota", isNote: true }]), ["a"]);
});

test("el detector es el MISMO que el del backend, byte a byte", () => {
    const back = join(RAIZ, "..", "api-webhook", "src", "modules", "ai-agent", "idioma-del-cliente.ts");
    if (MODO === "roto") {
        assert.equal(leer("lib/idioma-del-cliente.ts"), "", "antes no había detector de idioma");
        return;
    }
    if (!fs.existsSync(back)) return; // Sin el backend al lado no hay con qué comparar.
    assert.equal(fs.readFileSync(join(RAIZ, "lib/idioma-del-cliente.ts"), "utf8"), fs.readFileSync(back, "utf8"));
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. El barrido del código
// ─────────────────────────────────────────────────────────────────────────────

test(`[${MODO}] los TRES caminos de envío guardan la traducción del asesor`, () => {
    for (const f of ["actions/chat-manual-actions.ts", "actions/waha-chat-actions.ts", "lib/envio-por-canal.server.ts"]) {
        const t = sinComentarios(leer(f));
        const guarda = t.includes("laTraduccionDelEnvio(");
        if (MODO === "roto") assert.ok(!guarda, `antes ${f} no sabía nada de traducciones`);
        else assert.ok(guarda, `${f} guarda el original en español con el mensaje`);
    }
});

test(`[${MODO}] volver a guardar un mensaje (el sondeo) no borra su traducción`, () => {
    const t = sinComentarios(leer("lib/chat-persistence.ts"));
    const conserva = /"raw" -> 'traduccion'\) IS NOT NULL[\s\S]{0,200}EXCLUDED/.test(t);
    if (MODO === "roto") assert.ok(!conserva);
    else assert.ok(conserva, "el ON CONFLICT conserva raw.traduccion");
});

test(`[${MODO}] la burbuja la pinta, el menú «⋯» ofrece Traducir y la pantalla la pide sola`, () => {
    const burbuja = sinComentarios(leer("app/(root)/chats/_components/MessageBubble.tsx"));
    const menu = sinComentarios(leer("app/(root)/chats/_components/MessageContextMenu.tsx"));
    const main = sinComentarios(leer("app/(root)/chats/_components/chat-main.tsx"));
    const pinta = /traduccion\.espanol/.test(burbuja) && /elRotuloDeLaTraduccion\(/.test(burbuja);
    const ofrece = /onTranslate/.test(menu) && />\s*Traducir\s*</.test(menu);
    const sola = /useTraduccionDeLaConversacion\(/.test(main) && /prepararElEnvio\(/.test(main);
    if (MODO === "roto") {
        assert.ok(!pinta && !ofrece && !sola, "antes no había ni traducción ni opción en el menú");
        return;
    }
    assert.ok(pinta, "debajo del texto, el español");
    assert.ok(ofrece, "«Traducir» en el menú de cada mensaje");
    assert.ok(sola, "la conversación se traduce sola y lo del asesor sale traducido");
    assert.ok(!/<button[^>]*>[^<]*Traducir/.test(main), "ningún botón para encenderla");
});

test(`[${MODO}] la IA de la traducción pasa por el cobro`, () => {
    const t = sinComentarios(leer("lib/traduccion-de-chats.server.ts"));
    if (MODO === "roto") {
        assert.equal(t, "");
        return;
    }
    assert.ok(t.includes("usarLaIaCobrando("), "la traduce la IA de la cuenta dueña y la paga ella");
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Contra Postgres
// ─────────────────────────────────────────────────────────────────────────────

const hayBase = Boolean(c) && Boolean(process.env.DATABASE_URL);
const sello = Date.now().toString(36);
const CUENTA = `tra-${sello}`;
const AJENA = `tra-${sello}-ajena`;
const POBRE = `tra-${sello}-pobre`;
const LINEA = `TRA_${sello}`;
const LINEA_POBRE = `TRAP_${sello}`;
const INGLES = `1555${sello.slice(-4)}01@s.whatsapp.net`;
const ESPANOL = `5730${sello.slice(-4)}02@s.whatsapp.net`;
const IA_LLEVA = `1555${sello.slice(-4)}03@s.whatsapp.net`;
const INGLES_POBRE = `1555${sello.slice(-4)}04@s.whatsapp.net`;

const quien = (id) => ({ id, role: "user", ownerId: null, sessionUserId: id, name: id, email: `${id}@banco.test` });
const conv = (jid, linea = LINEA) => ({ instanceName: linea, remoteJid: jid, aliases: [] });

let n = 0;
async function mensaje(cuenta, linea, jid, texto, { fromMe = false, minuto } = {}) {
    n += 1;
    const id = `tr-${sello}-${n}`;
    await c.db.$executeRawUnsafe(
        `INSERT INTO "chat_messages" ("userId","instanceName","remoteJid","messageId","fromMe","messageType","content","messageTimestamp","updatedAt")
         VALUES ($1,$2,$3,$4,$5,'conversation',$6, TIMESTAMP '2026-09-28 10:00' + make_interval(mins => $7::int), NOW())`,
        cuenta, linea, jid, id, fromMe, texto, minuto ?? n,
    );
    return id;
}
async function elRaw(id) {
    const r = await c.db.$queryRawUnsafe(`SELECT "raw" FROM "chat_messages" WHERE "messageId" = $1`, id);
    return r[0]?.raw ?? null;
}
async function usados(cuenta) {
    const f = await c.db.iaCredit.findUnique({ where: { userId: cuenta }, select: { used: true } });
    return f?.used ?? null;
}

const ids = {};

test("PREPARAR: cuentas con su IA, bolsas, líneas, fichas y conversaciones", { skip: !hayBase }, async () => {
    await c.persistChatMessage({ userId: CUENTA, instanceName: "__crear_tabla__", remoteJid: "x@s.whatsapp.net", messageId: `x-${sello}`, fromMe: false, messageType: "conversation", content: "x" }).catch(() => {});
    const prov = await c.db.aiProvider.upsert({ where: { name: "openai" }, update: {}, create: { name: "openai", aiModel: "gpt" } });
    let modelo = await c.db.aiModel.findFirst({ where: { providerId: prov.id, name: "gpt-banco" } });
    modelo ??= await c.db.aiModel.create({ data: { providerId: prov.id, name: "gpt-banco" } });
    for (const id of [CUENTA, AJENA, POBRE]) {
        await c.db.user.create({ data: { id, email: `${id}@banco.test`, name: id, defaultProviderId: prov.id, defaultAiModelId: modelo.id } });
        await c.db.userAiConfig.create({ data: { userId: id, providerId: prov.id, apiKey: `sk-${id}`, isActive: true } });
    }
    await c.db.instancia.create({ data: { userId: CUENTA, instanceName: LINEA, instanceId: LINEA, instanceType: "Whatsapp" } });
    await c.db.instancia.create({ data: { userId: POBRE, instanceName: LINEA_POBRE, instanceId: LINEA_POBRE, instanceType: "Whatsapp" } });
    const renueva = new Date(Date.now() + 864e5);
    await c.db.iaCredit.create({ data: { userId: CUENTA, total: 1000, used: 0, renewalDate: renueva } });
    await c.db.iaCredit.create({ data: { userId: POBRE, total: 5, used: 5 * 3085, renewalDate: renueva } });

    // La ficha: `status = false` es la IA pausada, o sea que la lleva una persona.
    const ficha = (userId, instanceId, remoteJid, status) =>
        c.db.session.create({ data: { userId, instanceId, remoteJid, pushName: "Cliente", status } });
    await ficha(CUENTA, LINEA, INGLES, false);
    await ficha(CUENTA, LINEA, ESPANOL, false);
    await ficha(CUENTA, LINEA, IA_LLEVA, true);
    await ficha(POBRE, LINEA_POBRE, INGLES_POBRE, false);

    ids.en1 = await mensaje(CUENTA, LINEA, INGLES, "Hi");
    ids.en2 = await mensaje(CUENTA, LINEA, INGLES, "I need some information about your prices");
    ids.enMio = await mensaje(CUENTA, LINEA, INGLES, "Claro, con gusto", { fromMe: true });
    ids.en3 = await mensaje(CUENTA, LINEA, INGLES, "How much is the monthly plan?");
    ids.es1 = await mensaje(CUENTA, LINEA, ESPANOL, "Hola buenas tardes, quiero saber el precio del plan");
    ids.ia1 = await mensaje(CUENTA, LINEA, IA_LLEVA, "Hello, I would like to know the prices of your products");
    ids.pobre = await mensaje(POBRE, LINEA_POBRE, INGLES_POBRE, "Hello, I would like to know the prices of your products");
});

test("un cliente en inglés con una persona al frente: lo suyo se traduce solo, se guarda y se cobra a la dueña", { skip: !hayBase }, async () => {
    c.ponerAQuienMira(quien(CUENTA));
    c.ponerTokensDelTraductor(50);
    const r = await c.traduccionesDeLaConversacionAction(conv(INGLES), [ids.en1, ids.en2, ids.enMio, ids.en3]);
    assert.equal(r.success, true);
    assert.equal(r.idioma, "en");
    assert.equal(r.automatica, true);
    assert.equal(r.traducciones[ids.en2].espanol, "[ES] I need some information about your prices");
    assert.equal(r.traducciones[ids.en3].espanol, "[ES] How much is the monthly plan?");
    assert.equal(r.traducciones[ids.enMio], undefined, "lo que escribió el asesor no se traduce de vuelta");
    // «Hi» tiene dos letras y no está en español: también se traduce.
    const raw = await elRaw(ids.en2);
    assert.equal(raw.traduccion.espanol, "[ES] I need some information about your prices", "el historial guarda original y traducción");
    assert.equal(raw.traduccion.como, "automatica");
    assert.equal(await usados(CUENTA), 3 * 50, "tres traducciones, tres cobros a la cuenta dueña");
});

test("preguntar otra vez no vuelve a traducir ni a cobrar", { skip: !hayBase }, async () => {
    const antes = c.llamadasAlTraductor.length;
    const r = await c.traduccionesDeLaConversacionAction(conv(INGLES), [ids.en1, ids.en2, ids.en3]);
    assert.equal(Object.keys(r.traducciones).length, 3);
    assert.equal(c.llamadasAlTraductor.length, antes);
    assert.equal(await usados(CUENTA), 150);
});

test("un cliente en español: nada cambia, ni una llamada a la IA", { skip: !hayBase }, async () => {
    const antes = c.llamadasAlTraductor.length;
    const r = await c.traduccionesDeLaConversacionAction(conv(ESPANOL), [ids.es1]);
    assert.equal(r.idioma, "es");
    assert.equal(r.automatica, false);
    assert.deepEqual(r.traducciones, {});
    const envio = await c.traducirParaEnviarAction(conv(ESPANOL), "Hola, claro que sí");
    assert.equal(envio.texto, "Hola, claro que sí");
    assert.equal(envio.traduccion, undefined);
    assert.equal(c.llamadasAlTraductor.length, antes);
});

test("con la IA llevando la conversación no se traduce nada (la IA ya contesta en su idioma)", { skip: !hayBase }, async () => {
    const antes = c.llamadasAlTraductor.length;
    const r = await c.traduccionesDeLaConversacionAction(conv(IA_LLEVA), [ids.ia1]);
    assert.equal(r.idioma, "en");
    assert.equal(r.automatica, false);
    assert.deepEqual(r.traducciones, {});
    assert.equal(c.llamadasAlTraductor.length, antes);
});

test("«Traducir» del menú: el respaldo manual, aunque la IA la lleve", { skip: !hayBase }, async () => {
    const r = await c.traducirMensajeAction(conv(IA_LLEVA), ids.ia1);
    assert.equal(r.success, true);
    assert.equal(r.traduccion.como, "manual");
    assert.equal(r.traduccion.idioma, "en");
    assert.equal((await elRaw(ids.ia1)).traduccion.espanol, "[ES] Hello, I would like to know the prices of your products");
    const es = await c.traducirMensajeAction(conv(ESPANOL), ids.es1);
    assert.equal(es.success, false);
    assert.match(es.message, /ya está en español/);
});

test("lo que escribe el asesor sale en inglés, con su español guardado al lado", { skip: !hayBase }, async () => {
    const r = await c.traducirParaEnviarAction(conv(INGLES), "El plan mensual cuesta 50 dólares");
    assert.equal(r.success, true);
    assert.equal(r.texto, "[IN] El plan mensual cuesta 50 dólares", "sale traducido al idioma del cliente");
    assert.equal(r.traduccion.espanol, "El plan mensual cuesta 50 dólares");
    assert.equal(r.traduccion.como, "al_enviar");
    assert.match(c.llamadasAlTraductor.at(-1).system, /Traduce al inglés/);

    // Y así lo guarda cualquiera de los tres caminos de envío.
    const enviado = `env-${sello}`;
    await c.persistChatMessage({
        userId: CUENTA, instanceName: LINEA, remoteJid: INGLES, messageId: enviado, fromMe: true,
        messageType: "conversation", content: r.texto, raw: c.reglas.laTraduccionDelEnvio({ traduccion: r.traduccion }),
    });
    const raw = await elRaw(enviado);
    assert.equal(raw.traduccion.espanol, "El plan mensual cuesta 50 dólares");

    // El sondeo lo vuelve a guardar SIN la traducción: tiene que conservarla.
    await c.persistChatMessage({
        userId: CUENTA, instanceName: LINEA, remoteJid: INGLES, messageId: enviado, fromMe: true,
        messageType: "conversation", content: r.texto, raw: { key: { id: enviado, fromMe: true } },
    });
    assert.equal((await elRaw(enviado)).traduccion.espanol, "El plan mensual cuesta 50 dólares", "el ON CONFLICT no la borra");
});

test("sin créditos: lo del cliente no se traduce y lo del asesor sale sin traducir, diciéndolo", { skip: !hayBase }, async () => {
    c.ponerAQuienMira(quien(POBRE));
    const antes = c.llamadasAlTraductor.length;
    const r = await c.traduccionesDeLaConversacionAction(conv(INGLES_POBRE, LINEA_POBRE), [ids.pobre]);
    assert.equal(r.success, true);
    assert.match(r.aviso ?? "", /créditos/);
    assert.deepEqual(r.traducciones, {});
    const envio = await c.traducirParaEnviarAction(conv(INGLES_POBRE, LINEA_POBRE), "El precio es 50 dólares");
    assert.equal(envio.texto, "El precio es 50 dólares", "sale el original: un mensaje sin traducir es mejor que ninguno");
    assert.match(envio.aviso, /Se envió sin traducir/);
    assert.equal(c.llamadasAlTraductor.length, antes, "sin créditos no se llama a la IA");
    assert.equal(await usados(POBRE), 5 * 3085);
});

test("si la IA revienta, sale sin traducir y lo dice", { skip: !hayBase }, async () => {
    c.ponerAQuienMira(quien(CUENTA));
    c.queReviente(true);
    const envio = await c.traducirParaEnviarAction(conv(INGLES), "Te llamo mañana");
    c.queReviente(false);
    assert.equal(envio.texto, "Te llamo mañana");
    assert.match(envio.aviso, /Se envió sin traducir/);
});

test("una cuenta ajena no lee, no traduce ni gasta créditos de otra", { skip: !hayBase }, async () => {
    c.ponerAQuienMira(quien(AJENA));
    const antes = await usados(CUENTA);
    const r = await c.traduccionesDeLaConversacionAction(conv(INGLES), [ids.en2]);
    assert.equal(r.success, false);
    const m = await c.traducirMensajeAction(conv(INGLES), ids.en2);
    assert.equal(m.success, false);
    const e = await c.traducirParaEnviarAction(conv(INGLES), "hola");
    assert.equal(e.success, false);
    assert.equal(await usados(CUENTA), antes);
});
