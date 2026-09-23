/**
 * El banco del diálogo «Detalle de la llamada» de CRM › Llamadas.
 *
 * Cuatro cosas, y cada una tiene su forma de comprobarse:
 *
 *   1. El reproductor es la NOTA DE VOZ de Chats: el mismo componente, leído
 *      del código (las dos pantallas importan `NotaDeVoz`) y pintado en
 *      Chromium (el marco, el ancho de 350 px y la duración ANTES de pulsar
 *      play, con un WAV de verdad de 187 s).
 *   2. El nombre de la marca: «Verzi», «Verzei» y «Berzy» se escriben bien al
 *      GUARDAR (`conElNombreDeLaMarca`).
 *   3. Los iconos por hablante: solo cuando el texto trae los turnos
 *      marcados, y solo en la transcripción. Un texto corrido —lo que
 *      devuelve OpenAI— se pinta tal cual: no se inventa quién habló.
 *   4. Sin botón «Cerrar» abajo: solo la equis.
 *
 * `MODO=roto` pinta el diálogo de ANTES_REF y **afirma los fallos**: el
 * reproductor propio en vez de la nota, el «Cerrar» del pie, ningún icono por
 * hablante y las tres formas del nombre sin corregir.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createRequire } from "node:module";

// Con require y no con import(): el playwright del entorno vive fuera del repo y
// solo lo encuentra NODE_PATH, que un import() de ESM no mira.
const require = createRequire(import.meta.url);
let chromium = null;
try {
    ({ chromium } = require("playwright"));
} catch {
    try {
        ({ chromium } = require("@playwright/test"));
    } catch {
        chromium = null;
    }
}

const ROTO = process.env.MODO === "roto";
const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..", "..");
const FUENTES = process.env.FUENTES_DEL_DETALLE || RAIZ;
const PURO = join(AQUI, ".compilado", "detalle-de-llamada-puro.mjs");
const HARNESS = join(AQUI, ".compilado", "harness-detalle-de-llamada.js");
const DIR_CSS = join(RAIZ, ".next", "static", "css");
const CSS = fs.existsSync(DIR_CSS)
    ? fs
          .readdirSync(DIR_CSS)
          .filter((f) => f.endsWith(".css"))
          .map((f) => fs.readFileSync(join(DIR_CSS, f), "utf8"))
          .join("\n")
    : "";

const puro = await import(PURO);

// ── 2 · el nombre de la marca ────────────────────────────────────────────────

test("2 · «Verzi de Verzei» se guarda como «Verzy de Verzay»", () => {
    const r = puro.conElNombreDeLaMarca("Hola, soy Verzi de Verzei.");
    if (ROTO) {
        assert.equal(r, "Hola, soy Verzi de Verzei.", "el roto no reproduce: ya corregía estas formas");
        return;
    }
    assert.equal(r, "Hola, soy Verzy de Verzay.");
});

test("2 · «Berzy» se guarda como «Verzy»", () => {
    const r = puro.conElNombreDeLaMarca("Le habla Berzy.");
    if (ROTO) {
        assert.equal(r, "Le habla Berzy.", "el roto no reproduce: ya corregía «Berzy»");
        return;
    }
    assert.equal(r, "Le habla Verzy.");
});

test("2 · lo que ya está bien no se toca, y una palabra que CONTIENE la forma tampoco", () => {
    assert.equal(puro.conElNombreDeLaMarca("Soy Verzy, de Verzay."), "Soy Verzy, de Verzay.");
    assert.equal(puro.conElNombreDeLaMarca("Verziones y verzeidad"), "Verziones y verzeidad");
});

// ── 3 · los turnos, sin inventarlos ─────────────────────────────────────────

test("3 · un texto CORRIDO no tiene turnos: se pinta tal cual", { skip: ROTO && "no existía el lector de turnos" }, () => {
    assert.equal(puro.losTurnos("Hola soy Verzy de Verzay le llamo por la cotización"), null);
    assert.equal(puro.losTurnos(""), null);
    assert.equal(puro.losTurnos(null), null);
});

test("3 · Operador / Cliente dan turnos, y lo que sigue sin marca va con el turno de antes", { skip: ROTO && "no existía el lector de turnos" }, () => {
    const t = puro.losTurnos("Operador: Hola.\nCliente: Sí,\ndígame.\n**Asistente:** Claro.");
    assert.deepEqual(t, [
        { quien: "asistente", texto: "Hola." },
        { quien: "persona", texto: "Sí,\ndígame." },
        { quien: "asistente", texto: "Claro." },
    ]);
});

test("3 · un texto que EMPIEZA sin marca no se reparte a medias", { skip: ROTO && "no existía el lector de turnos" }, () => {
    assert.equal(puro.losTurnos("Buenos días.\nCliente: Hola."), null);
});

// ── 1 · el mismo componente en las dos pantallas (leído del código) ─────────

function leer(ruta) {
    return fs.readFileSync(join(FUENTES, ruta), "utf8");
}

test("1 · Chats y el detalle pintan la MISMA nota de voz", () => {
    const chats = leer("app/(root)/chats/_components/MediaRenderer.tsx");
    const detalle = leer("app/(root)/crm/llamadas/_components/CallDetailDialog.tsx");
    const usaLaNota = (s) => /from ['"]@\/components\/shared\/NotaDeVoz['"]/.test(s);
    if (ROTO) {
        assert.ok(!usaLaNota(detalle), "el roto no reproduce: el detalle ya usaba la nota de voz");
        assert.ok(/data-reproductor/.test(detalle), "el detalle de antes tenía su reproductor propio");
        return;
    }
    assert.ok(usaLaNota(chats), "Chats no pinta la nota de voz compartida");
    assert.ok(usaLaNota(detalle), "el detalle no pinta la nota de voz compartida");
    assert.ok(!/data-reproductor|<audio/.test(detalle), "el detalle sigue escribiendo su propio reproductor");
    assert.ok(!/<audio/.test(chats), "Chats vuelve a escribir el <audio> de la nota a mano");
});

test("4 · el diálogo no tiene pie ni «Cerrar»", () => {
    const detalle = leer("app/(root)/crm/llamadas/_components/CallDetailDialog.tsx");
    if (ROTO) {
        assert.ok(/DialogFooter/.test(detalle) && /Cerrar/.test(detalle), "el roto no reproduce: no había botón Cerrar");
        return;
    }
    assert.ok(!/DialogFooter/.test(detalle), "el diálogo sigue teniendo pie");
});

// ── en Chromium: el diálogo pintado ─────────────────────────────────────────

/** Un WAV de silencio de `segundos`: 8 kHz, mono, 8 bits. */
function unWav(segundos) {
    const datos = 8000 * segundos;
    const b = Buffer.alloc(44 + datos, 128);
    b.write("RIFF", 0);
    b.writeUInt32LE(36 + datos, 4);
    b.write("WAVE", 8);
    b.write("fmt ", 12);
    b.writeUInt32LE(16, 16);
    b.writeUInt16LE(1, 20);
    b.writeUInt16LE(1, 22);
    b.writeUInt32LE(8000, 24);
    b.writeUInt32LE(8000, 28);
    b.writeUInt16LE(1, 32);
    b.writeUInt16LE(8, 34);
    b.write("data", 36);
    b.writeUInt32LE(datos, 40);
    return b;
}

