/**
 * El VÍDEO de la guía de Multiagenda: el MISMO estándar que el de Leads.
 *
 * Lo que es de TODAS las guías —el cursor de verdad, cómo se sintetiza y se
 * acorta la voz Cedar, la grabadora que pone cada fotograma en su hora— ya lo
 * prueba `video-guia-leads.test.mjs`, y el vídeo de Multiagenda se graba con esas
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
 *
 * `MODO=roto` lee `ANTES_MULTIAGENDA_REF` —pinchado a un commit, nunca
 * `origin/main`— y afirma que no había ni vídeo ni narración de Multiagenda.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { cambiosDelRotulo, dondeCallaDelTodo, finDeLaPista, huecos, pistas, volumenMedio } from "./medidas-del-video.mjs";

const RAIZ = path.resolve(import.meta.dirname, "..", "..");
const MODO = process.env.MODO ?? "bueno";
const ANTES = process.env.ANTES_MULTIAGENDA_REF ?? "400482e";
const VIDEO = path.join(RAIZ, "public", "guia", "multiagenda", "demostracion.webm");
const GUION = path.join(RAIZ, "scripts", "capturar-guia-multiagenda.mjs");
const tmp = mkdtempSync(path.join(os.tmpdir(), "video-guia-multiagenda-"));

const existeEn = (ref, ruta) => {
    try {
        execFileSync("git", ["cat-file", "-e", `${ref}:${ruta}`], { cwd: RAIZ, stdio: "ignore" });
        return true;
    } catch {
        return false;
    }
};

if (MODO === "roto") {
    test("ANTES no había vídeo ni narración de Multiagenda", () => {
        assert.ok(existeEn(ANTES, "public/guia/leads/demostracion.webm"), `ANTES_MULTIAGENDA_REF (${ANTES}) no parece un commit con la guía de Leads`);
        for (const ruta of ["public/guia/multiagenda/demostracion.webm", "scripts/narracion-guia-multiagenda.mjs", "scripts/capturar-guia-multiagenda.mjs", "scripts/voz-de-la-guia/multiagenda.json"]) {
            assert.ok(!existeEn(ANTES, ruta), `${ruta} ya existía en ${ANTES}`);
        }
    });
} else {
    const { NARRACION } = await import("../../scripts/narracion-guia-multiagenda.mjs");
    const { NARRACION: DE_LEADS } = await import("../../scripts/narracion-guia-leads.mjs");
    const voz = await import("../../scripts/voz-de-la-guia.mjs");
    const cedar = await import("../../scripts/voz-cedar.mjs");
    const guion = readFileSync(GUION, "utf8");
    const video = guion.slice(guion.indexOf("async function video("));

    describe("la narración", () => {
        test("cada frase está sintetizada con Cedar, entera y a ritmo de conversación", () => {
            const faltan = cedar.lasQueFaltan(Object.values(NARRACION).map((n) => n.texto));
            assert.deepEqual(faltan, [], "faltan frases en scripts/voz-de-la-guia/cedar: node scripts/sintetizar-voz-de-la-guia.mjs scripts/narracion-guia-multiagenda.mjs");
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
            assert.match(video, /mezclar\(mudo, pista, destino, \{ desdeMs, cortes \}\)/, "el vídeo no recorta la carga del principio ni la de la página pública");
            assert.match(video, /sinGrabarLaEspera\(async/, "la carga de la página pública sale en el vídeo");
            assert.match(video, /escribirLaVozDelVideo\("multiagenda"/, "no queda escrito con qué voz se narró");
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

        test("no cancela ni reserva nada: el vídeo no confirma una cancelación ni una reserva", () => {
            assert.doesNotMatch(video, /Sí, cancelar la cita/, "el vídeo cancela una cita de verdad");
            assert.doesNotMatch(video, /Confirmar cita"|name: "Confirmar"|name: "Eliminar"/, "el vídeo reserva o borra algo de verdad");
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
            const hecho = JSON.parse(readFileSync(path.join(RAIZ, "scripts", "voz-de-la-guia", "multiagenda.json"), "utf8"));
            assert.ok(Array.isArray(hecho.empiezanEnMs) && hecho.empiezanEnMs.length === Object.keys(NARRACION).length, "multiagenda.json no dice dónde empieza cada frase: regenera el vídeo");
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
            const ruta = path.join(RAIZ, "scripts", "voz-de-la-guia", "multiagenda.json");
            assert.ok(existsSync(ruta), "no consta con qué voz se narró el vídeo: regenéralo");
            const hecho = JSON.parse(readFileSync(ruta, "utf8"));
            assert.equal(hecho.voz, "cedar", `el vídeo se narró con «${hecho.voz}»`);
            assert.deepEqual(hecho.frases, Object.values(NARRACION).map((n) => cedar.llaveDeLaFrase(n.texto)), "el vídeo se narró con otro guion: regenéralo");
            const respiro = Number(/const RESPIRO_ENTRE_FRASES_MS = (\d+);/.exec(guion)?.[1]);
            assert.deepEqual(hecho.ritmo, { ...voz.RITMO, respiroEntreFrasesMs: respiro }, "el vídeo publicado se narró con otro ritmo: regenéralo");
        });
    });
}
