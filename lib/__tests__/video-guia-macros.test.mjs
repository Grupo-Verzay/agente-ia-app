/**
 * El VÍDEO de la guía de Mis macros: el MISMO estándar que el de Leads.
 *
 * Lo que es de TODAS las guías —el cursor de verdad, cómo se sintetiza y se
 * acorta la voz Cedar, la grabadora que pone cada fotograma en su hora— ya lo
 * prueba `video-guia-leads.test.mjs`, y el vídeo de Mis macros se graba con esas
 * mismas piezas (la grabadora y la narración del taller de las guías). Aquí va
 * lo que es de ESTE vídeo, medido igual que el de Diagramas
 * (`medidas-del-video.mjs`):
 *
 *   1. La narración: cada frase está sintetizada con Cedar, va a ritmo de
 *      conversación, y la de la barra de arriba es la MISMA que en Leads —la
 *      barra es la misma en todas las pantallas, así que se dice igual—.
 *   2. El guion dice todas las frases en su orden, cada acción cae en la
 *      palabra que la nombra y no hay esperas mudas en medio.
 *   3. El vídeo publicado: dura un minuto y poco (lo que dice su tarjeta),
 *      lleva voz que se oye, arranca en la primera palabra, no tiene huecos,
 *      acaba con la narración, la imagen y la voz acaban juntas, y el rótulo
 *      cambia justo cuando empieza cada frase.
 *   4. La SINCRONÍA con Chats: abrir Chats tarda unos segundos, y grabado la
 *      voz decía «en cualquier conversación de Chats» encima de la lista de
 *      macros y de «Cargando mensajes…». Ahora esa carga es un CORTE
 *      (`sinGrabarLaEspera` del taller): no sale en la imagen y la frase se
 *      adelanta lo mismo. Se prueba el corte con un vídeo de colores hecho con
 *      ffmpeg, y en el vídeo publicado se MIDE que cuando la frase empieza la
 *      conversación ya se ve como se verá al lanzar la macro.
 *
 * `MODO=roto` lee `ANTES_MACROS_REF` —pinchado a un commit, nunca
 * `origin/main`— y afirma que no había ni vídeo ni narración de Mis macros; y
 * `ANTES_SINCRONIA_REF` —el vídeo publicado antes de los cortes— y afirma que
 * la voz iba por delante: la conversación no se veía cuando la frase empezaba.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, existsSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { cambiosDelRotulo, cuantoCambia, dondeCallaDelTodo, finDeLaPista, fotogramasDeUnaZona, huecos, pistas, volumenMedio } from "./medidas-del-video.mjs";

const RAIZ = path.resolve(import.meta.dirname, "..", "..");
const MODO = process.env.MODO ?? "bueno";
const ANTES = process.env.ANTES_MACROS_REF ?? "ab6b110";
/** El vídeo publicado ANTES de los cortes: la voz iba por delante de Chats. */
const ANTES_SINCRONIA = process.env.ANTES_SINCRONIA_REF ?? "7c6869fa0c2c5fcfa3312a2211b8f12a06de6912";
/**
 * Dónde se leen las burbujas de la conversación en el vídeo (1280×800): el
 * primer tramo del hilo, a la izquierda. Ahí no cae ni el menú de Macros ni el
 * aviso de «Macro aplicada», así que al lanzar la macro no cambia.
 */
const ZONA_DE_LA_CONVERSACION = [440, 180, 360, 220];
/** Por encima de esto la zona no es «la misma pantalla» (medido: igual da 0,000; la lista de macros, 0,07). */
const OTRA_PANTALLA = 0.03;

/**
 * Cuánto se parece la zona de la conversación, en `t`, a como se ve justo
 * antes de la frase «resultado» —la conversación cargada, con la macro ya
 * lanzada—: 0 es igual.
 */
function distanciaALaConversacion(video, t, referencia) {
    const zona = (x) => fotogramasDeUnaZona(video, { desde: x, dura: 0.04, zona: ZONA_DE_LA_CONVERSACION, fps: 25 })[0];
    return cuantoCambia(zona(t), zona(referencia));
}
const VIDEO = path.join(RAIZ, "public", "guia", "macros", "demostracion.webm");
const GUION = path.join(RAIZ, "scripts", "capturar-guia-macros.mjs");
const tmp = mkdtempSync(path.join(os.tmpdir(), "video-guia-macros-"));

const existeEn = (ref, ruta) => {
    try {
        execFileSync("git", ["cat-file", "-e", `${ref}:${ruta}`], { cwd: RAIZ, stdio: "ignore" });
        return true;
    } catch {
        return false;
    }
};

