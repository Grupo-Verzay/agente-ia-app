/**
 * El VÍDEO de la guía de Diagramas, con el MISMO estándar que el de Leads
 * (`video-guia-leads.test.mjs`): la voz Cedar, el ritmo de una llamada y la
 * imagen pegada a la voz. Lo que es común a las dos guías —el cursor, la
 * grabadora, el recorte de pausas— lo prueba el de Leads; aquí se prueba lo
 * que es de ESTE vídeo:
 *
 *   1. Cada frase de la narración está sintetizada con Cedar en la caché del
 *      repositorio, y cada una, ya acortada, va a ritmo de conversación.
 *   2. El guion dice todas las frases en su orden, y cada acción cae en la
 *      palabra que la nombra (`alDecir`), sin esperas mudas entre frases.
 *   3. El vídeo publicado lleva voz que se oye, dura «un minuto» (lo que
 *      promete la tarjeta de demostración: ni diez segundos ni cinco minutos),
 *      arranca en la primera palabra, no tiene huecos ni cola muda, y el
 *      rótulo cambia justo cuando empieza cada frase.
 *   4. Recorre lo que la guía explica: la lista, el menú, la barra de arriba,
 *      crear un diagrama, agregar un paso por el «+», escribir en su caja,
 *      Ordenar y el guardado, compartir y el «⋯» de la tarjeta.
 *
 * `MODO=roto` lee `ANTES_REF` —pinchado a un commit, nunca `origin/main`— y
 * afirma que no había ni narración, ni vídeo, ni constancia de su voz.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { cambiosDelRotulo, dondeCallaDelTodo, finDeLaPista, huecos, pistas, tamano, volumenMedio } from "./medidas-del-video.mjs";

const RAIZ = path.resolve(import.meta.dirname, "..", "..");
const ROTO = process.env.MODO === "roto";
const ANTES = process.env.ANTES_REF ?? "6d8cd4b";
const VIDEO = path.join(RAIZ, "public", "guia", "diagramas", "demostracion.webm");
const GUION = path.join(RAIZ, "scripts", "capturar-guia-diagramas.mjs");
const HECHO = path.join(RAIZ, "scripts", "voz-de-la-guia", "diagramas.json");
const tmp = mkdtempSync(path.join(os.tmpdir(), "video-guia-diagramas-"));

const existeEn = (ref, rel) => {
    try {
        execFileSync("git", ["cat-file", "-e", `${ref}:${rel}`], { cwd: RAIZ, stdio: "ignore" });
        return true;
    } catch {
        return false;
    }
};

if (ROTO) {
    describe("ANTES: la guía de Diagramas no tenía vídeo", () => {
        test("no había narración ni guion del vídeo", () => {
            assert.equal(existeEn(ANTES, "scripts/narracion-guia-diagramas.mjs"), false, "ya había narración");
            assert.equal(existeEn(ANTES, "scripts/capturar-guia-diagramas.mjs"), false, "ya había guion");
        });
        test("no había vídeo publicado ni constancia de con qué voz se narró", () => {
            assert.equal(existeEn(ANTES, "public/guia/diagramas/demostracion.webm"), false, "ya había vídeo");
            assert.equal(existeEn(ANTES, "scripts/voz-de-la-guia/diagramas.json"), false, "ya constaba la voz");
        });
    });
} else {
    const { NARRACION } = await import("../../scripts/narracion-guia-diagramas.mjs");
    const voz = await import("../../scripts/voz-de-la-guia.mjs");
    const cedar = await import("../../scripts/voz-cedar.mjs");
    const guion = readFileSync(GUION, "utf8");
    const video = guion.slice(guion.indexOf("async function video("));
    const { RITMO } = voz;

    describe("la voz", () => {
        test("la voz es Cedar, y cada frase del guion está sintetizada entera", () => {
            assert.equal(process.env.VOZ_GUIA ?? "", "", "el banco corre con VOZ_GUIA puesta");
            assert.equal(voz.usaCedar(), true);
            const faltan = cedar.lasQueFaltan(Object.values(NARRACION).map((n) => n.texto));
            assert.deepEqual(faltan, [], "faltan frases en scripts/voz-de-la-guia/cedar: node scripts/sintetizar-voz-de-la-guia.mjs scripts/narracion-guia-diagramas.mjs");
        });

        test("cada frase, ya acortada: ninguna pausa pasa del máximo, y el conjunto va a ritmo de conversación", () => {
            let palabras = 0;
            let ms = 0;
            for (const [id, n] of Object.entries(NARRACION)) {
                const a = voz.sintetizar(n.texto, path.join(tmp, `${id}.wav`));
                assert.equal(a.frecuencia, 24000, `${id}: no es la voz Cedar`);
                const p = voz.lasPausas(a);
                assert.ok(Math.max(0, ...p.interiores) <= RITMO.pausaMaximaMs + RITMO.ventanaMs, `${id}: una pausa de ${Math.max(...p.interiores)} ms`);
                assert.ok(p.inicio <= RITMO.bordeInicialMs + RITMO.ventanaMs && p.fin <= RITMO.bordeFinalMs + RITMO.ventanaMs, `${id}: bordes de ${p.inicio}/${p.fin} ms`);
                const n2 = n.texto.split(/\s+/).length;
                const wpm = n2 / (a.ms / 60000);
                assert.ok(wpm >= 140, `${id}: ${Math.round(wpm)} palabras por minuto, a ritmo de tutorial`);
                palabras += n2;
                ms += a.ms;
            }
            const total = palabras / (ms / 60000);
            assert.ok(total >= 160, `la narración va a ${Math.round(total)} palabras por minuto`);
        });

        test("cada frase tiene su rótulo, corto: se lee abajo mientras suena", () => {
            for (const [id, n] of Object.entries(NARRACION)) {
                assert.ok(n.rotulo && n.rotulo.length <= 60, `${id}: rótulo de ${n.rotulo?.length} caracteres`);
                assert.ok(n.texto.length > n.rotulo.length, `${id}: el rótulo dice más que la frase`);
            }
        });

        test("la frase de la barra de arriba es la de Leads: la barra es la misma, y la voz sale de la caché", async () => {
            const { NARRACION: LEADS } = await import("../../scripts/narracion-guia-leads.mjs");
            assert.equal(NARRACION.barraDeArriba.texto, LEADS.barraDeArriba.texto);
        });
    });

    describe("el guion", () => {
        test("dice todas las frases, en su orden, y graba con la grabadora propia", () => {
            const dichas = [...video.matchAll(/(?<![A-Za-z])decir\("(\w+)"\)/g)].map((m) => m[1]);
            assert.deepEqual(dichas, Object.keys(NARRACION));
            assert.doesNotMatch(guion, /recordVideo:/, "graba con recordVideo, que estira el vídeo");
            assert.match(video, /await grabar\(p, mudo/, "el vídeo no se graba con la grabadora propia");
            assert.match(video, /const t0 = Date\.now\(\);\s*grabadora\.empezarEn\(t0\);/, "el vídeo no empieza en el mismo instante que la voz");
            assert.match(video, /await grabadora\.parar\(\)/, "la grabadora no se cierra");
            assert.match(video, /mezclar\(mudo, pista, destino, \{ desdeMs \}\)/, "el vídeo no recorta la carga del principio");
        });

        test("enlaza las frases: respiro corto, sin esperas, y cada acción en la palabra que la nombra", () => {
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
            assert.ok(cuantos >= 25, `solo ${cuantos} acciones van en su palabra`);
        });

        test("recorre lo que la guía explica, y no cambia nada que no sea suyo", () => {
            const tramos = {
                nuevo: /pulsar\(p, nuevo\)/,
                agregar: /pulsar\(p, elMas\(decision, "yes"\)\)/,
                escribir: /textarea\[id\^="texto-"\]/,
                ordenar: /pulsar\(p, elOrdenar\(p\)\)/,
                compartir: /pulsar\(p, nuestra\.equipo\)[\s\S]*opcion\("Editable"\)/,
                cierre: /pulsar\(p, nuestra\.mas\)/,
            };
            for (const [frase, patron] of Object.entries(tramos)) {
                const desde = video.indexOf(`decir("${frase}")`);
                assert.ok(desde > 0, `el vídeo no tiene la frase «${frase}»`);
                assert.match(video.slice(desde), patron, `tras «${frase}» no se hace lo que se dice`);
            }
            // Del «⋯» solo se NOMBRAN las opciones: pulsar Eliminar o Duplicar
            // cambiaría los datos de ejemplo delante de la cámara.
            const cierre = video.slice(video.indexOf('decir("cierre")'));
            assert.doesNotMatch(cierre, /pulsar\(p, accion\(/, "el vídeo pulsa una opción del «⋯»");
        });
    });

    describe("el vídeo publicado", () => {
        test("existe, 1280×800, lleva voz Opus y se oye", () => {
            assert.ok(existsSync(VIDEO), "falta el vídeo");
            assert.deepEqual(tamano(VIDEO), { ancho: 1280, alto: 800 });
            const info = pistas(VIDEO);
            assert.deepEqual(info.streams.map((s) => s.codec_type).sort(), ["audio", "video"]);
            assert.equal(info.streams.find((s) => s.codec_type === "audio").codec_name, "opus");
            const v = volumenMedio(VIDEO);
            assert.ok(v !== null && v > -40, `la pista es silencio (${v} dB)`);
        });

        test("dura lo que promete la tarjeta: alrededor de un minuto", () => {
            const s = Number(pistas(VIDEO).format.duration);
            assert.ok(s >= 45 && s <= 120, `el vídeo dura ${s.toFixed(1)} s`);
        });

        test("arranca en la primera palabra, sin huecos ni cola muda", () => {
            const h = huecos(VIDEO);
            assert.ok(h.alEmpezar <= 0.7, `el vídeo arranca con ${h.alEmpezar} s mudos`);
            const mayor = Math.max(0, ...h.dentro);
            assert.ok(mayor <= 1.2, `hay un hueco de ${mayor} s en la narración`);
            const largos = h.dentro.filter((d) => d > 0.8).length;
            assert.ok(largos <= 3, `${largos} huecos de más de 0,8 s: ${h.dentro.join(", ")}`);
            const cola = Number(pistas(VIDEO).format.duration) - dondeCallaDelTodo(VIDEO);
            assert.ok(cola <= 1.5, `el vídeo sigue ${cola.toFixed(2)} s mudo tras la última palabra`);
        });

        test("la imagen y la voz acaban juntas", () => {
            const desfase = finDeLaPista(VIDEO, "v") - finDeLaPista(VIDEO, "a");
            assert.ok(Math.abs(desfase) <= 0.25, `la imagen acaba ${desfase.toFixed(2)} s después que la voz`);
        });

        test("está narrado con Cedar, con el guion y el ritmo de hoy", () => {
            assert.ok(existsSync(HECHO), "no consta con qué voz se narró el vídeo: regenéralo");
            const hecho = JSON.parse(readFileSync(HECHO, "utf8"));
            assert.equal(hecho.voz, "cedar", `el vídeo se narró con «${hecho.voz}»`);
            assert.deepEqual(hecho.frases, Object.values(NARRACION).map((n) => cedar.llaveDeLaFrase(n.texto)), "el vídeo se narró con otro guion o con otras instrucciones: regenéralo");
            const respiro = Number(/const RESPIRO_ENTRE_FRASES_MS = (\d+);/.exec(guion)?.[1]);
            assert.deepEqual(hecho.ritmo, { ...RITMO, respiroEntreFrasesMs: respiro }, "el vídeo publicado se narró con otro ritmo: regenéralo");
        });

        test("el rótulo cambia justo cuando empieza cada frase", () => {
            const hecho = JSON.parse(readFileSync(HECHO, "utf8"));
            assert.ok(Array.isArray(hecho.empiezanEnMs) && hecho.empiezanEnMs.length === Object.keys(NARRACION).length, "diagramas.json no dice dónde empieza cada frase: regenera el vídeo");
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
    });
}
