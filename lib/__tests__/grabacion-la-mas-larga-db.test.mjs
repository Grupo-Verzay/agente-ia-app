// De varias grabaciones de la misma cita, al CRM va la que dura MÁS DE
// VERDAD, no la que estuvo más rato abierta.
//
// Lo que pasó: una videollamada de 3:40 se oía entera recién colgada y, al
// volver, el detalle solo traía 36 s. La sala se había vuelto a abrir (el
// teléfono recarga la pestaña al volver al navegador) y grabó otra vez; en
// segundo plano el teléfono la congela, así que subió 36 s en varios minutos
// de reloj. Como «la más larga» se medía con el reloj del navegador, esa
// tapó a la buena en la fila del CRM.
//
// Contra Postgres, el bucket de mentira y el `ffmpeg` de verdad (que fabrica
// los medios: 8 s la buena, 3 s la de segundo plano).
// Lo corre `scripts/banco-grabacion-la-mas-larga.sh`; `MODO=roto` contra el
// código de `ANTES_REF` afirma que la corta tapaba a la buena.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const MODO = process.env.MODO ?? "bueno";
const M = await import("./.compilado/grabacion-la-mas-larga/entrada-grabacion-de-videollamada.js");
const { POST, db } = M;
const FFMPEG = join(process.cwd(), "node_modules/@ffmpeg-installer/linux-x64/ffmpeg");
const CUENTA = "cuenta-larga";
const dir = mkdtempSync(join(tmpdir(), "la-mas-larga-"));
const ff = (...a) => execFileSync(FFMPEG, ["-hide_banner", "-loglevel", "error", "-y", ...a]);

for (const [nombre, s] of [["larga", 8], ["corta", 3]]) {
    ff("-f", "lavfi", "-i", `testsrc=size=160x90:rate=10:duration=${s}`, "-c:v", "libvpx", join(dir, `${nombre}-lienzo.webm`));
    ff("-f", "lavfi", "-i", `sine=frequency=440:duration=${s}`, "-c:a", "libopus", join(dir, `${nombre}-voz.webm`));
}

function pedir(cita, consulta, cuerpo) {
    const url = `http://app.test/api/videollamada/grabacion?c=${encodeURIComponent(cita)}&f=${encodeURIComponent(M.laFirmaDeLaCita(cita))}&${consulta}`;
    return POST(new Request(url, { method: "POST", ...(cuerpo ? { body: cuerpo } : {}) }));
}
async function grabar(cita, nombre, segundosDelReloj) {
    const r = await pedir(cita, "a=empezar&formato=webm");
    const { grabacionId: g } = await r.json();
    assert.equal((await pedir(cita, `a=trozo&g=${g}&cual=video&numero=1`, readFileSync(join(dir, `${nombre}-lienzo.webm`)))).status, 200);
    assert.equal((await pedir(cita, `a=trozo&g=${g}&cual=voz&pista=1&desde=0&numero=1`, readFileSync(join(dir, `${nombre}-voz.webm`)))).status, 200);
    const c = await (await pedir(cita, `a=cerrar&g=${g}&segundos=${segundosDelReloj}`)).json();
    assert.equal(c.ok, true, JSON.stringify(c));
    return g;
}
async function laFilaDelCrm(cita) {
    const filas = await db.$queryRaw`SELECT "raw" FROM "chat_messages" WHERE "messageId" = ${"tavus_" + cita} LIMIT 1`;
    return filas[0]?.raw?.call ?? null;
}

test("la sala reabierta en segundo plano no tapa a la llamada entera", async () => {
    const cita = "cita-la-mas-larga";
    assert.equal(await M.reclamarLaCreacion(cita, CUENTA), true);
    await db.$executeRaw`
        INSERT INTO "chat_messages" ("userId", "instanceName", "remoteJid", "messageId", "fromMe", "messageType", "content", "raw", "messageTimestamp", "updatedAt")
        VALUES (${CUENTA}, 'linea', '573001112233@s.whatsapp.net', ${"tavus_" + cita}, true, 'call', 'Videollamada con IA realizada',
                ${JSON.stringify({ call: { isVideo: true, provider: "tavus", transcript: "Asistente: hola", hasRecording: false } })}::jsonb, NOW(), NOW())
    `;
    // La llamada de verdad: 8 s grabados, 8 s de reloj. Va al CRM.
    const larga = await grabar(cita, "larga", 8);
    const tras1 = await laFilaDelCrm(cita);
    assert.match(tras1.videoUrl, new RegExp(`${larga}/video\\.webm$`));

    // La reabierta en segundo plano: 3 s grabados en 300 s de reloj.
    const corta = await grabar(cita, "corta", 300);
    const tras2 = await laFilaDelCrm(cita);
    const ganadora = tras2.videoUrl.includes(larga) ? "larga" : tras2.videoUrl.includes(corta) ? "corta" : "unidas";

    if (MODO === "roto") {
        assert.equal(ganadora, "corta", "ANTES: la de 3 s tapaba a la de 8 s en el CRM");
        return;
    }
    // Desde que las partes de una cita se UNEN (`unirLasPartesDeLaCita`), al
    // CRM va la unión: las dos, con lo que duran de verdad (8 + 3), no 300.
    assert.match(tras2.videoUrl, new RegExp(`/videollamadas/citas/${cita}/video\\.webm$`), "la llamada entera sigue en el CRM");
    assert.ok(Math.abs(tras2.durationSecs - 11) <= 1, `dura lo grabado de verdad (${tras2.durationSecs} s), no 300`);
    const segundos = async (g) => (await M.laGrabacionDeLaSala(g)).segundos;
    assert.ok(Math.abs((await segundos(larga)) - 8) <= 1, `la buena dura ~8 s (${await segundos(larga)})`);
    assert.ok(Math.abs((await segundos(corta)) - 3) <= 1, `la corta dura ~3 s, no 300 (${await segundos(corta)})`);
});

test.after(async () => {
    await db.$disconnect();
});
