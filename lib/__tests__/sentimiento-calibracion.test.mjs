/**
 * El banco de la CALIBRACIÓN y del INTERRUPTOR del sentimiento.
 *
 * Lo que se arregló (medido en producción el 2026-10-02): la IA marcaba
 * «molesto» a clientes que solo daban un dato, contestaban una pregunta o
 * decían que no les interesaba. Tres causas, y cada una tiene aquí su prueba:
 *
 *   1. La instrucción no decía qué NO es negativo, y juzgaba la conversación
 *      entera: una queja vieja teñía el mensaje de hoy. Ahora la IA juzga solo
 *      los ÚLTIMOS mensajes del cliente, marcados, y lo demás le llega como
 *      contexto.
 *   2. El lector se quedaba con la primera palabra: «No es negativo, es
 *      neutro» salía negativo.
 *   3. Los «molesto» de la calibración vieja se quedaban para siempre: se
 *      vuelven a analizar una vez, y su caída falsa sale del reporte.
 *
 * Y el interruptor: nace APAGADO para toda cuenta, solo lo cambia el DUEÑO, y
 * apagado no se analiza, no se cobra, no se pinta y no se reporta.
 *
 * `MODO=roto` corre las reglas puras de `ANTES_DE_CALIBRAR` (compiladas por el
 * script en `.compilado/sentimiento/antes/`) y AFIRMA los fallos; la mitad de
 * Postgres solo corre en el modo bueno (antes no había interruptor que probar).
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..", "..");
const COMPILADO = join(AQUI, ".compilado", "sentimiento");
const MODO = process.env.MODO === "roto" ? "roto" : "bueno";

const reglas = await import(join(COMPILADO, MODO === "roto" ? "antes/sentimiento.js" : "sentimiento.js"));

// ─────────────────────────────────────────────────────────────────────────────
// 1. Las reglas de la calibración
// ─────────────────────────────────────────────────────────────────────────────

test(`[${MODO}] la instrucción dice qué NO es negativo y que ante la duda es neutro`, () => {
    const i = reglas.INSTRUCCION_DEL_SENTIMIENTO;
    const dice = /Ante la duda, responde neutro/.test(i) && /NO es negativo/.test(i) && /da información/.test(i);
    if (MODO === "roto") {
        assert.equal(dice, false, "antes no lo decía");
        return;
    }
    assert.ok(dice);
    assert.match(i, /CONTRA el negocio/, "negativo es molestia contra el negocio, no una mala noticia");
});

test(`[${MODO}] una queja VIEJA no tiñe el dato de hoy: solo se juzgan los últimos del cliente`, () => {
    const conversacion = [
        { fromMe: false, texto: "Esto es un desastre, llevo días esperando" },
        { fromMe: true, texto: "Lo sentimos mucho, ya quedó resuelto. ¿Me confirmas tu correo?" },
        { fromMe: false, texto: "mi correo es ana@ejemplo.com" },
    ];
    const t = reglas.elTextoParaAnalizar(conversacion);
    if (MODO === "roto") {
        // Antes: un bloque plano, la queja y el dato al mismo nivel.
        assert.ok(!/JUZGA/.test(t), "antes nada separaba lo que se juzga");
        assert.ok(/desastre[\s\S]*ana@ejemplo/.test(t));
        return;
    }
    const [contexto, juzgado] = t.split("JUZGA SOLO ESTOS");
    assert.match(contexto, /¿Me confirmas tu correo\?/, "el contexto es lo último que dijo el negocio");
    assert.ok(!/desastre/.test(t), "la queja vieja no le llega a la IA: medido, con ella delante el dato salía negativo");
    assert.match(juzgado, /ana@ejemplo\.com/);
    assert.equal(reglas.LINEAS_DE_CONTEXTO, 1);
});

test(`[${MODO}] varios mensajes seguidos del cliente se juzgan juntos, como mucho los últimos cinco`, { skip: MODO === "roto" }, () => {
    const msgs = [{ fromMe: true, texto: "¿Algo más?" }, ...Array.from({ length: 8 }, (_, k) => ({ fromMe: false, texto: `dato ${k}` }))];
    const juzgados = reglas.losMensajesQueSeJuzgan(msgs);
    assert.equal(juzgados.length, reglas.MENSAJES_QUE_SE_JUZGAN);
    assert.equal(juzgados.at(-1).texto, "dato 7");
    // Un último tramo sin texto (un audio sin transcribir) no se juzga otra vez.
    assert.deepEqual(reglas.losMensajesQueSeJuzgan([{ fromMe: false, texto: "qué mal" }, { fromMe: true, texto: "ok" }, { fromMe: false, texto: null }]), []);
});

test(`[${MODO}] una palabra NEGADA no cuenta: «No es negativo, es neutro» es neutro`, () => {
    const leido = reglas.leerElSentimiento("No es negativo, es neutro.");
    if (MODO === "roto") {
        assert.equal(leido, "negativo", "antes ganaba la primera palabra");
        return;
    }
    assert.equal(leido, "neutro");
    assert.equal(reglas.leerElSentimiento("neutro (no negativo)"), "neutro");
    assert.equal(reglas.leerElSentimiento("negativo"), "negativo", "lo directo sigue igual");
});

test(`[${MODO}] apagado: el aro vuelve a ser el de antes, del color del fondo`, () => {
    if (MODO === "roto") {
        assert.notEqual(reglas.elAnilloDelAvatar("apagado"), "ring-background", "antes no había estado apagado");
        return;
    }
    assert.equal(reglas.elAnilloDelAvatar("apagado"), reglas.ANILLO_SIN_SENTIMIENTO);
    assert.equal(reglas.SENTIMIENTO_POR_DEFECTO.activa, false, "nace apagado");
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Barrido: el interruptor solo lo ve y lo cambia el dueño
// ─────────────────────────────────────────────────────────────────────────────

const leer = (ruta) => (fs.existsSync(join(RAIZ, ruta)) ? fs.readFileSync(join(RAIZ, ruta), "utf8") : "");

test(`[${MODO}] la tarjeta va en Perfil › Comportamiento y SOLO para el dueño`, { skip: MODO === "roto" }, () => {
    const info = leer("app/(root)/profile/_components/UserInformation.tsx");
    const pagina = leer("app/(root)/profile/page.tsx");
    assert.match(info, /esElDueno && \(<>[\s\S]*<SentimientoCard \/>/, "la tarjeta va detrás de esElDueno");
    assert.match(pagina, /esElDueno=\{esElDuenoDeLaCuenta\(user\)\}/, "lo decide la página con la regla");
    const accion = leer("actions/sentimiento-ajustes-actions.ts");
    assert.equal((accion.match(/esElDuenoDeLaCuenta\(user\)/g) || []).length, 2, "las dos acciones preguntan");
    assert.ok(!/userId/.test(accion), "ninguna acepta un id del navegador");
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Contra Postgres
// ─────────────────────────────────────────────────────────────────────────────

const hayBase = MODO === "bueno" && Boolean(process.env.DATABASE_URL);
const s = hayBase ? await import(join(COMPILADO, "entrada-del-sentimiento.js")) : null;

const sello = `c${Date.now().toString(36)}`;
const DUENA = `cal-${sello}-duena`;
const APAGADA = `cal-${sello}-apagada`;
const ADMIN = `cal-${sello}-admin`;
const AGENTE = `cal-${sello}-agente`;
const LINEA = `CAL_${sello}`;
const LINEA_APAGADA = `CALOFF_${sello}`;
const jid = (k) => `5739${String(k).padStart(3, "0")}${sello.slice(-4)}@s.whatsapp.net`;

let n = 0;
async function mensaje({ cuenta = DUENA, linea = LINEA, j, fromMe = false, texto, hace = 60, tipo = "conversation" }) {
    n += 1;
    const id = `cal-${sello}-${n}`;
    await s.db.$executeRawUnsafe(
        `INSERT INTO "chat_messages" ("userId","instanceName","remoteJid","messageId","fromMe","messageType","content","messageTimestamp","updatedAt")
         VALUES ($1,$2,$3,$4,$5,$6,$7, NOW() - make_interval(secs => $8::int), NOW())`,
        cuenta, linea, j, id, fromMe, tipo, texto, hace);
    await s.db.$executeRawUnsafe(
        `INSERT INTO "chat_conversations" ("userId","instanceName","remoteJid","lastMessageId","lastMessageFromMe","lastMessageTimestamp","updatedAt")
         VALUES ($1,$2,$3,$4,$5, NOW() - make_interval(secs => $6::int), NOW())
         ON CONFLICT ("userId","instanceName","remoteJid") DO UPDATE SET
           "lastMessageId" = EXCLUDED."lastMessageId", "lastMessageFromMe" = EXCLUDED."lastMessageFromMe",
           "lastMessageTimestamp" = GREATEST("chat_conversations"."lastMessageTimestamp", EXCLUDED."lastMessageTimestamp")`,
        cuenta, linea, j, id, fromMe, hace);
    return id;
}

function analizador(respuesta = "neutro") {
    const llamadas = [];
    return { llamadas, fn: async (a) => { llamadas.push(a); return typeof respuesta === "function" ? respuesta(a) : respuesta; } };
}

async function filaDe(cuenta, linea, j) {
    const r = await s.db.$queryRawUnsafe(
        `SELECT "sentimiento","calibracion","negativoDesde" FROM "sentimiento_de_conversacion" WHERE "userId"=$1 AND "instanceName"=$2 AND "remoteJid"=$3`,
        cuenta, linea, j);
    return r[0] ?? null;
}

test("PREPARAR: dos cuentas con bolsa y línea; ninguna toca el interruptor", { skip: !hayBase }, async () => {
    // Las tablas del chat las crea el banco de al lado con la misma DDL; aquí
    // basta con que existan (se corre después de él).
    for (const [id, extra] of [
        [DUENA, {}],
        [APAGADA, {}],
        [ADMIN, { ownerId: DUENA, advisorRole: "administrador" }],
        [AGENTE, { ownerId: DUENA, advisorRole: "agente" }],
    ]) {
        await s.db.user.upsert({ where: { id }, update: {}, create: { id, email: `${id}@banco.test`, name: id, ...extra } });
    }
    for (const cuenta of [DUENA, APAGADA]) {
        await s.db.iaCredit.upsert({
            where: { userId: cuenta },
            update: { total: 1000, used: 0 },
            create: { userId: cuenta, total: 1000, used: 0, renewalDate: new Date(Date.now() + 864e5) },
        });
    }
    await s.db.instancia.create({ data: { userId: DUENA, instanceName: LINEA, instanceId: LINEA, instanceType: "Whatsapp" } });
    await s.db.instancia.create({ data: { userId: APAGADA, instanceName: LINEA_APAGADA, instanceId: LINEA_APAGADA, instanceType: "Whatsapp" } });
});

test("NACE APAGADO: sin tocar nada no se analiza, no se cobra, no se pinta, no se reporta", { skip: !hayBase }, async () => {
    assert.deepEqual(await s.leerLosAjustesDelSentimiento(APAGADA), { activa: false });
    await mensaje({ cuenta: APAGADA, linea: LINEA_APAGADA, j: jid(1), texto: "esto es un desastre" });
    // Una fila que quedó de antes (cuando la función corría para todos).
    await s.db.$executeRawUnsafe(
        `INSERT INTO "sentimiento_de_conversacion" ("userId","instanceName","remoteJid","sentimiento","actualizadoEn")
         VALUES ($1,$2,$3,'negativo',NOW())`, APAGADA, LINEA_APAGADA, jid(9));
    s.olvidarLoRecordado();
    const { fn, llamadas } = analizador("negativo");
    const r = await s.analizarElSentimientoAlAbrirChats([APAGADA], [LINEA_APAGADA], fn);
    assert.equal(r.pendientes, 0, "nada pendiente");
    assert.equal(llamadas.length, 0, "no se llama a la IA");
    assert.equal((await s.db.iaCredit.findUnique({ where: { userId: APAGADA } })).used, 0, "no se cobra");
    assert.deepEqual(await s.losSentimientosDeLasLineas([APAGADA], [LINEA_APAGADA]), {}, "no se pinta, tampoco lo viejo");
    assert.deepEqual(await s.lasLineasConSentimiento([LINEA_APAGADA]), []);
    s.ponerAQuienMira({ id: APAGADA, effectiveId: APAGADA, role: "user", ownerId: null });
    const rep = await s.getSentimientoCrmData({ days: 7 });
    assert.equal(rep.apagado, true, "el reporte dice que está apagado");
    assert.equal(rep.total, 0);
});

test("solo el DUEÑO cambia el interruptor; ni administrador, ni agente, ni con «Ingresar»", { skip: !hayBase }, async () => {
    const intentos = [
        [{ id: ADMIN, effectiveId: DUENA, ownerId: DUENA, advisorRole: "administrador", role: "user" }, false],
        [{ id: AGENTE, effectiveId: DUENA, ownerId: DUENA, advisorRole: "agente", role: "user" }, false],
        [{ id: DUENA, effectiveId: DUENA, ownerId: null, role: "admin", rolDeLaPersona: "admin", porImpersonacion: true, sessionUserId: "otra-persona" }, false],
        [{ id: DUENA, effectiveId: DUENA, ownerId: null, role: "user", sessionUserId: APAGADA }, false],
    ];
    for (const [quien, puede] of intentos) {
        s.ponerAQuienMira(quien);
        const r = await s.guardarSentimientoActivo(true);
        assert.equal(r.success, puede, `${quien.id}/${quien.advisorRole ?? quien.sessionUserId}`);
        assert.equal((await s.getAjustesDelSentimiento()).puedeCambiar, false);
    }
    assert.deepEqual(await s.leerLosAjustesDelSentimiento(DUENA), { activa: false }, "nadie de esos la encendió");

    s.ponerAQuienMira({ id: DUENA, effectiveId: DUENA, ownerId: null, role: "user" });
    assert.equal((await s.getAjustesDelSentimiento()).puedeCambiar, true);
    assert.equal((await s.guardarSentimientoActivo("si")).success, false, "un valor que no es booleano no se guarda");
    assert.equal((await s.guardarSentimientoActivo(true)).success, true);
    assert.deepEqual(await s.getAjustesDelSentimiento(), { activa: true, puedeCambiar: true });
    assert.deepEqual(await s.lasLineasConSentimiento([LINEA, LINEA_APAGADA]), [LINEA], "solo la línea de la dueña");
    assert.deepEqual(await s.lasCuentasConSentimiento([DUENA, APAGADA]), [DUENA]);
});

test("encendido, se analiza; apagarlo vuelve a dejarlo todo quieto", { skip: !hayBase }, async () => {
    await mensaje({ j: jid(2), texto: "hola, ¿qué precio tiene?" });
    s.olvidarLoRecordado();
    let a = analizador("neutro");
    const r = await s.analizarElSentimientoAlAbrirChats([DUENA], [LINEA], a.fn);
    assert.equal(r.analizados, 1);
    assert.equal((await filaDe(DUENA, LINEA, jid(2))).calibracion, 2, "queda sellado con la calibración nueva");
    assert.equal((await s.losSentimientosDeLasLineas([DUENA], [LINEA]))[`${LINEA}::${jid(2)}`]?.sentimiento, "neutro");

    s.ponerAQuienMira({ id: DUENA, effectiveId: DUENA, ownerId: null, role: "user" });
    await s.guardarSentimientoActivo(false);
    await mensaje({ j: jid(2), texto: "otra pregunta", hace: 30 });
    s.olvidarLoRecordado();
    a = analizador("neutro");
    await s.analizarElSentimientoAlAbrirChats([DUENA], [LINEA], a.fn);
    assert.equal(a.llamadas.length, 0, "apagada no se llama a la IA");
    assert.deepEqual(await s.losSentimientosDeLasLineas([DUENA], [LINEA]), {}, "ni se pinta");
    await s.guardarSentimientoActivo(true);
});

test("un «molesto» de la calibración VIEJA se vuelve a analizar UNA vez y su caída falsa sale del reporte", { skip: !hayBase }, async () => {
    const j = jid(3);
    const id = await mensaje({ j, texto: "Mi nombre es Ana y vivo en Medellín", hace: 600 });
    const caida = new Date(Date.now() - 600_000);
    // Así lo dejó la calibración vieja: negativo, sin versión, con su caída.
    await s.db.$executeRawUnsafe(
        `INSERT INTO "sentimiento_de_conversacion" ("userId","instanceName","remoteJid","sentimiento","mensajeId","mensajeEn","negativoDesde","actualizadoEn")
         VALUES ($1,$2,$3,'negativo',$4, (SELECT "messageTimestamp" FROM "chat_messages" WHERE "messageId" = $4), $5, NOW())`, DUENA, LINEA, j, id, caida);
    await s.db.$executeRawUnsafe(
        `INSERT INTO "sentimiento_caidas" ("userId","instanceName","remoteJid","dia","sucedioEn") VALUES ($1,$2,$3,$4::date,$5)`,
        DUENA, LINEA, j, s.elDiaDe(caida), caida);

    // Mientras tanto la pantalla ya no lo pinta en rojo, y el reporte no lo cuenta.
    assert.equal((await s.losSentimientosDeLasLineas([DUENA], [LINEA]))[`${LINEA}::${j}`]?.sentimiento, "neutro");
    s.ponerAQuienMira({ id: DUENA, effectiveId: DUENA, ownerId: null, role: "user" });
    assert.equal((await s.getSentimientoCrmData({ days: 7 })).total, 0, "la caída vieja no se cuenta");

    s.olvidarLoRecordado();
    let a = analizador("neutro");
    await s.analizarElSentimientoAlAbrirChats([DUENA], [LINEA], a.fn);
    const deAna = a.llamadas.filter((l) => /Mi nombre es Ana/.test(l.texto));
    assert.equal(deAna.length, 1, "se vuelve a analizar el mismo mensaje");
    assert.match(deAna[0].texto, /JUZGA SOLO ESTOS\):\nCliente: Mi nombre es Ana/);
    const f = await filaDe(DUENA, LINEA, j);
    assert.equal(f.sentimiento, "neutro");
    assert.equal(f.calibracion, 2);
    assert.equal(f.negativoDesde, null);
    const c = await s.db.$queryRawUnsafe(`SELECT COUNT(*)::int AS n FROM "sentimiento_caidas" WHERE "userId"=$1 AND "remoteJid"=$2`, DUENA, j);
    assert.equal(c[0].n, 0, "la caída falsa se borró");

    s.olvidarLoRecordado();
    a = analizador("neutro");
    await s.analizarElSentimientoAlAbrirChats([DUENA], [LINEA], a.fn);
    assert.equal(a.llamadas.length, 0, "y no se repite");
});

test("un «molesto» de la calibración NUEVA no se vuelve a pagar, y su caída SÍ se reporta", { skip: !hayBase }, async () => {
    const j = jid(4);
    await mensaje({ j, texto: "llevo tres días esperando y nadie me responde, qué falta de seriedad", hace: 120 });
    s.olvidarLoRecordado();
    let a = analizador("negativo");
    await s.analizarElSentimientoAlAbrirChats([DUENA], [LINEA], a.fn);
    assert.equal((await filaDe(DUENA, LINEA, j)).sentimiento, "negativo");
    s.olvidarLoRecordado();
    a = analizador("neutro");
    await s.analizarElSentimientoAlAbrirChats([DUENA], [LINEA], a.fn);
    assert.equal(a.llamadas.length, 0);
    s.ponerAQuienMira({ id: DUENA, effectiveId: DUENA, ownerId: null, role: "user" });
    assert.equal((await s.getSentimientoCrmData({ days: 7 })).total, 1);
});

test("un «molesto» viejo SIN texto que volver a juzgar (un audio) queda neutro, no se re-sella en rojo", { skip: !hayBase }, async () => {
    const j = jid(5);
    const id = await mensaje({ j, texto: "[Audio]", tipo: "audioMessage", hace: 300 });
    await s.db.$executeRawUnsafe(
        `INSERT INTO "sentimiento_de_conversacion" ("userId","instanceName","remoteJid","sentimiento","mensajeId","mensajeEn","negativoDesde","actualizadoEn")
         VALUES ($1,$2,$3,'negativo',$4, (SELECT "messageTimestamp" FROM "chat_messages" WHERE "messageId" = $4), NOW(), NOW())`, DUENA, LINEA, j, id);
    s.olvidarLoRecordado();
    const a = analizador("negativo");
    await s.analizarElSentimientoAlAbrirChats([DUENA], [LINEA], a.fn);
    assert.equal(a.llamadas.length, 0, "sin texto no se paga");
    const f = await filaDe(DUENA, LINEA, j);
    assert.equal(f.sentimiento, "neutro");
    assert.equal(f.calibracion, 2);
});

test(`[${MODO}] el banco ejerció algo`, () => {
    if (MODO === "bueno") assert.ok(hayBase, "sin base no se ejerce el interruptor");
});
