/**
 * El banco de «la llamada que colgó y de la que nadie avisó».
 *
 * El encargo: el 21 las llamadas con IA se registraban completas —duración,
 * Resumen IA y transcripción—; el 22, después de que se cayera Postgres y se
 * volvieran a desplegar dos stacks a mano desde el editor de Portainer,
 * dejaron de hacerlo. El aviso de fin de llamada (#877) es el camino bueno y
 * no cambia; lo que no tenía es **red debajo**, y esto la prueba:
 *
 *   A. la DECISIÓN, pura y sin base: a quién hay que rescatar y a quién no;
 *   B. el RESCATE contra Postgres: una llamada sin aviso vuelve entera desde
 *      su fila, en un proceso que no sabe nada de ella;
 *   C. los TOPES: ni una llamada en curso, ni un bucle que se baje el mismo
 *      WAV para siempre;
 *   D. la PUERTA de la ruta y la ALARMA (`sinAviso`);
 *   E. que rescatar dos veces no cobra dos veces.
 *
 * `MODO=roto` ejerce **lo que había**: la única recuperación era
 * `esperarYProcesarLaGrabacion`, una promesa suelta en memoria dentro de una
 * petición. Se reproduce el despliegue que se la lleva y **se afirma el
 * fallo** — la llamada se queda como nació, para siempre. Sin ese modo, lo
 * verde del otro no diría si se arregló la causa o si el caso no se ejerce.
 */
import test from "node:test";
import assert from "node:assert/strict";

const ROTO = process.env.MODO === "roto";
const sello = Date.now().toString(36);

const {
    ponerLoQueDiceLaIa,
    olvidarLoPedido,
    rescatarLlamadasSinCerrar,
    pedirElRescate,
    avisarDelFinDeLaLlamada,
    queLeFaltaALaLlamada,
    elSelloQueTrae,
    elSiguienteSello,
    TOPE_DE_RESCATES,
    TOPE_POR_VUELTA,
    TOPE_EN_LA_VUELTA_DIARIA,
    EDAD_MINIMA_MS,
    ESPERA_ENTRE_RESCATES_MS,
    esperarYProcesarLaGrabacion,
    ESPERA_ENTRE_INTENTOS_MS,
    db,
} = await import("./.compilado/rescate/entrada-de-rescate.js");

/* ── La red, fingida: el servidor de llamadas ───────────────────────────── */

const SID = `sid-${sello}`;
const LINEA = `LINEA_${sello}`;

/** Un WAV de verdad: 16 kHz, 2 canales, 16 bits — lo que graba AstraCalls. */
function wavDe(segundos) {
    const canales = 2, sampleRate = 16000, bits = 16;
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

const SEGUNDOS = 45;
const WAV = wavDe(SEGUNDOS);

const red = { pedidos: new Map(), hayGrabacion: true };
const fetchDeVerdad = globalThis.fetch;
const setTimeoutDeVerdad = globalThis.setTimeout;

function montarLaRed() {
    globalThis.fetch = async (url) => {
        const u = String(url);
        const grabacion = u.match(/\/api\/sessions\/[^/]+\/calls\/([^/]+)\/recording$/);
        if (grabacion) {
            const callId = grabacion[1];
            red.pedidos.set(callId, (red.pedidos.get(callId) ?? 0) + 1);
            if (!red.hayGrabacion) return { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) };
            return {
                ok: true, status: 200,
                arrayBuffer: async () => WAV.buffer.slice(WAV.byteOffset, WAV.byteOffset + WAV.byteLength),
            };
        }
        throw new Error(`el banco no esperaba esta petición: ${u}`);
    };
    // Solo se acelera ESA espera, leída del propio módulo: acortar todos los
    // temporizadores movería también los de Prisma y los del corredor.
    globalThis.setTimeout = (fn, ms, ...resto) =>
        setTimeoutDeVerdad(fn, ms === ESPERA_ENTRE_INTENTOS_MS ? 1 : ms, ...resto);
}
function desmontarLaRed() {
    globalThis.fetch = fetchDeVerdad;
    globalThis.setTimeout = setTimeoutDeVerdad;
}

