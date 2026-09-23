/**
 * El rótulo «Grabación» y el largo del reproductor en «Detalle de la llamada».
 *
 *   1. El rótulo lleva un icono de ONDA de sonido (no un micrófono: la nota ya
 *      trae el suyo), con la MISMA caja, color y separación que los iconos de
 *      «Resumen IA» y «Transcripción» —medidos en la misma página, no escritos
 *      aquí—, y el rótulo sigue encima de la nota.
 *   2. La nota ocupa TODO el ancho de su recuadro, y sigue siendo la nota de
 *      Chats: su marco, su micrófono, `preload="metadata"` y la duración sin
 *      pulsar play. Y en Chats sigue midiendo 350 px (`ANCHO_DE_LA_NOTA`).
 *
 * `MODO=roto` pinta el diálogo de ANTES_REF y afirma los dos fallos.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
let chromium = null;
try {
    ({ chromium } = require("playwright"));
} catch {
    chromium = null;
}

const ROTO = process.env.MODO === "roto";
const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..", "..");
const HARNESS = join(AQUI, ".compilado", "harness-grabacion-del-detalle.js");
const DIR_CSS = join(RAIZ, ".next", "static", "css");
const CSS = fs.existsSync(DIR_CSS)
    ? fs.readdirSync(DIR_CSS).filter((f) => f.endsWith(".css")).map((f) => fs.readFileSync(join(DIR_CSS, f), "utf8")).join("\n")
    : "";

test("en Chats la nota sigue a 350 px: el largo nuevo es solo del detalle", () => {
    const nota = fs.readFileSync(join(RAIZ, "components/shared/NotaDeVoz.tsx"), "utf8");
    assert.match(nota, /ANCHO_DE_LA_NOTA = 'w-\[350px\] max-w-full'/);
    const chats = fs.readFileSync(join(RAIZ, "app/(root)/chats/_components/MediaRenderer.tsx"), "utf8");
    assert.ok(!/ancho=/.test(chats), "Chats cambió el largo de su nota");
});

function unWav(segundos) {
    const datos = 8000 * segundos;
    const b = Buffer.alloc(44 + datos, 128);
    b.write("RIFF", 0); b.writeUInt32LE(36 + datos, 4); b.write("WAVE", 8); b.write("fmt ", 12);
    b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(8000, 24);
    b.writeUInt32LE(8000, 28); b.writeUInt16LE(1, 32); b.writeUInt16LE(8, 34); b.write("data", 36); b.writeUInt32LE(datos, 40);
    return b;
}

const saltar = !chromium || !fs.existsSync(HARNESS) ? "sin Chromium o sin harness" : false;

test("el rótulo lleva la onda como los otros dos, y la nota llena su recuadro", { skip: saltar }, async (t) => {
    const bundle = fs.readFileSync(HARNESS);
    const wav = unWav(187);
    const server = http.createServer((req, res) => {
        const u = (req.url ?? "/").split("?")[0];
        if (u === "/") {
            res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
            return res.end(`<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style><style>*,*::before,*::after{animation:none!important;transition:none!important}</style></head><body><div id="pantalla"></div><script type="module" src="/harness.js"></script></body></html>`);
        }
        if (u === "/harness.js") {
            res.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8" });
            return res.end(bundle);
        }
        if (u === "/grabacion.wav") {
            const r = /bytes=(\d+)-(\d*)/.exec(req.headers.range ?? "");
            if (r) {
                const ini = Number(r[1]);
                const fin = r[2] ? Math.min(Number(r[2]), wav.length - 1) : wav.length - 1;
                res.writeHead(206, { "Content-Type": "audio/wav", "Content-Range": `bytes ${ini}-${fin}/${wav.length}`, "Content-Length": fin - ini + 1, "Accept-Ranges": "bytes" });
                return res.end(wav.subarray(ini, fin + 1));
            }
            res.writeHead(200, { "Content-Type": "audio/wav", "Content-Length": wav.length, "Accept-Ranges": "bytes" });
            return res.end(wav);
        }
        res.writeHead(404); res.end("no");
    });
    await new Promise((r) => server.listen(0, r));
    const navegador = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined });
    t.after(async () => { await navegador.close(); server.close(); });

    for (const [ancho, alto] of [[1440, 900], [1024, 768], [390, 844]]) {
        const page = await (await navegador.newContext({ viewport: { width: ancho, height: alto } })).newPage();
        const reventones = [];
        page.on("pageerror", (e) => reventones.push(String(e)));
        await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: "load" });
        await page.waitForFunction("window.listo === true", { timeout: 20000 });
        await page.evaluate(() => window.abrir("d1"));
        await page.waitForSelector('[role="dialog"] [data-nota-de-voz]', { timeout: 10000 });
        await page.waitForFunction(() => {
            const a = document.querySelector('[role="dialog"] audio');
            return a && ((Number.isFinite(a.duration) && a.duration > 0) || a.error);
        }, null, { timeout: 10000 }).catch(() => {});
        assert.equal(reventones.join(" | "), "", `el diálogo reventó a ${ancho}`);

        const d = await page.evaluate(() => {
            const dlg = document.querySelector('[role="dialog"]');
            const nota = dlg.querySelector("[data-nota-de-voz]");
            const marco = nota.parentElement;
            const recuadro = marco.parentElement;
            const rotulos = [...dlg.querySelectorAll("div")].filter((el) =>
                ["Grabación", "Resumen IA", "Transcripción"].includes(el.textContent.trim()) && el.children.length <= 1,
            );
            const caja = (el) => {
                const svg = el.querySelector("svg");
                if (!svg) return { icono: null, texto: el.textContent.trim() };
                const cs = getComputedStyle(svg);
                const r = svg.getBoundingClientRect();
                return {
                    texto: el.textContent.trim(),
                    icono: [...svg.classList].find((c) => c.startsWith("lucide-") && c !== "lucide") ?? "?",
                    w: r.width, h: r.height,
                    color: cs.color,
                    gap: getComputedStyle(el).columnGap,
                    alto: el.getBoundingClientRect().height,
                };
            };
            const audio = nota.querySelector("audio");
            const rotuloGrab = rotulos.find((el) => el.textContent.trim() === "Grabación");
            return {
                rotulos: Object.fromEntries(rotulos.map((el) => [el.textContent.trim(), caja(el)])),
                rotuloEncima: rotuloGrab ? rotuloGrab.getBoundingClientRect().bottom <= marco.getBoundingClientRect().top + 0.5 : false,
                mics: nota.querySelectorAll("svg.lucide-mic").length,
                anchoMarco: marco.getBoundingClientRect().width,
                anchoRecuadro: recuadro.getBoundingClientRect().width,
                preload: audio.getAttribute("preload"),
                duracion: audio.duration,
                enPausa: audio.paused,
            };
        });

        const grab = d.rotulos["Grabación"];
        if (ROTO) {
            assert.equal(grab.icono, null, "el roto no reproduce: «Grabación» ya tenía icono");
            assert.equal(d.anchoMarco, Math.min(350, d.anchoRecuadro), "el roto no reproduce: la nota ya llenaba el recuadro");
            if (ancho > 500) assert.ok(d.anchoMarco < d.anchoRecuadro - 50, `a ${ancho} la nota de antes no quedaba corta`);
            continue;
        }
        // 1 · la onda, y la misma caja que los otros dos
        assert.equal(grab.icono, "lucide-audio-waveform", `a ${ancho} el rótulo no lleva la onda (${grab.icono})`);
        assert.equal(d.mics, 1, "la nota tiene que seguir con UN micrófono");
        for (const otro of ["Resumen IA", "Transcripción"]) {
            const o = d.rotulos[otro];
            assert.ok(o?.icono, `falta el icono de ${otro}`);
            assert.ok(Math.abs(grab.w - o.w) < 0.5, `ancho del icono distinto de ${otro}`);
            assert.ok(Math.abs(grab.h - o.h) < 0.5, `alto del icono distinto de ${otro}`);
            assert.equal(grab.gap, o.gap, `separación distinta de ${otro}`);
            assert.ok(Math.abs(grab.alto - o.alto) < 0.5, `alto del rótulo distinto de ${otro}`);
        }
        assert.equal(grab.color, d.rotulos["Transcripción"].color, "el color de la onda no es el de los rótulos");
        assert.ok(d.rotuloEncima, "el rótulo se movió de encima de la nota");
        // 2 · todo el recuadro, con la nota de siempre
        assert.equal(d.anchoMarco, d.anchoRecuadro, `a ${ancho} la nota no llena su recuadro (${d.anchoMarco} de ${d.anchoRecuadro})`);
        if (ancho > 500) assert.ok(d.anchoMarco > 350, "la nota sigue corta");
        assert.equal(d.preload, "metadata");
        assert.ok(Math.abs(d.duracion - 187) < 1, `la duración no se sabe al abrir (${d.duracion})`);
        assert.equal(d.enPausa, true);
        console.log(`  ${ancho}: nota ${d.anchoMarco}/${d.anchoRecuadro} px, icono ${grab.w}×${grab.h}, gap ${grab.gap}`);
    }
});
