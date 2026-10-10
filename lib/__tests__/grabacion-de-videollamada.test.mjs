// Las reglas puras de la grabación de la videollamada con IA.
// Lo corre `scripts/banco-detalle-de-videollamada.sh`.
import test from "node:test";
import assert from "node:assert/strict";

const G = await import("./.compilado/grabacion-de-videollamada/puro.js");
const R = await import("./.compilado/grabacion-de-videollamada/reunion.js");

test("graba la pestaña del CLIENTE; la de un asesor solo si no hay cliente en la sala", () => {
    assert.equal(G.laSalaGraba({ esAsesor: false, hayCliente: false }), true);
    assert.equal(G.laSalaGraba({ esAsesor: false, hayCliente: true }), true);
    // Con el cliente dentro, el asesor no: serían dos ficheros de la misma llamada.
    assert.equal(G.laSalaGraba({ esAsesor: true, hayCliente: true }), false);
    // Solo con Verzy (así se prueba la videollamada, con la sesión iniciada): graba.
    assert.equal(G.laSalaGraba({ esAsesor: true, hayCliente: false }), true);
});

test("cada voz va en su carpeta del bucket; las llaves de antes no cambian", () => {
    const base = { cuentaId: "c", grabacionId: "g", numero: 7, formato: "webm" };
    assert.equal(G.llaveDelTrozo({ ...base, cual: "voz", pista: 3 }), "c/videollamadas/g/trozos-voz-3/00007.webm");
    assert.equal(G.llaveDelTrozo({ ...base, cual: "video" }), "c/videollamadas/g/trozos-video/00007.webm");
    assert.equal(G.llaveDelTrozo({ ...base, cual: "audio" }), "c/videollamadas/g/trozos-audio/00007.webm");
    assert.equal(G.elTipoDelFichero("webm", "voz"), "audio/webm");
});

test("la mezcla: cada voz retrasada a su sitio, todas juntas, y el video SIN recodificar", () => {
    const o = G.lasOrdenesDeLaMezcla({
        video: "lienzo.webm",
        voces: [{ archivo: "v1.webm", desdeMs: 0 }, { archivo: "v2.webm", desdeMs: 4200.4 }],
        formato: "webm",
        salidaAudio: "audio.webm",
        salidaVideo: "video.webm",
    });
    assert.deepEqual(o.filter((x, i) => o[i - 1] === "-i"), ["lienzo.webm", "v1.webm", "v2.webm"]);
    const filtro = o[o.indexOf("-filter_complex") + 1];
    assert.match(filtro, /\[1:a\][^;]*adelay=0\[v0\]/);
    assert.match(filtro, /\[2:a\][^;]*adelay=4200\[v1\]/);
    assert.match(filtro, /amix=inputs=2:duration=longest/);
    assert.ok(o.includes("libopus"));
    assert.equal(o[o.indexOf("-c:v") + 1], "copy");
    assert.equal(o.at(-1), "video.webm");
    // Safari: aac en mp4, con el índice delante para que se vea sin bajarlo entero.
    const mp4 = G.lasOrdenesDeLaMezcla({ video: null, voces: [{ archivo: "v.mp4", desdeMs: -50 }], formato: "mp4", salidaAudio: "a.mp4", salidaVideo: null });
    assert.ok(mp4.includes("aac") && mp4.includes("+faststart"));
    assert.ok(!mp4.includes("-c:v"));
    assert.match(mp4[mp4.indexOf("-filter_complex") + 1], /\[0:a\][^;]*adelay=0\[v0\]/, "un desde negativo es cero");
    assert.throws(() => G.lasOrdenesDeLaMezcla({ video: null, voces: [], formato: "webm", salidaAudio: "a", salidaVideo: null }));
});

test("lo que dura una grabación: lo medido manda; si no, el reloj sin pasar de los trozos", () => {
    assert.equal(G.losSegundosDeLaGrabacion({ delCliente: 300, trozos: 4, medidos: 36.4 }), 36);
    assert.equal(G.losSegundosDeLaGrabacion({ delCliente: 300, trozos: 4, medidos: null }), 40, "300 s de reloj en 4 trozos son como mucho 40");
    assert.equal(G.losSegundosDeLaGrabacion({ delCliente: 25, trozos: 4, medidos: null }), 25);
    assert.equal(G.losSegundosDeLaGrabacion({ delCliente: Number.NaN, trozos: 4, medidos: null }), 0);
    assert.equal(G.losSegundosDeLaGrabacion({ delCliente: 50, trozos: 4, medidos: Number.NaN }), 40);
});

test("el formato sale de lo que eligió el MediaRecorder: Safari graba mp4", () => {
    assert.equal(G.elFormatoDeLaGrabacion("video/mp4;codecs=avc1"), "mp4");
    assert.equal(G.elFormatoDeLaGrabacion("audio/mp4"), "mp4");
    assert.equal(G.elFormatoDeLaGrabacion("video/webm;codecs=vp8,opus"), "webm");
    assert.equal(G.elFormatoDeLaGrabacion(""), "webm");
    assert.equal(G.elFormatoDeLaGrabacion(undefined), "webm");
    assert.equal(G.elTipoDelFichero("mp4", "video"), "video/mp4");
    assert.equal(G.elTipoDelFichero("webm", "audio"), "audio/webm");
});