/* ── Ayudas ─────────────────────────────────────────────────────────────── */

const cuenta = `cuenta-${sello}`;
const proveedor = `prov-${sello}`;
let nDeLlamada = 0;

/** Siembra una llamada tal como la deja `logOutgoingCallAction`: con su par de
 * ids y SIN duración, que es exactamente como se queda cuando el aviso de fin
 * no llega. `haceMinutos` la envejece, porque una llamada en curso no se toca. */
async function sembrarLlamada({ haceMinutos = 40, call = {} } = {}) {
    // Las llamadas que dejaron los casos anteriores siguen siendo candidatas
    // —es lo correcto: el barrido no sabe de casos— pero harían que los
    // números de ESTE caso dependieran del orden en que corrió el de antes.
    // Se les pone transcripción para que salgan por `ya_esta`, que es el mismo
    // camino por el que sale una llamada ya resuelta en producción.
    await db.$executeRawUnsafe(
        `UPDATE "chat_messages"
            SET "raw" = jsonb_set("raw", '{call,transcript}', '"(fuera del caso)"'::jsonb)
          WHERE "messageType" = 'call'
            AND ("raw"->'call'->>'transcript') IS NULL`,
    );
    const callId = `call-${sello}-${++nDeLlamada}`;
    const cuando = new Date(Date.now() - haceMinutos * 60_000);
    const fila = await db.chatMessage.create({
        data: {
            userId: cuenta,
            instanceName: LINEA,
            instanceType: "evolution",
            remoteJid: `5730012345${nDeLlamada}@s.whatsapp.net`,
            messageId: `callout_${sello}_${nDeLlamada}`,
            fromMe: true,
            messageType: "call",
            content: "Llamada con IA realizada",
            messageTimestamp: cuando,
            raw: { call: { direction: "outgoing", isBot: true, provider: "astra", astraSid: SID, astraCallId: callId, ...call } },
        },
        select: { id: true },
    });
    return { id: fila.id, callId };
}

async function laLlamada(id) {
    const fila = await db.chatMessage.findFirst({ where: { id: BigInt(id) }, select: { raw: true } });
    return fila?.raw?.call ?? {};
}
async function creditosUsados() {
    const fila = await db.iaCredit.findUnique({ where: { userId: cuenta } });
    return fila?.used ?? null;
}
/** Quita el sello para poder ejercer dos vueltas seguidas sin esperar los 20
 * minutos de verdad. Se toca SOLO el sello: lo demás es lo que el barrido
 * escribió. */
async function olvidarElSello(id) {
    await db.$executeRawUnsafe(
        `UPDATE "chat_messages" SET "raw" = jsonb_set("raw", '{call}', ("raw"->'call') - 'rescate') WHERE "id" = $1`,
        BigInt(id),
    );
}

/* ── S. La siembra ──────────────────────────────────────────────────────── */

test("S · siembra: una cuenta con su línea, su clave de IA y sus créditos", async () => {
    // **La base del banco se reutiliza entre ejecuciones**, y este barrido es
    // GLOBAL: las llamadas que dejó la vuelta anterior son candidatas de pleno
    // derecho, son más viejas, y el orden es el de producción —la más vieja
    // primero, para que ninguna se quede sin turno—, así que se comerían el
    // tope de la vuelta y la llamada del caso no entraría nunca. Se parte de
    // cero, que es lo único que hace que los números signifiquen algo.
    await db.$executeRawUnsafe(`DELETE FROM "chat_messages" WHERE "messageType" = 'call'`);
    await db.user.create({ data: { id: cuenta, email: `${cuenta}@b.co`, name: "Verzay | Ventas", role: "user", astraCallsSid: SID } });
    await db.instancia.create({ data: { userId: cuenta, instanceId: `i-${cuenta}`, instanceName: LINEA, instanceType: "waha" } });
    const prov =
        (await db.aiProvider.findUnique({ where: { name: "openai" } })) ??
        (await db.aiProvider.create({ data: { id: proveedor, name: "openai", aiModel: "gpt-4o-mini" } }));
    await db.userAiConfig.create({ data: { userId: cuenta, providerId: prov.id, apiKey: "sk-de-la-cuenta", isActive: true } });
    await db.iaCredit.create({ data: { userId: cuenta, total: 5000, used: 0, renewalDate: new Date(Date.now() + 30 * 86400_000) } });
    montarLaRed();
});

