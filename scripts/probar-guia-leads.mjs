/**
 * La guía pública de Leads, SERVIDA (`next start`) y SIN sesión, en Chromium.
 *
 * Lo que un barrido del código no puede decir: que sin sesión no redirige al
 * login, que la cabecera `X-Robots-Tag` llega de verdad —a la página y a las
 * capturas—, que cada tarjeta del índice lleva a su sección, que TODAS las
 * imágenes cargan (no un hueco con su texto alternativo), que el vídeo se
 * puede reproducir, y que en un teléfono y en un monitor no se sale nada a lo
 * ancho y con la rueda se llega al final (el `<body>` de la App va con
 * `overflow-hidden`: sin su contenedor, una pública nace sin poder bajar).
 */
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const BASE = process.env.BASE ?? "http://localhost:3941";
const fallos = [];
const exigir = (bien, que) => {
    if (!bien) fallos.push(que);
    else console.log("  ok", que);
};

const navegador = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined });
try {
    // 1. Pública y no indexable, por la cabecera.
    const r = await fetch(`${BASE}/guia/leads`, { redirect: "manual" });
    exigir(r.status === 200, `GET /guia/leads sin sesión contesta 200 (contestó ${r.status})`);
    exigir(/noindex/.test(r.headers.get("x-robots-tag") ?? ""), "la página lleva X-Robots-Tag: noindex");
    const img = await fetch(`${BASE}/guia/leads/vista-general.webp`, { redirect: "manual" });
    exigir(img.status === 200 && /noindex/.test(img.headers.get("x-robots-tag") ?? ""), "las capturas también llevan noindex");
    const mala = await fetch(`${BASE}/guia/leads/no-existe`, { redirect: "manual" });
    exigir(mala.status === 404, `una sección que no existe da 404 (dio ${mala.status})`);

    for (const vista of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
        const ctx = await navegador.newContext({ viewport: vista });
        const p = await ctx.newPage();
        await p.goto(`${BASE}/guia/leads`, { waitUntil: "networkidle" });
        const tag = `${vista.width}px`;
        exigir(/noindex/.test(await p.getAttribute('meta[name="robots"]', "content")), `${tag}: meta robots noindex`);
        const tarjetas = await p.$$eval("[data-tarjeta-de-seccion]", (els) => els.map((e) => e.getAttribute("href")));
        exigir(tarjetas.length === 7, `${tag}: el índice tiene 7 secciones (${tarjetas.length})`);
        const duracion = await p.$eval("[data-video-de-la-guia]", (v) => new Promise((ok) => {
            if (v.readyState >= 1) return ok(v.duration);
            v.addEventListener("loadedmetadata", () => ok(v.duration), { once: true });
            v.addEventListener("error", () => ok(-1), { once: true });
            setTimeout(() => ok(-2), 8000);
        }));
        exigir(duracion !== -1 && duracion !== -2, `${tag}: el vídeo carga (duración ${duracion})`);
        exigir((await p.evaluate(() => document.documentElement.scrollWidth)) <= vista.width, `${tag}: el índice no se sale a lo ancho`);
        // La página termina en la línea divisoria: sin nota ni espacio debajo.
        const fin = await p.evaluate(() => {
            const m = document.querySelector("[data-guia]");
            const hr = document.querySelector("[data-fin-de-la-guia]");
            if (!hr) return null;
            m.scrollTop = m.scrollHeight;
            const debajo = m.getBoundingClientRect().bottom - hr.getBoundingClientRect().bottom;
            return { ultimo: hr.parentElement?.lastElementChild === hr, debajo, nota: /capturas se toman/i.test(m.innerText) };
        });
        exigir(fin && fin.ultimo && !fin.nota && fin.debajo <= 2, `${tag}: el índice acaba en la línea divisoria y nada debajo (${JSON.stringify(fin)})`);
        await p.evaluate(() => { document.querySelector("[data-guia]").scrollTop = 0; });
        // El orden del índice: vídeo, introducción, secciones (con su cierre).
        const orden = await p.evaluate(() => {
            const y = (s) => document.querySelector(s)?.getBoundingClientRect().top ?? NaN;
            return { video: y("[data-video-de-la-guia]"), intro: y("[data-introduccion-de-la-guia]"), secciones: y("[data-cuadricula-de-secciones]") };
        });
        exigir(orden.video < orden.intro && orden.intro < orden.secciones, `${tag}: vídeo → introducción → secciones (${JSON.stringify(orden)})`);
        const contacto = await p.$eval('[data-tarjeta-de-cierre="contacto"]', (a) => ({ href: a.getAttribute("href"), visible: a.getBoundingClientRect().width > 0 }));
        exigir(contacto.visible && /^https:\/\/wa\.me\/\d+\?text=/.test(contacto.href), `${tag}: «Contáctanos» lleva a WhatsApp (${contacto.href})`);
        const video = await p.$('[data-tarjeta-de-cierre="video"]');
        const videoVisible = video ? await video.evaluate((a) => getComputedStyle(a).display !== "none") : false;
        exigir(videoVisible === (vista.width >= 1024), `${tag}: «Ver el vídeo» solo donde deja dos huecos (7 secciones a 3 columnas)`);
        if (videoVisible) {
            await video.click();
            await p.waitForTimeout(600);
            const arriba = await p.$eval("[data-demostracion]", (e) => e.getBoundingClientRect().top);
            exigir(arriba >= 0 && arriba < 140, `${tag}: «Ver el vídeo» sube hasta la demostración (queda a ${Math.round(arriba)} px)`);
            await p.evaluate(() => { document.querySelector("[data-guia]").scrollTop = 0; });
        }

        for (const href of tarjetas) {
            await p.goto(`${BASE}${href}`, { waitUntil: "networkidle" });
            await p.evaluate(async () => {
                const main = document.querySelector("[data-guia]");
                for (let y = 0; y < main.scrollHeight; y += 600) { main.scrollTop = y; await new Promise((r) => setTimeout(r, 60)); }
            });
            await p.waitForTimeout(400);
            const rotas = await p.$$eval("img", (ims) => ims.filter((i) => !i.complete || i.naturalWidth === 0).map((i) => i.getAttribute("src")));
            const pasos = await p.$$eval("[data-paso]", (e) => e.length);
            exigir(pasos >= 3 && rotas.length === 0, `${tag} ${href}: ${pasos} pasos y todas las imágenes cargan ${rotas.join(",")}`);
            exigir((await p.evaluate(() => document.documentElement.scrollWidth)) <= vista.width, `${tag} ${href}: no se sale a lo ancho`);
            // Con la rueda se llega al final.
            await p.evaluate(() => { document.querySelector("[data-guia]").scrollTop = 0; });
            await p.mouse.move(vista.width / 2, vista.height / 2);
            for (let i = 0; i < 60; i += 1) await p.mouse.wheel(0, 900);
            await p.waitForTimeout(500);
            const alFinal = await p.evaluate(() => {
                const m = document.querySelector("[data-guia]");
                return m.scrollTop + m.clientHeight >= m.scrollHeight - 4;
            });
            exigir(alFinal, `${tag} ${href}: con la rueda se llega al final`);
        }
        await ctx.close();
    }
} finally {
    await navegador.close();
}
if (fallos.length) {
    console.error(`\n${fallos.length} fallos:\n - ${fallos.join("\n - ")}`);
    process.exit(1);
}
console.log("\nla guía pública se sirve bien");