test("trozos de 10 s: si el cliente cierra la pestaña se pierden como mucho diez segundos", () => {
    assert.equal(G.TROZO_CADA_MS, 10_000);
    // Con las partes de 8 MiB de Reuniones, el audio tardaba media hora en
    // soltar la primera: cerrar la pestaña antes era perder la llamada entera.
    const segundosHastaLaPrimeraParte = R.TAMANO_DE_PARTE / (R.AUDIO_BPS / 8);
    assert.ok(segundosHastaLaPrimeraParte > 30 * 60, `${segundosHastaLaPrimeraParte} s`);
    // Diez segundos de video caben de sobra en el techo de un trozo.
    assert.ok(((G.VIDEO_BPS_DE_LA_SALA + R.AUDIO_BPS) / 8) * 10 * 3 < G.TOPE_DEL_TROZO);
    // Y los techos dan para la llamada más larga que permite la sala (6 h).
    assert.ok(G.TOPE_DE_TROZOS * (G.TROZO_CADA_MS / 1000) >= 6 * 3600);
    assert.ok(((G.VIDEO_BPS_DE_LA_SALA + 2 * R.AUDIO_BPS) / 8) * 4 * 3600 < G.TOPE_DE_BYTES_DE_LA_SALA, "cuatro horas caben");
});

test("la llave del trozo va rellenada a cinco cifras (S3 ordena como texto)", () => {
    const k = (n) => G.llaveDelTrozo({ cuentaId: "c", grabacionId: "g", cual: "video", numero: n, formato: "webm" });
    assert.equal(k(2), "c/videollamadas/g/trozos-video/00002.webm");
    assert.ok(k(2) < k(10), "el 2 antes que el 10");
    assert.equal(G.llaveDelTrozo({ cuentaId: "c", grabacionId: "g", cual: "audio", numero: 1, formato: "mp4" }), "c/videollamadas/g/trozos-audio/00001.mp4");
});

test("las llaves de Reuniones no cambian (modulo y extensión son opcionales)", () => {
    assert.equal(R.llaveDeLaParte({ cuentaId: "c", grabacionId: "g", cual: "audio", numero: 3 }), "c/reuniones/g/partes-audio/00003.webm");
    assert.equal(R.llaveDeLaGrabacion({ cuentaId: "c", grabacionId: "g", cual: "video" }), "c/reuniones/g/video.webm");
    assert.equal(
        R.llaveDeLaGrabacion({ cuentaId: "c", grabacionId: "g", cual: "video", modulo: "videollamadas", extension: "mp4" }),
        "c/videollamadas/g/video.mp4",
    );
});

test("el lienzo: lo grande ocupa todo y la miniatura va abajo a la derecha, dentro", () => {
    const sin = G.lasCajasDelLienzoDeLaSala(false);
    assert.deepEqual(sin, { grande: { x: 0, y: 0, ancho: 1280, alto: 720 }, mini: null });
    const con = G.lasCajasDelLienzoDeLaSala(true);
    const m = con.mini;
    assert.ok(m.x + m.ancho < 1280 && m.y + m.alto < 720, "dentro del lienzo");
    assert.ok(m.x > 640 && m.y > 360, "abajo a la derecha");
    assert.equal(Math.round((m.ancho / m.alto) * 100) / 100, Math.round((16 / 9) * 100) / 100);
});

test("lo grande entra ENTERO (contain): una pantalla de pie no se recorta", () => {
    const caja = { x: 0, y: 0, ancho: 1280, alto: 720 };
    const pie = G.comoCabeEntero({ anchoDeLaFuente: 400, altoDeLaFuente: 800, caja });
    assert.equal(pie.alto, 720);
    assert.equal(pie.ancho, 360);
    assert.equal(pie.x, 460, "centrada");
    const ancha = G.comoCabeEntero({ anchoDeLaFuente: 1920, altoDeLaFuente: 1080, caja });
    assert.deepEqual(ancha, { x: 0, y: 0, ancho: 1280, alto: 720 });
    assert.equal(G.comoCabeEntero({ anchoDeLaFuente: 0, altoDeLaFuente: 0, caja }), null, "sin fotograma aún");
});

test("lo que se mezcla en raw.call: solo las llaves con valor (un null pisaría una buena)", () => {
    assert.equal(G.laGrabacionParaElCrm({ audioUrl: null, videoUrl: null }), null);
    assert.deepEqual(G.laGrabacionParaElCrm({ audioUrl: "a", videoUrl: null }), { hasRecording: true, recordingUrl: "a" });
    assert.deepEqual(G.laGrabacionParaElCrm({ audioUrl: "a", videoUrl: "v" }), { hasRecording: true, recordingUrl: "a", videoUrl: "v" });
    assert.equal(G.elMensajeDeLaVideollamada("cita1"), "tavus_cita1");
});
