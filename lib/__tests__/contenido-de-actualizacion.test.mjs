/**
 * El CONTENIDO de una actualización: las direcciones del texto son enlaces, y
 * un video se REPRODUCE dentro de la tarjeta, nunca se descarga.
 *
 * # Qué se rompía
 *
 * 1. **El texto se pintaba tal cual**: una dirección escrita en la
 *    actualización era texto plano y no se podía pulsar.
 * 2. **El video**: la clase del archivo daba por bueno un mime genérico
 *    (`application/octet-stream`), así que un `.mp4` subido así salía como
 *    DOCUMENTO — un enlace que el navegador descargaba. Y lo que se subió en
 *    producción («Leads.mp4») es un WebM con nombre `.mp4`, servido como
 *    `video/mp4`: el bucket guardaba el tipo de la extensión, no el de verdad.
 *
 * # Dos mitades
 *
 * - **La regla**, pura: la clase con mime genérico, y el tipo con el que se
 *   guarda en el bucket según los primeros bytes.
 * - **Chromium**, sobre el CSS del build: la tarjeta de la lista y la ventana
 *   que salta —LAS DOS, con la misma pieza— con el video real servido como lo
 *   sirve el bucket. Se pulsa el video y se comprueba que SUENA (avanza) sin
 *   ninguna descarga; y los enlaces se comprueban por su `href`, su `target` y
 *   que se vean distintos del texto.
 *
 * `MODO=roto` monta el componente de `ANTES_REF` y AFIRMA el fallo.
 * Se levanta con `scripts/banco-contenido-de-actualizacion.sh`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
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

const ROTO = process.env.MODO === "roto";
const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..", "..");
const COMPILADO = join(AQUI, ".compilado", "contenido-de-actualizacion");
const HARNESS = join(AQUI, ".compilado", "harness-contenido-de-actualizacion.js");
const VIDEO = fs.readFileSync(join(RAIZ, "public", "guia", "leads", "demostracion.webm"));

const adj = await import(join(COMPILADO, "adjuntos.js"));

// ─────────────────────────────────────────────────────────────────────────────
// 1. La regla, pura
// ─────────────────────────────────────────────────────────────────────────────

test("un mime GENÉRICO no decide: manda la extensión", () => {
    const clase = adj.laClaseDelAdjunto({ mime: "application/octet-stream", nombre: "Leads.mp4" });
    if (ROTO) {
        assert.equal(clase, "archivo", "ANTES: un .mp4 con octet-stream salía como documento");
        return;
    }
    assert.equal(clase, "video");
    assert.equal(adj.laClaseDelAdjunto({ mime: "binary/octet-stream", nombre: "a.webm" }), "video");
    assert.equal(adj.laClaseDelAdjunto({ mime: "", nombre: "a.mov" }), "video");
    // Lo que no es genérico sigue mandando.
    assert.equal(adj.laClaseDelAdjunto({ mime: "application/pdf", nombre: "raro.mp4" }), "archivo");
    assert.equal(adj.laClaseDelAdjunto({ mime: "video/mp4", nombre: "sin-extension" }), "video");
    assert.equal(adj.laClaseDelAdjunto({ mime: "application/octet-stream", nombre: "datos.bin" }), "archivo");
});

test("el tipo con el que se GUARDA en el bucket es el de lo que HAY", { skip: ROTO }, () => {
    const webm = new Uint8Array(VIDEO.subarray(0, 16));
    // El caso de producción: un WebM con nombre .mp4, que el navegador dijo video/mp4.
    assert.equal(adj.elTipoConElQueSeGuarda("Leads.mp4", "video/mp4", webm), "video/webm");
    // Sin tipo del navegador, la cabecera también manda si la extensión es de video.
    assert.equal(adj.elTipoConElQueSeGuarda("Leads.mp4", "", webm), "video/webm");
    // Un MP4 de verdad.
    const mp4 = new Uint8Array([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 0, 0]);
    assert.equal(adj.elTipoConElQueSeGuarda("x.mp4", "application/octet-stream", mp4), "video/mp4");
    const qt = new Uint8Array([0, 0, 0, 0x14, 0x66, 0x74, 0x79, 0x70, 0x71, 0x74, 0x20, 0x20, 0, 0, 0, 0]);
    assert.equal(adj.elTipoConElQueSeGuarda("x.mov", "video/quicktime", qt), "video/quicktime");
    // Sin cabecera reconocible: el tipo del navegador, y si es genérico la extensión.
    assert.equal(adj.elTipoConElQueSeGuarda("x.mp4", "", null), "video/mp4");
    assert.equal(adj.elTipoConElQueSeGuarda("x.pdf", "application/octet-stream", null), "application/pdf");
    assert.equal(adj.elTipoConElQueSeGuarda("x.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", null),
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    // La cabecera no convierte en video algo que el navegador dijo que era otra cosa.
    assert.equal(adj.elTipoConElQueSeGuarda("x.pdf", "application/pdf", webm), "application/pdf");
    assert.equal(adj.elTipoConElQueSeGuarda("sin", "", null), "application/octet-stream");
});

test("barrido: la subida guarda el tipo de verdad y la tarjeta enlaza el texto", { skip: ROTO }, () => {
    const subida = fs.readFileSync(join(RAIZ, "app/api/upload/route.ts"), "utf8");
    assert.match(subida, /elTipoConElQueSeGuarda\(file\.name, file\.type, cabecera\)/, "la subida pasa por la regla");
    const cont = fs.readFileSync(join(RAIZ, "components/actualizaciones/ContenidoDeLaActualizacion.tsx"), "utf8");
    assert.match(cont, /<TextoConEnlaces/, "el texto pasa por TextoConEnlaces");
    assert.doesNotMatch(cont, />\s*\{actualizacion\.texto\}\s*</, "y nunca se pinta crudo");
    assert.match(cont, /controlsList="nodownload"/, "el reproductor no ofrece descargar");
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. La tarjeta y la ventana, en Chromium
// ─────────────────────────────────────────────────────────────────────────────

const DIR_CSS = join(RAIZ, ".next", "static", "css");
const CSS = fs.existsSync(DIR_CSS)
    ? fs.readdirSync(DIR_CSS).filter((f) => f.endsWith(".css")).map((f) => fs.readFileSync(join(DIR_CSS, f), "utf8")).join("\n")
    : null;
const hayNavegador = Boolean(chromium && CSS && fs.existsSync(HARNESS));

async function conLaPantalla(hacer) {
    const html = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>${CSS}</style></head>
<body class="app-module-content"><div id="app"></div>
<script>window.process=window.process||{env:{}};</script>
<script type="module">${fs.readFileSync(HARNESS, "utf8")}</script></body></html>`;
    const servidor = http
        .createServer((q, res) => {
            const ruta = q.url.split("?")[0];
            // El video, servido como lo sirve el bucket: con Range, `nosniff` y
            // el tipo que se le guardó.
            const tipos = {
                "/verzay-media/c/actualizaciones/Leads.mp4": "video/mp4", // el de producción
                "/verzay-media/c/actualizaciones/generico.mp4": "application/octet-stream",
            };
            if (tipos[ruta]) {
                const total = VIDEO.length;
                const m = /bytes=(\d*)-(\d*)/.exec(q.headers.range ?? "");
                const ini = m && m[1] ? Number(m[1]) : 0;
                const fin = m && m[2] ? Number(m[2]) : total - 1;
                res.writeHead(m ? 206 : 200, {
                    "Content-Type": tipos[ruta],
                    "Accept-Ranges": "bytes",
                    "Content-Length": fin - ini + 1,
                    "X-Content-Type-Options": "nosniff",
                    ...(m ? { "Content-Range": `bytes ${ini}-${fin}/${total}` } : {}),
                });
                res.end(VIDEO.subarray(ini, fin + 1));
                return;
            }
            res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
            res.end(html);
        })
        .listen(0, "127.0.0.1");
    await new Promise((r) => servidor.once("listening", r));
    const navegador = await chromium.launch({
        executablePath: process.env.CHROME_BIN || undefined,
        args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"],
    });
    try {
        await hacer(navegador, servidor.address().port);
    } finally {
        await navegador.close();
        servidor.close();
    }
}

const actualizacion = (puerto, archivo) => ({
    id: "act-" + Math.random().toString(36).slice(2),
    texto: `Ya salió la guía de Leads: https://docs.ejemplo.com/guia-leads.\nY la agenda está en http://127.0.0.1:${puerto}/schedule para probarla.`,
    archivo,
    publicadaEn: new Date().toISOString(),
    publicadaPor: "Carlos",
});
const VIDEO_PROD = (p) => ({ url: `http://127.0.0.1:${p}/verzay-media/c/actualizaciones/Leads.mp4`, nombre: "Leads.mp4", mime: "video/mp4", tamano: VIDEO.length });
const VIDEO_GENERICO = (p) => ({ url: `http://127.0.0.1:${p}/verzay-media/c/actualizaciones/generico.mp4`, nombre: "generico.mp4", mime: "application/octet-stream", tamano: VIDEO.length });

async function abrir(navegador, puerto, ancho, alto, que, datos) {
    const ctx = await navegador.newContext({ viewport: { width: ancho, height: alto }, acceptDownloads: true });
    // Aquí no hay red hacia fuera: la dirección de fuera se contesta aquí mismo.
    await ctx.route("https://docs.ejemplo.com/**", (r) => r.fulfill({ status: 200, contentType: "text/html", body: "<p>guía</p>" }));
    const pagina = await ctx.newPage();
    const errores = [];
    const descargas = [];
    pagina.on("pageerror", (e) => errores.push(String(e)));
    pagina.on("download", (d) => descargas.push(d.url()));
    await pagina.goto(`http://127.0.0.1:${puerto}/`);
    await pagina.waitForFunction("window.listo === true", null, { timeout: 15000 });
    await pagina.evaluate(([q, d]) => window[q.f](d, q.completa), [que, datos]);
    await pagina.waitForTimeout(500);
    assert.deepEqual(errores, [], `la pantalla no llegó a pintarse a ${ancho}x${alto}`);
    return { pagina, descargas, ctx };
}

const LOS_ENLACES = `() => {
    const p = document.querySelector('[data-texto-de-actualizacion]');
    const colorTexto = getComputedStyle(p).color;
    return [...p.querySelectorAll('a')].map((a) => ({
        texto: a.textContent, href: a.getAttribute('href'), target: a.getAttribute('target'),
        rel: a.getAttribute('rel'), distinto: getComputedStyle(a).color !== colorTexto,
        subrayado: getComputedStyle(a).textDecorationLine.includes('underline'),
    }));
}`;

/** Pulsa donde se ve el video (o su recuadro) y dice si SUENA. */
async function pulsarElVideo(pagina, raiz) {
    const video = await pagina.$(`${raiz} video`);
    if (!video) {
        // El «antes»: un documento. Se pulsa como lo pulsaría una persona.
        const doc = await pagina.$(`${raiz} [data-documento-de-actualizacion]`);
        if (doc) await doc.click();
        await pagina.waitForTimeout(1500);
        return { hayVideo: false };
    }
    // Donde se pulsa es lo que se ve encima: el botón de reproducir si lo hay
    // (el «antes» no lo tenía, y ahí se pulsa el propio video).
    const boton = await pagina.$(`${raiz} [data-reproducir-video]`);
    await (boton ?? video).click();
    await pagina.waitForTimeout(1800);
    return {
        hayVideo: true,
        ...(await pagina.$eval(`${raiz} video`, (v) => ({ paused: v.paused, t: v.currentTime, error: v.error?.code ?? null }))),
    };
}

