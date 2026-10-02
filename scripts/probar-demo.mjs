/**
 * La página del vídeo de ventas (`/demo`), SERVIDA (`next start`) y SIN
 * sesión, en Chromium a 390 y 1440.
 *
 * Lo que un barrido del código no puede decir: que sin sesión no manda al
 * login, que la cabecera `X-Robots-Tag` llega de verdad —a la página y al
 * vídeo—, que el vídeo se sirve por rangos (sin eso Safari no lo reproduce y
 * no se puede adelantar), que carga con su duración, que las capacidades son
 * las del vídeo, que los dos llamados miden lo mismo y llevan a donde dicen, y
 * que en un teléfono no se sale nada a lo ancho y con la rueda se llega al
 * final (el `<body>` de la App va con `overflow-hidden`).
 */
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const BASE = process.env.BASE ?? "http://localhost:3942";
const { CAPACIDADES_DEL_VIDEO, LLAMADO_DEL_VIDEO, VIDEO_DE_VENTAS, PORTADA_DEL_VIDEO_DE_VENTAS, TOPE_DEL_VIDEO_DE_VENTAS_MS } = await import(
    new URL("../lib/__tests__/.compilado/video-de-ventas/video-de-ventas.mjs", import.meta.url).href
);
const fallos = [];
const exigir = (bien, que) => {
    if (!bien) fallos.push(que);
    else console.log("  ok", que);
};

