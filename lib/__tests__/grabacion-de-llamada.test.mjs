/**
 * El banco de «la llamada con IA deja Transcripción y Resumen».
 *
 * El encargo: tras el arreglo de «Llamar con IA» las llamadas salen y se
 * completan, y al terminar no queda ni Resumen IA ni Transcripción en el
 * registro. Esto lo prueba por los tres sitios donde se decidía:
 *
 *   A. la DECISIÓN, pura y sin base: qué se transcribe y cuánto cuesta;
 *   B. el camino MANUAL —el botón «Llamar con IA»— contra Postgres;
 *   C. el camino del FLUJO —`AI_CALL`, que entra por la ruta interna—;
 *   D. los CRÉDITOS: que se le descuentan a la cuenta que paga y no a la
 *      persona, y que una segunda vuelta no vuelve a cobrar.
 *
 * `MODO=roto` ejerce **lo que había** —el registro sin `astraCallId` y el
 * sondeo de 200 s del backend, escritos aquí literalmente— y **afirma el
 * fallo**: sin eso, lo verde de la versión nueva no diría si se arregló la
 * causa o si el caso no llega a ejercerse.
 *
 * Se fingen dos cosas y ninguna más: `currentUser()` y el paquete `openai`
 * —transcribir y resumir salen de la red—. Las dos acciones, la ruta, la
 * espera, la familia y el cobro son el código de producción.
 */
import test from "node:test";
import assert from "node:assert/strict";

const ROTO = process.env.MODO === "roto";
const sello = Date.now().toString(36);

const {
    ponerAQuienMira,
    ponerLoQueDiceLaIa,
    loQueSeLePidioALaIa,
    olvidarLoPedido,
    startBotCallAction,
    logOutgoingCallAction,
    pedirLaTranscripcion,
    processCallRecordingForUser,
    queHacerConLaGrabacion,
    porQueNoSeTranscribio,
    TOPE_DE_BYTES_DE_AUDIO,
    costoDeLaNota,
    conElNombreDeLaMarca,
    PISTA_DE_VOCABULARIO,
    descontarLaTranscripcion,
    ESPERA_ENTRE_INTENTOS_MS,
    INTENTOS_DE_GRABACION,
    db,
} = await import("./.compilado/grabacion/entrada-de-grabacion.js");

/* ── A. La decisión ─────────────────────────────────────────────────────── */

test("A1 · la tarifa es la MISMA de una nota de voz, no una cuenta nueva", () => {
    const que = queHacerConLaGrabacion({ segundos: 30, bytes: 1024, creditosDisponibles: 100 });
    assert.equal(que.hacer, "transcribir");
    assert.deepEqual(que.costo, costoDeLaNota(30));
});

test("A2 · lo que la API no acepta no se cobra ni se intenta, y se dice el peso", () => {
    const que = queHacerConLaGrabacion({
        segundos: 3600,
        bytes: TOPE_DE_BYTES_DE_AUDIO + 1,
        creditosDisponibles: 100000,
    });
    assert.equal(que.hacer, "demasiado_grande");
    const motivo = porQueNoSeTranscribio(que);
    assert.ok(motivo?.includes("MB"), "el aviso tiene que decir cuánto pesa");
});

test("A3 · el tamaño se mira ANTES que los créditos", () => {
    // Con las dos cosas mal, decir «sin créditos» manda a recargar para nada:
    // con créditos tampoco se habría transcrito.
    const que = queHacerConLaGrabacion({
        segundos: 3600,
        bytes: TOPE_DE_BYTES_DE_AUDIO + 1,
        creditosDisponibles: 0,
    });
    assert.equal(que.hacer, "demasiado_grande");
});

test("A4 · `null` es ILIMITADO, no cero", () => {
    assert.equal(
        queHacerConLaGrabacion({ segundos: 600, bytes: 1024, creditosDisponibles: null }).hacer,
        "transcribir",
    );
    const sin = queHacerConLaGrabacion({ segundos: 600, bytes: 1024, creditosDisponibles: 0 });
    assert.equal(sin.hacer, "sin_creditos");
    assert.ok(porQueNoSeTranscribio(sin)?.includes(String(sin.costo.creditos)), "el aviso lleva los números delante");
});

/* ── La red, fingida: el servidor de llamadas ───────────────────────────── */

