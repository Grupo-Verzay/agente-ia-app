/**
 * El banco de **«la transcripción la paga la misma cuenta que pagó la
 * llamada»**.
 *
 * El reporte: en CRM › Llamadas las llamadas salen bien y quedan con su
 * duración, y la transcripción falla con *No hay créditos suficientes: hacen
 * falta 14 y quedan 0* aunque la cuenta desde la que salió la llamada sí tiene
 * créditos. En el mismo listado, otras dicen *El servicio de transcripción no
 * respondió*.
 *
 * La causa no era «se lee la bolsa de la madre», que era la sospecha. Es que la
 * cuenta que **paga** una llamada y la cuenta bajo la que queda su **fila** se
 * resuelven con dos preguntas distintas sobre un dato que **no es único**
 * (`User.astra_calls_sid`, un `String?` sin índice de ninguna clase):
 *
 *   · el cobrador —wacalls → el backend— hace `WHERE astra_calls_sid = <sid>`;
 *   · la transcripción leía el saldo del dueño de la FILA.
 *
 * Dos cuentas con el mismo sid y un `LIMIT 1` sin `ORDER BY` bastan para que no
 * den la misma, y entonces la llamada se paga de una bolsa y la transcripción
 * mira otra — que si no tiene fila en `ia_credits` devuelve, correctamente para
 * ella, **cero**.
 *
 * Qué se prueba, y por qué contra Postgres: lo que hay que demostrar no es que
 * la regla pura acierte, es que **las funciones de producción pasan por ella** y
 * que el alcance sale de FILAS —el sid, la familia de `linked_accounts`, las
 * claves de IA y las bolsas de `ia_credits`—. Se finge `currentUser()` y el
 * paquete `openai`; todo lo demás es el código que corre.
 *
 *   MODO=roto scripts/banco-quien-paga-la-llamada.sh   <- afirma el fallo
 *
 * El «antes» va **pinchado a un commit** (`ANTES_REF`), nunca a `origin/main`:
 * en cuanto esto se fusione, `origin/main` pasa a ser el «después» y el modo
 * roto dejaría de reproducir nada — se pondría verde sin ejercer el fallo, que
 * es la peor forma de tener un banco.
 */
import test from "node:test";
import assert from "node:assert/strict";

const ROTO = process.env.MODO === "roto";
const sello = Date.now().toString(36);

const {
    ponerAQuienMira,
    ponerLoQueDiceLaIa,
    olvidarLoPedido,
    lasClavesQueSeUsaron,
    laCuentaQuePaga,
    laCuentaQuePagaLaLlamada,
    elDuenoDelSid,
    processCallRecordingForUser,
    processMetaCallRecordingForUser,
    reintentarLaTranscripcionAction,
    queHacerConLaGrabacion,
    porQueNoSeTranscribio,
    elMotivoDeLaGrabacion,
    laMarcaDeLaLlamada,
    loQueSeEnsenaDeLaLlamada,
    porQueNoSalioLaNota,
    sePuedeReintentar,
    sePuedeCortarElWav,
    trozosDeWav,
    TOPE_DE_BYTES_DE_AUDIO,
    costoDeLaNota,
    losCreditosQueQuedan,
    db,
} = await import("./.compilado/quien-paga/entrada-de-quien-paga.js");

/* ── La red y el audio, fingidos ────────────────────────────────────────── */

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

const SEGUNDOS = 140; // 2 min 20 s: cuesta 14 créditos, los del reporte
const WAV = wavDe(SEGUNDOS);
const fetchDeVerdad = globalThis.fetch;

/** Lo que el servidor de llamadas contesta al pedirle una grabación. */
const red = { grabacionLista: true, wav: WAV };

function montarLaRed() {
    globalThis.fetch = async (url) => {
        const u = String(url);
        if (/\/api\/sessions\/[^/]+\/calls\/[^/]+\/recording$/.test(u)) {
            if (!red.grabacionLista) {
                return { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) };
            }
            const w = red.wav;
            return {
                ok: true,
                status: 200,
                arrayBuffer: async () => w.buffer.slice(w.byteOffset, w.byteOffset + w.byteLength),
            };
        }
        throw new Error(`el banco no esperaba esta petición: ${u}`);
    };
}

