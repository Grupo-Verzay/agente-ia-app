// La grabación de la videollamada contra Postgres y un bucket de mentira: la
// ruta pública (firma de la cita), los trozos de 10 s juntados EN ORDEN en
// partes de ≥5 MiB, y la grabación llevada a `raw.call` de la fila del CRM
// llegue antes o después que la transcripción de Tavus.
// Lo corre `scripts/banco-detalle-de-videollamada.sh`.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const M = await import("./.compilado/grabacion-de-videollamada/entrada-grabacion-de-videollamada.js");
const { POST, db, bucket, fallan } = M;

const CUENTA = "cuenta-video";
const BUCKET = "verzay-media";

function pedir(cita, consulta, cuerpo, firma = M.laFirmaDeLaCita(cita)) {
    const url = `http://app.test/api/videollamada/grabacion?c=${encodeURIComponent(cita)}&f=${encodeURIComponent(firma)}&${consulta}`;
    return POST(new Request(url, { method: "POST", ...(cuerpo ? { body: cuerpo } : {}) }));
}
async function empezar(cita, formato = "webm") {
    const r = await pedir(cita, `a=empezar&formato=${formato}`);
    const j = await r.json();
    assert.equal(r.status, 200, JSON.stringify(j));
    return j.grabacionId;
}
const trozo = (marca, bytes) => Buffer.alloc(bytes, marca);
async function subir(cita, g, cual, numero, cuerpo) {
    return pedir(cita, `a=trozo&g=${g}&cual=${cual}&numero=${numero}`, cuerpo);
}
async function cerrar(cita, g, segundos = 60) {
    const r = await pedir(cita, `a=cerrar&g=${g}&segundos=${segundos}`);
    return r.json();
}
async function laFilaDelCrm(cita) {
    const filas = await db.$queryRaw`SELECT "raw" FROM "chat_messages" WHERE "messageId" = ${"tavus_" + cita} LIMIT 1`;
    return filas[0]?.raw?.call ?? null;
}
async function sembrarLaFilaDelCrm(cita) {
    await db.$executeRaw`
        INSERT INTO "chat_messages" ("userId", "instanceName", "remoteJid", "messageId", "fromMe", "messageType", "content", "raw", "messageTimestamp", "updatedAt")
        VALUES (${CUENTA}, 'linea', ${"57300" + cita.length + "@s.whatsapp.net"}, ${"tavus_" + cita}, true, 'call', 'Videollamada con IA realizada',
                ${JSON.stringify({ call: { isVideo: true, provider: "tavus", transcript: "Cliente: hola\nAsistente: buenas", summary: "Resumen de prueba", hasRecording: false } })}::jsonb,
                NOW(), NOW())
    `;
}
async function nuevaCita(nombre) {
    assert.equal(await M.reclamarLaCreacion(nombre, CUENTA), true);
    return nombre;
}
const enElBucket = (sufijo) => [...bucket.keys()].filter((k) => k.includes(sufijo));

test("la ruta: firma, dueño de la grabación y techos", async (t) => {
    const cita = await nuevaCita("cita-puertas");
    await t.test("sin la firma de la cita no se abre (401)", async () => {
        const r = await pedir(cita, "a=empezar", null, "mala");
        assert.equal(r.status, 401);
    });
    await t.test("una cita sin videollamada no graba (404)", async () => {
        const r = await pedir("cita-que-no-existe", "a=empezar");
        assert.equal(r.status, 404);
    });
    const g = await empezar(cita);
    await t.test("la grabación de OTRA cita no se toca, aunque la firma sea buena (403)", async () => {
        const otra = await nuevaCita("cita-ajena");
        const r = await subir(otra, g, "audio", 1, trozo(1, 10));
        assert.equal(r.status, 403);
    });
    await t.test("un trozo demasiado grande se rechaza (413) y no se guarda", async () => {
        const r = await subir(cita, g, "video", 1, trozo(1, 8 * 1024 * 1024 + 1));
        assert.equal(r.status, 413);
        assert.equal(enElBucket(`${g}/trozos-video`).length, 0);
    });
    await t.test("número de trozo fuera de rango (400)", async () => {
        assert.equal((await subir(cita, g, "audio", 0, trozo(1, 10))).status, 400);
        assert.equal((await subir(cita, g, "audio", 99999, trozo(1, 10))).status, 400);
    });
    await t.test("tras cerrar, un trozo tardío no entra (409)", async () => {
        await subir(cita, g, "audio", 1, trozo(7, 100));
        await cerrar(cita, g);
        assert.equal((await subir(cita, g, "audio", 2, trozo(8, 100))).status, 409);
    });
    await t.test("tope de grabaciones por cita (429)", async () => {
        const muchas = await nuevaCita("cita-recargas");
        for (let i = 0; i < 20; i += 1) await empezar(muchas);
        const r = await pedir(muchas, "a=empezar");
        assert.equal(r.status, 429);
    });
});