const SID = `sid-${sello}`;
const LINEA = `HIJA_${sello}`;

/** Un WAV de verdad: 16 kHz, 2 canales, 16 bits — lo que graba AstraCalls. */
function wavDe(segundos) {
    const canales = 2;
    const sampleRate = 16000;
    const bits = 16;
    const bytesPorMuestra = (bits / 8) * canales;
    const datos = segundos * sampleRate * bytesPorMuestra;
    const buf = Buffer.alloc(44 + datos);
    buf.write("RIFF", 0, "ascii");
    buf.writeUInt32LE(36 + datos, 4);
    buf.write("WAVE", 8, "ascii");
    buf.write("fmt ", 12, "ascii");
    buf.writeUInt32LE(16, 16);
    buf.writeUInt16LE(1, 20);
    buf.writeUInt16LE(canales, 22);
    buf.writeUInt32LE(sampleRate, 24);
    buf.writeUInt32LE(sampleRate * bytesPorMuestra, 28);
    buf.writeUInt16LE(bytesPorMuestra, 32);
    buf.writeUInt16LE(bits, 34);
    buf.write("data", 36, "ascii");
    buf.writeUInt32LE(datos, 40);
    return buf;
}

const SEGUNDOS = 30;
const WAV = wavDe(SEGUNDOS);

/**
 * La grabación **no existe hasta que alguien cuelga**, y ese es el caso que
 * hay que reproducir: aquí se pide varias veces antes de que esté lista.
 */
const red = {
    /** Cuántas veces se ha pedido la grabación de cada llamada. */
    pedidos: new Map(),
    /** A partir de qué intento contesta con el WAV. */
    listaEnElIntento: 3,
};

const fetchDeVerdad = globalThis.fetch;
const setTimeoutDeVerdad = globalThis.setTimeout;

function montarLaRed() {
    globalThis.fetch = async (url, init) => {
        const u = String(url);
        const lanzar = u.match(/\/api\/sessions\/([^/]+)\/calls\/bot$/);
        if (lanzar) {
            return {
                ok: true,
                status: 200,
                json: async () => ({ call: { callId: `call-${sello}-${red.pedidos.size}-${Math.random().toString(36).slice(2, 8)}` } }),
                text: async () => "",
            };
        }
        const grabacion = u.match(/\/api\/sessions\/[^/]+\/calls\/([^/]+)\/recording$/);
        if (grabacion) {
            const callId = grabacion[1];
            const n = (red.pedidos.get(callId) ?? 0) + 1;
            red.pedidos.set(callId, n);
            if (n < red.listaEnElIntento) return { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) };
            return { ok: true, status: 200, arrayBuffer: async () => WAV.buffer.slice(WAV.byteOffset, WAV.byteOffset + WAV.byteLength) };
        }
        throw new Error(`el banco no esperaba esta petición: ${u} ${init?.method ?? "GET"}`);
    };

    // La espera de verdad son 30 s por vuelta. **Solo se acelera ESA**, leída
    // del propio módulo: acortar todos los temporizadores del proceso movería
    // también los de Prisma y los del corredor de pruebas.
    globalThis.setTimeout = (fn, ms, ...resto) =>
        setTimeoutDeVerdad(fn, ms === ESPERA_ENTRE_INTENTOS_MS ? 1 : ms, ...resto);
}

function desmontarLaRed() {
    globalThis.fetch = fetchDeVerdad;
    globalThis.setTimeout = setTimeoutDeVerdad;
}

/** Lee la fila de la llamada tal como la pide quien la va a pintar. */
async function laLlamada(id) {
    const fila = await db.chatMessage.findFirst({ where: { id: BigInt(id) }, select: { userId: true, instanceName: true, raw: true } });
    return { ...fila, call: fila?.raw?.call ?? {} };
}

/** Espera a que la vuelta de fondo escriba, o se rinde. */
async function hastaQueHayaTranscripcion(id, msMaximos = 8000) {
    const hasta = Date.now() + msMaximos;
    while (Date.now() < hasta) {
        const { call } = await laLlamada(id);
        if (call.transcript) return call;
        await new Promise((r) => setTimeoutDeVerdad(r, 40));
    }
    return (await laLlamada(id)).call;
}