/* ── La siembra: la forma exacta del reporte ─────────────────────────────── */

const madre = `madre-${sello}`;
const pagadora = `pagadora-${sello}`;
const ajena = `ajena-${sello}`;
const persona = `persona-${sello}`;
const LINEA = `PAGADORA_${sello}`;
const SID = `sid-pagadora-${sello}`;
const CLAVE_DE_LA_PAGADORA = "sk-de-la-pagadora";

/** Cuántos tokens lleva gastados una cuenta. `null` = no tiene bolsa. */
async function tokensUsados(userId) {
    const fila = await db.iaCredit.findUnique({ where: { userId } });
    return fila?.used ?? null;
}

/** La fila de la llamada, como la lee quien la va a pintar. */
async function laLlamada(id) {
    const fila = await db.chatMessage.findFirst({
        where: { id: BigInt(id) },
        select: { userId: true, raw: true },
    });
    return { userId: fila?.userId, call: fila?.raw?.call ?? {} };
}

/** Deja una fila de llamada y devuelve su id. */
async function sembrarLaLlamada(input) {
    const messageId = input.messageId;
    await db.chatMessage.create({
        data: {
            userId: input.userId,
            instanceName: LINEA,
            instanceType: "evolution",
            remoteJid: `${input.telefono}@s.whatsapp.net`,
            messageId,
            fromMe: true,
            messageType: "call",
            content: "Llamada con IA realizada",
            raw: { call: { direction: "outgoing", isBot: true, provider: "astra", durationSecs: 0, ...input.call } },
            messageTimestamp: new Date(),
        },
    });
    const fila = await db.chatMessage.findFirst({
        where: { userId: input.userId, messageId },
        select: { id: true },
    });
    return String(fila.id);
}

test("S · siembra: la madre a cero, la hija que pagó con sus créditos y su clave", async () => {
    await db.user.create({ data: { id: madre, email: `${madre}@b.co`, name: "Grupo Verzay", role: "admin" } });
    await db.user.create({
        data: {
            id: pagadora,
            email: `${pagadora}@b.co`,
            name: "Verzay | Atencion",
            role: "user",
            astraCallsSid: SID,
        },
    });
    await db.user.create({ data: { id: ajena, email: `${ajena}@b.co`, name: "Otra casa", role: "user" } });
    await db.user.create({
        data: {
            id: persona,
            email: `${persona}@b.co`,
            name: "Yair",
            role: "user",
            ownerId: madre,
            advisorRole: "administrador",
        },
    });
    // La madre vinculó a la hija bajo la suya: eso es lo que las hace familia, y
    // es la única condición para seguirle el rastro del sid.
    await db.$executeRawUnsafe(
        `INSERT INTO "linked_accounts" ("id","master_user_id","linked_user_id") VALUES ($1,$2,$3)`,
        `lnk-${sello}`,
        madre,
        pagadora,
    );
    await db.instancia.create({
        data: { userId: pagadora, instanceId: `i-${pagadora}`, instanceName: LINEA, instanceType: "waha" },
    });

    // `AiProvider.name` es ÚNICO y la base del banco se reutiliza entre
    // ejecuciones: con un `create` a secas la segunda vuelta se cae en la
    // siembra y todo lo de abajo sale rojo por algo que no tiene que ver.
    const prov =
        (await db.aiProvider.findUnique({ where: { name: "openai" } })) ??
        (await db.aiProvider.create({ data: { id: `prov-${sello}`, name: "openai", aiModel: "gpt-4o-mini" } }));
    await db.userAiConfig.create({
        data: { userId: pagadora, providerId: prov.id, apiKey: CLAVE_DE_LA_PAGADORA, isActive: true },
    });

    // **El reporte, al pie de la letra**: la madre a cero y la que llamó con
    // créditos de verdad. La madre tiene bolsa para que el fallo sea «quedan 0»
    // y no «esta cuenta no tiene fila», que es otro caso.
    await db.iaCredit.create({ data: { userId: madre, total: 0, used: 0, renewalDate: new Date() } });
    await db.iaCredit.create({ data: { userId: pagadora, total: 1000, used: 0, renewalDate: new Date() } });

    // Quien mira es una persona del equipo de la madre: el caso de todos los
    // días en una cuenta que administra a otra.
    ponerAQuienMira({
        id: persona,
        email: `${persona}@b.co`,
        role: "user",
        ownerId: madre,
        effectiveId: madre,
        sessionUserId: persona,
    });
    montarLaRed();
});

