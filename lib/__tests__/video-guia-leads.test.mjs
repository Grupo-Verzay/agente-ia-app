/**
 * El VÍDEO de la guía de Leads: el cursor es el de verdad y lleva narración.
 *
 *   1. El cursor: flecha al moverse, manito sobre lo que se pulsa, la «I» en
 *      un campo de texto, y NADA más —ni halo, ni círculo, ni encogerse al
 *      pulsar—. Se comprueba en Chromium, moviendo el ratón de verdad sobre
 *      una página con botones, enlaces, un interruptor, un campo y texto.
 *   2. La voz: la estándar es Cedar de OpenAI (la del asistente de «Llamar
 *      con IA»), cada frase del guion está sintetizada con ella en la caché,
 *      y sin una frase NO se cae a otra voz. La corrección `.pho` de la voz
 *      local de antes (que se conserva a pedido) sigue siendo pura.
 *   3. El guion dice todas las frases, en su orden —las de las acciones
 *      masivas incluidas—, y cada acción cae en la palabra que la nombra.
 *   4. El vídeo publicado LLEVA audio, y el audio no es silencio.
 *   5. El RITMO es el de una llamada con un cliente, no el de un tutorial:
 *      las instrucciones lo piden, ninguna pausa dentro de una frase pasa de
 *      `RITMO.pausaMaximaMs`, las frases enlazan sin esperar entre ellas, y el
 *      vídeo publicado no tiene huecos ni arranca con segundos mudos.
 *   6. La IMAGEN va con la VOZ: se graba con la grabadora propia (cada
 *      fotograma en su hora), y en el vídeo publicado el rótulo cambia justo
 *      cuando empieza cada frase y la imagen acaba con la voz.
 *
 * `MODO=roto` lee el guion y el vídeo de ANTES_VIDEO_REF —pinchado a un commit,
 * nunca `origin/main`— y afirma el fallo: el cursor era una bolita con halo
 * que se encogía al pulsar, y el vídeo no tenía pista de audio. Y lee la voz
 * de ANTES_VOZ_REF: la narración salía con espeak/MBROLA, no con Cedar. Y
 * ANTES_RITMO_REF: la narración pausada y cortada —«ritmo pausado de
 * tutorial», pausas de más de medio segundo dentro de cada frase, respiros de
 * hasta 1,2 s entre frases y un vídeo con 4 s mudos al empezar—, y la imagen
 * grabada con `recordVideo`, que duraba segundos más que la voz.
 */
import { after, test, describe } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "..", "..");
const MODO = process.env.MODO ?? "bueno";
const ANTES = process.env.ANTES_VIDEO_REF ?? "153f64f";
const ANTES_VOZ = process.env.ANTES_VOZ_REF ?? "9e38996";
const ANTES_RITMO = process.env.ANTES_RITMO_REF ?? "c3ae539";
const VIDEO = path.join(RAIZ, "public", "guia", "leads", "demostracion.webm");
const tmp = mkdtempSync(path.join(os.tmpdir(), "video-guia-"));

const deGit = (ruta, ref = ANTES) => execFileSync("git", ["show", `${ref}:${ruta}`], { cwd: RAIZ, maxBuffer: 64 << 20 });

function pistas(archivo) {
    const r = execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,codec_name:format=duration", "-of", "json", archivo]);
    return JSON.parse(String(r));
}
/**
 * Los silencios de la pista de un vídeo, con el mismo umbral que `RITMO`
 * (−40 dB) y a partir de 350 ms, que es lo que ya se oye como un hueco.
 */
function silencios(archivo) {
    const r = spawnSync("ffmpeg", ["-hide_banner", "-i", archivo, "-map", "0:a:0", "-af", "silencedetect=noise=-40dB:d=0.35", "-f", "null", "-"], { encoding: "utf8" });
    const inicios = [...r.stderr.matchAll(/silence_start: (-?[\d.]+)/g)].map((m) => Number(m[1]));
    const finales = [...r.stderr.matchAll(/silence_end: ([\d.]+) \| silence_duration: ([\d.]+)/g)].map((m) => ({ fin: Number(m[1]), dura: Number(m[2]) }));
    return inicios.map((inicio, i) => ({ inicio, fin: finales[i]?.fin ?? null, dura: finales[i]?.dura ?? null }));
}
/** Los huecos que suenan como tales: los de DENTRO del vídeo (ni el principio ni la cola). */
function huecos(archivo) {
    const todos = silencios(archivo);
    const duracion = Number(pistas(archivo).format.duration);
    return {
        alEmpezar: todos[0] && todos[0].inicio < 0.05 ? todos[0].dura : 0,
        dentro: todos.filter((x) => x.inicio >= 0.05 && x.fin !== null && x.fin < duracion - 0.5).map((x) => x.dura),
    };
}
/** Dónde acaba una pista (su último paquete): la imagen y la voz pueden acabar a destiempo. */
function finDeLaPista(archivo, pista) {
    const r = execFileSync("ffprobe", ["-v", "error", "-select_streams", `${pista}:0`, "-show_entries", "packet=pts_time", "-of", "csv=p=0", archivo], { maxBuffer: 64 << 20 });
    const tiempos = String(r).split("\n").map((l) => Number.parseFloat(l)).filter(Number.isFinite);
    return Math.max(...tiempos);
}
const finDelAudio = (archivo) => finDeLaPista(archivo, "a");
/**
 * Cuándo cambia el rótulo de abajo, que se pone al empezar cada frase: el
 * recuadro del centro de la parte de abajo cambia de golpe (texto blanco sobre
 * fondo oscuro). Es la marca con la que se mide si la imagen va con la voz.
 */
