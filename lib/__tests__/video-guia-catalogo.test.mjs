/**
 * El VÍDEO de la guía de Catálogo, con el MISMO estándar que el de Leads.
 *
 * Lo que es de todas las guías —el cursor de verdad, la voz Cedar y su caché,
 * el recorte de pausas, la grabadora que pone cada fotograma en su hora— lo
 * prueba el banco del vídeo de Leads (`video-guia-leads.test.mjs`), que ejerce
 * esas piezas en abstracto. Aquí se prueba lo que es de ESTE vídeo:
 *
 *   1. Cada frase de su narración está sintetizada con Cedar, entera.
 *   2. El guion dice todas las frases, en su orden, recorre la pantalla entera
 *      (menú, barra de arriba, el catálogo público, el enlace y los cinco
 *      apartados) y cada acción cae en la palabra que la nombra.
 *   3. Se graba con la grabadora propia, desde el mismo instante que la voz,
 *      y con el ritmo de Leads: respiro corto y sin esperas mudas.
 *   4. El vídeo publicado lleva narración, arranca en la primera palabra, no
 *      tiene huecos, acaba con la voz, y el rótulo cambia cuando empieza cada
 *      frase. Y consta que se narró con Cedar y con el guion de hoy.
 *
 * `MODO=roto` mira ANTES_REF —pinchado a un commit, nunca `origin/main`— y
 * afirma el fallo: la guía de Catálogo no tenía ni narración ni vídeo.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "..", "..");
const MODO = process.env.MODO ?? "bueno";
const ANTES = process.env.ANTES_REF ?? "24ba0b2";
const VIDEO = path.join(RAIZ, "public", "guia", "catalogo", "demostracion.webm");
const GUION = path.join(RAIZ, "scripts", "capturar-guia-catalogo.mjs");
const HECHO = path.join(RAIZ, "scripts", "voz-de-la-guia", "catalogo.json");
const tmp = mkdtempSync(path.join(os.tmpdir(), "video-catalogo-"));

const existiaEn = (ruta, ref = ANTES) => spawnSync("git", ["cat-file", "-e", `${ref}:${ruta}`], { cwd: RAIZ }).status === 0;

function pistas(archivo) {
    const r = execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,codec_name:format=duration", "-of", "json", archivo]);
    return JSON.parse(String(r));
}
/** Los silencios de la pista, con el umbral de `RITMO` (−40 dB) y a partir de 350 ms. */
function silencios(archivo) {
    const r = spawnSync("ffmpeg", ["-hide_banner", "-i", archivo, "-map", "0:a:0", "-af", "silencedetect=noise=-40dB:d=0.35", "-f", "null", "-"], { encoding: "utf8" });
    const inicios = [...r.stderr.matchAll(/silence_start: (-?[\d.]+)/g)].map((m) => Number(m[1]));
    const finales = [...r.stderr.matchAll(/silence_end: ([\d.]+) \| silence_duration: ([\d.]+)/g)].map((m) => ({ fin: Number(m[1]), dura: Number(m[2]) }));
    return inicios.map((inicio, i) => ({ inicio, fin: finales[i]?.fin ?? null, dura: finales[i]?.dura ?? null }));
}
function huecos(archivo) {
    const todos = silencios(archivo);
    const duracion = Number(pistas(archivo).format.duration);
    return {
        alEmpezar: todos[0] && todos[0].inicio < 0.05 ? todos[0].dura : 0,
        dentro: todos.filter((x) => x.inicio >= 0.05 && x.fin !== null && x.fin < duracion - 0.5).map((x) => x.dura),
    };
}
function finDeLaPista(archivo, pista) {
    const r = execFileSync("ffprobe", ["-v", "error", "-select_streams", `${pista}:0`, "-show_entries", "packet=pts_time", "-of", "csv=p=0", archivo], { maxBuffer: 64 << 20 });
    const tiempos = String(r).split("\n").map((l) => Number.parseFloat(l)).filter(Number.isFinite);
    return Math.max(...tiempos);
}
/** Cuándo cambia el rótulo de abajo (texto blanco sobre fondo oscuro): la marca de la sincronía. */
function cambiosDelRotulo(archivo) {
    const r = spawnSync("ffmpeg", ["-hide_banner", "-i", archivo, "-an", "-vf", "crop=380:34:450:726,select='gt(scene\\,0.08)',showinfo", "-f", "null", "-"], { encoding: "utf8", maxBuffer: 64 << 20 });
    return [...r.stderr.matchAll(/pts_time:([\d.]+)/g)].map((m) => Number(m[1]));
}
function dondeCallaDelTodo(archivo) {
    const todos = silencios(archivo);
    const ultimo = todos[todos.length - 1];
    const fin = finDeLaPista(archivo, "a");
    return ultimo && (ultimo.fin === null || ultimo.fin >= fin - 0.1) ? ultimo.inicio : fin;
}
function volumenMedio(archivo) {
    const r = spawnSync("ffmpeg", ["-hide_banner", "-i", archivo, "-map", "0:a:0", "-af", "volumedetect", "-f", "null", "-"], { encoding: "utf8" });
    const m = /mean_volume:\s*(-?[\d.]+) dB/.exec(r.stderr);
    return m ? Number(m[1]) : null;
}