/* ── A. La regla, pura ──────────────────────────────────────────────────── */

test("A1 · se sigue el sid, y NUNCA a una cuenta de fuera de la familia", () => {
    // Sin sid: lo de siempre, el dueño de la fila.
    assert.deepEqual(laCuentaQuePaga({ cuentaDeLaFila: "A", cuentaDelSid: null, familiaDeLaFila: ["A"] }), {
        cuentaId: "A",
        origen: "fila",
    });
    // El sid de la misma cuenta no decide nada y no cuesta nada.
    assert.deepEqual(laCuentaQuePaga({ cuentaDeLaFila: "A", cuentaDelSid: "A", familiaDeLaFila: [] }), {
        cuentaId: "A",
        origen: "fila",
    });
    // El caso del reporte: el sid es de otra cuenta DE LA FAMILIA. Se sigue.
    assert.deepEqual(laCuentaQuePaga({ cuentaDeLaFila: "A", cuentaDelSid: "B", familiaDeLaFila: ["A", "B"] }), {
        cuentaId: "B",
        origen: "sid",
    });
    // Y uno de FUERA no se sigue: gastarle los créditos a un extraño por una
    // llamada que no hizo es peor que el fallo que esto vino a arreglar.
    assert.deepEqual(laCuentaQuePaga({ cuentaDeLaFila: "A", cuentaDelSid: "Z", familiaDeLaFila: ["A", "B"] }), {
        cuentaId: "A",
        origen: "ajena",
        descartada: "Z",
    });
    // Una familia que no se pudo leer llega vacía (`laFamiliaDeLaCuenta` se cae
    // al lado seguro): se queda con la fila. Se ve de menos, nunca de más.
    assert.equal(laCuentaQuePaga({ cuentaDeLaFila: "A", cuentaDelSid: "B", familiaDeLaFila: [] }).cuentaId, "A");
});

test("A2 · el sid se resuelve con DESEMPATE, porque la columna NO es única", async () => {
    // Dos cuentas con el mismo sid es lo que la base permite hoy —`astra_calls_sid`
    // no tiene índice único— y es lo que convierte «la cuenta del sid» en una
    // pregunta sin respuesta: un `LIMIT 1` sin `ORDER BY` devuelve una
    // cualquiera. Con el desempate por `id`, esta consulta y las cuatro del
    // backend eligen siempre la misma.
    const compartido = `sid-compartido-${sello}`;
    const zeta = `zz-comparte-${sello}`;
    const alfa = `aa-comparte-${sello}`;
    await db.user.create({ data: { id: zeta, email: `${zeta}@b.co`, astraCallsSid: compartido } });
    await db.user.create({ data: { id: alfa, email: `${alfa}@b.co`, astraCallsSid: compartido } });

    if (ROTO) {
        // El «antes» no resolvía ningún sid: esta pregunta no existía.
        assert.equal(await elDuenoDelSid(compartido), null);
        return;
    }
    // Se elige el `id` menor, y cinco veces seguidas la misma: si el criterio
    // fuera el plan, no tendría por qué.
    for (let i = 0; i < 5; i++) {
        assert.equal(await elDuenoDelSid(compartido), alfa, "el desempate no es estable");
    }
    assert.equal(await elDuenoDelSid(""), null, "sin sid no se consulta nada");
    assert.equal(await elDuenoDelSid(`no-existe-${sello}`), null);
});

/* ── B. El reporte, contra Postgres y por el camino de producción ────────── */

const CALL_DEL_REPORTE = `call-reporte-${sello}`;
let filaDelReporte = "";

