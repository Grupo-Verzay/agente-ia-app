/**
 * Toma las CAPTURAS y graba el VÍDEO de la guía pública de Chats, sobre la App
 * servida de verdad (`next start`, sesión real, datos de
 * `sembrar-guia-chats.mjs`).
 *
 * La MISMA receta que la guía de Leads y con las MISMAS piezas del taller
 * (`taller-de-la-guia.mjs`): cada captura es «abre esto, pulsa aquello,
 * resalta este elemento», y las marcas se localizan por lo que la pantalla ya
 * expone —los `data-*` de la columna y de la cabecera, los `aria-label` de los
 * botones—, no por coordenadas.
 *
 * Lo que NO puede pedirle a nadie de verdad lo contestan dos dobles: el
 * servidor de llamadas y las plantillas de Meta (`fingido-guia-chats.mjs`,
 * dentro de `next start`), y en el navegador una respuesta de audio de mentira
 * (`ATAJO_DE_LA_LLAMADA`): la tarjeta de la llamada es la de verdad, pero
 * nadie la recibe. Los archivos de los mensajes los sirve
 * `medios-guia-chats.mjs`.
 *
 * NADA SE ENVÍA: se escribe en la caja y se borra, «Resolver» y la respuesta
 * sugerida se señalan sin pulsar. Las capturas sí cambian cosas (una etapa, la
 * llamada que queda anotada), así que antes del vídeo se vuelve a sembrar.
 *
 * Se lanza con `scripts/generar-guia-chats.sh`.
 */
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

import { CURSOR } from "./cursor-de-la-guia.mjs";
import { grabar } from "./grabadora-de-la-guia.mjs";
import { servirLosMedios } from "./medios-guia-chats.mjs";
import { NARRACION, comoSeDice } from "./narracion-guia-chats.mjs";
import { guardarWav, loQueSeCorta, mezclar, montarLaPista, tramosSinLosCortes } from "./voz-de-la-guia.mjs";
import {
    LA_BARRA_DE_ARRIBA,
    caja,
    cerrarLoAbierto,
    comprobarLasCapturas,
    crearGuardar,
    dentro,
    desmarcar,
    dondeAcabaElMenu,
    elMarcoDeLaPantalla,
    elMenuLateral,
    empezarLaNarracion,
    entrar,
    escribirLaVozDelVideo,
    esconderLosBotonesDelBorde,
    espera,
    holgura,
    lasPartesDeArriba,
    loQuePintaElMenu,
    marcar,
    mover,
    prepararLaVoz,
    pulsar,
    quitarAvisos,
    rotulo,
    tomarUnaMiniatura,
    unir,
} from "./taller-de-la-guia.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const BASE = process.env.BASE ?? "http://localhost:3940";
const RAIZ = path.resolve(import.meta.dirname, "..");
const SALIDA = path.join(RAIZ, "public", "guia", "chats");
const TMP = process.env.TMP_GUIA ?? "/tmp/guia-chats";
const SIN_VIDEO = process.env.SIN_VIDEO === "1";
const SOLO_MINIATURAS = process.env.SOLO_MINIATURAS === "1";
const SOLO_VIDEO = process.env.SOLO_VIDEO === "1";
/** Dónde quedó el recuadro dentro de cada miniatura: lo lee el banco para medir el enfoque. */
const FOCOS = path.join(RAIZ, "scripts", "miniaturas-guia-chats.json");
/** Lo que pinta el menú recogido en las capturas: lo lee el banco. */
const MENU = path.join(RAIZ, "scripts", "menu-guia-chats.json");

mkdirSync(SALIDA, { recursive: true });
mkdirSync(TMP, { recursive: true });

const tomadas = new Set();
const guardar = crearGuardar({ salida: SALIDA, tomadas });

/**
 * Lo que va en el navegador ANTES de la App: la «Guía rápida» de Chats ya
 * vista, la bandeja leída hasta hace veinte minutos (así «Sin leer» cuenta las
 * dos que tienen mensajes nuevos de verdad) y la respuesta de audio de la
 * llamada: el servidor de llamadas fingido contesta `GUIA`, y aquí esa
 * respuesta se acepta y se le pone audio entrando a los dos segundos y medio,
 * que es lo que la tarjeta mira para dar la llamada por contestada.
 */
const ATAJO_DE_LA_LLAMADA = () => {
    try {
        localStorage.setItem("chat-onboarding-shown", "1");
        if (!localStorage.getItem("chatsLeidosHasta"))
            localStorage.setItem("chatsLeidosHasta", JSON.stringify([["VENTAS", Date.now() - 20 * 60000], ["OFICIAL", Date.now() - 20 * 60000]]));
    } catch {
        /* sin almacenamiento, se aparta a mano */
    }
    const P = RTCPeerConnection.prototype;
    const srd = P.setRemoteDescription;
    const gs = P.getStats;
    P.setRemoteDescription = function (d) {
        if (d && d.sdp === "GUIA") {
            this.__guia = Date.now();
            return Promise.resolve();
        }
        return srd.apply(this, arguments);
    };
    P.getStats = function () {
        if (!this.__guia) return gs.apply(this, arguments);
        // `__guiaColgo`: el cliente «cuelga» y el audio deja de llegar, que es
        // como la tarjeta se entera de que la llamada se acabó.
        const t = (window.__guiaColgo ?? Date.now()) - this.__guia;
        const m = new Map();
        m.set("in", { type: "inbound-rtp", kind: "audio", bytesReceived: t > 2500 ? Math.floor(t * 8) : 0 });
        return Promise.resolve(m);
    };
};

const ARGS_DEL_NAVEGADOR = ["--lang=es-CO", "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"];

async function prepararElContexto(ctx) {
    await ctx.addInitScript(ATAJO_DE_LA_LLAMADA);
    await servirLosMedios(ctx);
}

/* ------------------------------------------------------------------ */
/* Dónde está cada cosa                                                 */
/* ------------------------------------------------------------------ */

const LA_COLUMNA = "[data-columna-de-chats]";
const LA_CABECERA_DE_LA_COLUMNA = "[data-cabecera-de-la-columna]";
const LA_CABECERA = "[data-cabecera-de-chat]";
const EL_HILO = "[data-hilo-de-chat]";
const LA_BARRA_DE_ESCRIBIR = '[data-barra="escribir"]';
const LA_CAJA_DE_ESCRIBIR = 'textarea[aria-label="Escribe tu mensaje"]';
const EL_MENU = '[role="menu"]';

/** Lo que SE VE: la cabecera de Chats pinta sus mandos dos veces (móvil y escritorio). */
const visible = (p, sel) => p.locator(sel).locator("visible=true").first();
const porNombre = (dentroDe, e) => `${dentroDe} [aria-label="${e}"], ${dentroDe} [title="${e}"]`;
const enLaCabecera = (p, etiqueta) => visible(p, porNombre(LA_CABECERA, etiqueta));
const enLaBarra = (p, etiqueta) => visible(p, porNombre(LA_BARRA_DE_ESCRIBIR, etiqueta));

const laFila = (p, nombre) => p.locator(`${LA_COLUMNA} [data-chat-id]`).filter({ hasText: nombre }).first();
const lasFilas = (p) => p.locator(`${LA_COLUMNA} [data-chat-id]`);
/** La fila son dos botones: la foto (marca la conversación) y el resto (la abre). */
const suFoto = (fila) => fila.locator("button").first();
const suCuerpo = (fila) => fila.locator("button").nth(1);
const susPuntos = (fila) => fila.locator('[title="Más opciones del chat"], [aria-label="Más opciones del chat"]').first();
const unMensaje = (p, texto) => p.locator(`${EL_HILO} [data-message-id]`).filter({ hasText: texto }).last();
const laPastilla = (p, clave) => p.locator(`[data-pastilla-de-filtro="${clave}"]`).first();

