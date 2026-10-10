// La DURACIÓN de una videollamada en el CRM es la de la llamada, no la de
// Tavus.
//
// Lo que pasó: el detalle decía 4:33 y la grabación duraba 1:29. El aviso de
// Tavus (que crea la fila del CRM) apuntaba «de entrar al aviso», y Tavus
// avisa cuando cierra la conversación: `participant_left_timeout` (180 s)
// DESPUÉS de que el cliente cuelga. 1:29 + 3:00 ≈ 4:33. La grabación va de
// entrar a colgar: su duración (la que mide ffmpeg) es la que vale.
//
// Contra Postgres, el bucket de mentira y el `ffmpeg` de verdad, en los dos
// órdenes: el aviso de Tavus antes de cerrar la grabación, y después.
// Lo corre `scripts/banco-duracion-de-la-videollamada.sh`; `MODO=roto` contra
// el código de `ANTES_REF` afirma que el CRM se quedaba con los 273 s.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const MODO = process.env.MODO ?? "bueno";
const M = await import("./.compilado/duracion-de-la-videollamada/entrada-grabacion-de-videollamada.js");
const { POST, db } = M;
const FFMPEG = join(process.cwd(), "node_modules/@ffmpeg-installer/linux-x64/ffmpeg");
const CUENTA = "cuenta-duracion";
const dir = mkdtempSync(join(tmpdir(), "duracion-"));
const ff = (...a) => execFileSync(FFMPEG, ["-hide_banner", "-loglevel", "error", "-y", ...a]);
ff("-f", "lavfi", "-i", "testsrc=size=160x90:rate=10:duration=9", "-c:v", "libvpx", join(dir, "lienzo.webm"));
ff("-f", "lavfi", "-i", "sine=frequency=440:duration=9", "-c:a", "libopus", join(dir, "voz.webm"));

// Lo que escribe el aviso de Tavus: 273 s, del momento de entrar al del aviso.
const DEL_AVISO = 273;

function pedir(cita, consulta, cuerpo) {
    const url = `http://app.test/api/videollamada/grabacion?c=${encodeURIComponent(cita)}&f=${encodeURIComponent(M.laFirmaDeLaCita(cita))}&${consulta}`;
    return POST(new Request(url, { method: "POST", ...(cuerpo ? { body: cuerpo } : {}) }));
}
async function grabar(cita) {
    const { grabacionId: g } = await (await pedir(cita, "a=empezar&formato=webm")).json();
    assert.equal((await pedir(cita, `a=trozo&g=${g}&cual=video&numero=1`, readFileSync(join(dir, "lienzo.webm")))).status, 200);
    assert.equal((await pedir(cita, `a=trozo&g=${g}&cual=voz&pista=1&desde=0&numero=1`, readFileSync(join(dir, "voz.webm")))).status, 200);
    const c = await (await pedir(cita, `a=cerrar&g=${g}&segundos=9`)).json();
    assert.equal(c.ok, true, JSON.stringify(c));
}
async function elAvisoDeTavus(cita) {
    await db.$executeRaw`
        INSERT INTO "chat_messages" ("userId", "instanceName", "remoteJid", "messageId", "fromMe", "messageType", "content", "raw", "messageTimestamp", "updatedAt")
        VALUES (${CUENTA}, 'linea', ${"57300" + cita.length + "@s.whatsapp.net"}, ${"tavus_" + cita}, true, 'call', 'Videollamada con IA realizada',
                ${JSON.stringify({ call: { isVideo: true, provider: "tavus", durationSecs: DEL_AVISO, transcript: "Asistente: hola", hasRecording: false } })}::jsonb, NOW(), NOW())
    `;
    // `anotarEnElCrm` escribe la fila y LUEGO copia la grabación.
    await M.copiarLaGrabacionAlCrm(cita);
}
async function laDuracionDelCrm(cita) {
    const filas = await db.$queryRaw`SELECT "raw" FROM "chat_messages" WHERE "messageId" = ${"tavus_" + cita} LIMIT 1`;
    return filas[0]?.raw?.call?.durationSecs;
}

for (const orden of ["el aviso de Tavus llega ANTES de cerrar la grabación", "la grabación se cierra ANTES del aviso de Tavus"]) {
    test(orden, async () => {
        const cita = `cita-duracion-${orden.includes("ANTES de cerrar") ? "a" : "b"}`;
        assert.equal(await M.reclamarLaCreacion(cita, CUENTA), true);
        if (orden.includes("ANTES de cerrar")) {
            await elAvisoDeTavus(cita);
            await grabar(cita);
        } else {
            await grabar(cita);
            await elAvisoDeTavus(cita);
        }
        const duracion = await laDuracionDelCrm(cita);
        if (MODO === "roto") {
            assert.equal(duracion, DEL_AVISO, "ANTES: el CRM se quedaba con los segundos del aviso de Tavus");
            return;
        }
        assert.ok(Math.abs(duracion - 9) <= 1, `la duración es la de la llamada (${duracion} s), no ${DEL_AVISO}`);
    });
}

test.after(async () => {
    await db.$disconnect();
});
