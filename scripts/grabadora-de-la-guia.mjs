// La grabadora del vídeo de la guía: los fotogramas en su hora REAL.
//
// `recordVideo` de Playwright estiraba el vídeo. Por cada fotograma que manda
// el navegador escribe `max(1, round(25 · Δt))` fotogramas: cuando el
// navegador pinta más deprisa que 25 por segundo —el cursor moviéndose, algo
// escribiéndose, un menú abriéndose— cada uno cuenta 40 ms aunque hayan pasado
// 16. Medido en el vídeo de Leads: la imagen iba 0,3 s detrás de la voz al
// empezar y 5 s al final, y el vídeo duraba 4-5 s más que su narración. Con
// las acciones puestas EN la palabra que las nombra (`alDecir`), eso las
// despegaba de la voz.
//
// Aquí se usa el MISMO screencast (CDP `Page.startScreencast`, JPEG al 90 %,
// que es lo que pide Playwright), pero cada fotograma se coloca por su hora
// (`metadata.timestamp`) con redondeo ACUMULADO: el fotograma k del vídeo
// enseña lo último que se pintó antes de `inicio + k · 40 ms`. Los JPEG van
// tal cual a un MKV (`-c:v copy`), sin codificar dos veces: `mezclar` los
// codifica una sola vez al recortar.
import { spawn } from "node:child_process";

export const FPS = 25;

/**
 * Cuántos fotogramas tiene que llevar escritos el vídeo cuando llega uno
 * pintado a las `ts` (ms de reloj), si el vídeo empieza en `inicio`: los que
 * caen ANTES de `ts` enseñan lo anterior. Nunca negativo.
 */
export function fotogramasHasta(ts, inicio, fps = FPS) {
    return Math.max(0, Math.ceil(((ts - inicio) * fps) / 1000));
}

/**
 * La hora de un fotograma. `metadata.timestamp` es la de pintarlo, en segundos
 * desde 1970, del mismo reloj que `Date.now()`. Si viniera vacía o absurda
 * (más de 2 s de la de llegada), manda la de llegada: mejor unos ms de
 * retraso que un fotograma fuera de sitio.
 */
export function laHoraDelFotograma(metadata, llegada) {
    const ts = Number(metadata?.timestamp) * 1000;
    return Number.isFinite(ts) && Math.abs(llegada - ts) <= 2000 ? ts : llegada;
}

/**
 * Empieza a grabar la página. `empezarEn(ms)` fija la hora del fotograma 0
 * (lo pintado antes solo sirve de primer cuadro); `parar()` rellena hasta
 * ahora y cierra el fichero.
 */
export async function grabar(p, destino, { ancho = 1280, alto = 800 } = {}) {
    const cdp = await p.context().newCDPSession(p);
    const ff = spawn("ffmpeg", ["-loglevel", "error", "-y", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "pipe:0", "-an", "-c:v", "copy", destino], {
        stdio: ["pipe", "inherit", "inherit"],
    });
    const cerrado = new Promise((resolve, reject) => {
        ff.on("error", reject);
        ff.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`[guia] la grabadora salió con ${code}`))));
    });
    let inicio = null;
    let escritos = 0;
    let ultimo = null;
    let recibidos = 0;
    const escribirHasta = (ts) => {
        if (inicio === null || !ultimo) return;
        const hasta = fotogramasHasta(ts, inicio);
        for (; escritos < hasta; escritos++) ff.stdin.write(ultimo);
    };
    cdp.on("Page.screencastFrame", ({ data, metadata, sessionId }) => {
        cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
        const ts = laHoraDelFotograma(metadata, Date.now());
        escribirHasta(ts);
        ultimo = Buffer.from(data, "base64");
        recibidos++;
    });
    await cdp.send("Page.startScreencast", { format: "jpeg", quality: 90, maxWidth: ancho, maxHeight: alto, everyNthFrame: 1 });
    return {
        empezarEn(ms) {
            inicio = ms;
        },
        async parar() {
            escribirHasta(Date.now());
            if (ultimo) {
                ff.stdin.write(ultimo);
                escritos++;
            }
            await cdp.send("Page.stopScreencast").catch(() => {});
            await cdp.detach().catch(() => {});
            ff.stdin.end();
            await cerrado;
            if (!recibidos) throw new Error("[guia] la grabadora no recibió ningún fotograma");
            return { fotogramas: escritos, recibidos };
        },
    };
}
