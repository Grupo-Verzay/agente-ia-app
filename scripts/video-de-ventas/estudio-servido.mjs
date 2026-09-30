/**
 * Cómo se sirve el ESTUDIO en el origen de la App: Playwright intercepta
 * `/__estudio/…` y contesta con la página, la letra y los archivos de la
 * historia. Así el `<iframe>` del portátil abre la App del mismo origen
 * (`X-Frame-Options: SAMEORIGIN`) y los archivos que la App enseña en sus
 * burbujas —la nota de voz, el PDF, el video— salen de la misma dirección que
 * el backend de la historia guardó en `chat_messages.mediaUrl`.
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const TIPOS = {
    ".html": "text/html; charset=utf-8",
    ".woff2": "font/woff2",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".mp4": "video/mp4",
    // Sin su tipo, el video de la historia —que es WebM, porque el Chromium
    // que graba no trae H.264— salía como `application/octet-stream` y el
    // `<video>` de WhatsApp Web se quedaba en blanco, sin error.
    ".webm": "video/webm",
    ".pdf": "application/pdf",
    ".ogg": "audio/ogg",
};

/**
 * `archivos` es un mapa de nombre → ruta en disco (los medios y los logos);
 * `pagina` es el HTML del estudio. Los videos se sirven con RANGOS: sin
 * `206 Partial Content` Chromium no deja buscar dentro de un `<video>` y el
 * reproductor de la App dice que no puede reproducirlo.
 */
export async function servirElEstudio(contexto, { pagina, archivos }) {
    await contexto.route("**/__estudio/**", async (ruta) => {
        const url = new URL(ruta.request().url());
        const nombre = decodeURIComponent(url.pathname.replace(/^\/__estudio\/(medios\/|fuentes\/)?/, ""));
        if (url.pathname === "/__estudio/estudio.html") {
            return ruta.fulfill({ status: 200, headers: { "content-type": TIPOS[".html"], "cache-control": "no-store" }, body: pagina() });
        }
        const disco = archivos[nombre];
        if (!disco || !existsSync(disco)) return ruta.fulfill({ status: 404, body: `no hay ${nombre}` });
        const cuerpo = readFileSync(disco);
        const tipo = TIPOS[path.extname(disco).toLowerCase()] ?? "application/octet-stream";
        const rango = ruta.request().headers()["range"];
        if (rango) {
            const [, a, b] = /bytes=(\d*)-(\d*)/.exec(rango) ?? [];
            const inicio = a ? Number(a) : 0;
            const fin = b ? Math.min(Number(b), cuerpo.length - 1) : cuerpo.length - 1;
            return ruta.fulfill({
                status: 206,
                headers: {
                    "content-type": tipo,
                    "accept-ranges": "bytes",
                    "content-range": `bytes ${inicio}-${fin}/${cuerpo.length}`,
                    "content-length": String(fin - inicio + 1),
                },
                body: cuerpo.subarray(inicio, fin + 1),
            });
        }
        return ruta.fulfill({ status: 200, headers: { "content-type": tipo, "accept-ranges": "bytes" }, body: cuerpo });
    });
}
