/**
 * Toma las CAPTURAS y graba el VÍDEO de la guía pública de Leads, sobre la
 * App servida de verdad (`next start`, sesión real, datos de
 * `sembrar-guia-leads.mjs`).
 *
 * # Por qué así, y no a mano
 *
 * Una guía hecha con capturas a mano se queda vieja el primer día que cambia
 * la pantalla, y nadie vuelve a hacerlas. Aquí cada captura es una receta:
 * «abre esto, pulsa aquello, resalta este elemento». Volver a correr el script
 * rehace las treinta imágenes y el vídeo con la pantalla de ese día, con el
 * mismo encuadre y las mismas marcas.
 *
 * Las marcas —recuadros, números, flechas con su rótulo y el velo que apaga
 * lo que no importa— se dibujan con una capa SVG encima de la pantalla real
 * y se fotografían con ella. Se localizan por lo que la pantalla ya expone
 * (`data-zona` de la barra, los encabezados de la tabla, `aria-label`), no
 * por coordenadas escritas a mano: si un botón se mueve, la flecha se va con
 * él.
 *
 * Qué captura hace falta lo dice `lib/guia-leads.ts`: el script se niega a
 * terminar en verde si alguna imagen que la guía enseña no se tomó.
 *
 * Se lanza con `scripts/generar-guia-leads.sh`.
 */
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { CURSOR } from "./cursor-de-la-guia.mjs";
import { grabar } from "./grabadora-de-la-guia.mjs";
import { SALIDA as TAMANO_MINI, encuadreDeLaMiniatura } from "./encuadre-de-la-miniatura.mjs";
import { NARRACION, comoSeDice } from "./narracion-guia-leads.mjs";
import { RITMO, guardarWav, mezclar, montarLaPista, sintetizar, usaCedar } from "./voz-de-la-guia.mjs";
import { VOZ_CEDAR, llaveDeLaFrase, llenarLaCache } from "./voz-cedar.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const sharp = require("sharp");

const BASE = process.env.BASE ?? "http://localhost:3940";
const RAIZ = path.resolve(import.meta.dirname, "..");
const SALIDA = path.join(RAIZ, "public", "guia", "leads");
const TMP = process.env.TMP_GUIA ?? "/tmp/guia-leads";
const SIN_VIDEO = process.env.SIN_VIDEO === "1";
/** Solo las miniaturas del índice: no rehace los pasos ni el vídeo. */
const SOLO_MINIATURAS = process.env.SOLO_MINIATURAS === "1";
// Solo el vídeo (p. ej. al cambiar la narración): las imágenes se conservan del disco.
const SOLO_VIDEO = process.env.SOLO_VIDEO === "1";
/** Dónde quedó el recuadro dentro de cada miniatura: lo lee el banco para medir el enfoque. */
const FOCOS = path.join(RAIZ, "scripts", "miniaturas-guia-leads.json");
/** Lo que pinta el menú recogido en las capturas: lo lee el banco. */
const MENU = path.join(RAIZ, "scripts", "menu-guia-leads.json");

mkdirSync(SALIDA, { recursive: true });
mkdirSync(TMP, { recursive: true });

const tomadas = new Set();
const espera = (p, ms) => p.waitForTimeout(ms);

async function entrar(contexto) {
    const p = await contexto.newPage();
    await p.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
    await espera(p, 2500);
    await p.fill('input[name="email"]', "jefe@banco.test");
    await p.fill('input[name="password"]', "banco1234");
    await p.click('button[type="submit"]');
    for (let i = 0; i < 120 && p.url().includes("/login"); i += 1) await espera(p, 500);
    if (p.url().includes("/login")) throw new Error("no se pudo entrar: la página sigue en /login");
    return p;
}