const SITIOS = [
    ["la tarjeta de la lista", "[data-tarjeta]", { f: "tarjeta", completa: false }],
    ["la tarjeta, completa", "[data-tarjeta]", { f: "tarjeta", completa: true }],
    ["la ventana que salta", "[data-aviso-de-actualizacion]", { f: "ventana" }],
];

test("las direcciones del texto son ENLACES, igual en la tarjeta y en la ventana", { skip: !hayNavegador }, async (t) => {
    await conLaPantalla(async (nav, puerto) => {
        for (const [nombre, raiz, que] of SITIOS) {
            await t.test(nombre, async () => {
                const { pagina, ctx } = await abrir(nav, puerto, 1280, 800, que, actualizacion(puerto, VIDEO_PROD(puerto)));
                if (que.f === "ventana") await pagina.waitForSelector(raiz, { timeout: 5000 });
                const enlaces = await pagina.evaluate(`(${LOS_ENLACES})()`);
                if (ROTO) {
                    assert.equal(enlaces.length, 0, "ANTES: las direcciones eran texto plano");
                    await ctx.close();
                    return;
                }
                assert.equal(enlaces.length, 2, JSON.stringify(enlaces));
                const [fuera, dentro] = enlaces;
                assert.equal(fuera.href, "https://docs.ejemplo.com/guia-leads", "sin el punto de la frase");
                assert.equal(fuera.target, "_blank", "lo de fuera abre otra pestaña");
                assert.match(fuera.rel, /noopener/);
                assert.equal(dentro.href, "/schedule", "lo de dentro navega dentro");
                assert.equal(dentro.target, null);
                for (const e of enlaces) {
                    assert.ok(e.distinto, "el enlace se ve distinto del texto");
                    assert.ok(e.subrayado, "y subrayado");
                }
                // Pulsar el de fuera abre esa dirección.
                const [nueva] = await Promise.all([ctx.waitForEvent("page"), pagina.click("[data-texto-de-actualizacion] a[target=_blank]")]);
                assert.match(nueva.url(), /docs\.ejemplo\.com\/guia-leads/);
                if (que.f === "ventana") {
                    assert.deepEqual(await pagina.evaluate("window.__marcas.map(m => m.como)"), ["vista"], "pulsar un enlace es haberla visto");
                }
                await ctx.close();
            });
        }
    });
});

