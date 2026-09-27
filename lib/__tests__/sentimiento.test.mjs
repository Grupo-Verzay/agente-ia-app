/**
 * El banco del SENTIMIENTO del cliente en Chats.
 *
 * Cuatro mitades, porque el cambio vive en cuatro capas:
 *
 *   1. Las REGLAS, puras: qué se le pide a la IA, cómo se lee lo que contesta,
 *      cuándo una conversación «cae», de qué color va el aro, cuándo sale la
 *      franja y cómo se arma el reporte.
 *   2. Un BARRIDO del código: que la lista traiga el sentimiento y lance el
 *      análisis, que el aro que se tiñe sea el que YA existía, que la franja
 *      vaya pegada encima de la barra de escribir y que el CRM tenga su reporte.
 *   3. El ANÁLISIS contra Postgres, con el analizador de IA fingido (se pasa
 *      como parámetro): que se analiza el último mensaje del cliente y no dos
 *      veces, que dos a la vez no pagan dos, que mejora y vuelve a caer, que
 *      una respuesta rara no borra un negativo, y que el reporte cuenta por día
 *      y por asesor.
 *   4. La FRANJA de verdad en Chromium, sobre el CSS del build: sale, se cierra,
 *      se va sola al mejorar, y vuelve con una caída nueva.
 *
 * `MODO=roto` lee los mismos ficheros de `ANTES_REF` y AFIRMA el fallo: la
 * lista no traía sentimiento, el aro era siempre el mismo, no había franja ni
 * reporte, y nada analizaba los mensajes.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
let chromium = null;
try {
    ({ chromium } = require("playwright"));
} catch {
    chromium = null;
}

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..", "..");
const COMPILADO = join(AQUI, ".compilado", "sentimiento");
const MODO = process.env.MODO === "roto" ? "roto" : "bueno";
const ANTES_REF = process.env.ANTES_REF || "aecdcef";

const reglas = await import(join(COMPILADO, "sentimiento.js"));

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

// ─────────────────────────────────────────────────────────────────────────────
// 1. Las reglas
// ─────────────────────────────────────────────────────────────────────────────

test("se lee la PRIMERA de las tres palabras, sin acentos ni mayúsculas", () => {
    assert.equal(reglas.leerElSentimiento("Negativo"), "negativo");
    assert.equal(reglas.leerElSentimiento("  positivo."), "positivo");
    assert.equal(reglas.leerElSentimiento("NEUTRO"), "neutro");
    assert.equal(reglas.leerElSentimiento("Es negativo, no positivo"), "negativo");
});

test("lo que no se entiende es null, NUNCA un neutro inventado", () => {
    assert.equal(reglas.leerElSentimiento("no sé"), null);
    assert.equal(reglas.leerElSentimiento(""), null);
    assert.equal(reglas.leerElSentimiento(undefined), null);
    assert.equal(reglas.leerElSentimiento("negativos"), null, "palabra entera");
});

test("sin texto del CLIENTE no se pregunta a la IA", () => {
    assert.equal(reglas.elTextoParaAnalizar([]), null);
    assert.equal(reglas.elTextoParaAnalizar([{ fromMe: true, texto: "hola" }]), null);
    assert.equal(reglas.elTextoParaAnalizar([{ fromMe: false, texto: null }]), null);
    const t = reglas.elTextoParaAnalizar([
        { fromMe: true, texto: "¿En qué te ayudo?" },
        { fromMe: false, texto: "esto  es\nun desastre" },
    ]);
    assert.match(t, /Negocio: ¿En qué te ayudo\?\nCliente: esto es un desastre/);
});

test("el contexto se recorta por DELANTE: lo que se juzga es el ahora", () => {
    const muchos = Array.from({ length: 40 }, (_, i) => ({ fromMe: false, texto: `m${i} ` + "x".repeat(200) }));
    const t = reglas.elTextoParaAnalizar(muchos);
    assert.ok(t.includes("m39"), "el último está");
    assert.ok(!t.includes("m0 "), "el primero se fue");
    assert.ok(t.length < reglas.TOPE_DE_CARACTERES + 200);
});

test("el texto de un mensaje: la transcripción manda, los marcadores no son texto", () => {
    assert.equal(reglas.elTextoDelMensaje({ content: "[Audio]", messageType: "audioMessage", transcripcion: "estoy harto" }), "estoy harto");
    assert.equal(reglas.elTextoDelMensaje({ content: "[Imagen]", messageType: "imageMessage" }), null);
    assert.equal(reglas.elTextoDelMensaje({ content: "hola", messageType: "conversation" }), "hola");
    assert.equal(reglas.elTextoDelMensaje({ content: "", messageType: "audioMessage" }), null);
});

test("caer, seguir caído y mejorar", () => {
    const t1 = new Date("2026-09-20T10:00:00Z");
    const t2 = new Date("2026-09-20T11:00:00Z");
    assert.equal(reglas.cayoANegativo(null, "negativo"), true);
    assert.equal(reglas.cayoANegativo("neutro", "negativo"), true);
    assert.equal(reglas.cayoANegativo("negativo", "negativo"), false, "seguir caído no es caer otra vez");
    assert.equal(reglas.cayoANegativo("negativo", "positivo"), false);
    assert.equal(reglas.elNegativoDesde({ sentimiento: "neutro", negativoDesde: null }, "negativo", t1), t1);
    assert.equal(reglas.elNegativoDesde({ sentimiento: "negativo", negativoDesde: t1 }, "negativo", t2), t1, "conserva la fecha de la caída");
    assert.equal(reglas.elNegativoDesde({ sentimiento: "negativo", negativoDesde: t1 }, "positivo", t2), null);
});

test("el aro: verde pastel, rojo suave, y neutro es el de siempre", () => {
    assert.match(reglas.elAnilloDelAvatar("positivo"), /ring-emerald-300/);
    assert.match(reglas.elAnilloDelAvatar("negativo"), /ring-red-300/);
    assert.equal(reglas.elAnilloDelAvatar("neutro"), "ring-background group-hover:ring-accent");
    assert.equal(reglas.elAnilloDelAvatar(null), reglas.elAnilloDelAvatar("neutro"));
    // Con color no cambia al pasar el ratón: un aro que se va al apuntarlo no marca.
    assert.ok(!reglas.elAnilloDelAvatar("negativo").includes("group-hover"));
    assert.ok(!reglas.elAnilloDelAvatar("positivo").includes("group-hover"));
});

test("la franja: solo en negativo y solo si esa caída no se cerró", () => {
    const neg = { sentimiento: "negativo", negativoDesde: "2026-09-20T10:00:00.000Z" };
    assert.equal(reglas.laFranjaSeVe(neg, false), true);
    assert.equal(reglas.laFranjaSeVe(neg, true), false);
    assert.equal(reglas.laFranjaSeVe({ sentimiento: "neutro", negativoDesde: null }, false), false);
    assert.equal(reglas.laFranjaSeVe({ sentimiento: "positivo", negativoDesde: null }, false), false);
    assert.equal(reglas.laFranjaSeVe(null, false), false);
    // Otra caída es otra llave: cerrar una no cierra la siguiente.
    assert.notEqual(
        reglas.llaveDeLaFranja("L", "j", "2026-09-20T10:00:00.000Z"),
        reglas.llaveDeLaFranja("L", "j", "2026-09-21T10:00:00.000Z"),
    );
});

test("el sentimiento se encuentra por CUALQUIERA de las identidades", () => {
    const mapa = { "L::573@s.whatsapp.net": { sentimiento: "negativo", negativoDesde: null } };
    assert.equal(reglas.elSentimientoDe(mapa, "L", ["123@lid", "573@s.whatsapp.net"]).sentimiento, "negativo");
    assert.equal(reglas.elSentimientoDe(mapa, "OTRA", ["573@s.whatsapp.net"]), null, "la línea cuenta");
    assert.equal(reglas.mismosSentimientos(mapa, { ...mapa }), true);
    assert.equal(reglas.mismosSentimientos(mapa, {}), false);
});

test("el reporte: días del período en cero, asesores de más a menos, «Sin asignar» es uno más", () => {
    const r = reglas.armarElReporte(
        [
            { dia: "2026-09-18", asesorId: "a", asesorNombre: "Ana", cantidad: 2 },
            { dia: "2026-09-20", asesorId: "a", asesorNombre: "Ana", cantidad: 1 },
            { dia: "2026-09-20", asesorId: null, asesorNombre: null, cantidad: 4 },
            { dia: "2026-01-01", asesorId: "b", asesorNombre: "Bea", cantidad: 9 }, // fuera del período
        ],
        "2026-09-20",
        7,
    );
    assert.equal(r.porDia.length, 7);
    assert.equal(r.porDia[0].dia, "2026-09-14");
    assert.equal(r.porDia.at(-1).dia, "2026-09-20");
    assert.equal(r.porDia.find((d) => d.dia === "2026-09-19").cantidad, 0);
    assert.equal(r.porDia.find((d) => d.dia === "2026-09-20").cantidad, 5);
    assert.equal(r.total, 7);
    assert.deepEqual(r.porAsesor.map((a) => [a.nombre, a.cantidad]), [["Sin asignar", 4], ["Ana", 3]]);
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. El barrido del código (en MODO=roto, sobre ANTES_REF, afirma el fallo)
// ─────────────────────────────────────────────────────────────────────────────

const quitarComentarios = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

test(`[${MODO}] la lista de chats trae el sentimiento y lanza el análisis de fondo`, () => {
    const ruta = quitarComentarios(leer("app/api/chats/lista/route.ts"));
    const trae = ruta.includes("losSentimientosDeLasLineas") && ruta.includes("sentimientos");
    const lanza = /void\s+barrerElSentimientoDeLaBandeja/.test(ruta);
    if (MODO === "roto") {
        assert.equal(trae || lanza, false, "antes la lista no traía sentimiento ni lo analizaba");
        return;
    }
    assert.ok(trae, "la respuesta trae el sentimiento");
    assert.ok(lanza, "el análisis va de fondo: la lista no espera a la IA");
});

test(`[${MODO}] el aro que se tiñe es el que YA tenía el avatar`, () => {
    const fila = quitarComentarios(leer("app/(root)/chats/_components/ChatContactItem.tsx"));
    if (MODO === "roto") {
        assert.ok(fila.includes("ring-2 ring-background group-hover:ring-accent"), "antes el aro era siempre el mismo");
        assert.ok(!fila.includes("elAnilloDelAvatar"));
        return;
    }
    assert.ok(fila.includes("elAnilloDelAvatar(sentimiento)"), "el color sale de la regla");
    assert.ok(!fila.includes("ring-2 ring-background"), "el aro no se escribe a mano");
    assert.equal((fila.match(/<Avatar\b/g) || []).length, 1, "no se añade ningún avatar ni aro nuevo");
});

test(`[${MODO}] la franja va pegada JUSTO encima de la barra de escribir`, () => {
    const main = quitarComentarios(leer("app/(root)/chats/_components/chat-main.tsx"));
    const i = main.indexOf("<FranjaDeSentimiento");
    const j = main.indexOf("<ChatInputBar");
    if (MODO === "roto") {
        assert.equal(i, -1, "antes no había franja");
        return;
    }
    assert.ok(i > 0 && j > i, "la franja va antes de la barra");
    assert.ok(!/<\w/.test(main.slice(main.indexOf("/>", i) + 2, j)), "y nada entre las dos");
});

test(`[${MODO}] el CRM tiene su reporte de sentimiento, simétrico con Llamadas`, () => {
    const vista = quitarComentarios(leer("app/(root)/crm/dashboard/components/AnalyticsView.tsx"));
    if (MODO === "roto") {
        assert.ok(!vista.includes("getSentimientoCrmData"), "antes no había reporte");
        return;
    }
    assert.ok(vista.includes("getSentimientoCrmData({ days: callDays, cuentas })"), "mismas cuentas y período");
    assert.ok(vista.includes('sentimiento:  "Sentimiento"'), "se puede ocultar como las demás secciones");
    // Simetría: tarjeta de lista a la izquierda y gráfica por día a la derecha,
    // igual que el bloque de Llamadas.
    const bloque = vista.slice(vista.indexOf("data-reporte-de-sentimiento"));
    assert.ok(bloque.indexOf("<KpiList") < bloque.indexOf("<BarChart"));
});

test(`[${MODO}] el análisis existe, no es mudo y usa la IA de la cuenta`, () => {
    const runner = quitarComentarios(leer("lib/sentimiento-runner.server.ts"));
    if (MODO === "roto") {
        assert.equal(runner, "", "antes nada analizaba los mensajes");
        return;
    }
    assert.ok(runner.includes("laIaDeLaCuenta"), "la IA por defecto de la cuenta");
    assert.ok(!/catch\s*\{\s*\}/.test(runner), "ningún catch vacío");
    const accion = quitarComentarios(leer("actions/sentimiento-actions.ts"));
    assert.ok(accion.includes("lasCuentasQueConsultaElCrm"), "el reporte pasa por la puerta del CRM");
    const tw = leer("tailwind.config.ts");
    assert.ok(tw.includes("./lib/**"), "Tailwind mira lib/: los colores del aro viven ahí");
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. El análisis contra Postgres
// ─────────────────────────────────────────────────────────────────────────────

const hayBase = MODO === "bueno" && Boolean(process.env.DATABASE_URL);
const s = hayBase ? await import(join(COMPILADO, "entrada-del-sentimiento.js")) : null;

const sello = Date.now().toString(36);
const CUENTA = `sent-${sello}-cuenta`;
const AJENA = `sent-${sello}-ajena`;
const ASESOR = `sent-${sello}-asesor`;
const LINEA = `SENT_${sello}`;
const JID = `5730010${sello.slice(-4)}@s.whatsapp.net`;
const LID = `9990${sello.slice(-5)}@lid`;
const JID_B = `5730020${sello.slice(-4)}@s.whatsapp.net`;

async function crearChatMessages(db) {
    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "chat_messages" (
        "id" BIGSERIAL PRIMARY KEY, "userId" TEXT NOT NULL, "instanceName" TEXT NOT NULL,
        "instanceType" TEXT, "remoteJid" TEXT NOT NULL, "remoteJidAlt" TEXT, "senderPn" TEXT,
        "messageId" TEXT NOT NULL, "fromMe" BOOLEAN NOT NULL DEFAULT FALSE, "pushName" TEXT,
        "messageType" TEXT NOT NULL DEFAULT 'conversation', "content" TEXT, "mediaUrl" TEXT,
        "raw" JSONB, "messageTimestamp" TIMESTAMP(3) NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
}

let n = 0;
async function mensaje({ jid = JID, alt = LID, fromMe = false, texto, hace = 60, tipo = "conversation", cuenta = CUENTA, linea = LINEA }) {
    n += 1;
    const id = `m-${sello}-${n}`;
    await s.db.$executeRawUnsafe(
        `INSERT INTO "chat_messages" ("userId","instanceName","remoteJid","remoteJidAlt","senderPn","messageId","fromMe","messageType","content","messageTimestamp","updatedAt")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, NOW() - make_interval(secs => $10::int), NOW())`,
        cuenta, linea, jid, alt, null, id, fromMe, tipo, texto, hace,
    );
    return id;
}

/** El analizador de mentira: dice negativo si hay queja, positivo si hay gracias. */
function analizadorQueCuenta() {
    const llamadas = [];
    const fn = async ({ cuenta, texto }) => {
        llamadas.push({ cuenta, texto });
        const ultimo = texto.split("\n").filter((l) => l.startsWith("Cliente:")).at(-1) ?? "";
        if (/desastre|molest|p[eé]sim/i.test(ultimo)) return "negativo";
        if (/gracias|excelente/i.test(ultimo)) return "positivo";
        if (/rar[oa]/i.test(ultimo)) return null;
        return "neutro";
    };
    return { fn, llamadas };
}