const saltar = !chromium || !fs.existsSync(HARNESS) ? "sin Chromium o sin harness" : false;
let ctx = null;

async function pagina() {
    if (ctx) return ctx;
    const bundle = fs.readFileSync(HARNESS);
    const wav = unWav(187);
    const server = http.createServer((req, res) => {
        const u = (req.url ?? "/").split("?")[0];
        if (u === "/") {
            res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
            res.end(
                `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head>` +
                    `<body><div id="pantalla"></div><script type="module" src="/harness.js"></script></body></html>`,
            );
            return;
        }
        if (u === "/harness.js") {
            res.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8" });
            res.end(bundle);
            return;
        }
        if (u === "/grabacion.wav") {
            // Con rangos, que es como el navegador pide el audio.
            const r = /bytes=(\d+)-(\d*)/.exec(req.headers.range ?? "");
            if (r) {
                const ini = Number(r[1]);
                const fin = r[2] ? Math.min(Number(r[2]), wav.length - 1) : wav.length - 1;
                res.writeHead(206, {
                    "Content-Type": "audio/wav",
                    "Content-Range": `bytes ${ini}-${fin}/${wav.length}`,
                    "Content-Length": fin - ini + 1,
                    "Accept-Ranges": "bytes",
                });
                res.end(wav.subarray(ini, fin + 1));
            } else {
                res.writeHead(200, { "Content-Type": "audio/wav", "Content-Length": wav.length, "Accept-Ranges": "bytes" });
                res.end(wav);
            }
            return;
        }
        res.writeHead(404);
        res.end("no");
    });
    await new Promise((r) => server.listen(0, r));
    const navegador = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined });
    const page = await (await navegador.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    const reventones = [];
    page.on("pageerror", (e) => reventones.push(String(e)));
    await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: "load" });
    await page.waitForFunction("window.listo === true", { timeout: 20000 });
    ctx = { page, navegador, server, reventones };
    return ctx;
}