test("el video se REPRODUCE dentro de la tarjeta, sin descargarse", { skip: !hayNavegador }, async (t) => {
    await conLaPantalla(async (nav, puerto) => {
        for (const [nombreVideo, archivo] of [["el de producción (WebM con nombre .mp4)", VIDEO_PROD], ["subido con tipo genérico", VIDEO_GENERICO]]) {
            for (const [nombre, raiz, que] of SITIOS) {
                await t.test(`${nombreVideo} · ${nombre}`, async () => {
                    const { pagina, descargas, ctx } = await abrir(nav, puerto, 1280, 800, que, actualizacion(puerto, archivo(puerto)));
                    if (que.f === "ventana") await pagina.waitForSelector(raiz, { timeout: 5000 });
                    const url = pagina.url();
                    const r = await pulsarElVideo(pagina, raiz);
                    if (ROTO && archivo === VIDEO_GENERICO) {
                        assert.equal(r.hayVideo, false, "ANTES: salía como documento");
                        assert.equal(descargas.length, 1, "ANTES: al pulsarlo se DESCARGABA");
                        await ctx.close();
                        return;
                    }
                    assert.ok(r.hayVideo, "es un reproductor, no un documento");
                    assert.equal(r.error, null, "el video se puede leer");
                    assert.equal(r.paused, false, "al pulsar, suena");
                    assert.ok(r.t > 0.3, `y avanza (${r.t})`);
                    assert.deepEqual(descargas, [], "sin ninguna descarga");
                    assert.equal(pagina.url(), url, "y sin salir de la página");
                    await ctx.close();
                });
            }
        }
    });
});