async function creditosUsados(userId) {
    const fila = await db.iaCredit.findUnique({ where: { userId } });
    return fila?.used ?? null;
}

/* ── La siembra ─────────────────────────────────────────────────────────── */

const madre = `madre-${sello}`;
const hija = `hija-${sello}`;
const persona = `persona-${sello}`;
const proveedor = `prov-${sello}`;

test("S · siembra: una familia, la línea de la hija y quien paga", async () => {
    await db.user.create({ data: { id: madre, email: `${madre}@b.co`, name: "Grupo Verzay", role: "admin" } });
    await db.user.create({
        data: { id: hija, email: `${hija}@b.co`, name: "Verzay | Ventas", role: "user", astraCallsSid: SID },
    });
    await db.user.create({
        data: { id: persona, email: `${persona}@b.co`, name: "Sofía", role: "user", ownerId: hija, advisorRole: "administrador" },
    });
    // La madre vinculó a la hija bajo la suya: eso es lo que la hace raíz.
    await db.$executeRawUnsafe(
        `INSERT INTO "linked_accounts" ("id","master_user_id","linked_user_id") VALUES ($1,$2,$3)`,
        `lnk-${sello}`,
        madre,
        hija,
    );
    await db.instancia.create({
        data: { userId: hija, instanceId: `i-${hija}`, instanceName: LINEA, instanceType: "waha" },
    });

    // La clave de IA está en la cuenta de la LÍNEA; los créditos, en la MADRE.
    // Esa separación es justo lo que este banco viene a comprobar.
    // `AiProvider.name` es UNICO y la base del banco se reutiliza entre
    // ejecuciones: con un `create` la segunda vuelta se cae en la siembra y
    // todo lo de abajo sale rojo por algo que no tiene que ver con lo que se
    // prueba. Se busca el de produccion y solo se crea si no esta.
    const prov =
        (await db.aiProvider.findUnique({ where: { name: "openai" } })) ??
        (await db.aiProvider.create({ data: { id: proveedor, name: "openai", aiModel: "gpt-4o-mini" } }));
    await db.userAiConfig.create({ data: { userId: hija, providerId: prov.id, apiKey: "sk-de-la-hija", isActive: true } });
    await db.iaCredit.create({ data: { userId: madre, total: 1000, used: 0, renewalDate: new Date() } });
    await db.iaCredit.create({ data: { userId: hija, total: 1000, used: 0, renewalDate: new Date() } });

    // Quien llama es una PERSONA del equipo de la hija.
    ponerAQuienMira({
        id: persona,
        email: `${persona}@b.co`,
        role: "user",
        ownerId: hija,
        effectiveId: hija,
        sessionUserId: persona,
    });
    montarLaRed();
});

/* ── B. El camino MANUAL: «Llamar con IA» ───────────────────────────────── */

const TELEFONO_MANUAL = "573001110001";

/**
 * Lo que hacía `startBotCallAction` antes, literal: registraba la llamada
 * **sin el `astraSid` ni el `astraCallId`** que devuelve el servidor de
 * llamadas, y no esperaba a nada. Sin ese par no hay a quién pedirle la
 * grabación, así que la llamada no podía dejar texto **nunca** — y no fallaba
 * nada por el camino.
 */
async function comoSeRegistrabaAntes(telefono) {
    return logOutgoingCallAction(telefono, 0, false, undefined, { isBot: true });
}

test("B1 · la llamada del bot queda registrada con su `astraSid` y su `astraCallId`", async () => {
    const r = ROTO
        ? await comoSeRegistrabaAntes(TELEFONO_MANUAL)
        : await startBotCallAction(TELEFONO_MANUAL, LINEA);

    if (!ROTO) assert.equal(r.success, true, r.message);

    const fila = await db.chatMessage.findFirst({
        where: { messageType: "call", content: "Llamada con IA realizada" },
        orderBy: { id: "desc" },
        select: { id: true, userId: true, instanceName: true, raw: true },
    });
    assert.ok(fila, "no se escribió ninguna fila de llamada");
    globalThis.__filaManual = String(fila.id);

    const call = fila.raw?.call ?? {};
    if (ROTO) {
        assert.equal(call.astraCallId, undefined, "el modo roto tiene que registrar la llamada sin el id");
        assert.equal(call.astraSid, undefined);
    } else {
        assert.equal(call.astraSid, SID, "sin el sid no hay a quién pedirle la grabación");
        assert.ok(call.astraCallId, "sin el id de la llamada la grabación no se puede pedir nunca");
        assert.equal(fila.userId, hija, "la llamada se anota bajo la cuenta dueña de la línea");
        assert.equal(fila.instanceName, LINEA);
    }
});