/** La conversación de ejemplo con de todo: foto, IA, notas de voz, el catálogo y una reacción. */
const LA_COMPLETA = "Mariana Toro";

/** Las rectas de los tres iconos de filtro de la columna (el embudo, asesores y grupos). */
async function losFiltrosDeLaColumna(p) {
    const r = await p.evaluate((sel) => {
        const fila = document.querySelector(sel)?.firstElementChild;
        if (!fila) return null;
        const input = fila.querySelector("input");
        const xi = input ? input.getBoundingClientRect().right : 0;
        const bs = [...fila.querySelectorAll("button")].filter((b) => {
            const c = b.getBoundingClientRect();
            return c.width > 0 && c.left >= xi - 1;
        });
        if (!bs.length) return null;
        const cs = bs.map((b) => b.getBoundingClientRect());
        const x = Math.min(...cs.map((c) => c.left));
        const y = Math.min(...cs.map((c) => c.top));
        return { x, y, w: Math.max(...cs.map((c) => c.right)) - x, h: Math.max(...cs.map((c) => c.bottom)) - y };
    }, LA_CABECERA_DE_LA_COLUMNA);
    if (!r) throw new Error("[guia] no se encontraron los filtros de la columna");
    return r;
}

async function lasPastillas(p) {
    const cs = [];
    for (const k of ["mine", "all", "sinLeer", "enEspera"]) {
        const l = laPastilla(p, k);
        if (await l.count()) cs.push(await caja(p, l));
    }
    if (!cs.length) return caja(p, `${LA_CABECERA_DE_LA_COLUMNA} > div:nth-child(2)`);
    return unir(...cs);
}

/** «Sin leer» se enciende solo al entrar si hay mensajes nuevos: se apaga para ver todas. */
async function todas(p) {
    const s = p.locator('[data-pastilla-de-filtro="sinLeer"][aria-pressed="true"]');
    if (await s.count()) {
        await s.first().click();
        await espera(p, 900);
    }
}

async function abrirChats(p) {
    await p.goto(`${BASE}/chats`, { waitUntil: "domcontentloaded" });
    await p.waitForSelector(`${LA_COLUMNA} [data-chat-id]`, { timeout: 90000 });
    await p.evaluate(() => document.fonts.ready);
    await espera(p, 3000);
    await apartarLoQueTapa(p);
    await esconderLosBotonesDelBorde(p);
    await todas(p);
}

async function abrirLaConversacion(p, nombre) {
    await todas(p);
    // Recién abierta, una vuelta del reloj puede pintar el hilo vacío un
    // momento: se comprueba que los mensajes SIGUEN ahí y, si no, se reabre.
    for (let i = 0; ; i += 1) {
        await suCuerpo(laFila(p, nombre)).click();
        await p.locator(`${EL_HILO} [data-message-id]`).first().waitFor({ state: "visible", timeout: 60000 });
        await p.getByText("Cargando mensajes…").waitFor({ state: "hidden", timeout: 60000 }).catch(() => {});
        await espera(p, 2500);
        if ((await p.locator(`${EL_HILO} [data-message-id]`).count()) > 0) break;
        if (i >= 3) throw new Error(`[guia] la conversación de ${nombre} se queda vacía`);
        console.warn(`[guia] la conversación de ${nombre} salió vacía; se reabre`);
        await espera(p, 3000);
    }
    await p.mouse.move(700, 880);
}

/** El hilo, bajado del todo: lo último que pasó es lo que se ve. */
async function alFinalDelHilo(p) {
    await p.locator(EL_HILO).evaluate((el) => {
        el.scrollTop = el.scrollHeight;
    });
    await espera(p, 700);
}

/** Abre un menú o un panel y devuelve lo que se abrió. */
async function abrirMenu(p, disparador, que = `${EL_MENU}, [role="dialog"], [data-radix-popper-content-wrapper]`) {
    await disparador.click();
    const m = p.locator(que).locator("visible=true").last();
    await m.waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 600);
    return m;
}

/** Los paneles de la derecha no son diálogos: Escape no los cierra, se cierran con su X. */
async function cerrarLosPaneles(p) {
    const W = p.viewportSize().width;
    for (let i = 0; i < 3; i += 1) {
        const xs = p.locator('[data-hoja-lateral] button[aria-label^="Cerrar"]').locator("visible=true");
        let cerro = false;
        for (let k = 0; k < (await xs.count()); k += 1) {
            const c = await xs.nth(k).boundingBox();
            if (c && c.x < W && c.x > 0) {
                await xs.nth(k).click().catch(() => {});
                cerro = true;
                await espera(p, 700);
                break;
            }
        }
        if (!cerro) return;
    }
}

async function cerrarTodo(p) {
    await cerrarLosPaneles(p);
    for (let i = 0; i < 4; i += 1) {
        const abierto = await p.$(`${EL_MENU}, [role="dialog"], [role="alertdialog"], [role="listbox"], [data-radix-popper-content-wrapper]`);
        if (!abierto) break;
        await p.keyboard.press("Escape");
        await espera(p, 400);
    }
}

/** Abre los tres puntos de un mensaje. */
async function elMenuDelMensaje(p, texto) {
    const m = unMensaje(p, texto);
    // Recién abierta, la conversación se vuelve a pintar cuando llega su
    // primera vuelta del reloj: se insiste hasta que el mensaje se quede quieto.
    for (let i = 0; ; i += 1) {
        try {
            await m.scrollIntoViewIfNeeded({ timeout: 5000 });
            await m.hover({ timeout: 5000 });
            break;
        } catch (e) {
            if (i >= 5) throw e;
            await espera(p, 800);
        }
    }
    await espera(p, 400);
    const cMensaje = await caja(p, m);
    const menu = await abrirMenu(p, m.getByRole("button", { name: "Más opciones" }).first(), EL_MENU);
    return { cMensaje, menu };
}

/** Un panel lateral de la derecha (recordatorio, tarea, contexto, ficha): lo que se abrió. */
async function elPanelDeLaDerecha(p) {
    const vista = p.viewportSize();
    const r = await p.evaluate((W) => {
        const hojas = [...document.querySelectorAll("[data-hoja-lateral], [data-ficha-de-contacto]")]
            .map((h) => h.getBoundingClientRect())
            .filter((c) => c.width > 0 && c.right > W - 24 && c.left < W - 50);
        if (!hojas.length) return null;
        const c = hojas.sort((a, b) => b.width - a.width)[0];
        return { x: c.left, y: c.top, w: c.width, h: c.height };
    }, vista.width);
    if (!r) throw new Error("[guia] no se abrió el panel de la derecha");
    return r;
}

/** La parte de arriba de un panel de alto entero: la que cabe en una miniatura 16:9 con su aire. */
const laParteDeArriba = (c, vista) => {
    // Pegado al borde de la ventana: se deja aire a la derecha, o el recuadro se corta.
    const w = Math.min(c.w, vista.width - 8 - c.x);
    return { ...c, w, h: Math.min(c.h, Math.round(w * 1.1)) };
};

async function esperarElPanel(p) {
    for (let i = 0; i < 30; i += 1) {
        try {
            return await elPanelDeLaDerecha(p);
        } catch {
            await espera(p, 300);
        }
    }
    return elPanelDeLaDerecha(p);
}

/** La «Guía rápida» de Chats se abre sola la primera vez, con un velo encima. */
async function apartarLoQueTapa(p) {
    for (let i = 0; i < 8; i += 1) {
        if (!(await p.$('div[data-state="open"].fixed.inset-0'))) return;
        const cerrar = p.locator('[role="dialog"] button:has-text("Close")').first();
        if (await cerrar.count()) await cerrar.click({ force: true }).catch(() => {});
        else await p.keyboard.press("Escape");
        await espera(p, 400);
    }
}

/* ------------------------------------------------------------------ */
/* Las miniaturas del índice                                           */
/* ------------------------------------------------------------------ */

