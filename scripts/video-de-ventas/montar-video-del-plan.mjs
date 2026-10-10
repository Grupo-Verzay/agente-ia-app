#!/usr/bin/env node
/**
 * Monta el VIDEO COMERCIAL DE UN PLAN (`planes.mjs`) y lo publica en
 * `public/videos-de-planes/<id>.mp4`, con su portada y su `.json`.
 *
 *   PLAN=esencial node scripts/video-de-ventas/montar-video-del-plan.mjs
 *
 * Necesita el caso de uso ya grabado (`caso-<id>.mp4` en `TRABAJO`, lo deja
 * `PLAN=<id> grabar-video-de-ventas.mjs`) y las frases en la caché de voz
 * (`narracion-del-plan.mjs`). Cada tramo del plan sale así:
 *
 *   - `caso`: la grabación de la historia, sin su portada.
 *   - `tarjeta` y `guia`: una página con el MISMO estilo del estudio (fondo,
 *     rótulo de arriba, subtítulo), grabada con `grabadora-de-la-guia.mjs` —
 *     nunca con `recordVideo`, que estira la imagen y la despega de la voz—.
 *     En una `guia`, el trozo del videotutorial publicado va dentro de una
 *     ventana con la dirección de la plataforma; se recorta antes con ffmpeg
 *     (sin su rótulo de abajo: aquí manda el subtítulo de la frase nueva).
 *
 * Después, en una sola pasada: el avatar de Verzay arriba a la derecha con la
 * onda de su voz mientras narra, la música (sintetizada aquí: nada de terceros)
 * que se aparta cuando habla, y el volumen normalizado. Sale H.264 + AAC, que
 * se reproduce en cualquier sitio.
 *
 * `ENSAYO=1` deja todo en el directorio de trabajo y no toca `public/videos-de-planes/`.
 */
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { grabar } from "../grabadora-de-la-guia.mjs";
import { acortarLasPausas, escribirWav, leerWav } from "../voz-de-la-guia.mjs";
import { llaveDeLaFrase, wavDeLaCache } from "../voz-cedar.mjs";
import { DOMINIO_DEL_PANEL } from "./estudio.mjs";
import { servirElEstudio } from "./estudio-servido.mjs";
import { CACHE_DE_VENTAS, VOZ_DE_VENTAS } from "./narracion.mjs";
import { elPlanDelVideo, loProhibidoDelPlan } from "./planes.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const RAIZ = path.resolve(import.meta.dirname, "..", "..");
const PLAN = elPlanDelVideo(process.env.PLAN ?? process.argv[2]);
const TRABAJO = process.env.TRABAJO ?? "/tmp/video-de-ventas";
const ENSAYO = process.env.ENSAYO === "1";
const DIR = path.join(TRABAJO, `montaje-${PLAN.id}`);
const SALIDA = ENSAYO ? DIR : path.join(RAIZ, "public", "videos-de-planes");
const CASO = path.join(TRABAJO, `caso-${PLAN.id}.mp4`);

const ANCHO = 1920;
const ALTO = 1080;
const FPS = 25;
/** La portada del caso de uso (su primer medio segundo) no entra: el vídeo del plan abre con su tarjeta. */
const PORTADA_DEL_CASO_MS = 500;
/** Lo que se ve antes de que hable el narrador y lo que se queda después, por tramo. */
const ANTES_MS = { tarjeta: 450, guia: 350 };
const DESPUES_MS = { tarjeta: 700, guia: 450, cierre: 1600 };
/** El fundido de entrada y de salida de cada tramo. */
const FUNDIDO_S = 0.25;
/** Dónde va el trozo de la guía en el cuadro: la ventana de la plataforma. */
const VENTANA = Object.freeze({ x: 288, y: 132, ancho: 1344, alto: 756, barra: 44 });
/** Cuánto del videotutorial se ve: arriba 1280×720 de sus 1280×800 (abajo va su propio rótulo). */
const RECORTE_DE_LA_GUIA = "crop=1280:720:0:0";
/** La ruta que enseña la barra de la ventana, por módulo (la de la App). */
const RUTA_DEL_MODULO = Object.freeze({ chats: "/chats", leads: "/sessions", agenda: "/schedule", "agente-ia": "/ia/whatsapp" });
/** El avatar que narra y la onda de su voz, arriba a la derecha. */
const AVATAR = Object.freeze({ lado: 96, x: ANCHO - 40 - 96, y: 26, onda: { ancho: 150, alto: 54 } });
/** La música, muy por debajo de la voz; y cuánto se aparta cuando habla. */
const MUSICA = Object.freeze({ volumen: 0.16, umbral: 0.03, proporcion: 6 });

