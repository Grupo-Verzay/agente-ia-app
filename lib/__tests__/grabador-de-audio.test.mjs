/**
 * Grabar una nota de voz ahí mismo, en las seis pantallas que antes solo
 * dejaban subir un archivo. Se levanta con `scripts/banco-grabador-de-audio.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
let chromium = null;
try {
    ({ chromium } = require("playwright"));
} catch {}

const ROTO = process.env.MODO === "roto";
const ANTES = process.env.ANTES_REF || "97ae916";
const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..", "..");
const C = join(AQUI, ".compilado");

// Las seis pantallas, y el nombre del camino por el que entra un archivo
// elegido del dispositivo. La grabación tiene que entrar por ESE.
const PANTALLAS = [
    { ruta: "app/(root)/macros/_components/MacrosManager.tsx", camino: "uploadFileForAction(i, f)" },
    { ruta: "app/(root)/workflow/[workflowId]/_components/NodeCard.tsx", camino: "handleFile(f)" },
    { ruta: "app/(root)/flow/[workflowId]/_components/NodeCard.tsx", camino: "handleFile(f)" },
    { ruta: "app/(root)/reminders/_components/ReminderForm.tsx", camino: "usarArchivo" },
    { ruta: "app/(root)/bookings/_components/reminders/BookingsRemindersManager.tsx", camino: "usarArchivo" },
    { ruta: "app/(root)/crm/rules/components/CrmFollowUpMediaLibrary.tsx", camino: "usarArchivo" },
];

const leer = (ruta) =>
    ROTO
        ? execFileSync("git", ["show", `${ANTES}:${ruta}`], { cwd: RAIZ, encoding: "utf8", maxBuffer: 1 << 26 })
        : fs.readFileSync(join(RAIZ, ruta), "utf8");

// ── 1. La regla ────────────────────────────────────────────────────────────
const regla = ROTO ? null : await import(join(C, "grabador-de-audio.regla.mjs"));
const archivo = await import(join(C, "grabador-de-audio.archivo.mjs"));
const validar = await import(join(C, "grabador-de-audio.validar.mjs"));

test("la regla: qué mandos hay en cada momento", { skip: ROTO && "en el «antes» no existía" }, () => {
    const { elEstadoDelGrabador: e, losMandosDelGrabador: m } = regla;
    assert.deepEqual(m(e({ grabando: false, pausado: false, hayGrabacion: false })), ["grabar"]);
    assert.deepEqual(m(e({ grabando: true, pausado: false, hayGrabacion: false })), ["pausar", "detener", "descartar"]);
    assert.deepEqual(m(e({ grabando: true, pausado: true, hayGrabacion: false })), ["reanudar", "detener", "descartar"]);
    assert.deepEqual(m(e({ grabando: false, pausado: false, hayGrabacion: true })), ["usar", "grabar-otra", "descartar"]);
    // Con el micrófono abierto, detener está SIEMPRE.
    for (const pausado of [true, false]) {
        assert.ok(m(e({ grabando: true, pausado, hayGrabacion: false })).includes("detener"));
    }
});

test("la regla: el tiempo y el tipo sin códecs", { skip: ROTO && "en el «antes» no existía" }, () => {
    const { comoSeLeeElTiempo: t, elMimeSinCodecs: s } = regla;
    assert.equal(t(0), "0:00");
    assert.equal(t(7), "0:07");
    assert.equal(t(65), "1:05");
    assert.equal(t(-3), "0:00");
    assert.equal(t(Number.NaN), "0:00");
    assert.equal(s("audio/webm;codecs=opus"), "audio/webm");
    assert.equal(s("AUDIO/OGG; codecs=opus"), "audio/ogg");
    assert.equal(s(""), "audio/webm");
});

test("el archivo de una grabación lo aceptan los flujos", () => {
    const grabado = {
        base64Pure: Buffer.from("OggS-de-prueba").toString("base64"),
        dataUrlWithPrefix: "",
        mimetype: "audio/webm;codecs=opus",
        durationSecs: 3,
    };
    const f = archivo.comoArchivoDeAudio(grabado);
    if (ROTO) {
        // Así salía antes: el tipo con los códecs, y la validación de los
        // flujos lo rechaza como «tipo de archivo no válido».
        const conCodecs = new File([new Uint8Array(4)], "nota.webm", { type: "audio/webm;codecs=opus" });
        assert.equal(validar.validateFileType(conCodecs, "audio"), false, "antes: rechazada");
        return;
    }
    assert.equal(f.type, "audio/webm");
    assert.match(f.name, /\.webm$/);
    assert.ok(f.size > 0);
    assert.equal(validar.validateFileType(f, "audio"), true);
});

// ── 2. El barrido ──────────────────────────────────────────────────────────
for (const { ruta, camino } of PANTALLAS) {
    test(`barrido: ${ruta.split("/").slice(-2).join("/")} graba`, () => {
        const src = leer(ruta);
        const usos = (src.match(/<GrabadorDeAudio\b/g) ?? []).length;
        if (ROTO) {
            assert.equal(usos, 0, "antes: solo se podía subir");
            return;
        }
        assert.equal(usos, 1, "un grabador por pantalla");
        assert.match(src, /from ["']@\/components\/shared\/GrabadorDeAudio["']/);
        // Subir no se quitó.
        assert.match(src, /type="file"/);
        // Y la grabación entra por el MISMO camino que el archivo elegido.
        const trozo = src.slice(src.indexOf("<GrabadorDeAudio"), src.indexOf("<GrabadorDeAudio") + 200);
        assert.ok(trozo.includes(camino), `onGrabado va por ${camino}`);
    });
}

test("barrido: el hook sabe pausar, y es UNO", () => {
    const hook = leer("hooks/useAudioRecording.ts");
    if (ROTO) {
        assert.ok(!hook.includes("pauseRecording"), "antes: no se podía pausar");
        return;
    }
    assert.ok(hook.includes("pauseRecording") && hook.includes("resumeRecording"));
    // Nadie graba por su cuenta: el único `new MediaRecorder` de las pantallas
    // de audio es el del hook.
    for (const { ruta } of PANTALLAS) assert.ok(!leer(ruta).includes("new MediaRecorder"), ruta);
    assert.ok(!leer("components/shared/GrabadorDeAudio.tsx").includes("new MediaRecorder"));
});

// ── 3. En Chromium ─────────────────────────────────────────────────────────
function levantar() {
    const bundle = fs.readFileSync(join(C, "grabador-de-audio.arnes.js"));
    const css = fs.readFileSync(join(C, "grabador-de-audio.css"), "utf8");
    const server = http.createServer((req, res) => {
        const u = (req.url ?? "/").split("?")[0];
        if (u === "/") {
            res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
            res.end(
                `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style>` +
                    `<script>window.process={env:{}}</script></head>` +
                    `<body><div id="app"></div><script type="module" src="/h.js"></script></body></html>`,
            );
        } else if (u === "/h.js") {
            res.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8" });
            res.end(bundle);
        } else {
            res.writeHead(404);
            res.end();
        }
    });
    return new Promise((r) => server.listen(0, "127.0.0.1", () => r(server)));
}

const sinNavegador = ROTO ? "en el «antes» no había grabador que pintar; el fallo lo afirma el barrido" : !chromium && "sin playwright";

test("en Chromium: grabar, pausar, reanudar, detener, escuchar y usar", { skip: sinNavegador, timeout: 60000 }, async () => {
    const server = await levantar();
    const url = `http://127.0.0.1:${server.address().port}/`;
    const browser = await chromium.launch({
        executablePath: process.env.CHROME_BIN || undefined,
        args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"],
    });
    try {
        const ctx = await browser.newContext({ permissions: ["microphone"] });
        const page = await ctx.newPage();
        const errores = [];
        page.on("pageerror", (e) => errores.push(String(e)));
        await page.goto(url);
        await page.waitForFunction(() => window.listo === true);
        const estado = () => page.getAttribute("[data-grabador]", "data-grabador");
        const mandos = () => page.$$eval("[data-mando]", (b) => b.map((x) => x.getAttribute("data-mando")));

        assert.equal(await estado(), "inactivo");
        assert.deepEqual(await mandos(), ["grabar"]);

        await page.click('[data-mando="grabar"]');
        await page.waitForSelector('[data-grabador="grabando"]');
        assert.deepEqual(await mandos(), ["pausar", "detener", "descartar"]);
        await page.waitForFunction(() => document.querySelector("[data-tiempo]")?.textContent?.includes("0:02"), null, { timeout: 5000 });

        await page.click('[data-mando="pausar"]');
        await page.waitForSelector('[data-grabador="pausado"]');
        assert.deepEqual(await mandos(), ["reanudar", "detener", "descartar"]);
        const enPausa = await page.textContent("[data-tiempo]");
        await page.waitForTimeout(2200);
        assert.equal(await page.textContent("[data-tiempo]"), enPausa, "en pausa el tiempo no corre");
        assert.match(enPausa, /En pausa/);

        await page.click('[data-mando="reanudar"]');
        await page.waitForSelector('[data-grabador="grabando"]');
        await page.waitForTimeout(1100);
        await page.click('[data-mando="detener"]');
        await page.waitForSelector('[data-grabador="lista"]');
        assert.deepEqual(await mandos(), ["usar", "grabar-otra", "descartar"]);
        assert.ok(await page.$("audio[data-escuchar]"), "se puede escuchar antes de usarla");

        await page.click('[data-mando="usar"]');
        await page.waitForFunction(() => window.grabados.length === 1);
        const [g] = await page.evaluate(() => window.grabados);
        assert.equal(g.tipo, "audio/webm");
        assert.ok(g.bytes > 500, `la grabación trae audio (${g.bytes} bytes)`);
        assert.ok(g.pasaWorkflow && g.pasaFlow, "los dos editores de flujos la aceptan");
        assert.equal(await estado(), "inactivo", "usada, el grabador vuelve a empezar");

        // Descartar a media grabación no entrega nada.
        await page.click('[data-mando="grabar"]');
        await page.waitForSelector('[data-grabador="grabando"]');
        await page.click('[data-mando="descartar"]');
        await page.waitForSelector('[data-grabador="inactivo"]');
        await page.waitForTimeout(300);
        assert.equal(await page.evaluate(() => window.grabados.length), 1);
        assert.deepEqual(errores, []);
    } finally {
        await browser.close();
        server.close();
    }
});

test("en Chromium: sin permiso de micrófono lo DICE", { skip: sinNavegador, timeout: 30000 }, async () => {
    const server = await levantar();
    const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined });
    try {
        const page = await browser.newPage();
        await page.addInitScript(() => {
            navigator.mediaDevices.getUserMedia = () =>
                Promise.reject(Object.assign(new Error("no"), { name: "NotAllowedError" }));
        });
        await page.goto(`http://127.0.0.1:${server.address().port}/`);
        await page.waitForFunction(() => window.listo === true);
        await page.click('[data-mando="grabar"]');
        const aviso = await page.waitForSelector("[data-error-del-grabador]");
        assert.match(await aviso.textContent(), /permiso/);
        assert.equal(await page.getAttribute("[data-grabador]", "data-grabador"), "inactivo");
    } finally {
        await browser.close();
        server.close();
    }
});