async function miniaturas(p) {
    const focos = {};
    const mini = async (slug, zonaDe, despues) => {
        Object.assign(focos, await tomarUnaMiniatura(p, slug, await zonaDe(), { salida: SALIDA, tomadas }));
        await cerrarLoAbierto(p);
        await cerrarTodo(p);
        if (despues) await despues();
    };
    await abrirLaConversacion(p, LA_COMPLETA);
    await alFinalDelHilo(p);
    // La zona tiene que caber en la miniatura con su aire: una zona de alto
    // entero se saldría por arriba y por abajo. Se enseña la parte de arriba.
    await mini("vista-general", async () => unir(await caja(p, LA_CABECERA_DE_LA_COLUMNA), await caja(p, lasFilas(p).nth(2)), await caja(p, LA_CABECERA)));
    await mini("lista", async () => unir(await caja(p, LA_CABECERA_DE_LA_COLUMNA), await caja(p, lasFilas(p).nth(2))));
    await mini(
        "seleccion",
        async () => {
            await suFoto(laFila(p, "Camila Rojas")).click();
            await espera(p, 400);
            await suFoto(laFila(p, "Jorge Méndez")).click();
            await espera(p, 900);
            return unir(await caja(p, LA_CABECERA_DE_LA_COLUMNA), await caja(p, laFila(p, "Jorge Méndez")));
        },
        async () => {
            await visible(p, '[title="Quitar selección"], [aria-label="Quitar selección"]').click();
            await espera(p, 700);
        },
    );
    await mini("cabecera", async () => caja(p, visible(p, `${LA_CABECERA} > div`)));
    await mini("agenda", async () => {
        await enLaCabecera(p, "Crear recordatorio para este lead").click();
        return laParteDeArriba(await esperarElPanel(p), p.viewportSize());
    });
    await mini("embudo", async () => {
        const b = enLaCabecera(p, "Etapa del embudo");
        const cb = await caja(p, b);
        const m = await abrirMenu(p, b);
        return unir(cb, await caja(p, m));
    });
    await mini("acciones", async () => {
        const b = visible(p, `${LA_CABECERA} button:has-text("Acciones")`);
        const cb = await caja(p, b);
        const m = await abrirMenu(p, b, EL_MENU);
        return unir(cb, await caja(p, m));
    });
    await mini("mensajes", async () => {
        const { cMensaje, menu } = await elMenuDelMensaje(p, "me encantan los blancos");
        return unir(cMensaje, await caja(p, menu));
    });
    await mini("escribir", () => caja(p, visible(p, LA_BARRA_DE_ESCRIBIR)));
    await mini("mas-de-la-barra", async () => unir(await caja(p, visible(p, `${LA_BARRA_DE_ESCRIBIR} [role="switch"]`)), await caja(p, enLaBarra(p, "Generar respuesta sugerida con IA"))));
    await mini("ficha", async () => {
        await enLaCabecera(p, "Ver ficha del contacto").click();
        await espera(p, 1500);
        return laParteDeArriba(await esperarElPanel(p), p.viewportSize());
    }, async () => {
        await cerrarLaFicha(p);
    });
    await mini("llamada", async () => {
        const b = enLaCabecera(p, "Llamar");
        const cb = await caja(p, b);
        const m = await abrirMenu(p, b, EL_MENU);
        return unir(cb, await caja(p, m));
    });
    await desmarcar(p);
    writeFileSync(FOCOS, JSON.stringify(focos, null, 2) + "\n");
}

async function cerrarLaFicha(p) {
    const cerrar = p.locator('[title="Cerrar ficha del contacto"], [aria-label="Cerrar ficha de contacto"]').locator("visible=true").first();
    if (await cerrar.count()) await cerrar.click().catch(() => {});
    else await enLaCabecera(p, "Ver ficha del contacto").click().catch(() => {});
    await espera(p, 900);
}

/* ------------------------------------------------------------------ */
/* Las recetas                                                         */
/* ------------------------------------------------------------------ */

