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
    procesarElFinDeLaLlamada,
    proponerElResultado,
    setCallDisposition,
    getCallDetailAction,
    getDispositionMeta,
    CALL_DISPOSITIONS,
    avisarDelFinDeLaLlamada,
    queHacerConLaGrabacion,
    porQueNoSeTranscribio,
    TOPE_DE_BYTES_DE_AUDIO,
    TOPE_DE_TROZOS,
    trozosDeWav,
    cuantosTrozos,
    segundosDelWav,
    elFormatoDelWav,
    costoDeLaNota,
    TOKENS_POR_CREDITO,
    conElNombreDeLaMarca,
    PISTA_DE_VOCABULARIO,
    descontarLaTranscripcion,
    elMotivoDeLaGrabacion,
    laMarcaDeLaLlamada,
    loQueSeEnsenaDeLaLlamada,
    sePuedeReintentar,
    valeLaPenaSeguirEsperando,
    porQueNoSalioLaNota,
    reintentarLaTranscripcionAction,
    queLeFaltaALaLlamada,
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

/**
 * Lo INABARCABLE de verdad, que ya no son 25 MB.
 *
 * Pasarse del tope de una petición de OpenAI dejó de ser el final del camino:
 * el audio es PCM y se corta (`trozosDeWav`), así que lo único que se abandona
 * es lo que no cabe ni en `TOPE_DE_TROZOS` trozos. Este número es el que hay
 * que usar aquí: con `TOPE_DE_BYTES_DE_AUDIO + 1` —que es lo que decía este
 * banco antes— la grabación se transcribe en dos partes, y el caso que se
 * venía a ejercer no se ejerce.
 */
const INABARCABLE = TOPE_DE_TROZOS * TOPE_DE_BYTES_DE_AUDIO + 1;

test("A2 · lo que no cabe ni a trozos no se cobra ni se intenta, y se dice el peso", () => {
    const que = queHacerConLaGrabacion({
        segundos: 36000,
        bytes: INABARCABLE,
        creditosDisponibles: 100000,
    });
    assert.equal(que.hacer, "demasiado_grande");
    const motivo = porQueNoSeTranscribio(que);
    assert.ok(motivo?.includes("MB"), "el aviso tiene que decir cuánto pesa");
    assert.ok(motivo?.includes("minutos"), "y cuánto es lo que sí cabe");
});

