// La llamada COMPLETA y el «Salir» que deja de cobrar, contra Postgres, el
// bucket de mentira y el `ffmpeg` de verdad.
//
// 1. Una recarga de la página abre otra grabación: una llamada de 40 minutos
//    cortada a los 30 quedaba en dos ficheros y el detalle enseñaba solo el de
//    30. Ahora las partes se unen EN ORDEN en un video y ese va al CRM.
// 2. Al pulsar «Salir» se le dice a Tavus que la conversación terminó (deja de
//    cobrar al momento) y se marca finalizada.
//
// Lo corre `scripts/banco-grabacion-completa.sh`; `MODO=roto` contra el código
// de `ANTES_REF` afirma que el CRM se quedaba con la parte más larga y que no
// había forma de terminar la conversación.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const MODO = process.env.MODO ?? "bueno";
const M = await import("./.compilado/grabacion-completa/entrada.js");
const { POST, db, bucket } = M;
const FFMPEG = join(process.cwd(), "node_modules/@ffmpeg-installer/linux-x64/ffmpeg");
const CUENTA = "cuenta-completa";
const dir = mkdtempSync(join(tmpdir(), "completa-"));
const ff = (...a) => execFileSync(FFMPEG, ["-hide_banner", "-loglevel", "error", "-y", ...a]);
// La primera parte: 6 s con un tono de 440 Hz; la segunda (tras la recarga): 4 s con 660 Hz.
for (const [nombre, s, hz] of [["primera", 6, 440], ["segunda", 4, 660]]) {
    ff("-f", "lavfi", "-i", `testsrc=size=160x90:rate=10:duration=${s}`, "-c:v", "libvpx", join(dir, `${nombre}-lienzo.webm`));
    ff("-f", "lavfi", "-i", `sine=frequency=${hz}:duration=${s}`, "-c:a", "libopus", join(dir, `${nombre}-voz.webm`));
}

function pedir(cita, consulta, cuerpo) {
    const url = `http://app.test/api/videollamada/grabacion?c=${encodeURIComponent(cita)}&f=${encodeURIComponent(M.laFirmaDeLaCita(cita))}&${consulta}`;
    return POST(new Request(url, { method: "POST", ...(cuerpo ? { body: cuerpo } : {}) }));
}
async function grabar(cita, nombre, segundos) {
    const { grabacionId: g } = await (await pedir(cita, "a=empezar&formato=webm")).json();
    assert.equal((await pedir(cita, `a=trozo&g=${g}&cual=video&numero=1`, readFileSync(join(dir, `${nombre}-lienzo.webm`)))).status, 200);
    assert.equal((await pedir(cita, `a=trozo&g=${g}&cual=voz&pista=1&desde=0&numero=1`, readFileSync(join(dir, `${nombre}-voz.webm`)))).status, 200);
    const c = await (await pedir(cita, `a=cerrar&g=${g}&segundos=${segundos}`)).json();
    assert.equal(c.ok, true, JSON.stringify(c));
    return g;
}
async function laFilaDelCrm(cita) {
    const filas = await db.$queryRaw`SELECT "raw" FROM "chat_messages" WHERE "messageId" = ${"tavus_" + cita} LIMIT 1`;
    return filas[0]?.raw?.call ?? null;
}
/** Cruces por cero por segundo entre `desde` y `hasta`: 440 Hz ≈ 880, 660 Hz ≈ 1320. */
function cruces(archivo, desde, hasta) {
    const pcm = execFileSync(FFMPEG, ["-hide_banner", "-loglevel", "error", "-i", archivo, "-vn", "-ac", "1", "-ar", "48000", "-f", "s16le", "-"], { maxBuffer: 64 * 1024 * 1024 });
    const m = new Int16Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.length / 2));
    let n = 0;
    for (let i = Math.floor(desde * 48000) + 1; i < Math.min(m.length, hasta * 48000); i += 1) if ((m[i - 1] < 0) !== (m[i] < 0)) n += 1;
    return { porSegundo: n / (hasta - desde), segundos: m.length / 48000 };
}

