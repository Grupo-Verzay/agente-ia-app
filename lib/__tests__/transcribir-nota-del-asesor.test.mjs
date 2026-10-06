// Se puede transcribir también la nota de voz del ASESOR, no solo la del
// cliente: para revisar qué le dice el equipo a los clientes.
//
// Lo levanta scripts/banco-transcribir-nota-del-asesor.sh. Con MODO=roto los
// ficheros son los de ANTES_REF y se AFIRMA el fallo: la nota del asesor no
// se ofrecía (la burbuja la escondía) ni se encontraba (la consulta pedía
// `fromMe = FALSE`).
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const ROTO = process.env.MODO === "roto";
const SALIDA = new URL("./.compilado/nota-del-asesor/", import.meta.url);
const leer = (f) => readFileSync(new URL(f, SALIDA), "utf8");

const regla = await import(new URL("regla.mjs", SALIDA).href);
const { laNotaDeVoz, guardarLaTranscripcion, db } = await import(
    new URL("entrada.mjs", SALIDA).href
);

after(async () => {
    await db.$disconnect();
});

// --- 1. la regla ---------------------------------------------------------

test("regla: la nota del asesor se puede transcribir, y un audio adjunto no", () => {
    if (ROTO) {
        assert.equal(regla.esNotaDeVozTranscribible, undefined);
        // La regla de antes solo dejaba la del cliente.
        assert.equal(
            regla.esNotaDeVozDeCliente({ fromMe: true, audio: { ptt: true } }),
            false,
        );
        return;
    }
    const es = regla.esNotaDeVozTranscribible;
    assert.equal(es({ fromMe: true, audio: { ptt: true } }), true, "asesor");
    assert.equal(es({ fromMe: false, audio: { ptt: true } }), true, "cliente");
    assert.equal(es({ fromMe: true, audio: {} }), true, "sin ptt cuenta como nota");
    assert.equal(es({ fromMe: true, audio: { ptt: false } }), false, "audio adjunto");
    assert.equal(es({ fromMe: true }), false, "sin audio");
});

// --- 2. barrido ------------------------------------------------------------

test("barrido: la burbuja ofrece transcribir en los mensajes propios", () => {
    const burbuja = leer("MessageBubble.tsx");
    const linea = burbuja
        .split("\n")
        .find((l) => /esNota(DeVoz|Entrante)\s*:/.test(l));
    assert.ok(linea, "la burbuja pasa si es una nota de voz");
    if (ROTO) {
        assert.match(linea, /!isUserMessage &&/, "antes la escondía en lo propio");
        return;
    }
    assert.doesNotMatch(linea, /isUserMessage/, "no depende de quién la mandó");
    assert.match(burbuja, /enMensajePropio:\s*isUserMessage/, "texto claro sobre burbuja de color");
});

test("barrido: la consulta no filtra por fromMe", () => {
    const sql = leer("transcribir-nota-de-chat.ts");
    if (ROTO) {
        assert.match(sql, /"fromMe" = FALSE/);
        return;
    }
    assert.doesNotMatch(sql, /"fromMe"\s*=\s*FALSE/);
});

// --- 3. contra Postgres ------------------------------------------------------

const vuelta = Date.now().toString(36);
const CUENTA = `cuenta-${vuelta}`;
const LINEA = "VENTAS";
const JID = "573001112233@s.whatsapp.net";

async function sembrar(messageId, fromMe) {
    await db.$executeRaw`
        INSERT INTO "chat_messages"
            ("userId", "instanceName", "remoteJid", "messageId", "fromMe",
             "messageType", "mediaUrl", "raw", "messageTimestamp", "updatedAt")
        VALUES (${CUENTA}, ${LINEA}, ${JID}, ${messageId}, ${fromMe},
                'audioMessage', 'https://archivos.ejemplo.co/nota.ogg',
                ${JSON.stringify({ message: { audioMessage: { seconds: 40, ptt: true } } })}::jsonb,
                NOW(), NOW())
    `;
}

const buscar = (messageId) =>
    laNotaDeVoz({
        userIds: [CUENTA],
        instanceName: LINEA,
        messageId,
        candidatos: [JID],
    });

test("postgres: encuentra la nota del cliente y la del asesor", async () => {
    await sembrar(`cliente-${vuelta}`, false);
    await sembrar(`asesor-${vuelta}`, true);

    const delCliente = await buscar(`cliente-${vuelta}`);
    assert.ok(delCliente, "la del cliente se encuentra siempre");
    assert.equal(delCliente.segundos, 40);

    const delAsesor = await buscar(`asesor-${vuelta}`);
    if (ROTO) {
        assert.equal(delAsesor, null, "antes la del asesor no se encontraba");
        return;
    }
    assert.ok(delAsesor, "la del asesor se encuentra");
    assert.equal(delAsesor.segundos, 40, "y con su duración: es su precio");
    assert.equal(delAsesor.mediaUrl, "https://archivos.ejemplo.co/nota.ogg");

    // Se guarda (y se cobra) una sola vez.
    assert.equal(await guardarLaTranscripcion(delAsesor.fila, "Hola, te confirmo la cita"), true);
    assert.equal(await guardarLaTranscripcion(delAsesor.fila, "otra vez"), false);
    const otra = await buscar(`asesor-${vuelta}`);
    assert.equal(otra.transcripcion, "Hola, te confirmo la cita");
});

test("postgres: no cruza de cuenta ni de línea", async () => {
    const ajena = await laNotaDeVoz({
        userIds: ["otra-cuenta"],
        instanceName: LINEA,
        messageId: `asesor-${vuelta}`,
        candidatos: [JID],
    });
    assert.equal(ajena, null);
    const otraLinea = await laNotaDeVoz({
        userIds: [CUENTA],
        instanceName: "ATENCION",
        messageId: `asesor-${vuelta}`,
        candidatos: [JID],
    });
    assert.equal(otraLinea, null);
});