test("B1 · quien paga se resuelve desde el sid de la FILA, con la familia de verdad", async () => {
    const quien = await laCuentaQuePagaLaLlamada(madre, SID);
    if (ROTO) {
        assert.equal(quien.cuentaId, madre, "el «antes» tiene que devolver el dueño de la fila");
        assert.equal(quien.origen, "fila");
        return;
    }
    assert.equal(quien.cuentaId, pagadora, "no se siguió a la cuenta que pagó la llamada");
    assert.equal(quien.origen, "sid");

    // Y un sid de una cuenta que no es de la familia no se sigue: se queda con
    // la fila y lo dice.
    await db.user.update({ where: { id: ajena }, data: { astraCallsSid: `sid-ajeno-${sello}` } });
    const deFuera = await laCuentaQuePagaLaLlamada(madre, `sid-ajeno-${sello}`);
    assert.equal(deFuera.cuentaId, madre);
    assert.equal(deFuera.origen, "ajena");
    assert.equal(deFuera.descartada, ajena);
});

test("B2 · la fila es de la madre, el sid de la hija, y PAGA LA HIJA", async () => {
    filaDelReporte = await sembrarLaLlamada({
        userId: madre,
        telefono: "573009990001",
        messageId: `callout-reporte-${sello}`,
        call: { astraSid: SID, astraCallId: CALL_DEL_REPORTE },
    });

    olvidarLoPedido();
    const usadosAntes = await tokensUsados(pagadora);

    const res = await processCallRecordingForUser({
        userId: madre,
        chatMessageId: filaDelReporte,
        astraSid: SID,
        astraCallId: CALL_DEL_REPORTE,
    });
    const { call } = await laLlamada(filaDelReporte);

    // **La duración se escribe pase lo que pase** — eso ya estaba arreglado, y
    // es lo que el reporte confirma («quedan con su duración»).
    assert.equal(call.durationSecs, SEGUNDOS, "se perdió la duración");

    if (ROTO) {
        // El fallo, afirmado: la madre está a cero, así que se abandona con
        // «sin créditos» sobre una llamada que la hija sí podía pagar.
        assert.equal(res.success, false);
        assert.equal(call.transcripcion?.motivo, "sin_creditos");
        assert.ok(!call.transcript, "en el modo roto no puede haber transcripción");
        assert.equal(await tokensUsados(pagadora), usadosAntes, "no se cobró a nadie");
        // Y el mensaje es EL DEL REPORTE, con sus números delante.
        const texto = porQueNoSalioLaNota("sin_creditos", {
            hacenFalta: call.transcripcion.hacenFalta,
            quedan: call.transcripcion.quedan,
        });
        assert.equal(texto, "No hay créditos suficientes: hacen falta 14 y quedan 0.", texto);
        return;
    }

    assert.equal(res.success, true, res.message);
    assert.ok(call.transcript, "la llamada se quedó sin transcripción");
    assert.ok(call.summary, "y sin Resumen IA");
    assert.equal(call.transcripcion ?? null, null, "quedó una marca de fallo sobre una llamada que salió");

    // **Se le cobró a la hija, que es quien pagó la llamada.**
    assert.equal(
        await tokensUsados(pagadora),
        usadosAntes + costoDeLaNota(SEGUNDOS).tokens,
        "no se descontó de la cuenta que pagó la llamada",
    );
    // Y NO a la madre, que es de donde salía el «quedan 0».
    assert.equal(await tokensUsados(madre), 0, "se le cobró a la madre");
});

test("B3 · y la CLAVE de IA salió de la misma cuenta que paga", async () => {
    // Es la otra mitad del mismo reporte. La madre no tiene ninguna clave
    // activa, así que con la del dueño de la fila esto acaba en un 401 que el
    // `catch` de `transcribe` se traga, y la tarjeta dice «El servicio de
    // transcripción no respondió» — que es mentira dos veces: el servicio
    // respondió, y respondió que la clave no vale.
    assert.equal(
        await db.userAiConfig.findFirst({ where: { userId: madre, isActive: true } }),
        null,
        "la madre no puede tener clave, o este caso no ejerce nada",
    );

    if (ROTO) return;
    const claves = lasClavesQueSeUsaron();
    assert.ok(claves.length > 0, "no se le habló a la IA");
    assert.deepEqual(
        [...new Set(claves)],
        [CLAVE_DE_LA_PAGADORA],
        "se transcribió con la clave de una cuenta y se cobró a otra",
    );
});