test("una llamada cortada por una recarga se ve ENTERA: las partes, unidas en orden", async () => {
    const cita = "cita-completa";
    assert.equal(await M.reclamarLaCreacion(cita, CUENTA), true);
    await db.$executeRaw`
        INSERT INTO "chat_messages" ("userId", "instanceName", "remoteJid", "messageId", "fromMe", "messageType", "content", "raw", "messageTimestamp", "updatedAt")
        VALUES (${CUENTA}, 'linea', '573009998877@s.whatsapp.net', ${"tavus_" + cita}, true, 'call', 'Videollamada con IA realizada',
                ${JSON.stringify({ call: { isVideo: true, provider: "tavus", transcript: "Asistente: hola", hasRecording: false } })}::jsonb, NOW(), NOW())
    `;
    const primera = await grabar(cita, "primera", 6);
    const segunda = await grabar(cita, "segunda", 4);
    const call = await laFilaDelCrm(cita);

    if (MODO === "roto") {
        assert.ok(call.videoUrl.includes(primera), "ANTES: el CRM se quedaba con la parte más larga (6 s) y la segunda no se veía");
        return;
    }
    assert.match(call.videoUrl, new RegExp(`/videollamadas/citas/${cita}/video\\.webm$`), "el video de la cita entera");
    assert.match(call.recordingUrl, new RegExp(`/videollamadas/citas/${cita}/audio\\.webm$`));
    assert.ok(Math.abs(call.durationSecs - 10) <= 1, `dura las dos partes (${call.durationSecs} s)`);

    const llave = [...bucket.keys()].find((k) => k.endsWith(`citas/${cita}/video.webm`));
    writeFileSync(join(dir, "unido.webm"), bucket.get(llave).bytes);
    const alPrincipio = cruces(join(dir, "unido.webm"), 1, 4);
    const alFinal = cruces(join(dir, "unido.webm"), 7, 9.5);
    assert.ok(alPrincipio.segundos >= 9.5, `el video unido dura ~10 s (${alPrincipio.segundos})`);
    assert.ok(Math.abs(alPrincipio.porSegundo - 880) < 90, `primero la primera parte (${alPrincipio.porSegundo}/s)`);
    assert.ok(Math.abs(alFinal.porSegundo - 1320) < 130, `después la segunda (${alFinal.porSegundo}/s)`);
    // Las partes siguen guardadas: la unión no borra nada.
    assert.ok((await M.laGrabacionDeLaSala(primera)).videoUrl);
    assert.ok((await M.laGrabacionDeLaSala(segunda)).videoUrl);
});

test("al pulsar «Salir», Tavus termina la conversación al momento y queda finalizada", async () => {
    const cita = "cita-salir";
    assert.equal(await M.reclamarLaCreacion(cita, CUENTA), true);
    await M.apuntarLaConversacion(cita, "c-salir-123", "https://tavus.daily.co/c-salir-123");
    const llamadas = [];
    const fetchReal = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
        llamadas.push({ url: String(url), metodo: init?.method, clave: init?.headers?.["x-api-key"] });
        return new Response("{}", { status: 200 });
    };
    try {
        const url = `http://app.test/api/videollamada/sala?c=${cita}&f=${encodeURIComponent(M.laFirmaDeLaCita(cita))}`;
        if (MODO === "roto") {
            assert.equal(typeof M.Sala.DELETE, "undefined", "ANTES: la sala no tenía cómo terminar la conversación");
            return;
        }
        const sinFirma = await M.Sala.DELETE(new Request(`http://app.test/api/videollamada/sala?c=${cita}&f=mala`, { method: "DELETE" }));
        assert.equal(sinFirma.status, 401);
        const r = await (await M.Sala.DELETE(new Request(url, { method: "DELETE" }))).json();
        assert.equal(r.ok, true, JSON.stringify(r));
        assert.deepEqual(llamadas.map((l) => [l.url, l.metodo]), [["https://tavusapi.com/v2/conversations/c-salir-123/end", "POST"]]);
        assert.equal(llamadas[0].clave, process.env.TAVUS_API_KEY, "con la clave de Tavus, que nunca sale al navegador");
        assert.equal((await M.laVideollamada(cita)).estado, "finalizada");
        // Otra vez (dos pestañas, o el aviso de Tavus que llega luego): no se vuelve a llamar.
        await M.Sala.DELETE(new Request(url, { method: "DELETE" }));
        assert.equal(llamadas.length, 1);
    } finally {
        globalThis.fetch = fetchReal;
    }
});

test.after(async () => {
    await db.$disconnect();
});