async function fila(jid = JID) {
    const r = await s.db.$queryRawUnsafe(
        `SELECT "sentimiento","negativoDesde","mensajeId" FROM "sentimiento_de_conversacion" WHERE "userId"=$1 AND "instanceName"=$2 AND "remoteJid"=$3`,
        CUENTA, LINEA, jid,
    );
    return r[0] ?? null;
}
async function caidas() {
    const r = await s.db.$queryRawUnsafe(
        `SELECT "asesorId", to_char("dia",'YYYY-MM-DD') AS dia FROM "sentimiento_caidas" WHERE "userId"=$1`, CUENTA);
    return r;
}

test("PREPARAR: cuentas, asesor, ficha y mensajes", { skip: !hayBase }, async () => {
    await crearChatMessages(s.db);
    for (const [id, name] of [[CUENTA, "Cuenta"], [AJENA, "Ajena"], [ASESOR, "Ana Asesora"]]) {
        await s.db.user.upsert({ where: { id }, update: {}, create: { id, email: `${id}@banco.test`, name } });
    }
    await s.db.$executeRawUnsafe(
        `INSERT INTO "Session" ("userId","remoteJid","remoteJidAlt","pushName","instanceId","updatedAt","status","assigned_advisor_id")
         VALUES ($1,$2,$3,'Cliente',$4,NOW(),true,$5)`,
        CUENTA, JID, LID, LINEA, ASESOR,
    );
    s.olvidarLoRecordado();
});

