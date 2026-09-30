/**
 * El TALLER de las guías públicas: lo que comparten los guiones de capturas y
 * vídeo de todos los módulos (`capturar-guia-<modulo>.mjs`).
 *
 * Aquí vive todo lo que NO depende de la pantalla que se documenta: entrar con
 * sesión, medir cajas, pintar las marcas (recuadros, números, flechas y el
 * velo), guardar una foto en webp, las miniaturas del índice, el marco que
 * rodea a cualquier pantalla (el menú y la barra de arriba), mover el ratón,
 * la narración que enlaza las frases y el registro de con qué voz se narró el
 * vídeo publicado.
 *
 * Lo propio de cada guía —qué se abre, qué se señala, qué se dice— se queda en
 * su guion. Con estas piezas copiadas en cada uno, el día que se afinara el
 * velo o el ritmo de la narración se afinaría en una guía y la otra saldría
 * distinta: dos guías de la misma plataforma que no se parecen.
 */
import { createRequire } from "node:module";
import { existsSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { SALIDA as TAMANO_MINI, encuadreDeLaMiniatura } from "./encuadre-de-la-miniatura.mjs";
import { RITMO, sintetizar, usaCedar } from "./voz-de-la-guia.mjs";
import { VOZ_CEDAR, llaveDeLaFrase, llenarLaCache } from "./voz-cedar.mjs";

const require = createRequire(import.meta.url);
const sharp = require("sharp");

export const espera = (p, ms) => p.waitForTimeout(ms);

/* ------------------------------------------------------------------ */
/* Entrar y despejar                                                   */
/* ------------------------------------------------------------------ */

/**
 * Entra con la cuenta de las capturas (la siembra `sembrar-barra.mjs`). Otra
 * persona de esa cuenta —la de una reunión, que entra desde su navegador— pasa
 * su `email`: la clave es la misma para todas las cuentas de la semilla.
 */
export async function entrar(contexto, base, { email = "jefe@banco.test", clave = "banco1234" } = {}) {
    const p = await contexto.newPage();
    await p.goto(`${base}/login`, { waitUntil: "domcontentloaded" });
    await espera(p, 2500);
    await p.fill('input[name="email"]', email);
    await p.fill('input[name="password"]', clave);
    await p.click('button[type="submit"]');
    for (let i = 0; i < 120 && p.url().includes("/login"); i += 1) await espera(p, 500);
    if (p.url().includes("/login")) throw new Error("no se pudo entrar: la página sigue en /login");
    return p;
}

/** Lo que tapa la pantalla y no es parte de la guía: la «Guía rápida» y los avisos que queden. */
export async function despejar(p) {
    for (let i = 0; i < 4; i += 1) {
        const dialogo = await p.$('[role="dialog"]');
        if (!dialogo) break;
        await p.keyboard.press("Escape");
        await espera(p, 350);
    }
}

/**
 * Se ESPERA a que los avisos se vayan solos: quitarlos del DOM a mano rompe
 * el estado de sonner y el aviso siguiente ya no sale.
 */
export async function quitarAvisos(p) {
    await p.mouse.move(10, 450);
    await p.waitForFunction(() => document.querySelectorAll("[data-sonner-toast]").length === 0, null, { timeout: 20000 }).catch(() => {});
    await espera(p, 300);
}

/**
 * Los botones del borde (copiloto, equipo, nota) son de TODAS las pantallas:
 * en la guía de un módulo tapan lo que hay a la derecha y no explican nada de
 * ese módulo.
 */
export async function esconderLosBotonesDelBorde(p) {
    await p.addStyleTag({ content: "[data-columna-del-borde]{display:none !important}" });
    await espera(p, 300);
}

/**
 * El dominio que se LEE en las capturas. La guía se genera sobre `localhost`,
 * y lo que la pantalla enseña con el dominio de la página («URL activa»,
 * «Catálogo público») saldría como `localhost:3940/c/…`, una dirección que no
 * le sirve a nadie. En producción esa misma pantalla dice el de la
 * plataforma: se reescribe en el TEXTO pintado, nunca en los enlaces, así que
 * pulsar sigue llevando a la App servida.
 */
export const DOMINIO_DE_LA_GUIA = "agente.ia-app.com";

/**
 * Pone `DOMINIO_DE_LA_GUIA` donde la página pinta el de `base`, en cuanto
 * aparece y cada vez que React lo vuelve a pintar (un observador, antes de
 * cargar la página).
 */
export async function conElDominioDeLaGuia(contexto, base) {
    const local = new URL(base).host;
    await contexto.addInitScript(
        ({ local, dominio }) => {
            const arreglar = (nodo) => {
                if (nodo.nodeType === Node.TEXT_NODE) {
                    if (nodo.data.includes(local)) nodo.data = nodo.data.split(local).join(dominio);
                    return;
                }
                if (nodo.nodeType !== Node.ELEMENT_NODE && nodo.nodeType !== Node.DOCUMENT_NODE) return;
                const recorrido = document.createTreeWalker(nodo, NodeFilter.SHOW_TEXT);
                for (let t = recorrido.nextNode(); t; t = recorrido.nextNode()) if (t.data.includes(local)) t.data = t.data.split(local).join(dominio);
            };
            new MutationObserver((cambios) => {
                for (const c of cambios) {
                    if (c.type === "characterData") arreglar(c.target);
                    for (const n of c.addedNodes) arreglar(n);
                }
            }).observe(document, { childList: true, subtree: true, characterData: true });
        },
        { local, dominio: DOMINIO_DE_LA_GUIA },
    );
}

/** Cierra un menú o un diálogo que siga abierto, sin tocar nada de la página. */
export async function cerrarLoAbierto(p) {
    for (let i = 0; i < 3; i += 1) {
        const abierto = await p.$('[role="menu"], [role="alertdialog"]');
        if (!abierto) break;
        await p.keyboard.press("Escape");
        await espera(p, 350);
    }
}

/* ------------------------------------------------------------------ */
/* Medir                                                               */
/* ------------------------------------------------------------------ */

export async function caja(p, selector) {
    const el = typeof selector === "string" ? p.locator(selector).first() : selector;
    // Una fila que se vuelve a pintar (tras un interruptor) puede soltar el
    // nodo entre «visible» y la medida: se vuelve a intentar antes de rendirse.
    let b = null;
    for (let i = 0; i < 6 && !b; i += 1) {
        await el.waitFor({ state: "visible", timeout: 20000 });
        b = await el.boundingBox();
        if (!b) await espera(p, 400);
    }
    if (!b) throw new Error(`sin caja: ${selector}`);
    return { x: b.x, y: b.y, w: b.width, h: b.height };
}

export function unir(...cajas) {
    const x = Math.min(...cajas.map((c) => c.x));
    const y = Math.min(...cajas.map((c) => c.y));
    const r = Math.max(...cajas.map((c) => c.x + c.w));
    const b = Math.max(...cajas.map((c) => c.y + c.h));
    return { x, y, w: r - x, h: b - y };
}

export function holgura(c, px, vista) {
    const x = Math.max(0, c.x - px);
    const y = Math.max(0, c.y - px);
    const r = Math.min(vista.width, c.x + c.w + px);
    const b = Math.min(vista.height, c.y + c.h + px);
    return { x, y, w: r - x, h: b - y };
}

/** Una caja metida `px` hacia dentro: lo pegado al borde no se sale con su recuadro. */
export const dentro = (c, px) => ({ x: c.x + px, y: c.y + px, w: c.w - 2 * px, h: c.h - 2 * px });

/* ------------------------------------------------------------------ */
/* Lo que rodea a la pantalla: el menú y la barra de arriba            */
/* ------------------------------------------------------------------ */

/** El menú de la izquierda que se VE (en un teléfono hay otro, dentro de una hoja). */
export const elMenuLateral = (p) => p.locator('[data-sidebar="sidebar"]').filter({ visible: true }).first();
export const LA_BARRA_DE_ARRIBA = "[data-barra-de-arriba]";
/** El velo de `marcar` (rgba(15,23,42,0.55)) sobre el fondo blanco. */
export const VELO_SOBRE_BLANCO = "#7b7f8a";

/**
 * Las partes de la barra de arriba, en el orden de `PARTES_DE_LA_BARRA_DE_ARRIBA`
 * (`lib/guia-de-modulo.ts`): el banco exige que sean las mismas y en ese orden.
 */
export const lasPartesDeArriba = (p) => [
    p.locator('[data-inicio-de-la-barra] [data-sidebar="trigger"]'),
    p.locator("[data-alternar-bandeja]"),
    p.locator("[data-botones-de-la-barra] button", { hasText: "Ver tutoriales" }),
    p.locator('button[title="Buscar clientes, chats, tareas, productos o flujos"]'),
    p.locator('button[aria-label="Pedir soporte"]'),
    p.locator('button[aria-label="Centro de notificaciones"]'),
];

/** El borde de abajo del último módulo del menú: debajo queda hueco para el número. */
export async function dondeAcabaElMenu(p) {
    return p.evaluate(() => {
        const menu = [...document.querySelectorAll('[data-sidebar="sidebar"]')].find((m) => m.getBoundingClientRect().width > 0);
        const botones = [...menu.querySelectorAll('[data-sidebar="content"] [data-sidebar="menu-button"]')];
        return Math.max(...botones.map((b) => b.getBoundingClientRect().bottom));
    });
}

/**
 * Lo que pinta el menú RECOGIDO, módulo por módulo: su nombre y si lleva
 * icono. Se guarda en `scripts/menu-guia-<modulo>.json` y lo lee el banco: un
 * módulo sin icono sale como letras recortadas («C…»), que es exactamente como
 * se veía la primera versión de la guía de Leads.
 */
export async function loQuePintaElMenu(p) {
    return p.evaluate(() => {
        const menu = [...document.querySelectorAll('[data-sidebar="sidebar"]')].find((m) => m.getBoundingClientRect().width > 0);
        const botones = [...menu.querySelectorAll('[data-sidebar="content"] [data-sidebar="menu-button"]')];
        return {
            recogido: menu.getBoundingClientRect().width < 80,
            modulos: botones.map((b) => ({
                nombre: (b.textContent ?? "").trim(),
                conIcono: b.firstElementChild?.tagName.toLowerCase() === "svg",
            })),
        };
    });
}

/** Abre o recoge el menú con las dos flechas de la barra, y espera a que termine de moverse. */
export async function elMenuAbierto(p, abierto) {
    const ancho = async () => (await caja(p, elMenuLateral(p))).w;
    if ((await ancho()) > 80 === abierto) return;
    await p.locator('[data-inicio-de-la-barra] [data-sidebar="trigger"]').click();
    await p.waitForFunction(
        (abierto) => {
            const m = [...document.querySelectorAll('[data-sidebar="sidebar"]')].find((x) => x.getBoundingClientRect().width > 0);
            return m && m.getBoundingClientRect().width > 80 === abierto;
        },
        abierto,
        { timeout: 10000 },
    );
    // La transición del ancho dura 200 ms; se deja que acabe y que el contenido se recoloque.
    await espera(p, 700);
    const { width, height } = p.viewportSize();
    await p.mouse.move(width / 2, height - 20);
}

/* ------------------------------------------------------------------ */
/* Marcar                                                              */
/* ------------------------------------------------------------------ */

/**
 * Pinta las marcas encima de la pantalla real. Cada marca: `c` (la caja),
 * `n` (un número en su esquina), `texto` + `lado` (un rótulo con flecha),
 * `sinRecuadro` (el número o el rótulo sin su recuadro).
 * `atenuar` apaga todo lo que no está marcado.
 */
export async function marcar(p, marcas, { atenuar = false, escala = 1 } = {}) {
    await p.evaluate(
        ({ marcas, atenuar, escala }) => {
            document.getElementById("__guia")?.remove();
            const NS = "http://www.w3.org/2000/svg";
            const W = window.innerWidth;
            const H = window.innerHeight;
            const AZUL = "#2563EB";
            const svg = document.createElementNS(NS, "svg");
            svg.id = "__guia";
            svg.setAttribute("width", W);
            svg.setAttribute("height", H);
            Object.assign(svg.style, { position: "fixed", inset: "0", zIndex: 2147483647, pointerEvents: "none" });
            // Dentro del documento DESDE EL PRINCIPIO: fuera de él
            // `getComputedTextLength` da 0 y el rótulo sale sin fondo.
            document.body.appendChild(svg);
            const el = (tag, attrs, padre = svg) => {
                const n = document.createElementNS(NS, tag);
                for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
                padre.appendChild(n);
                return n;
            };
            // `escala` engorda el recuadro de una MINIATURA, que se ve a una
            // cuarta parte: a escala 1 su trazo se quedaría en medio píxel.
            const PAD = 5 * escala;
            const RX = 10 * escala;
            const defs = el("defs", {});
            const flecha = el("marker", { id: "punta", markerWidth: 10, markerHeight: 10, refX: 7, refY: 5, orient: "auto" }, defs);
            el("path", { d: "M0,0 L10,5 L0,10 z", fill: AZUL }, flecha);
            if (atenuar) {
                const m = el("mask", { id: "velo" }, defs);
                el("rect", { x: 0, y: 0, width: W, height: H, fill: "white" }, m);
                for (const { c } of marcas) el("rect", { x: c.x - PAD, y: c.y - PAD, width: c.w + 2 * PAD, height: c.h + 2 * PAD, rx: RX, fill: "black" }, m);
                el("rect", { x: 0, y: 0, width: W, height: H, fill: "rgba(15,23,42,0.55)", mask: "url(#velo)" });
            }
            for (const { c, n, texto, lado = "arriba", esquina = "izquierda", borde = "arriba", numeroEn, soloLuz, sinRecuadro } of marcas) {
                // `soloLuz`: se ve sin velo, pero sin recuadro (el menú entero
                // alrededor de la parte que se señala).
                if (soloLuz) continue;
                const r = { x: c.x - PAD, y: c.y - PAD, w: c.w + 2 * PAD, h: c.h + 2 * PAD };
                // `sinRecuadro`: solo el número o el rótulo. Para piezas pegadas
                // unas a otras (los controles del lienzo de Diagramas), cuyos
                // recuadros se montarían: va uno solo alrededor del grupo.
                if (!sinRecuadro) {
                    el("rect", { x: r.x, y: r.y, width: r.w, height: r.h, rx: RX, fill: "none", stroke: "rgba(37,99,235,0.28)", "stroke-width": 9 * escala });
                    el("rect", { x: r.x, y: r.y, width: r.w, height: r.h, rx: RX, fill: "none", stroke: AZUL, "stroke-width": 3 * escala });
                }
                if (n !== undefined) {
                    // Dónde va el número: por defecto en la esquina de arriba.
                    // `borde: "abajo"` para lo que está pegado al borde de la
                    // pantalla (la barra de arriba no tiene «encima»), y
                    // `numeroEn` para ponerlo donde no tape nada (el menú).
                    const bx = numeroEn ? numeroEn.x : esquina === "derecha" ? r.x + r.w : esquina === "centro" ? r.x + r.w / 2 : r.x;
                    const by = numeroEn ? numeroEn.y : borde === "abajo" ? r.y + r.h : r.y;
                    const cx = Math.min(Math.max(bx, 15), W - 15);
                    const cy = Math.min(Math.max(by, 15), H - 15);
                    el("circle", { cx, cy, r: 13, fill: AZUL, stroke: "white", "stroke-width": 2.5 });
                    const t = el("text", { x: cx, y: cy + 5, "text-anchor": "middle", fill: "white", "font-size": 14, "font-weight": 700, "font-family": "Poppins, Arial, sans-serif" });
                    t.textContent = String(n);
                }
                if (texto) {
                    const g = el("g", {});
                    const t = el("text", { x: 0, y: 0, fill: "white", "font-size": 14, "font-weight": 600, "font-family": "Poppins, Arial, sans-serif" }, g);
                    t.textContent = texto;
                    const ancho = t.getComputedTextLength() + 24;
                    const alto = 30;
                    const SEP = 46;
                    let px;
                    let py;
                    let ax;
                    let ay;
                    if (lado === "arriba" || lado === "abajo") {
                        px = Math.min(Math.max(r.x + r.w / 2 - ancho / 2, 8), W - ancho - 8);
                        py = lado === "arriba" ? r.y - SEP - alto : r.y + r.h + SEP;
                        ax = r.x + r.w / 2;
                        ay = lado === "arriba" ? r.y - 4 : r.y + r.h + 4;
                        const desde = { x: Math.min(Math.max(ax, px + 14), px + ancho - 14), y: lado === "arriba" ? py + alto : py };
                        el("line", { x1: desde.x, y1: desde.y, x2: ax, y2: ay, stroke: AZUL, "stroke-width": 2.5, "marker-end": "url(#punta)" });
                    } else {
                        py = Math.min(Math.max(r.y + r.h / 2 - alto / 2, 8), H - alto - 8);
                        px = lado === "izquierda" ? r.x - SEP - ancho : r.x + r.w + SEP;
                        ax = lado === "izquierda" ? r.x - 4 : r.x + r.w + 4;
                        ay = r.y + r.h / 2;
                        el("line", { x1: lado === "izquierda" ? px + ancho : px, y1: py + alto / 2, x2: ax, y2: ay, stroke: AZUL, "stroke-width": 2.5, "marker-end": "url(#punta)" });
                    }
                    const fondo = document.createElementNS(NS, "rect");
                    for (const [k, v] of Object.entries({ x: px, y: py, width: ancho, height: alto, rx: 15, fill: AZUL })) fondo.setAttribute(k, v);
                    g.insertBefore(fondo, t);
                    t.setAttribute("x", px + 12);
                    t.setAttribute("y", py + 20);
                    svg.appendChild(g);
                }
            }
        },
        { marcas, atenuar, escala },
    );
}

export const desmarcar = (p) => p.evaluate(() => document.getElementById("__guia")?.remove());

/* ------------------------------------------------------------------ */
/* Guardar                                                             */
/* ------------------------------------------------------------------ */

/**
 * El `guardar` de una guía: foto → webp en su carpeta, apuntada en `tomadas`.
 * Las de pantalla completa se bajan a 1600 de ancho; los zoom conservan su
 * nitidez.
 */
export function crearGuardar({ salida, tomadas }) {
    return async function guardar(p, nombre, clip, { margenArriba = 0, fondo = "#ffffff" } = {}) {
        let buf = await p.screenshot(clip ? { clip: { x: clip.x, y: clip.y, width: clip.w, height: clip.h } } : {});
        // Lo que va pegado al borde de arriba de la pantalla (la barra de arriba)
        // no tiene «encima»: se le añade un margen para que su recuadro se vea entero.
        if (margenArriba) {
            const porPx = (await sharp(buf).metadata()).width / (clip ? clip.w : p.viewportSize().width);
            buf = await sharp(buf).extend({ top: Math.round(margenArriba * porPx), background: fondo }).toBuffer();
        }
        const ancho = (await sharp(buf).metadata()).width;
        await sharp(buf)
            .resize({ width: Math.min(ancho, 1600), withoutEnlargement: true })
            .webp({ quality: 82 })
            .toFile(path.join(salida, nombre));
        tomadas.add(nombre);
        console.log("  ✓", nombre);
    };
}

/**
 * Una miniatura por sección, TODAS con la misma receta: la zona que la
 * sección explica, nítida y en su recuadro; el resto, bajo el velo; y el
 * encuadre 16:9 centrado en la zona (`encuadre-de-la-miniatura.mjs`). Cada
 * zona es `[slug, async () => caja, antes?]`; `antes` deja la pantalla como
 * hace falta (abrir un menú) y `cerrarLoAbierto` la limpia después.
 *
 * Escribe en `focos` dónde quedó el recuadro dentro de cada miniatura (en
 * fracción): lo lee el banco para medir el enfoque sin saber el tamaño.
 */
export async function tomarLasMiniaturas(p, zonas, { salida, tomadas, focos: ficheroDeFocos, despues }) {
    const focos = {};
    for (const [slug, zona] of zonas) {
        Object.assign(focos, await tomarUnaMiniatura(p, slug, await zona(), { salida, tomadas }));
        await cerrarLoAbierto(p);
        if (despues) await despues();
    }
    await desmarcar(p);
    writeFileSync(ficheroDeFocos, JSON.stringify(focos, null, 2) + "\n");
}

/**
 * UNA miniatura con la receta de siempre (la de `tomarLasMiniaturas`), para la
 * guía cuyas zonas no se pueden recorrer seguidas: en Reuniones varias solo
 * existen a mitad de la reunión, así que se toman cuando se llega a ellas.
 * Devuelve `{ [nombre]: foco }` para juntarlo en el fichero de focos.
 */
export async function tomarUnaMiniatura(p, slug, foco, { salida, tomadas }) {
    const e = encuadreDeLaMiniatura(foco, p.viewportSize());
    await marcar(p, [{ c: foco }], { atenuar: true, escala: e.escala });
    const nombre = `mini-${slug}.webp`;
    const buf = await p.screenshot({ clip: { x: e.x, y: e.y, width: e.w, height: e.h } });
    await sharp(buf).resize(TAMANO_MINI.ancho, TAMANO_MINI.alto, { fit: "fill" }).webp({ quality: 84 }).toFile(path.join(salida, nombre));
    tomadas.add(nombre);
    console.log("  ✓", nombre);
    await desmarcar(p);
    return { [nombre]: { x: (foco.x - e.x) / e.w, y: (foco.y - e.y) / e.h, w: foco.w / e.w, h: foco.h / e.h } };
}

/**
 * El marco que rodea a la pantalla —la barra de arriba y el menú de la
 * izquierda—, fotografiado en una ventana de PORTÁTIL. A 1440 la barra sale
 * en una tira tan larga que en la página sus iconos se leen de 6 px, y el
 * menú abierto de alto entero ocupa más de una pantalla de la guía. Se vuelve
 * a la ventana de antes al terminar.
 *
 * `modulo` es el módulo del menú donde vive la pantalla, y `texto` el rótulo
 * de su flecha («Leads está en Contactos»).
 */
export async function elMarcoDeLaPantalla(p, guardar, { modulo, texto }) {
    const vista = p.viewportSize();
    const cambiarA = async (tam) => {
        await p.setViewportSize(tam);
        await espera(p, 1200);
    };

    // La barra de arriba: pegada al borde, así que los números van DEBAJO.
    await cambiarA({ width: 1024, height: 700 });
    const cCabecera = await caja(p, LA_BARRA_DE_ARRIBA);
    const cajasDeArriba = [];
    for (const parte of lasPartesDeArriba(p)) cajasDeArriba.push(await caja(p, parte.first()));
    await marcar(p, cajasDeArriba.map((c, i) => ({ c, n: i + 1, borde: "abajo" })), { atenuar: true });
    // El margen de arriba lleva el color del velo sobre blanco: así continúa la pantalla.
    await guardar(p, "barra-de-arriba.webp", { x: cCabecera.x - 12, y: 0, w: cCabecera.w + 12, h: cCabecera.h + 16 }, { margenArriba: 12, fondo: VELO_SOBRE_BLANCO });
    await desmarcar(p);

    // El menú, ABIERTO con las dos flechas, como lo abre un cliente: entero y
    // a la vista, con el módulo señalado; lo de al lado, bajo el velo. Abrirlo
    // corre la pantalla, así que se vuelve a recoger antes de seguir (y el
    // vídeo, que sale del estado de esta sesión, lo encuentra recogido: el
    // menú se guarda en una cookie).
    await cambiarA({ width: 1280, height: 720 });
    await elMenuAbierto(p, true);
    const lateral = elMenuLateral(p);
    const cLateral = await caja(p, lateral);
    const item = lateral.locator('[data-sidebar="menu-item"]', {
        has: p.locator('[data-sidebar="menu-button"]', { hasText: modulo }),
    });
    await marcar(p, [{ c: cLateral, soloLuz: true }, { c: await caja(p, item.first()), texto, lado: "derecha" }], { atenuar: true });
    await guardar(p, "menu-lateral.webp", { x: 0, y: 0, w: Math.min(1280, cLateral.w + 520), h: 720 });
    await desmarcar(p);
    await elMenuAbierto(p, false);
    await cambiarA(vista);
}

/* ------------------------------------------------------------------ */
/* El vídeo                                                            */
/* ------------------------------------------------------------------ */

export async function mover(p, locator) {
    let b = await locator.boundingBox();
    // Sin caja, `b.x` revienta con un TypeError que no dice qué faltaba.
    if (!b) throw new Error(`[guia] no se ve lo que el vídeo tenía que señalar: ${locator}`);
    // Fuera de la ventana, el ratón iría a un punto que no existe y el clic no
    // tocaría nada —sin ningún error: el vídeo se quedaba esperando un
    // resultado que no llega—. Se trae a la vista con un desplazamiento suave
    // (el vídeo lo enseña) y, si aun así no se ve, se cae.
    const vista = p.viewportSize();
    const fuera = (c) => c.y + c.height / 2 < 0 || c.y + c.height / 2 > vista.height || c.x + c.width / 2 < 0 || c.x + c.width / 2 > vista.width;
    if (fuera(b)) {
        await locator.evaluate((el) => el.scrollIntoView({ block: "center", behavior: "smooth" }));
        await espera(p, 700);
        b = await locator.boundingBox();
        if (!b || fuera(b)) throw new Error(`[guia] lo que el vídeo tenía que señalar se queda fuera de la ventana: ${locator}`);
    }
    await p.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 22 });
    await espera(p, 250);
}
/**
 * ¿Hay algo ENCIMA de lo que se va a pulsar? Un aviso flotante que acaba de
 * salir tapa lo que haya debajo —en Mis datos, «6 columnas detectadas» caía
 * justo sobre «Iniciar importación»—, y el clic se lo come el aviso: nada falla,
 * el vídeo se queda esperando un resultado que no llega. Se espera a que se
 * destape (un aviso se va solo) y, si no, se cae diciendo qué lo tapa.
 */