test("B2 · al colgar quedan Transcripción y Resumen en ESA llamada", async () => {
    const id = globalThis.__filaManual;
    const call = ROTO ? (await laLlamada(id)).call : await hastaQueHayaTranscripcion(id);

    if (ROTO) {
        assert.equal(call.transcript ?? null, null, "el modo roto tiene que quedarse sin transcripción");
        assert.equal(call.summary ?? null, null);
        return;
    }

    assert.ok(call.transcript?.includes("Cliente:"), "la llamada sigue sin Transcripción");
    assert.ok(call.summary?.includes("Próximo paso"), "la llamada sigue sin Resumen IA");
    assert.equal(call.durationSecs, SEGUNDOS, "la duración se completa con la del propio WAV");
    assert.equal(call.hasRecording, true);

    // Y se pidió con la clave de la cuenta de la LÍNEA, por su proveedor.
    const pedidos = loQueSeLePidioALaIa();
    assert.ok(pedidos.some((p) => p.que === "transcribir"), "no se llegó a transcribir");
    assert.ok(pedidos.some((p) => p.que === "resumir"), "no se llegó a resumir");
});

test("B3 · la grabación se pidió VARIAS veces: no existe hasta que alguien cuelga", async () => {
    if (ROTO) {
        assert.equal(red.pedidos.size, 0, "el modo roto no llega ni a pedir la grabación");
        return;
    }
    const intentos = [...red.pedidos.values()].reduce((a, b) => a + b, 0);
    assert.ok(intentos >= red.listaEnElIntento, `solo se pidió ${intentos} vez/veces`);
    assert.ok(INTENTOS_DE_GRABACION >= 60, "la ventana tiene que cubrir una conversación entera");
});

/* ── C. El camino del FLUJO: `AI_CALL` por la ruta interna ──────────────── */

const TELEFONO_FLUJO = "573001110002";
const MENSAJE_FLUJO = `callout_${sello}_${TELEFONO_FLUJO}`;
const CALL_FLUJO = `call-flujo-${sello}`;

test("C0 · el backend deja la fila de la llamada, como la deja hoy", async () => {
    // Es exactamente lo que escribe `registrarLlamadaIa` del backend: la ruta
    // la busca por `(userId, instanceName, messageId, fromMe)`.
    await db.chatMessage.create({
        data: {
            userId: hija,
            instanceName: LINEA,
            instanceType: "evolution",
            remoteJid: `${TELEFONO_FLUJO}@s.whatsapp.net`,
            messageId: MENSAJE_FLUJO,
            fromMe: true,
            messageType: "call",
            content: "Llamada con IA realizada",
            raw: {
                call: {
                    direction: "outgoing",
                    isVideo: false,
                    durationSecs: 0,
                    isBot: true,
                    provider: "astra",
                    astraSid: SID,
                    astraCallId: CALL_FLUJO,
                },
            },
            messageTimestamp: new Date(),
        },
    });
    // Esta conversación es larga: la grabación no está lista hasta la vuelta 15.
    red.listaEnElIntento = 15;
});

/**
 * El sondeo VIEJO del backend, literal: **diez vueltas de 20 s** contadas
 * desde que la llamada se LANZA, y solo entonces avisaba a la App. Una
 * conversación de más de tres minutos agotaba las diez estando todavía en
 * curso, así que la grabación quedaba lista justo después de que nadie la
 * mirara — y no avisaba a nadie.
 */
async function comoEsperabaElBackendAntes(sid, callId) {
    const INTENTOS = 10;
    for (let i = 0; i < INTENTOS; i++) {
        await new Promise((r) => setTimeoutDeVerdad(r, 1)); // 20_000 en producción
        const resp = await globalThis.fetch(
            `${process.env.ASTRACALLS_URL}/api/sessions/${sid}/calls/${callId}/recording`,
            { headers: { "X-API-Key": process.env.ASTRACALLS_API_KEY } },
        );
        const bytes = resp.ok ? (await resp.arrayBuffer()).byteLength : 0;
        if (bytes < 64) continue;
        return true; // aquí es donde avisaba a la App
    }
    return false;
}

