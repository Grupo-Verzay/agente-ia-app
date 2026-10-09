// La grabación de VOCES SUELTAS contra Postgres, un bucket de mentira y el
// `ffmpeg` de verdad (el de `@ffmpeg-installer`, el mismo que lleva el
// contenedor). La sala ya no mezcla en el navegador: sube el video (solo el
// lienzo) y cada voz por su lado con su `desde`; el cierre las mezcla.
//
// Los medios de prueba los fabrica el propio ffmpeg (un video vp8 de 8 s, un
// tono de 440 Hz desde el segundo 0 y otro de 660 Hz que entra a los 4 s) y
// se cortan en trozos como los de `MediaRecorder` (sus bytes, en orden).
// Lo corre `scripts/banco-grabacion-voces-sueltas.sh`.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const M = await import("./.compilado/grabacion-de-voces/entrada-grabacion-de-videollamada.js");
const { POST, db, bucket } = M;
const FFMPEG = M.elFfmpeg();

const CUENTA = "cuenta-voces";
const dir = mkdtempSync(join(tmpdir(), "voces-"));
const ff = (...a) => execFileSync(FFMPEG, ["-hide_banner", "-loglevel", "error", "-y", ...a]);

ff("-f", "lavfi", "-i", "testsrc=size=320x180:rate=10:duration=8", "-c:v", "libvpx", "-b:v", "300k", join(dir, "lienzo.webm"));
ff("-f", "lavfi", "-i", "sine=frequency=440:duration=8", "-c:a", "libopus", join(dir, "verzy.webm"));
ff("-f", "lavfi", "-i", "sine=frequency=660:duration=4", "-c:a", "libopus", join(dir, "cliente.webm"));

/** Cortar un fichero en `n` trozos, como los suelta `MediaRecorder` cada 10 s. */
function enTrozos(archivo, n) {
    const b = readFileSync(archivo);
    const largo = Math.ceil(b.length / n);
    return Array.from({ length: n }, (_, i) => b.subarray(i * largo, (i + 1) * largo)).filter((t) => t.length);
}

function pedir(cita, consulta, cuerpo) {
    const url = `http://app.test/api/videollamada/grabacion?c=${encodeURIComponent(cita)}&f=${encodeURIComponent(M.laFirmaDeLaCita(cita))}&${consulta}`;
    return POST(new Request(url, { method: "POST", ...(cuerpo ? { body: cuerpo } : {}) }));
}
async function empezar(cita) {
    const r = await pedir(cita, "a=empezar&formato=webm");
    const j = await r.json();
    assert.equal(r.status, 200, JSON.stringify(j));
    return j.grabacionId;
}
async function subirTodo(cita, g, cual, trozos, extra = "") {
    for (const [i, t] of trozos.entries()) {
        const r = await pedir(cita, `a=trozo&g=${g}&cual=${cual}&numero=${i + 1}${extra}`, t);
        assert.equal(r.status, 200, `${cual} ${i + 1}: ${await r.text()}`);
    }
}
async function nuevaCita(nombre) {
    assert.equal(await M.reclamarLaCreacion(nombre, CUENTA), true);
    return nombre;
}
const delBucket = (sufijo) => {
    const k = [...bucket.keys()].find((x) => x.endsWith(sufijo));
    return k ? bucket.get(k) : null;
};

/** Cruces por cero por segundo entre `desde` y `hasta` (s): 440 Hz ≈ 880, con 660 encima, más. */
function cruces(archivo, desde, hasta) {
    const pcm = execFileSync(FFMPEG, ["-hide_banner", "-loglevel", "error", "-i", archivo, "-vn", "-ac", "1", "-ar", "48000", "-f", "s16le", "-"], { maxBuffer: 64 * 1024 * 1024 });
    const m = new Int16Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.length / 2));
    let n = 0;
    let energia = 0;
    for (let i = Math.floor(desde * 48000) + 1; i < Math.min(m.length, hasta * 48000); i += 1) {
        if ((m[i - 1] < 0) !== (m[i] < 0)) n += 1;
        energia += m[i] * m[i];
    }
    const muestras = (hasta - desde) * 48000;
    return { porSegundo: n / (hasta - desde), rms: Math.sqrt(energia / muestras) / 32768, segundos: m.length / 48000 };
}
/** Lo que ffmpeg dice que hay dentro (pistas y códecs). */
function loQueLleva(archivo) {
    try {
        execFileSync(FFMPEG, ["-hide_banner", "-i", archivo], { stdio: ["ignore", "ignore", "pipe"] });
    } catch (e) {
        return String(e.stderr);
    }
    return "";
}

test("la ruta acepta VOCES con su pista y su desde, y les pone techo", async (t) => {
    const cita = await nuevaCita("cita-voces-puertas");
    const g = await empezar(cita);
    await t.test("pista fuera de rango (400)", async () => {
        assert.equal((await pedir(cita, `a=trozo&g=${g}&cual=voz&pista=0&desde=0&numero=1`, Buffer.from("x"))).status, 400);
        assert.equal((await pedir(cita, `a=trozo&g=${g}&cual=voz&pista=41&desde=0&numero=1`, Buffer.from("x"))).status, 400);
    });
    await t.test("desde negativo o roto (400)", async () => {
        assert.equal((await pedir(cita, `a=trozo&g=${g}&cual=voz&pista=1&desde=-5&numero=1`, Buffer.from("x"))).status, 400);
        assert.equal((await pedir(cita, `a=trozo&g=${g}&cual=voz&pista=1&desde=abc&numero=1`, Buffer.from("x"))).status, 400);
    });
    await t.test("tope de voces: caben 40, y una ya abierta sigue subiendo", async () => {
        for (let p = 1; p <= 40; p += 1) {
            assert.equal((await pedir(cita, `a=trozo&g=${g}&cual=voz&pista=${p}&desde=0&numero=1`, Buffer.from("x"))).status, 200);
        }
        const filas = await db.$queryRaw`SELECT COUNT(*)::int AS n FROM "videollamada_grabacion_voces" WHERE "grabacionId" = ${g}`;
        assert.equal(filas[0].n, 40);
        assert.equal((await pedir(cita, `a=trozo&g=${g}&cual=voz&pista=40&desde=0&numero=2`, Buffer.from("x"))).status, 200);
    });
});