async function sinNadaEncima(p, locator) {
    const libre = () =>
        locator.evaluate((el) => {
            const r = el.getBoundingClientRect();
            const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
            return !e || el === e || el.contains(e) ? "" : `${e.tagName.toLowerCase()} ${(e.textContent ?? "").trim().slice(0, 40)}`;
        });
    let encima = await libre();
    for (let i = 0; i < 40 && encima; i += 1) {
        await espera(p, 200);
        encima = await libre();
    }
    if (encima) throw new Error(`[guia] lo que el vídeo tenía que pulsar está tapado por «${encima}»: ${locator}`);
}

export async function pulsar(p, locator) {
    await mover(p, locator);
    await sinNadaEncima(p, locator);
    await p.mouse.down();
    await espera(p, 90);
    // El clic lo hace el ratón (así el vídeo lo enseña): no se vuelve a pulsar.
    await p.mouse.up();
}
export const rotulo = (p, t) => p.evaluate((t) => window.__rotulo?.(t), t);

/**
 * Las frases de una narración, sintetizadas ANTES de grabar: así se sabe
 * cuánto dura cada una. Con Cedar, lo que falte se pide a OpenAI (o se dice
 * por qué no se pudo); nunca cae a otra voz.
 */
export async function prepararLaVoz(narracion, dir, comoSeDice = (t) => t) {
    if (usaCedar()) await llenarLaCache(Object.values(narracion).map((n) => n.texto));
    const dicho = (texto) => (usaCedar() ? texto : comoSeDice(texto));
    return Object.fromEntries(
        Object.entries(narracion).map(([id, n]) => [id, { ...n, audio: sintetizar(dicho(n.texto), path.join(dir, `${id}.wav`)) }]),
    );
}

