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
import { SALIDA as TAMANO_MINI, encuadreDeLaMiniatura } from "./encuadre-de-la-miniatura.mjs";
import { NARRACION, comoSeDice } from "./narracion-guia-leads.mjs";
import { guardarWav, mezclar, montarLaPista, sintetizar, usaCedar } from "./voz-de-la-guia.mjs";
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
            for (const { c, n, texto, lado = "arriba", esquina = "izquierda" } of marcas) {
                const r = { x: c.x - PAD, y: c.y - PAD, w: c.w + 2 * PAD, h: c.h + 2 * PAD };
                el("rect", { x: r.x, y: r.y, width: r.w, height: r.h, rx: RX, fill: "none", stroke: "rgba(37,99,235,0.28)", "stroke-width": 9 * escala });
                el("rect", { x: r.x, y: r.y, width: r.w, height: r.h, rx: RX, fill: "none", stroke: AZUL, "stroke-width": 3 * escala });
                if (n !== undefined) {
                    const cx = Math.min(Math.max(esquina === "derecha" ? r.x + r.w : r.x, 15), W - 15);
                    const cy = Math.min(Math.max(r.y, 15), H - 15);
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
async function guardar(p, nombre, clip) {
    const buf = await p.screenshot(clip ? { clip: { x: clip.x, y: clip.y, width: clip.w, height: clip.h } } : {});
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
    const masivas = '[data-zona="acciones"] button';

    const barra = unir(await caja(p, buscador), await caja(p, masivas));
    const cBuscador = await caja(p, buscador);
    const cPastillas = unir(...(await Promise.all([0, 1, 2, 3].map((i) => caja(p, p.locator(pastillas).nth(i))))));
    const cLinea = await caja(p, linea);
    const cExportar = await caja(p, exportar);
    const cNuevo = await caja(p, nuevo);
    const cMasivas = await caja(p, masivas);

    // Portada del vídeo: la pantalla limpia.
    await guardar(p, "portada.webp");

    // 1. Vista general
    await marcar(p, [
        { c: cBuscador, n: 1 },
        { c: cPastillas, n: 2 },
        { c: cLinea, n: 3 },
        { c: cExportar, n: 4 },
        { c: cNuevo, n: 5 },
        { c: cMasivas, n: 6 },
        { c: await laTabla(p, 10), n: 7 },
    ]);
    await guardar(p, "vista-general.webp");
    await marcar(p, [
        { c: cBuscador, n: 1 },
        { c: cPastillas, n: 2 },
        { c: cLinea, n: 3 },
        { c: cExportar, n: 4 },
        { c: cNuevo, n: 5 },
        { c: cMasivas, n: 6 },
    ]);
    await guardar(p, "barra.webp", holgura(barra, 34, vista));
    const pie = await p.evaluate(() => {
        const t = [...document.querySelectorAll("div")].find((d) => d.classList.contains("border-t") && /Mostrando/.test(d.textContent ?? ""));
        const r = t.getBoundingClientRect();
        return { x: r.left, y: r.top, w: r.width, h: r.height };
    });
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
        recordVideo: { dir, size: { width: 1280, height: 800 } },
        acceptDownloads: true,
    });
    await ctx.addInitScript(CURSOR);
    const p = await ctx.newPage();
    const t0 = Date.now();
    const tramos = [];
    let calla = 0;
    /** Empieza una frase ahora mismo; lo que venga detrás ocurre MIENTRAS suena. */
    const decir = async (id) => {
        await callar();
        const n = voz[id];
        await rotulo(p, n.rotulo);
        tramos.push({ texto: n.texto, audio: n.audio, inicioMs: Date.now() - t0 });
        calla = Date.now() + n.audio.ms;
    };
    /** Espera a que la frase en curso termine, más un respiro. */
    const callar = async (respiro = 450) => {
        const falta = calla + respiro - Date.now();
        if (calla && falta > 0) await espera(p, falta);
        calla = 0;
    };

    await abrirLeads(p);
    await p.mouse.move(640, 400, { steps: 8 });
    await decir("intro");
    await espera(p, 1200);

    const pastillas = p.locator('[data-zona="filtros"] button');
    await decir("contadores");
    await espera(p, 1800);
    await pulsar(p, pastillas.nth(2));
    await espera(p, 1500);
    await decir("todos");
    await pulsar(p, pastillas.nth(0));
    await espera(p, 800);

    const buscador = p.locator('[data-zona="buscador"] input');
    await decir("buscar");
    await pulsar(p, buscador);
    await buscador.pressSequentially("María", { delay: 160 });
    await callar(1200);
    await buscador.fill("");
    await espera(p, 800);

    const agente = (await celdaDe(p, "Juan Pablo Restrepo", "Agente")).locator('[role="switch"]');
    await decir("agente");
    await mover(p, agente);
    await espera(p, 1400);
    await pulsar(p, agente);
    await decir("agenteOtraVez");
    await espera(p, 1200);
    await pulsar(p, agente);

    await decir("exportar");
    const exportar = p.locator('button[aria-label="Exportar CSV"]');
    await espera(p, 600);
    await Promise.all([p.waitForEvent("download", { timeout: 30000 }).catch(() => null), pulsar(p, exportar)]);
    await callar();
    await quitarAvisos(p);

    await decir("nuevo");
    const nuevo = p.getByRole("button", { name: "+ Nuevo" });
    await pulsar(p, nuevo);
    await p.waitForSelector("#cc-phone");
    await espera(p, 800);
    await p.locator('[role="dialog"] select').selectOption("VENTAS");
    await pulsar(p, p.locator("#cc-phone"));
    await p.locator("#cc-phone").pressSequentially("573009876543", { delay: 90 });
    await pulsar(p, p.locator("#cc-name"));
    await p.locator("#cc-name").pressSequentially("Ana Demo", { delay: 110 });
    await callar(600);
    await decir("cierre");
    await pulsar(p, p.getByRole("button", { name: "Cancelar" }));
    await callar(900);
    await rotulo(p, "");
    await espera(p, 700);

    const totalMs = Date.now() - t0;
    const mudo = await p.video().path();
    await ctx.close();

    const { wav, colocados } = montarLaPista(tramos, totalMs);
    const pista = path.join(dir, "narracion.wav");
    guardarWav(pista, wav);
    const destino = path.join(SALIDA, "demostracion.webm");
    mezclar(mudo, pista, destino);
    writeFileSync(path.join(TMP, "narracion.json"), JSON.stringify(colocados, null, 2));
    // Qué voz lleva el vídeo publicado: el banco lo compara con el guion de hoy.
    writeFileSync(
        path.join(import.meta.dirname, "voz-de-la-guia", "leads.json"),
        JSON.stringify(
            usaCedar()
                ? { voz: VOZ_CEDAR.voz, modelo: VOZ_CEDAR.modelo, frases: Object.values(NARRACION).map((n) => llaveDeLaFrase(n.texto)) }
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