function cambiosDelRotulo(archivo) {
    const r = spawnSync("ffmpeg", ["-hide_banner", "-i", archivo, "-an", "-vf", "crop=380:34:450:726,select='gt(scene\\,0.08)',showinfo", "-f", "null", "-"], { encoding: "utf8", maxBuffer: 64 << 20 });
    return [...r.stderr.matchAll(/pts_time:([\d.]+)/g)].map((m) => Number(m[1]));
}
/** Hasta dónde se habla: el final del último tramo con voz, aunque la pista siga muda detrás. */
function dondeCallaDelTodo(archivo) {
    const todos = silencios(archivo);
    const ultimo = todos[todos.length - 1];
    const fin = finDelAudio(archivo);
    return ultimo && (ultimo.fin === null || ultimo.fin >= fin - 0.1) ? ultimo.inicio : fin;
}
function volumenMedio(archivo) {
    const r = spawnSync("ffmpeg", ["-hide_banner", "-i", archivo, "-map", "0:a:0", "-af", "volumedetect", "-f", "null", "-"], { encoding: "utf8" });
    const m = /mean_volume:\s*(-?[\d.]+) dB/.exec(r.stderr);
    return m ? Number(m[1]) : null;
}

if (MODO === "roto") {
    describe("ANTES: bolita y vídeo mudo", () => {
        test("el cursor era un círculo con halo que se encogía al pulsar", () => {
            const guion = String(deGit("scripts/capturar-guia-leads.mjs"));
            assert.match(guion, /borderRadius:'50%'/, "el cursor de antes no era un círculo");
            assert.match(guion, /boxShadow:'0 0 0 4px/, "no tenía halo");
            assert.match(guion, /scale\(\.7\)/, "no se encogía al pulsar");
            assert.doesNotMatch(guion, /SVG_MANO|cursor-de-la-guia/, "ya tenía manito");
        });
        test("el vídeo no tenía pista de audio", () => {
            const archivo = path.join(tmp, "antes.webm");
            writeFileSync(archivo, deGit("public/guia/leads/demostracion.webm"));
            const tipos = pistas(archivo).streams.map((s) => s.codec_type);
            assert.deepEqual(tipos, ["video"], `el vídeo de antes traía: ${tipos.join(", ")}`);
        });
        test("ANTES (ritmo): las instrucciones pedían «ritmo pausado de tutorial»", () => {
            const cedar = String(deGit("scripts/voz-cedar.mjs", ANTES_RITMO));
            assert.match(cedar, /ritmo pausado de tutorial/, "las instrucciones de antes no pedían el ritmo pausado");
            assert.doesNotMatch(String(deGit("scripts/voz-de-la-guia.mjs", ANTES_RITMO)), /acortarLasPausas/, "ya se acortaban las pausas");
        });
        test("ANTES (ritmo): el guion respiraba y esperaba entre frases", () => {
            const guion = String(deGit("scripts/capturar-guia-leads.mjs", ANTES_RITMO));
            const video = guion.slice(guion.indexOf("async function video("));
            assert.match(video, /const callar = async \(respiro = 450\)/, "el respiro de antes no era de 450 ms");
            assert.match(video, /callar\(1200\)/, "no había un respiro de 1,2 s");
            assert.match(video, /quitarAvisos\(p\)/, "el vídeo no esperaba a que se fueran los avisos");
            assert.doesNotMatch(video, /alDecir/, "ya se actuaba en la palabra que lo nombra");
        });
        test("ANTES (ritmo): cada frase llevaba pausas de más de medio segundo", async () => {
            const voz = await import("../../scripts/voz-de-la-guia.mjs");
            const hecho = JSON.parse(String(deGit("scripts/voz-de-la-guia/leads.json", ANTES_RITMO)));
            let largas = 0;
            for (const llave of hecho.frases) {
                const ogg = path.join(tmp, `${llave}.ogg`);
                writeFileSync(ogg, deGit(`scripts/voz-de-la-guia/cedar/${llave}.ogg`, ANTES_RITMO));
                const wav = execFileSync("ffmpeg", ["-loglevel", "error", "-i", ogg, "-ac", "1", "-ar", "24000", "-c:a", "pcm_s16le", "-f", "wav", "-"], { maxBuffer: 64 << 20 });
                largas += voz.lasPausas(voz.leerWav(wav)).interiores.filter((ms) => ms > 500).length;
            }
            assert.ok(largas >= 5, `las frases de antes solo tenían ${largas} pausas de más de medio segundo`);
        });
        test("ANTES (ritmo): el vídeo arrancaba con segundos mudos y tenía huecos de más de 2 s", () => {
            const archivo = path.join(tmp, "antes-ritmo.webm");
            writeFileSync(archivo, deGit("public/guia/leads/demostracion.webm", ANTES_RITMO));
            const h = huecos(archivo);
            assert.ok(h.alEmpezar > 3, `el vídeo de antes arrancaba con ${h.alEmpezar} s mudos`);
            assert.ok(Math.max(...h.dentro) > 2, `el hueco más largo del vídeo de antes era de ${Math.max(...h.dentro)} s`);
        });
        test("ANTES (ritmo): el vídeo seguía segundos mudo después de la última palabra", () => {
            const archivo = path.join(tmp, "antes-cola.webm");
            writeFileSync(archivo, deGit("public/guia/leads/demostracion.webm", ANTES_RITMO));
            const cola = Number(pistas(archivo).format.duration) - dondeCallaDelTodo(archivo);
            assert.ok(cola > 3, `el vídeo de antes solo seguía ${cola.toFixed(2)} s tras la última palabra`);
        });
        test("ANTES (sincronía): se grababa con recordVideo y la imagen duraba segundos más que la voz", () => {
            const guion = String(deGit("scripts/capturar-guia-leads.mjs", ANTES_RITMO));
            assert.match(guion, /recordVideo:/, "el guion de antes no grababa con recordVideo");
            assert.doesNotMatch(guion, /grabadora-de-la-guia/, "ya tenía la grabadora propia");
            const archivo = path.join(tmp, "antes-sincronia.webm");
            writeFileSync(archivo, deGit("public/guia/leads/demostracion.webm", ANTES_RITMO));
            const estirada = finDeLaPista(archivo, "v") - finDeLaPista(archivo, "a");
            assert.ok(estirada > 3, `la imagen de antes solo duraba ${estirada.toFixed(2)} s más que la voz`);
        });
        test("ANTES (sincronía): la regla de Playwright estira lo que se pinta deprisa", () => {
            // `max(1, round(25 · Δt))` por fotograma (videoRecorder de Playwright):
            // diez segundos pintando a 60 por segundo salen como veinticuatro.
            let fotogramas = 0;
            for (let i = 1; i <= 600; i++) fotogramas += Math.max(1, Math.round(25 * (1 / 60)));
            assert.ok(fotogramas / 25 > 20, `diez segundos de pintura salían como ${fotogramas / 25} s`);
        });
        test("la narración salía con espeak/MBROLA, no con Cedar", () => {
            const voz = String(deGit("scripts/voz-de-la-guia.mjs", ANTES_VOZ));
            assert.match(voz, /VOZ_GUIA \?\? "mb-es3"/, "la voz por defecto de antes no era mb-es3");
            assert.doesNotMatch(voz, /cedar|voz-cedar/i, "ya usaba Cedar");
            assert.throws(() => deGit("scripts/voz-cedar.mjs", ANTES_VOZ), "ya existía la voz Cedar");
        });
    });
} else {
    const { CURSOR, SVG_FLECHA, SVG_MANO } = await import("../../scripts/cursor-de-la-guia.mjs");
    const { NARRACION, comoSeDice } = await import("../../scripts/narracion-guia-leads.mjs");
    const voz = await import("../../scripts/voz-de-la-guia.mjs");
    const cedar = await import("../../scripts/voz-cedar.mjs");
    /** Un Opus de verdad, como el que devuelve OpenAI. */
    const opusDePrueba = (ms) => {
        const ruta = path.join(tmp, `tono-${ms}.ogg`);
        execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-f", "lavfi", "-i", `sine=frequency=220:duration=${ms / 1000}`, "-c:a", "libopus", ruta]);
        return readFileSync(ruta);
    };

    describe("la voz", () => {
        test("arreglarPho: cambia los fonemas que es3 no tiene y funde los repetidos", () => {
            const pho = "_ 50\nn 60\nu 70 0 200\nm 60\ne 50\nh 40\no 80\np 60\np 60\n_ 50\n";
            const r = voz.arreglarPho(pho).trim().split("\n").map((l) => l.split(" ")[0]);
            assert.deepEqual(r, ["_", "n", "u", "m", "e", "r", "o", "p", "_"]);
            assert.match(voz.arreglarPho("p 60\np 60\n"), /^p 120$/m, "los dos «p» no sumaron su duración");
        });
        test("arreglarPho: la «u» de «cua» y una pausa donde es3 no une dos consonantes", () => {
            const r = voz.arreglarPho("k 60\nb 40\na 80\nt 60\np 60\na 80\n", (x, y) => !(x === "t" && y === "p")).trim().split("\n").map((l) => l.split(" ")[0]);
            assert.deepEqual(r, ["k", "u", "a", "t", "_", "p", "a"]);
        });
        test("la voz por defecto es Cedar de OpenAI, la misma del asistente de llamadas", () => {
            assert.equal(process.env.VOZ_GUIA ?? "", "", "el banco corre con VOZ_GUIA puesta");
            assert.equal(voz.usaCedar(), true);
            assert.equal(cedar.VOZ_CEDAR.voz, "cedar");
            assert.equal(cedar.VOZ_CEDAR.proveedor, "openai");
            const catalogo = readFileSync(path.join(RAIZ, "lib", "voicebot-voices.ts"), "utf8");
            assert.match(catalogo, /VOICEBOT_VOICES = \[[^\]]*'cedar'/, "cedar no es una voz del asistente de llamadas");
            assert.deepEqual(cedar.laPeticion("hola"), {
                model: "gpt-4o-mini-tts", voice: "cedar", input: "hola", instructions: cedar.VOZ_CEDAR.instrucciones, response_format: "opus",
            });
        });
        test("la llave de una frase cambia con el texto y con las instrucciones, y es estable", () => {
            const a = cedar.llaveDeLaFrase("Hola");
            assert.equal(a, cedar.llaveDeLaFrase("Hola"));
            assert.notEqual(a, cedar.llaveDeLaFrase("Hola."));
            assert.notEqual(a, cedar.llaveDeLaFrase("Hola", { ...cedar.VOZ_CEDAR, instrucciones: "otra" }));
            assert.notEqual(a, cedar.llaveDeLaFrase("Hola", { ...cedar.VOZ_CEDAR, voz: "marin" }));
        });
        test("llenarLaCache pide SOLO lo que falta, con la llave de la plataforma, y guarda el Opus", async () => {
            const dir = mkdtempSync(path.join(tmp, "cache-"));
            const ogg = opusDePrueba(700);
            const pedidas = [];
            const pedir = async (url, op) => {
                pedidas.push({ url, op });
                return { ok: true, status: 200, arrayBuffer: async () => ogg };
            };
            assert.equal(await cedar.llenarLaCache(["uno", "dos", "uno"], { dir, llave: "sk-x", pedir }), 2);
            assert.equal(pedidas[0].url, "https://api.openai.com/v1/audio/speech");
            assert.equal(pedidas[0].op.headers.Authorization, "Bearer sk-x");
            assert.equal(JSON.parse(pedidas[0].op.body).voice, "cedar");
            assert.equal(await cedar.llenarLaCache(["uno", "dos"], { dir, llave: "sk-x", pedir }), 0, "volvió a pagar frases que ya estaban");
            const a = voz.leerWav(cedar.wavDeLaCache("uno", dir));
            assert.equal(a.frecuencia, 24000);
            assert.ok(a.ms > 500 && a.ms < 900, `${a.ms} ms`);
            assert.equal(cedar.laLlaveDeOpenAi({ OPENAI_SYSTEM_API_KEY: "s", OPENAI_API_KEY: "o" }), "s");
            assert.equal(cedar.laLlaveDeOpenAi({ OPENAI_API_KEY: "o" }), "o");
        });
        test("sin llave, o si OpenAI dice que no, lanza: nunca sigue con otra voz", async () => {
            const dir = mkdtempSync(path.join(tmp, "cache-"));
            await assert.rejects(cedar.llenarLaCache(["x"], { dir, llave: "" }), /no hay llave de OpenAI/);
            const pedir = async () => ({ ok: false, status: 401, arrayBuffer: async () => Buffer.from("Incorrect API key") });
            await assert.rejects(cedar.llenarLaCache(["x"], { dir, llave: "sk-mala", pedir }), /401/);
            assert.throws(() => cedar.wavDeLaCache("no está", dir), /no está sintetizada con la voz Cedar/);
        });
        test("cada frase del guion está sintetizada con Cedar, entera", () => {
            const faltan = cedar.lasQueFaltan(Object.values(NARRACION).map((n) => n.texto));
            assert.deepEqual(faltan, [], "faltan frases en scripts/voz-de-la-guia/cedar: node scripts/sintetizar-voz-de-la-guia.mjs");
            for (const [id, n] of Object.entries(NARRACION)) {
                const a = voz.sintetizar(n.texto, path.join(tmp, `${id}.wav`));
                assert.equal(a.frecuencia, 24000, `${id}: no es la voz Cedar`);
                const palabras = n.texto.split(/\s+/).length;
                assert.ok(a.ms > palabras * 180 && a.ms < palabras * 700, `${id}: ${a.ms} ms para ${palabras} palabras`);
            }
        });
        test("lo que no es español se dice como suena", () => {
            assert.equal(comoSeDice("Leads por WhatsApp en CSV"), "Lids por guatsap en se, ese, uve");
        });
        test("montarLaPista: coloca cada frase en su instante y nunca dos a la vez", () => {
            const tono = (ms) => ({ frecuencia: 16000, datos: Buffer.alloc(ms * 32, 1), ms });
            const { colocados } = voz.montarLaPista(
                [{ texto: "a", audio: tono(1000), inicioMs: 500 }, { texto: "b", audio: tono(500), inicioMs: 1200 }],
                4000,
            );
            assert.deepEqual(colocados.map((c) => [c.inicioMs, c.finMs]), [[500, 1500], [1500, 2000]]);
        });
    });

    test("el guion dice todas las frases, en su orden, y no queda ni rastro de la bolita", () => {
        const guion = readFileSync(path.join(RAIZ, "scripts", "capturar-guia-leads.mjs"), "utf8");
        const dichas = [...guion.matchAll(/(?<!al)decir\("(\w+)"\)/gi)].filter((m) => m[0].startsWith("decir")).map((m) => m[1]);
        assert.deepEqual(dichas, Object.keys(NARRACION));
        assert.match(guion, /mezclar\(/, "el guion no le pega la narración al vídeo");
        const estilo = /Object\.assign\(c\.style, \{([^}]*)\}\)/.exec(CURSOR)?.[1] ?? "";
        assert.ok(estilo.includes("pointerEvents"), "no se encontró el estilo del cursor");
        assert.doesNotMatch(estilo, /borderRadius|boxShadow|background|border:/, "el cursor sigue llevando adornos");
        assert.doesNotMatch(CURSOR, /scale\(|mousedown/, "el cursor sigue cambiando al pulsar");
    });

    describe("el ritmo: el de una llamada, no el de un tutorial", () => {
        const { RITMO } = voz;
        /** Un audio de prueba: tono y silencio a trozos, en ms. */
        const audio = (trozos, frecuencia = 24000) => {
            const n = trozos.reduce((s, [ms]) => s + Math.round((ms * frecuencia) / 1000), 0);
            const datos = Buffer.alloc(n * 2);
            let o = 0;
            for (const [ms, suena] of trozos) {
                for (let i = 0; i < Math.round((ms * frecuencia) / 1000); i += 1, o += 1) {
                    datos.writeInt16LE(suena ? Math.round(9000 * Math.sin((2 * Math.PI * 220 * o) / frecuencia)) : 0, o * 2);
                }
            }
            return { frecuencia, datos, ms: trozos.reduce((s, [ms]) => s + ms, 0) };
        };

        test("las instrucciones piden el ritmo fluido de una llamada, no el pausado de un tutorial", () => {
            const i = cedar.VOZ_CEDAR.instrucciones;
            assert.match(i, /llamada/, "no piden el ritmo de una llamada");
            assert.match(i, /fluido/);
            assert.doesNotMatch(i, /pausad|tutorial/, "siguen pidiendo el ritmo pausado de un tutorial");
        });

        test("acortarLasPausas: una pausa larga se queda en el máximo, los bordes en su silencio, y la voz entera", () => {
            const a = audio([[400, false], [500, true], [900, false], [400, true], [150, false], [300, true], [500, false]]);
            const antes = voz.lasPausas(a);
            assert.deepEqual(antes.interiores, [900, 150]);
            const b = voz.acortarLasPausas(a);
            const despues = voz.lasPausas(b);
            assert.equal(despues.interiores.length, 2);
            assert.ok(Math.abs(despues.interiores[0] - RITMO.pausaMaximaMs) <= 2 * RITMO.ventanaMs, `la pausa larga quedó en ${despues.interiores[0]} ms`);
            assert.ok(Math.abs(despues.interiores[1] - 150) <= RITMO.ventanaMs, "una pausa corta no se toca");
            assert.ok(despues.inicio <= RITMO.bordeInicialMs + RITMO.ventanaMs, `borde inicial de ${despues.inicio} ms`);
            assert.ok(despues.fin <= RITMO.bordeFinalMs + RITMO.ventanaMs, `borde final de ${despues.fin} ms`);
            assert.ok(Math.abs(despues.vozMs - (antes.vozMs - (900 - RITMO.pausaMaximaMs))) <= 2 * RITMO.ventanaMs, "se perdió voz, no solo silencio");
            assert.equal(b.ms, Math.round((b.datos.length / 2 / b.frecuencia) * 1000));
        });

        test("acortarLasPausas: sin voz no hay nada que acercar, y los cortes no chasquean", () => {
            const mudo = audio([[800, false]]);
            assert.equal(voz.acortarLasPausas(mudo), mudo);
            const b = voz.acortarLasPausas(audio([[100, false], [300, true], [1200, false], [300, true]]));
            // En el corte, el fundido lleva la onda a cero: ningún salto brusco entre muestras vecinas.
            let salto = 0;
            for (let i = 1; i < b.datos.length / 2; i += 1) salto = Math.max(salto, Math.abs(b.datos.readInt16LE(i * 2) - b.datos.readInt16LE((i - 1) * 2)));
            assert.ok(salto < 1000, `un corte salta ${salto} de una muestra a la siguiente`);
        });

        test("cada frase, ya acortada: ninguna pausa pasa del máximo, y el conjunto va a ritmo de conversación", () => {
            let palabras = 0;
            let ms = 0;
            for (const [id, n] of Object.entries(NARRACION)) {
                const a = voz.sintetizar(n.texto, path.join(tmp, `ritmo-${id}.wav`));
                const p = voz.lasPausas(a);
                assert.ok(Math.max(0, ...p.interiores) <= RITMO.pausaMaximaMs + RITMO.ventanaMs, `${id}: una pausa de ${Math.max(...p.interiores)} ms`);
                assert.ok(p.inicio <= RITMO.bordeInicialMs + RITMO.ventanaMs && p.fin <= RITMO.bordeFinalMs + RITMO.ventanaMs, `${id}: bordes de ${p.inicio}/${p.fin} ms`);
                const wpm = n.texto.split(/\s+/).length / (a.ms / 60000);
                assert.ok(wpm >= 140, `${id}: ${Math.round(wpm)} palabras por minuto, a ritmo de tutorial`);
                palabras += n.texto.split(/\s+/).length;
                ms += a.ms;
            }
            const total = palabras / (ms / 60000);
            assert.ok(total >= 160, `la narración va a ${Math.round(total)} palabras por minuto`);
        });

        test("el guion enlaza las frases: respiro corto, sin esperas, y cada acción en la palabra que la nombra", () => {
            const guion = readFileSync(path.join(RAIZ, "scripts", "capturar-guia-leads.mjs"), "utf8");
            const video = guion.slice(guion.indexOf("async function video("));
            const respiro = Number(/const RESPIRO_ENTRE_FRASES_MS = (\d+);/.exec(guion)?.[1]);
            assert.ok(respiro > 0 && respiro <= 300, `el respiro entre frases es de ${respiro} ms`);
            assert.doesNotMatch(video, /quitarAvisos\(/, "el vídeo espera a que se vayan los avisos: eso es un silencio");
            // Un respiro largo solo al final, cuando ya no se habla.
            const ultimaFrase = video.lastIndexOf('decir("');
            for (const m of video.matchAll(/callar\((\d+)\)/g)) {
                if (Number(m[1]) > respiro) assert.ok(m.index > ultimaFrase, `un callar(${m[1]}) en medio del vídeo`);
            }
            // Cada `alDecir` nombra un trozo de la frase que suena en ese momento.
            let actual = null;
            let cuantos = 0;
            for (const m of video.matchAll(/(alDecir|decir)\("([^"]+)"/g)) {
                if (m[1] === "decir") actual = m[2];
                else {
                    assert.ok(actual, `alDecir("${m[2]}") antes de la primera frase`);
                    assert.ok(NARRACION[actual].texto.includes(m[2]), `alDecir("${m[2]}") no está en la frase «${actual}»`);
                    cuantos += 1;
                }
            }
            assert.ok(cuantos >= 15, `solo ${cuantos} acciones van en su palabra`);
            // Y el vídeo arranca en la primera palabra: la carga de la página se recorta.
            assert.match(video, /mezclar\(mudo, pista, destino, \{ desdeMs \}\)/, "el vídeo no recorta la carga del principio");
        });

        test("el guion enseña las acciones masivas: abre el «⋯», recorre sus grupos y CANCELA la confirmación", () => {
            const guion = readFileSync(path.join(RAIZ, "scripts", "capturar-guia-leads.mjs"), "utf8");
            const video = guion.slice(guion.indexOf("async function video("));
            const desde = video.indexOf('decir("masivas")');
            assert.ok(desde > 0, "el vídeo no tiene la frase de las acciones masivas");
            const tramo = video.slice(desde);
            assert.match(tramo, /pulsar\(p, p\.locator\(MASIVAS\)/, "no se abre el menú «⋯»");
            for (const accion of ["Exportar a Excel", "Sincronizar a Google Sheets", "Activar clientes", "Borrar historial"]) {
                assert.ok(tramo.includes(`accion("${accion}")`), `el vídeo no pasa por «${accion}»`);
            }
            assert.match(tramo, /alerta\.getByRole\("button", \{ name: "Cancelar" \}\)/, "la confirmación no se cancela");
            assert.doesNotMatch(tramo, /name: "Confirmar"/, "el vídeo pulsa Confirmar: cambiaría los datos");
        });

        test("el vídeo publicado arranca en la primera palabra y no tiene huecos", () => {
            const h = huecos(VIDEO);
            assert.ok(h.alEmpezar <= 0.7, `el vídeo arranca con ${h.alEmpezar} s mudos`);
            const mayor = Math.max(0, ...h.dentro);
            assert.ok(mayor <= 1.2, `hay un hueco de ${mayor} s en la narración`);
            const largos = h.dentro.filter((d) => d > 0.8).length;
            assert.ok(largos <= 3, `${largos} huecos de más de 0,8 s: ${h.dentro.join(", ")}`);
        });

        test("el vídeo publicado acaba con la narración, sin cola muda", () => {
            const cola = Number(pistas(VIDEO).format.duration) - dondeCallaDelTodo(VIDEO);
            assert.ok(cola <= 1.5, `el vídeo sigue ${cola.toFixed(2)} s mudo tras la última palabra`);
            assert.match(readFileSync(path.join(RAIZ, "scripts", "voz-de-la-guia.mjs"), "utf8"), /"-shortest"/, "mezclar no corta el vídeo al largo de la narración");
        });

        test("el vídeo publicado se hizo con este ritmo", () => {
            const hecho = JSON.parse(readFileSync(path.join(RAIZ, "scripts", "voz-de-la-guia", "leads.json"), "utf8"));
            const guion = readFileSync(path.join(RAIZ, "scripts", "capturar-guia-leads.mjs"), "utf8");
            const respiro = Number(/const RESPIRO_ENTRE_FRASES_MS = (\d+);/.exec(guion)?.[1]);
            assert.deepEqual(hecho.ritmo, { ...RITMO, respiroEntreFrasesMs: respiro }, "el vídeo publicado se narró con otro ritmo: regenéralo");
        });

        test("la caché de la voz no guarda frases que ya no dice ninguna guía", async () => {
            const { readdirSync } = await import("node:fs");
            const guiones = readdirSync(path.join(RAIZ, "scripts")).filter((f) => /^narracion-guia-.*\.mjs$/.test(f));
            const vivas = new Set();
            for (const g of guiones) {
                const { NARRACION: n } = await import(path.join(RAIZ, "scripts", g));
                for (const f of Object.values(n)) vivas.add(cedar.llaveDeLaFrase(f.texto));
            }
            const sobran = readdirSync(cedar.CACHE_CEDAR).filter((f) => f.endsWith(".ogg") && !vivas.has(f.replace(/\.ogg$/, "")));
            assert.deepEqual(sobran, [], "frases sintetizadas que ya no se dicen: bórralas de scripts/voz-de-la-guia/cedar");
        });
    });

    describe("la sincronía: la imagen va con la voz", async () => {
        const grabadora = await import("../../scripts/grabadora-de-la-guia.mjs");

        test("cada fotograma va en su hora: lo pintado deprisa no estira el vídeo", () => {
            const { fotogramasHasta, FPS } = grabadora;
            assert.equal(FPS, 25);
            assert.equal(fotogramasHasta(1000, 1000), 0);
            assert.equal(fotogramasHasta(1039, 1000), 1);
            assert.equal(fotogramasHasta(1040, 1000), 1);
            assert.equal(fotogramasHasta(1041, 1000), 2);
            assert.equal(fotogramasHasta(500, 1000), 0, "lo pintado antes de empezar no cuenta");
            // Diez segundos pintando a 60 por segundo son diez segundos de vídeo.
            let escritos = 0;
            for (let i = 1; i <= 600; i++) escritos = Math.max(escritos, fotogramasHasta(1000 + (i * 1000) / 60, 1000));
            assert.equal(escritos, 250);
            // Y a ratos quieta (sin pintar nada), también.
            assert.equal(fotogramasHasta(1000 + 7300, 1000), 183);
        });

        test("la hora es la de pintar, y si viene rota manda la de llegada", () => {
            const { laHoraDelFotograma } = grabadora;
            assert.equal(laHoraDelFotograma({ timestamp: 1700000000.5 }, 1700000000600), 1700000000500);
            assert.equal(laHoraDelFotograma({}, 1234), 1234);
            assert.equal(laHoraDelFotograma({ timestamp: 5 }, 1700000000600), 1700000000600, "una hora absurda no manda");
        });

        test("el guion graba con la grabadora propia, desde el mismo instante que la voz", () => {
            const guion = readFileSync(path.join(RAIZ, "scripts", "capturar-guia-leads.mjs"), "utf8");
            assert.doesNotMatch(guion, /recordVideo:/, "vuelve a grabar con recordVideo, que estira el vídeo");
            assert.match(guion, /await grabar\(p, mudo/, "el vídeo no se graba con la grabadora propia");
            assert.match(guion, /const t0 = Date\.now\(\);\s*grabadora\.empezarEn\(t0\);/, "el vídeo no empieza en el mismo instante que la pista de voz");
            assert.match(guion, /await grabadora\.parar\(\)/, "la grabadora no se cierra");
        });

        test("el vídeo publicado: la imagen y la voz acaban juntas", () => {
            const desfase = finDeLaPista(VIDEO, "v") - finDeLaPista(VIDEO, "a");
            assert.ok(Math.abs(desfase) <= 0.25, `la imagen acaba ${desfase.toFixed(2)} s después que la voz`);
        });

        test("el vídeo publicado: el rótulo cambia justo cuando empieza cada frase", () => {
            const hecho = JSON.parse(readFileSync(path.join(RAIZ, "scripts", "voz-de-la-guia", "leads.json"), "utf8"));
            assert.ok(Array.isArray(hecho.empiezanEnMs) && hecho.empiezanEnMs.length === Object.keys(NARRACION).length, "leads.json no dice dónde empieza cada frase: regenera el vídeo");
            const cambios = cambiosDelRotulo(VIDEO);
            const tarde = [];
            for (const ms of hecho.empiezanEnMs) {
                const e = ms / 1000;
                // El rótulo se pone justo antes de sonar la frase; la primera
                // aparece con un fundido de 0,3 s.
                const cerca = cambios.filter((d) => d >= e - 0.15 && d <= e + 0.45);
                if (!cerca.length) {
                    const siguiente = cambios.find((d) => d > e - 0.15);
                    tarde.push(`${e.toFixed(2)} s → ${siguiente === undefined ? "nunca" : siguiente.toFixed(2) + " s"}`);
                }
            }
            assert.deepEqual(tarde, [], "el rótulo (la imagen) no cambia cuando empieza la frase (la voz)");
        });
    });

    test("el vídeo publicado lleva narración, y se oye", () => {
        assert.ok(existsSync(VIDEO), "falta el vídeo");
        const info = pistas(VIDEO);
        const tipos = info.streams.map((s) => s.codec_type).sort();
        assert.deepEqual(tipos, ["audio", "video"]);
        assert.equal(info.streams.find((s) => s.codec_type === "audio").codec_name, "opus");
        const v = volumenMedio(VIDEO);
        assert.ok(v !== null && v > -40, `la pista es silencio (${v} dB)`);
    });

    test("el vídeo publicado está narrado con Cedar, y con el guion de hoy", () => {
        const ruta = path.join(RAIZ, "scripts", "voz-de-la-guia", "leads.json");
        assert.ok(existsSync(ruta), "no consta con qué voz se narró el vídeo: regenéralo");
        const hecho = JSON.parse(readFileSync(ruta, "utf8"));
        assert.equal(hecho.voz, "cedar", `el vídeo se narró con «${hecho.voz}»`);
        assert.deepEqual(hecho.frases, Object.values(NARRACION).map((n) => cedar.llaveDeLaFrase(n.texto)), "el vídeo se narró con otro guion o con otras instrucciones: regenéralo");
    });

    const require = createRequire(import.meta.url);
    const { chromium } = require("playwright");
    const nav = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined });
    after(() => nav.close());
    describe("el cursor, en Chromium", async () => {
        const ctx = await nav.newContext({ viewport: { width: 900, height: 500 } });
        await ctx.addInitScript(CURSOR);
        const p = await ctx.newPage();
        // Con `setContent` no vale: reescribe el documento con `document.open`, que
        // se lleva los oyentes de la ventana. Se abre como una página de verdad.
        const pagina = path.join(tmp, "cursor.html");
        writeFileSync(pagina, `<!doctype html><html><body style="margin:0;font:16px sans-serif;cursor:default">
            <p id="texto" style="position:absolute;left:20px;top:20px;width:300px">Un párrafo cualquiera</p>
            <button id="boton" style="position:absolute;left:20px;top:100px;width:160px;height:40px">Botón</button>
            <a id="enlace" href="#x" style="position:absolute;left:220px;top:100px">Un enlace</a>
            <div id="interruptor" role="switch" style="position:absolute;left:400px;top:100px;width:50px;height:26px;background:#2563eb"></div>
            <input id="campo" style="position:absolute;left:20px;top:200px;width:240px;height:30px">
            <button id="apagado" disabled style="position:absolute;left:320px;top:200px;width:120px;height:30px">Apagado</button>
            <div id="nada" style="position:absolute;left:600px;top:300px;width:100px;height:100px"></div>
        </body></html>`);
        await p.goto(`file://${pagina}`);
        const forma = async (id) => {
            const b = await p.locator(`#${id}`).boundingBox();
            await p.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 4 });
            await p.waitForTimeout(60);
            return p.evaluate(() => document.documentElement.dataset.cursorDeLaGuia);
        };

        test("flecha al moverse, manito sobre lo que se pulsa, la «I» en un campo", async () => {
            assert.equal(await forma("nada"), "flecha");
            assert.equal(await forma("texto"), "flecha");
            assert.equal(await forma("boton"), "mano");
            assert.equal(await forma("enlace"), "mano");
            assert.equal(await forma("interruptor"), "mano");
            assert.equal(await forma("campo"), "texto");
            assert.equal(await forma("apagado"), "flecha", "un botón desactivado no enseña la manito");
            assert.equal(await forma("nada"), "flecha", "no vuelve a la flecha al salir");
        });

        test("la punta del dibujo es la del ratón, y es el dibujo de verdad", async () => {
            await p.mouse.move(700, 350);
            await p.waitForTimeout(60);
            const r = await p.evaluate(() => {
                const c = document.getElementById("__cursor");
                const b = c.getBoundingClientRect();
                return { x: b.x, y: b.y, svg: c.innerHTML };
            });
            const trazo = (svg) => /d="([^"]+)"/.exec(svg)[1];
            assert.equal(trazo(r.svg), trazo(SVG_FLECHA), "no es la flecha");
            assert.ok(Math.abs(r.x + 1.5 - 700) < 1 && Math.abs(r.y + 1.5 - 350) < 1, `la punta cae en ${r.x},${r.y}`);
            await forma("boton");
            assert.equal(trazo(await p.evaluate(() => document.getElementById("__cursor").innerHTML)), trazo(SVG_MANO), "no es la manito");
        });

        test("al pulsar NO se encoge ni se adorna: sigue siendo la manito, del mismo tamaño", async () => {
            await forma("boton");
            const antes = await p.evaluate(() => document.getElementById("__cursor").getBoundingClientRect().width);
            await p.mouse.down();
            await p.waitForTimeout(60);
            const durante = await p.evaluate(() => ({
                ancho: document.getElementById("__cursor").getBoundingClientRect().width,
                forma: document.documentElement.dataset.cursorDeLaGuia,
            }));
            await p.mouse.up();
            assert.equal(durante.forma, "mano");
            assert.equal(durante.ancho, antes);
        });

        test("un diálogo que aparece debajo cambia la forma sin mover el ratón", async () => {
            await forma("nada");
            await p.evaluate(() => {
                const b = document.createElement("button");
                Object.assign(b.style, { position: "fixed", left: "590px", top: "290px", width: "140px", height: "130px" });
                document.body.appendChild(b);
            });
            await p.waitForTimeout(300);
            assert.equal(await p.evaluate(() => document.documentElement.dataset.cursorDeLaGuia), "mano");
            assert.equal(await p.evaluate(() => document.body.lastElementChild.id), "__cursor", "el cursor quedó debajo");
        });
    });
}