async function abrir(id) {
    const { page, reventones } = await pagina();
    await page.evaluate((i) => window.abrir(i), id);
    await page.waitForSelector('[role="dialog"]', { timeout: 10000 });
    await page.waitForTimeout(300);
    assert.equal(reventones.join(" | "), "", "el diálogo reventó al pintarse");
    return page;
}

test("1 · la grabación es la nota de voz: su marco, sus 350 px y la duración SIN pulsar play", { skip: saltar }, async () => {
    const page = await abrir("d1");
    // El audio no se toca: solo se espera a que el navegador lea los metadatos.
    await page.waitForFunction(
        () => {
            const a = document.querySelector('[role="dialog"] audio');
            return !a || (Number.isFinite(a.duration) && a.duration > 0) || a.error;
        },
        null,
        { timeout: 10000 },
    ).catch(() => {});
    const d = await page.evaluate(() => {
        const dlg = document.querySelector('[role="dialog"]');
        const nota = dlg.querySelector("[data-nota-de-voz]");
        const audio = dlg.querySelector("audio");
        return {
            hayNota: !!nota,
            hayReproductorPropio: !!dlg.querySelector("[data-reproductor]"),
            anchoDelMarco: nota ? nota.parentElement.getBoundingClientRect().width : null,
            fondo: nota ? getComputedStyle(nota).backgroundColor : null,
            preload: audio?.getAttribute("preload") ?? null,
            controls: audio?.hasAttribute("controls") ?? false,
            duracion: audio ? audio.duration : null,
            enPausa: audio ? audio.paused : null,
            tiempo: audio ? audio.currentTime : null,
        };
    });
    if (ROTO) {
        assert.equal(d.hayNota, false, "el roto no reproduce: ya había nota de voz");
        assert.equal(d.hayReproductorPropio, true, "el diálogo de antes no tenía su reproductor propio");
        return;
    }
    assert.equal(d.hayNota, true, "la grabación no se pinta como una nota de voz");
    assert.equal(d.hayReproductorPropio, false);
    assert.equal(d.anchoDelMarco, 350, "la nota no mide lo que mide en Chats");
    assert.equal(d.preload, "metadata");
    assert.equal(d.controls, true);
    assert.ok(Math.abs(d.duracion - 187) < 1, `la duración no se sabe sin pulsar play (dice ${d.duracion})`);
    assert.equal(d.enPausa, true, "el banco pulsó play sin querer");
    assert.equal(d.tiempo, 0, "la nota no arranca en el principio");
});