/**
 * La narración de un vídeo: `decir` empieza una frase y lo que venga detrás
 * ocurre MIENTRAS suena; `alDecir` espera a que la frase llegue a la palabra
 * que nombra la acción; `callar` espera a que termine, más un respiro corto.
 * Las frases se ENLAZAN: esperar a que acabe cada una para actuar es lo que
 * dejaba la narración cortada.
 */
export function empezarLaNarracion(p, voz, t0, { respiro: respiroEntreFrases }) {
    const tramos = [];
    let calla = 0;
    /** La frase que suena: con ella `alDecir` sabe en qué palabra va. */
    let frase = null;
    const callar = async (respiro = respiroEntreFrases) => {
        const falta = calla + respiro - Date.now();
        if (calla && falta > 0) await espera(p, falta);
        calla = 0;
    };
    const decir = async (id) => {
        await callar();
        const n = voz[id];
        if (!n) throw new Error(`[guia] la narración no tiene la frase «${id}»`);
        await rotulo(p, n.rotulo);
        const ahora = Date.now();
        tramos.push({ texto: n.texto, audio: n.audio, inicioMs: ahora - t0 });
        frase = { texto: n.texto, inicio: ahora, ms: n.audio.ms };
        calla = ahora + n.audio.ms;
    };
    /**
     * Espera a que la frase que suena llegue a `fragmento`, y `adelanto` ms
     * antes —lo que tarda el ratón en llegar—: así se pulsa en la palabra que
     * lo nombra y no después de callar. Dónde cae la palabra se estima por su
     * posición en el texto, que con las pausas ya acortadas va casi parejo.
     */
    const alDecir = async (fragmento, adelanto = 450) => {
        const i = frase ? frase.texto.indexOf(fragmento) : -1;
        if (i < 0) throw new Error(`[guia] «${fragmento}» no está en la frase que suena: ${frase?.texto}`);
        const falta = frase.inicio + (frase.ms * i) / frase.texto.length - adelanto - Date.now();
        if (falta > 0) await espera(p, falta);
    };
    return { decir, alDecir, callar, tramos };
}