/** Lo que tapa la pantalla y no es parte de la guía: la «Guía rápida» y los avisos que queden. */
async function despejar(p) {
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
async function quitarAvisos(p) {
    await p.mouse.move(10, 450);
    await p.waitForFunction(() => document.querySelectorAll("[data-sonner-toast]").length === 0, null, { timeout: 20000 }).catch(() => {});
    await espera(p, 300);
}

async function abrirLeads(p) {
    await p.goto(`${BASE}/sessions`, { waitUntil: "domcontentloaded" });
    await p.waitForSelector("tbody tr td", { timeout: 90000 });
    await p.evaluate(() => document.fonts.ready);
    await espera(p, 2500);
    await despejar(p);
    // Los botones del borde (copiloto, equipo, nota) son de TODAS las
    // pantallas: en una guía de Leads tapan la columna Acciones y no explican
    // nada de este módulo.
    await p.addStyleTag({ content: "[data-columna-del-borde]{display:none !important}" });
    await espera(p, 300);
}

/* ------------------------------------------------------------------ */
/* Medir                                                               */
/* ------------------------------------------------------------------ */

async function caja(p, selector) {
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

function unir(...cajas) {
    const x = Math.min(...cajas.map((c) => c.x));
    const y = Math.min(...cajas.map((c) => c.y));
    const r = Math.max(...cajas.map((c) => c.x + c.w));
    const b = Math.max(...cajas.map((c) => c.y + c.h));
    return { x, y, w: r - x, h: b - y };
}

function holgura(c, px, vista) {
    const x = Math.max(0, c.x - px);
    const y = Math.max(0, c.y - px);
    const r = Math.min(vista.width, c.x + c.w + px);
    const b = Math.min(vista.height, c.y + c.h + px);
    return { x, y, w: r - x, h: b - y };
}

/** La columna entera de la tabla: su encabezado y las `filas` primeras celdas. */
async function laColumna(p, rotulo, filas = 6) {
    return p.evaluate(
        ({ rotulo, filas }) => {
            const tabla = document.querySelector("table");
            const ths = [...tabla.querySelectorAll("thead th")];
            const i = ths.findIndex((th) => th.innerText.trim() === rotulo);
            if (i < 0) throw new Error(`no hay columna «${rotulo}»: ${ths.map((t) => t.innerText.trim()).join(", ")}`);
            const celdas = [ths[i], ...[...tabla.querySelectorAll("tbody tr")].slice(0, filas).map((tr) => tr.children[i])];
            const r = celdas.map((c) => c.getBoundingClientRect());
            const x = Math.min(...r.map((q) => q.left));
            const y = Math.min(...r.map((q) => q.top));
            return { x, y, w: Math.max(...r.map((q) => q.right)) - x, h: Math.max(...r.map((q) => q.bottom)) - y };
        },
        { rotulo, filas },
    );
}

/** La tabla: encabezado y las `filas` primeras filas, a todo lo ancho. */
async function laTabla(p, filas = 6) {
    return p.evaluate((filas) => {
        const tabla = document.querySelector("table");
        const partes = [tabla.querySelector("thead"), ...[...tabla.querySelectorAll("tbody tr")].slice(0, filas)];
        const r = partes.map((c) => c.getBoundingClientRect());
        const x = Math.min(...r.map((q) => q.left));
        const y = Math.min(...r.map((q) => q.top));
        return { x, y, w: Math.max(...r.map((q) => q.right)) - x, h: Math.max(...r.map((q) => q.bottom)) - y };
    }, filas);
}

const fila = (p, nombre) => p.locator("tbody tr", { hasText: nombre }).first();

async function celdaDe(p, nombre, rotulo) {
    const i = await p.evaluate((rotulo) => {
        const ths = [...document.querySelectorAll("table thead th")];
        return ths.findIndex((th) => th.innerText.trim() === rotulo);
    }, rotulo);
    if (i < 0) throw new Error(`no hay columna ${rotulo}`);
    return fila(p, nombre).locator(`td:nth-child(${i + 1})`);
}

/* ------------------------------------------------------------------ */
/* Lo que rodea a la pantalla: el menú y la barra de arriba            */
/* ------------------------------------------------------------------ */

/** El menú de la izquierda que se VE (en un teléfono hay otro, dentro de una hoja). */
const elMenuLateral = (p) => p.locator('[data-sidebar="sidebar"]').filter({ visible: true }).first();
const LA_BARRA_DE_ARRIBA = "[data-barra-de-arriba]";
/** El velo de `marcar` (rgba(15,23,42,0.55)) sobre el fondo blanco. */
const VELO_SOBRE_BLANCO = "#7b7f8a";

/**
 * Las partes de la barra de arriba, en el orden de `PARTES_DE_LA_BARRA_DE_ARRIBA`
 * (`lib/guia-leads.ts`): el banco exige que sean las mismas y en ese orden.
 */
const lasPartesDeArriba = (p) => [
    p.locator('[data-inicio-de-la-barra] [data-sidebar="trigger"]'),
    p.locator("[data-alternar-bandeja]"),
    p.locator("[data-botones-de-la-barra] button", { hasText: "Ver tutoriales" }),
    p.locator('button[title="Buscar clientes, chats, tareas, productos o flujos"]'),
    p.locator('button[aria-label="Pedir soporte"]'),
    p.locator('button[aria-label="Centro de notificaciones"]'),
];

/** El pie de la tabla: «Mostrando…» y las flechas de página. */
async function elPie(p) {
    return p.evaluate(() => {
        const t = [...document.querySelectorAll("div")].find((d) => d.classList.contains("border-t") && /Mostrando/.test(d.textContent ?? ""));
        const r = t.getBoundingClientRect();
        return { x: r.left, y: r.top, w: r.width, h: r.height };
    });
}

/** La tabla hasta donde se VE: del encabezado al pie (las filas de más se desplazan por dentro). */
async function laTablaHastaElPie(p, pie) {
    return p.evaluate((pie) => {
        const r = document.querySelector("table thead").getBoundingClientRect();
        return { x: r.left, y: r.top, w: r.width, h: pie.y - 6 - r.top };
    }, pie);
}

/** El borde de abajo del último módulo del menú: debajo queda hueco para el número. */
async function dondeAcabaElMenu(p) {
    return p.evaluate(() => {
        const menu = [...document.querySelectorAll('[data-sidebar="sidebar"]')].find((m) => m.getBoundingClientRect().width > 0);
        const botones = [...menu.querySelectorAll('[data-sidebar="content"] [data-sidebar="menu-button"]')];
        return Math.max(...botones.map((b) => b.getBoundingClientRect().bottom));
    });
}

/**
 * Lo que pinta el menú RECOGIDO, módulo por módulo: su nombre y si lleva
 * icono. Se guarda en `scripts/menu-guia-leads.json` y lo lee el banco: un
 * módulo sin icono sale como letras recortadas («C…»), que es exactamente como
 * se veía la primera versión de la guía.
 */
async function loQuePintaElMenu(p) {
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

/* ------------------------------------------------------------------ */
/* Las acciones masivas: el menú «⋯» del final de la barra             */
/* ------------------------------------------------------------------ */

/** El botón «⋯» de la barra (el hueco `acciones` de `BarraDeAcciones`). */
const MASIVAS = '[data-zona="acciones"] button';

/** Abre el menú «⋯» y devuelve su contenido (Radix lo pinta en un portal). */
async function abrirLasMasivas(p) {
    await p.locator(MASIVAS).first().click();
    const menu = p.locator('[role="menu"]').last();
    await menu.waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 500); // la animación de entrada mueve y encoge el menú: se mide quieto
    return menu;
}

/** Cierra un menú o un diálogo que siga abierto, sin tocar nada de la página. */
async function cerrarLoAbierto(p) {
    for (let i = 0; i < 3; i += 1) {
        const abierto = await p.$('[role="menu"], [role="alertdialog"]');
        if (!abierto) break;
        await p.keyboard.press("Escape");
        await espera(p, 350);
    }
}

/**
 * Los grupos del menú «⋯», en su orden: el título y sus acciones, cortados
 * por los separadores. Se lee del menú PINTADO, así que un grupo nuevo en
 * `BulkActionsDropdown.tsx` sale en la captura aunque nadie toque esto.
 */
async function losGruposDelMenu(p) {
    return p.evaluate(() => {
        const menu = [...document.querySelectorAll('[role="menu"]')].pop();
        const grupos = [];
        let actual = [];
        for (const hijo of menu.children) {
            if (hijo.getAttribute("role") === "separator") {
                if (actual.length) grupos.push(actual);
                actual = [];
            } else actual.push(hijo);
        }
        if (actual.length) grupos.push(actual);
        return grupos.map((g) => {
            const r = g.map((e) => e.getBoundingClientRect());
            const x = Math.min(...r.map((q) => q.left));
            const y = Math.min(...r.map((q) => q.top));
            return {
                titulo: g[0].textContent.trim(),
                c: { x, y, w: Math.max(...r.map((q) => q.right)) - x, h: Math.max(...r.map((q) => q.bottom)) - y },
            };
        });
    });
}

/* ------------------------------------------------------------------ */
/* Marcar                                                              */
/* ------------------------------------------------------------------ */

/**
 * Pinta las marcas encima de la pantalla real. Cada marca: `c` (la caja),
 * `n` (un número en su esquina), `texto` + `lado` (un rótulo con flecha).
 * `atenuar` apaga todo lo que no está marcado.
 */
async function marcar(p, marcas, { atenuar = false, escala = 1 } = {}) {
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
            for (const { c, n, texto, lado = "arriba", esquina = "izquierda", borde = "arriba", numeroEn, soloLuz } of marcas) {
                // `soloLuz`: se ve sin velo, pero sin recuadro (el menú entero
                // alrededor de la parte que se señala).
                if (soloLuz) continue;
                const r = { x: c.x - PAD, y: c.y - PAD, w: c.w + 2 * PAD, h: c.h + 2 * PAD };
                el("rect", { x: r.x, y: r.y, width: r.w, height: r.h, rx: RX, fill: "none", stroke: "rgba(37,99,235,0.28)", "stroke-width": 9 * escala });
                el("rect", { x: r.x, y: r.y, width: r.w, height: r.h, rx: RX, fill: "none", stroke: AZUL, "stroke-width": 3 * escala });
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

const desmarcar = (p) => p.evaluate(() => document.getElementById("__guia")?.remove());

/** Foto → webp. Las de pantalla completa se bajan a 1600 de ancho; los zoom conservan su nitidez. */
async function guardar(p, nombre, clip, { margenArriba = 0, fondo = "#ffffff" } = {}) {
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
        .toFile(path.join(SALIDA, nombre));
    tomadas.add(nombre);
    console.log("  ✓", nombre);
}

/* ------------------------------------------------------------------ */
/* Las miniaturas del índice                                           */
/* ------------------------------------------------------------------ */

/**
 * Una miniatura por sección, TODAS con la misma receta: la zona que la
 * sección explica, nítida y en su recuadro; el resto, bajo el velo; y el
 * encuadre 16:9 centrado en la zona (`encuadre-de-la-miniatura.mjs`). Se
 * toman sobre la pantalla limpia, así que no dependen del orden de las demás.
 */
async function miniaturas(p) {
    const vista = p.viewportSize();
    const nombreFila = "Juan Pablo Restrepo";
    const interruptor = async (rotulo) => caja(p, (await celdaDe(p, nombreFila, rotulo)).locator('[role="switch"]'));
    const zonas = [
        ["vista-general", async () => unir(await caja(p, '[data-zona="buscador"] input'), await caja(p, '[data-zona="acciones"] button'))],
        ["columnas", async () => caja(p, "table thead")],
        ["sesion-y-agente", async () => unir(await interruptor("Sesión"), await interruptor("Agente"))],
        ["filtros", async () => unir(...(await Promise.all([0, 1, 2, 3].map((i) => caja(p, p.locator('[data-zona="filtros"] button').nth(i))))))],
        ["buscar", async () => caja(p, '[data-zona="buscador"] input')],
        ["exportar", async () => caja(p, 'button[aria-label="Exportar CSV"]')],
        ["nuevo-contacto", async () => caja(p, p.getByRole("button", { name: "+ Nuevo" }))],
        // El botón «⋯» con su menú ABIERTO: cerrado es un icono de 40 px y no
        // dice qué hay dentro.
        ["acciones-masivas", async () => unir(await caja(p, MASIVAS), await caja(p, await abrirLasMasivas(p)))],
    ];
    const focos = {};
    for (const [slug, zona] of zonas) {
        const foco = await zona();
        const e = encuadreDeLaMiniatura(foco, vista);
        await marcar(p, [{ c: foco }], { atenuar: true, escala: e.escala });
        const nombre = `mini-${slug}.webp`;
        const buf = await p.screenshot({ clip: { x: e.x, y: e.y, width: e.w, height: e.h } });
        await sharp(buf).resize(TAMANO_MINI.ancho, TAMANO_MINI.alto, { fit: "fill" }).webp({ quality: 84 }).toFile(path.join(SALIDA, nombre));
        tomadas.add(nombre);
        // En fracción de la miniatura: así el banco mide sin saber el tamaño de la vista.
        focos[nombre] = { x: (foco.x - e.x) / e.w, y: (foco.y - e.y) / e.h, w: foco.w / e.w, h: foco.h / e.h };
        console.log("  ✓", nombre);
        await cerrarLoAbierto(p);
    }
    await desmarcar(p);
    writeFileSync(FOCOS, JSON.stringify(focos, null, 2) + "\n");
}

/* ------------------------------------------------------------------ */
/* Las recetas                                                         */
/* ------------------------------------------------------------------ */

async function capturas(p) {
    const vista = p.viewportSize();
    const buscador = '[data-zona="buscador"] input';
    const pastillas = '[data-zona="filtros"] button';
    const linea = 'button[title="Filtrar por línea"]';
    const exportar = 'button[aria-label="Exportar CSV"]';
    const nuevo = p.getByRole("button", { name: "+ Nuevo" });
    const masivas = MASIVAS;

    const barra = unir(await caja(p, buscador), await caja(p, masivas));
    const cBuscador = await caja(p, buscador);
    const cPastillas = unir(...(await Promise.all([0, 1, 2, 3].map((i) => caja(p, p.locator(pastillas).nth(i))))));
    const cLinea = await caja(p, linea);
    const cExportar = await caja(p, exportar);
    const cNuevo = await caja(p, nuevo);
    const cMasivas = await caja(p, masivas);

    // Portada del vídeo: la pantalla limpia.
    await guardar(p, "portada.webp");

    // 1. Vista general: las cinco zonas, en el orden de `ZONAS_DE_LA_PANTALLA`.
    // El menú y la barra de arriba van metidos unos píxeles: pegados al borde
    // de la pantalla, su recuadro se saldría y se montaría sobre el del vecino.
    const dentro = (c, px) => ({ x: c.x + px, y: c.y + px, w: c.w - 2 * px, h: c.h - 2 * px });
    const cMenuLateral = await caja(p, elMenuLateral(p));
    const cCabecera = await caja(p, LA_BARRA_DE_ARRIBA);
    const cPie = await elPie(p);
    const bajoElMenu = await dondeAcabaElMenu(p);
    await marcar(p, [
        { c: dentro(cMenuLateral, 6), n: 1, numeroEn: { x: cMenuLateral.x + cMenuLateral.w / 2, y: bajoElMenu + 34 } },
        { c: dentro(cCabecera, 6), n: 2, esquina: "centro" },
        { c: barra, n: 3 },
        { c: await laTablaHastaElPie(p, cPie), n: 4 },
        { c: cPie, n: 5 },
    ]);
    await guardar(p, "vista-general.webp");
    writeFileSync(MENU, JSON.stringify(await loQuePintaElMenu(p), null, 2) + "\n");
    await marcar(p, [
        { c: cBuscador, n: 1 },
        { c: cPastillas, n: 2 },
        { c: cLinea, n: 3 },
        { c: cExportar, n: 4 },
        { c: cNuevo, n: 5 },
        { c: cMasivas, n: 6 },
    ]);
    await guardar(p, "barra.webp", holgura(barra, 34, vista));
    const pie = cPie;
    await marcar(p, [
        { c: await caja(p, p.locator("text=/Mostrando/").first()), texto: "Cuántos ves de cuántos hay", lado: "arriba" },
        { c: await caja(p, p.locator("text=/Página/").first().locator("xpath=..")), texto: "Cambiar de página", lado: "arriba" },
    ]);
    await guardar(p, "paginacion.webp", holgura({ ...pie, y: pie.y - 120, h: pie.h + 120 }, 8, vista));
    await desmarcar(p);

    // 2. Columnas
    const tabla6 = await laTabla(p, 6);
    const columnas = [
        ["WhatsApp", "col-whatsapp.webp", "Abre el chat"],
        ["Nombre", "col-nombre.webp", "Nombre del contacto"],
        ["Sesión", "col-sesion.webp", "Conversación abierta o cerrada"],
        ["Agente", "col-agente.webp", "¿La IA le responde?"],
        ["Creado", "col-creado.webp", "Cuándo entró"],
        ["Flujos", "col-flujos.webp", "Flujos recorridos"],
        ["Seguimientos", "col-seguimientos.webp", "Mensajes programados"],
        ["Etiquetas", "col-etiquetas.webp", "Sus etiquetas"],
        ["Acciones", "col-acciones.webp", "Menú de la fila"],
    ];
    for (const [rotulo, nombre, texto] of columnas) {
        const c = await laColumna(p, rotulo, 6);
        await marcar(p, [{ c, texto, lado: "abajo" }], { atenuar: true });
        await guardar(p, nombre, holgura(unir(tabla6, { ...c, h: c.h + 90 }), 12, vista));
    }
    await desmarcar(p);

    // Flujos: el nombre de los flujos al posar el cursor (lo enseña la captura de la columna; aquí no hace falta más).

    // Seguimientos: el detalle.
    await (await celdaDe(p, "Andrés Gómez", "Seguimientos")).locator("button").first().click();
    await p.waitForSelector('[role="dialog"]', { timeout: 15000 });
    await espera(p, 2500);
    await marcar(p, [{ c: await caja(p, '[role="dialog"]') }], { atenuar: true });
    await guardar(p, "seguimientos-detalle.webp");
    await desmarcar(p);
    await p.keyboard.press("Escape");
    await espera(p, 600);

    // Etiquetas: el selector.
    const celdaEtiquetas = await celdaDe(p, "María Fernanda López", "Etiquetas");
    await celdaEtiquetas.locator("button").first().click();
    await espera(p, 900);
    const popover = p.locator('[data-radix-popper-content-wrapper]').last();
    const cPop = await caja(p, popover);
    const cCeldaEt = await caja(p, celdaEtiquetas);
    await marcar(p, [{ c: cCeldaEt, n: 1 }, { c: cPop, n: 2 }], { atenuar: true });
    await guardar(p, "etiquetas-menu.webp", holgura(unir(cPop, cCeldaEt), 40, vista));
    await desmarcar(p);
    await p.keyboard.press("Escape");
    await espera(p, 500);

    // Acciones: el menú de la fila.
    const celdaAcc = await celdaDe(p, "María Fernanda López", "Acciones");
    await celdaAcc.locator("button").first().click();
    await espera(p, 700);
    const menu = p.locator('[role="menu"]').last();
    const cMenu = await caja(p, menu);
    const cCeldaAcc = await caja(p, celdaAcc);
    await marcar(p, [{ c: cCeldaAcc, n: 1 }, { c: cMenu, n: 2 }], { atenuar: true });
    await guardar(p, "acciones-menu.webp", holgura(unir(cMenu, cCeldaAcc, { ...cMenu, x: cMenu.x - 380 }), 30, vista));
    await desmarcar(p);
    await p.keyboard.press("Escape");
    await espera(p, 500);

    // 3. Sesión y agente
    const nombreFila = "Juan Pablo Restrepo";
    const zonaFila = async () => unir(await caja(p, fila(p, nombreFila)), tabla6);
    const sw = async (rotulo) => caja(p, (await celdaDe(p, nombreFila, rotulo)).locator('[role="switch"]'));

    await marcar(p, [{ c: await sw("Sesión"), texto: "Sesión abierta", lado: "abajo" }], { atenuar: true });
    await guardar(p, "sesion-interruptor.webp", holgura(await zonaFila(), 14, vista));
    await (await celdaDe(p, nombreFila, "Sesión")).locator('[role="switch"]').click();
    await p.waitForSelector("[data-sonner-toast]", { timeout: 15000 });
    await espera(p, 1500);
    await marcar(p, [
        { c: await sw("Sesión"), texto: "Ahora en pausa", lado: "abajo" },
        { c: await caja(p, p.locator("[data-sonner-toast]").last()) },
    ], { atenuar: true });
    await guardar(p, "sesion-apagada.webp");
    await desmarcar(p);
    await quitarAvisos(p);
    await (await celdaDe(p, nombreFila, "Sesión")).locator('[role="switch"]').click();
    await espera(p, 2000);
    await quitarAvisos(p);

    await marcar(p, [{ c: await sw("Agente"), texto: "La IA le responde", lado: "abajo" }], { atenuar: true });
    await guardar(p, "agente-interruptor.webp", holgura(await zonaFila(), 14, vista));
    await (await celdaDe(p, nombreFila, "Agente")).locator('[role="switch"]').click();
    await p.waitForSelector("[data-sonner-toast]", { timeout: 15000 });
    await espera(p, 1500);
    await marcar(p, [
        { c: await sw("Agente"), texto: "La IA ya no le escribe", lado: "abajo" },
        { c: await caja(p, p.locator("[data-sonner-toast]").last()) },
    ], { atenuar: true });
    await guardar(p, "agente-apagado.webp");
    await desmarcar(p);
    await quitarAvisos(p);
    await (await celdaDe(p, nombreFila, "Agente")).locator('[role="switch"]').click();
    await espera(p, 2000);
    await quitarAvisos(p);

    // 4. Filtros
    const pastilla = (i) => caja(p, p.locator(pastillas).nth(i));
    await marcar(p, await Promise.all([0, 1, 2, 3].map(async (i) => ({ c: await pastilla(i), n: i + 1 }))));
    await guardar(p, "filtros-pastillas.webp", holgura(unir(cBuscador, cLinea), 22, vista));
    await desmarcar(p);
    await p.locator(pastillas).nth(1).hover();
    await espera(p, 900);
    const tip = p.locator('[role="tooltip"]').first();
    const cTip = await caja(p, tip);
    await marcar(p, [{ c: await pastilla(1) }]);
    await guardar(p, "filtros-nombre.webp", holgura(unir(cBuscador, cLinea, cTip), 22, vista));
    await desmarcar(p);
    await p.mouse.move(vista.width / 2, vista.height - 20);
    await p.locator(pastillas).nth(2).click();
    await espera(p, 2500);
    await marcar(p, [
        { c: await pastilla(2), texto: "Filtro puesto", lado: "derecha" },
    ]);
    await guardar(p, "filtros-activo.webp");
    await desmarcar(p);
    await p.locator(pastillas).nth(0).click();
    await espera(p, 2500);
    await marcar(p, [{ c: await pastilla(0), texto: "Quita el filtro", lado: "abajo" }]);
    await guardar(p, "filtros-total.webp", holgura(unir(cBuscador, cLinea, { ...cBuscador, y: cBuscador.y + 110, h: 1 }), 22, vista));
    await desmarcar(p);

    // 5. Buscar
    await marcar(p, [{ c: cBuscador, texto: "Escribe aquí", lado: "abajo" }]);
    await guardar(p, "buscar-campo.webp", holgura(unir(cBuscador, cLinea, { ...cBuscador, y: cBuscador.y + 110, h: 1 }), 22, vista));
    await desmarcar(p);
    await p.fill(buscador, "Valentina");
    await espera(p, 2500);
    await marcar(p, [{ c: cBuscador }, { c: await laTabla(p, 5), texto: "Solo los que coinciden", lado: "abajo" }]);
    await guardar(p, "buscar-resultado.webp");
    await p.fill(buscador, "3004521");
    await espera(p, 2500);
    await marcar(p, [{ c: cBuscador }, { c: await laTabla(p, 3), texto: "Encontrado por número", lado: "abajo" }]);
    await guardar(p, "buscar-numero.webp");
    await desmarcar(p);
    await p.fill(buscador, "");
    await espera(p, 2500);

    // 6. Exportar
    await marcar(p, [{ c: cExportar, texto: "Exportar CSV", lado: "abajo" }]);
    await guardar(p, "exportar-boton.webp", holgura(unir(cLinea, cMasivas, { ...cMasivas, y: cMasivas.y + 110, h: 1 }), 22, vista));
    await desmarcar(p);
    const [descarga] = await Promise.all([p.waitForEvent("download", { timeout: 30000 }), p.click(exportar)]);
    const csv = path.join(TMP, "contactos.csv");
    await descarga.saveAs(csv);
    await p.waitForSelector("[data-sonner-toast]", { timeout: 15000 });
    await espera(p, 1200);
    await marcar(p, [{ c: cExportar }, { c: await caja(p, p.locator("[data-sonner-toast]").last()), texto: "Listo", lado: "arriba" }], { atenuar: true });
    await guardar(p, "exportar-aviso.webp");
    await desmarcar(p);
    await quitarAvisos(p);

    // El archivo, abierto como hoja de cálculo: se pinta el CSV que se acaba
    // de descargar, no uno inventado.
    await pintarElCsv(p, csv, "exportar-archivo.webp");
    await abrirLeads(p);

    // 7. Nuevo contacto
    await marcar(p, [{ c: await caja(p, p.getByRole("button", { name: "+ Nuevo" })), texto: "+ Nuevo", lado: "abajo" }]);
    await guardar(p, "nuevo-boton.webp", holgura(unir(cLinea, cMasivas, { ...cMasivas, y: cMasivas.y + 110, h: 1 }), 22, vista));
    await desmarcar(p);
    await p.getByRole("button", { name: "+ Nuevo" }).click();
    await p.waitForSelector('[role="dialog"] input#cc-phone', { timeout: 15000 });
    await espera(p, 500);
    await p.locator('[role="dialog"] select').selectOption("VENTAS");
    await p.fill("#cc-phone", "573001234567");
    await p.fill("#cc-name", "Pedro Ejemplo");
    const dlg = await caja(p, '[role="dialog"]');
    await marcar(p, [
        { c: await caja(p, '[role="dialog"] select'), n: 1, esquina: "derecha" },
        { c: await caja(p, "#cc-phone"), n: 2, esquina: "derecha" },
        { c: await caja(p, "#cc-name"), n: 3, esquina: "derecha" },
        { c: await caja(p, p.getByRole("button", { name: "Crear", exact: true })), texto: "Crear", lado: "abajo" },
    ]);
    await guardar(p, "nuevo-dialogo.webp", holgura(dlg, 70, vista));
    await desmarcar(p);
    await p.getByRole("button", { name: "Crear", exact: true }).click();
    await p.waitForSelector("[data-sonner-toast]", { timeout: 15000 });
    await p.waitForSelector('tbody tr:has-text("Pedro Ejemplo")', { timeout: 30000 });
    await espera(p, 1200);
    await marcar(p, [
        { c: await caja(p, fila(p, "Pedro Ejemplo")), texto: "El contacto nuevo", lado: "abajo" },
        { c: await caja(p, p.locator("[data-sonner-toast]").last()) },
    ], { atenuar: true });
    await guardar(p, "nuevo-creado.webp");
    await desmarcar(p);
    await quitarAvisos(p);

    // 8. Acciones masivas: el menú «⋯» del final de la barra. Se enseña
    // abierto y grupo por grupo, y la ventana de confirmación se CANCELA:
    // nada de esta sección cambia los datos de ejemplo.
    const zonaDelBoton = holgura(unir(cLinea, cMasivas, { ...cMasivas, y: cMasivas.y + 110, h: 1 }), 22, vista);
    await marcar(p, [{ c: cMasivas, texto: "Acciones masivas", lado: "abajo" }]);
    await guardar(p, "masivas-boton.webp", zonaDelBoton);
    await desmarcar(p);
    const menuMasivas = await abrirLasMasivas(p);
    const cMenuMasivas = await caja(p, menuMasivas);
    const grupos = await losGruposDelMenu(p);
    if (grupos.length !== 3) throw new Error(`el menú «⋯» tiene ${grupos.length} grupos: ${grupos.map((g) => g.titulo).join(", ")}`);
    // El menú y, a su izquierda, un trozo de la tabla: se ve de dónde sale.
    const zonaDelMenu = holgura(unir(cMenuMasivas, cMasivas, { ...cMenuMasivas, x: cMenuMasivas.x - 300 }), 26, vista);
    // Los números van a la IZQUIERDA de cada grupo: en su esquina taparían el título.
    await marcar(p, grupos.map((g, i) => ({ c: g.c, n: i + 1, numeroEn: { x: g.c.x - 30, y: g.c.y + 14 } })));
    await guardar(p, "masivas-menu.webp", zonaDelMenu);
    for (const [i, nombre] of ["masivas-exportar.webp", "masivas-gestion.webp", "masivas-riesgo.webp"].entries()) {
        await marcar(p, [{ c: grupos[i].c }], { atenuar: true });
        await guardar(p, nombre, zonaDelMenu);
    }
    await desmarcar(p);
    await menuMasivas.getByRole("menuitem", { name: "Activar clientes", exact: true }).click();
    const alerta = p.locator('[role="alertdialog"]');
    await alerta.waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 600);
    const cAlerta = await caja(p, alerta);
    const cancelar = alerta.getByRole("button", { name: "Cancelar" });
    await marcar(p, [
        { c: await caja(p, cancelar), texto: "No cambia nada", lado: "abajo" },
        { c: await caja(p, alerta.getByRole("button", { name: "Confirmar" })), texto: "Lo aplica a todos", lado: "abajo" },
    ]);
    await guardar(p, "masivas-confirmar.webp", holgura(unir(cAlerta, { ...cAlerta, y: cAlerta.y + cAlerta.h + 84, h: 1 }), 26, vista));
    await desmarcar(p);
    await cancelar.click();
    await alerta.waitFor({ state: "hidden", timeout: 10000 });
    await espera(p, 400);

    await elMarcoDeLaPantalla(p);
}

/**
 * El marco que rodea a Leads —la barra de arriba y el menú de la izquierda—,
 * fotografiado en una ventana de PORTÁTIL. A 1440 la barra sale en una tira
 * tan larga que en la página sus iconos se leen de 6 px, y el menú abierto
 * de alto entero ocupa más de una pantalla de la guía. Se vuelve a la
 * ventana de antes al terminar.
 */
async function elMarcoDeLaPantalla(p) {
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
    // a la vista, con Contactos señalado; lo de al lado, bajo el velo. Abrirlo
    // corre la pantalla, así que se vuelve a recoger antes de seguir (y el
    // vídeo, que sale del estado de esta sesión, lo encuentra recogido: el
    // menú se guarda en una cookie).
    await cambiarA({ width: 1280, height: 720 });
    await elMenuAbierto(p, true);
    const lateral = elMenuLateral(p);
    const cLateral = await caja(p, lateral);
    const contactos = lateral.locator('[data-sidebar="menu-item"]', {
        has: p.locator('[data-sidebar="menu-button"]', { hasText: "Contactos" }),
    });
    await marcar(
        p,
        [{ c: cLateral, soloLuz: true }, { c: await caja(p, contactos.first()), texto: "Leads está en Contactos", lado: "derecha" }],
        { atenuar: true },
    );
    await guardar(p, "menu-lateral.webp", { x: 0, y: 0, w: Math.min(1280, cLateral.w + 520), h: 720 });
    await desmarcar(p);
    await elMenuAbierto(p, false);
    await cambiarA(vista);
}

/** Abre o recoge el menú con las dos flechas de la barra, y espera a que termine de moverse. */
async function elMenuAbierto(p, abierto) {
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

async function pintarElCsv(p, fichero, nombre) {
    const texto = readFileSync(fichero, "utf8").replace(/^﻿/, "");
    const filas = texto
        .trim()
        .split("\n")
        .slice(0, 12)
        .map((l) => [...l.matchAll(/"((?:[^"]|"")*)"/g)].map((m) => m[1].replace(/""/g, '"')));
    await p.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
        body{margin:0;font-family:Arial,sans-serif;background:#fff}
        .barra{background:#107c41;color:#fff;padding:10px 16px;font-size:14px;font-weight:bold}
        table{border-collapse:collapse;font-size:12px}
        th,td{border:1px solid #d4d4d4;padding:5px 8px;white-space:nowrap}
        th{background:#f3f3f3;color:#333}
        tr:first-child td{background:#e7f1ea;font-weight:bold}
        td.n{background:#f3f3f3;color:#666;text-align:center}
        #hoja{display:inline-block}
    </style></head><body><div id="hoja"><div class="barra">contactos_${new Date().toISOString().split("T")[0]}.csv</div>
    <table><tr><th></th>${filas[0].map((_, i) => `<th>${String.fromCharCode(65 + i)}</th>`).join("")}</tr>
    ${filas.map((f, i) => `<tr><td class="n">${i + 1}</td>${f.map((c) => `<td>${c.replace(/</g, "&lt;")}</td>`).join("")}</tr>`).join("")}
    </table></div></body></html>`);
    await espera(p, 300);
    const t = await caja(p, "table");
    const cab = await caja(p, "tr:nth-child(2)");
    await marcar(p, [{ c: cab, texto: "Una columna por dato", lado: "abajo" }]);
    await guardar(p, nombre, holgura(unir(t, await caja(p, ".barra")), 0, p.viewportSize()));
}

/* ------------------------------------------------------------------ */
/* El vídeo                                                            */
/* ------------------------------------------------------------------ */

async function mover(p, locator) {
    const b = await locator.boundingBox();
    await p.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 22 });
    await espera(p, 250);
}
async function pulsar(p, locator) {
    await mover(p, locator);
    await p.mouse.down();
    await espera(p, 90);
    // El clic lo hace el ratón (así el vídeo lo enseña): no se vuelve a pulsar.
    await p.mouse.up();
}
const rotulo = (p, t) => p.evaluate((t) => window.__rotulo?.(t), t);

/**
 * Entre una frase y la siguiente, lo que respira una persona hablando. Era
 * 450-1200 ms y, sumado a esperar que acabara cada acción, dejaba huecos de
 * hasta dos segundos y medio: la narración sonaba cortada. Queda escrito en
 * `voz-de-la-guia/leads.json` con el vídeo.
 */
const RESPIRO_ENTRE_FRASES_MS = 250;
/** El vídeo arranca esto antes de la primera palabra; lo de antes (la carga) se recorta. */
const INICIO_ANTES_DE_HABLAR_MS = 300;

async function video(navegador, estado) {
    const dir = path.join(TMP, "video");
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });

    // Las frases se sintetizan ANTES de grabar: así se sabe cuánto dura cada
    // una y el guion espera a que termine de sonar antes de seguir.
    // Con Cedar, lo que falte se pide a OpenAI (o se dice por qué no se pudo).
    if (usaCedar()) await llenarLaCache(Object.values(NARRACION).map((n) => n.texto));
    const dicho = (texto) => (usaCedar() ? texto : comoSeDice(texto));
    const voz = Object.fromEntries(
        Object.entries(NARRACION).map(([id, n]) => [id, { ...n, audio: sintetizar(dicho(n.texto), path.join(dir, `${id}.wav`)) }]),
    );
    const ctx = await navegador.newContext({
        viewport: { width: 1280, height: 800 },
        locale: "es-CO",
        timezoneId: "America/Bogota",
        storageState: estado,
        acceptDownloads: true,
    });
    await ctx.addInitScript(CURSOR);
    const p = await ctx.newPage();
    // No `recordVideo`: estiraba el vídeo cada vez que el navegador pintaba
    // deprisa y la imagen se iba quedando detrás de la voz (ver la grabadora).
    const mudo = path.join(dir, "pantalla.mkv");
    const grabadora = await grabar(p, mudo, { ancho: 1280, alto: 800 });
    const t0 = Date.now();
    grabadora.empezarEn(t0);
    const tramos = [];
    let calla = 0;
    /** La frase que suena: con ella `alDecir` sabe en qué palabra va. */
    let frase = null;
    /** Empieza una frase ahora mismo; lo que venga detrás ocurre MIENTRAS suena. */
    const decir = async (id) => {
        await callar();
        const n = voz[id];
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
    /** Espera a que la frase en curso termine, más un respiro corto: las frases se ENLAZAN. */
    const callar = async (respiro = RESPIRO_ENTRE_FRASES_MS) => {
        const falta = calla + respiro - Date.now();
        if (calla && falta > 0) await espera(p, falta);
        calla = 0;
    };

    await abrirLeads(p);
    await p.mouse.move(640, 400, { steps: 8 });
    // Lo grabado hasta aquí es la página cargando: el vídeo empieza justo
    // antes de la primera palabra.
    const desdeMs = Math.max(0, Date.now() - t0 - INICIO_ANTES_DE_HABLAR_MS);
    await decir("intro");
    await alDecir("todos los contactos", 600);
    await p.mouse.move(760, 520, { steps: 30 });

    // El menú de la izquierda: se abre con las dos flechas, se señala dónde
    // está Leads y se vuelve a recoger —al empezar la frase siguiente, que es
    // la de la barra donde viven las flechas—.
    const flechas = p.locator('[data-inicio-de-la-barra] [data-sidebar="trigger"]');
    const contactos = elMenuLateral(p).locator('[data-sidebar="menu-button"]', { hasText: "Contactos" }).first();
    await decir("menu");
    await alDecir("con estas dos flechas");
    await pulsar(p, flechas);
    await alDecir("dentro de Contactos", 600);
    await mover(p, contactos);

    const [, , , buscarTodo, soporte, campana] = lasPartesDeArriba(p);
    await decir("barraDeArriba");
    await pulsar(p, flechas);
    await alDecir("el buscador general");
    await mover(p, buscarTodo.first());
    await alDecir("el botón de soporte");
    await mover(p, soporte.first());
    await alDecir("tus notificaciones");
    await mover(p, campana.first());

    const pastillas = p.locator('[data-zona="filtros"] button');
    await decir("contadores");
    await mover(p, pastillas.nth(0));
    await alDecir("Clientes inactivos");
    await pulsar(p, pastillas.nth(2));
    await alDecir("con Total");
    await pulsar(p, pastillas.nth(0));

    const buscador = p.locator('[data-zona="buscador"] input');
    await decir("buscar");
    await pulsar(p, buscador);
    await buscador.pressSequentially("María", { delay: 120 });
    await alDecir("por su número", 250);
    await buscador.fill("");
    await buscador.pressSequentially("3004521", { delay: 70 });

    // El buscador se vacía al empezar la frase siguiente: la lista vuelve
    // mientras el ratón va hacia el interruptor.
    const filaDelEjemplo = fila(p, "Juan Pablo Restrepo");
    const agente = (await celdaDe(p, "Juan Pablo Restrepo", "Agente")).locator('[role="switch"]');
    await callar();
    await buscador.fill("");
    await decir("agente");
    await filaDelEjemplo.waitFor({ state: "visible", timeout: 15000 });
    await mover(p, agente);
    await alDecir("apagado", 300);
    await pulsar(p, agente);
    await alDecir("lo pulsas otra vez", 300);
    await pulsar(p, agente);

    const exportar = p.locator('button[aria-label="Exportar CSV"]');
    await decir("exportar");
    await Promise.all([p.waitForEvent("download", { timeout: 30000 }).catch(() => null), pulsar(p, exportar)]);

    const nuevo = p.getByRole("button", { name: "+ Nuevo" });
    await decir("nuevo");
    await pulsar(p, nuevo);
    await p.waitForSelector("#cc-phone");
    const lineaDelDialogo = p.locator('[role="dialog"] select');
    await alDecir("eliges la línea");
    await mover(p, lineaDelDialogo);
    await lineaDelDialogo.selectOption("VENTAS");
    await alDecir("escribes el número");
    await pulsar(p, p.locator("#cc-phone"));
    await p.locator("#cc-phone").pressSequentially("573009876543", { delay: 45 });
    await alDecir("y el nombre", 300);
    await pulsar(p, p.locator("#cc-name"));
    await p.locator("#cc-name").pressSequentially("Ana Demo", { delay: 60 });

    await decir("crear");
    await mover(p, p.getByRole("button", { name: "Crear", exact: true }));
    await alDecir("aquí lo cancelamos");
    await pulsar(p, p.getByRole("button", { name: "Cancelar" }));

    // Las acciones masivas: se abre el menú «⋯», se recorren sus tres grupos
    // mientras se nombran, y la confirmación se CANCELA.
    const menu = p.locator('[role="menu"]').last();
    const accion = (nombre) => menu.getByRole("menuitem", { name: nombre, exact: true });
    await decir("masivas");
    await p.locator('[role="dialog"]').waitFor({ state: "hidden", timeout: 10000 });
    await pulsar(p, p.locator(MASIVAS).first());
    await menu.waitFor({ state: "visible", timeout: 10000 });
    await alDecir("exportar a Excel");
    await mover(p, accion("Exportar a Excel"));
    await alDecir("Google Sheets", 250);
    await mover(p, accion("Sincronizar a Google Sheets"));
    await alDecir("activar o desactivar");
    await mover(p, accion("Activar clientes"));
    await alDecir("riesgo alto");
    await mover(p, accion("Borrar historial"));

    const alerta = p.locator('[role="alertdialog"]');
    await decir("cierre");
    await pulsar(p, accion("Activar clientes"));
    await alerta.waitFor({ state: "visible", timeout: 10000 });
    await alDecir("siempre puedes cancelar");
    await pulsar(p, alerta.getByRole("button", { name: "Cancelar" }));
    await callar(700);
    await rotulo(p, "");
    await espera(p, 500);

    const totalMs = Date.now() - t0;
    const grabado = await grabadora.parar();
    console.log(`  · grabados ${grabado.fotogramas} fotogramas (${(grabado.fotogramas / 25).toFixed(1)} s) de ${grabado.recibidos} pintados, en ${(totalMs / 1000).toFixed(1)} s`);
    await ctx.close();

    const { wav, colocados } = montarLaPista(tramos, totalMs);
    const pista = path.join(dir, "narracion.wav");
    guardarWav(pista, wav);
    const destino = path.join(SALIDA, "demostracion.webm");
    mezclar(mudo, pista, destino, { desdeMs });
    writeFileSync(path.join(TMP, "narracion.json"), JSON.stringify(colocados, null, 2));
    // Qué voz lleva el vídeo publicado: el banco lo compara con el guion de hoy.
    writeFileSync(
        path.join(import.meta.dirname, "voz-de-la-guia", "leads.json"),
        JSON.stringify(
            usaCedar()
                ? {
                      voz: VOZ_CEDAR.voz,
                      modelo: VOZ_CEDAR.modelo,
                      ritmo: { ...RITMO, respiroEntreFrasesMs: RESPIRO_ENTRE_FRASES_MS },
                      frases: Object.values(NARRACION).map((n) => llaveDeLaFrase(n.texto)),
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
    console.log("  ✓ demostracion.webm", Math.round(statSync(destino).size / 1024), "KB,", colocados.length, "frases narradas");
}

/* ------------------------------------------------------------------ */

const navegador = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined });
try {
    const ctx = await navegador.newContext({
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 2,
        locale: "es-CO",
        timezoneId: "America/Bogota",
        acceptDownloads: true,
    });
    const p = await entrar(ctx);
    await abrirLeads(p);
    if (!SOLO_VIDEO) await miniaturas(p);
    if (!SOLO_MINIATURAS && !SOLO_VIDEO) await capturas(p);
    const estado = await ctx.storageState();
    await ctx.close();
    if (!SIN_VIDEO && !SOLO_MINIATURAS) await video(navegador, estado);
} finally {
    await navegador.close();
}

// Las que la guía enseña tienen que estar TODAS.
const esperadas = JSON.parse(process.env.CAPTURAS_ESPERADAS ?? "[]");
// Con SOLO_MINIATURAS, lo demás se conserva del disco: basta con que esté.
const faltan = esperadas.filter((n) => !tomadas.has(n) && !((SOLO_MINIATURAS || SOLO_VIDEO) && existsSync(path.join(SALIDA, n))));
const sobran = readdirSync(SALIDA).filter((n) => n.endsWith(".webp") && !esperadas.includes(n));
if (sobran.length) console.warn("[guia] capturas que la guía no enseña:", sobran.join(", "));
if (faltan.length) {
    console.error("[guia] faltan capturas que la guía enseña:", faltan.join(", "));
    process.exit(1);
}
writeFileSync(path.join(TMP, "tomadas.json"), JSON.stringify([...tomadas], null, 2));
console.log(`[guia] ${tomadas.size} capturas${SIN_VIDEO || SOLO_MINIATURAS ? "" : " y el vídeo"} en public/guia/leads`);