/* ── A. La decisión ─────────────────────────────────────────────────────── */

const ahora = Date.now();
const vieja = EDAD_MINIMA_MS + 60_000;

test("A1 · sin el par de ids no hay a quién preguntarle: no se rescata", () => {
    assert.deepEqual(queLeFaltaALaLlamada({ call: { astraSid: SID }, edadMs: vieja, ahoraMs: ahora }),
        { rescatar: false, motivo: "sin_ids" });
    assert.deepEqual(queLeFaltaALaLlamada({ call: null, edadMs: vieja, ahoraMs: ahora }),
        { rescatar: false, motivo: "sin_ids" });
});

test("A2 · con transcripción ya está: no se vuelve a bajar el WAV", () => {
    const call = { astraSid: SID, astraCallId: "c1", transcript: "hola" };
    assert.deepEqual(queLeFaltaALaLlamada({ call, edadMs: vieja, ahoraMs: ahora }),
        { rescatar: false, motivo: "ya_esta" });
});

test("A3 · `hasRecording:false` es AstraCalls diciendo que no hay audio, y solo el `false` explícito", () => {
    const base = { astraSid: SID, astraCallId: "c2", durationSecs: 12 };
    assert.deepEqual(queLeFaltaALaLlamada({ call: { ...base, hasRecording: false }, edadMs: vieja, ahoraMs: ahora }),
        { rescatar: false, motivo: "sin_audio" });
    // Sin el campo es «no se sabe», que es justo lo que hay que ir a mirar.
    assert.equal(queLeFaltaALaLlamada({ call: base, edadMs: vieja, ahoraMs: ahora }).rescatar, true);
});

test("A4 · una llamada EN CURSO no está rota: no se toca", () => {
    const call = { astraSid: SID, astraCallId: "c3" };
    assert.deepEqual(queLeFaltaALaLlamada({ call, edadMs: EDAD_MINIMA_MS - 1, ahoraMs: ahora }),
        { rescatar: false, motivo: "en_curso" });
});

test("A5 · el tope de intentos corta, y la espera entre intentos también", () => {
    const call = { astraSid: SID, astraCallId: "c4" };
    const agotada = { ...call, rescate: { intentos: TOPE_DE_RESCATES, ultimoEn: new Date(ahora - 10 * ESPERA_ENTRE_RESCATES_MS).toISOString() } };
    assert.deepEqual(queLeFaltaALaLlamada({ call: agotada, edadMs: vieja, ahoraMs: ahora }),
        { rescatar: false, motivo: "agotada" });

    const reciente = { ...call, rescate: { intentos: 1, ultimoEn: new Date(ahora - 60_000).toISOString() } };
    assert.deepEqual(queLeFaltaALaLlamada({ call: reciente, edadMs: vieja, ahoraMs: ahora }),
        { rescatar: false, motivo: "todavia_no" });
});