test("un cliente molesto → negativo, bajo TODAS sus identidades, y la caída se apunta con su asesor", { skip: !hayBase }, async () => {
    await mensaje({ fromMe: true, texto: "Hola, ¿en qué te ayudo?", hace: 120 });
    await mensaje({ texto: "Esto es un desastre, llevo tres días esperando", hace: 100 });
    // La IA contesta después: el último mensaje ya no es del cliente, y aun así
    // se analiza el suyo.
    await mensaje({ fromMe: true, texto: "Lo siento mucho", hace: 90 });
    await mensaje({ jid: JID_B, alt: null, texto: "Muchas gracias, excelente servicio", hace: 80 });
    await mensaje({ jid: `1203${sello}@g.us`, alt: null, texto: "un desastre en el grupo", hace: 70 });

    const { fn, llamadas } = analizadorQueCuenta();
    const r = await s.barrerElSentimientoDeLaBandeja([CUENTA], [LINEA], fn);
    assert.equal(r.analizados, 2, "dos conversaciones 1:1; el grupo no cuenta");
    assert.equal(r.cayeron, 1);
    assert.ok(llamadas.every((l) => l.cuenta === CUENTA), "con la IA de la cuenta dueña de la línea");

    assert.equal((await fila()).sentimiento, "negativo");
    assert.ok((await fila()).negativoDesde);
    assert.equal((await fila(JID_B)).sentimiento, "positivo");

    const mapa = await s.losSentimientosDeLasLineas([CUENTA], [LINEA]);
    assert.equal(mapa[`${LINEA}::${JID}`]?.sentimiento, "negativo");
    assert.equal(mapa[`${LINEA}::${LID}`]?.sentimiento, "negativo", "también por su @lid");
    assert.equal(mapa[`${LINEA}::${JID_B}`]?.sentimiento, "positivo");

    const c = await caidas();
    assert.equal(c.length, 1);
    assert.equal(c[0].asesorId, ASESOR, "con el asesor que la llevaba");
});

