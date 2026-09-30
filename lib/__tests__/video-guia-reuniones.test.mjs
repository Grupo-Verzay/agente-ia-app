/**
 * El VÍDEO de la guía de Reuniones, con el mismo estándar que el de Leads
 * (`video-guia-leads.test.mjs`). Lo que es de TODAS las guías —el cursor, la
 * síntesis Cedar y su caché, el recorte de pausas, la grabadora— se prueba una
 * vez allí; aquí se prueba que ESTE vídeo lo usa y que sale como el de Leads:
 *
 *   1. El guion dice todas las frases de `narracion-guia-reuniones.mjs`, en su
 *      orden, y cada acción cae en la palabra que la nombra (`alDecir`).
 *   2. Cada frase está sintetizada con Cedar y va a ritmo de conversación.
 *   3. Se graba con la grabadora propia, desde el mismo instante que la voz, y
 *      el vídeo arranca en la primera palabra.
 *   4. El vídeo publicado lleva narración que se oye, sin huecos ni cola muda,
 *      narrado con Cedar y con el guion y el ritmo de hoy.
 *   5. La IMAGEN va con la VOZ: el rótulo cambia justo cuando empieza cada
 *      frase, y las dos pistas acaban juntas.
 *
 * `MODO=roto` lee `ANTES_REF` —pinchado, nunca `origin/main`— y afirma que no
 * había ni guion, ni narración, ni vídeo de Reuniones.
 *
 * Se levanta con `scripts/banco-guia-reuniones.sh`.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { cambiosDelRotulo, finDeLaPista, pistas, silencios, tamano, volumenMedio } from "./medidas-del-video.mjs";

const RAIZ = path.resolve(import.meta.dirname, "..", "..");
const MODO = process.env.MODO ?? "bueno";
const ANTES = process.env.ANTES_REF ?? "24ba0b2";
const VIDEO = path.join(RAIZ, "public", "guia", "reuniones", "demostracion.webm");
const HECHO = path.join(RAIZ, "scripts", "voz-de-la-guia", "reuniones.json");
const GUION = path.join(RAIZ, "scripts", "capturar-guia-reuniones.mjs");
const tmp = mkdtempSync(path.join(os.tmpdir(), "video-reuniones-"));

const existeEn = (ref, ruta) => spawnSync("git", ["cat-file", "-e", `${ref}:${ruta}`], { cwd: RAIZ }).status === 0;

if (MODO === "roto") {
    test("ANTES no había ni guion, ni narración, ni vídeo de Reuniones", () => {
        assert.ok(existeEn(ANTES, "scripts/capturar-guia-leads.mjs"), `${ANTES} no parece el «antes» bueno: no tiene la guía de Leads`);
        for (const f of ["scripts/capturar-guia-reuniones.mjs", "scripts/narracion-guia-reuniones.mjs", "public/guia/reuniones/demostracion.webm", "scripts/voz-de-la-guia/reuniones.json"]) {
            assert.ok(!existeEn(ANTES, f), `${f} ya existía en ${ANTES}`);
        }
    });
} else {
    const { NARRACION } = await import("../../scripts/narracion-guia-reuniones.mjs");
    const voz = await import("../../scripts/voz-de-la-guia.mjs");
    const cedar = await import("../../scripts/voz-cedar.mjs");
    const guion = readFileSync(GUION, "utf8");
    const video = guion.slice(guion.indexOf("async function video("));

    describe("el guion", () => {
        test("dice todas las frases, en el orden de la narración", () => {
            const dichas = [...video.matchAll(/(?<![A-Za-z])decir\("(\w+)"\)/g)].map((m) => m[1]);
            assert.deepEqual(dichas, Object.keys(NARRACION));
        });

        test("cada acción cae en la palabra que la nombra, y entre frases solo un respiro", () => {
            const respiro = Number(/const RESPIRO_ENTRE_FRASES_MS = (\d+);/.exec(guion)?.[1]);
            assert.ok(respiro > 0 && respiro <= 300, `el respiro entre frases es de ${respiro} ms`);
            assert.doesNotMatch(video, /quitarAvisos\(/, "el vídeo espera a que se vayan los avisos: eso es un silencio");
            const ultimaFrase = video.lastIndexOf('decir("');
            for (const m of video.matchAll(/callar\((\d+)\)/g)) {
                if (Number(m[1]) > respiro) assert.ok(m.index > ultimaFrase, `un callar(${m[1]}) en medio del vídeo`);
            }
            let actual = null;
            let cuantos = 0;
            for (const m of video.matchAll(/(alDecir|(?<![A-Za-z])decir)\("([^"]+)"/g)) {
                if (m[1] === "decir") actual = m[2];
                else {
                    assert.ok(actual, `alDecir("${m[2]}") antes de la primera frase`);
                    assert.ok(NARRACION[actual].texto.includes(m[2]), `alDecir("${m[2]}") no está en la frase «${actual}»`);
                    cuantos += 1;
                }
            }
            assert.ok(cuantos >= 12, `solo ${cuantos} acciones van en su palabra`);
        });

        test("graba con la grabadora propia, desde el mismo instante que la voz, y recorta la carga", () => {
            assert.doesNotMatch(guion, /recordVideo:/, "vuelve a grabar con recordVideo, que estira el vídeo");
            assert.match(video, /await grabar\(p, mudo/, "el vídeo no se graba con la grabadora propia");
            assert.match(video, /const t0 = Date\.now\(\);\s*grabadora\.empezarEn\(t0\);/, "el vídeo no empieza en el mismo instante que la pista de voz");
            assert.match(video, /await grabadora\.parar\(\)/, "la grabadora no se cierra");
            assert.match(video, /mezclar\(mudo, pista, destino, \{ desdeMs \}\)/, "el vídeo no recorta la carga del principio");
            assert.match(video, /viewport: \{ width: 1280, height: 800 \}/, "el vídeo no se graba al tamaño del de Leads");
        });

        test("señala el desenfoque pero NO lo enciende: con tres cámaras arrastra el navegador", () => {
            const tramo = video.slice(video.indexOf('decir("mandos")'), video.indexOf('decir("vista")'));
            assert.ok(tramo.length > 0, "no se encontró el tramo de los mandos");
            assert.doesNotMatch(tramo, /pulsar\([^;]*Desenfocar el fondo/, "el vídeo enciende el desenfoque: lo que queda del minuto se estira a más de cuatro");
            assert.match(tramo, /mover\([^;]*Desenfocar el fondo/, "el vídeo no señala la opción de desenfocar");
            assert.match(tramo, /keyboard\.press\("Escape"\)/, "el menú del fondo se queda abierto");
        });

        test("empieza como alguien que entra por primera vez: sin las preferencias de la sala", () => {
            const fin = guion.slice(guion.indexOf("const estado = await ctx.storageState();"));
            assert.match(fin.slice(0, 600), /startsWith\("reunion:"\)/, "el vídeo arrastra la distribución y el panel que dejaron las capturas");
        });
    });

    describe("la voz", () => {
        test("cada frase está sintetizada con Cedar y va a ritmo de conversación", () => {
            assert.deepEqual(cedar.lasQueFaltan(Object.values(NARRACION).map((n) => n.texto)), [], "faltan frases en scripts/voz-de-la-guia/cedar");
            let palabras = 0;
            let ms = 0;
            for (const [id, n] of Object.entries(NARRACION)) {
                const a = voz.sintetizar(n.texto, path.join(tmp, `${id}.wav`));
                assert.equal(a.frecuencia, 24000, `${id}: no es la voz Cedar`);
                const p = voz.lasPausas(a);
                assert.ok(Math.max(0, ...p.interiores) <= voz.RITMO.pausaMaximaMs + voz.RITMO.ventanaMs, `${id}: una pausa de ${Math.max(...p.interiores)} ms`);
                const w = n.texto.split(/\s+/).length;
                assert.ok(w / (a.ms / 60000) >= 140, `${id}: ${Math.round(w / (a.ms / 60000))} palabras por minuto, a ritmo de tutorial`);
                palabras += w;
                ms += a.ms;
            }
            assert.ok(palabras / (ms / 60000) >= 160, `la narración va a ${Math.round(palabras / (ms / 60000))} palabras por minuto`);
        });

        test("cada rótulo es corto, y cada frase cabe en el minuto", () => {
            for (const [id, n] of Object.entries(NARRACION)) assert.ok(n.rotulo.length <= 52, `${id}: rótulo de ${n.rotulo.length} caracteres`);
        });
    });

    describe("el vídeo publicado", () => {
        test("existe, al tamaño del de Leads, lleva narración y se oye", () => {
            assert.ok(existsSync(VIDEO), "falta el vídeo");
            const info = pistas(VIDEO);
            assert.deepEqual(info.streams.map((s) => s.codec_type).sort(), ["audio", "video"]);
            assert.equal(info.streams.find((s) => s.codec_type === "audio").codec_name, "opus");
            const { ancho, alto } = tamano(VIDEO);
            assert.deepEqual([ancho, alto], [1280, 800]);
            const vol = volumenMedio(VIDEO);
            assert.ok(vol !== null && vol > -40, `la pista es silencio (${vol} dB)`);
        });

        test("es una demostración de un minuto", () => {
            const s = Number(pistas(VIDEO).format.duration);
            assert.ok(s >= 50 && s <= 95, `el vídeo dura ${s.toFixed(1)} s`);
        });

        test("arranca en la primera palabra, no tiene huecos y acaba con la narración", () => {
            const todos = silencios(VIDEO);
            const dura = Number(pistas(VIDEO).format.duration);
            const alEmpezar = todos[0] && todos[0].inicio < 0.05 ? todos[0].dura : 0;
            assert.ok(alEmpezar <= 0.7, `el vídeo arranca con ${alEmpezar} s mudos`);
            const dentro = todos.filter((x) => x.inicio >= 0.05 && x.fin !== null && x.fin < dura - 0.5).map((x) => x.dura);
            assert.ok(Math.max(0, ...dentro) <= 1.2, `hay un hueco de ${Math.max(...dentro)} s en la narración`);
            assert.ok(dentro.filter((d) => d > 0.8).length <= 3, `demasiados huecos largos: ${dentro.join(", ")}`);
            const ultimo = todos[todos.length - 1];
            const finAudio = finDeLaPista(VIDEO, "a");
            const calla = ultimo && (ultimo.fin === null || ultimo.fin >= finAudio - 0.1) ? ultimo.inicio : finAudio;
            assert.ok(dura - calla <= 1.5, `el vídeo sigue ${(dura - calla).toFixed(2)} s mudo tras la última palabra`);
        });

        test("se narró con Cedar, con el guion y el ritmo de hoy", () => {
            assert.ok(existsSync(HECHO), "no consta con qué voz se narró el vídeo: regenéralo");
            const hecho = JSON.parse(readFileSync(HECHO, "utf8"));
            assert.equal(hecho.voz, "cedar", `el vídeo se narró con «${hecho.voz}»`);
            assert.deepEqual(hecho.frases, Object.values(NARRACION).map((n) => cedar.llaveDeLaFrase(n.texto)), "el vídeo se narró con otro guion o con otras instrucciones: regenéralo");
            const respiro = Number(/const RESPIRO_ENTRE_FRASES_MS = (\d+);/.exec(guion)?.[1]);
            assert.deepEqual(hecho.ritmo, { ...voz.RITMO, respiroEntreFrasesMs: respiro }, "el vídeo se narró con otro ritmo: regenéralo");
        });

        test("la imagen y la voz acaban juntas", () => {
            const desfase = finDeLaPista(VIDEO, "v") - finDeLaPista(VIDEO, "a");
            assert.ok(Math.abs(desfase) <= 0.25, `la imagen acaba ${desfase.toFixed(2)} s después que la voz`);
        });

        test("el rótulo cambia justo cuando empieza cada frase", () => {
            const hecho = JSON.parse(readFileSync(HECHO, "utf8"));
            assert.ok(Array.isArray(hecho.empiezanEnMs) && hecho.empiezanEnMs.length === Object.keys(NARRACION).length, "reuniones.json no dice dónde empieza cada frase: regenera el vídeo");
            const cambios = cambiosDelRotulo(VIDEO);
            const tarde = [];
            for (const ms of hecho.empiezanEnMs) {
                const e = ms / 1000;
                if (!cambios.some((d) => d >= e - 0.15 && d <= e + 0.45)) {
                    const siguiente = cambios.find((d) => d > e - 0.15);
                    tarde.push(`${e.toFixed(2)} s → ${siguiente === undefined ? "nunca" : siguiente.toFixed(2) + " s"}`);
                }
            }
            assert.deepEqual(tarde, [], "el rótulo (la imagen) no cambia cuando empieza la frase (la voz)");
        });
    });
}