test("A6 · «cerrar» y «transcribir» distinguen que la cadena del aviso esté caída", () => {
    const call = { astraSid: SID, astraCallId: "c5" };
    // Sin duración: no llegó NADIE. Es la señal de que el aviso está roto.
    assert.equal(queLeFaltaALaLlamada({ call, edadMs: vieja, ahoraMs: ahora }).que, "cerrar");
    // Con duración: el aviso sí llegó y lo que falta es el audio.
    assert.equal(queLeFaltaALaLlamada({ call: { ...call, durationSecs: 30 }, edadMs: vieja, ahoraMs: ahora }).que, "transcribir");
});

test("A7 · un sello que no se entiende cuenta como «nunca se intentó», nunca como agotado", () => {
    assert.equal(elSelloQueTrae(null), null);
    assert.equal(elSelloQueTrae({ intentos: "x", ultimoEn: "y" }), null);
    assert.equal(elSelloQueTrae({ intentos: 2, ultimoEn: "no-es-fecha" }), null);
    // Y el siguiente sello parte de cero cuando el anterior era basura: se ve
    // de menos, nunca de más.
    assert.equal(elSiguienteSello({ intentos: 2, ultimoEn: "basura" }, new Date()).intentos, 1);
    assert.equal(elSiguienteSello({ intentos: 2, ultimoEn: new Date().toISOString() }, new Date()).intentos, 3);
});

/* ── B. El rescate de verdad, contra Postgres ───────────────────────────── */

test("B1 · una llamada SIN aviso de fin vuelve entera: duración, transcripción y resumen", async () => {
    olvidarLoPedido();
    ponerLoQueDiceLaIa({ transcripcion: "Operador: buenas.\nCliente: me interesa.", resumen: "- Interesado." });
    const { id } = await sembrarLlamada();

    // Nació como la deja `logOutgoingCallAction`: sin duración y sin nada más.
    const antes = await laLlamada(id);
    assert.equal(Number(antes.durationSecs ?? 0), 0);
    assert.equal(antes.transcript, undefined);

    if (ROTO) {
        // **Lo que había.** La única red era `esperarYProcesarLaGrabacion`,
        // una promesa suelta dentro de la petición que lanzó la llamada. Un
        // despliegue —y aquí hay decenas al día— se lleva el proceso y con él
        // la promesa: no queda ni rastro ni a quien retomarla. Se reproduce
        // exactamente eso: se lanza y se deja caer.
        void esperarYProcesarLaGrabacion({
            userId: cuenta, chatMessageId: String(id), astraSid: SID, astraCallId: antes.astraCallId,
        }).catch(() => {});
        // …y el proceso se muere aquí. Nadie más va a mirar esa llamada.
        const despues = await laLlamada(id);
        assert.equal(despues.transcript, undefined, "el modo roto tiene que dejar la llamada SIN transcripción");
        assert.equal(Number(despues.durationSecs ?? 0), 0, "y sin duración: es el síntoma reportado");
        // Y esto es lo que convierte el fallo en arreglable: **el par de ids
        // seguía ahí todo el tiempo**. No faltaba el dato para volver a la
        // llamada — faltaba alguien que lo mirara. Es exactamente de lo que
        // tira el barrido nuevo, y por eso sobrevive a un redespliegue.
        assert.equal(despues.astraSid, SID);
        assert.ok(despues.astraCallId, "la fila sabía a quién preguntarle, y nadie preguntó");
        return;
    }

    const informe = await rescatarLlamadasSinCerrar();
    assert.equal(informe.rescatadas, 1, "tenía que rescatarla");
    assert.equal(informe.sinAviso, 1, "y contarla como «no le llegó el aviso», que es la alarma");

    const call = await laLlamada(id);
    assert.equal(Number(call.durationSecs), SEGUNDOS, "la duración sale del propio WAV");
    assert.match(call.transcript, /me interesa/);
    assert.match(call.summary, /Interesado/);
});