test("otra vuelta no vuelve a pagar lo ya analizado", { skip: !hayBase }, async () => {
    s.olvidarLoRecordado();
    const { fn, llamadas } = analizadorQueCuenta();
    const r = await s.barrerElSentimientoDeLaBandeja([CUENTA], [LINEA], fn);
    assert.equal(r.pendientes, 0);
    assert.equal(llamadas.length, 0);
});

test("dos a la vez sobre el mismo mensaje: la IA se llama UNA vez", { skip: !hayBase }, async () => {
    await mensaje({ texto: "sigo molesto", hace: 50 });
    const pend = await s.losPendientes({ cuentas: [CUENTA], lineas: [LINEA], minutos: 30, tope: 10 });
    assert.equal(pend.length, 1);
    const { fn, llamadas } = analizadorQueCuenta();
    const lento = async (a) => { await new Promise((r) => setTimeout(r, 150)); return fn(a); };
    const res = await Promise.all([
        s.analizarUnaConversacion(pend[0], lento),
        s.analizarUnaConversacion(pend[0], lento),
    ]);
    assert.equal(llamadas.length, 1);
    assert.ok(res.includes("ocupado"));
    assert.equal((await caidas()).length, 1, "seguir negativo no es caer otra vez");
});

test("una respuesta que no se entiende NO borra el negativo", { skip: !hayBase }, async () => {
    const antes = await fila();
    await mensaje({ texto: "esto es raro", hace: 40 });
    s.olvidarLoRecordado();
    const { fn } = analizadorQueCuenta();
    await s.barrerElSentimientoDeLaBandeja([CUENTA], [LINEA], fn);
    const ahora = await fila();
    assert.equal(ahora.sentimiento, "negativo");
    assert.equal(ahora.negativoDesde.getTime(), antes.negativoDesde.getTime(), "la misma caída");
});