test("al cerrar, ffmpeg mezcla cada voz EN SU SITIO y la pega al video", async () => {
    const cita = await nuevaCita("cita-voces-mezcla");
    const g = await empezar(cita);
    await subirTodo(cita, g, "video", enTrozos(join(dir, "lienzo.webm"), 3));
    await subirTodo(cita, g, "voz", enTrozos(join(dir, "verzy.webm"), 2), "&pista=1&desde=0");
    await subirTodo(cita, g, "voz", enTrozos(join(dir, "cliente.webm"), 2), "&pista=2&desde=4000");
    const r = await (await pedir(cita, `a=cerrar&g=${g}&segundos=8`)).json();
    assert.deepEqual(r, { ok: true, hecho: "lista" });

    const fila = await M.laGrabacionDeLaSala(g);
    assert.equal(fila.estado, "lista");
    assert.match(fila.videoUrl, /\/videollamadas\/.+\/video\.webm$/);
    assert.match(fila.audioUrl, /\/videollamadas\/.+\/audio\.webm$/);

    const video = delBucket(`${g}/video.webm`);
    const audio = delBucket(`${g}/audio.webm`);
    assert.ok(video && audio, "los dos ficheros en el bucket");
    assert.equal(video.tipo, "video/webm");
    assert.equal(audio.tipo, "audio/webm");
    writeFileSync(join(dir, "salida-video.webm"), video.bytes);
    writeFileSync(join(dir, "salida-audio.webm"), audio.bytes);

    const lleva = loQueLleva(join(dir, "salida-video.webm"));
    assert.match(lleva, /Video: vp8/, "el video se COPIA, no se recodifica");
    assert.match(lleva, /Audio: opus/, "y lleva la mezcla dentro");

    // Antes de los 4 s solo suena Verzy (440 Hz); después, los dos.
    const antes = cruces(join(dir, "salida-video.webm"), 1, 3);
    const despues = cruces(join(dir, "salida-video.webm"), 5, 7);
    assert.ok(antes.rms > 0.05, `suena desde el principio (rms ${antes.rms})`);
    assert.ok(antes.porSegundo > 800 && antes.porSegundo < 960, `solo Verzy al principio (${antes.porSegundo}/s)`);
    assert.ok(despues.porSegundo > 1000, `el cliente entra a los 4 s (${despues.porSegundo}/s)`);
    assert.ok(antes.segundos >= 7.5, `dura lo grabado (${antes.segundos} s)`);
    const soloAudio = cruces(join(dir, "salida-audio.webm"), 5, 7);
    assert.ok(soloAudio.porSegundo > 1000, "el audio suelto es la misma mezcla");

    assert.equal([...bucket.keys()].filter((k) => k.includes(`${g}/trozos-`)).length, 0, "los trozos se borran");
});

test("sin ffmpeg no se pierde la llamada: video mudo y la voz más larga", async () => {
    const cita = await nuevaCita("cita-voces-sin-ffmpeg");
    const g = await empezar(cita);
    await subirTodo(cita, g, "video", enTrozos(join(dir, "lienzo.webm"), 2));
    await subirTodo(cita, g, "voz", enTrozos(join(dir, "verzy.webm"), 2), "&pista=1&desde=0");
    await subirTodo(cita, g, "voz", enTrozos(join(dir, "cliente.webm"), 1), "&pista=2&desde=4000");
    const antes = process.env.FFMPEG_PATH;
    process.env.FFMPEG_PATH = "/bin/false";
    try {
        const r = await (await pedir(cita, `a=cerrar&g=${g}&segundos=8`)).json();
        assert.deepEqual(r, { ok: true, hecho: "lista" });
    } finally {
        if (antes === undefined) delete process.env.FFMPEG_PATH;
        else process.env.FFMPEG_PATH = antes;
    }
    assert.deepEqual(delBucket(`${g}/video.webm`).bytes, readFileSync(join(dir, "lienzo.webm")), "el video tal cual");
    assert.deepEqual(delBucket(`${g}/audio.webm`).bytes, readFileSync(join(dir, "verzy.webm")), "la voz más larga");
});

test("una sala de ANTES (mezcla en el navegador, `cual=audio`) se junta como siempre", async () => {
    const cita = await nuevaCita("cita-voces-antigua");
    const g = await empezar(cita);
    await subirTodo(cita, g, "audio", [Buffer.alloc(300, 1), Buffer.alloc(300, 2)]);
    await subirTodo(cita, g, "video", [Buffer.alloc(500, 3)]);
    const r = await (await pedir(cita, `a=cerrar&g=${g}&segundos=20`)).json();
    assert.deepEqual(r, { ok: true, hecho: "lista" });
    assert.deepEqual(delBucket(`${g}/audio.webm`).bytes, Buffer.concat([Buffer.alloc(300, 1), Buffer.alloc(300, 2)]));
});

test.after(async () => {
    await db.$disconnect();
});