test("A3 · el tamaño se mira ANTES que los créditos", () => {
    // Con las dos cosas mal, decir «sin créditos» manda a recargar para nada:
    // con créditos tampoco se habría transcrito.
    const que = queHacerConLaGrabacion({
        segundos: 36000,
        bytes: INABARCABLE,
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

/* ── A5-A7. El corte del WAV ────────────────────────────────────────────── */

// `wavDe` se declara más abajo, con la red fingida. Es una declaración de
// función, así que está izada: aquí se usa a propósito para no tener dos
// generadores de WAV en el mismo banco.

test("A5 · un WAV que CABE sale tal cual; uno que no, sale en trozos válidos", () => {
    const wav = wavDe(30); // 1,92 MB: 64.000 bytes por segundo
    assert.deepEqual(trozosDeWav(wav, wav.length), [wav], "lo que ya cabe no se toca");
    assert.deepEqual(trozosDeWav(wav, wav.length + 1), [wav]);

    // Con un tope pequeño se ejerce el corte sin reservar 25 MB de memoria.
    const TOPE = 100_000;
    const trozos = trozosDeWav(wav, TOPE);
    assert.ok(trozos.length > 1, "no llegó a cortarse");

    const entero = elFormatoDelWav(wav);
    let suma = 0;
    for (const t of trozos) {
        assert.ok(t.length <= TOPE, `un trozo se pasó del tope: ${t.length}`);
        const f = elFormatoDelWav(t);
        assert.ok(f, "un trozo salió sin un encabezado que se pueda leer");
        // Mismo formato que el original: quien lo reciba tiene que poder
        // decodificarlo igual.
        assert.equal(f.canales, entero.canales);
        assert.equal(f.sampleRate, entero.sampleRate);
        assert.equal(f.bitsPorMuestra, entero.bitsPorMuestra);
        // Y el corte va alineado a una muestra entera. Cortando por la mitad
        // de una, el trozo siguiente sale con los canales cambiados de sitio y
        // se oye como ruido — sin dar ningún error: solo una transcripción
        // mala, que es peor.
        assert.equal(f.bytesDeDatos % f.bytesPorMuestra, 0, "el corte partió una muestra");
        suma += f.bytesDeDatos;
    }
    assert.equal(suma, entero.bytesDeDatos, "cortar perdió o duplicó audio");
});

test("A6 · lo que no se entiende sale ENTERO, no en pedazos", () => {
    // Una grabación de Meta es webm, no un WAV que se pueda cortar por bytes.
    // Equivocarse hacia «no lo toco» manda un audio que quizá se rechace;
    // equivocarse hacia «lo corto igual» manda basura que seguro no se entiende.
    const otraCosa = Buffer.alloc(500_000, 7);
    assert.deepEqual(trozosDeWav(otraCosa, 100_000), [otraCosa]);
    assert.equal(elFormatoDelWav(otraCosa), null);
});

test("A7 · pasar de 25 MB ya NO es abandonar: se transcribe por partes", () => {
    // Es el caso de la llamada con IA de varios minutos, que es el normal:
    // 64.000 bytes por segundo, así que a los 6 min 49 s ya no cabe en una
    // petición. Antes eso era un abandono FIRME y además se llevaba por
    // delante la duración.
    const bytes = TOPE_DE_BYTES_DE_AUDIO + 1;
    assert.equal(cuantosTrozos(bytes, TOPE_DE_BYTES_DE_AUDIO), 2);

    const que = queHacerConLaGrabacion({ segundos: 900, bytes, creditosDisponibles: 100000 });
    assert.equal(que.hacer, "transcribir", "una llamada larga tiene que poder transcribirse");
    assert.equal(que.trozos, 2);
    // Y cuesta lo mismo: se cobra por SEGUNDOS, y los segundos son los mismos
    // se mande en una petición o en dos.
    assert.deepEqual(que.costo, costoDeLaNota(900));

    assert.equal(cuantosTrozos(1, TOPE_DE_BYTES_DE_AUDIO), 1, "lo que cabe es un solo trozo");
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
    /**
     * El WAV de una llamada concreta, cuando no es el de siempre. Hace falta
     * para ejercer una conversación larga —la que se pasa de los 25 MB— sin
     * que todas las demás paguen esa memoria.
     */
    wavPorLlamada: new Map(),
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
            const wav = red.wavPorLlamada.get(callId) ?? WAV;
            return { ok: true, status: 200, arrayBuffer: async () => wav.buffer.slice(wav.byteOffset, wav.byteOffset + wav.byteLength) };
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

test("D1 · paga la CUENTA dueña de la conversación, no la madre y no la persona", async () => {
    // Los créditos de una llamada salen de la cuenta dueña de la línea por la
    // que se habló —Ventas por Ventas—, nunca de la madre que mira desde
    // arriba y nunca de la persona.
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
    assert.equal(usadosHija, esperado, "no se le cobró a la cuenta dueña de la conversación");
    assert.equal(usadosMadre, 0, "se le cobró a la madre una llamada de la hija");
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
    const antes = await creditosUsados(hija);
    olvidarLoPedido();

    const res = await processCallRecordingForUser({
        userId: hija,
        chatMessageId: id,
        astraSid: SID,
        astraCallId: (await laLlamada(id)).call.astraCallId,
    });
    assert.equal(res.success, true);
    assert.equal(await creditosUsados(hija), antes, "la segunda vuelta volvió a cobrar");
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

/* ── F. El aviso de FIN DE LLAMADA ──────────────────────────────────────── */

/*
 * Hasta ahora **no existía ningún aviso de fin**: la plataforma lanzaba la
 * llamada y se ponía a sondear la grabación desde una promesa suelta dentro de
 * una petición. Con decenas de despliegues al día esa promesa se muere sin
 * dejar rastro, y desde fuera eso se ve como lo que se reportó: la llamada
 * sale, se habla varios minutos, se cuelga, y en CRM › Llamadas **no queda ni
 * la duración**.
 *
 * El camino es AstraCalls → backend → esta ruta, y lo que se prueba aquí es la
 * mitad de la App: que el aviso encuentra su fila por el par `(sid, callId)` y
 * que **escribe la duración antes de decidir nada más**.
 */

const TELEFONO_FIN = "573001110004";
const CALL_SIN_CREDITOS = `call-sincred-${sello}`;
const CALL_FIN = `call-fin-${sello}`;

function avisoDelFin(cuerpo, secreto = "banco") {
    return new Request("http://localhost/api/calls/call-ended", {
        method: "POST",
        headers: { "content-type": "application/json", "x-internal-secret": secreto },
        body: JSON.stringify(cuerpo),
    });
}

/** Espera a que la vuelta de fondo escriba la duración, o se rinde. */
async function hastaQueHayaDuracion(id, msMaximos = 8000) {
    const hasta = Date.now() + msMaximos;
    while (Date.now() < hasta) {
        const { call } = await laLlamada(id);
        if (Number(call.durationSecs ?? 0) > 0) return call;
        await new Promise((r) => setTimeoutDeVerdad(r, 40));
    }
    return (await laLlamada(id)).call;
}

/**
 * El camino VIEJO, literal: bajar la grabación, calcular la duración… y
 * **volverse sin escribirla** cuando la transcripción se abandona.
 *
 * El único `UPDATE` de la función estaba al final, en la rama de transcribir,
 * así que cualquier abandono —sin créditos, sin clave de IA, demasiado
 * grande— se llevaba por delante un dato que ya se tenía en la mano y que no
 * cuesta nada. Y el abandono más común era justamente el de una llamada con
 * IA de varios minutos.
 */
async function comoSeProcesabaAntes(sid, callId, creditosDisponibles) {
    const resp = await globalThis.fetch(
        `${process.env.ASTRACALLS_URL}/api/sessions/${sid}/calls/${callId}/recording`,
        { headers: { "X-API-Key": process.env.ASTRACALLS_API_KEY } },
    );
    if (!resp.ok) return { success: false, message: "Grabación no disponible aún." };
    const audio = Buffer.from(await resp.arrayBuffer());
    if (audio.length < 64) return { success: false, message: "Grabación no disponible aún." };

    const duracion = segundosDelWav(audio); // ya la tenía delante
    const que = laDecisionDeAntes(duracion, audio.length, creditosDisponibles);
    if (que.hacer !== "transcribir") {
        // Y aquí se volvía SIN ESCRIBIR NADA. Ese `return` es el fallo entero.
        return { success: false, message: que.motivo };
    }
    return { success: true, duracion };
}

/**
 * Y la decisión de ANTES, también literal: el tope de una petición de OpenAI
 * era el FINAL del camino, no el tamaño de un trozo.
 *
 * Se escribe aquí en vez de llamar a `queHacerConLaGrabacion`, que es la de
 * hoy: con la función nueva el modo roto diría «transcribir» y el caso que
 * viene a reproducir no se reproduciría.
 */
function laDecisionDeAntes(segundos, bytes, creditosDisponibles) {
    if (bytes > TOPE_DE_BYTES_DE_AUDIO) {
        const mb = Math.round((bytes / (1024 * 1024)) * 10) / 10;
        return { hacer: "demasiado_grande", motivo: `La grabación pesa ${mb} MB y no se puede transcribir.` };
    }
    const costo = costoDeLaNota(segundos);
    if (creditosDisponibles !== null && creditosDisponibles < costo.creditos) {
        return {
            hacer: "sin_creditos",
            motivo: `Sin créditos suficientes para transcribir: cuesta ${costo.creditos} y quedan ${creditosDisponibles}.`,
        };
    }
    return { hacer: "transcribir" };
}

/** Deja a la cuenta que paga sin un solo crédito, y devuelve cómo estaba. */
async function dejarSinCreditos(userId) {
    const antes = await db.iaCredit.findUnique({ where: { userId } });
    await db.iaCredit.update({
        where: { userId },
        data: { used: (antes?.total ?? 0) * TOKENS_POR_CREDITO + TOKENS_POR_CREDITO },
    });
    return antes?.used ?? 0;
}

test("F1 · sin el secreto interno el aviso de fin no contesta nada", async () => {
    const res = await avisarDelFinDeLaLlamada(avisoDelFin({ sid: SID, callId: "x" }, "otro"));
    assert.equal(res.status, 401);
});

test("F2 · un aviso sin `sid` o sin `callId` no se da por bueno", async () => {
    const res = await avisarDelFinDeLaLlamada(avisoDelFin({ sid: SID }));
    assert.equal(res.status, 400);
});

test("F3 · una llamada que no está en la base se DICE, y no escribe nada", async () => {
    const antes = await db.chatMessage.count({ where: { messageType: "call" } });

    const res = await avisarDelFinDeLaLlamada(
        avisoDelFin({ sid: SID, callId: `no-existe-${sello}`, durationSecs: 120 }),
    );
    assert.equal(res.status, 404);
    assert.deepEqual(await res.json(), { success: false, message: "Llamada no encontrada." });

    assert.equal(
        await db.chatMessage.count({ where: { messageType: "call" } }),
        antes,
        "un aviso huérfano no puede inventarse una fila",
    );
});

test("F4 · la DURACIÓN se escribe aunque la transcripción se abandone", async () => {
    // Es el síntoma que se reportó: la llamada se completa y la columna
    // Duración se queda en guion. Aquí el abandono se provoca por créditos,
    // que es el más fácil de montar; el efecto es el mismo con cualquiera de
    // los otros tres.
    red.pedidos.set(CALL_SIN_CREDITOS, red.listaEnElIntento);
    const reg = await logOutgoingCallAction(
        TELEFONO_FIN,
        0,
        false,
        undefined,
        { isBot: true, provider: "astra", astraSid: SID, astraCallId: CALL_SIN_CREDITOS },
        LINEA,
    );
    assert.ok(reg.id);
    assert.equal((await laLlamada(reg.id)).call.durationSecs, 0, "la del bot nace en cero: nadie la midió");

    const usadosAntes = await dejarSinCreditos(hija);
    olvidarLoPedido();

    if (ROTO) {
        const r = await comoSeProcesabaAntes(SID, CALL_SIN_CREDITOS, 0);
        assert.equal(r.success, false, "el modo roto tiene que abandonar por créditos");
        assert.ok(r.message?.includes("créditos"));
        const { call } = await laLlamada(reg.id);
        assert.equal(call.durationSecs, 0, "el modo roto tiene que PERDER la duración que ya tenía");
        assert.equal(call.transcript ?? null, null);
    } else {
        const res = await avisarDelFinDeLaLlamada(avisoDelFin({ sid: SID, callId: CALL_SIN_CREDITOS }));
        assert.equal(res.status, 202, "el aviso tiene que aceptarse y seguir de fondo");

        const call = await hastaQueHayaDuracion(reg.id);
        assert.equal(call.durationSecs, SEGUNDOS, "la duración se perdió con la transcripción");
        assert.equal(call.hasRecording, true);
        // Y NO se transcribió: eso es lo que hace que el caso se esté
        // ejerciendo de verdad y no por el camino feliz.
        assert.equal(call.transcript ?? null, null);
        assert.deepEqual(loQueSeLePidioALaIa(), [], "sin créditos no se le pregunta a la IA");
    }

    await db.iaCredit.update({ where: { userId: hija }, data: { used: usadosAntes } });
});

test("F5 · el aviso encuentra la fila por `(sid, callId)` y deja las tres cosas", async () => {
    // Lo único que sabe el servidor de llamadas al colgar es su sesión y el id
    // de la llamada: ni la cuenta, ni la línea, ni el `messageId` con el que se
    // escribió la fila. Si hiciera falta cualquiera de esos tres, el aviso no
    // se podría mandar desde donde se manda.
    red.pedidos.set(CALL_FIN, red.listaEnElIntento);
    olvidarLoPedido();
    ponerLoQueDiceLaIa({
        transcripcion: "Operador: le llamo del taller.\nCliente: sí, dígame.",
        resumen: "- Se acordó la revisión.\nPróximo paso: Confirmar la cita.",
    });

    const reg = await logOutgoingCallAction(
        TELEFONO_FIN,
        0,
        false,
        undefined,
        { isBot: true, provider: "astra", astraSid: SID, astraCallId: CALL_FIN },
        LINEA,
    );
    assert.ok(reg.id);

    const res = await avisarDelFinDeLaLlamada(
        avisoDelFin({ sid: SID, callId: CALL_FIN, durationSecs: 187, hasRecording: true }),
    );
    assert.equal(res.status, 202);
    assert.deepEqual(await res.json(), { success: true });

    // La duración ya está escrita ANTES de que vuelva nada de la IA: el aviso
    // la deja en la fila y solo entonces contesta.
    assert.equal(
        (await laLlamada(reg.id)).call.durationSecs,
        187,
        "el aviso tiene que escribir la duración antes de contestar",
    );

    const call = await hastaQueHayaTranscripcion(reg.id);
    assert.ok(call.transcript?.includes("del taller"), "la llamada se quedó sin Transcripción");
    assert.ok(call.summary?.includes("Confirmar la cita"), "la llamada se quedó sin Resumen IA");
    // Lo que dijo el proveedor manda sobre lo que mida el WAV: la grabación
    // empieza cuando se contesta, y 187 es lo que duró la llamada.
    assert.equal(call.durationSecs, 187, "la duración del aviso se perdió por el camino");
});

test("F6 · un aviso sin grabación se anota y NO se pone a sondear", async () => {
    const callId = `call-sin-audio-${sello}`;
    const reg = await logOutgoingCallAction(
        "573001110005",
        0,
        false,
        undefined,
        { isBot: true, provider: "astra", astraSid: SID, astraCallId: callId },
        LINEA,
    );
    assert.ok(reg.id);

    const res = await avisarDelFinDeLaLlamada(
        avisoDelFin({ sid: SID, callId, durationSecs: 12, hasRecording: false }),
    );
    assert.equal(res.status, 202);
    assert.deepEqual(await res.json(), { success: true, message: "Sin grabación." });

    const { call } = await laLlamada(reg.id);
    assert.equal(call.durationSecs, 12, "una llamada sin audio también dejó su duración");
    assert.equal(call.hasRecording, false);
    assert.equal(
        red.pedidos.get(callId) ?? 0,
        0,
        "sondear media hora un audio que ya dijeron que no existe es tener el bucle vivo para nada",
    );
});

/* ── G. Una llamada LARGA: más de 25 MB ─────────────────────────────────── */

const SEGUNDOS_LARGA = 500; // 32 MB a 64.000 bytes por segundo
const CALL_LARGA = `call-larga-${sello}`;

/**
 * La regla de ANTES, literal: el tope de una petición de OpenAI era el final
 * del camino. Con 64.000 bytes por segundo eso son 6 min 49 s, así que una
 * llamada con IA de varios minutos —el caso normal— se abandonaba entera.
 */
function laReglaDeAntes(bytes) {
    return laDecisionDeAntes(1, bytes, 100000).hacer;
}

test("G1 · media hora de conversación no cabe en una petición, y antes eso era el final", () => {
    const largo = wavDe(SEGUNDOS_LARGA);
    assert.ok(largo.length > TOPE_DE_BYTES_DE_AUDIO, "el WAV de la prueba tiene que pasarse del tope");
    assert.equal(laReglaDeAntes(largo.length), "demasiado_grande");
    assert.equal(trozosDeWav(largo, TOPE_DE_BYTES_DE_AUDIO).length, 2);
    assert.equal(
        queHacerConLaGrabacion({
            segundos: SEGUNDOS_LARGA,
            bytes: largo.length,
            creditosDisponibles: 100000,
        }).hacer,
        "transcribir",
    );
});

test("G2 · y se transcribe POR TROZOS, sin perder ni la duración ni el texto", async () => {
    const largo = wavDe(SEGUNDOS_LARGA);
    red.wavPorLlamada.set(CALL_LARGA, largo);
    red.pedidos.set(CALL_LARGA, red.listaEnElIntento);
    olvidarLoPedido();
    ponerLoQueDiceLaIa({
        transcripcion: "Cliente: seguimos con el pedido.",
        resumen: "- Pedido en curso.\nPróximo paso: Enviar la cotización.",
    });

    const reg = await logOutgoingCallAction(
        "573001110006",
        0,
        false,
        undefined,
        { isBot: true, provider: "astra", astraSid: SID, astraCallId: CALL_LARGA },
        LINEA,
    );
    assert.ok(reg.id);

    if (ROTO) {
        const r = await comoSeProcesabaAntes(SID, CALL_LARGA, 100000);
        assert.equal(r.success, false, "el modo roto tiene que abandonar por tamaño");
        assert.ok(r.message?.includes("MB"));
        const { call } = await laLlamada(reg.id);
        assert.equal(call.durationSecs, 0, "y además perdía la duración");
        assert.equal(call.transcript ?? null, null);
        return;
    }

    const res = await procesarElFinDeLaLlamada({ astraSid: SID, astraCallId: CALL_LARGA });
    assert.equal(res.success, true, res.message);

    const call = await hastaQueHayaTranscripcion(reg.id);
    assert.equal(call.durationSecs, SEGUNDOS_LARGA, "la duración sale del propio WAV");

    const transcribir = loQueSeLePidioALaIa().filter((p) => p.que === "transcribir");
    assert.equal(transcribir.length, 2, "la grabación tenía que ir en dos peticiones");
    // Y los dos textos se pegan en orden: perder uno sería una transcripción a
    // medias, que no se lee como incompleta — se lee como completa.
    assert.equal(call.transcript.split("seguimos con el pedido").length - 1, 2);
    assert.ok(call.summary?.includes("Enviar la cotización"));
});

/* ── H. El resultado lo propone la IA, y la persona manda ─────────────── */

/**
 * Siembra una llamada ya procesada —con su transcripción y su resumen— para
 * probar el resultado sin volver a pasar por la grabación.
 */
async function unaLlamadaProcesada(nombre, callExtra = {}) {
    const fila = await db.chatMessage.create({
        data: {
            userId: hija,
            instanceName: LINEA,
            instanceType: "evolution",
            remoteJid: `57300999${nombre.length}${Math.floor(Math.random() * 1e4)}@s.whatsapp.net`,
            messageId: `res-${nombre}-${sello}-${Math.random().toString(36).slice(2, 8)}`,
            fromMe: true,
            messageType: "call",
            content: "Llamada con IA realizada",
            raw: {
                call: {
                    direction: "outgoing",
                    durationSecs: 95,
                    isBot: true,
                    transcript: "Agente: hola.\nCliente: hola.",
                    summary: "- Conversación corta.",
                    ...callExtra,
                },
            },
            messageTimestamp: new Date(),
        },
    });
    return fila.id;
}

test("H1 · al colgar, la IA PROPONE el resultado a partir de la transcripción", async () => {
    if (ROTO) return; // el modo roto de este banco no llega a transcribir (B2)
    const { call } = await laLlamada(globalThis.__filaManual);
    assert.ok(
        loQueSeLePidioALaIa().some((p) => p.que === "clasificar") || call.dispositionIa,
        "no se le pidió a la IA que clasificara",
    );
    assert.equal(call.dispositionIa, "interesado", "la propuesta de la IA no quedó guardada");
    assert.equal(call.disposition, "interesado", "la propuesta no quedó visible como resultado");
    assert.equal(call.dispositionSource, "ia");
    // Y proponer no se lleva la transcripción: es un merge, no una reescritura.
    assert.ok(call.transcript, "proponer el resultado borró la transcripción");
});

test("H2 · los CINCO resultados se proponen, y cada uno se ve con su rótulo", async () => {
    assert.deepEqual(
        CALL_DISPOSITIONS.map((d) => d.label),
        ["Interesado", "Link enviado", "Volver a llamar", "No contesta", "No interesado"],
    );
    for (const d of CALL_DISPOSITIONS) {
        const id = await unaLlamadaProcesada(d.value);
        await proponerElResultado(id, d.value);
        const { call } = await laLlamada(id);
        assert.equal(call.disposition, d.value, `la IA no dejó «${d.label}»`);
        assert.equal(call.dispositionSource, "ia");
        assert.equal(getDispositionMeta(call.disposition)?.label, d.label);
    }
});

test("H3 · la corrección MANUAL manda: la IA ya no la pisa, y su propuesta se conserva aparte", async () => {
    const id = await unaLlamadaProcesada("manual");
    await proponerElResultado(id, "interesado");
    const r = await setCallDisposition(String(id), "volver_llamar");
    assert.equal(r.success, true, r.message);

    // La IA vuelve a proponer —un reproceso, un reintento del aviso—.
    await proponerElResultado(id, "link_enviado");
    const { call } = await laLlamada(id);
    assert.equal(call.disposition, "volver_llamar", "la IA pisó lo que eligió la persona");
    assert.equal(call.dispositionSource, "manual");
    assert.equal(call.dispositionIa, "link_enviado", "la última propuesta se guarda aparte");
    assert.ok(call.transcript && call.summary, "marcar el resultado borró el texto de la llamada");

    // Y el detalle fresco del diálogo trae lo mismo que la base.
    const detalle = await getCallDetailAction(String(id));
    assert.equal(detalle?.disposition, "volver_llamar");
    assert.equal(detalle?.dispositionSource, "manual");
    assert.ok(detalle?.transcript && detalle?.summary, "el detalle no trae resumen y transcripción");
});

test("H4 · un resultado de ANTES (sin origen) cuenta como puesto a mano", async () => {
    const id = await unaLlamadaProcesada("antes", { disposition: "agendo" });
    await proponerElResultado(id, "no_interesado");
    const { call } = await laLlamada(id);
    assert.equal(call.disposition, "agendo", "la IA reescribió un resultado que marcó una persona");
    assert.equal(getDispositionMeta(call.disposition)?.label, "Link enviado", "«Agendó» se lee como Link enviado");
    assert.equal(getDispositionMeta("buzon")?.label, "No contesta");
    assert.equal(getDispositionMeta("numero_equivocado"), null, "Número equivocado vuelve a «Marcar resultado»");
});

test("H5 · un resultado que no existe no se guarda", async () => {
    const id = await unaLlamadaProcesada("invalido");
    const r = await setCallDisposition(String(id), "buzon");
    assert.equal(r.success, false, "«Buzón de voz» ya no es un resultado");
    const { call } = await laLlamada(id);
    assert.equal(call.disposition ?? null, null);
});

/* ── I. La SIMETRÍA con la llamada humana ───────────────────────────────── */

/**
 * El encargo de esta vuelta: «cuando la llamada la hace una persona queda
 * completa; cuando la hace la IA solo queda la grabación, la tarjeta dice
 * «Procesando…» para siempre y no se marca resultado».
 *
 * Los dos caminos comparten `processCallRecordingForUser`, así que la
 * asimetría no estaba en el procesado sino en **qué pasa cuando abandona**:
 * en la humana hay alguien delante —elige el resultado a mano y vuelve a
 * llamar—, y en la del bot no hay nadie, así que un abandono callado es
 * definitivo.
 *
 * Y el abandono más común era el que ni siquiera se contaba como tal: una
 * **transcripción vacía** devolvía `success: true`.
 */

/**
 * Lo que hacía `processCallRecordingForUser` con una transcripción vacía,
 * escrito literal: la daba por buena. Escribía `transcript: null`, no dejaba
 * ninguna marca y devolvía éxito.
 */
async function comoSeGuardabaUnaVaciaAntes(id) {
    await db.$executeRawUnsafe(
        `UPDATE "chat_messages"
            SET "raw" = COALESCE("raw",'{}'::jsonb) || jsonb_build_object(
                  'call', COALESCE("raw"->'call','{}'::jsonb) ||
                          '{"hasRecording":true,"transcript":null,"summary":null}'::jsonb)
          WHERE "id" = $1`,
        BigInt(id),
    );
    return { success: true };
}

/**
 * Cómo decidía el bucle si seguir esperando, escrito literal: comparando el
 * TEXTO del aviso. Un éxito no traía ese texto, así que paraba — y con una
 * transcripción vacía eso es parar para siempre.
 */
function elBucleDeAntesSigue(res) {
    return res.message === "Grabación no disponible aún.";
}

const TELEFONO_VACIA = "573001110009";
const CALL_VACIA = `call-vacia-${sello}`;

test("I1 · una transcripción VACÍA no es un éxito: deja su motivo y se puede reintentar", async () => {
    // La fila se registra con el MISMO camino y el MISMO par de ids con el que
    // la deja `startBotCallAction` (eso ya lo ejerce B1), y aquí se llama al
    // procesado directamente: lo que esta sección prueba es el ABANDONO, y
    // lanzar además la espera de fondo dejaría un bucle de media hora vivo
    // después de que el banco recoja la red — treinta minutos de vueltas
    // contra un servidor que ya no está.
    const { id: idFila } = await logOutgoingCallAction(TELEFONO_VACIA, 0, false, undefined, {
        isBot: true,
        provider: "astra",
        astraSid: SID,
        astraCallId: CALL_VACIA,
    }, LINEA);
    assert.ok(idFila, "no se registró la llamada");
    const id = String(idFila);
    globalThis.__filaVacia = id;

    // La grabación de ESTA llamada ya está cerrada: la red fingida solo la
    // entrega a partir del tercer intento, y aquí lo que se ejerce es lo que
    // pasa DESPUÉS de tenerla.
    red.pedidos.set(CALL_VACIA, red.listaEnElIntento);

    // OpenAI no contesta: la transcripción vuelve vacía.
    ponerLoQueDiceLaIa({ transcripcion: "" });
    try {
        if (ROTO) {
            const res = await comoSeGuardabaUnaVaciaAntes(id);
            // **El fallo, afirmado**: se daba por buena…
            assert.equal(res.success, true, "el modo roto tiene que dar la vacía por buena");
            // …el bucle paraba con ella…
            assert.equal(elBucleDeAntesSigue(res), false, "el bucle de antes tenía que pararse");
            // …y la fila se quedaba sin nada que explicara por qué.
            const { call } = await laLlamada(id);
            assert.equal(call.transcript ?? null, null);
            assert.equal(call.transcripcion ?? null, null, "el modo roto no deja ningún motivo");
            // Y eso es exactamente lo que la tarjeta pintaba: «Procesando…».
            const visto = loQueSeEnsenaDeLaLlamada({
                transcript: null,
                hasRecording: true,
                motivo: null,
                cargando: false,
            });
            assert.equal(visto.estado, "procesando", "sin motivo solo puede salir «Procesando…»");
            return;
        }

        const res = await processCallRecordingForUser({
            userId: hija,
            chatMessageId: id,
            astraSid: SID,
            astraCallId: CALL_VACIA,
        });
        assert.equal(res.success, false, "una transcripción vacía ya NO puede contar como éxito");
        assert.equal(res.motivo, "no_transcribio");

        const { call } = await laLlamada(id);
        const marca = laMarcaDeLaLlamada(call.transcripcion);
        assert.ok(marca, "el abandono tiene que dejar su motivo en la fila");
        assert.equal(marca.motivo, "no_transcribio");
        // Y es de HOY: se reintenta, porque no se ha cobrado nada.
        assert.equal(sePuedeReintentar(marca.motivo), true);
    } finally {
        ponerLoQueDiceLaIa({ transcripcion: "Operador: buenas tardes.\nCliente: hola, sí, me interesa." });
    }
});

test("I2 · y la tarjeta deja de decir «Procesando…»: dice qué pasó y ofrece reintentar", () => {
    const visto = loQueSeEnsenaDeLaLlamada({
        transcript: null,
        hasRecording: true,
        motivo: "no_transcribio",
        cargando: false,
    });
    assert.equal(visto.estado, "fallo");
    assert.equal(visto.sePuedeReintentar, true, "un fallo de hoy tiene que poder volver a pulsarse");
    // El texto es el MISMO que el de una nota de voz: un solo vocabulario.
    assert.equal(visto.texto, porQueNoSalioLaNota("no_transcribio"));

    // El motivo manda sobre «cargando»: si ya se sabe que falló, no se enseña
    // un «Cargando…» que insinúa que todavía puede salir.
    assert.equal(
        loQueSeEnsenaDeLaLlamada({ transcript: null, hasRecording: true, motivo: "sin_ia", cargando: true }).estado,
        "fallo",
    );
    // Y sin marca y sin grabación no se inventa ningún error.
    assert.equal(
        loQueSeEnsenaDeLaLlamada({ transcript: null, hasRecording: false, motivo: null, cargando: false }).estado,
        "nada",
    );
    // Con transcripción, listo: ningún aviso encima de un texto que sí salió.
    assert.equal(
        loQueSeEnsenaDeLaLlamada({ transcript: "hola", hasRecording: true, motivo: "no_transcribio", cargando: false })
            .estado,
        "listo",
    );
});

test("I3 · el REINTENTO completa la llamada: transcripción, resumen y resultado", async () => {
    if (ROTO) return; // en el modo roto no hay marca ni botón que ejercer.
    const id = globalThis.__filaVacia;
    assert.ok(id, "I1 no dejó la llamada");

    const r = await reintentarLaTranscripcionAction(id);
    assert.equal(r.success, true, r.message);

    const { call } = await laLlamada(id);
    assert.ok(call.transcript?.includes("Cliente:"), "el reintento tiene que dejar la Transcripción");
    assert.ok(call.summary, "y el Resumen IA");
    assert.ok(call.disposition, "y el resultado, igual que en una llamada humana");
    assert.equal(call.dispositionSource, "ia");
    // **La marca se borra al salir**: dejarla pondría el error de ayer debajo
    // del texto de hoy.
    assert.equal(laMarcaDeLaLlamada(call.transcripcion), null, "la marca tiene que irse cuando sí sale");
});

test("I4 · lo que NO cambia se para; lo que puede cambiar se reintenta", async () => {
    if (ROTO) return;
    const que = queHacerConLaGrabacion({ segundos: 600, bytes: 1024, creditosDisponibles: 0 });
    assert.equal(elMotivoDeLaGrabacion(que), "sin_creditos");
    assert.equal(
        elMotivoDeLaGrabacion(queHacerConLaGrabacion({ segundos: 1, bytes: INABARCABLE, creditosDisponibles: 9e9 })),
        "muy_larga",
    );
    // Con créditos no hay ningún motivo que escribir.
    assert.equal(
        elMotivoDeLaGrabacion(queHacerConLaGrabacion({ segundos: 10, bytes: 1024, creditosDisponibles: 9e9 })),
        null,
    );

    // **Son DOS preguntas distintas y no se pueden confundir.**
    //
    // «¿Se puede volver a pulsar?» incluye quedarse sin créditos: se recarga y
    // se reintenta. «¿Sigo sondeando AHORA?» no: nadie recarga en los treinta
    // minutos siguientes a la llamada, y cada vuelta se baja el WAV entero.
    assert.equal(sePuedeReintentar("sin_creditos"), true, "con créditos nuevos sí se puede");
    assert.equal(valeLaPenaSeguirEsperando("sin_creditos"), false, "pero no sondeando sesenta veces");
    // Lo de este momento sí se sigue esperando: para eso está la ventana.
    for (const m of ["no_bajo", "no_transcribio"]) {
        assert.equal(valeLaPenaSeguirEsperando(m), true, m);
        assert.equal(sePuedeReintentar(m), true, m);
    }
    // Y lo que no cambia por ninguna de las dos vías se para en las dos.
    for (const m of ["muy_larga", "sin_ia"]) {
        assert.equal(valeLaPenaSeguirEsperando(m), false, m);
        assert.equal(sePuedeReintentar(m), false, m);
    }

    // El barrido de abajo respeta lo firme: cada rescate se baja el WAV
    // entero, así que insistir ocho veces sobre una cuenta sin clave de IA es
    // bajarse ocho veces un audio para abandonar en el mismo sitio.
    const base = { astraSid: SID, astraCallId: "c1", durationSecs: 30, hasRecording: true };
    const rescate = (motivo) =>
        queLeFaltaALaLlamada({
            call: { ...base, transcripcion: { motivo } },
            edadMs: 60 * 60_000,
            ahoraMs: Date.now(),
        });
    assert.equal(rescate("sin_ia").rescatar, false);
    assert.equal(rescate("sin_ia").motivo, "firme");
    assert.equal(rescate("muy_larga").rescatar, false);
    // Y lo que puede cambiar sí se rescata: es justo para lo que está.
    assert.equal(rescate("no_transcribio").rescatar, true);
    assert.equal(rescate("sin_creditos").rescatar, true, "mañana puede haber créditos");
    // Sin marca ninguna, como siempre.
    assert.equal(
        queLeFaltaALaLlamada({ call: base, edadMs: 60 * 60_000, ahoraMs: Date.now() }).rescatar,
        true,
    );
});

test("I5 · una marca que no se entiende NO pinta un error sobre una llamada normal", () => {
    // Se ve de menos, nunca de más: equivocarse hacia «esta falló» sería
    // pintar un aviso encima de una llamada que va perfectamente.
    for (const basura of [null, undefined, {}, [], "no_transcribio", { motivo: "inventado" }, { motivo: 7 }]) {
        assert.equal(laMarcaDeLaLlamada(basura), null, `no debería entenderse: ${JSON.stringify(basura)}`);
    }
    const buena = laMarcaDeLaLlamada({ motivo: "sin_creditos", hacenFalta: 19, quedan: 3 });
    assert.deepEqual(buena, { motivo: "sin_creditos", hacenFalta: 19, quedan: 3 });
    // Y los números salen en el aviso: «no hay créditos» sin decir cuántos no
    // le sirve a quien tiene que recargar.
    const visto = loQueSeEnsenaDeLaLlamada({
        transcript: null,
        hasRecording: true,
        motivo: buena.motivo,
        hacenFalta: buena.hacenFalta,
        quedan: buena.quedan,
        cargando: false,
    });
    assert.equal(visto.estado, "fallo");
    assert.ok(visto.texto.includes("19") && visto.texto.includes("3"), visto.texto);
});

test("Z · se recoge la siembra", async () => {
    desmontarLaRed();
    await db.$disconnect();
});