test("mejora → positivo y se va el negativo; vuelve a caer el mismo día → una sola caída ese día", { skip: !hayBase }, async () => {
    await mensaje({ texto: "ya quedó, muchas gracias", hace: 30 });
    s.olvidarLoRecordado();
    let a = analizadorQueCuenta();
    await s.barrerElSentimientoDeLaBandeja([CUENTA], [LINEA], a.fn);
    assert.equal((await fila()).sentimiento, "positivo");
    assert.equal((await fila()).negativoDesde, null);
    const mapa = await s.losSentimientosDeLasLineas([CUENTA], [LINEA]);
    assert.equal(mapa[`${LINEA}::${JID}`].negativoDesde, null);

    await mensaje({ texto: "otra vez pésimo", hace: 20 });
    s.olvidarLoRecordado();
    a = analizadorQueCuenta();
    await s.barrerElSentimientoDeLaBandeja([CUENTA], [LINEA], a.fn);
    const f = await fila();
    assert.equal(f.sentimiento, "negativo");
    assert.equal((await caidas()).length, 1, "una por conversación y día");
});

test("una cuenta AJENA no ve el sentimiento de esta línea", { skip: !hayBase }, async () => {
    assert.deepEqual(await s.losSentimientosDeLasLineas([AJENA], [LINEA]), {});
});