test("B4 · una segunda vuelta no vuelve a cobrar", async () => {
    if (ROTO) return;
    const antes = await tokensUsados(pagadora);
    const res = await processCallRecordingForUser({
        userId: madre,
        chatMessageId: filaDelReporte,
        astraSid: SID,
        astraCallId: CALL_DEL_REPORTE,
    });
    assert.equal(res.success, true);
    assert.equal(await tokensUsados(pagadora), antes, "la segunda vuelta volvió a cobrar");
});

test("B5 · el botón de la tarjeta pasa por la misma puerta y completa la llamada", async () => {
    // El reintento del detalle de CRM › Llamadas: el par de ids sale de la
    // FILA, la puerta es `laCuentaDeLaFilaDeLlamada` —la madre alcanza a su
    // hija— y el cobro cae en la cuenta que pagó la llamada.
    const id = await sembrarLaLlamada({
        userId: madre,
        telefono: "573009990005",
        messageId: `callout-boton-${sello}`,
        call: { astraSid: SID, astraCallId: `call-boton-${sello}` },
    });
    olvidarLoPedido();
    const antes = await tokensUsados(pagadora);

    const res = await reintentarLaTranscripcionAction(id);
    const { call } = await laLlamada(id);

    if (ROTO) {
        assert.equal(res.success, false);
        assert.equal(call.transcripcion?.motivo, "sin_creditos");
        return;
    }
    assert.equal(res.success, true, res.message);
    assert.ok(call.transcript, "el botón no dejó transcripción");
    assert.equal(
        await tokensUsados(pagadora),
        antes + costoDeLaNota(SEGUNDOS).tokens,
        "el botón cobró a otra cuenta",
    );
});

/* ── C. «No respondió» tiene que ser verdad ─────────────────────────────── */

test("C1 · lo que no se puede cortar y no cabe es «demasiado grande»", () => {
    // Era el otro síntoma del listado. Un audio que `trozosDeWav` no sabe
    // partir —un WAV truncado, o el webm de una llamada de Meta— se mandaba
    // ENTERO: OpenAI contesta 413, el `catch` se lo traga, y quedaba marcado
    // `no_transcribio` («El servicio de transcripción no respondió»), que
    // además invita a reintentar para volver a fallar en el mismo sitio.
    const bytes = TOPE_DE_BYTES_DE_AUDIO + 1;

    if (ROTO) {
        // El «antes» no sabía nada de esto: la decisión era una cuenta de bytes
        // y decía «dos trozos, adelante» sobre algo que iba a salir en uno.
        const que = queHacerConLaGrabacion({ segundos: 600, bytes, creditosDisponibles: 100000 });
        assert.equal(que.hacer, "transcribir");
        assert.equal(que.trozos, 2, "la decisión contaba dos trozos…");
        assert.equal(trozosDeWav(Buffer.alloc(bytes, 7), TOPE_DE_BYTES_DE_AUDIO).length, 1, "…y salía uno");
        return;
    }

    const noSeCorta = queHacerConLaGrabacion({
        segundos: 600,
        bytes,
        sePuedeCortar: false,
        creditosDisponibles: 100000,
    });
    assert.equal(noSeCorta.hacer, "demasiado_grande");
    assert.equal(elMotivoDeLaGrabacion(noSeCorta), "muy_larga");
    assert.equal(sePuedeReintentar("muy_larga"), false, "un motivo firme no puede ofrecer reintentar");
    assert.match(porQueNoSeTranscribio(noSeCorta), /MB/);

    // Y lo que sí se puede cortar sigue transcribiéndose por partes.
    const siSeCorta = queHacerConLaGrabacion({
        segundos: 600,
        bytes,
        sePuedeCortar: true,
        creditosDisponibles: 100000,
    });
    assert.equal(siSeCorta.hacer, "transcribir");
    assert.equal(siSeCorta.trozos, 2);
});