async function capturas(p) {
    const vista = p.viewportSize();
    await abrirChats(p);
    await abrirLaConversacion(p, LA_COMPLETA);
    await alFinalDelHilo(p);

    await guardar(p, "portada.webp");

    // 1. La pantalla de un vistazo: las cuatro zonas de `ZONAS_DE_LA_PANTALLA`.
    const cMenuLateral = await caja(p, elMenuLateral(p));
    const cBarraDeArriba = await caja(p, LA_BARRA_DE_ARRIBA);
    const bajoElMenu = await dondeAcabaElMenu(p);
    const cColumna = await caja(p, LA_COLUMNA);
    const cConversacion = unir(await caja(p, visible(p, LA_CABECERA)), await caja(p, visible(p, LA_BARRA_DE_ESCRIBIR)));
    await marcar(p, [
        { c: dentro(cMenuLateral, 6), n: 1, numeroEn: { x: cMenuLateral.x + cMenuLateral.w / 2, y: bajoElMenu + 34 } },
        { c: dentro(cBarraDeArriba, 6), n: 2, esquina: "centro" },
        { c: dentro(cColumna, 4), n: 3, esquina: "centro" },
        { c: dentro(cConversacion, 4), n: 4, esquina: "centro" },
    ]);
    await guardar(p, "vista-general.webp");
    await desmarcar(p);
    writeFileSync(MENU, JSON.stringify(await loQuePintaElMenu(p), null, 2) + "\n");

    // La lista: sus cinco partes.
    const cCanales = await caja(p, `${LA_COLUMNA} [data-selector-de-canal]`);
    const cBuscador = await caja(p, `${LA_COLUMNA} input`);
    const cFiltros = await losFiltrosDeLaColumna(p);
    const cPastillas = await lasPastillas(p);
    const cLista = unir(await caja(p, lasFilas(p).nth(0)), await caja(p, lasFilas(p).nth(3)));
    await marcar(p, [
        { c: cCanales, n: 1 },
        { c: cBuscador, n: 2, esquina: "derecha" },
        { c: cFiltros, n: 3, esquina: "derecha" },
        { c: cPastillas, n: 4, borde: "abajo", esquina: "derecha" },
        { c: dentro(cLista, 2), n: 5, esquina: "derecha" },
    ]);
    await guardar(p, "columna.webp", holgura(unir(cColumna, { ...cColumna, h: Math.min(cColumna.h, 560) }), 0, vista));
    await desmarcar(p);

    // La conversación abierta: sus cuatro partes.
    const cCabeceraFila1 = await caja(p, visible(p, `${LA_CABECERA} > div`));
    const cPestanas = await caja(p, visible(p, `${LA_CABECERA} [data-pestanas-del-chat]`));
    const cHilo = await caja(p, EL_HILO);
    const cBarra = await caja(p, visible(p, LA_BARRA_DE_ESCRIBIR));
    await marcar(p, [
        { c: dentro(cCabeceraFila1, 3), n: 1, esquina: "centro", borde: "abajo" },
        { c: cPestanas, n: 2, esquina: "derecha" },
        { c: dentro(cHilo, 8), n: 3, esquina: "centro" },
        { c: dentro(cBarra, 3), n: 4, esquina: "centro" },
    ]);
    await guardar(p, "conversacion.webp", holgura(unir(cCabeceraFila1, cBarra), 4, vista));
    await desmarcar(p);

    // 2. La lista y sus filtros.
    const zonaDeLaColumna = (alto = 520) => ({ x: cColumna.x, y: 0, w: Math.min(vista.width - cColumna.x, cColumna.w + 360), h: alto });
    await marcar(p, [{ c: cPastillas }]);
    await guardar(p, "lista-pastillas.webp", zonaDeLaColumna(360));
    await desmarcar(p);
    {
        const flecha = visible(p, `${LA_CABECERA_DE_LA_COLUMNA} [data-flecha-de-la-fila]`);
        const cFlecha = await caja(p, flecha);
        const m = await abrirMenu(p, flecha, EL_MENU);
        await marcar(p, [{ c: cFlecha, n: 1 }, { c: await caja(p, m), n: 2, esquina: "derecha" }], { atenuar: true });
        await guardar(p, "lista-flecha.webp", zonaDeLaColumna(560));
        await desmarcar(p);
        await cerrarTodo(p);
    }
    {
        const canal = visible(p, `${LA_COLUMNA} [data-selector-de-canal] button, ${LA_COLUMNA} [data-selector-de-canal]`);
        const m = await abrirMenu(p, canal, "[data-radix-popper-content-wrapper], [role=menu]");
        await marcar(p, [{ c: cCanales, n: 1 }, { c: await caja(p, m), n: 2, esquina: "derecha" }], { atenuar: true });
        await guardar(p, "lista-canales.webp", zonaDeLaColumna(420));
        await desmarcar(p);
        await cerrarTodo(p);
    }
    await p.locator(`${LA_COLUMNA} input`).first().fill("Jorge");
    await espera(p, 1200);
    await marcar(p, [{ c: await caja(p, `${LA_COLUMNA} input`) }, { c: await caja(p, lasFilas(p).first()), texto: "Solo lo que coincide", lado: "abajo" }]);
    await guardar(p, "lista-buscar.webp", zonaDeLaColumna(400));
    await desmarcar(p);
    await p.locator(`${LA_COLUMNA} input`).first().fill("");
    await espera(p, 1200);
    await todas(p);
    {
        const fila = laFila(p, "Valentina Ortiz");
        const cFila = await caja(p, fila);
        const nombre = await caja(p, fila.locator("[data-nombre-del-contacto]").first().or(fila.getByText("Valentina Ortiz").first()));
        const ultimo = await caja(p, fila.getByText("Claro, aquí lo tienes").first());
        const linea = await caja(p, fila.getByText("Ventas").first());
        const renglon = await caja(p, fila.locator("[data-renglon-de-pastillas]").first());
        await marcar(p, [
            { c: unir(nombre, { ...nombre, x: cFila.x + cFila.w - 120, w: 70 }), n: 1, esquina: "derecha" },
            { c: ultimo, n: 2, borde: "abajo", esquina: "derecha" },
            { c: linea, n: 3, esquina: "derecha" },
            { c: renglon, n: 4, borde: "abajo", esquina: "derecha" },
        ]);
        await guardar(p, "lista-fila.webp", holgura({ ...cFila, w: cFila.w + 40 }, 40, vista));
        await desmarcar(p);
        const puntos = susPuntos(fila);
        await fila.hover();
        const cPuntos = await caja(p, puntos);
        const m = await abrirMenu(p, puntos, EL_MENU);
        const cMenu = await caja(p, m);
        await marcar(p, [{ c: cPuntos, n: 1 }, { c: cMenu, n: 2, esquina: "derecha" }], { atenuar: true });
        await guardar(p, "lista-menu.webp", holgura(unir(cMenu, cPuntos, { ...cFila, x: cColumna.x }), 30, vista));
        await desmarcar(p);
        await cerrarTodo(p);
    }

    // 3. Varias a la vez: la foto, la barra y todas.
    await suFoto(laFila(p, "Camila Rojas")).click();
    await espera(p, 500);
    await marcar(p, [{ c: await caja(p, suFoto(laFila(p, "Camila Rojas"))), texto: "Marcada", lado: "derecha" }]);
    await guardar(p, "seleccion-marcar.webp", zonaDeLaColumna(420));
    await desmarcar(p);
    await suFoto(laFila(p, "Jorge Méndez")).click();
    await suFoto(laFila(p, "John Miller")).click();
    await espera(p, 900);
    const cCabeceraConSeleccion = await caja(p, LA_CABECERA_DE_LA_COLUMNA);
    await marcar(p, [{ c: dentro(cCabeceraConSeleccion, 2) }]);
    await guardar(p, "seleccion-barra.webp", zonaDeLaColumna(560));
    await desmarcar(p);
    {
        const todasLas = visible(p, `${LA_CABECERA_DE_LA_COLUMNA} [title^="Seleccionar los"], ${LA_CABECERA_DE_LA_COLUMNA} [aria-label^="Seleccionar los"]`);
        const cTodas = await caja(p, todasLas);
        await todasLas.click();
        await espera(p, 900);
        await marcar(p, [{ c: cTodas, texto: "Todas", lado: "derecha" }]);
        await guardar(p, "seleccion-todas.webp", zonaDeLaColumna(620));
        await desmarcar(p);
        await visible(p, '[title="Quitar selección"], [aria-label="Quitar selección"]').click();
        await espera(p, 900);
    }

    // 4. La cabecera.
    const cFila1 = await caja(p, visible(p, `${LA_CABECERA} > div`));
    const zonaDeLaCabecera = (alto = 420) => ({ x: Math.max(0, cFila1.x - 4), y: 0, w: vista.width - Math.max(0, cFila1.x - 4), h: alto });
    {
        const nombre = visible(p, `${LA_CABECERA} [data-nombre-y-estado]`);
        await marcar(p, [{ c: await caja(p, nombre), n: 1 }, { c: await caja(p, enLaCabecera(p, "Editar contacto")), n: 2, esquina: "derecha" }]);
        await guardar(p, "cabecera-nombre.webp", zonaDeLaCabecera(240));
        await desmarcar(p);
    }
    {
        const etiquetas = [
            "Llamar",
            "Mi conversación",
            "Crear recordatorio para este lead",
            "Estado de cita",
            "Nueva tarea",
            "Registros del lead",
            "Ver contexto del lead",
            "Etapa del embudo",
        ];
        const marcas = [];
        for (const [i, e] of etiquetas.entries()) {
            const c = await caja(p, enLaCabecera(p, e));
            marcas.push({ c, n: i + 1, sinRecuadro: true, numeroEn: { x: c.x + c.w / 2, y: c.y + c.h + 22 } });
        }
        const cEtiquetas = await caja(p, visible(p, `${LA_CABECERA} button:has(svg.lucide-tag)`));
        marcas.push({ c: cEtiquetas, n: 9, sinRecuadro: true, numeroEn: { x: cEtiquetas.x + cEtiquetas.w / 2, y: cEtiquetas.y + cEtiquetas.h + 22 } });
        const cFicha = await caja(p, enLaCabecera(p, "Ver ficha del contacto"));
        marcas.push({ c: cFicha, n: 10, sinRecuadro: true, numeroEn: { x: cFicha.x + cFicha.w / 2, y: cFicha.y + cFicha.h + 22 } });
        const grupo = unir(...marcas.map((m) => m.c));
        await marcar(p, [{ c: grupo }, ...marcas]);
        await guardar(p, "cabecera-botones.webp", holgura({ ...grupo, h: grupo.h + 40 }, 30, vista));
        await desmarcar(p);
    }
    {
        const b = enLaCabecera(p, "Mi conversación");
        const cb = await caja(p, b);
        const m = await abrirMenu(p, b);
        await marcar(p, [{ c: cb, n: 1 }, { c: await caja(p, m), n: 2, esquina: "derecha" }], { atenuar: true });
        await guardar(p, "cabecera-asesor.webp", zonaDeLaCabecera(560));
        await desmarcar(p);
        await cerrarTodo(p);
    }
    {
        const b = enLaCabecera(p, "Buscar en el chat");
        await b.click();
        await espera(p, 700);
        const campo = visible(p, 'input[placeholder="Buscar en este chat..."]');
        await campo.fill("catálogo");
        await espera(p, 900);
        await marcar(p, [{ c: await caja(p, campo), texto: "Busca en esta conversación", lado: "abajo" }]);
        await guardar(p, "cabecera-buscar.webp", zonaDeLaCabecera(380));
        await desmarcar(p);
        await campo.fill("");
        await b.click();
        await espera(p, 700);
    }

    // 5. Recordatorio, cita y tarea: los paneles de la derecha.
    {
        await enLaCabecera(p, "Crear recordatorio para este lead").click();
        const cPanel = await esperarElPanel(p);
        await espera(p, 900);
        await marcar(p, [{ c: await caja(p, enLaCabecera(p, "Crear recordatorio para este lead")), n: 1 }, { c: dentro(cPanel, 4), n: 2, esquina: "centro" }]);
        await guardar(p, "agenda-recordatorio.webp");
        await desmarcar(p);
        await cerrarTodo(p);
        await espera(p, 800);
    }
    {
        const b = enLaCabecera(p, "Estado de cita");
        const cb = await caja(p, b);
        const m = await abrirMenu(p, b);
        await marcar(p, [{ c: cb, n: 1 }, { c: await caja(p, m), n: 2, esquina: "derecha" }], { atenuar: true });
        await guardar(p, "agenda-cita.webp", zonaDeLaCabecera(600));
        await desmarcar(p);
        await cerrarTodo(p);
    }
    {
        await enLaCabecera(p, "Nueva tarea").click();
        const cPanel = await esperarElPanel(p);
        await espera(p, 900);
        await marcar(p, [{ c: await caja(p, enLaCabecera(p, "Nueva tarea")), n: 1 }, { c: dentro(cPanel, 4), n: 2, esquina: "centro" }]);
        await guardar(p, "agenda-tarea.webp");
        await desmarcar(p);
        await cerrarTodo(p);
        await espera(p, 800);
    }

    // 6. Etapa, etiquetas, contexto y registros.
    {
        const b = enLaCabecera(p, "Etapa del embudo");
        const cb = await caja(p, b);
        const m = await abrirMenu(p, b);
        await marcar(p, [{ c: cb, n: 1 }, { c: await caja(p, m), n: 2, esquina: "derecha" }], { atenuar: true });
        await guardar(p, "embudo-etapa.webp", zonaDeLaCabecera(560));
        await desmarcar(p);
        await cerrarTodo(p);
    }
    {
        const b = visible(p, `${LA_CABECERA} button:has(svg.lucide-tag)`);
        const cb = await caja(p, b);
        const m = await abrirMenu(p, b);
        await marcar(p, [{ c: cb, n: 1 }, { c: await caja(p, m), n: 2, esquina: "derecha" }], { atenuar: true });
        await guardar(p, "embudo-etiquetas.webp", zonaDeLaCabecera(560));
        await desmarcar(p);
        await cerrarTodo(p);
    }
    {
        await enLaCabecera(p, "Ver contexto del lead").click();
        const cPanel = await esperarElPanel(p);
        await espera(p, 2500);
        await marcar(p, [{ c: await caja(p, enLaCabecera(p, "Ver contexto del lead")), n: 1 }, { c: dentro(cPanel, 4), n: 2, esquina: "centro" }]);
        await guardar(p, "embudo-contexto.webp");
        await desmarcar(p);
        await cerrarTodo(p);
        await espera(p, 800);
    }
    await marcar(p, [{ c: await caja(p, enLaCabecera(p, "Registros del lead")), texto: "Pedidos, reservas y reclamos", lado: "abajo" }]);
    await guardar(p, "embudo-registros.webp", zonaDeLaCabecera(260));
    await desmarcar(p);

    // 7. Acciones y macros: «Resolver» se señala, no se pulsa.
    {
        const b = visible(p, `${LA_CABECERA} button:has-text("Acciones")`);
        const cb = await caja(p, b);
        let m = await abrirMenu(p, b, EL_MENU);
        await marcar(p, [{ c: cb, n: 1 }, { c: await caja(p, m), n: 2, numeroEn: { x: (await caja(p, m)).x - 20, y: (await caja(p, m)).y + 40 } }], { atenuar: true });
        await guardar(p, "acciones-menu.webp", zonaDeLaCabecera(560));
        await desmarcar(p);
        await cerrarTodo(p);
        m = await abrirMenu(p, b, EL_MENU);
        const transferir = m.getByText("Transferir a...").first();
        const cTransferir = await caja(p, transferir);
        await transferir.hover();
        await espera(p, 900);
        const sub = p.locator(EL_MENU).locator("visible=true").last();
        await marcar(p, [{ c: cTransferir, n: 1 }, { c: await caja(p, sub), n: 2, numeroEn: { x: (await caja(p, sub)).x - 20, y: (await caja(p, sub)).y + 30 } }], { atenuar: true });
        await guardar(p, "acciones-transferir.webp", zonaDeLaCabecera(560));
        await desmarcar(p);
        await cerrarTodo(p);
        m = await abrirMenu(p, b, EL_MENU);
        await marcar(p, [{ c: await caja(p, m.getByRole("menuitem", { name: "Resolver conversación" })), texto: "Ya la atendiste", lado: "izquierda" }], { atenuar: true });
        await guardar(p, "acciones-resolver.webp", zonaDeLaCabecera(560));
        await desmarcar(p);
        await cerrarTodo(p);
    }
    {
        const b = visible(p, `${LA_CABECERA} button:has-text("Macros")`);
        const cb = await caja(p, b);
        const m = await abrirMenu(p, b);
        await marcar(p, [{ c: cb, n: 1 }, { c: await caja(p, m), n: 2, numeroEn: { x: (await caja(p, m)).x - 20, y: (await caja(p, m)).y + 40 } }], { atenuar: true });
        await guardar(p, "acciones-macros.webp", zonaDeLaCabecera(520));
        await desmarcar(p);
        await cerrarTodo(p);
    }

    // 8. Los mensajes.
    const zonaDelHilo = () => ({ x: cHilo.x, y: cHilo.y - 40, w: cHilo.w, h: cHilo.h + 40 });
    {
        const m = unMensaje(p, "me encantan los blancos");
        await m.scrollIntoViewIfNeeded();
        await m.hover();
        await espera(p, 500);
        const responder = m.getByRole("button", { name: "Responder" }).first();
        const reenviar = m.getByRole("button", { name: "Reenviar" }).first();
        await marcar(p, [{ c: await caja(p, responder), n: 1 }, { c: await caja(p, reenviar), n: 2, esquina: "derecha" }]);
        await guardar(p, "mensajes-responder.webp", zonaDelHilo());
        await desmarcar(p);
    }
    {
        const { menu } = await elMenuDelMensaje(p, "me encantan los blancos");
        await marcar(p, [{ c: await caja(p, menu) }], { atenuar: true });
        await guardar(p, "mensajes-menu.webp", zonaDelHilo());
        await desmarcar(p);
        await cerrarTodo(p);
    }
    {
        const { menu } = await elMenuDelMensaje(p, "tenemos en talla 38");
        await marcar(p, [{ c: await caja(p, menu.getByRole("menuitem", { name: "Editar" })), texto: "Corrige lo que enviaste", lado: "izquierda" }], { atenuar: true });
        await guardar(p, "mensajes-editar.webp", zonaDelHilo());
        await desmarcar(p);
        await cerrarTodo(p);
    }
    {
        await alFinalDelHilo(p);
        const transcribir = visible(p, `${EL_HILO} button:has-text("Transcribir")`);
        const hecha = unMensaje(p, "Es que los necesito");
        await marcar(p, [{ c: await caja(p, hecha), n: 1, esquina: "derecha" }, { c: await caja(p, transcribir), n: 2, esquina: "derecha" }]);
        await guardar(p, "mensajes-transcribir.webp", zonaDelHilo());
        await desmarcar(p);
    }

    // 9. La barra de escribir: se escribe y se borra, nunca se envía.
    const zonaDeLaBarra = (alto = 420) => ({ x: cBarra.x - 4, y: vista.height - alto, w: cBarra.w + 8, h: alto });
    const laCaja = visible(p, LA_CAJA_DE_ESCRIBIR);
    await laCaja.click();
    await laCaja.pressSequentially("¡Claro! Te los enviamos mañana mismo.", { delay: 15 });
    await espera(p, 500);
    await marcar(p, [{ c: await caja(p, laCaja), n: 1 }, { c: await caja(p, enLaBarra(p, "Enviar")), n: 2, esquina: "derecha" }]);
    await guardar(p, "escribir-texto.webp", zonaDeLaBarra(220));
    await desmarcar(p);
    await laCaja.fill("");
    await laCaja.pressSequentially("/h", { delay: 60 });
    await espera(p, 1200);
    {
        const sugerencias = visible(p, '[data-zona="sugerencias-de-respuestas"]');
        await marcar(p, [{ c: await caja(p, sugerencias) }, { c: await caja(p, laCaja), n: 1 }], { atenuar: true });
        await guardar(p, "escribir-atajos.webp", zonaDeLaBarra(420));
        await desmarcar(p);
    }
    await laCaja.fill("");
    await espera(p, 500);
    {
        const b = enLaBarra(p, "Enviar workflow o respuesta rápida");
        const cb = await caja(p, b);
        const m = await abrirMenu(p, b);
        await marcar(p, [{ c: cb, n: 1 }, { c: await caja(p, m), n: 2, esquina: "derecha" }], { atenuar: true });
        await guardar(p, "escribir-rapidas.webp", zonaDeLaBarra(560));
        await desmarcar(p);
        await cerrarTodo(p);
    }
    {
        const b = enLaBarra(p, "Adjuntar");
        const cb = await caja(p, b);
        const m = await abrirMenu(p, b);
        await marcar(p, [{ c: cb, n: 1 }, { c: await caja(p, m), n: 2, esquina: "derecha" }], { atenuar: true });
        await guardar(p, "escribir-adjuntar.webp", zonaDeLaBarra(360));
        await desmarcar(p);
        await cerrarTodo(p);
    }
    await marcar(p, [
        { c: await caja(p, enLaBarra(p, "Dictar por voz")), n: 1 },
        { c: await caja(p, enLaBarra(p, "Grabar nota de voz")), n: 2, esquina: "derecha" },
    ]);
    await guardar(p, "escribir-voz.webp", zonaDeLaBarra(220));
    await desmarcar(p);

    // 10. La IA, la firma, la nota interna, la sugerencia y las plantillas.
    await marcar(p, [{ c: await caja(p, visible(p, `${LA_BARRA_DE_ESCRIBIR} [role="switch"]`)), texto: "Encendido: contesta la IA", lado: "arriba" }]);
    await guardar(p, "barra-ia.webp", zonaDeLaBarra(220));
    await desmarcar(p);
    {
        const b = enLaBarra(p, "Firma del asesor");
        const cb = await caja(p, b);
        const m = await abrirMenu(p, b);
        await marcar(p, [{ c: cb, n: 1 }, { c: await caja(p, m), n: 2, esquina: "derecha" }], { atenuar: true });
        await guardar(p, "barra-firma.webp", zonaDeLaBarra(420));
        await desmarcar(p);
        await cerrarTodo(p);
    }
    await enLaBarra(p, "Nota interna").click();
    await espera(p, 700);
    await visible(p, LA_CAJA_DE_ESCRIBIR).pressSequentially("Pidió envío urgente, confirmar mañana.", { delay: 15 });
    await espera(p, 400);
    await marcar(p, [{ c: await caja(p, enLaBarra(p, "Nota interna")), n: 1 }, { c: await caja(p, visible(p, LA_BARRA_DE_ESCRIBIR)), n: 2, esquina: "derecha" }]);
    await guardar(p, "barra-nota.webp", zonaDeLaBarra(260));
    await desmarcar(p);
    await visible(p, LA_CAJA_DE_ESCRIBIR).fill("");
    await enLaBarra(p, "Nota interna").click();
    await espera(p, 600);
    await marcar(p, [{ c: await caja(p, enLaBarra(p, "Generar respuesta sugerida con IA")), texto: "Te sugiere una respuesta", lado: "arriba" }]);
    await guardar(p, "barra-sugerencia.webp", zonaDeLaBarra(220));
    await desmarcar(p);

    // 11. La ficha del contacto.
    await marcar(p, [{ c: await caja(p, enLaCabecera(p, "Ver ficha del contacto")), texto: "La ficha del contacto", lado: "abajo" }]);
    await guardar(p, "ficha-abrir.webp", zonaDeLaCabecera(240));
    await desmarcar(p);
    await enLaCabecera(p, "Ver ficha del contacto").click();
    {
        const cPanel = await esperarElPanel(p);
        await espera(p, 2000);
        const ficha = p.locator("[data-ficha-de-contacto]").locator("visible=true").first();
        // Lo de dentro llega en varias consultas: se espera a que no quede nada cargando.
        await ficha.locator("textarea").last().waitFor({ state: "attached", timeout: 90000 });
        await ficha.getByText("Cargando", { exact: false }).first().waitFor({ state: "hidden", timeout: 90000 }).catch(() => {});
        await espera(p, 1000);
        const switchIa = ficha.locator('[role="switch"]').first();
        const participantes = ficha.getByText("PARTICIPANTES", { exact: false }).first();
        const cArriba = unir(await caja(p, switchIa), await caja(p, participantes));
        await marcar(p, [{ c: holgura(cArriba, 3, vista) }], { atenuar: true });
        await guardar(p, "ficha-arriba.webp", { x: cPanel.x - 300, y: 0, w: vista.width - cPanel.x + 300, h: vista.height });
        await desmarcar(p);
        const notas = ficha.locator("textarea").last();
        await notas.scrollIntoViewIfNeeded();
        await espera(p, 400);
        const nombre = ficha.getByText("Nombre", { exact: true }).first();
        await marcar(p, [{ c: await caja(p, nombre), n: 1 }, { c: await caja(p, notas), n: 2, esquina: "derecha" }], { atenuar: true });
        await guardar(p, "ficha-datos.webp", { x: cPanel.x - 300, y: 0, w: vista.width - cPanel.x + 300, h: vista.height });
        await desmarcar(p);
    }
    await cerrarLaFicha(p);

    // 12. La llamada: la contesta el servidor de llamadas de la guía.
    {
        const b = enLaCabecera(p, "Llamar");
        const cb = await caja(p, b);
        const m = await abrirMenu(p, b, EL_MENU);
        await marcar(p, [{ c: cb, n: 1 }, { c: await caja(p, m), n: 2, esquina: "derecha" }], { atenuar: true });
        await guardar(p, "llamada-menu.webp", zonaDeLaCabecera(360));
        await desmarcar(p);
        await m.getByRole("menuitem", { name: "Llamar", exact: true }).click();
    }
    await p.getByRole("button", { name: /Colgar/ }).first().waitFor({ state: "visible", timeout: 30000 });
    await espera(p, 6000);
    const laTarjeta = async () => caja(p, p.locator("[data-ventana-de-llamada]").locator("visible=true").last());
    {
        const cT = await laTarjeta();
        await marcar(p, [{ c: holgura(cT, 4, vista), texto: "Mientras hablas, sigues en el chat", lado: "derecha" }]);
        await guardar(p, "llamada-en-curso.webp");
        await desmarcar(p);
        const marcas = [];
        for (const [i, nombre] of ["Silenciar", "Altavoz", "Colgar"].entries()) marcas.push({ c: await caja(p, p.getByRole("button", { name: new RegExp(nombre) }).first()), n: i + 1 });
        marcas.push({ c: await caja(p, p.locator('[aria-label="Plegar la llamada"]').first()), n: 4, esquina: "derecha" });
        await marcar(p, marcas, { atenuar: true });
        await guardar(p, "llamada-mandos.webp", holgura(cT, 40, vista));
        await desmarcar(p);
    }
    // Cuelga el CLIENTE: al colgar el asesor la tarjeta se cierra sola.
    await p.evaluate(() => { window.__guiaColgo = Date.now(); });
    await p.getByText("¿Cómo resultó la llamada?").waitFor({ state: "visible", timeout: 30000 });
    await espera(p, 1200);
    {
        const cT = await laTarjeta();
        const pregunta = p.getByText("¿Cómo resultó la llamada?").first();
        await marcar(p, [{ c: holgura(unir(await caja(p, pregunta), await caja(p, p.getByRole("button", { name: "No interesado" }).first())), 8, vista) }], { atenuar: true });
        await guardar(p, "llamada-resultado.webp", holgura(cT, 40, vista));
        await desmarcar(p);
    }
    await p.getByRole("button", { name: "Cerrar" }).last().click().catch(() => {});
    await espera(p, 1200);
    await quitarAvisos(p);

    // Las plantillas: en la línea de WhatsApp oficial.
    await abrirLaConversacion(p, "Daniela Herrera");
    {
        const b = enLaBarra(p, "Enviar plantilla de WhatsApp");
        const cb = await caja(p, b);
        await b.click();
        const d = p.locator('[role="dialog"]').locator("visible=true").last();
        await d.waitFor({ state: "visible", timeout: 15000 });
        await espera(p, 2000);
        await marcar(p, [{ c: cb, n: 1 }, { c: await caja(p, d), n: 2, esquina: "derecha" }], { atenuar: true });
        await guardar(p, "barra-plantillas.webp");
        await desmarcar(p);
        await cerrarTodo(p);
    }

    // Traducir: en el mensaje en inglés de John.
    await abrirLaConversacion(p, "John Miller");
    {
        const { menu } = await elMenuDelMensaje(p, "half now");
        await marcar(p, [{ c: await caja(p, menu.getByRole("menuitem", { name: "Traducir" })), texto: "Lo pone en español", lado: "izquierda" }], { atenuar: true });
        await guardar(p, "mensajes-traducir.webp", zonaDelHilo());
        await desmarcar(p);
        await cerrarTodo(p);
    }

    await abrirLaConversacion(p, LA_COMPLETA);
    await elMarcoDeLaPantalla(p, guardar, { modulo: "Bandeja", texto: "Chats está en Bandeja" });
}

