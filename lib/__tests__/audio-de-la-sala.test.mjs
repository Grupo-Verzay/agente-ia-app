/**
 * El AUDIO de la sala de reunión, en Chromium y con el hook real.
 *
 * # Por qué en un navegador y no en memoria
 *
 * Lo que falla —o no— aquí es WebRTC de verdad: cómo se enganchan las pistas a
 * los transceptores de la malla y si el audio LLEGA en las dos direcciones. Eso
 * no lo dice ninguna función pura; hace falta dos peers hablándose y mirar los
 * bytes de audio que cruzan (`getStats` → `inbound-rtp`).
 *
 * # Qué cubre, que es el encargo entero
 *
 *   1. Entrar SOLO con audio (cámara apagada desde el principio).
 *   2. Apagar y prender la cámara.
 *   3. Compartir pantalla.
 *   4. Activar y desactivar la supresión de ruido.
 *
 * En los cuatro se comprueba que **A oye a B y B oye a A** — no una sola
 * dirección, que es justo el síntoma del que viene este arreglo.
 *
 * # Y la red de seguridad, en dos modos
 *
 * El fallo que se veía como «no me oyen hasta que prendo la cámara» es una
 * conexión que llega a `connected` con la pista de audio del emisor suelta.
 * `sanarAlConectar` la vuelve a poner al conectar. El banco lo ejerce ROTO
 * —una conexión igual pero sin esa red— y comprueba que ahí el audio NO llega,
 * y ARREGLADO —a través del hook— que sí. Sin el modo roto, lo verde no diría
 * si se arregló la causa o si el caso no se ejercía.
 *
 * Se monta con `scripts/banco-audio-sala.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

let chromium = null;
try {
    ({ chromium } = require("playwright"));
} catch {
    // Sin navegador no se finge: se dice y se salta.
}

const AQUI = dirname(fileURLToPath(import.meta.url));
const HARNESS = join(AQUI, ".compilado", "harness-audio-sala.js");

function levantar() {
    const bundle = readFileSync(HARNESS);
    const server = http.createServer((req, res) => {
        const u = (req.url ?? "/").split("?")[0];
        if (u === "/") {
            res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
            res.end(
                `<!doctype html><html><body><div id="A"></div><div id="B"></div>` +
                    `<script type="module" src="/harness-audio-sala.js"></script></body></html>`,
            );
            return;
        }
        if (u === "/harness-audio-sala.js") {
            res.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8" });
            res.end(bundle);
            return;
        }
        res.writeHead(404);
        res.end("no");
    });
    return new Promise((r) => server.listen(0, () => r(server)));
}

async function abrir() {
    const server = await levantar();
    const base = `http://127.0.0.1:${server.address().port}`;
    const navegador = await chromium.launch({
        executablePath: process.env.CHROME_BIN || undefined,
        args: [
            "--use-fake-device-for-media-stream",
            "--use-fake-ui-for-media-stream",
            "--autoplay-policy=no-user-gesture-required",
        ],
    });
    const page = await (await navegador.newContext()).newPage();
    await page.goto(base + "/", { waitUntil: "load" });
    await page.waitForFunction("window.A_listo === true && window.B_listo === true", {
        timeout: 20000,
    });
    return {
        page,
        async cerrar() {
            await navegador.close();
            server.close();
        },
    };
}

test("el audio llega en LAS DOS direcciones en cada caso del encargo", async (t) => {
    if (!chromium) return t.skip("sin playwright en este equipo");
    const { page, cerrar } = await abrir();
    try {
        const r = await page.evaluate(async () => {
            const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
            const A = window.A, B = window.B;
            await A.arrancar(true);
            await B.arrancar(true);
            await sleep(300);

            // AUDIO SOLO: la cámara apagada ANTES de negociar, que es «entrar
            // solo con audio».
            await A.alternarCamara();
            await B.alternarCamara();
            await sleep(300);

            const pcA = new RTCPeerConnection(), pcB = new RTCPeerConnection();
            pcA.onicecandidate = (e) => e.candidate && pcB.addIceCandidate(e.candidate).catch(() => {});
            pcB.onicecandidate = (e) => e.candidate && pcA.addIceCandidate(e.candidate).catch(() => {});
            const inA = new MediaStream(), inB = new MediaStream();
            pcA.ontrack = (ev) => { if (!inA.getTracks().includes(ev.track)) inA.addTrack(ev.track); };
            pcB.ontrack = (ev) => { if (!inB.getTracks().includes(ev.track)) inB.addTrack(ev.track); };

            const gather = (pc) => new Promise((res) => {
                if (pc.iceGatheringState === "complete") return res();
                pc.addEventListener("icegatheringstatechange", () => pc.iceGatheringState === "complete" && res());
            });

            // A ofrece, B contesta — exactamente como ofrecerA/contestarA.
            A.prepararLaConexion(pcA);
            await pcA.setLocalDescription(await pcA.createOffer());
            await gather(pcA);
            await pcB.setRemoteDescription(pcA.localDescription);
            B.engancharALaConexion(pcB);
            await pcB.setLocalDescription(await pcB.createAnswer());
            await gather(pcB);
            await pcA.setRemoteDescription(pcB.localDescription);

            const conectar = (pc) => new Promise((res) => {
                if (pc.connectionState === "connected") return res(pc.connectionState);
                pc.addEventListener("connectionstatechange", () =>
                    (pc.connectionState === "connected" || pc.connectionState === "failed") && res(pc.connectionState));
            });
            await Promise.all([conectar(pcA), conectar(pcB)]);
            await sleep(300);

            async function inbound(pc) {
                const s = await pc.getStats();
                let bytes = 0;
                s.forEach((r) => { if (r.type === "inbound-rtp" && r.kind === "audio") bytes += r.bytesReceived || 0; });
                return bytes;
            }
            const medir = async () => {
                const a1 = await inbound(pcA), b1 = await inbound(pcB);
                await sleep(1200);
                return { A_oye_a_B: (await inbound(pcA)) - a1, B_oye_a_A: (await inbound(pcB)) - b1 };
            };

            const audioSolo = await medir();
            await A.alternarCamara(); await sleep(400);       // A prende la cámara
            const camara = await medir();
            await B.alternarPantalla(); await sleep(400);      // B comparte pantalla
            const pantalla = await medir();
            await A.cambiarSupresion(false); await B.cambiarSupresion(false); await sleep(600);
            const suprOff = await medir();
            await A.cambiarSupresion(true); await B.cambiarSupresion(true); await sleep(600);
            const suprOn = await medir();

            return { audioSolo, camara, pantalla, suprOff, suprOn, falloA: window.A_fallo ?? null, falloB: window.B_fallo ?? null };
        });

        assert.equal(r.falloA, null, "A no tuvo ningún fallo de medios");
        assert.equal(r.falloB, null, "B no tuvo ningún fallo de medios");
        // Un mínimo generoso: 500 bytes en ~1,2 s es audio de verdad; cero es
        // silencio. Lo que importa es que NINGUNA dirección se quede en cero.
        for (const [etq, m] of Object.entries(r)) {
            if (etq.startsWith("fallo")) continue;
            assert.ok(m.A_oye_a_B > 500, `${etq}: A tiene que oír a B (fue ${m.A_oye_a_B})`);
            assert.ok(m.B_oye_a_A > 500, `${etq}: B tiene que oír a A (fue ${m.B_oye_a_A})`);
        }
    } finally {
        await cerrar();
    }
});

test("apagar la cámara con la conexión YA hecha no corta el audio de nadie", async (t) => {
    if (!chromium) return t.skip("sin playwright en este equipo");
    const { page, cerrar } = await abrir();
    try {
        const r = await page.evaluate(async () => {
            const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
            const A = window.A, B = window.B;
            // Los DOS entran con la cámara ENCENDIDA, negocian, y SOLO DESPUÉS
            // uno la apaga. Es el caso exacto del reporte, y el que el otro test
            // no cubría: allí la cámara se apagaba ANTES de negociar.
            await A.arrancar(true);
            await B.arrancar(true);
            await sleep(300);

            const pcA = new RTCPeerConnection(), pcB = new RTCPeerConnection();
            pcA.onicecandidate = (e) => e.candidate && pcB.addIceCandidate(e.candidate).catch(() => {});
            pcB.onicecandidate = (e) => e.candidate && pcA.addIceCandidate(e.candidate).catch(() => {});
            const inA = new MediaStream(), inB = new MediaStream();
            pcA.ontrack = (ev) => { if (!inA.getTracks().includes(ev.track)) inA.addTrack(ev.track); };
            pcB.ontrack = (ev) => { if (!inB.getTracks().includes(ev.track)) inB.addTrack(ev.track); };

            const gather = (pc) => new Promise((res) => {
                if (pc.iceGatheringState === "complete") return res();
                pc.addEventListener("icegatheringstatechange", () => pc.iceGatheringState === "complete" && res());
            });

            A.prepararLaConexion(pcA);
            await pcA.setLocalDescription(await pcA.createOffer());
            await gather(pcA);
            await pcB.setRemoteDescription(pcA.localDescription);
            B.engancharALaConexion(pcB);
            await pcB.setLocalDescription(await pcB.createAnswer());
            await gather(pcB);
            await pcA.setRemoteDescription(pcB.localDescription);

            const conectar = (pc) => new Promise((res) => {
                if (pc.connectionState === "connected") return res(pc.connectionState);
                pc.addEventListener("connectionstatechange", () =>
                    (pc.connectionState === "connected" || pc.connectionState === "failed") && res(pc.connectionState));
            });
            await Promise.all([conectar(pcA), conectar(pcB)]);
            await sleep(300);

            async function inbound(pc) {
                const s = await pc.getStats();
                let bytes = 0;
                s.forEach((r) => { if (r.type === "inbound-rtp" && r.kind === "audio") bytes += r.bytesReceived || 0; });
                return bytes;
            }
            const medir = async () => {
                const a1 = await inbound(pcA), b1 = await inbound(pcB);
                await sleep(1200);
                return { A_oye_a_B: (await inbound(pcA)) - a1, B_oye_a_A: (await inbound(pcB)) - b1 };
            };
            // Qué tiene el emisor de audio de A: la pista puesta, y si de verdad
            // está saliendo audio por la red (outbound-rtp). Es lo que separa
            // «se soltó la pista al apagar la cámara» de «es cosa del receptor».
            const emisorDeAudioDeA = () => ({
                tienePista: Boolean(
                    pcA.getTransceivers().find(
                        (t) => (t.sender.track?.kind ?? t.receiver?.track?.kind) === "audio",
                    )?.sender.track,
                ),
            });

            const conCamara = await medir();               // los dos con cámara
            await A.alternarCamara(); await sleep(500);     // A APAGA su cámara
            const trasApagarA = await medir();
            const emisorTrasApagar = emisorDeAudioDeA();
            await B.alternarCamara(); await sleep(500);     // B también la apaga
            const losDosSinCamara = await medir();

            return {
                conCamara, trasApagarA, losDosSinCamara, emisorTrasApagar,
                falloA: window.A_fallo ?? null, falloB: window.B_fallo ?? null,
            };
        });

        assert.equal(r.falloA, null, "A no tuvo ningún fallo de medios");
        assert.equal(r.falloB, null, "B no tuvo ningún fallo de medios");
        // El emisor de audio de A NO puede quedarse sin pista al apagar la cámara.
        assert.ok(
            r.emisorTrasApagar.tienePista,
            "tras apagar la cámara, el emisor de audio de A sigue con su pista",
        );
        for (const [etq, m] of Object.entries(r)) {
            if (etq.startsWith("fallo") || etq === "emisorTrasApagar") continue;
            assert.ok(m.A_oye_a_B > 500, `${etq}: A tiene que oír a B (fue ${m.A_oye_a_B})`);
            assert.ok(m.B_oye_a_A > 500, `${etq}: B tiene que oír a A (fue ${m.B_oye_a_A})`);
        }
    } finally {
        await cerrar();
    }
});

test("la red de seguridad sana una pista de audio suelta al conectar (roto vs arreglado)", async (t) => {
    if (!chromium) return t.skip("sin playwright en este equipo");
    const { page, cerrar } = await abrir();
    try {
        const r = await page.evaluate(async () => {
            const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
            const gather = (pc) => new Promise((res) => {
                if (pc.iceGatheringState === "complete") return res();
                pc.addEventListener("icegatheringstatechange", () => pc.iceGatheringState === "complete" && res());
            });
            const conectar = (pc) => new Promise((res) => {
                if (pc.connectionState === "connected") return res();
                pc.addEventListener("connectionstatechange", () =>
                    (pc.connectionState === "connected" || pc.connectionState === "failed") && res());
            });
            async function inbound(pc) {
                const s = await pc.getStats();
                let bytes = 0;
                s.forEach((r) => { if (r.type === "inbound-rtp" && r.kind === "audio") bytes += r.bytesReceived || 0; });
                return bytes;
            }
            const sueltaElAudio = (pc) => {
                // Simula la carrera que deja el emisor de audio sin pista justo
                // antes de conectar.
                for (const t of pc.getTransceivers()) {
                    const clase = t.sender.track?.kind ?? t.receiver?.track?.kind;
                    if (clase === "audio") t.sender.replaceTrack(null);
                }
            };

            // ── ARREGLADO: a través del hook, que trae `sanarAlConectar` ──
            const A = window.A, B = window.B;
            await A.arrancar(true); await B.arrancar(true); await sleep(200);
            const pcA = new RTCPeerConnection(), pcB = new RTCPeerConnection();
            pcA.onicecandidate = (e) => e.candidate && pcB.addIceCandidate(e.candidate).catch(() => {});
            pcB.onicecandidate = (e) => e.candidate && pcA.addIceCandidate(e.candidate).catch(() => {});
            const inB = new MediaStream();
            pcB.ontrack = (ev) => { if (!inB.getTracks().includes(ev.track)) inB.addTrack(ev.track); };
            A.prepararLaConexion(pcA);
            sueltaElAudio(pcA);                       // deja el audio de A suelto
            await pcA.setLocalDescription(await pcA.createOffer());
            await gather(pcA);
            await pcB.setRemoteDescription(pcA.localDescription);
            B.engancharALaConexion(pcB);
            await pcB.setLocalDescription(await pcB.createAnswer());
            await gather(pcB);
            await pcA.setRemoteDescription(pcB.localDescription);
            await conectar(pcB);
            await sleep(400);
            const b1 = await inbound(pcB); await sleep(1200);
            const arreglado_B_oye_a_A = (await inbound(pcB)) - b1;
            const audioSenderConPista = Boolean(
                pcA.getTransceivers().find((t) => (t.sender.track?.kind ?? t.receiver?.track?.kind) === "audio")?.sender.track,
            );

            // ── ROTO: peer a pelo, MISMA suelta, pero SIN red de seguridad ──
            const micX = await navigator.mediaDevices.getUserMedia({ audio: true });
            const pcX = new RTCPeerConnection(), pcY = new RTCPeerConnection();
            pcX.onicecandidate = (e) => e.candidate && pcY.addIceCandidate(e.candidate).catch(() => {});
            pcY.onicecandidate = (e) => e.candidate && pcX.addIceCandidate(e.candidate).catch(() => {});
            const inY = new MediaStream();
            pcY.ontrack = (ev) => { if (!inY.getTracks().includes(ev.track)) inY.addTrack(ev.track); };
            const tX = pcX.addTransceiver("audio", { direction: "sendrecv" });
            tX.sender.replaceTrack(micX.getAudioTracks()[0]);
            sueltaElAudio(pcX);                       // MISMA suelta, sin sanar
            await pcX.setLocalDescription(await pcX.createOffer());
            await gather(pcX);
            await pcY.setRemoteDescription(pcX.localDescription);
            for (const t of pcY.getTransceivers()) if (t.direction !== "stopped") t.direction = "sendrecv";
            await pcY.setLocalDescription(await pcY.createAnswer());
            await gather(pcY);
            await pcX.setRemoteDescription(pcY.localDescription);
            await conectar(pcY);
            await sleep(400);
            const y1 = await inbound(pcY); await sleep(1200);
            const roto_Y_oye_a_X = (await inbound(pcY)) - y1;

            return { arreglado_B_oye_a_A, audioSenderConPista, roto_Y_oye_a_X };
        });

        // ROTO: sin la red de seguridad, la pista suelta se queda suelta → mudo.
        assert.ok(
            r.roto_Y_oye_a_X < 200,
            `sin sanar al conectar, el audio NO llega (fue ${r.roto_Y_oye_a_X})`,
        );
        // ARREGLADO: la red de seguridad reengancha al conectar → se oye.
        assert.ok(r.audioSenderConPista, "el emisor de audio vuelve a tener pista tras conectar");
        assert.ok(
            r.arreglado_B_oye_a_A > 500,
            `sanando al conectar, B oye a A sin que nadie toque la cámara (fue ${r.arreglado_B_oye_a_A})`,
        );
    } finally {
        await cerrar();
    }
});