const prohibido = loProhibidoDelPlan(PLAN);
if (prohibido.length) throw new Error(`[plan] el vídeo diría algo prohibido (un precio…): ${prohibido.join(" | ")}`);
if (!existsSync(CASO)) throw new Error(`[plan] falta el caso de uso grabado: ${CASO} (PLAN=${PLAN.id} scripts/generar-video-de-ventas.sh)`);

rmSync(DIR, { recursive: true, force: true });
mkdirSync(DIR, { recursive: true });
mkdirSync(SALIDA, { recursive: true });

const ff = (args) => execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...args], { stdio: ["ignore", "inherit", "inherit"] });
const duracionDe = (f) => Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).toString().trim());
const enBase64 = (f) => readFileSync(f).toString("base64");
const esc = (t) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/* ------------------------------------------------------------------ */
/* Las voces                                                           */
/* ------------------------------------------------------------------ */

/** La frase de un tramo, con las pausas recortadas como en las guías. */
function laVoz(texto, nombre) {
    const audio = acortarLasPausas(leerWav(wavDeLaCache(texto, CACHE_DE_VENTAS, VOZ_DE_VENTAS)));
    const ruta = path.join(DIR, `${nombre}.wav`);
    writeFileSync(ruta, escribirWav(audio.datos, audio.frecuencia));
    return { ruta, ms: audio.ms };
}

/* ------------------------------------------------------------------ */
/* La música                                                           */
/* ------------------------------------------------------------------ */

/**
 * Una cama suave: acordes largos (Do maj9, La m7, Fa maj7, Sol 6) con un
 * arpegio muy bajo encima, todo con senos y envolventes lentas. Cuatro
 * segundos por acorde; se repite lo que haga falta.
 */
export function laMusica(ms, frecuencia = 48_000) {
    const n = Math.ceil((ms / 1000) * frecuencia);
    const datos = new Float64Array(n);
    const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);
    const ACORDES = [
        [48, 55, 64, 71, 74],
        [45, 52, 60, 67, 71],
        [41, 48, 57, 64, 69],
        [43, 50, 59, 64, 69],
    ];
    const COMPAS = 4;
    const total = n / frecuencia;
    for (let c = 0; c * COMPAS < total; c += 1) {
        const notas = ACORDES[c % ACORDES.length];
        const t0 = c * COMPAS;
        // El colchón: cada nota entra en 1,2 s y se va en 1,6 s, montada sobre la siguiente.
        for (const midi of notas) {
            const f = hz(midi);
            const desde = Math.floor(t0 * frecuencia);
            const hasta = Math.min(n, Math.floor((t0 + COMPAS + 1.6) * frecuencia));
            for (let i = desde; i < hasta; i += 1) {
                const t = i / frecuencia - t0;
                const env = Math.min(1, t / 1.2) * (t > COMPAS ? Math.max(0, 1 - (t - COMPAS) / 1.6) : 1);
                const s = Math.sin(2 * Math.PI * f * t) + 0.5 * Math.sin(2 * Math.PI * (f + 0.35) * t) + 0.12 * Math.sin(4 * Math.PI * f * t);
                datos[i] += (s * env * (midi < 50 ? 0.9 : 0.55)) / notas.length;
            }
        }
        // El arpegio: corcheas a 90 por minuto, una octava arriba, con caída.
        const corchea = 60 / 90 / 2;
        for (let k = 0; k * corchea < COMPAS; k += 1) {
            const midi = notas[1 + (k % (notas.length - 1))] + 12;
            const f = hz(midi);
            const ti = t0 + k * corchea;
            const desde = Math.floor(ti * frecuencia);
            const hasta = Math.min(n, desde + Math.floor(1.2 * frecuencia));
            for (let i = desde; i < hasta; i += 1) {
                const t = (i - desde) / frecuencia;
                datos[i] += Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 4.5) * Math.min(1, t / 0.01) * 0.12;
            }
        }
    }
    // Entrada y salida de 2 s, y al nivel de 16 bits.
    const fundido = 2 * frecuencia;
    let pico = 0;
    for (let i = 0; i < n; i += 1) pico = Math.max(pico, Math.abs(datos[i]));
    const buf = Buffer.alloc(n * 2);
    for (let i = 0; i < n; i += 1) {
        const env = Math.min(1, i / fundido, (n - 1 - i) / fundido);
        buf.writeInt16LE(Math.round((datos[i] / (pico || 1)) * env * 0.8 * 32767), i * 2);
    }
    return escribirWav(buf, frecuencia);
}

