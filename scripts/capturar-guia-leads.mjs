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
import {
    caja,
    cerrarLoAbierto,
    dentro,
    desmarcar,
    despejar,
    dondeAcabaElMenu,
    elGuardado,
    elMarcoDeLaPantalla,
    elMenuLateral,
    entrar,
    espera,
    holgura,
    LA_BARRA_DE_ARRIBA,
    lasPartesDeArriba,
    loQuePintaElMenu,
    marcar,
    mover,
    pulsar,
    quitarAvisos,
    rotulo,
    unir,
} from "./herramientas-de-la-guia.mjs";

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
/** Las marcas, el guardado y el ratón son los de todas las guías (`herramientas-de-la-guia.mjs`). */
const guardar = elGuardado({ salida: SALIDA, tomadas });

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

    await elMarcoDeLaPantalla(p, guardar, { modulo: "Contactos", rotulo: "Leads está en Contactos" });
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
    const p = await entrar(ctx, BASE);
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