test("C2 · la condición sale de la MISMA función que corta, no de una copia", () => {
    if (ROTO) return;
    assert.equal(sePuedeCortarElWav(wavDe(1)), true);
    // Un webm —la grabación de una llamada de Meta— no se corta por bytes.
    const webm = Buffer.alloc(500_000, 7);
    assert.equal(sePuedeCortarElWav(webm), false);
    assert.equal(trozosDeWav(webm, 100_000).length, 1, "la que corta y la que decide tienen que estar de acuerdo");
    // Y un WAV truncado, al que se le fue su chunk `data`, tampoco.
    assert.equal(sePuedeCortarElWav(wavDe(1).subarray(0, 30)), false);
});

test("C3 · «no respondió» se sigue diciendo cuando de verdad no respondió", async () => {
    // Que el mensaje deje de ser un cajón de sastre no puede quitarle su caso:
    // una transcripción vacía de verdad —la red, un pico de carga— sigue
    // dejando su motivo, y ese SÍ se reintenta.
    const id = await sembrarLaLlamada({
        userId: madre,
        telefono: "573009990003",
        messageId: `callout-vacia-${sello}`,
        call: { astraSid: SID, astraCallId: `call-vacia-${sello}` },
    });
    olvidarLoPedido();
    ponerLoQueDiceLaIa({ transcripcion: "" });
    const antes = await tokensUsados(pagadora);

    const res = await processCallRecordingForUser({
        userId: madre,
        chatMessageId: id,
        astraSid: SID,
        astraCallId: `call-vacia-${sello}`,
    });
    ponerLoQueDiceLaIa({ transcripcion: "Operador: buenas.\nCliente: hola." });

    const { call } = await laLlamada(id);
    if (ROTO) {
        // En el modo roto no se llega ni a preguntarle a la IA: la madre está
        // a cero, así que abandona antes por créditos.
        assert.equal(call.transcripcion?.motivo, "sin_creditos");
        return;
    }
    assert.equal(res.success, false);
    assert.equal(call.transcripcion?.motivo, "no_transcribio");
    assert.equal(sePuedeReintentar("no_transcribio"), true, "un fallo de hoy tiene que poder reintentarse");
    assert.equal(await tokensUsados(pagadora), antes, "se cobró una transcripción que no salió");
    assert.equal(
        porQueNoSalioLaNota("no_transcribio"),
        "El servicio de transcripción no respondió. Inténtalo otra vez.",
    );

    // Y el reintento la completa, cobrando a la cuenta que pagó la llamada.
    olvidarLoPedido();
    const res2 = await reintentarLaTranscripcionAction(id);
    assert.equal(res2.success, true, res2.message);
    const despues = await laLlamada(id);
    assert.ok(despues.call.transcript, "el reintento no completó la llamada");
    assert.equal(despues.call.transcripcion ?? null, null, "quedó la marca de ayer debajo del texto de hoy");
    assert.equal(await tokensUsados(pagadora), antes + costoDeLaNota(SEGUNDOS).tokens);
});

/* ── D. La hermana de Meta: la misma simetría ───────────────────────────── */

test("D1 · la grabación de Meta deja su MOTIVO en la fila, como la de Astra", async () => {
    // A esta hermana se le había pasado: escribía el motivo en un `console.warn`
    // y **nada en la fila**, así que la tarjeta se quedaba diciendo
    // «Procesando…» para siempre — el mismo fallo que la otra mitad ya tenía
    // arreglado. Aquí abandona por créditos: una grabación de Meta no trae
    // `astraSid`, así que paga el dueño de la fila y la madre está a cero.
    const id = await sembrarLaLlamada({
        userId: madre,
        telefono: "573009990004",
        messageId: `callout-meta-${sello}`,
        call: { provider: "meta", durationSecs: 140, isBot: false },
    });

    await processMetaCallRecordingForUser({
        userId: madre,
        chatMessageId: id,
        audioBase64: Buffer.alloc(4096, 3).toString("base64"),
        mimeType: "audio/webm",
    });

    const { call } = await laLlamada(id);
    const marca = laMarcaDeLaLlamada(call.transcripcion);
    if (ROTO) {
        assert.equal(marca, null, "el «antes» no escribía ninguna marca en este camino");
        return;
    }
    assert.equal(marca?.motivo, "sin_creditos", "la grabación de Meta no dejó su motivo");
    assert.equal(marca.hacenFalta, 14);
    assert.equal(marca.quedan, 0);

    // Y con eso la tarjeta dice qué pasó en vez de «Procesando…».
    const visto = loQueSeEnsenaDeLaLlamada({
        transcript: null,
        hasRecording: false,
        motivo: marca.motivo,
        hacenFalta: marca.hacenFalta,
        quedan: marca.quedan,
        cargando: false,
    });
    assert.equal(visto.estado, "fallo");
    assert.match(visto.texto, /hacen falta 14 y quedan 0/);
});

