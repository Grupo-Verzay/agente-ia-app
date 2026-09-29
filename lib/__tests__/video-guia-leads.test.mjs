/**
 * El VÍDEO de la guía de Leads: el cursor es el de verdad y lleva narración.
 *
 *   1. El cursor: flecha al moverse, manito sobre lo que se pulsa, la «I» en
 *      un campo de texto, y NADA más —ni halo, ni círculo, ni encogerse al
 *      pulsar—. Se comprueba en Chromium, moviendo el ratón de verdad sobre
 *      una página con botones, enlaces, un interruptor, un campo y texto.
 *   2. La voz: cada frase del guion se sintetiza con es3 SIN un solo fonema
 *      rellenado con silencio, y la corrección de la transcripción es pura.
 *   3. El guion dice todas las frases, en su orden.
 *   4. El vídeo publicado LLEVA audio, y el audio no es silencio.
 *
 * `MODO=roto` lee el guion y el vídeo de ANTES_VIDEO_REF —pinchado a un commit,
 * nunca `origin/main`— y afirma el fallo: el cursor era una bolita con halo
 * que se encogía al pulsar, y el vídeo no tenía pista de audio.
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
const VIDEO = path.join(RAIZ, "public", "guia", "leads", "demostracion.webm");
const tmp = mkdtempSync(path.join(os.tmpdir(), "video-guia-"));

const deGit = (ruta) => execFileSync("git", ["show", `${ANTES}:${ruta}`], { cwd: RAIZ, maxBuffer: 64 << 20 });

function pistas(archivo) {
    const r = execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,codec_name:format=duration", "-of", "json", archivo]);
    return JSON.parse(String(r));
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
    });
} else {
    const { CURSOR, SVG_FLECHA, SVG_MANO } = await import("../../scripts/cursor-de-la-guia.mjs");
    const { NARRACION, comoSeDice } = await import("../../scripts/narracion-guia-leads.mjs");
    const voz = await import("../../scripts/voz-de-la-guia.mjs");

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
        test("cada frase del guion se dice ENTERA con es3, sin huecos", () => {
            for (const [id, n] of Object.entries(NARRACION)) {
                const a = voz.sintetizar(comoSeDice(n.texto), path.join(tmp, `${id}.wav`));
                assert.equal(a.frecuencia, 16000, `${id}: no salió con es3`);
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
        const dichas = [...guion.matchAll(/decir\("(\w+)"\)/g)].map((m) => m[1]);
        assert.deepEqual(dichas, Object.keys(NARRACION));
        assert.match(guion, /mezclar\(/, "el guion no le pega la narración al vídeo");
        const estilo = /Object\.assign\(c\.style, \{([^}]*)\}\)/.exec(CURSOR)?.[1] ?? "";
        assert.ok(estilo.includes("pointerEvents"), "no se encontró el estilo del cursor");
        assert.doesNotMatch(estilo, /borderRadius|boxShadow|background|border:/, "el cursor sigue llevando adornos");
        assert.doesNotMatch(CURSOR, /scale\(|mousedown/, "el cursor sigue cambiando al pulsar");
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