if (MODO === "roto") {
    test("ANTES no había vídeo ni narración de Mis macros", () => {
        assert.ok(existeEn(ANTES, "public/guia/leads/demostracion.webm"), `ANTES_MACROS_REF (${ANTES}) no parece un commit con la guía de Leads`);
        for (const ruta of ["public/guia/macros/demostracion.webm", "scripts/narracion-guia-macros.mjs", "scripts/capturar-guia-macros.mjs", "scripts/voz-de-la-guia/macros.json"]) {
            assert.ok(!existeEn(ANTES, ruta), `${ruta} ya existía en ${ANTES}`);
        }
    });

    test("ANTES la voz iba por delante: la frase del chat empezaba antes de que se viera la conversación", () => {
        const aqui = (ruta) => execFileSync("git", ["show", `${ANTES_SINCRONIA}:${ruta}`], { cwd: RAIZ, maxBuffer: 256 << 20 });
        const video = path.join(tmp, "antes.webm");
        writeFileSync(video, aqui("public/guia/macros/demostracion.webm"));
        const hecho = JSON.parse(String(aqui("scripts/voz-de-la-guia/macros.json")));
        assert.equal(hecho.cortes, undefined, "ANTES el vídeo ya llevaba cortes: este modo no ejerce nada");
        const guion = String(aqui("scripts/capturar-guia-macros.mjs"));
        const v = guion.slice(guion.indexOf("async function video("));
        assert.ok(v.indexOf('decir("chat")') < v.indexOf("/chats?jid="), "ANTES Chats se abría DESPUÉS de empezar la frase que lo nombra");
        const ids = ["intro", "menu", "barraDeArriba", "lista", "crear", "acciones", "chat", "resultado"];
        const e = hecho.empiezanEnMs[ids.indexOf("chat")] / 1000;
        const ref = hecho.empiezanEnMs[ids.indexOf("resultado")] / 1000 - 0.3;
        const alEmpezar = distanciaALaConversacion(video, e + 0.15, ref);
        // EL FALLO: la voz ya nombra la conversación y en pantalla sigue la lista.
        assert.ok(alEmpezar > OTRA_PANTALLA, `ANTES la conversación ya se veía al empezar la frase (${alEmpezar.toFixed(3)}): este modo no ejerce nada`);
        const cuando = [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4].find((dt) => distanciaALaConversacion(video, e + dt, ref) <= OTRA_PANTALLA);
        assert.ok(cuando >= 1, `ANTES la conversación aparecía ${cuando} s después de que la voz la nombrara`);
    });
} else {
    const { NARRACION } = await import("../../scripts/narracion-guia-macros.mjs");
    const { NARRACION: DE_LEADS } = await import("../../scripts/narracion-guia-leads.mjs");
    const voz = await import("../../scripts/voz-de-la-guia.mjs");
    const cedar = await import("../../scripts/voz-cedar.mjs");
    const guion = readFileSync(GUION, "utf8");
    const video = guion.slice(guion.indexOf("async function video("));

    describe("la narración", () => {
        test("cada frase está sintetizada con Cedar, entera y a ritmo de conversación", () => {
            const faltan = cedar.lasQueFaltan(Object.values(NARRACION).map((n) => n.texto));
            assert.deepEqual(faltan, [], "faltan frases en scripts/voz-de-la-guia/cedar: node scripts/sintetizar-voz-de-la-guia.mjs scripts/narracion-guia-macros.mjs");
            let palabras = 0;
            let ms = 0;
            for (const [id, n] of Object.entries(NARRACION)) {
                const a = voz.sintetizar(n.texto, path.join(tmp, `${id}.wav`));
                assert.equal(a.frecuencia, 24000, `${id}: no es la voz Cedar`);
                const p = voz.lasPausas(a);
                assert.ok(Math.max(0, ...p.interiores) <= voz.RITMO.pausaMaximaMs + voz.RITMO.ventanaMs, `${id}: una pausa de ${Math.max(...p.interiores)} ms`);
                const n_ = n.texto.split(/\s+/).length;
                const wpm = n_ / (a.ms / 60000);
                assert.ok(wpm >= 140, `${id}: ${Math.round(wpm)} palabras por minuto, a ritmo de tutorial`);
                palabras += n_;
                ms += a.ms;
            }
            const total = palabras / (ms / 60000);
            assert.ok(total >= 160, `la narración va a ${Math.round(total)} palabras por minuto`);
        });

        test("la frase de la barra de arriba es la de Leads, letra por letra: es la misma barra", () => {
            assert.equal(NARRACION.barraDeArriba.texto, DE_LEADS.barraDeArriba.texto);
            assert.equal(NARRACION.barraDeArriba.rotulo, DE_LEADS.barraDeArriba.rotulo);
        });

        test("cada frase tiene su rótulo, corto, que se lee de un vistazo", () => {
            for (const [id, n] of Object.entries(NARRACION)) {
                assert.ok(n.rotulo.trim(), `${id}: sin rótulo`);
                assert.ok(n.rotulo.length <= 56, `${id}: rótulo de ${n.rotulo.length} caracteres`);
            }
        });
    });

    describe("el guion", () => {
        test("dice todas las frases, en su orden, y graba con la grabadora propia", () => {
            const dichas = [...video.matchAll(/(?<![A-Za-z])decir\("(\w+)"\)/g)].map((m) => m[1]);
            assert.deepEqual(dichas, Object.keys(NARRACION));
            assert.doesNotMatch(guion, /recordVideo:/, "vuelve a grabar con recordVideo, que estira el vídeo");
            assert.match(video, /await grabar\(p, mudo/, "el vídeo no se graba con la grabadora propia");
            assert.match(video, /const t0 = Date\.now\(\);\s*grabadora\.empezarEn\(t0\);/, "el vídeo no empieza en el mismo instante que la voz");
            assert.match(video, /await grabadora\.parar\(\)/, "la grabadora no se cierra");
            assert.match(video, /mezclar\(mudo, pista, destino, \{ desdeMs, cortes \}\)/, "el vídeo no recorta la carga del principio ni los cortes");
            assert.match(video, /escribirLaVozDelVideo\("macros"/, "no queda escrito con qué voz se narró");
        });

        test("enlaza las frases: sin esperas mudas, y cada acción en la palabra que la nombra", () => {
            const respiro = Number(/const RESPIRO_ENTRE_FRASES_MS = (\d+);/.exec(guion)?.[1]);
            assert.doesNotMatch(video, /quitarAvisos\(/, "el vídeo espera a que se vayan los avisos: eso es un silencio");
            const ultimaFrase = video.lastIndexOf('decir("');
            for (const m of video.matchAll(/callar\((\d+)\)/g)) {
                if (Number(m[1]) > respiro) assert.ok(m.index > ultimaFrase, `un callar(${m[1]}) en medio del vídeo`);
            }
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
        });

        test("no cambia datos que no se pueden deshacer: ni elimina ni desactiva una macro", () => {
            // Duplicar, desactivar y eliminar se SEÑALAN en el vídeo, no se pulsan.
            assert.doesNotMatch(video, /pulsar\(p, [^;]*"(Eliminar|Duplicar|Desactivar|Eliminar todas)"/, "el vídeo pulsa una opción que cambia las macros");
            assert.doesNotMatch(video, /"(Eliminar|Duplicar|Desactivar)"[^;]*\)\.click\(/, "el vídeo pulsa una opción que cambia las macros");
        });
    });

    describe("los cortes: lo que tarda en cargar Chats no se graba", () => {
        const T = (desdeMs, hastaMs) => ({ desdeMs, hastaMs });

        test("un instante se corre lo que duran los cortes que acabaron antes", () => {
            const cortes = [T(5000, 7000), T(10000, 10500)];
            assert.equal(voz.quitarLosCortes(4000, cortes), 4000, "antes de un corte no se mueve");
            assert.equal(voz.quitarLosCortes(7000, cortes), 5000, "justo al acabar el corte cae donde empezaba");
            assert.equal(voz.quitarLosCortes(8000, cortes), 6000);
            assert.equal(voz.quitarLosCortes(12000, cortes), 9500, "después de los dos, se quitan los dos");
            assert.equal(voz.quitarLosCortes(6000, cortes), 5000, "dentro de un corte cae en el empalme");
            assert.equal(voz.quitarLosCortes(8000, [T(10000, 10500), T(5000, 7000)]), 6000, "el orden en que llegan no importa");
            assert.equal(voz.quitarLosCortes(8000), 8000, "sin cortes, todo queda donde estaba");
            assert.equal(voz.loQueSeCorta(cortes), 2500);
        });

        test("una frase que sonara durante un corte se cae: perdería voz", () => {
            const frase = (inicioMs, ms) => ({ texto: "x", inicioMs, audio: { ms } });
            assert.throws(() => voz.tramosSinLosCortes([frase(4000, 1500)], [T(5000, 7000)]), /suena durante un corte/);
            const [a, b] = voz.tramosSinLosCortes([frase(1000, 3000), frase(7100, 2000)], [T(5000, 7000)]);
            assert.equal(a.inicioMs, 1000);
            assert.equal(b.inicioMs, 5100, "la frase de después se adelanta lo que duró el corte");
        });

        test("mezclar quita el corte de la IMAGEN, y la voz ya viene montada sin él", () => {
            // Un vídeo de 25 fps a 1280×800: 1 s rojo, 2 s verde (la carga), 1 s azul.
            const mudo = path.join(tmp, "colores.mkv");
            execFileSync("ffmpeg", ["-y", "-loglevel", "error",
                "-f", "lavfi", "-i", "color=c=red:s=1280x800:r=25:d=1",
                "-f", "lavfi", "-i", "color=c=green:s=1280x800:r=25:d=2",
                "-f", "lavfi", "-i", "color=c=blue:s=1280x800:r=25:d=1",
                "-filter_complex", "[0][1][2]concat=n=3:v=1:a=0", "-c:v", "mjpeg", "-q:v", "3", mudo]);
            const pista = path.join(tmp, "tono.wav");
            execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=1.8", "-ar", "24000", "-ac", "1", pista]);
            const salida = path.join(tmp, "cortado.webm");
            voz.mezclar(mudo, pista, salida, { desdeMs: 200, cortes: [T(1000, 3000)] });
            const color = (t) => {
                const px = execFileSync("ffmpeg", ["-loglevel", "error", "-ss", String(t), "-i", salida, "-frames:v", "1", "-vf", "scale=1:1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]);
                return [...px].map((c) => (c > 128 ? 1 : 0)).join("");
            };
            assert.equal(color(0.3), "100", "lo de antes del corte sigue ahí (rojo)");
            assert.equal(color(0.9), "001", "el corte se fue: después del rojo va el azul, sin el verde");
            const dura = Number(pistas(salida).format.duration);
            assert.ok(Math.abs(dura - 1.6) <= 0.12, `el vídeo dura lo que queda sin el principio ni el corte: ${dura.toFixed(2)} s`);
            assert.ok(Math.abs(finDeLaPista(salida, "v") - finDeLaPista(salida, "a")) <= 0.25, "la imagen y la voz acaban juntas");
        });

        test("el guion abre Chats SIN grabar y la frase empieza con la conversación ya pintada", () => {
            const i = video.indexOf("await sinGrabarLaEspera(");
            assert.ok(i > 0, "el vídeo no corta la carga de Chats");
            const dentro = video.slice(i, video.indexOf('decir("chat")'));
            assert.match(dentro, /p\.goto\(`\$\{BASE\}\/chats\?jid=/, "Chats no se abre dentro del corte");
            assert.match(dentro, /await laConversacionCargada\(p\)/, "no se espera a que la conversación tenga sus mensajes");
            assert.ok(video.indexOf("/chats?jid=") < video.indexOf('decir("chat")'), "Chats se abre DESPUÉS de empezar la frase que lo nombra");
            assert.match(video, /montarLaPista\(tramosSinLosCortes\(tramos, cortes\)/, "la voz no se monta sin los cortes");
            assert.match(video, /escribirLaVozDelVideo\("macros", \{[^}]*cortes \}\)/, "no queda escrito dónde se cortó");
            assert.match(guion, /async function laConversacionCargada\(p\)[\s\S]*?\[data-message-id\][\s\S]*?Cargando mensajes…/, "no se mira que haya burbujas y que no diga «Cargando mensajes…»");
        });
    });

    describe("el vídeo publicado", () => {
        test("dura un minuto y poco, lleva narración y se oye", () => {
            assert.ok(existsSync(VIDEO), "falta el vídeo");
            const info = pistas(VIDEO);
            assert.deepEqual(info.streams.map((s) => s.codec_type).sort(), ["audio", "video"]);
            assert.equal(info.streams.find((s) => s.codec_type === "audio").codec_name, "opus");
            const dura = Number(info.format.duration);
            assert.ok(dura >= 45 && dura <= 100, `el vídeo dura ${dura.toFixed(1)} s: la tarjeta promete un minuto`);
            const v = volumenMedio(VIDEO);
            assert.ok(v !== null && v > -40, `la pista es silencio (${v} dB)`);
        });

        test("arranca en la primera palabra y no tiene huecos", () => {
            const h = huecos(VIDEO);
            assert.ok(h.alEmpezar <= 0.7, `el vídeo arranca con ${h.alEmpezar} s mudos`);
            const mayor = Math.max(0, ...h.dentro);
            assert.ok(mayor <= 1.2, `hay un hueco de ${mayor} s en la narración`);
            assert.ok(h.dentro.filter((d) => d > 0.8).length <= 3, `huecos de más de 0,8 s: ${h.dentro.join(", ")}`);
        });

        test("acaba con la narración, y la imagen con la voz", () => {
            const cola = Number(pistas(VIDEO).format.duration) - dondeCallaDelTodo(VIDEO);
            assert.ok(cola <= 1.5, `el vídeo sigue ${cola.toFixed(2)} s mudo tras la última palabra`);
            const desfase = finDeLaPista(VIDEO, "v") - finDeLaPista(VIDEO, "a");
            assert.ok(Math.abs(desfase) <= 0.25, `la imagen acaba ${desfase.toFixed(2)} s después que la voz`);
        });

        test("el rótulo (la imagen) cambia justo cuando empieza cada frase (la voz)", () => {
            const hecho = JSON.parse(readFileSync(path.join(RAIZ, "scripts", "voz-de-la-guia", "macros.json"), "utf8"));
            assert.ok(Array.isArray(hecho.empiezanEnMs) && hecho.empiezanEnMs.length === Object.keys(NARRACION).length, "macros.json no dice dónde empieza cada frase: regenera el vídeo");
            const cambios = cambiosDelRotulo(VIDEO);
            const tarde = [];
            for (const ms of hecho.empiezanEnMs) {
                const e = ms / 1000;
                const cerca = cambios.filter((d) => d >= e - 0.15 && d <= e + 0.45);
                if (!cerca.length) {
                    const siguiente = cambios.find((d) => d > e - 0.15);
                    tarde.push(`${e.toFixed(2)} s → ${siguiente === undefined ? "nunca" : siguiente.toFixed(2) + " s"}`);
                }
            }
            assert.deepEqual(tarde, [], "el rótulo (la imagen) no cambia cuando empieza la frase (la voz)");
        });

        test("se narró con Cedar, con el guion de hoy y con el ritmo de hoy", () => {
            const ruta = path.join(RAIZ, "scripts", "voz-de-la-guia", "macros.json");
            assert.ok(existsSync(ruta), "no consta con qué voz se narró el vídeo: regenéralo");
            const hecho = JSON.parse(readFileSync(ruta, "utf8"));
            assert.equal(hecho.voz, "cedar", `el vídeo se narró con «${hecho.voz}»`);
            assert.deepEqual(hecho.frases, Object.values(NARRACION).map((n) => cedar.llaveDeLaFrase(n.texto)), "el vídeo se narró con otro guion: regenéralo");
            const respiro = Number(/const RESPIRO_ENTRE_FRASES_MS = (\d+);/.exec(guion)?.[1]);
            assert.deepEqual(hecho.ritmo, { ...voz.RITMO, respiroEntreFrasesMs: respiro }, "el vídeo publicado se narró con otro ritmo: regenéralo");
        });

        test("la carga de Chats es un corte, y la frase del chat empieza justo al empalme", () => {
            const hecho = JSON.parse(readFileSync(path.join(RAIZ, "scripts", "voz-de-la-guia", "macros.json"), "utf8"));
            assert.ok(Array.isArray(hecho.cortes) && hecho.cortes.length === 1, "el vídeo publicado no lleva el corte de la carga de Chats: regenéralo");
            const [corte] = hecho.cortes;
            assert.ok(corte.quitadoMs >= 300, `el corte quitó ${corte.quitadoMs} ms: ahí no se esperó a que cargara`);
            const e = hecho.empiezanEnMs[Object.keys(NARRACION).indexOf("chat")];
            assert.ok(e >= corte.enMs && e - corte.enMs <= 600, `la frase del chat empieza ${e - corte.enMs} ms después del empalme`);
        });

        test("cuando la voz nombra la conversación, la conversación ya se ve (medido en la imagen)", () => {
            const hecho = JSON.parse(readFileSync(path.join(RAIZ, "scripts", "voz-de-la-guia", "macros.json"), "utf8"));
            const ids = Object.keys(NARRACION);
            const e = hecho.empiezanEnMs[ids.indexOf("chat")] / 1000;
            const ref = hecho.empiezanEnMs[ids.indexOf("resultado")] / 1000 - 0.3;
            // Medio segundo antes del empalme aún se ve la lista de macros: la
            // conversación aparece CON la frase, no antes ni después.
            assert.ok(distanciaALaConversacion(VIDEO, e - 0.3, ref) > OTRA_PANTALLA, "la conversación ya se veía antes de la frase: ¿dónde está el corte?");
            for (const dt of [0.15, 0.6, 1.2]) {
                const d = distanciaALaConversacion(VIDEO, e + dt, ref);
                assert.ok(d <= OTRA_PANTALLA, `a los ${dt} s de la frase la conversación todavía no se ve como cargada (${d.toFixed(3)})`);
            }
        });
    });
}