/* ------------------------------------------------------------------ */
/* El vídeo                                                            */
/* ------------------------------------------------------------------ */

/** Entre una frase y la siguiente, lo que respira una persona hablando (el de Leads). */
const RESPIRO_ENTRE_FRASES_MS = 250;
/** El vídeo arranca esto antes de la primera palabra; lo de antes (la carga) se recorta. */
const INICIO_ANTES_DE_HABLAR_MS = 300;

async function video(navegador, estado) {
    const dir = path.join(TMP, "video");
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });

    const voz = await prepararLaVoz(NARRACION, dir, comoSeDice);
    const ctx = await navegador.newContext({
        viewport: { width: 1280, height: 800 },
        locale: "es-CO",
        timezoneId: "America/Bogota",
        storageState: estado,
        permissions: ["microphone"],
    });
    await ctx.addInitScript(CURSOR);
    await prepararElContexto(ctx);
    const p = await ctx.newPage();
    const mudo = path.join(dir, "pantalla.mkv");
    const grabadora = await grabar(p, mudo, { ancho: 1280, alto: 800 });
    const t0 = Date.now();
    grabadora.empezarEn(t0);
    const { decir, alDecir, callar, sinGrabarLaEspera, tramos, cortes } = empezarLaNarracion(p, voz, t0, { respiro: RESPIRO_ENTRE_FRASES_MS });

    try {
        await abrirChats(p);
        await abrirLaConversacion(p, LA_COMPLETA);
        await alFinalDelHilo(p);
        await p.mouse.move(640, 400, { steps: 8 });
        const desdeMs = Math.max(0, Date.now() - t0 - INICIO_ANTES_DE_HABLAR_MS);
        await decir("intro");
        await alDecir("todas las conversaciones", 200);
        await mover(p, lasFilas(p).nth(1));
        await alDecir("la que tienes abierta", 200);
        await mover(p, unMensaje(p, "me encantan los blancos"));

        // El menú: se abre con las dos flechas, se señala Bandeja y se vuelve a recoger.
        const flechas = p.locator('[data-inicio-de-la-barra] [data-sidebar="trigger"]');
        const bandeja = elMenuLateral(p).locator('[data-sidebar="menu-button"]', { hasText: "Bandeja" }).first();
        await decir("menu");
        await alDecir("con estas dos flechas");
        await pulsar(p, flechas);
        await alDecir("dentro de Bandeja", 500);
        await mover(p, bandeja);

        const [, , , buscarTodo, ayuda, soporte, campana] = lasPartesDeArriba(p);
        await decir("barraDeArriba");
        await pulsar(p, flechas);
        await alDecir("el buscador general");
        await mover(p, buscarTodo.first());
        await alDecir("el botón de soporte");
        await mover(p, soporte.first());
        await alDecir("tus notificaciones");
        await mover(p, campana.first());

        // Las pastillas: Mías, Sin leer, En espera, y de vuelta a Todos.
        await decir("lista");
        await alDecir("Mías son", 100);
        await pulsar(p, laPastilla(p, "mine"));
        await alDecir("Sin leer", 100);
        await pulsar(p, laPastilla(p, "sinLeer"));
        await alDecir("En espera", 100);
        await pulsar(p, laPastilla(p, "enEspera"));
        await espera(p, 600);
        await pulsar(p, laPastilla(p, "all"));

        // La selección: se marca una y se quita.
        await decir("seleccion");
        await alDecir("la foto", 100);
        await pulsar(p, suFoto(laFila(p, "Camila Rojas")));
        await alDecir("lo que puedes hacer", 100);
        await mover(p, visible(p, `${LA_CABECERA_DE_LA_COLUMNA} [title="Resolver conversaciones"], ${LA_CABECERA_DE_LA_COLUMNA} [aria-label="Resolver conversaciones"]`));
        await pulsar(p, visible(p, '[title="Quitar selección"], [aria-label="Quitar selección"]'));

        // Filtrar y seleccionar cierran la conversación abierta: se vuelve a
        // abrir sin grabar la carga, para que la cabecera tenga de quién hablar.
        if ((await p.locator(`${EL_HILO} [data-message-id]`).count()) === 0) {
            await sinGrabarLaEspera(async () => {
                await abrirLaConversacion(p, LA_COMPLETA);
                await alFinalDelHilo(p);
            });
        }

        // La cabecera: el asesor, el recordatorio, la cita y la etapa.
        await decir("cabecera");
        await alDecir("asignas el asesor", 100);
        await mover(p, enLaCabecera(p, "Mi conversación"));
        await alDecir("un recordatorio", 100);
        await mover(p, enLaCabecera(p, "Crear recordatorio para este lead"));
        await alDecir("una cita", 100);
        await mover(p, enLaCabecera(p, "Estado de cita"));
        await alDecir("las etapas del embudo", 100);
        await pulsar(p, enLaCabecera(p, "Etapa del embudo"));
        await espera(p, 900);
        await p.keyboard.press("Escape");

        // Acciones y Macros: se abren y se cierran sin elegir nada.
        await decir("acciones");
        await alDecir("En Acciones", 100);
        const acciones = visible(p, `${LA_CABECERA} button:has-text("Acciones")`);
        await pulsar(p, acciones);
        // El menú de Acciones se fija por lo que lleva dentro: al pasar por
        // «Transferir a…» se abre su submenú, y el último menú visible es ese.
        const menuAcciones = p
            .locator(EL_MENU)
            .filter({ has: p.getByRole("menuitem", { name: "Resolver conversación" }) })
            .locator("visible=true")
            .first();
        await menuAcciones.waitFor({ state: "visible", timeout: 10000 });
        await alDecir("la transfieres", 100);
        await mover(p, menuAcciones.getByRole("menuitem", { name: /Transferir a/ }).first());
        await alDecir("la resuelves", 100);
        await mover(p, menuAcciones.getByRole("menuitem", { name: "Resolver conversación" }));
        await p.keyboard.press("Escape");
        if (await menuAcciones.isVisible().catch(() => false)) await p.keyboard.press("Escape");
        await alDecir("en Macros", 100);
        await pulsar(p, visible(p, `${LA_CABECERA} button:has-text("Macros")`));
        await espera(p, 900);
        await p.keyboard.press("Escape");

        // Los mensajes: responder y sus tres puntos.
        await decir("mensajes");
        const elMensaje = unMensaje(p, "me encantan los blancos");
        await alDecir("respondes citándolo", 100);
        await mover(p, elMensaje);
        await mover(p, elMensaje.getByRole("button", { name: "Responder" }).first());
        await alDecir("en sus tres puntos", 100);
        await pulsar(p, elMensaje.getByRole("button", { name: "Más opciones" }).first());
        const menuMensaje = p.locator(EL_MENU).locator("visible=true").last();
        await menuMensaje.waitFor({ state: "visible", timeout: 10000 });
        // Este mensaje está en español, así que su menú no ofrece Traducir
        // (`seOfreceTraducir`): se señala Reenviar, que la frase nombra antes.
        await alDecir("lo reenvías", 100);
        await mover(p, menuMensaje.getByRole("menuitem", { name: "Reenviar" }));
        await p.keyboard.press("Escape");

        // La barra de escribir: se escribe la barra y se borra; el clip se abre y se cierra.
        const laCaja = visible(p, LA_CAJA_DE_ESCRIBIR);
        await decir("escribir");
        await alDecir("escribes tu respuesta", 100);
        await pulsar(p, laCaja);
        await alDecir("con la barra", 100);
        await laCaja.pressSequentially("/h", { delay: 120 });
        await alDecir("con el clip", 100);
        await laCaja.fill("");
        await pulsar(p, enLaBarra(p, "Adjuntar"));
        await espera(p, 800);
        await p.keyboard.press("Escape");

        // La IA, la nota interna y la sugerencia: se señalan.
        await decir("ia");
        await alDecir("Este interruptor", 100);
        await mover(p, visible(p, `${LA_BARRA_DE_ESCRIBIR} [role="switch"]`));
        await alDecir("el candado", 100);
        await mover(p, enLaBarra(p, "Nota interna"));
        await alDecir("el destello", 100);
        await mover(p, enLaBarra(p, "Generar respuesta sugerida con IA"));

        // La ficha: se abre y se cierra.
        await decir("ficha");
        await alDecir("El último botón", 100);
        await pulsar(p, enLaCabecera(p, "Ver ficha del contacto"));
        await alDecir("sus datos y sus notas", 300);
        await mover(p, p.locator("[data-ficha-de-contacto]").locator("visible=true").first());
        await cerrarLaFicha(p);

        // La llamada: la contesta el servidor de la guía, y se cuelga.
        await decir("llamada");
        await alDecir("el teléfono verde", 100);
        await pulsar(p, enLaCabecera(p, "Llamar"));
        const menuLlamar = p.locator(EL_MENU).locator("visible=true").last();
        await menuLlamar.waitFor({ state: "visible", timeout: 10000 });
        await pulsar(p, menuLlamar.getByRole("menuitem", { name: "Llamar", exact: true }));
        const colgar = p.getByRole("button", { name: /Colgar/ }).first();
        await colgar.waitFor({ state: "visible", timeout: 30000 });
        // «Plegar» solo sale con la llamada ya conectada: se espera a que conecte.
        const plegar = p.locator('[aria-label="Plegar la llamada"]').first();
        await plegar.waitFor({ state: "visible", timeout: 30000 });
        // El cliente cuelga en cuanto la llamada conecta: la tarjeta tarda unos
        // segundos (la gracia del audio) en preguntar cómo fue, y así esa espera
        // cae mientras la frase todavía suena.
        await p.evaluate(() => { window.__guiaColgo = Date.now(); });
        await alDecir("plegar", 100);
        await mover(p, plegar);
        await alDecir("cómo fue", 100);
        const resultado = p.getByText("¿Cómo resultó la llamada?");
        if (!(await resultado.isVisible().catch(() => false))) {
            // Lo que falte de esa espera no se graba: el vídeo no acaba mudo.
            await sinGrabarLaEspera(() => resultado.waitFor({ state: "visible", timeout: 30000 }));
        }
        await mover(p, p.getByRole("button", { name: "Interesado" }).first());
        await callar(200);
        await rotulo(p, "");
        await espera(p, 200);

        const totalMs = Date.now() - t0;
        const grabado = await grabadora.parar();
        console.log(`  · grabados ${grabado.fotogramas} fotogramas (${(grabado.fotogramas / 25).toFixed(1)} s) de ${grabado.recibidos} pintados, en ${(totalMs / 1000).toFixed(1)} s`);
        await ctx.close();

        const { wav, colocados } = montarLaPista(tramosSinLosCortes(tramos, cortes), totalMs - loQueSeCorta(cortes));
        const pista = path.join(dir, "narracion.wav");
        guardarWav(pista, wav);
        const destino = path.join(SALIDA, "demostracion.webm");
        mezclar(mudo, pista, destino, { desdeMs, cortes });
        writeFileSync(path.join(TMP, "narracion.json"), JSON.stringify(colocados, null, 2));
        escribirLaVozDelVideo("chats", { narracion: NARRACION, colocados, desdeMs, respiro: RESPIRO_ENTRE_FRASES_MS, cortes });
        console.log("  ✓ demostracion.webm", Math.round(statSync(destino).size / 1024), "KB,", colocados.length, "frases narradas");
    } catch (e) {
        await p.screenshot({ path: path.join(TMP, "error-del-video.png") }).catch(() => {});
        console.error("[guia] el vídeo se cayó en", p.url(), "— foto en", path.join(TMP, "error-del-video.png"));
        throw e;
    }
}