test("el video ocupa su tarjeta, igual en todas las anchuras", { skip: !hayNavegador || ROTO }, async (t) => {
    await conLaPantalla(async (nav, puerto) => {
        for (const [ancho, alto] of [[1440, 900], [1280, 800], [1024, 768], [390, 844]]) {
            for (const [nombre, raiz, que] of SITIOS) {
                await t.test(`${ancho}x${alto} · ${nombre}`, async () => {
                    const { pagina, ctx } = await abrir(nav, puerto, ancho, alto, que, actualizacion(puerto, VIDEO_PROD(puerto)));
                    if (que.f === "ventana") await pagina.waitForSelector(raiz, { timeout: 5000 });
                    const m = await pagina.evaluate((r) => {
                        const caja = document.querySelector('[data-contenido-de-actualizacion]').getBoundingClientRect();
                        const v = document.querySelector(`${r} video`).getBoundingClientRect();
                        const b = document.querySelector(`${r} [data-reproducir-video]`)?.getBoundingClientRect();
                        return {
                            caja: [caja.left, caja.right], video: [v.left, v.right, v.top, v.bottom],
                            boton: b ? [b.left, b.right, b.top, b.bottom] : null,
                            desborda: document.documentElement.scrollWidth > window.innerWidth,
                        };
                    }, raiz);
                    assert.equal(m.desborda, false, "nada desborda a lo ancho");
                    assert.ok(Math.abs(m.video[0] - m.caja[0]) <= 1 && Math.abs(m.video[1] - m.caja[1]) <= 1, `el video llena el ancho: ${JSON.stringify(m)}`);
                    assert.ok(m.boton, "el botón de reproducir está");
                    for (let i = 0; i < 4; i++) assert.ok(Math.abs(m.boton[i] - m.video[i]) <= 1, `y cubre el video entero: ${JSON.stringify(m)}`);
                    await ctx.close();
                });
            }
        }
    });
});
