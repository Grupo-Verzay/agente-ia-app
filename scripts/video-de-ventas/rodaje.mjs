/**
 * El RODAJE de los vídeos de Clínica Sonríe: todo lo que el vídeo de ventas
 * (`/demo`, `grabar-video-de-ventas.mjs`) y su corte de YouTube
 * (`grabar-video-de-youtube.mjs`) hacen IGUAL, escrito una vez.
 *
 *   1. se generan los archivos de la historia (`medios.mjs`) y se siembra la
 *      clínica en la App (`sembrar.mjs`), con el calendario de quien graba;
 *   2. se abre el ESTUDIO (`estudio.mjs`) en el origen de la App, con las
 *      pestañas del portátil —Chats, Agenda, Embudos y Reportes— cargadas de
 *      verdad;
 *   3. se dan las piezas del guion: que llegue un mensaje (lo escribe
 *      `backend.mjs` en la base y el aviso en vivo sale por el mismo socket que
 *      en producción), la presencia, las notas de voz, los anillos, la
 *      narración (`decir`, `alDecir`, `acabar`) y el rótulo de cada capacidad;
 *   4. al terminar se mezcla la banda sonora (`banda-sonora.mjs`) y sale un
 *      MP4 (H.264 y AAC) con su portada y lo que el banco mide de él.
 *
 * Lo que cambia de un vídeo a otro —el guion, la narración, la llamada, el
 * calendario, los separadores de día y la lista de capacidades— lo pone cada
 * grabador. Con dos copias de esto, el día que se afine una (un aviso que no
 * llega, la ventana de la lista) la otra grabaría distinto sin decir nada.
 */
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { entrar, espera } from "../taller-de-la-guia.mjs";
import { acortarLasPausas, leerWav } from "../voz-de-la-guia.mjs";
import { llaveDeLaFrase, wavDeLaCache } from "../voz-cedar.mjs";
import { elBackend, laPresencia } from "./backend.mjs";
import { CORTES_DE_LAS_NOTAS, elAvisoDeMensaje, elTonoDeLlamada, mezclarLaBanda, porTelefono, recortarAudio, sePisanLasVoces } from "./banda-sonora.mjs";
import { CAPAS_DEL_PORTATIL, PORTATIL, elMensajeDelEstudio, laPaginaDelEstudio, losNegociosDelMontaje } from "./estudio.mjs";
import { servirElEstudio } from "./estudio-servido.mjs";
import {
    ASESORA,
    CLIENTA,
    LLAMADO,
    MEDIOS,
    MEDIOS_DEL_MONTAJE,
    NEGOCIO,
    NEGOCIOS_DEL_ARRANQUE,
    NOTAS_DE_VOZ,
    OTROS_CHATS,
    ZONA,
    laHora,
    losDiasDeLaHoja,
    lasIniciales,
} from "./historia.mjs";
import { generarLosMedios } from "./medios.mjs";
import { CACHE_DE_VENTAS, LA_VOZ_EN_LA_LLAMADA, VOZ_DE_LA_CLIENTA, VOZ_DE_SOFIA, VOZ_DE_VENTAS } from "./narracion.mjs";
import { sembrarLaClinica } from "./sembrar.mjs";
import { servirElTiempoReal } from "./tiempo-real.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const { PrismaClient } = require("@prisma/client");

const RAIZ = path.resolve(import.meta.dirname, "..", "..");

/** Entre una frase y la siguiente, lo que respira una persona hablando (el de las guías). */
export const RESPIRO_ENTRE_FRASES_MS = 250;
/** Entre dos líneas de la llamada: lo que tarda en contestar quien escucha. */
export const RESPIRO_EN_LA_LLAMADA_MS = 350;
/** El número de la clienta sin el `@…`: así lo guardan las rutas del panel. */
export const NUMERO = CLIENTA.jid.split("@")[0];
/** Las iniciales de la asesora, como las pinta su círculo en la fila de la lista. */
export const ASESORA_INICIALES = lasIniciales(`${ASESORA.nombre} ${ASESORA.apellido}`);

/**
 * La primera vez que Laura escribe, la lista del panel se pone al día con la
 * vuelta que dispara el aviso en vivo (2 s después). El servidor recuerda la
 * bandeja 10 s (`MEMORIA_DE_LA_BANDEJA_MS`): si la última vuelta fue hace menos,
 * esa trae la foto de antes y la fila sale con la segunda vuelta (11 s). Para
 * que en el vídeo salga al instante —lo que ve un negocio cuando no acaba de
 * mirar su lista— el primer mensaje llega cuando la última vuelta de la lista
 * fue hace más de `desde` y antes de que salga la siguiente: `desde` es la
 * memoria del servidor menos los 2 s del aviso, con margen, y la siguiente sale
 * a los 15 s (`REALTIME_OFF_LIST_INTERVAL_MS`: todavía no ha entrado ningún
 * aviso en vivo) más lo que tarde la vuelta. El ciclo no se supone: se MIDE.
 */