function peticionDeLaRuta(cuerpo, secreto = "banco") {
    return new Request("http://localhost/api/calls/process-bot-recording", {
        method: "POST",
        headers: { "content-type": "application/json", "x-internal-secret": secreto },
        body: JSON.stringify(cuerpo),
    });
}

test("C1 · sin el secreto interno la ruta no contesta nada", async () => {
    const res = await pedirLaTranscripcion(peticionDeLaRuta({}, "otro"));
    assert.equal(res.status, 401);
});

test("C2 · el flujo deja Transcripción y Resumen en su llamada", async () => {
    const fila = await db.chatMessage.findFirst({
        where: { userId: hija, messageId: MENSAJE_FLUJO },
        select: { id: true },
    });
    assert.ok(fila);

    if (ROTO) {
        const aviso = await comoEsperabaElBackendAntes(SID, CALL_FLUJO);
        assert.equal(aviso, false, "el modo roto tiene que rendirse antes de que la grabación exista");
        const { call } = await laLlamada(String(fila.id));
        assert.equal(call.transcript ?? null, null, "sin aviso no hay transcripción, y nadie dice por qué");
        return;
    }

    const res = await pedirLaTranscripcion(
        peticionDeLaRuta({
            userId: hija,
            instanceName: LINEA,
            messageId: MENSAJE_FLUJO,
            astraSid: SID,
            astraCallId: CALL_FLUJO,
            esperar: true,
        }),
    );
    assert.equal(res.status, 202, "la ruta tiene que aceptar y esperar de fondo");
    assert.deepEqual(await res.json(), { success: true, esperando: true });

    const call = await hastaQueHayaTranscripcion(String(fila.id));
    assert.ok(call.transcript, "la llamada del flujo sigue sin Transcripción");
    assert.ok(call.summary, "la llamada del flujo sigue sin Resumen IA");
});

test("C3 · una llamada que no existe se dice, no se traga", async () => {
    const res = await pedirLaTranscripcion(
        peticionDeLaRuta({
            userId: hija,
            instanceName: LINEA,
            messageId: "callout_no_existe",
            astraSid: SID,
            astraCallId: "x",
        }),
    );
    assert.deepEqual(await res.json(), { success: false, message: "Llamada no encontrada." });
});

/* ── D. Los créditos ────────────────────────────────────────────────────── */

test("D1 · paga la CUENTA madre, no la de la línea y no la persona", async () => {
    const usadosMadre = await creditosUsados(madre);
    const usadosHija = await creditosUsados(hija);

    if (ROTO) {
        // Nada se transcribió, así que nada se cobró — que es la otra mitad
        // del fallo: la llamada no deja texto y tampoco deja rastro de gasto.
        assert.equal(usadosMadre, 0);
        assert.equal(usadosHija, 0);
        return;
    }

    const esperado = costoDeLaNota(SEGUNDOS).tokens * 2; // la manual y la del flujo
    assert.equal(usadosMadre, esperado, "no se le cobró a la cuenta que paga");
    assert.equal(usadosHija, 0, "se le cobró a la cuenta de la línea en vez de a la madre");
});

test("D2 · la PERSONA no tiene bolsa: cobrarle a ella no descuenta nada", async () => {
    assert.equal(await db.iaCredit.findUnique({ where: { userId: persona } }), null);

    const antesMadre = await creditosUsados(madre);
    const antesHija = await creditosUsados(hija);
    // Es lo que haría cobrarle a quien está sentado delante: `updateMany` sobre
    // una fila que no existe **toca cero filas y no dice nada**.
    await descontarLaTranscripcion(persona, 9999);
    assert.equal(await creditosUsados(madre), antesMadre, "el cobro a la persona movió la bolsa de la cuenta");
    assert.equal(await creditosUsados(hija), antesHija);
});

test("D3 · una segunda vuelta no vuelve a cobrar", async () => {
    if (ROTO) return;
    const id = globalThis.__filaManual;
    const antes = await creditosUsados(madre);
    olvidarLoPedido();

    const res = await processCallRecordingForUser({
        userId: hija,
        chatMessageId: id,
        astraSid: SID,
        astraCallId: (await laLlamada(id)).call.astraCallId,
    });
    assert.equal(res.success, true);
    assert.equal(await creditosUsados(madre), antes, "la segunda vuelta volvió a cobrar");
    assert.deepEqual(loQueSeLePidioALaIa(), [], "ni siquiera se le volvió a preguntar a la IA");
});