test("D2 · y cubre los TRES finales, con la marca de ayer borrada al salir", async () => {
    // La hermana de Meta decidía su marca solo antes de intentarlo, así que una
    // transcripción vacía —el caso que en Astra deja «no respondió»— se quedaba
    // sin nada. Y al salir bien no borraba la marca de la vuelta anterior, que
    // es lo que deja el error de ayer debajo del texto de hoy.
    //
    // Esta llamada va bajo la PAGADORA, que sí tiene clave y créditos: así el
    // camino llega hasta la IA en vez de abandonar antes.
    const id = await sembrarLaLlamada({
        userId: pagadora,
        telefono: "573009990006",
        messageId: `callout-meta-vacia-${sello}`,
        call: { provider: "meta", durationSecs: 140, isBot: false },
    });
    const audio = Buffer.alloc(4096, 3).toString("base64");

    olvidarLoPedido();
    ponerLoQueDiceLaIa({ transcripcion: "" });
    await processMetaCallRecordingForUser({
        userId: pagadora,
        chatMessageId: id,
        audioBase64: audio,
        mimeType: "audio/webm",
    });
    const vacia = await laLlamada(id);
    ponerLoQueDiceLaIa({ transcripcion: "Operador: buenas.\nCliente: hola." });

    if (ROTO) {
        assert.equal(vacia.call.transcripcion ?? null, null, "el «antes» no escribía ninguna marca");
        return;
    }
    assert.equal(laMarcaDeLaLlamada(vacia.call.transcripcion)?.motivo, "no_transcribio");
    assert.ok(!vacia.call.transcript);

    // Y la vuelta que sí sale borra la marca en la misma escritura.
    olvidarLoPedido();
    await processMetaCallRecordingForUser({
        userId: pagadora,
        chatMessageId: id,
        audioBase64: audio,
        mimeType: "audio/webm",
    });
    const buena = await laLlamada(id);
    assert.ok(buena.call.transcript, "la segunda vuelta no dejó transcripción");
    assert.equal(buena.call.transcripcion ?? null, null, "quedó la marca de ayer debajo del texto de hoy");
});

/* ── E. Lo que NO se puede haber aflojado ───────────────────────────────── */

test("E1 · una cuenta sin bolsa sigue siendo cero, y `null` sigue siendo ILIMITADO", async () => {
    // La persona no tiene fila en `ia_credits` —nadie la tiene— y eso es cero,
    // no ilimitado. Es lo que hacía que el fallo se viera como «quedan 0».
    assert.equal(await db.iaCredit.findUnique({ where: { userId: persona } }), null);
    assert.equal(await losCreditosQueQuedan(persona), 0);
    // Y la hija, con su bolsa, lo que le queda de verdad.
    const suyos = await losCreditosQueQuedan(pagadora);
    assert.ok(typeof suyos === "number" && suyos > 0, `la pagadora tendría que tener créditos: ${suyos}`);
});

test("E2 · el tamaño se sigue mirando ANTES que los créditos", async () => {
    if (ROTO) return;
    // Con las dos cosas mal, decir «sin créditos» manda a recargar para nada.
    const que = queHacerConLaGrabacion({
        segundos: 36000,
        bytes: TOPE_DE_BYTES_DE_AUDIO * 20,
        sePuedeCortar: true,
        creditosDisponibles: 0,
    });
    assert.equal(que.hacer, "demasiado_grande");
});

test("Z · se recoge la siembra", async () => {
    globalThis.fetch = fetchDeVerdad;
    await db.$disconnect();
});