test("los trozos se juntan EN ORDEN, en partes de ≥5 MiB, y se borran", async () => {
    const cita = await nuevaCita("cita-orden");
    const g = await empezar(cita);
    // Audio: tres trozos pequeños (diez segundos a 32 kbps son ~40 KB).
    for (let n = 1; n <= 3; n += 1) assert.equal((await subir(cita, g, "audio", n, trozo(n, 40_000))).status, 200);
    // Video: siete trozos de 1,5 MiB → una parte de 9 MiB y otra de 1,5 MiB.
    const MB15 = 1.5 * 1024 * 1024;
    for (let n = 1; n <= 7; n += 1) assert.equal((await subir(cita, g, "video", n, trozo(100 + n, MB15))).status, 200);

    const r = await cerrar(cita, g, 70);
    assert.deepEqual(r, { ok: true, hecho: "lista" });

    const audio = bucket.get(`${BUCKET}/${CUENTA}/videollamadas/${g}/audio.webm`);
    const video = bucket.get(`${BUCKET}/${CUENTA}/videollamadas/${g}/video.webm`);
    assert.ok(audio && video, "salen los dos ficheros");
    assert.equal(audio.bytes.length, 120_000);
    assert.deepEqual([audio.bytes[0], audio.bytes[40_000], audio.bytes[80_000]], [1, 2, 3], "audio en orden");
    assert.equal(video.bytes.length, 7 * MB15);
    assert.deepEqual([0, 1, 2, 3, 4, 5, 6].map((i) => video.bytes[i * MB15]), [101, 102, 103, 104, 105, 106, 107], "video en orden");
    assert.equal(video.tipo, "video/webm");
    assert.equal(enElBucket(`${g}/trozos-`).length, 0, "los trozos se borran");
    assert.equal(enElBucket(`${g}/partes-`).length, 0, "las partes se borran");

    const fila = await M.laGrabacionDeLaSala(g);
    assert.equal(fila.estado, "lista");
    assert.equal(fila.segundos, 70);
    assert.match(fila.videoUrl, /^http:\/\/bucket\.test\/verzay-media\/cuenta-video\/videollamadas\/.+\/video\.webm$/);
});

test("Safari: graba mp4 y se guarda como mp4", async () => {
    const cita = await nuevaCita("cita-iphone");
    const g = await empezar(cita, "mp4");
    await subir(cita, g, "video", 1, trozo(9, 1000));
    await subir(cita, g, "audio", 1, trozo(9, 100));
    await cerrar(cita, g);
    const video = bucket.get(`${BUCKET}/${CUENTA}/videollamadas/${g}/video.mp4`);
    assert.ok(video, "video.mp4");
    assert.equal(video.tipo, "video/mp4");
    assert.ok(bucket.get(`${BUCKET}/${CUENTA}/videollamadas/${g}/audio.mp4`), "audio.mp4");
});

test("un trozo perdido se SALTA: el fichero sale con el resto", async () => {
    const cita = await nuevaCita("cita-hueco");
    const g = await empezar(cita);
    for (let n = 1; n <= 3; n += 1) await subir(cita, g, "audio", n, trozo(n, 500));
    fallan.add(`${BUCKET}/${CUENTA}/videollamadas/${g}/trozos-audio/00002.webm`);
    const r = await cerrar(cita, g);
    assert.equal(r.ok, true);
    const audio = bucket.get(`${BUCKET}/${CUENTA}/videollamadas/${g}/audio.webm`);
    assert.equal(audio.bytes.length, 1000);
    assert.deepEqual([audio.bytes[0], audio.bytes[500]], [1, 3]);
});

test("sin ningún trozo se cierra como FALLIDA, no se queda en grabando", async () => {
    const cita = await nuevaCita("cita-vacia");
    const g = await empezar(cita);
    const r = await cerrar(cita, g);
    assert.deepEqual(r, { ok: false, hecho: "fallida" });
    assert.equal((await M.laGrabacionDeLaSala(g)).estado, "fallida");
});

test("dos cierres a la vez (colgar + cerrar la pestaña): junta UNO", async () => {
    const cita = await nuevaCita("cita-doble");
    const g = await empezar(cita);
    await subir(cita, g, "audio", 1, trozo(5, 300));
    const [a, b] = await Promise.all([cerrar(cita, g), cerrar(cita, g)]);
    assert.deepEqual([a.hecho, b.hecho].sort(), ["lista", "ya_cerrada"]);
});