export const VENTANA_DE_LA_LISTA = Object.freeze({ desde: 8_600, margenAntesDeLaSiguiente: 600 });

// Lo que se busca en el panel. Corren DENTRO de la pestaña: solo el DOM.
const caja = (e) => {
    if (!e) return null;
    const r = e.getBoundingClientRect();
    return r.width && r.height ? { x: r.x, y: r.y, w: r.width, h: r.height } : null;
};
void caja;

export const ENCONTRAR = {
    porSelector: (sel) => {
        const e = [...document.querySelectorAll(sel)].find((x) => x.offsetParent);
        if (!e) return null;
        e.scrollIntoView({ block: "center" });
        const r = e.getBoundingClientRect();
        return r.width ? { x: r.x, y: r.y, w: r.width, h: r.height } : null;
    },
    filaDeLaura: (jid) => {
        const e = document.querySelector(`[data-chat-id="${jid}"]`);
        if (!e) return null;
        const r = e.getBoundingClientRect();
        return r.width ? { x: r.x, y: r.y, w: r.width, h: r.height } : null;
    },
    botonDeLaFicha: () => {
        const e = [...document.querySelectorAll('button[title="Ver ficha del contacto"],button[title="Cerrar ficha del contacto"]')].find((b) => b.offsetParent);
        if (!e) return null;
        const r = e.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height, abierta: e.title.startsWith("Cerrar") };
    },
    seccionDeLaFicha: (titulo) => {
        const b = [...document.querySelectorAll("[data-ficha-de-contacto] button")].find((x) => x.offsetParent && x.textContent.trim() === titulo);
        if (!b) return null;
        const r = b.getBoundingClientRect();
        return r.width ? { x: r.x, y: r.y, w: r.width, h: r.height, abierta: !!b.nextElementSibling } : null;
    },
    campoDeLaFicha: ([rotulo, valor]) => {
        const l = [...document.querySelectorAll("[data-ficha-de-contacto] label")].find((x) => x.textContent.trim() === rotulo);
        const fila = l?.parentElement;
        if (!fila) return null;
        const escrito = fila.querySelector("input,textarea")?.value ?? "";
        if (valor && !escrito.includes(valor)) return null;
        const r = fila.getBoundingClientRect();
        return r.width ? { x: r.x, y: r.y, w: r.width, h: r.height } : null;
    },
    nombreEnLaFicha: (nombre) => {
        const e = [...document.querySelectorAll("[data-ficha-de-contacto] span, [data-ficha-de-contacto] input")].find(
            (x) => (x.value ?? x.textContent ?? "").trim().toLowerCase() === nombre.toLowerCase(),
        );
        if (!e) return null;
        const r = e.getBoundingClientRect();
        return r.width ? { x: r.x, y: r.y, w: r.width, h: r.height } : null;
    },
    burbuja: ([id, texto]) => {
        const e = document.querySelector(`[data-message-id="${id}"]`);
        if (!e) return null;
        if (texto && !e.textContent.includes(texto)) return null;
        const r = (e.querySelector("[data-nota-de-voz]")?.closest("div.rounded-lg, div[class*='rounded']") ?? e).getBoundingClientRect();
        return r.width ? { x: r.x, y: r.y, w: r.width, h: r.height } : null;
    },
    textoEnLaFila: ([jid, texto]) => {
        const e = document.querySelector(`[data-chat-id="${jid}"]`);
        // Una pastilla recorta su nombre («Cita confirma…») y lo lleva entero en
        // su `title`: se mira en los dos sitios.
        const loDice = (x) => x.textContent.includes(texto) || [...x.querySelectorAll("[title]")].some((t) => t.getAttribute("title").includes(texto));
        if (!e || !loDice(e)) return null;
        const r = e.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height };
    },
    eventoDeLaura: (nombre) => {
        const e = [...document.querySelectorAll(".fc-event")].find((x) => x.textContent.includes(nombre));
        if (!e) return null;
        const r = e.getBoundingClientRect();
        return r.width ? { x: r.x, y: r.y, w: r.width, h: r.height } : null;
    },
    tarjetaDeLaura: ([numero, etapa]) => {
        const a = document.querySelector(`a[href*="${numero}"]`);
        const t = a?.closest(".rounded-lg.border");
        if (!t) return null;
        if (etapa) {
            // La columna de la tarjeta: la primera caja de más arriba que nombra la etapa.
            let c = t.parentElement;
            while (c && !c.textContent.startsWith(etapa) && c !== document.body) c = c.parentElement;
            if (!c || c === document.body) return null;
        }
        const r = t.getBoundingClientRect();
        return r.width ? { x: r.x, y: r.y, w: r.width, h: r.height } : null;
    },
};