/* ------------------------------------------------------------------ */
/* Las páginas del montaje                                             */
/* ------------------------------------------------------------------ */

const FUENTE = enBase64(path.join(RAIZ, "scripts", "video-de-ventas", "fuentes", "inter-latin.woff2"));
const LOGO = `data:image/png;base64,${enBase64(path.join(RAIZ, "public", "icon-512.png"))}`;
const CHEQUE = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`;

/** El fondo, el rótulo de arriba y el subtítulo: los MISMOS del estudio (`estudio.mjs`). */
const CSS = `
@font-face { font-family: "Inter"; src: url(data:font/woff2;base64,${FUENTE}) format("woff2"); font-weight: 100 900; font-display: block; }
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: ${ANCHO}px; height: ${ALTO}px; overflow: hidden; }
body { font-family: "Inter", "Noto Color Emoji", system-ui, sans-serif; color: #e8edf8; -webkit-font-smoothing: antialiased; position: relative;
  background:
    radial-gradient(900px 620px at 12% 8%, rgba(31,123,255,.28), transparent 70%),
    radial-gradient(820px 600px at 92% 96%, rgba(47,214,122,.20), transparent 70%),
    radial-gradient(1200px 900px at 50% 50%, #0b1633 0%, #060a18 100%); }
body::before { content: ""; position: absolute; inset: 0; pointer-events: none;
  background-image: radial-gradient(rgba(255,255,255,.07) 1px, transparent 1.2px); background-size: 34px 34px;
  mask-image: radial-gradient(1100px 700px at 50% 50%, #000 30%, transparent 85%); }
.grad { background: linear-gradient(90deg,#4da3ff,#39e08b); -webkit-background-clip: text; background-clip: text; color: transparent; }
.entra { opacity: 0; transform: translateY(24px); transition: opacity .7s ease, transform .9s cubic-bezier(.2,.8,.2,1); }
.sale .entra { opacity: 1; transform: none; }
.sale .d1 { transition-delay: .12s; } .sale .d2 { transition-delay: .3s; } .sale .d3 { transition-delay: .5s; } .sale .d4 { transition-delay: .7s; }
#capacidad { position: absolute; left: 64px; top: 34px; display: flex; align-items: center; gap: 14px; opacity: 0; transform: translateX(-20px); transition: opacity .5s, transform .6s cubic-bezier(.2,.8,.2,1); }
.sale #capacidad { opacity: 1; transform: none; }
#capacidad .num { height: 44px; padding: 0 14px; border-radius: 13px; background: linear-gradient(135deg,#1f7bff,#2fd67a); display: grid; place-items: center; font-size: 15px; font-weight: 800; color: #04121f; text-transform: uppercase; letter-spacing: .6px; }
#capacidad b { font-size: 30px; font-weight: 800; letter-spacing: -.6px; color: #fff; }
#capacidad small { display: block; font-size: 16px; color: #9fb0cf; font-weight: 500; margin-top: 1px; }
#subtitulo { position: absolute; left: 50%; bottom: 22px; transform: translateX(-50%); max-width: 1500px; width: max-content; text-align: center; padding: 11px 26px; border-radius: 16px;
  background: rgba(4,9,22,.78); border: 1px solid rgba(255,255,255,.08); font-size: 25px; font-weight: 600; color: #fff; line-height: 1.32; opacity: 0; transition: opacity .3s; }
#subtitulo.sale { opacity: 1; }
/* la ventana de la plataforma */
#ventana { position: absolute; left: ${VENTANA.x}px; top: ${VENTANA.y}px; width: ${VENTANA.ancho}px; border-radius: 18px; overflow: hidden; background: #fff;
  box-shadow: 0 40px 90px rgba(0,0,0,.55), 0 0 0 1px rgba(255,255,255,.08); opacity: 0; transform: scale(.975); transition: opacity .5s, transform .8s cubic-bezier(.2,.8,.2,1); }
.sale #ventana { opacity: 1; transform: none; }
#ventana .barra { height: ${VENTANA.barra}px; background: #eef1f6; display: flex; align-items: center; gap: 16px; padding: 0 18px; border-bottom: 1px solid #dfe3ea; }
#ventana .semaforo { display: flex; gap: 8px; } #ventana .semaforo i { width: 12px; height: 12px; border-radius: 50%; background: #ff5f57; } #ventana .semaforo i:nth-child(2) { background: #febc2e; } #ventana .semaforo i:nth-child(3) { background: #28c840; }
#ventana .url { flex: 1; max-width: 560px; margin: 0 auto; height: 28px; border-radius: 8px; background: #fff; border: 1px solid #dfe3ea; color: #475569; font-size: 15px; display: flex; align-items: center; justify-content: center; }
#ventana video { display: block; width: ${VENTANA.ancho}px; height: ${VENTANA.alto}px; object-fit: cover; background: #fff; }
/* las tarjetas */
.tarjeta { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
.tarjeta .logo { width: 150px; height: 150px; filter: drop-shadow(0 20px 50px rgba(31,123,255,.45)); }
.tarjeta .ceja { font-size: 26px; font-weight: 700; letter-spacing: 6px; text-transform: uppercase; color: #9fb0cf; margin-top: 26px; }
.tarjeta .grande { font-size: 112px; font-weight: 800; letter-spacing: -3.5px; line-height: 1.05; margin-top: 10px; background: linear-gradient(90deg,#ffffff 30%,#9cc7ff); -webkit-background-clip: text; background-clip: text; color: transparent; }
.tarjeta .medio { font-size: 84px; font-weight: 800; letter-spacing: -2.5px; line-height: 1.08; color: #fff; }
.tarjeta .detalle { font-size: 34px; font-weight: 600; color: #dfe7f7; margin-top: 22px; letter-spacing: -.4px; }
.tarjeta .num { width: 118px; height: 118px; border-radius: 34px; background: linear-gradient(135deg,#1f7bff,#2fd67a); display: grid; place-items: center; font-size: 60px; font-weight: 800; color: #04121f; margin-bottom: 34px; box-shadow: 0 24px 60px rgba(31,123,255,.35); }
.pildoras { display: grid; grid-template-columns: repeat(3, 400px); gap: 18px; margin-top: 46px; }
.pildora { display: flex; align-items: center; gap: 14px; padding: 18px 22px; border-radius: 18px; background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.1); font-size: 25px; font-weight: 700; color: #fff; text-align: left; }
.pildora i { flex: none; width: 38px; height: 38px; border-radius: 50%; display: grid; place-items: center; color: #04121f; background: linear-gradient(135deg,#4da3ff,#39e08b); }
.aviso { position: absolute; bottom: 104px; left: 0; right: 0; text-align: center; font-size: 17px; color: #7d8bab; }
`;

function laPagina(cuerpo) {
    return `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>${CSS}</style></head><body><div id="todo">${cuerpo}</div>
<div id="subtitulo"></div>
<script>
window.__montaje = {
  entrar() { document.getElementById("todo").classList.add("sale"); },
  subtitulo(t) { const s = document.getElementById("subtitulo"); if (!t) { s.classList.remove("sale"); return; } s.textContent = t; s.classList.add("sale"); },
  async listo() { await document.fonts.ready; const v = document.querySelector("video"); if (v && v.readyState < 2) await new Promise((r, e) => { v.oncanplay = r; v.onerror = () => e(new Error("el trozo de la guía no carga")); }); },
  reproducir() { const v = document.querySelector("video"); if (v) return v.play(); },
};
</script></body></html>`;
}

function laTarjeta(t) {
    if (t.tarjeta === "titulo") {
        return `<div class="tarjeta"><img class="logo entra" src="${LOGO}"><div class="ceja entra d1">${esc(t.seccion)}</div>
<div class="grande entra d2">${esc(t.titulo)}</div><div class="detalle entra d3">${esc(t.detalle)}</div></div>`;
    }
    if (t.tarjeta === "seccion") {
        return `<div class="tarjeta"><div class="num entra">${esc(t.seccion)}</div><div class="medio entra d1">${esc(t.titulo)}</div>
<div class="detalle entra d2"><span class="grad">${esc(t.detalle)}</span></div></div>`;
    }
    if (t.tarjeta === "cierre") {
        const pildoras = t.incluye.map((x, i) => `<div class="pildora entra d${Math.min(4, 2 + Math.floor(i / 3))}"><i>${CHEQUE}</i>${esc(x)}</div>`).join("");
        return `<div class="tarjeta"><img class="logo entra" src="${LOGO}"><div class="ceja entra d1">Verzay</div>
<div class="grande entra d1">${esc(t.titulo)}</div><div class="pildoras">${pildoras}</div></div>
<div class="aviso">Demostración con datos de ejemplo. Verzay construye e implementa tu plataforma.</div>`;
    }
    throw new Error(`[plan] tarjeta desconocida: ${t.tarjeta}`);
}

function laGuia(t) {
    return `<div id="capacidad"><div class="num">${esc(t.eyebrow)}</div><div><b>${esc(t.titulo)}</b><small>${esc(t.detalle)}</small></div></div>
<div id="ventana"><div class="barra"><div class="semaforo"><i></i><i></i><i></i></div><div class="url">${esc(DOMINIO_DEL_PANEL)}${esc(RUTA_DEL_MODULO[t.modulo] ?? "")}</div><div style="width:52px"></div></div>
<video src="/__estudio/medios/${esc(t.id)}.webm" muted playsinline preload="auto"></video></div>`;
}

/* ------------------------------------------------------------------ */
/* Cada tramo                                                          */
/* ------------------------------------------------------------------ */

const navegador = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined, args: ["--autoplay-policy=no-user-gesture-required"] });
const ctx = await navegador.newContext({ viewport: { width: ANCHO, height: ALTO }, deviceScaleFactor: 1 });
let paginaActual = "";
const archivos = {};
await servirElEstudio(ctx, { pagina: () => paginaActual, archivos });

const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const segmentos = [];
const linea = [];
let reloj = 0;

/** Una página del montaje grabada en tiempo real, con su voz debajo. */
async function grabarUnaPagina(t, cuerpo, voz, { antes, despues }) {
    paginaActual = laPagina(cuerpo);
    const p = await ctx.newPage();
    const fallos = [];
    p.on("pageerror", (e) => fallos.push(e.message));
    await p.goto("http://montaje.test/__estudio/estudio.html");
    await p.evaluate(() => window.__montaje.listo());
    const mudo = path.join(DIR, `${t.id}.mkv`);
    const grabadora = await grabar(p, mudo, { ancho: ANCHO, alto: ALTO });
    const t0 = Date.now();
    grabadora.empezarEn(t0);
    await p.evaluate(() => window.__montaje.entrar());
    await p.evaluate(() => window.__montaje.reproducir());
    await espera(antes);
    await p.evaluate((x) => window.__montaje.subtitulo(x), t.texto);
    await espera(voz.ms);
    await p.evaluate(() => window.__montaje.subtitulo(""));
    await espera(Math.max(0, antes + voz.ms + despues - (Date.now() - t0)));
    await grabadora.parar();
    await p.close();
    if (fallos.length) throw new Error(`[plan] la página de «${t.id}» falló: ${fallos.join(" | ")}`);
    const ms = antes + voz.ms + despues;
    const salida = path.join(DIR, `${String(segmentos.length).padStart(2, "0")}-${t.id}.mp4`);
    ff([
        "-i", mudo, "-i", voz.ruta,
        "-filter_complex",
        `[0:v]trim=duration=${ms / 1000},setpts=PTS-STARTPTS,fps=${FPS},format=yuv420p,fade=in:st=0:d=${FUNDIDO_S},fade=out:st=${(ms / 1000 - FUNDIDO_S).toFixed(3)}:d=${FUNDIDO_S}[v];` +
            `[1:a]aresample=48000,adelay=${antes}:all=1,apad,atrim=duration=${ms / 1000}[a]`,
        "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-preset", "fast", "-crf", "16", "-c:a", "pcm_s16le", "-ac", "1", salida.replace(/\.mp4$/, ".mkv"),
    ]);
    segmentos.push(salida.replace(/\.mp4$/, ".mkv"));
    linea.push({ id: t.id, tipo: t.tipo, texto: t.texto, inicioMs: reloj, vozMs: [reloj + antes, reloj + antes + voz.ms], finMs: reloj + ms });
    reloj += ms;
}

for (const t of PLAN.tramos) {
    console.log(`· ${t.tipo} ${t.id}`);
    if (t.tipo === "caso") {
        const total = duracionDe(CASO) - PORTADA_DEL_CASO_MS / 1000;
        const salida = path.join(DIR, `${String(segmentos.length).padStart(2, "0")}-caso.mkv`);
        ff([
            "-ss", (PORTADA_DEL_CASO_MS / 1000).toFixed(3), "-i", CASO,
            "-filter_complex",
            `[0:v]setpts=PTS-STARTPTS,fps=${FPS},format=yuv420p,fade=in:st=0:d=${FUNDIDO_S},fade=out:st=${(total - FUNDIDO_S).toFixed(3)}:d=${FUNDIDO_S}[v];[0:a]aresample=48000,asetpts=PTS-STARTPTS[a]`,
            "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-preset", "fast", "-crf", "16", "-c:a", "pcm_s16le", "-ac", "1", salida,
        ]);
        segmentos.push(salida);
        const ms = Math.round(total * 1000);
        linea.push({ id: t.id, tipo: t.tipo, inicioMs: reloj, finMs: reloj + ms });
        reloj += ms;
        continue;
    }
    const voz = laVoz(t.texto, t.id);
    if (t.tipo === "tarjeta") {
        const despues = t.tarjeta === "cierre" ? DESPUES_MS.cierre : DESPUES_MS.tarjeta;
        await grabarUnaPagina(t, laTarjeta(t), voz, { antes: ANTES_MS.tarjeta, despues });
    } else if (t.tipo === "guia") {
        const fuente = path.join(RAIZ, "public", "guia", t.modulo, "demostracion.webm");
        const largo = (ANTES_MS.guia + voz.ms + DESPUES_MS.guia) / 1000 + 0.5;
        const trozo = path.join(DIR, `${t.id}.webm`);
        // El trozo de la guía, recortado y en VP9 (el Chromium que graba no trae H.264).
        ff([
            "-ss", (Math.max(0, t.desdeMs - ANTES_MS.guia) / 1000).toFixed(3), "-i", fuente, "-t", largo.toFixed(3),
            "-vf", `${RECORTE_DE_LA_GUIA},scale=${VENTANA.ancho}:${VENTANA.alto}:flags=lanczos,fps=${FPS}`, "-an",
            "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "24", "-deadline", "realtime", "-cpu-used", "8", "-row-mt", "1", trozo,
        ]);
        archivos[`${t.id}.webm`] = trozo;
        await grabarUnaPagina(t, laGuia(t), voz, { antes: ANTES_MS.guia, despues: DESPUES_MS.guia });
    } else {
        throw new Error(`[plan] tramo desconocido: ${t.tipo}`);
    }
}
await ctx.close();
await navegador.close();

/* ------------------------------------------------------------------ */
/* Todo junto: el avatar con su onda, la música y el MP4               */
/* ------------------------------------------------------------------ */

const lista = path.join(DIR, "lista.txt");
writeFileSync(lista, segmentos.map((s) => `file '${s}'`).join("\n") + "\n");
const unido = path.join(DIR, "unido.mkv");
ff(["-f", "concat", "-safe", "0", "-i", lista, "-c", "copy", unido]);
const totalMs = Math.round(duracionDe(unido) * 1000);

const musica = path.join(DIR, "musica.wav");
writeFileSync(musica, laMusica(totalMs + 500));

// El avatar en su círculo, con el anillo de la marca (el de la App: `public/logo-agente.png`).
const avatar = path.join(DIR, "avatar.png");
ff([
    "-i", path.join(RAIZ, "public", "logo-agente.png"),
    "-vf", `scale=${AVATAR.lado}:${AVATAR.lado}:flags=lanczos,format=rgba`,
    avatar,
]);

const destino = path.join(SALIDA, PLAN.archivos.video);
const { onda } = AVATAR;
ff([
    "-i", unido, "-i", musica, "-loop", "1", "-i", avatar,
    "-filter_complex",
    [
        `[0:a]aresample=48000,asplit=3[voz][vozOnda][vozLlave]`,
        // La onda de la voz, verde de la marca, al lado del avatar.
        `[vozOnda]showwaves=s=${onda.ancho}x${onda.alto}:mode=cline:rate=${FPS}:colors=0x39e08b|0x4da3ff:scale=sqrt,format=rgba[onda]`,
        `[0:v][2:v]overlay=x=${AVATAR.x}:y=${AVATAR.y}:shortest=1[v1]`,
        `[v1][onda]overlay=x=${AVATAR.x - 14 - onda.ancho}:y=${AVATAR.y + (AVATAR.lado - onda.alto) / 2}:shortest=1,format=yuv420p[v]`,
        // La música se aparta cuando habla el narrador.
        `[1:a]aresample=48000,volume=${MUSICA.volumen}[mus]`,
        `[mus][vozLlave]sidechaincompress=threshold=${MUSICA.umbral}:ratio=${MUSICA.proporcion}:attack=20:release=400[musBaja]`,
        `[voz][musBaja]amix=inputs=2:duration=first:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11[a]`,
    ].join(";"),
    "-map", "[v]", "-map", "[a]",
    "-c:v", "libx264", "-preset", "slow", "-crf", "20", "-pix_fmt", "yuv420p", "-r", String(FPS), "-profile:v", "high", "-movflags", "+faststart",
    "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-t", (totalMs / 1000).toFixed(3),
    destino,
]);

// La portada: la tarjeta de apertura ya entera.
const apertura = linea[0];
ff(["-ss", ((apertura.vozMs?.[0] ?? 1000) / 1000 + 1.2).toFixed(2), "-i", destino, "-frames:v", "1", "-q:v", "3", path.join(SALIDA, PLAN.archivos.portada)]);

writeFileSync(
    path.join(SALIDA, PLAN.archivos.datos),
    JSON.stringify(
        {
            plan: PLAN.id,
            voz: VOZ_DE_VENTAS.voz,
            modelo: VOZ_DE_VENTAS.modelo,
            duracionMs: totalMs,
            frases: Object.fromEntries(PLAN.tramos.filter((t) => t.texto).map((t) => [t.id, llaveDeLaFrase(t.texto, VOZ_DE_VENTAS)])),
            tramos: linea,
        },
        null,
        2,
    ) + "\n",
);
console.log(`✓ ${destino} · ${Math.round(statSync(destino).size / 1024)} KB · ${(totalMs / 1000).toFixed(1)} s`);