test("la grabación llega a la fila del CRM en los DOS órdenes", async (t) => {
    await t.test("la transcripción llegó antes: el cierre mezcla en raw.call sin pisar lo demás", async () => {
        const cita = await nuevaCita("cita-crm-a");
        await sembrarLaFilaDelCrm(cita);
        const g = await empezar(cita);
        await subir(cita, g, "audio", 1, trozo(1, 200));
        await subir(cita, g, "video", 1, trozo(2, 400));
        await cerrar(cita, g, 95);
        const call = await laFilaDelCrm(cita);
        assert.equal(call.hasRecording, true);
        assert.match(call.recordingUrl, /audio\.webm$/);
        assert.match(call.videoUrl, /video\.webm$/);
        assert.equal(call.transcript, "Cliente: hola\nAsistente: buenas", "la transcripción sigue");
        assert.equal(call.summary, "Resumen de prueba", "el resumen sigue");
        assert.equal(call.isVideo, true);
    });
    await t.test("la grabación se cerró antes: la fila aún no existe, y al crearla se copia", async () => {
        const cita = await nuevaCita("cita-crm-b");
        const g = await empezar(cita);
        await subir(cita, g, "video", 1, trozo(2, 400));
        await cerrar(cita, g);
        assert.equal(await laFilaDelCrm(cita), null, "todavía no hay fila");
        await sembrarLaFilaDelCrm(cita);
        // Lo que hace `anotarEnElCrm` justo después de escribir la fila.
        assert.equal(await M.copiarLaGrabacionAlCrm(cita), true);
        const call = await laFilaDelCrm(cita);
        assert.equal(call.hasRecording, true);
        assert.match(call.videoUrl, /video\.webm$/);
        assert.equal("recordingUrl" in call, false, "sin audio no se escribe un null");
    });
    await t.test("con dos grabaciones (una recarga), gana la más larga", async () => {
        const cita = await nuevaCita("cita-crm-c");
        await sembrarLaFilaDelCrm(cita);
        const corta = await empezar(cita);
        await subir(cita, corta, "video", 1, trozo(1, 10));
        await cerrar(cita, corta, 20);
        // La más larga DE VERDAD: tres trozos (30 s). El reloj del navegador
        // ya no basta (ver `grabacion-la-mas-larga-db.test.mjs`): un trozo son
        // como mucho 10 s, diga lo que diga el reloj.
        const larga = await empezar(cita);
        for (const n of [1, 2, 3]) await subir(cita, larga, "video", n, trozo(1, 10));
        await cerrar(cita, larga, 600);
        const otra = await empezar(cita);
        await subir(cita, otra, "video", 1, trozo(1, 10));
        await cerrar(cita, otra, 30);
        const call = await laFilaDelCrm(cita);
        assert.ok(call.videoUrl.includes(larga), "la de tres trozos");
    });
    await t.test("anotarEnElCrm copia la grabación DESPUÉS de escribir la fila", () => {
        const fuente = readFileSync("lib/videollamada-ia-aviso.server.ts", "utf8");
        const escribe = fuente.indexOf("await persistChatMessage(");
        const copia = fuente.indexOf("copiarLaGrabacionAlCrm(citaId)");
        assert.ok(escribe > 0 && copia > escribe, "persistChatMessage y luego copiarLaGrabacionAlCrm");
    });
});

test("el barrido junta las grabaciones cuya pestaña murió sin avisar", async () => {
    const cita = await nuevaCita("cita-huerfana");
    const g = await empezar(cita);
    await subir(cita, g, "audio", 1, trozo(4, 300));
    await db.$executeRaw`UPDATE "videollamada_grabaciones" SET "vistaEn" = NOW() - INTERVAL '3 hours', "creadaEn" = NOW() - INTERVAL '4 hours' WHERE "id" = ${g}`;
    const fresca = await empezar(cita);
    await subir(cita, fresca, "audio", 1, trozo(4, 300));
    const r = await M.recogerLasGrabacionesDeLaSala();
    assert.ok(r.recogidas >= 1);
    assert.equal((await M.laGrabacionDeLaSala(g)).estado, "lista");
    // El reloj dice una hora, pero un solo trozo son como mucho 10 s.
    assert.equal((await M.laGrabacionDeLaSala(g)).segundos, 10, "los segundos salen de lo que subió");
    assert.equal((await M.laGrabacionDeLaSala(fresca)).estado, "grabando", "la que sigue viva no se toca");
});

test.after(async () => {
    await db.$disconnect();
});