/**
 * Qué voz lleva el vídeo publicado de una guía, en
 * `scripts/voz-de-la-guia/<guia>.json`: el banco lo compara con el guion de
 * hoy y busca en la imagen el cambio del rótulo en cada `empiezanEnMs`.
 */
export function escribirLaVozDelVideo(guia, { narracion, colocados, desdeMs, respiro }) {
    writeFileSync(
        path.join(import.meta.dirname, "voz-de-la-guia", `${guia}.json`),
        JSON.stringify(
            usaCedar()
                ? {
                      voz: VOZ_CEDAR.voz,
                      modelo: VOZ_CEDAR.modelo,
                      ritmo: { ...RITMO, respiroEntreFrasesMs: respiro },
                      frases: Object.values(narracion).map((n) => llaveDeLaFrase(n.texto)),
                      // Dónde empieza cada frase EN EL VÍDEO PUBLICADO (ms). En ese
                      // instante cambia el rótulo de abajo: el banco lo busca en la
                      // imagen y así comprueba que la imagen no se despega de la voz.
                      empiezanEnMs: colocados.map((c) => c.inicioMs - desdeMs),
                  }
                : { voz: process.env.VOZ_GUIA, frases: [] },
            null,
            2,
        ) + "\n",
    );
}

/**
 * Las capturas que la guía enseña tienen que estar TODAS (`CAPTURAS_ESPERADAS`,
 * sacadas del propio contenido). Con una parte (`conservaLasDemas`), lo demás
 * se conserva del disco: basta con que esté. Sale en rojo si falta alguna.
 */
export function comprobarLasCapturas({ salida, tomadas, conservaLasDemas }) {
    const esperadas = JSON.parse(process.env.CAPTURAS_ESPERADAS ?? "[]");
    const faltan = esperadas.filter((n) => !tomadas.has(n) && !(conservaLasDemas && existsSync(path.join(salida, n))));
    const sobran = readdirSync(salida).filter((n) => n.endsWith(".webp") && !esperadas.includes(n));
    if (sobran.length) console.warn("[guia] capturas que la guía no enseña:", sobran.join(", "));
    if (faltan.length) {
        console.error("[guia] faltan capturas que la guía enseña:", faltan.join(", "));
        process.exit(1);
    }
}