/* ------------------------------------------------------------------ */

const navegador = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined, args: ARGS_DEL_NAVEGADOR });
try {
    const ctx = await navegador.newContext({
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 2,
        locale: "es-CO",
        timezoneId: "America/Bogota",
        permissions: ["microphone"],
    });
    await prepararElContexto(ctx);
    const p = await entrar(ctx, BASE);
    // El embudo de la cuenta nace al abrir Embudos la primera vez: la etapa de la cabecera lo necesita.
    await p.goto(`${BASE}/embudos`, { waitUntil: "domcontentloaded" });
    await espera(p, 6000);
    await abrirChats(p);
    try {
        if (!SOLO_VIDEO) await miniaturas(p);
        if (!SOLO_MINIATURAS && !SOLO_VIDEO) await capturas(p);
    } catch (e) {
        await p.screenshot({ path: path.join(TMP, "error-de-las-capturas.png") }).catch(() => {});
        console.error("[guia] las capturas se cayeron — foto en", path.join(TMP, "error-de-las-capturas.png"));
        throw e;
    }
    const estado = await ctx.storageState();
    await ctx.close();
    if (!SIN_VIDEO && !SOLO_MINIATURAS) {
        if (!SOLO_VIDEO) execFileSync("node", [path.join(RAIZ, "scripts", "sembrar-guia-chats.mjs")], { stdio: "inherit" });
        await video(navegador, estado);
    }
} finally {
    await navegador.close();
}

comprobarLasCapturas({ salida: SALIDA, tomadas, conservaLasDemas: SOLO_MINIATURAS || SOLO_VIDEO });
writeFileSync(path.join(TMP, "tomadas.json"), JSON.stringify([...tomadas], null, 2));
console.log(`[guia] ${tomadas.size} capturas${SIN_VIDEO || SOLO_MINIATURAS ? "" : " y el vídeo"} en public/guia/chats`);