const navegador = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined });
try {
    // 1. Pública y no indexable, por la cabecera.
    const r = await fetch(`${BASE}/demo`, { redirect: "manual" });
    exigir(r.status === 200, `GET /demo sin sesión contesta 200 (contestó ${r.status} ${r.headers.get("location") ?? ""})`);
    exigir(/noindex/.test(r.headers.get("x-robots-tag") ?? ""), "la página lleva X-Robots-Tag: noindex");
    const rango = await fetch(`${BASE}${VIDEO_DE_VENTAS}`, { headers: { Range: "bytes=0-1023" }, redirect: "manual" });
    exigir(rango.status === 206, `el vídeo se sirve por rangos (${rango.status})`);
    exigir(/noindex/.test(rango.headers.get("x-robots-tag") ?? ""), "el vídeo también lleva noindex");
    exigir(/video\/mp4/.test(rango.headers.get("content-type") ?? ""), `el vídeo se sirve como video/mp4 (${rango.headers.get("content-type")})`);
    const portada = await fetch(`${BASE}${PORTADA_DEL_VIDEO_DE_VENTAS}`, { redirect: "manual" });
    exigir(portada.status === 200, `la portada se sirve (${portada.status})`);

    for (const vista of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
        const ctx = await navegador.newContext({ viewport: vista });
        const p = await ctx.newPage();
        const errores = [];
        p.on("pageerror", (e) => errores.push(String(e)));
        await p.goto(`${BASE}/demo`, { waitUntil: "networkidle" });
        const tag = `${vista.width}px`;
        exigir(/noindex/.test((await p.getAttribute('meta[name="robots"]', "content")) ?? ""), `${tag}: meta robots noindex`);
        // El Chromium de Playwright NO trae H.264 (lo trae cualquier Chrome,
        // Safari, Edge o Firefox de verdad), así que aquí el MP4 no se puede
        // reproducir. Se pregunta al navegador en vez de suponerlo: si sabe, se
        // mide la duración cargándolo; si no, se comprueba que la página lo
        // pide bien y la duración la mide ffprobe en el banco del vídeo.
        const sabeH264 = await p.evaluate(() => document.createElement("video").canPlayType('video/mp4; codecs="avc1.640028, mp4a.40.2"') !== "");
        const fuente = await p.$eval("[data-video-de-ventas] video", (v) => ({ src: v.querySelector("source")?.getAttribute("src"), tipo: v.querySelector("source")?.getAttribute("type"), preload: v.getAttribute("preload") }));
        exigir(fuente.src === VIDEO_DE_VENTAS && fuente.tipo === "video/mp4" && fuente.preload === "metadata", `${tag}: el vídeo pide ${VIDEO_DE_VENTAS} como video/mp4 y solo sus metadatos (${JSON.stringify(fuente)})`);
        if (sabeH264) {
            const duracion = await p.$eval("[data-video-de-ventas] video", (v) => new Promise((ok) => {
                if (v.readyState >= 1) return ok(v.duration);
                v.addEventListener("loadedmetadata", () => ok(v.duration), { once: true });
                v.addEventListener("error", () => ok(-1), { once: true });
                setTimeout(() => ok(-2), 8000);
            }));
            exigir(duracion > 30 && duracion * 1000 < TOPE_DEL_VIDEO_DE_VENTAS_MS, `${tag}: el vídeo carga y dura menos de tres minutos (${duracion})`);
        } else {
            console.log(`  -- ${tag}: este Chromium no trae H.264; la duración y el códec los mide ffprobe (sección 6 del banco)`);
        }
        const poster = await p.$eval("[data-video-de-ventas] video", (v) => v.getAttribute("poster"));
        exigir(poster === PORTADA_DEL_VIDEO_DE_VENTAS, `${tag}: el vídeo lleva su portada`);
        exigir(await p.$eval("[data-lo-que-es]", (e) => e.getBoundingClientRect().height > 0 && /plataforma real/.test(e.textContent)), `${tag}: dice qué es real y qué es recreación`);

        const capacidades = await p.$$eval("[data-capacidad]", (els) => els.map((e) => { const r = e.getBoundingClientRect(); return { escena: e.getAttribute("data-capacidad"), alto: r.height, w: Math.round(r.width), top: Math.round(r.top), x: Math.round(r.left), fin: Math.round(r.right) }; }));
        exigir(
            JSON.stringify(capacidades.map((c) => c.escena)) === JSON.stringify(CAPACIDADES_DEL_VIDEO.map((c) => c.escena)),
            `${tag}: las ${CAPACIDADES_DEL_VIDEO.length} capacidades, en el orden del vídeo`,
        );
        // Simetría: filas completas, salvo la última —que va centrada—; todas las
        // tarjetas del mismo ancho, y las de una fila del mismo alto.
        const porFila = new Map();
        for (const c of capacidades) porFila.set(c.top, [...(porFila.get(c.top) ?? []), c]);
        const filas = [...porFila.values()];
        const columnas = vista.width >= 640 ? 4 : 2;
        exigir(filas.slice(0, -1).every((f) => f.length === columnas) && filas.at(-1).length <= columnas, `${tag}: ${filas.length} filas de ${columnas}, completas salvo la última`);
        exigir(capacidades.every((c) => Math.abs(c.w - capacidades[0].w) <= 1), `${tag}: todas las tarjetas miden lo mismo de ancho`);
        {
            const caja = await p.$eval("[data-capacidades]", (e) => { const r = e.getBoundingClientRect(); return { x: Math.round(r.left), fin: Math.round(r.right) }; });
            const ult = filas.at(-1);
            const izq = ult[0].x - caja.x;
            const der = caja.fin - ult.at(-1).fin;
            exigir(Math.abs(izq - der) <= 2, `${tag}: la última fila va centrada (${izq} / ${der})`);
        }
        exigir(filas.every((f) => f.every((c) => Math.abs(c.alto - f[0].alto) < 1)), `${tag}: las tarjetas de una fila miden lo mismo`);

        const llamados = await p.$$eval('[data-llamados] [data-llamado]', (els) => els.map((a) => {
            const r = a.getBoundingClientRect();
            return { que: a.getAttribute("data-llamado"), href: a.getAttribute("href"), rel: a.getAttribute("rel") ?? "", w: Math.round(r.width), h: Math.round(r.height) };
        }));
        const agendar = llamados.find((l) => l.que === "agendar");
        const whatsapp = llamados.find((l) => l.que === "whatsapp");
        exigir(agendar?.href === LLAMADO_DEL_VIDEO.agendar, `${tag}: «Agendar una reunión» lleva a ${LLAMADO_DEL_VIDEO.agendar}`);
        exigir(whatsapp?.href?.startsWith(`https://wa.me/${LLAMADO_DEL_VIDEO.whatsapp}?text=`) && /noopener/.test(whatsapp.rel), `${tag}: «Escribir por WhatsApp» lleva al WhatsApp de Verzay, con noopener`);
        exigir(agendar && whatsapp && agendar.w === whatsapp.w && agendar.h === whatsapp.h, `${tag}: los dos llamados miden lo mismo (${JSON.stringify(llamados)})`);
        exigir(await p.$eval('[data-llamado="cabecera"]', (a) => a.getAttribute("href")) === LLAMADO_DEL_VIDEO.agendar, `${tag}: la cabecera lleva a agendar`);

        exigir((await p.evaluate(() => document.documentElement.scrollWidth)) <= vista.width, `${tag}: no se sale a lo ancho`);
        await p.mouse.move(vista.width / 2, vista.height / 2);
        for (let i = 0; i < 40; i += 1) await p.mouse.wheel(0, 900);
        await p.waitForTimeout(500);
        const alFinal = await p.evaluate(() => {
            const m = document.querySelector("[data-demo]");
            const hr = document.querySelector("[data-fin-de-la-demo]");
            return { llega: m.scrollTop + m.clientHeight >= m.scrollHeight - 4, visible: hr.getBoundingClientRect().bottom <= window.innerHeight };
        });
        exigir(alFinal.llega && alFinal.visible, `${tag}: con la rueda se llega al final (${JSON.stringify(alFinal)})`);
        exigir(errores.length === 0, `${tag}: sin errores en la página ${errores.join(" | ")}`);
        await ctx.close();
    }
} finally {
    await navegador.close();
}
if (fallos.length) {
    console.error(`\n${fallos.length} fallos:\n - ${fallos.join("\n - ")}`);
    process.exit(1);
}
console.log("\nla página del vídeo de ventas se sirve bien");