if (MODO === "roto") {
    describe(`ANTES (${ANTES}): Catálogo sin vídeo`, () => {
        test("no había narración, ni guion de vídeo, ni vídeo publicado", () => {
            assert.equal(existiaEn("scripts/narracion-guia-catalogo.mjs"), false, "ya había narración");
            assert.equal(existiaEn("scripts/capturar-guia-catalogo.mjs"), false, "ya había guion");
            assert.equal(existiaEn("public/guia/catalogo/demostracion.webm"), false, "ya había vídeo");
            assert.equal(existiaEn("scripts/voz-de-la-guia/catalogo.json"), false, "ya constaba una voz");
        });
    });
} else {
    const { NARRACION, comoSeDice } = await import("../../scripts/narracion-guia-catalogo.mjs");
    const { NARRACION: DE_LEADS } = await import("../../scripts/narracion-guia-leads.mjs");
    const voz = await import("../../scripts/voz-de-la-guia.mjs");
    const cedar = await import("../../scripts/voz-cedar.mjs");
    const guion = readFileSync(GUION, "utf8");
    const elVideo = guion.slice(guion.indexOf("async function video("));

    describe("la voz", () => {
        test("cada frase está sintetizada con Cedar, entera", () => {
            const faltan = cedar.lasQueFaltan(Object.values(NARRACION).map((n) => n.texto));
            assert.deepEqual(faltan, [], "faltan frases en scripts/voz-de-la-guia/cedar: node scripts/sintetizar-voz-de-la-guia.mjs scripts/narracion-guia-catalogo.mjs");
            for (const [id, n] of Object.entries(NARRACION)) {
                const a = voz.sintetizar(n.texto, path.join(tmp, `${id}.wav`));
                assert.equal(a.frecuencia, 24000, `${id}: no es la voz Cedar`);
                const palabras = n.texto.split(/\s+/).length;
                assert.ok(a.ms > palabras * 180 && a.ms < palabras * 700, `${id}: ${a.ms} ms para ${palabras} palabras`);
            }
        });
        test("la narración, con las pausas acortadas, va a ritmo de conversación", () => {
            let palabras = 0;
            let ms = 0;
            for (const [id, n] of Object.entries(NARRACION)) {
                // `sintetizar` ya devuelve la frase con las pausas acortadas.
                const a = voz.sintetizar(n.texto, path.join(tmp, `ritmo-${id}.wav`));
                palabras += n.texto.split(/\s+/).length;
                ms += a.ms;
            }
            const porMinuto = (palabras / ms) * 60000;
            assert.ok(porMinuto >= 160, `la narración va a ${Math.round(porMinuto)} palabras por minuto`);
        });
        test("la barra de arriba se nombra con LA MISMA frase que en Leads: la barra es la misma", () => {
            assert.equal(NARRACION.barraDeArriba.texto, DE_LEADS.barraDeArriba.texto);
        });
        test("lo que no es español se dice como suena", () => {
            assert.equal(comoSeDice("WhatsApp, Facebook y TikTok"), "guatsap, feisbuk y tik tok");
        });
    });

    describe("el guion", () => {
        test("dice todas las frases, en su orden", () => {
            const dichas = [...elVideo.matchAll(/(?<!al)decir\("(\w+)"\)/gi)].filter((m) => m[0].startsWith("decir")).map((m) => m[1]);
            assert.deepEqual(dichas, Object.keys(NARRACION));
        });
        test("recorre la pantalla entera: el menú, la barra, el catálogo público, el enlace y los cinco apartados", () => {
            for (const id of ["menu", "barraDeArriba", "verCatalogo", "buscar", "botonWhatsApp", "enlace", "numero", "identidad", "textos", "redes", "opciones", "cierre"]) {
                assert.ok(NARRACION[id], `la narración no tiene la frase «${id}»`);
            }
            for (const clave of ["identidad", "textos", "redes", "opciones"]) {
                assert.ok(elVideo.includes(`abrirApartado("${clave}")`), `el vídeo no abre el apartado «${clave}»`);
            }
            assert.match(elVideo, /pulsar\(p, ver\)/, "el vídeo no abre el catálogo público");
            assert.match(elVideo, /pulsar\(p, guardarTodo\)/, "el vídeo no pulsa Guardar");
        });
        test("enlaza las frases: respiro corto, sin esperas, y cada acción en la palabra que la nombra", () => {
            const respiro = Number(/const RESPIRO_ENTRE_FRASES_MS = (\d+);/.exec(guion)?.[1]);
            assert.ok(respiro > 0 && respiro <= 300, `el respiro entre frases es de ${respiro} ms`);
            assert.doesNotMatch(elVideo, /quitarAvisos\(/, "el vídeo espera a que se vayan los avisos: eso es un silencio");
            const ultimaFrase = elVideo.lastIndexOf('decir("');
            for (const m of elVideo.matchAll(/callar\((\d+)\)/g)) {
                if (Number(m[1]) > respiro) assert.ok(m.index > ultimaFrase, `un callar(${m[1]}) en medio del vídeo`);
            }
            let actual = null;
            let cuantos = 0;
            for (const m of elVideo.matchAll(/(alDecir|decir)\("([^"]+)"/g)) {
                if (m[1] === "decir") actual = m[2];
                else {
                    assert.ok(actual, `alDecir("${m[2]}") antes de la primera frase`);
                    assert.ok(NARRACION[actual].texto.includes(m[2]), `alDecir("${m[2]}") no está en la frase «${actual}»`);
                    cuantos += 1;
                }
            }
            assert.ok(cuantos >= 15, `solo ${cuantos} acciones van en su palabra`);
            assert.match(elVideo, /mezclar\(mudo, pista, destino, \{ desdeMs \}\)/, "el vídeo no recorta la carga del principio");
        });
        test("graba con la grabadora propia, desde el mismo instante que la voz", () => {
            assert.doesNotMatch(guion, /recordVideo:/, "graba con recordVideo, que estira el vídeo");
            assert.match(elVideo, /await grabar\(p, mudo/, "el vídeo no se graba con la grabadora propia");
            assert.match(elVideo, /const t0 = Date\.now\(\);\s*grabadora\.empezarEn\(t0\);/, "el vídeo no empieza en el mismo instante que la voz");
            assert.match(elVideo, /await grabadora\.parar\(\)/, "la grabadora no se cierra");
            assert.match(elVideo, /addInitScript\(CURSOR\)/, "el vídeo no lleva el cursor de verdad");
        });
        test("el catálogo público se abre en la MISMA pestaña: una pestaña nueva no saldría grabada", () => {
            assert.match(elVideo, /window\.open = \(url\) =>/, "«Ver catálogo» abriría una pestaña que no se graba");
            assert.match(elVideo, /p\.goBack\(/, "el vídeo no vuelve a la configuración");
        });
        test("enseña el dominio de verdad, no el del banco", () => {
            assert.match(elVideo, /conElDominioDeLaGuia\(ctx, BASE\)/, "el vídeo enseñaría localhost en el enlace");
        });
    });

    describe("el vídeo publicado", () => {
        test("lleva narración, y se oye", () => {
            assert.ok(existsSync(VIDEO), "falta el vídeo");
            const info = pistas(VIDEO);
            assert.deepEqual(info.streams.map((s) => s.codec_type).sort(), ["audio", "video"]);
            assert.equal(info.streams.find((s) => s.codec_type === "audio").codec_name, "opus");
            const v = volumenMedio(VIDEO);
            assert.ok(v !== null && v > -40, `la pista es silencio (${v} dB)`);
        });
        test("dura lo de una demostración: alrededor de un minuto", () => {
            const d = Number(pistas(VIDEO).format.duration);
            assert.ok(d >= 45 && d <= 110, `el vídeo dura ${d.toFixed(1)} s`);
        });
        test("arranca en la primera palabra y no tiene huecos", () => {
            const h = huecos(VIDEO);
            assert.ok(h.alEmpezar <= 0.7, `el vídeo arranca con ${h.alEmpezar} s mudos`);
            const mayor = Math.max(0, ...h.dentro);
            assert.ok(mayor <= 1.2, `hay un hueco de ${mayor} s en la narración`);
            const largos = h.dentro.filter((d) => d > 0.8).length;
            assert.ok(largos <= 3, `${largos} huecos de más de 0,8 s: ${h.dentro.join(", ")}`);
        });
        test("acaba con la narración, sin cola muda", () => {
            const cola = Number(pistas(VIDEO).format.duration) - dondeCallaDelTodo(VIDEO);
            assert.ok(cola <= 1.5, `el vídeo sigue ${cola.toFixed(2)} s mudo tras la última palabra`);
        });
        test("la imagen y la voz acaban juntas", () => {
            const desfase = finDeLaPista(VIDEO, "v") - finDeLaPista(VIDEO, "a");
            assert.ok(Math.abs(desfase) <= 0.25, `la imagen acaba ${desfase.toFixed(2)} s después que la voz`);
        });
        test("el rótulo cambia justo cuando empieza cada frase", () => {
            const hecho = JSON.parse(readFileSync(HECHO, "utf8"));
            assert.ok(Array.isArray(hecho.empiezanEnMs) && hecho.empiezanEnMs.length === Object.keys(NARRACION).length, "catalogo.json no dice dónde empieza cada frase: regenera el vídeo");
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
        test("está narrado con Cedar, con el guion de hoy y con el ritmo de Leads", () => {
            assert.ok(existsSync(HECHO), "no consta con qué voz se narró el vídeo: regenéralo");
            const hecho = JSON.parse(readFileSync(HECHO, "utf8"));
            assert.equal(hecho.voz, "cedar", `el vídeo se narró con «${hecho.voz}»`);
            assert.deepEqual(hecho.frases, Object.values(NARRACION).map((n) => cedar.llaveDeLaFrase(n.texto)), "el vídeo se narró con otro guion: regenéralo");
            const respiro = Number(/const RESPIRO_ENTRE_FRASES_MS = (\d+);/.exec(guion)?.[1]);
            assert.deepEqual(hecho.ritmo, { ...voz.RITMO, respiroEntreFrasesMs: respiro }, "el vídeo publicado se narró con otro ritmo: regenéralo");
            const deLeads = JSON.parse(readFileSync(path.join(RAIZ, "scripts", "voz-de-la-guia", "leads.json"), "utf8"));
            assert.deepEqual(hecho.ritmo, deLeads.ritmo, "Catálogo y Leads se narraron con ritmos distintos");
        });
    });
}