test("sin IA configurada no se reintenta en bucle: se da por leído y se conserva lo que había", { skip: !hayBase }, async () => {
    await mensaje({ jid: JID_B, alt: null, texto: "hola de nuevo", hace: 10 });
    s.olvidarLoRecordado();
    // El analizador de VERDAD: la cuenta del banco no tiene IA por defecto.
    const r = await s.barrerElSentimientoDeLaBandeja([CUENTA], [LINEA], s.analizarConLaIa);
    assert.equal(r.sinIa, 1);
    assert.equal((await fila(JID_B)).sentimiento, "positivo", "no se inventa nada");
    s.olvidarLoRecordado();
    const otra = await s.barrerElSentimientoDeLaBandeja([CUENTA], [LINEA], s.analizarConLaIa);
    assert.equal(otra.pendientes, 0, "no vuelve a salir");
});

test("el barrido de la plataforma recoge lo que entró sin nadie mirando", { skip: !hayBase }, async () => {
    const JID_C = `5730030${sello.slice(-4)}@s.whatsapp.net`;
    await mensaje({ jid: JID_C, alt: null, texto: "estoy muy molesto", hace: 60 * 60 * 5 });
    const { fn } = analizadorQueCuenta();
    const r = await s.barrerElSentimientoDeLaPlataforma({ horas: 26, tope: 50 }, fn);
    assert.ok(r.cayeron >= 1);
    assert.equal((await fila(JID_C)).sentimiento, "negativo");
});