/**
 * Prepara el rodaje entero —la clínica sembrada, el estudio abierto y el panel
 * cargado— y devuelve las piezas del guion.
 *
 * @param {object} o
 * @param {{video: string, portada: string, datos: string}} o.archivos  lo que se publica en `public/demo/`
 * @param {string} o.trabajo  el directorio de trabajo si `TRABAJO` no lo dice
 * @param {Record<string, {texto: string}>} o.narracion  las frases, en su orden
 * @param {string} o.cacheDeLaNarracion  la caché de Cedar de esas frases
 * @param {{quien: "ia"|"clienta", texto: string}[]} o.llamada  las líneas de la llamada con IA
 * @param {string} o.cacheDeLaLlamada  la caché de Cedar de la llamada
 * @param {(ahora: number) => object} [o.calendario]  el calendario de la historia; sin él, el de siempre
 * @param {Record<string, string>} [o.separadores]  los separadores de día de la conversación
 * @param {{escena: string, titulo: string, detalle: string}[]} o.capacidades  lo que se rotula, numerado en ese orden
 */
export async function elRodaje({ archivos: ARCHIVOS, trabajo, narracion, cacheDeLaNarracion, llamada, cacheDeLaLlamada, calendario, separadores, capacidades }) {
    const BASE = process.env.BASE ?? "http://localhost:3940";
    const TRABAJO = process.env.TRABAJO ?? trabajo;
    const ENSAYO = process.env.ENSAYO === "1";
    const SALIDA = ENSAYO ? TRABAJO : path.join(RAIZ, "public", "demo");
    const MEDIOS_DIR = path.join(TRABAJO, "medios");
    const CAPTURAS = path.join(TRABAJO, "ensayo");

    mkdirSync(TRABAJO, { recursive: true });
    mkdirSync(SALIDA, { recursive: true });
    if (ENSAYO) {
        rmSync(CAPTURAS, { recursive: true, force: true });
        mkdirSync(CAPTURAS, { recursive: true });
    }

    const db = new PrismaClient();
    const embudos = await import(process.env.EMBUDOS_DB);
    const ahora = Date.now();

    console.log("· archivos de la historia");
    const medios = await generarLosMedios(MEDIOS_DIR, { chromium, ahora, calendario: calendario?.(ahora) });
    const cal = medios.calendario;
    console.log("· clínica sembrada");
    const sembrado = await sembrarLaClinica({ db, embudos, ahora, calendario: cal });

    let rt = null;
    const back = elBackend({
        db,
        embudos,
        ctx: sembrado,
        base: BASE,
        segundos: medios.segundos,
        avisar: (nombre, datos) => {
            const n = rt?.emitir(nombre, datos) ?? 0;
            if (!n) {
                // Un aviso perdido no se ve como un error: se ve como un mensaje que
                // sale en el celular y no en el panel. En el vídeo final no se acepta.
                const que = `${nombre} ${datos?.message?.id ?? datos?.presence ?? ""}`;
                if (!ENSAYO) throw new Error(`[video] el aviso en vivo no le llegó a ninguna pestaña: ${que}`);
                console.warn("[video] el aviso en vivo no le llegó a ninguna pestaña:", que);
            }
        },
    });
    const porId = Object.fromEntries(back.mensajes.map((m) => [m.id, m]));

    /* -------------------------------------------------------------- */
    /* Las voces                                                       */
    /* -------------------------------------------------------------- */

    const voz = Object.fromEntries(
        Object.entries(narracion).map(([id, n]) => [id, { texto: n.texto, rotulo: n.texto, audio: acortarLasPausas(leerWav(wavDeLaCache(n.texto, cacheDeLaNarracion, VOZ_DE_VENTAS))) }]),
    );
    const frecuencia = Object.values(voz)[0].audio.frecuencia;
    // Las notas de voz de la historia son las mismas en los dos vídeos: se leen de la caché de ventas.
    const NOTAS = {
        clienta: leerWav(wavDeLaCache(NOTAS_DE_VOZ.clienta.texto, CACHE_DE_VENTAS, VOZ_DE_LA_CLIENTA)),
        ia: leerWav(wavDeLaCache(NOTAS_DE_VOZ.ia.texto, CACHE_DE_VENTAS, VOZ_DE_SOFIA)),
    };
    const AVISO = elAvisoDeMensaje(frecuencia);
    /**
     * La LLAMADA con IA: el tono de llamada saliente y sus líneas, cada una con
     * su voz y pasada «por teléfono». Lo que dura la conversación es lo que la
     * plataforma anota en la burbuja de la llamada (`segundos.llamada`).
     */
    const TONO = elTonoDeLlamada(frecuencia);
    const EN_LA_LLAMADA = llamada.map((l) => ({
        ...l,
        quien: l.quien === "ia" ? `${NEGOCIO.asistente} (IA):` : `${CLIENTA.nombreDeWhatsapp}:`,
        audio: porTelefono(acortarLasPausas(leerWav(wavDeLaCache(l.texto, cacheDeLaLlamada, LA_VOZ_EN_LA_LLAMADA[l.quien])))),
    }));
    medios.segundos.llamada = Math.round(
        (EN_LA_LLAMADA.reduce((t, l) => t + l.audio.ms, 0) + RESPIRO_EN_LA_LLAMADA_MS * (EN_LA_LLAMADA.length + 1)) / 1000,
    );

    /* -------------------------------------------------------------- */
    /* El navegador                                                    */
    /* -------------------------------------------------------------- */

    const navegador = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined, args: ["--autoplay-policy=no-user-gesture-required"] });
    const c0 = await navegador.newContext({ viewport: { width: 1440, height: 900 } });
    await entrar(c0, BASE);
    const sesion = await c0.storageState();
    await c0.close();

    const ctx = await navegador.newContext({
        viewport: { width: 1920, height: 1080 },
        deviceScaleFactor: 1,
        locale: "es-CO",
        timezoneId: ZONA,
        storageState: sesion,
    });
    // El reloj de la historia, desde que Laura escribe. Corre solo; los saltos
    // de la historia («2 horas después», «un día antes») los da `setSystemTime`.
    await ctx.clock.install({ time: new Date(cal.inicio) });
    // En las pestañas de la App: sin la «Guía rápida» de Chats, sin los botones del
    // borde (copiloto, equipo, nota) y sin los avisos de sonner, que no son de la
    // historia y taparían lo que pasa.
    await ctx.addInitScript(() => {
        if (location.pathname.startsWith("/__estudio")) return;
        try {
            localStorage.setItem("chat-onboarding-shown", "true");
        } catch {
            /* sin almacenamiento, la guía sale y se cierra con Escape */
        }
        const poner = () => {
            const s = document.createElement("style");
            s.textContent = "[data-columna-del-borde],[data-sonner-toaster]{display:none!important}";
            document.head.appendChild(s);
        };
        if (document.head) poner();
        else document.addEventListener("DOMContentLoaded", poner);
    });
    rt = await servirElTiempoReal(ctx);

    // Lo que se sirve sale de MEDIOS —el mismo sitio del que el estudio saca las
    // direcciones—, más lo que no viaja en la conversación (la portada del PDF, el
    // logo y lo que pintan las tarjetas del arranque, `MEDIOS_DEL_MONTAJE`). Con la
    // lista escrita a mano se quedó sirviendo el .mp4 viejo cuando el vídeo pasó a
    // .webm: el estudio pedía un archivo que daba 404 y el vídeo de WhatsApp Web se
    // quedaba en su portada sin decir nada.
    const servidos = Object.fromEntries(
        [...new Set([...Object.values(MEDIOS).flatMap((m) => [m.archivo, m.portada].filter(Boolean)), ...Object.values(MEDIOS_DEL_MONTAJE).map((m) => m.archivo), "lista-de-precios.jpg", "logo-sonrie.png"])].map((f) => [
            f,
            path.join(MEDIOS_DIR, f),
        ]),
    );
    for (const [f, ruta] of Object.entries(servidos)) {
        try {
            statSync(ruta);
        } catch {
            throw new Error(`[video] falta un archivo que el estudio sirve: ${f}`);
        }
    }
    servidos["verzay.png"] = path.join(RAIZ, "public", "icon-512.png");
    servidos["inter-latin.woff2"] = path.join(RAIZ, "scripts", "video-de-ventas", "fuentes", "inter-latin.woff2");

    const horaDe = (msAntes) => laHora(cal.inicio - msAntes);
    const datos = {
        zona: ZONA,
        clienta: { nombre: CLIENTA.nombre, nombreCorto: CLIENTA.nombreDeWhatsapp, iniciales: lasIniciales(CLIENTA.nombreDeWhatsapp), color: "#d9774f" },
        otros: OTROS_CHATS.map((c, i) => ({ id: `o${i}`, nombre: c.nombre, iniciales: lasIniciales(c.nombre), hora: horaDe(c.hace * 60_000), prev: c.ultimo.texto, yo: c.ultimo.de === "ia" })),
        montaje: losNegociosDelMontaje(NEGOCIOS_DEL_ARRANQUE, { hora: laHora(cal.inicio) }),
        diasDeLaHoja: losDiasDeLaHoja(cal.inicio),
        logo: "/__estudio/medios/verzay.png",
        logoNegocio: "/__estudio/medios/logo-sonrie.png",
        portadaDoc: "/__estudio/medios/lista-de-precios.jpg",
        web: LLAMADO.web,
    };
    await servirElEstudio(ctx, { pagina: () => laPaginaDelEstudio(datos), archivos: servidos });

    const p = await ctx.newPage();
    p.on("pageerror", (e) => console.warn("[video] error en la página:", e.message));
    // Lo que el estudio dice que no pudo pintar (un vídeo que no carga) se cuenta:
    // en la grabación de verdad es un fallo, no un aviso que se pierde en el registro.
    const fallosDelEstudio = [];
    p.on("console", (m) => {
        if (!m.text().startsWith("[estudio]")) return;
        console.warn(m.text());
        fallosDelEstudio.push(m.text());
    });
    // Cuándo pidió la lista su bandeja por última vez (ver `VENTANA_DE_LA_LISTA`).
    const pedidasDeLaLista = [];
    /** El instante en que empieza la grabación: el cero de todo lo que suena. */
    let t0 = 0;
    let grabadora = null;
    p.on("request", (r) => {
        if (!r.url().includes("/api/chats/lista")) return;
        pedidasDeLaLista.push(Date.now());
        if (ENSAYO && t0) console.log(`  · lista pedida a los ${((Date.now() - t0) / 1000).toFixed(1)} s desde ${new URL(r.frame().url()).pathname}`);
    });

    /* -------------------------------------------------------------- */
    /* Las piezas del guion                                            */
    /* -------------------------------------------------------------- */

    /** Llama a una función del estudio: `est("tel.abrir")`, `est("plano", PLANOS.tres)`. */
    const est = (nombre, ...args) =>
        p.evaluate(
            ([n, a]) => {
                const partes = n.split(".");
                let o = window.__estudio;
                for (const k of partes.slice(0, -1)) o = o[k];
                return o[partes.at(-1)](...a);
            },
            [nombre, args],
        );

    const laCapa = async (id) => {
        const f = await (await p.$(`#${id}`)).contentFrame();
        if (!f) throw new Error(`[video] la capa ${id} del portátil no tiene página`);
        return f;
    };

    /** La caja de algo de una pestaña del portátil, en el CUADRO (lo que se graba). */
    async function enElCuadro(id, buscar, arg) {
        const f = await laCapa(id);
        const r = await f.evaluate(buscar, arg);
        if (!r) return null;
        const i = await p.evaluate((id) => {
            const b = document.getElementById(id).getBoundingClientRect();
            return { x: b.x, y: b.y, w: b.width };
        }, id);
        const s = i.w / PORTATIL.pantalla.ancho;
        return { x: i.x + r.x * s, y: i.y + r.y * s, w: r.w * s, h: r.h * s };
    }

    /** Espera a que algo exista en una pestaña del portátil; si no llega, el vídeo no sirve. */
    async function esperarEn(id, buscar, arg, { ms = 15_000, que } = {}) {
        const f = await laCapa(id);
        const hasta = Date.now() + ms;
        for (;;) {
            const r = await f.evaluate(buscar, arg).catch(() => null);
            if (r) return r;
            if (Date.now() > hasta) {
                if (ENSAYO) {
                    await p.screenshot({ path: path.join(CAPTURAS, "fallo.png") }).catch(() => {});
                    const ficha = await f.evaluate(() => [...document.querySelectorAll("[data-ficha-de-contacto] label")].map((l) => `${l.textContent.trim()}=${l.parentElement?.querySelector("input,textarea")?.value ?? ""}`)).catch(() => []);
                    console.log("  · la ficha tenía:", ficha);
                }
                throw new Error(`[video] no apareció en ${id}: ${que ?? buscar.toString().slice(0, 80)}`);
            }
            await espera(p, 150);
        }
    }

    /** El cursor del estudio va a una caja del cuadro y pulsa. */
    async function pulsarEn(c, { ms = 650, antes } = {}) {
        await est("cursor.forma", "flecha");
        await est("cursor.mover", c.x + c.w / 2, c.y + c.h / 2, ms);
        await espera(p, ms + 60);
        await est("cursor.forma", "mano");
        await espera(p, 120);
        await est("cursor.clic");
        if (antes) await antes();
        await espera(p, 160);
    }

    /** Pulsa algo dentro de una pestaña del portátil (el cursor ya enseñó dónde). */
    async function clicEn(id, selector, texto) {
        const f = await laCapa(id);
        const ok = await f.evaluate(
            ([sel, txt]) => {
                const e = [...document.querySelectorAll(sel)].find((x) => x.offsetParent && (!txt || x.textContent.includes(txt)));
                e?.click();
                return !!e;
            },
            [selector, texto],
        );
        if (!ok) throw new Error(`[video] no hay nada que pulsar en ${id}: ${selector} ${texto ?? ""}`);
    }

    /** El reloj del navegador (el de la historia). */
    const ahoraEnLaPagina = () => p.evaluate(() => Date.now());

    const sonidos = [];
    const sonar = (clase, audio, texto) => sonidos.push({ clase, audio, texto, inicioMs: Date.now() - t0 });

    /** Llega un mensaje de la historia: a las dos pantallas dibujadas y a la base. */
    async function llega(id, { banner = false } = {}) {
        const m = porId[id];
        if (!m) throw new Error(`[video] la historia no tiene ${id}`);
        // El reloj del navegador va a la hora del mensaje si se había quedado atrás:
        // entre dos mensajes de la historia pasan minutos y en el vídeo segundos, y
        // sin esto el embudo decía «hace -3 min» de algo que acababa de pasar.
        if (m.en > (await ahoraEnLaPagina())) await ctx.clock.setSystemTime(new Date(m.en));
        const vista = elMensajeDelEstudio(m, { segundos: medios.segundos, ...(separadores ? { separadores } : {}) });
        await est("llega", vista);
        if (banner) await est("tel.banner", vista);
        if (m.de === "cliente") sonar("aviso", AVISO, `aviso ${id}`);
        await back.llega(id);
        return m;
    }

    /** «escribiendo…» o «grabando audio…» en las tres pantallas; `null` lo apaga. */
    async function presencia(tipo) {
        await est("escribiendo", tipo);
        rt.emitir("chat:presence", laPresencia(tipo ?? "nada", await ahoraEnLaPagina()));
    }

    /** Suena una nota de voz (el trozo de `CORTES_DE_LAS_NOTAS`) y su burbuja avanza. */
    async function reproducirNota(id, cual) {
        const corte = CORTES_DE_LAS_NOTAS[cual];
        const audio = recortarAudio(NOTAS[cual], corte);
        const dura = corte.hastaMs - corte.desdeMs;
        await est("reproducirNota", id, dura, corte.hastaMs / NOTAS[cual].ms);
        sonar("nota", audio, `nota ${cual}`);
        return dura;
    }

    /** Los anillos del cuadro, cada uno con su rótulo. */
    const anillos = (lista) => est("anillos", lista.filter(Boolean).map((a) => ({ ...a.c, texto: a.texto, abajo: a.abajo, pad: a.pad })));

    let escena = 0;
    async function captura(nombre) {
        if (!ENSAYO) return;
        escena += 1;
        await p.screenshot({ path: path.join(CAPTURAS, `${String(escena).padStart(2, "0")}-${nombre}.png`) });
    }

    /**
     * Antes del primer mensaje de Laura: si la lista se pidió hace muy poco, se
     * espera a que la memoria del servidor no le devuelva la foto de antes (ver
     * `VENTANA_DE_LA_LISTA`).
     */
    async function esperarALaLista() {
        const desdeLaUltima = Date.now() - (pedidasDeLaLista.at(-1) ?? 0);
        if (desdeLaUltima < VENTANA_DE_LA_LISTA.desde) {
            const falta = VENTANA_DE_LA_LISTA.desde - desdeLaUltima;
            console.log(`  · el primer mensaje espera ${falta} ms a la lista`);
            if (falta < 7_000) await espera(p, falta);
        }
    }

    /**
     * Se miden dos vueltas seguidas de la lista (sin grabar) y se arranca para
     * que el primer mensaje —que cae `hastaElPrimerMensaje` después de empezar a
     * grabar— caiga en la mitad de la ventana de una vuelta.
     */
    async function alinearConLaLista(hastaElPrimerMensaje) {
        const unaPedidaDespuesDe = async (t) => {
            for (let i = 0; i < 600 && !(pedidasDeLaLista.at(-1) > t); i += 1) await espera(p, 100);
            if (!(pedidasDeLaLista.at(-1) > t)) throw new Error("[video] la lista del panel no se pide sola");
            return pedidasDeLaLista.at(-1);
        };
        const l1 = await unaPedidaDespuesDe(Date.now());
        const l2 = await unaPedidaDespuesDe(l1 + 1_000);
        const ciclo = l2 - l1;
        const mitad = (VENTANA_DE_LA_LISTA.desde + ciclo - VENTANA_DE_LA_LISTA.margenAntesDeLaSiguiente) / 2;
        let llegada = l2 + mitad;
        while (llegada - hastaElPrimerMensaje < Date.now() + 200) llegada += ciclo;
        const esperar = Math.round(llegada - hastaElPrimerMensaje - Date.now());
        console.log(`· la lista va cada ${ciclo} ms; se arranca en ${esperar} ms`);
        await espera(p, esperar);
    }

    /* -------------------------------------------------------------- */
    /* La narración                                                    */
    /* -------------------------------------------------------------- */

    const tramos = [];
    let calla = 0;
    let frase = null;
    /** Empieza la grabación: desde aquí cuenta todo lo que suena. */
    const empezar = (g) => {
        grabadora = g;
        t0 = Date.now();
        grabadora.empezarEn(t0);
    };
    const desdeElInicio = () => Date.now() - t0;
    const callar = async (respiro = RESPIRO_ENTRE_FRASES_MS) => {
        const falta = calla + respiro - Date.now();
        if (calla && falta > 0) await espera(p, falta);
        calla = 0;
    };
    const decir = async (id) => {
        await callar();
        const n = voz[id];
        await est("subtitulo", n.rotulo);
        const ya = Date.now();
        tramos.push({ clase: "narracion", texto: n.texto, audio: n.audio, inicioMs: ya - t0, id });
        frase = { texto: n.texto, inicio: ya, ms: n.audio.ms };
        calla = ya + n.audio.ms;
    };
    /** Espera a que la frase llegue a `fragmento` (se estima por su posición en el texto). */
    const alDecir = async (fragmento, adelanto = 250) => {
        const i = frase ? frase.texto.indexOf(fragmento) : -1;
        if (i < 0) throw new Error(`[video] «${fragmento}» no está en la frase que suena: ${frase?.texto}`);
        const falta = frase.inicio + (frase.ms * i) / frase.texto.length - adelanto - Date.now();
        if (falta > 0) await espera(p, falta);
    };
    /** Espera a que termine la frase y quita el subtítulo. */
    const acabar = async (respiro = 0) => {
        await callar(respiro);
        await est("subtitulo", "");
    };
    const capacidad = async (escena2) => {
        const i = capacidades.findIndex((c) => c.escena === escena2);
        if (i < 0) throw new Error(`[video] la capacidad «${escena2}» no está en la lista del vídeo`);
        await est("capacidad", i + 1, capacidades[i].titulo, capacidades[i].detalle);
    };

    /* -------------------------------------------------------------- */
    /* El final: la banda sonora y el MP4                              */
    /* -------------------------------------------------------------- */

    /**
     * Para la grabación, mezcla lo que sonó y publica el vídeo, su portada (el
     * fotograma de `portadaMs`) y lo que el banco mide de él (`extra` va dentro).
     */
    async function terminar({ portadaMs, extra = {} }) {
        const totalMs = Date.now() - t0;
        const grabado = await grabadora.parar();
        if (fallosDelEstudio.length && !ENSAYO) throw new Error(`[video] el estudio no pudo pintar: ${fallosDelEstudio.join(" | ")}`);
        console.log(`· grabados ${grabado.fotogramas} fotogramas (${(grabado.fotogramas / 25).toFixed(1)} s) de ${grabado.recibidos} pintados, en ${(totalMs / 1000).toFixed(1)} s`);
        await ctx.close();
        await navegador.close();
        await db.$disconnect();

        const todo = [...tramos, ...sonidos].sort((a, b) => a.inicioMs - b.inicioMs);
        const choques = sePisanLasVoces(todo);
        if (choques.length) throw new Error(`[video] se pisan las voces: ${JSON.stringify(choques)}`);
        const { wav, colocados } = mezclarLaBanda(todo, totalMs);
        const banda = path.join(TRABAJO, "banda.wav");
        writeFileSync(banda, wav);

        const destino = path.join(SALIDA, ARCHIVOS.video);
        execFileSync(
            "ffmpeg",
            [
                "-y", "-loglevel", "error",
                "-i", mudo, "-i", banda,
                "-map", "0:v:0", "-map", "1:a:0",
                "-c:v", "libx264", "-preset", "slow", "-crf", "20", "-pix_fmt", "yuv420p", "-r", "25", "-profile:v", "high", "-movflags", "+faststart",
                "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-c:a", "aac", "-b:a", "160k", "-ar", "48000",
                "-shortest", destino,
            ],
            { stdio: "inherit" },
        );
        execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-ss", (portadaMs / 1000).toFixed(2), "-i", destino, "-frames:v", "1", "-q:v", "3", path.join(SALIDA, ARCHIVOS.portada)]);

        const frases = Object.fromEntries(Object.entries(narracion).map(([id, n]) => [id, llaveDeLaFrase(n.texto, VOZ_DE_VENTAS)]));
        writeFileSync(
            path.join(SALIDA, ARCHIVOS.datos),
            JSON.stringify(
                {
                    voz: VOZ_DE_VENTAS.voz,
                    modelo: VOZ_DE_VENTAS.modelo,
                    frases,
                    duracionMs: totalMs,
                    ...extra,
                    // Dónde suena cada cosa EN EL VÍDEO: el banco lo compara con el audio.
                    colocados: colocados.map((c) => ({ clase: c.clase, texto: c.texto, inicioMs: c.inicioMs, finMs: c.finMs })),
                },
                null,
                2,
            ) + "\n",
        );
        copyFileSync(banda, path.join(TRABAJO, "banda-publicada.wav"));
        console.log(`✓ ${destino} · ${Math.round(statSync(destino).size / 1024)} KB · ${(totalMs / 1000).toFixed(1)} s`);
        return totalMs;
    }

    /* -------------------------------------------------------------- */
    /* Antes de grabar: el estudio y las pestañas del panel            */
    /* -------------------------------------------------------------- */

    await p.goto(`${BASE}/__estudio/estudio.html`, { waitUntil: "load" });
    await p.waitForFunction(() => window.__estudio?.listo);
    await p.evaluate(() => document.fonts.ready);

    for (const capa of CAPAS_DEL_PORTATIL) {
        await p.evaluate(([id, ruta]) => {
            document.getElementById(id).src = ruta;
        }, [capa.id, capa.ruta]);
    }
    // Chats: la lista, conectada al tiempo real y sin nada encima.
    await esperarEn("app", () => document.querySelectorAll("[data-chat-id]").length >= 3, null, { ms: 60_000, que: "la lista de chats" });
    for (let i = 0; i < 60 && rt.conectadas() < 1; i += 1) await espera(p, 500);
    if (rt.conectadas() < 1) throw new Error("[video] el panel no se conectó al tiempo real");
    // La agenda, en la semana de la cita.
    await esperarEn("agenda", () => !!document.querySelector(".fc-semanaBtn-button"), null, { ms: 60_000, que: "la agenda" });
    await clicEn("agenda", ".fc-semanaBtn-button");
    // El embudo, con sus columnas.
    // Por `textContent` y no `innerText`: las columnas van en mayúsculas por CSS,
    // e `innerText` devuelve el texto ya transformado.
    await esperarEn("embudo", () => document.body.textContent.includes("Cita confirmada"), null, { ms: 60_000, que: "el embudo" });
    // Los reportes, con el de la semana pasada.
    await esperarEn("reportes", () => !!document.querySelector("div.cursor-pointer"), null, { ms: 60_000, que: "los reportes" });
    for (const capa of CAPAS_DEL_PORTATIL) {
        const f = await laCapa(capa.id);
        for (let i = 0; i < 3; i += 1) {
            if (!(await f.$('[role="dialog"]'))) break;
            await f.press("body", "Escape");
            await espera(p, 300);
        }
    }
    await espera(p, 1500);

    const mudo = path.join(TRABAJO, "pantalla.mkv");

    return {
        ENSAYO,
        p,
        ctx,
        cal,
        sembrado,
        medios,
        voz,
        TONO,
        EN_LA_LLAMADA,
        mudo,
        est,
        laCapa,
        enElCuadro,
        esperarEn,
        pulsarEn,
        clicEn,
        ahoraEnLaPagina,
        sonar,
        llega,
        presencia,
        reproducirNota,
        anillos,
        captura,
        esperarALaLista,
        alinearConLaLista,
        empezar,
        desdeElInicio,
        callar,
        decir,
        alDecir,
        acabar,
        capacidad,
        terminar,
    };
}