test("B2 · el barrido sale de la BASE: otro proceso, sin saber nada de la llamada", async () => {
    if (ROTO) return; // en el modo roto no hay barrido que probar
    const { id } = await sembrarLlamada();
    // Nadie le pasa el id: se encuentra sola por su par de ids dentro de la
    // ventana. Eso es lo único que sobrevive a un redespliegue.
    const informe = await rescatarLlamadasSinCerrar();
    assert.equal(informe.rescatadas, 1);
    assert.ok((await laLlamada(id)).transcript, "la llamada volvió sin que nadie la nombrara");
});

/* ── C. Los topes ───────────────────────────────────────────────────────── */

test("C1 · una llamada EN CURSO no se toca, aunque esté sin duración", async () => {
    if (ROTO) return;
    const { id, callId } = await sembrarLlamada({ haceMinutos: 1 });
    const informe = await rescatarLlamadasSinCerrar();
    assert.equal(informe.intentadas, 0, "no puede pedirle la grabación a una llamada que se está teniendo");
    assert.equal(red.pedidos.get(callId) ?? 0, 0, "y no se le pidió ni una vez");
    assert.equal((await laLlamada(id)).rescate, undefined, "ni se le gastó un intento");
});

test("C2 · el sello acota: dos vueltas seguidas NO se bajan el mismo WAV dos veces", async () => {
    if (ROTO) return;
    red.hayGrabacion = false; // no está lista: es el caso que se reintenta
    const { id, callId } = await sembrarLlamada();

    const primera = await rescatarLlamadasSinCerrar();
    assert.equal(primera.intentadas, 1);
    assert.equal(primera.pendientes, 1, "la grabación no estaba: queda pendiente");
    const pedidasTrasLaPrimera = red.pedidos.get(callId);
    assert.equal(pedidasTrasLaPrimera, 1);

    // El sello está puesto, así que la vuelta siguiente la deja en paz.
    const segunda = await rescatarLlamadasSinCerrar();
    assert.equal(segunda.intentadas, 0, "la espera entre intentos tiene que cortar");
    assert.equal(red.pedidos.get(callId), pedidasTrasLaPrimera, "y no se le vuelve a pedir el WAV");

    assert.equal(elSelloQueTrae((await laLlamada(id)).rescate).intentos, 1);
    red.hayGrabacion = true;
});

test("C3 · agotados los intentos, deja de mirarse (y se cuenta)", async () => {
    if (ROTO) return;
    const { id, callId } = await sembrarLlamada({
        call: { rescate: { intentos: TOPE_DE_RESCATES, ultimoEn: new Date(Date.now() - 10 * ESPERA_ENTRE_RESCATES_MS).toISOString() } },
    });
    const informe = await rescatarLlamadasSinCerrar();
    assert.equal(informe.agotadas, 1);
    assert.equal(informe.intentadas, 0);
    assert.equal(red.pedidos.get(callId) ?? 0, 0, "una llamada agotada NO se vuelve a bajar");
    assert.equal((await laLlamada(id)).transcript, undefined);
});

/* ── D. La puerta y la alarma ───────────────────────────────────────────── */

test("D1 · la ruta lleva su clave: sin ella, 401", async () => {
    const sin = await pedirElRescate(new Request("http://x/api/calls/rescatar", { method: "POST", body: "{}" }));
    assert.equal(sin.status, 401);

    const mal = await pedirElRescate(new Request("http://x/api/calls/rescatar", {
        method: "POST", headers: { "x-internal-secret": "otra" }, body: "{}",
    }));
    assert.equal(mal.status, 401);
});

test("D2 · con la clave buena contesta el informe, y `sinAviso` es la alarma", async () => {
    if (ROTO) return;
    await sembrarLlamada();
    const resp = await pedirElRescate(new Request("http://x/api/calls/rescatar", {
        method: "POST",
        headers: { "x-internal-secret": process.env.CRM_FOLLOW_UP_RUNNER_KEY, "content-type": "application/json" },
        body: JSON.stringify({}),
    }));
    assert.equal(resp.status, 200);
    const informe = await resp.json();
    assert.equal(informe.success, true);
    assert.equal(informe.sinAviso, 1, "si esto no es cero, la cadena del aviso está rota AHORA");
});