test("el reporte del CRM: por día y por asesor, con la puerta del CRM", { skip: !hayBase }, async () => {
    s.ponerAQuienMira({ id: CUENTA, effectiveId: CUENTA, role: "user", ownerId: null });
    const r = await s.getSentimientoCrmData({ days: 7 });
    assert.equal(r.porDia.length, 7);
    assert.equal(r.total, 2);
    const hoy = s.elDiaDe(new Date());
    assert.ok(r.porDia.some((d) => d.dia === hoy && d.cantidad >= 1));
    const nombres = r.porAsesor.map((a) => a.nombre).sort();
    assert.deepEqual(nombres, ["Ana Asesora", "Sin asignar"]);

    s.ponerAQuienMira({ id: AJENA, effectiveId: AJENA, role: "user", ownerId: null });
    const ajeno = await s.getSentimientoCrmData({ days: 7, cuentas: [CUENTA] });
    assert.equal(ajeno.total, 0, "pedir la cuenta de otro a mano no la abre");
    s.ponerAQuienMira(null);
    assert.equal((await s.getSentimientoCrmData({ days: 7 })).total, 0, "sin sesión, nada");
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. La franja de verdad, en Chromium, sobre el CSS del build
// ─────────────────────────────────────────────────────────────────────────────

const CSS_DIR = join(RAIZ, ".next", "static", "css");
const CSS = fs.existsSync(CSS_DIR)
    ? fs.readdirSync(CSS_DIR).filter((f) => f.endsWith(".css")).map((f) => fs.readFileSync(join(CSS_DIR, f), "utf8")).join("\n")
    : "";
const HARNESS = join(COMPILADO, "harness-franja.js");
const hayNavegador = MODO === "bueno" && Boolean(chromium && CSS && fs.existsSync(HARNESS));

test("los colores del aro EXISTEN en el CSS del build", { skip: MODO === "roto" || !CSS }, () => {
    // Un color que no se genera deja el aro sin color con el build en verde.
    assert.ok(/\.ring-emerald-300\{/.test(CSS), "verde pastel");
    assert.ok(/\.ring-red-300\{/.test(CSS), "rojo suave");
    assert.ok(/\.bg-red-50\{/.test(CSS), "el fondo de la franja");
});

test("la franja: sale, se cierra, se va sola al mejorar y vuelve con una caída nueva", { skip: !hayNavegador }, async () => {
    const servidor = http.createServer((req, res) => {
        if (req.url === "/h.js") {
            res.writeHead(200, { "content-type": "text/javascript" });
            return res.end(fs.readFileSync(HARNESS));
        }
        res.writeHead(200, { "content-type": "text/html" });
        res.end(`<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body><div id="app"></div><script>window.process={env:{}}</script><script src="/h.js"></script></body></html>`);
    });
    await new Promise((r) => servidor.listen(0, r));
    const url = `http://localhost:${servidor.address().port}/`;
    const navegador = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined });
    try {
        const pagina = await navegador.newPage({ viewport: { width: 1280, height: 800 } });
        await pagina.goto(url);
        await pagina.waitForFunction(() => window.listo === true);
        const franja = () => pagina.$("[data-franja-de-sentimiento]");
        const poner = (v) => pagina.evaluate((x) => window.ponerSentimiento(x), v);

        await poner({ sentimiento: "neutro", negativoDesde: null });
        assert.equal(await franja(), null, "neutro: nada");
        await poner({ sentimiento: "positivo", negativoDesde: null });
        assert.equal(await franja(), null, "positivo: nada");

        const caida1 = { sentimiento: "negativo", negativoDesde: "2026-09-20T10:00:00.000Z" };
        await poner(caida1);
        await pagina.waitForSelector("[data-franja-de-sentimiento]");
        const geo = await pagina.evaluate(() => {
            const f = document.querySelector("[data-franja-de-sentimiento]").getBoundingClientRect();
            const b = document.querySelector("[data-barra-de-escribir]").getBoundingClientRect();
            const cont = document.querySelector("[data-franja-de-sentimiento]").parentElement.getBoundingClientRect();
            const estilo = getComputedStyle(document.querySelector("[data-franja-de-sentimiento]"));
            return { abajo: f.bottom, barra: b.top, ancho: f.width, contAncho: cont.width, alto: f.height, fondo: estilo.backgroundColor, texto: document.querySelector("[data-franja-de-sentimiento]").textContent };
        });
        assert.equal(Math.round(geo.abajo), Math.round(geo.barra), "pegada a la barra");
        assert.equal(Math.round(geo.ancho), Math.round(geo.contAncho), "ancho completo");
        assert.ok(geo.alto <= 32, `delgada (${geo.alto}px)`);
        assert.match(geo.texto, /molesto/);
        assert.notEqual(geo.fondo, "rgba(0, 0, 0, 0)", "tiene su fondo rojo suave");

        // Sin cerrarla, se va SOLA al mejorar.
        await poner({ sentimiento: "neutro", negativoDesde: null });
        assert.equal(await franja(), null, "mejora → se va sola");

        // Vuelve a caer: sale. Se cierra con la equis.
        await poner(caida1);
        await pagina.click("[data-franja-de-sentimiento] button");
        assert.equal(await franja(), null, "cerrada");
        // Sigue negativo (otra vuelta de la lista, misma caída): sigue cerrada.
        await poner({ ...caida1 });
        assert.equal(await franja(), null, "la misma caída sigue cerrada");
        // Recargar la pestaña no la resucita.
        await pagina.reload();
        await pagina.waitForFunction(() => window.listo === true);
        await poner(caida1);
        await pagina.waitForTimeout(50);
        assert.equal(await franja(), null, "cerrada también tras recargar");
        // Una caída NUEVA es otra cosa: sale otra vez.
        await poner({ sentimiento: "negativo", negativoDesde: "2026-09-21T09:00:00.000Z" });
        await pagina.waitForSelector("[data-franja-de-sentimiento]");
    } finally {
        await navegador.close();
        servidor.close();
    }
});

test(`[${MODO}] el banco ejerció algo`, () => {
    if (MODO === "bueno") {
        assert.ok(hayBase, "sin base no se ejerce el análisis: el banco no puede salir verde sin él");
        assert.ok(hayNavegador, "sin navegador ni CSS no se ejerce la franja");
    }
});
