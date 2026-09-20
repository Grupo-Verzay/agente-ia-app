/**
 * El fondo cambia el track del SENDER — en Chromium, con el hook real.
 *
 * Es el caso que pidió el encargo: «afirma que el track del sender cambia al
 * activar el desenfoque». Y de paso prueba de punta a punta lo que el informe
 * verificó a mano: contra los ficheros vendorizados REALES, el modelo carga y
 * segmenta, `useMediosDeLlamada.cambiarElFondo` produce una pista de canvas, y
 * `replaceTrack` la mete en el sender de video de una `RTCPeerConnection` de
 * verdad. El recuadro propio (`local`) cambia al mismo track.
 *
 * El montaje: `scripts/banco-fondo.sh` vendoriza el modelo y empaqueta el hook
 * real + un arnés con esbuild en `.compilado/harness-fondo.js`. Este test lo
 * sirve junto a `/segmentacion`, abre Chromium con cámara falsa y mide.
 *
 *   scripts/banco-fondo.sh
 */
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, extname } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

let chromium = null;
try {
    ({ chromium } = require("playwright"));
} catch {
    // Sin navegador no se finge: se dice y se salta.
}

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..", "..");
const SEG = join(RAIZ, "public", "segmentacion");
const HARNESS = join(AQUI, ".compilado", "harness-fondo.js");

const MIME = { ".js": "application/javascript; charset=utf-8", ".wasm": "application/wasm" };

function levantar() {
    const bundle = readFileSync(HARNESS);
    const server = http.createServer((req, res) => {
        const u = (req.url ?? "/").split("?")[0];
        if (u === "/") {
            res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
            res.end(
                `<!doctype html><html><body><div id="app"></div>` +
                    `<script type="module" src="/harness-fondo.js"></script></body></html>`,
            );
            return;
        }
        if (u === "/harness-fondo.js") {
            res.writeHead(200, { "Content-Type": MIME[".js"] });
            res.end(bundle);
            return;
        }
        if (u.startsWith("/segmentacion/")) {
            try {
                const b = readFileSync(join(SEG, u.replace("/segmentacion/", "")));
                res.writeHead(200, {
                    "Content-Type": MIME[extname(u)] ?? "application/octet-stream",
                    // El mismo `nosniff` que pone `next.config.js` en producción.
                    "X-Content-Type-Options": "nosniff",
                });
                res.end(b);
            } catch {
                res.writeHead(404);
                res.end("no");
            }
            return;
        }
        res.writeHead(404);
        res.end("no");
    });
    return new Promise((r) => server.listen(0, () => r(server)));
}

test("al activar el desenfoque, el track del sender de video cambia", async (t) => {
    if (!chromium) return t.skip("sin playwright en este equipo");

    const server = await levantar();
    const base = `http://127.0.0.1:${server.address().port}`;
    const navegador = await chromium.launch({
        executablePath: process.env.CHROME_BIN || undefined,
        args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
    });
    try {
        const page = await (await navegador.newContext()).newPage();
        await page.goto(base + "/", { waitUntil: "load" });
        await page.waitForFunction("window.__listo === true", { timeout: 20000 });

        const r = await page.evaluate(async () => {
            const api = window.__api;
            const trackDeVideo = (pc) =>
                pc
                    .getTransceivers()
                    .find((tr) => tr.receiver && tr.receiver.track && tr.receiver.track.kind === "video")
                    ?.sender.track ?? null;

            await api.arrancar(true);
            await new Promise((r) => setTimeout(r, 500));

            // Malla real: dos transceptores en sendrecv.
            const pc = new RTCPeerConnection();
            api.prepararLaConexion(pc);
            await new Promise((r) => setTimeout(r, 150));

            const camaraTrack = trackDeVideo(pc);
            const idCamara = camaraTrack && camaraTrack.id;
            const labelCamara = camaraTrack && camaraTrack.label;

            // ── El caso del encargo: activar el desenfoque ──
            await api.cambiarElFondo("desenfoque");
            await new Promise((r) => setTimeout(r, 1200));
            const trackDesenfoque = trackDeVideo(pc);
            const idDesenfoque = trackDesenfoque && trackDesenfoque.id;
            const estadoDesenfoque = api.estado();

            // ── Un fondo de serie también cambia la pista ──
            await api.cambiarElFondo("fondo", { tipo: "preset", id: "azul" });
            await new Promise((r) => setTimeout(r, 800));
            const idFondo = (trackDeVideo(pc) || {}).id ?? null;

            // ── Quitar el fondo devuelve la cámara ──
            await api.cambiarElFondo("ninguno");
            await new Promise((r) => setTimeout(r, 400));
            const idNinguno = (trackDeVideo(pc) || {}).id ?? null;

            return {
                idCamara,
                labelCamara,
                idDesenfoque,
                estadoDesenfoque,
                idFondo,
                idNinguno,
                fallo: window.__fallo ?? null,
            };
        });

        // De partida, el sender manda la cámara real.
        assert.equal(r.labelCamara, "fake_device_0", "de partida se manda la cámara");
        assert.ok(r.idCamara, "la cámara tiene un track");

        // EL ENCARGO: al desenfocar, el track del sender CAMBIA.
        assert.ok(r.idDesenfoque, "el sender sigue teniendo un track de video");
        assert.notEqual(
            r.idDesenfoque,
            r.idCamara,
            "el track del sender tiene que cambiar al activar el desenfoque",
        );
        // Y es la pista del canvas: el recuadro propio cambia al MISMO track.
        assert.equal(
            r.estadoDesenfoque.localVideoTrackId,
            r.idDesenfoque,
            "el recuadro propio muestra la misma pista procesada",
        );
        assert.equal(r.estadoDesenfoque.fondo, "desenfoque");
        assert.equal(r.fallo, null, "no hubo ningún fallo por el camino");

        // Un fondo de serie también cambia la pista (otra distinta de la cámara).
        assert.ok(r.idFondo && r.idFondo !== r.idCamara, "un fondo de serie cambia la pista");

        // Y quitarlo devuelve exactamente la cámara: control negativo, para que
        // el test falle si el cambio fuera espurio o no se deshiciera.
        assert.equal(r.idNinguno, r.idCamara, "«sin fondo» devuelve la pista de la cámara");
    } finally {
        await navegador.close();
        server.close();
    }
});