/* ── E. El nombre de la marca en lo que se GUARDA ───────────────────────── */

const TELEFONO_MARCA = "573001110003";
const CALL_MARCA = `call-marca-${sello}`;
const LO_QUE_OYE_WHISPER =
    "Operador: buenas, le habla Bersi de Versailles.\nCliente: hola, sí, me interesa lo de Versalles.";

test("E1 · la regla es pura y solo toca los dos nombres de la casa", () => {
    assert.equal(
        conElNombreDeLaMarca("Hola, soy Bersi de Versailles"),
        "Hola, soy Verzy de Verzay",
    );
    // Con tilde, que es como Whisper las escribe la mitad de las veces.
    assert.equal(conElNombreDeLaMarca("Bersí de Versáilles"), "Verzy de Verzay");
    // Y NADA más se toca: ni la frase, ni una palabra que solo empiece igual.
    assert.equal(
        conElNombreDeLaMarca("El tratado de Versallesco cuesta 300 versos"),
        "El tratado de Versallesco cuesta 300 versos",
    );
    assert.equal(conElNombreDeLaMarca(""), "");
    assert.equal(conElNombreDeLaMarca(null), "");
});

test("E2 · lo que se GUARDA dice «Verzy, de Verzay» aunque la IA diga otra cosa", async () => {
    // La grabación de esta llamada ya está lista: lo que se prueba aquí es el
    // guardado, no la espera —eso es B3—.
    red.pedidos.set(CALL_MARCA, red.listaEnElIntento);
    olvidarLoPedido();
    ponerLoQueDiceLaIa({
        transcripcion: LO_QUE_OYE_WHISPER,
        resumen: "- Bersi de Versailles presentó la plataforma.\nPróximo paso: Hacer seguimiento.",
    });

    const reg = await logOutgoingCallAction(
        TELEFONO_MARCA,
        0,
        false,
        undefined,
        { isBot: true, provider: "astra", astraSid: SID, astraCallId: CALL_MARCA },
        LINEA,
    );
    assert.ok(reg.id, "no se registró la llamada de esta prueba");

    const res = await processCallRecordingForUser({
        userId: reg.userId ?? hija,
        chatMessageId: reg.id,
        astraSid: SID,
        astraCallId: CALL_MARCA,
    });
    assert.equal(res.success, true, res.message);

    const { call } = await laLlamada(reg.id);

    // La mitad que de verdad prueba algo: lo que devolvió el modelo SÍ traía
    // las formas rotas, así que lo limpio de la fila solo puede venir del
    // guardado. Sin esta comprobación, el banco saldría verde con un doble
    // que devolviera el texto ya bien escrito.
    assert.ok(LO_QUE_OYE_WHISPER.includes("Versailles"), "la IA de mentira tiene que decirlo mal");

    assert.ok(call.transcript.includes("Verzy de Verzay"), `salió: ${call.transcript}`);
    assert.ok(!/versailles|versalles|bersi/i.test(call.transcript), `quedó sin corregir: ${call.transcript}`);
    assert.ok(!/versailles|bersi/i.test(call.summary), `el resumen quedó sin corregir: ${call.summary}`);
    // Y lo que no era el nombre de la casa se queda tal cual.
    assert.ok(call.transcript.includes("me interesa lo de Verzay"));
});

test("E3 · y la petición lleva el vocabulario, para que acierte de entrada", () => {
    const pedido = loQueSeLePidioALaIa().find((p) => p.que === "transcribir");
    assert.ok(pedido, "no se llegó a transcribir");
    assert.equal(
        pedido.pista,
        PISTA_DE_VOCABULARIO,
        "sin el vocabulario, la red de abajo tiene que trabajar siempre",
    );
    assert.ok(PISTA_DE_VOCABULARIO.includes("Verzay"));
    assert.ok(PISTA_DE_VOCABULARIO.includes("Verzy"));
});

test("Z · se recoge la siembra", async () => {
    desmontarLaRed();
    await db.$disconnect();
});