test("4 · el diálogo se cierra solo con la equis: ningún «Cerrar» abajo", { skip: saltar }, async () => {
    const page = await abrir("d1");
    const botones = await page.evaluate(() =>
        [...document.querySelectorAll('[role="dialog"] button')].map((b) => (b.textContent ?? "").trim()).filter(Boolean),
    );
    if (ROTO) {
        assert.ok(botones.includes("Cerrar"), "el roto no reproduce: no había «Cerrar»");
        return;
    }
    assert.ok(!botones.includes("Cerrar"), `sigue habiendo un «Cerrar»: ${botones.join(", ")}`);
    const hayEquis = await page.evaluate(() => !!document.querySelector('[role="dialog"] [data-cerrar] button, [role="dialog"] button .sr-only'));
    assert.ok(hayEquis, "no quedó la equis");
    // El último bloque del diálogo es la transcripción: no queda un renglón vacío.
    const ultimo = await page.evaluate(() => {
        const dlg = document.querySelector('[role="dialog"]');
        const hijos = [...dlg.children].filter((c) => c.getBoundingClientRect().height > 0);
        return hijos.at(-1)?.getAttribute("data-bloque") ?? hijos.at(-1)?.outerHTML.slice(0, 80);
    });
    assert.equal(ultimo, "transcripcion", `lo último del diálogo no es la transcripción: ${ultimo}`);
});

test("3 · con turnos marcados, cada uno lleva su icono, y el resumen ninguno", { skip: saltar }, async () => {
    const page = await abrir("d1");
    const d = await page.evaluate(() => {
        const dlg = document.querySelector('[role="dialog"]');
        const tr = dlg.querySelector('[data-bloque="transcripcion"]');
        const re = dlg.querySelector('[data-bloque="resumen"]');
        return {
            turnos: [...(tr?.querySelectorAll("[data-turno]") ?? [])].map((t) => ({
                quien: t.getAttribute("data-turno"),
                icono: t.querySelector("svg")?.getAttribute("aria-label") ?? null,
                texto: t.textContent,
            })),
            turnosEnElResumen: re?.querySelectorAll("[data-turno]").length ?? 0,
            // El resumen solo tiene el icono de su título.
            iconosEnElResumen: re?.querySelectorAll("svg").length ?? 0,
        };
    });
    assert.equal(d.turnosEnElResumen, 0, "el resumen tiene turnos");
    assert.equal(d.iconosEnElResumen, 1, "el resumen lleva iconos de hablante");
    if (ROTO) {
        assert.equal(d.turnos.length, 0, "el roto no reproduce: ya había iconos por hablante");
        return;
    }
    assert.deepEqual(
        d.turnos.map((t) => [t.quien, t.icono]),
        [
            ["asistente", "Asistente"],
            ["persona", "Persona"],
            ["asistente", "Asistente"],
        ],
    );
    assert.ok(!/Operador:|Cliente:/.test(d.turnos.map((t) => t.texto).join(" ")), "la marca se repite al lado del icono");
});

test("3 · un texto corrido NO se reparte: sin iconos, tal cual", { skip: saltar }, async () => {
    const page = await abrir("d2");
    const d = await page.evaluate(() => {
        const tr = document.querySelector('[role="dialog"] [data-bloque="transcripcion"]');
        return { turnos: tr.querySelectorAll("[data-turno]").length, texto: tr.innerText };
    });
    assert.equal(d.turnos, 0, "se inventó quién habló");
    assert.match(d.texto, /Hola soy Verzy de Verzay le llamo/);
});

test("Z · se cierra el navegador", { skip: saltar }, async () => {
    if (!ctx) return;
    await ctx.navegador.close();
    ctx.server.close();
});