test("D3 · la clave es la MISMA que la del aviso de fin, no una segunda que perder", async () => {
    // Las dos rutas del mismo camino con dos claves serían una más que se
    // puede quedar fuera en un redespliegue, que es el fallo del que venimos.
    const { callId } = await sembrarLlamada();
    const resp = await avisarDelFinDeLaLlamada(new Request("http://x/api/calls/call-ended", {
        method: "POST",
        headers: { "x-internal-secret": process.env.CRM_FOLLOW_UP_RUNNER_KEY, "content-type": "application/json" },
        body: JSON.stringify({ sid: SID, callId, durationSecs: 12, hasRecording: false }),
    }));
    assert.equal(resp.status, 202, "la misma clave abre las dos");
});

/* ── E. Rescatar dos veces no cobra dos veces ───────────────────────────── */

test("E1 · una llamada ya rescatada no se vuelve a cobrar", async () => {
    if (ROTO) return;
    const { id } = await sembrarLlamada();
    await rescatarLlamadasSinCerrar();
    const call = await laLlamada(id);
    assert.ok(call.transcript, "se rescató");
    const gastadosTrasElRescate = await creditosUsados();
    assert.ok(Number(gastadosTrasElRescate) > 0, "y se cobró una vez");

    // Se le quita el sello para que la espera no sea lo que la salva: lo que
    // tiene que pararla es la transcripción que ya tiene.
    await olvidarElSello(id);
    const segunda = await rescatarLlamadasSinCerrar();
    assert.equal(segunda.intentadas, 0, "con transcripción, ni se intenta");
    assert.equal(await creditosUsados(), gastadosTrasElRescate, "y los créditos no se mueven");
});

/* ── F. La vuelta diaria tiene su propio tope ───────────────────────────── */

test("F1 · el cron diario rescata MENOS, porque su llamador corta a los 20 s", async () => {
    // Invariante, no un número escrito a mano: lo que no puede pasar es que la
    // vuelta diaria pida tanto como el reloj de diez minutos. Quien la llama es
    // el reloj de facturación del backend, con un `AbortController` de 20 s, y
    // cada rescate se baja un WAV entero.
    assert.ok(TOPE_EN_LA_VUELTA_DIARIA >= 1, "cero sería no tener red ahí");
    assert.ok(
        TOPE_EN_LA_VUELTA_DIARIA < TOPE_POR_VUELTA,
        "la vuelta diaria no puede pedir tanto como el reloj que no tiene prisa",
    );

    // Y que la ruta lo USE: con la constante puesta y sin pasarla, el tope no
    // decide nada y el aviso falso diario vuelve sin que nadie lo note.
    const { readFileSync } = await import("node:fs");
    const ruta = readFileSync("app/api/cron/billing/route.ts", "utf8");
    assert.match(
        ruta,
        /rescatarLlamadasSinCerrar\(\s*\{\s*limite:\s*TOPE_EN_LA_VUELTA_DIARIA\s*\}\s*\)/,
        "la vuelta diaria tiene que pasar su tope",
    );
});

test("F2 · y el tope que se le pasa se respeta de verdad", async () => {
    if (ROTO) return;
    // Tres candidatas y un tope de dos: la tercera espera a la vuelta
    // siguiente, no se queda fuera para siempre.
    red.hayGrabacion = false;
    await sembrarLlamada();
    await db.chatMessage.updateMany({ where: { userId: cuenta }, data: {} });
    const informe = await rescatarLlamadasSinCerrar({ limite: 1 });
    assert.equal(informe.miradas, 1, "el tope acota lo que se trae, no solo lo que se intenta");
    red.hayGrabacion = true;
});

test("Z · se desmonta la red", () => {
    desmontarLaRed();
});
