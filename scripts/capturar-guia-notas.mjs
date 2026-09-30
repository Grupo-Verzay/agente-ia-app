/**
 * Toma las CAPTURAS y graba el VÍDEO de la guía pública de Mis notas, sobre la
 * App servida de verdad (`next start`, sesión real, datos de
 * `sembrar-guia-notas.mjs`).
 *
 * La MISMA forma que la de Leads, Catálogo y Diagramas: cada captura es una
 * receta —abre esto, pulsa aquello, resalta este elemento— y las marcas se
 * dibujan encima de la pantalla real. Lo que no depende de la pantalla
 * —entrar, medir, marcar, guardar, las miniaturas, el marco (el menú y la
 * barra de arriba) y la narración (`decir`/`alDecir`/`callar`)— viene del
 * taller común de las guías (`taller-de-la-guia.mjs`): por eso las cuatro se
 * leen como la misma guía. Aquí van solo las recetas de Mis notas.
 *
 * Los elementos se localizan por lo que la pantalla ya expone —los `title` de
 * los botones, que son también lo que el banco compara con la guía, y las
 * marcas `data-*` de `NotesSidebar` y `NotesEditor`—, nunca por coordenadas:
 * si un botón se mueve, la flecha se va con él.
 *
 * Las capturas CAMBIAN los datos (crean una nota, una carpeta, fijan, mueven,
 * comparten…), así que antes del vídeo se vuelve a sembrar: el vídeo sale del
 * mismo punto de partida que la primera captura.
 *
 * Se lanza con `scripts/generar-guia-notas.sh`.
 */
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

import { CURSOR } from "./cursor-de-la-guia.mjs";
import { grabar } from "./grabadora-de-la-guia.mjs";
import { NARRACION, comoSeDice } from "./narracion-guia-notas.mjs";
import { guardarWav, mezclar, montarLaPista } from "./voz-de-la-guia.mjs";
import {
    LA_BARRA_DE_ARRIBA,
    caja,
    comprobarLasCapturas,
    crearGuardar,
    dentro,
    desmarcar,
    despejar,
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
    tomarLasMiniaturas,
    unir,
} from "./taller-de-la-guia.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const BASE = process.env.BASE ?? "http://localhost:3940";
const RAIZ = path.resolve(import.meta.dirname, "..");
const SALIDA = path.join(RAIZ, "public", "guia", "notas");
const TMP = process.env.TMP_GUIA ?? "/tmp/guia-notas";
const SIN_VIDEO = process.env.SIN_VIDEO === "1";
/** Solo las miniaturas del índice: no rehace los pasos ni el vídeo. */
const SOLO_MINIATURAS = process.env.SOLO_MINIATURAS === "1";
/** Solo el vídeo: las imágenes se conservan del disco. */
const SOLO_VIDEO = process.env.SOLO_VIDEO === "1";
/** Dónde quedó el recuadro dentro de cada miniatura: lo lee el banco para medir el enfoque. */
const FOCOS = path.join(RAIZ, "scripts", "miniaturas-guia-notas.json");
/** Lo que pinta el menú recogido en las capturas: lo lee el banco. */
const MENU = path.join(RAIZ, "scripts", "menu-guia-notas.json");

mkdirSync(SALIDA, { recursive: true });
mkdirSync(TMP, { recursive: true });

const tomadas = new Set();
const guardar = crearGuardar({ salida: SALIDA, tomadas });

/* ------------------------------------------------------------------ */
/* Dónde está cada cosa                                                */
/* ------------------------------------------------------------------ */

const PANEL = "[data-panel-de-notas]";
const LA_NOTA = "[data-nota-abierta]";
const BARRA_DE_LA_NOTA = "[data-barra-de-la-nota]";
const BARRA_DE_FORMATO = "[data-barra-de-formato]";
const TITULO = "[data-titulo-de-la-nota] input";
const TEXTO = `${LA_NOTA} .ProseMirror`;

/** Un botón de la barra de la nota, por el nombre que enseña al posar el cursor. */
const boton = (p, titulo) => p.locator(`${BARRA_DE_LA_NOTA} button[title="${titulo}"]`).first();
/** Un botón de la barra de formato, igual. */
const formato = (p, titulo) => p.locator(`${BARRA_DE_FORMATO} button[title="${titulo}"]`).first();
/** Una nota de la lista del panel, por su título. */
const laFila = (p, titulo) => p.locator("[data-nota-de-la-lista]", { hasText: titulo }).first();
/** Una carpeta del panel, por su nombre. */
const laCarpeta = (p, nombre) => p.locator("[data-carpeta]", { hasText: nombre }).first();
/** Una pestaña del panel, por su nombre entero (`title`). */
const laPestana = (p, titulo) => p.locator(`[data-pestanas-del-panel] [role="tab"][title="${titulo}"]`).first();
/** El menú desplegable que se acaba de abrir (Radix lo pinta en un portal). */
const elMenu = (p) => p.locator('[role="menu"]').last();

/**
 * Cierra las VENTANAS que abren las miniaturas —vincular un contacto,
 * compartir, la lista de un selector—, sin guardar nada. El taller solo cierra
 * menús y confirmaciones (`cerrarLoAbierto`); estas no lo son.
 */
async function cerrarLasVentanas(p) {
    for (let i = 0; i < 3; i += 1) {
        if (!(await p.$('[role="dialog"], [role="listbox"]'))) break;
        await p.keyboard.press("Escape");
        await espera(p, 350);
    }
}

async function abrirNotas(p) {
    await p.goto(`${BASE}/notas`, { waitUntil: "domcontentloaded" });
    await p.waitForSelector(`${PANEL} [data-nota-de-la-lista]`, { timeout: 90000 });
    await p.evaluate(() => document.fonts.ready);
    await espera(p, 2000);
    await despejar(p);
    // Los botones del borde (nota rápida, copiloto, equipo) son de TODAS las
    // pantallas: aquí tapan la barra de la nota y no explican nada de Mis notas.
    await esconderLosBotonesDelBorde(p);
}

/** El ratón, fuera de todo: un botón con el cursor encima sale resaltado. */
const apartar = (p) => p.mouse.move(p.viewportSize().width - 30, p.viewportSize().height - 30);

/** Abre una nota de la lista y espera a que su editor esté listo. */
async function abrirNota(p, titulo) {
    await laFila(p, titulo).click();
    await p.waitForFunction((t) => document.querySelector("[data-titulo-de-la-nota] input")?.value === t, titulo, { timeout: 20000 });
    await p.locator(TEXTO).waitFor({ state: "visible", timeout: 20000 });
    // El «Guardando…» de la nota de antes (su guardado va a los 1,5 s) no
    // puede salir en la foto de esta. (Una compartida de solo lectura no
    // guarda: dice «Solo lectura».)
    await p.waitForFunction(() => !/Guardando/.test(document.querySelector("[data-estado-de-guardado]")?.textContent ?? ""), null, { timeout: 20000 });
    await espera(p, 700);
    await apartar(p);
}

async function laPestanaAbierta(p, titulo) {
    await laPestana(p, titulo).click();
    await espera(p, 1200);
}

/**
 * Pone el cursor al final (o al principio) del texto de la nota: un clic de
 * verdad sobre la última (o la primera) letra, que es lo que se ve en el
 * vídeo, y después el cursor del propio editor, que es lo que lo garantiza.
 * Un clic sobre la caja del bloque y `Control+End` no bastaban: el clic caía
 * fuera del texto, el editor perdía el foco, y el botón de la barra lo
 * devolvía a donde estaba antes —delante de todo—, así que la lista de
 * tareas salía arriba con otra línea pegada detrás («…oficinaLista de
 * compras»).
 */
async function elCursorEn(p, donde) {
    const final = donde === "final";
    const punto = await p.evaluate(
        ({ sel, final }) => {
            const raiz = document.querySelector(sel);
            const textos = [];
            const recorrido = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
            while (recorrido.nextNode()) if (recorrido.currentNode.textContent.trim()) textos.push(recorrido.currentNode);
            const n = final ? textos.at(-1) : textos[0];
            const r = document.createRange();
            r.setStart(n, final ? n.textContent.length - 1 : 0);
            r.setEnd(n, final ? n.textContent.length : 1);
            const q = r.getBoundingClientRect();
            return { x: final ? q.right - 1 : q.left + 1, y: q.top + q.height / 2 };
        },
        { sel: TEXTO, final },
    );
    await p.mouse.move(punto.x, punto.y, { steps: 14 });
    await p.mouse.click(punto.x, punto.y);
    await p.evaluate(({ sel, final }) => document.querySelector(sel)?.editor?.commands.focus(final ? "end" : "start"), { sel: TEXTO, final });
}

/** Espera a que la nota diga «Guardado» (el guardado automático va a los 1,5 s de dejar de escribir). */
async function guardada(p) {
    await p.waitForFunction(() => /Guardado/.test(document.querySelector("[data-estado-de-guardado]")?.textContent ?? ""), null, { timeout: 20000 });
    await espera(p, 400);
}

/* ------------------------------------------------------------------ */
/* Medir                                                               */
/* ------------------------------------------------------------------ */

/**
 * La caja del TEXTO escrito dentro de un elemento (no la del bloque, que va de
 * lado a lado): la unión de sus trozos de texto. Así el recuadro rodea lo que
 * se lee, no una franja vacía.
 */
async function elTextoDe(p, selector) {
    return p.evaluate((selector) => {
        const raiz = document.querySelector(selector);
        const cajas = [];
        const recorrido = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
        while (recorrido.nextNode()) {
            const n = recorrido.currentNode;
            if (!n.textContent.trim()) continue;
            const r = document.createRange();
            r.selectNodeContents(n);
            for (const q of r.getClientRects()) if (q.width > 0) cajas.push(q);
        }
        const x = Math.min(...cajas.map((q) => q.left));
        const y = Math.min(...cajas.map((q) => q.top));
        return { x, y, w: Math.max(...cajas.map((q) => q.right)) - x, h: Math.max(...cajas.map((q) => q.bottom)) - y };
    }, selector);
}

/** Lo que mide el TÍTULO escrito en su campo (el campo va de lado a lado). */
async function elTituloEscrito(p) {
    return p.evaluate((sel) => {
        const input = document.querySelector(sel);
        const r = input.getBoundingClientRect();
        const lienzo = document.createElement("canvas").getContext("2d");
        const s = getComputedStyle(input);
        lienzo.font = `${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;
        const ancho = lienzo.measureText(input.value).width;
        return { x: r.left, y: r.top, w: Math.min(r.width, ancho + 4), h: r.height };
    }, TITULO);
}

/** La caja de una palabra del texto de la nota (para hacerle doble clic o señalarla). */
async function laPalabra(p, palabra) {
    return p.evaluate(
        ({ sel, palabra }) => {
            const raiz = document.querySelector(sel);
            const recorrido = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
            while (recorrido.nextNode()) {
                const n = recorrido.currentNode;
                const i = n.textContent.indexOf(palabra);
                if (i < 0) continue;
                const r = document.createRange();
                r.setStart(n, i);
                r.setEnd(n, i + palabra.length);
                const q = r.getBoundingClientRect();
                return { x: q.left, y: q.top, w: q.width, h: q.height };
            }
            throw new Error(`no está «${palabra}» en la nota`);
        },
        { sel: TEXTO, palabra },
    );
}

/** Las filas de la lista del panel que NO están dentro de una carpeta. */
async function laLista(p) {
    return p.evaluate(() => {
        const carpetas = document.querySelector("[data-carpetas-del-panel]");
        const filas = [...document.querySelectorAll("[data-panel-de-notas] [data-nota-de-la-lista]")]
            .filter((f) => !carpetas?.contains(f))
            .map((f) => f.parentElement.parentElement.getBoundingClientRect());
        const x = Math.min(...filas.map((q) => q.left));
        const y = Math.min(...filas.map((q) => q.top));
        return { x, y, w: Math.max(...filas.map((q) => q.right)) - x, h: Math.max(...filas.map((q) => q.bottom)) - y };
    });
}

/** Los grupos de la barra de formato, cortados por sus separadores, en su orden. */
async function losGruposDeFormato(p) {
    return p.evaluate((sel) => {
        const barra = document.querySelector(sel);
        const grupos = [];
        let actual = [];
        for (const hijo of barra.children) {
            if (hijo.getAttribute("data-orientation") === "vertical") {
                if (actual.length) grupos.push(actual);
                actual = [];
            } else actual.push(hijo);
        }
        if (actual.length) grupos.push(actual);
        return grupos.map((g) => {
            const r = g.map((e) => e.getBoundingClientRect());
            const x = Math.min(...r.map((q) => q.left));
            const y = Math.min(...r.map((q) => q.top));
            return { x, y, w: Math.max(...r.map((q) => q.right)) - x, h: Math.max(...r.map((q) => q.bottom)) - y };
        });
    }, BARRA_DE_FORMATO);
}

/** Un recuadro metido `px` por los lados: dos botones pegados no se montan uno encima del otro. */
const estrecho = (c, px) => ({ x: c.x + px, y: c.y, w: c.w - 2 * px, h: c.h });

/** La franja de arriba del editor —la barra de la nota, el título y lo que se pida debajo—. */
async function laParteDeArriba(p, alto = 260) {
    const barra = await caja(p, BARRA_DE_LA_NOTA);
    return { x: barra.x, y: barra.y, w: barra.w, h: alto };
}

/**
 * Pulsa un botón de la barra de la nota y devuelve lo que abre (un menú o una
 * ventana), ya pintado y quieto. `texto` es algo que tiene que haber dentro
 * cuando termina de cargar.
 */
async function loQueAbre(p, titulo, rol, texto) {
    await boton(p, titulo).click();
    const abierto = p.locator(rol).last();
    await abierto.waitFor({ state: "visible", timeout: 10000 });
    if (texto) await abierto.getByText(texto).first().waitFor({ state: "visible", timeout: 20000 });
    await espera(p, 600);
    await apartar(p);
    return abierto;
}

/* ------------------------------------------------------------------ */
/* Las miniaturas del índice                                           */
/* ------------------------------------------------------------------ */

/**
 * Una miniatura por sección, con la receta de todas las guías
 * (`tomarLasMiniaturas` del taller): aquí solo se dice qué zona explica cada
 * sección. Se toman con una nota abierta —la de la reunión, que tiene todos
 * los mandos de su barra— y la pantalla limpia.
 */
async function miniaturas(p) {
    await abrirNota(p, "REUNIÓN DE EQUIPO DEL LUNES");
    const b = (t) => caja(p, boton(p, t));
    await tomarLasMiniaturas(
        p,
        [
            ["vista-general", async () => unir(await caja(p, "[data-cabecera-del-panel]"), await caja(p, BARRA_DE_LA_NOTA))],
            ["crear-y-escribir", async () => unir(await caja(p, `${PANEL} button[title="Nueva nota"]`), await elTituloEscrito(p))],
            // Los botones de formato, no la barra: la barra ocupa todo el ancho.
            ["formato", async () => {
                const g = await losGruposDeFormato(p);
                return unir(g[0], g.at(-1));
            }],
            ["carpetas", async () => caja(p, "[data-carpetas-del-panel]")],
            ["buscar-y-ordenar", async () => unir(await caja(p, "[data-pestanas-del-panel]"), await caja(p, "[data-buscador-de-notas]"))],
            // Las secciones que son UN icono de la barra se enseñan con lo que
            // ese icono abre: cerrados, cuatro miniaturas salían iguales —la
            // barra y una página vacía— con otro icono en el recuadro. Es la
            // receta de acciones masivas en Leads.
            ["icono-y-color", async () => unir(await b("Icono de la nota"), await b("Color de nota"), await caja(p, await loQueAbre(p, "Color de nota", '[role="menu"]')))],
            ["vincular-contacto", async () => caja(p, await loQueAbre(p, "Vincular contacto", '[role="dialog"]', "Camila Andrade"))],
            ["compartir", async () => caja(p, await loQueAbre(p, "Compartir con el equipo", '[role="dialog"]', "Laura Gómez"))],
            ["plantillas-y-exportar", async () => unir(await b("Nueva nota desde plantilla"), await caja(p, await loQueAbre(p, "Nueva nota desde plantilla", '[role="menu"]')))],
            ["archivar-y-eliminar", async () => caja(p, await loQueAbre(p, "Eliminar nota", '[role="alertdialog"]'))],
        ],
        { salida: SALIDA, tomadas, focos: FOCOS, despues: () => cerrarLasVentanas(p) },
    );
}

/* ------------------------------------------------------------------ */
/* Las recetas                                                         */
/* ------------------------------------------------------------------ */

async function capturas(p) {
    const vista = p.viewportSize();

    /* 1. La pantalla de un vistazo ----------------------------------- */
    await abrirNota(p, "PENDIENTES DE LA SEMANA");
    // Las cuatro pestañas del panel se leen enteras: la guía las nombra, y
    // cortadas («Suelt…», «Co…») la foto enseñaría otra cosa.
    const cortadas = await p.$$eval("[data-pestanas-del-panel] [role=\"tab\"] span.truncate", (ss) =>
        ss.filter((s) => s.scrollWidth > s.clientWidth + 0.5).map((s) => s.textContent),
    );
    if (cortadas.length) throw new Error(`pestañas del panel cortadas: ${cortadas.join(", ")}`);
    // Portada del vídeo: la pantalla con una nota abierta.
    await guardar(p, "portada.webp");

    const cMenuLateral = await caja(p, elMenuLateral(p));
    const cCabecera = await caja(p, LA_BARRA_DE_ARRIBA);
    const bajoElMenu = await dondeAcabaElMenu(p);
    const cPanel = await caja(p, PANEL);
    const cBarraNota = await caja(p, BARRA_DE_LA_NOTA);
    const cNota = unir(await caja(p, "[data-titulo-de-la-nota]"), await caja(p, "[data-pie-de-la-nota]"));
    await marcar(p, [
        { c: dentro(cMenuLateral, 6), n: 1, numeroEn: { x: cMenuLateral.x + cMenuLateral.w / 2, y: bajoElMenu + 34 } },
        { c: dentro(cCabecera, 6), n: 2, esquina: "centro" },
        { c: dentro(cPanel, 6), n: 3 },
        { c: dentro(cBarraNota, 4), n: 4 },
        { c: dentro(cNota, 6), n: 5 },
    ]);
    await guardar(p, "vista-general.webp");
    writeFileSync(MENU, JSON.stringify(await loQuePintaElMenu(p), null, 2) + "\n");
    await desmarcar(p);

    // El panel, con sus seis partes. «Nueva carpeta» y «Nueva nota» van
    // pegados: solo el número, o sus dos recuadros se montarían.
    await abrirNota(p, "REUNIÓN DE EQUIPO DEL LUNES");
    const cNuevaCarpeta = await caja(p, `${PANEL} button[title="Nueva carpeta"]`);
    const cNuevaNota = await caja(p, `${PANEL} button[title="Nueva nota"]`);
    const cPestanas = await caja(p, "[data-pestanas-del-panel] [role='tablist']");
    const cBuscador = await caja(p, "[data-buscador-de-notas] input");
    const cLista = await laLista(p);
    const cCarpetas = await caja(p, "[data-carpetas-del-panel]");
    await marcar(p, [
        { c: cNuevaCarpeta, n: 1, sinRecuadro: true, esquina: "centro", borde: "abajo" },
        { c: cNuevaNota, n: 2, sinRecuadro: true, esquina: "centro", borde: "abajo" },
        { c: cPestanas, n: 3 },
        { c: cBuscador, n: 4 },
        { c: cLista, n: 5 },
        { c: cCarpetas, n: 6 },
    ]);
    await guardar(p, "panel.webp", holgura(unir(cNuevaCarpeta, cPestanas, cCarpetas, { x: cPanel.x, y: cPanel.y, w: cPanel.w, h: 1 }), 22, vista));
    await desmarcar(p);

    // La barra de la nota, en una ventana de PORTÁTIL: a 1440 sus trece
    // botones se leerían diminutos en la página de la guía. Van pegados, así
    // que cada uno lleva solo su número, debajo.
    await p.setViewportSize({ width: 1024, height: 700 });
    await espera(p, 1200);
    const partes = [
        "Ocultar panel",
        "Icono de la nota",
        "Color de nota",
        null,
        "Compartir con el equipo",
        "Vincular contacto",
        "Nueva nota desde plantilla",
        "Exportar",
        "Modo enfoque",
        "Historial",
        "Fijar",
        "Archivar nota",
        "Eliminar nota",
    ];
    const cajasDeLaBarra = [];
    for (const t of partes) cajasDeLaBarra.push(t ? await caja(p, boton(p, t)) : await caja(p, "[data-estado-de-guardado]"));
    const cBarra = await caja(p, BARRA_DE_LA_NOTA);
    await marcar(
        p,
        cajasDeLaBarra.map((c, i) => ({ c, n: i + 1, sinRecuadro: true, esquina: "centro", borde: "abajo" })),
        { atenuar: true },
    );
    await guardar(p, "barra-de-la-nota.webp", { x: cBarra.x, y: cBarra.y - 6, w: cBarra.w, h: cBarra.h + 38 });
    await desmarcar(p);
    await p.setViewportSize(vista);
    await espera(p, 1200);

    /* 2. Crear y escribir -------------------------------------------- */
    const nueva = p.locator(`${PANEL} button[title="Nueva nota"]`);
    const zonaDeArriba = { x: cPanel.x, y: cPanel.y, w: cPanel.w + 420, h: 250 };
    await marcar(p, [{ c: await caja(p, nueva), texto: "Nueva nota", lado: "abajo" }], { atenuar: true });
    await guardar(p, "crear-boton.webp", holgura(zonaDeArriba, 8, vista));
    await desmarcar(p);

    await nueva.click();
    await p.waitForFunction(() => document.querySelector("[data-titulo-de-la-nota] input")?.value === "SIN TÍTULO", null, { timeout: 20000 });
    await espera(p, 800);
    const titulo = p.locator(TITULO);
    await titulo.click();
    await p.keyboard.press("Control+A");
    await titulo.pressSequentially("compras del mes", { delay: 30 });
    await p.keyboard.press("Enter");
    await espera(p, 600);
    await apartar(p);
    // Enter guarda el título: se espera a que termine para que la foto no diga «Guardando…».
    await guardada(p);
    await marcar(p, [{ c: await elTituloEscrito(p), texto: "Sale en mayúsculas", lado: "derecha" }]);
    await guardar(p, "crear-titulo.webp", holgura(await laParteDeArriba(p, 200), 8, vista));
    await desmarcar(p);

    await p.locator(TEXTO).click();
    await p.keyboard.type("Café, azúcar y vasos para la oficina.", { delay: 12 });
    await p.keyboard.press("Enter");
    await p.keyboard.type("Pedirlos antes del viernes.", { delay: 12 });
    await apartar(p);
    await guardada(p);
    // La barra de formato ocupa todo el ancho: su recuadro va de su primer
    // botón al último, y sin rótulo (a la derecha no queda sitio para él).
    const gruposDeFormato = await losGruposDeFormato(p);
    await marcar(p, [
        { c: unir(gruposDeFormato[0], gruposDeFormato.at(-1)) },
        { c: await elTextoDe(p, TEXTO), texto: "El texto de la nota", lado: "derecha" },
    ]);
    await guardar(p, "crear-texto.webp", holgura(await laParteDeArriba(p, 300), 8, vista));
    await desmarcar(p);

    await marcar(p, [{ c: await caja(p, "[data-estado-de-guardado]"), texto: "Se guarda sola", lado: "abajo" }], { atenuar: true });
    await guardar(p, "crear-guardado.webp", holgura(await laParteDeArriba(p, 170), 8, vista));
    await desmarcar(p);

    const cPie = await caja(p, "[data-pie-de-la-nota]");
    await marcar(p, [{ c: await caja(p, "[data-palabras]"), texto: "Cuántas palabras lleva", lado: "derecha" }], { atenuar: true });
    // Solo la esquina del pie, con el rótulo al lado: a todo el ancho la foto
    // era una franja gris vacía, y arriba el rótulo se salía por la izquierda.
    await guardar(p, "crear-palabras.webp", holgura({ x: cPie.x, y: cPie.y - 24, w: Math.min(cPie.w, 480), h: cPie.h + 36 }, 6, vista));
    await desmarcar(p);

    /* 3. Formato ----------------------------------------------------- */
    const grupos = await losGruposDeFormato(p);
    await marcar(
        p,
        grupos.map((c, i) => ({ c: estrecho(c, 3), n: i + 1, esquina: "centro", borde: "abajo" })),
        { atenuar: true },
    );
    // El recorte va de los botones, no de la barra: la barra ocupa todo el
    // ancho y arriba se colaba medio título cortado.
    const cFormato = unir(grupos[0], grupos.at(-1));
    await guardar(p, "formato-barra.webp", { x: cFormato.x - 16, y: cFormato.y - 9, w: cFormato.w + 32, h: cFormato.h + 38 });
    await desmarcar(p);

    // Negrita: doble clic sobre una palabra y el botón. La del final de una
    // línea, para que su rótulo quepa a la derecha sin tapar el texto.
    const viernes = await laPalabra(p, "viernes");
    await p.mouse.dblclick(viernes.x + viernes.w / 2, viernes.y + viernes.h / 2);
    await espera(p, 300);
    await formato(p, "Negrita").click();
    await apartar(p);
    await guardada(p);
    await marcar(p, [
        { c: await caja(p, formato(p, "Negrita")), texto: "Y pulsa Negrita", lado: "derecha" },
        { c: await laPalabra(p, "viernes"), texto: "Selecciona el texto", lado: "derecha" },
    ]);
    await guardar(p, "formato-negrita.webp", holgura(await laParteDeArriba(p, 300), 8, vista));
    await desmarcar(p);

    // Títulos: una línea nueva arriba del todo, convertida en «Título 2».
    await elCursorEn(p, "principio");
    await p.keyboard.type("Lista de compras", { delay: 12 });
    await p.keyboard.press("Enter");
    await p.keyboard.press("ArrowUp");
    await formato(p, "Título 2").click();
    await apartar(p);
    await guardada(p);
    await marcar(p, [
        { c: await caja(p, formato(p, "Título 2")), texto: "Título 2", lado: "derecha" },
        { c: await elTextoDe(p, `${TEXTO} h2`), texto: "La línea, convertida en título", lado: "derecha" },
    ]);
    await guardar(p, "formato-titulos.webp", holgura(await laParteDeArriba(p, 300), 8, vista));
    await desmarcar(p);

    // Lista de tareas: al final, dos tareas, la primera marcada.
    await elCursorEn(p, "final");
    await p.keyboard.press("Enter");
    await formato(p, "Lista de tareas").click();
    await p.keyboard.type("Pagar al proveedor", { delay: 12 });
    await p.keyboard.press("Enter");
    await p.keyboard.type("Llevar los vasos a la oficina", { delay: 12 });
    await espera(p, 400);
    await p.locator(`${TEXTO} ul[data-type="taskList"] li input[type="checkbox"]`).first().click();
    await apartar(p);
    await guardada(p);
    await marcar(p, [
        { c: await caja(p, formato(p, "Lista de tareas")), texto: "Lista de tareas", lado: "derecha" },
        { c: await elTextoDe(p, `${TEXTO} ul[data-type="taskList"]`), texto: "Márcala al terminarla", lado: "derecha" },
    ]);
    await guardar(p, "formato-tareas.webp", holgura(await laParteDeArriba(p, 380), 8, vista));
    await desmarcar(p);

    const deshacer = unir(await caja(p, formato(p, "Deshacer")), await caja(p, formato(p, "Rehacer")));
    await marcar(p, [{ c: deshacer, texto: "Deshacer y rehacer", lado: "abajo" }], { atenuar: true });
    // Más ancho que la barra por la derecha: el rótulo de deshacer, el último
    // grupo, cae centrado debajo y se salía del recorte.
    await guardar(p, "formato-deshacer.webp", { x: cFormato.x - 16, y: cFormato.y - 9, w: cFormato.w + 150, h: cFormato.h + 92 });
    await desmarcar(p);
    await guardada(p);

    /* 4. Carpetas ---------------------------------------------------- */
    const nuevaCarpeta = p.locator(`${PANEL} button[title="Nueva carpeta"]`);
    await marcar(p, [{ c: await caja(p, nuevaCarpeta), texto: "Nueva carpeta", lado: "abajo" }], { atenuar: true });
    await guardar(p, "carpetas-boton.webp", holgura(zonaDeArriba, 8, vista));
    await desmarcar(p);

    await nuevaCarpeta.click();
    const dialogo = p.locator('[role="dialog"]').last();
    await dialogo.waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 400);
    await dialogo.locator('input[placeholder="Nombre de la carpeta"]').fill("Proveedores");
    await dialogo.locator('button[aria-label="Color #10b981"]').click();
    await espera(p, 400);
    await apartar(p);
    const colores = await dialogo.locator('button[aria-label^="Color "]').evaluateAll((bs) => {
        const r = bs.map((b) => b.getBoundingClientRect());
        const x = Math.min(...r.map((q) => q.left));
        const y = Math.min(...r.map((q) => q.top));
        return { x, y, w: Math.max(...r.map((q) => q.right)) - x, h: Math.max(...r.map((q) => q.bottom)) - y };
    });
    await marcar(p, [
        // Los números a la derecha: a la izquierda tapaban «Nombre» y «Color».
        { c: await caja(p, dialogo.locator('input[placeholder="Nombre de la carpeta"]')), n: 1, esquina: "derecha" },
        { c: colores, n: 2, esquina: "derecha" },
        { c: await caja(p, dialogo.getByRole("button", { name: "Crear" })), n: 3, esquina: "derecha" },
    ]);
    await guardar(p, "carpetas-dialogo.webp", holgura(await caja(p, dialogo), 24, vista));
    await desmarcar(p);
    await dialogo.getByRole("button", { name: "Crear" }).click();
    await p.locator("[data-carpeta]", { hasText: "Proveedores" }).waitFor({ state: "visible", timeout: 15000 });
    await quitarAvisos(p);

    // Abrir una carpeta: sus notas salen debajo.
    await laCarpeta(p, "Clientes").click();
    await p.locator("[data-carpetas-del-panel] [data-nota-de-la-lista]").first().waitFor({ state: "visible", timeout: 15000 });
    await espera(p, 800);
    await apartar(p);
    const cClientes = await caja(p, laCarpeta(p, "Clientes"));
    const cSusNotas = await p.evaluate(() => {
        const filas = [...document.querySelectorAll("[data-carpetas-del-panel] [data-nota-de-la-lista]")].map((f) => f.parentElement.parentElement.getBoundingClientRect());
        const x = Math.min(...filas.map((q) => q.left));
        const y = Math.min(...filas.map((q) => q.top));
        return { x, y, w: Math.max(...filas.map((q) => q.right)) - x, h: Math.max(...filas.map((q) => q.bottom)) - y };
    });
    await marcar(p, [{ c: unir(cClientes, cSusNotas), texto: "Sus notas, debajo", lado: "derecha" }], { atenuar: true });
    // Hasta la última carpeta: el panel entero dejaba media foto vacía debajo.
    const cUltimaCarpeta = await caja(p, laCarpeta(p, "Proveedores"));
    await guardar(p, "carpetas-abierta.webp", holgura({ x: cPanel.x, y: cPanel.y, w: cPanel.w + 360, h: cUltimaCarpeta.y + cUltimaCarpeta.h + 24 - cPanel.y }, 0, vista));
    await desmarcar(p);

    // Mover una nota a una carpeta: el «⋯» de la nota, «Mover a carpeta».
    await laPestanaAbierta(p, "Todas");
    const fila = laFila(p, "PROVEEDORES DE EMPAQUE");
    await fila.hover();
    await fila.locator("[data-mas-opciones-de-la-nota]").click();
    await elMenu(p).waitFor({ state: "visible", timeout: 10000 });
    await p.locator("[data-mover-la-nota]").hover();
    await espera(p, 700);
    const menus = p.locator('[role="menu"]');
    const cMenuNota = await caja(p, menus.first());
    const cSubmenu = await caja(p, menus.last());
    // La nota, iluminada y sin recuadro: su recuadro cruzaba «Fijar», la
    // primera opción del menú que se abre justo debajo.
    await marcar(p, [{ c: await caja(p, fila), soloLuz: true }, { c: unir(cMenuNota, cSubmenu) }], { atenuar: true });
    // Desde la fila hacia abajo: 30 px por encima asomaba, cortada, la fecha
    // de la nota de arriba.
    const uMover = unir(await caja(p, fila), cMenuNota, cSubmenu);
    await guardar(p, "carpetas-mover.webp", holgura({ x: uMover.x - 30, y: uMover.y - 8, w: uMover.w + 60, h: uMover.h + 38 }, 0, vista));
    await desmarcar(p);
    await menus.last().getByRole("menuitem", { name: "Proveedores" }).click();
    await quitarAvisos(p);

    // El «⋯» de una carpeta: Editar y Eliminar.
    const ideas = laCarpeta(p, "Ideas");
    await ideas.hover();
    await ideas.locator("[data-mas-opciones-de-la-carpeta]").click();
    await elMenu(p).waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 500);
    const cMenuCarpeta = await caja(p, elMenu(p));
    // La carpeta, iluminada y sin recuadro: el menú se abre encima de ella y
    // su recuadro lo cruzaba.
    await marcar(p, [{ c: await caja(p, ideas), soloLuz: true }, { c: cMenuCarpeta }], { atenuar: true });
    await guardar(p, "carpetas-menu.webp", holgura(unir(await caja(p, ideas), cMenuCarpeta), 40, vista));
    await desmarcar(p);
    await p.keyboard.press("Escape");
    await espera(p, 400);

    /* 5. Buscar y ordenar -------------------------------------------- */
    const pestanas = [];
    for (const t of ["Todas", "Sin carpeta", "Compartidas", "Archivadas"]) pestanas.push(await caja(p, laPestana(p, t)));
    await apartar(p);
    await marcar(
        p,
        // Los números sobre el BORDE de arriba de la fila de pestañas: más
        // abajo tapaban la palabra (la pestaña es más baja que el número),
        // debajo de la fila el «Buscar notas…» y más arriba el título «Notas».
        [{ c: cPestanas }, ...pestanas.map((c, i) => ({ c, n: i + 1, sinRecuadro: true, numeroEn: { x: c.x + c.w / 2, y: cPestanas.y - 3 } }))],
        { atenuar: true },
    );
    // Empieza justo encima de los números, debajo del título «Notas».
    await guardar(p, "buscar-pestanas.webp", { x: cPestanas.x - 18, y: cPestanas.y - 19, w: cPestanas.w + 36, h: cPestanas.h + 33 });
    await desmarcar(p);

    const buscador = p.locator("[data-buscador-de-notas] input");
    await buscador.fill("precio");
    await espera(p, 1800);
    await apartar(p);
    await marcar(
        p,
        [
            { c: await caja(p, buscador), texto: "En el título y en el texto", lado: "derecha" },
            { c: await laLista(p) },
        ],
        { atenuar: true },
    );
    await guardar(p, "buscar-resultado.webp", holgura({ x: cPanel.x, y: cPanel.y, w: cPanel.w + 360, h: 400 }, 0, vista));
    await desmarcar(p);
    await buscador.fill("");
    await espera(p, 1800);

    // Fijar arriba.
    const guion = laFila(p, "GUION DE BIENVENIDA");
    await guion.hover();
    await guion.locator("[data-mas-opciones-de-la-nota]").click();
    await elMenu(p).getByRole("menuitem", { name: "Fijar" }).click();
    await quitarAvisos(p);
    await espera(p, 800);
    await marcar(p, [{ c: await caja(p, laFila(p, "GUION DE BIENVENIDA")), texto: "Fijada arriba, con su chincheta", lado: "derecha" }], { atenuar: true });
    await guardar(p, "buscar-fijar.webp", holgura({ x: cPanel.x, y: cPanel.y, w: cPanel.w + 380, h: 420 }, 0, vista));
    await desmarcar(p);

    // Arrastrar: el asa de la izquierda de cada nota.
    const precios = laFila(p, "PRECIOS DE TEMPORADA");
    const asa = precios.locator("xpath=../..").locator("[data-asa-de-la-nota]");
    await precios.hover();
    await espera(p, 300);
    const cAsa = await caja(p, asa);
    // Filas ENTERAS: la nota que se agarra y las dos de encima, sin medias
    // filas cortadas en los bordes. (Alrededor de la nota, no desde arriba del
    // panel: con diez notas en la lista, desde arriba quedaba fuera de la foto.)
    const cFilas = await p.evaluate(() => {
        const carpetas = document.querySelector("[data-carpetas-del-panel]");
        return [...document.querySelectorAll("[data-panel-de-notas] [data-nota-de-la-lista]")]
            .filter((f) => !carpetas?.contains(f))
            .map((f) => {
                const q = f.parentElement.parentElement.getBoundingClientRect();
                return { x: q.left, y: q.top, w: q.width, h: q.height, texto: f.textContent };
            });
    });
    const iPrecios = cFilas.findIndex((f) => f.texto.includes("PRECIOS DE TEMPORADA"));
    const cPrecios = cFilas[iPrecios];
    // La nota, iluminada; y el rótulo DEBAJO del asa: a su derecha tapaba el
    // título de la nota que se agarra, que es de lo que va el paso.
    await marcar(p, [{ c: cPrecios, soloLuz: true }, { c: cAsa, texto: "Agarra por aquí y arrastra", lado: "abajo" }], { atenuar: true });
    const arriba = cFilas[Math.max(0, iPrecios - 2)].y - 6;
    const abajo = cAsa.y + cAsa.h + 84; // hasta el rótulo, con su margen
    // El rótulo va centrado bajo el asa, que está pegada al borde del panel:
    // la foto empieza a su izquierda para que no se corte.
    const izquierda = Math.max(0, cAsa.x + cAsa.w / 2 - 125);
    const derecha = cPanel.x + cPanel.w + 380;
    await guardar(p, "buscar-arrastrar.webp", holgura({ x: izquierda, y: arriba, w: derecha - izquierda, h: abajo - arriba }, 0, vista));
    await desmarcar(p);

    /* 6. Icono y color ----------------------------------------------- */
    await abrirNota(p, "COMPRAS DEL MES");
    await boton(p, "Icono de la nota").click();
    await elMenu(p).waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 500);
    const cIcono = await caja(p, boton(p, "Icono de la nota"));
    const cIconos = await caja(p, elMenu(p));
    await marcar(p, [{ c: cIcono }, { c: cIconos }], { atenuar: true });
    await guardar(p, "icono-menu.webp", holgura(unir(cIcono, cIconos), 30, vista));
    await desmarcar(p);
    await elMenu(p).getByRole("menuitem", { name: "⭐" }).click();
    await espera(p, 1200);
    await apartar(p);
    // El icono en los DOS sitios, sin rótulo: a la derecha de la fila está el
    // texto de la nota, y el rótulo lo tapaba.
    await marcar(p, [{ c: await caja(p, laFila(p, "COMPRAS DEL MES")) }, { c: await caja(p, boton(p, "Icono de la nota")) }], { atenuar: true });
    await guardar(p, "icono-lista.webp", holgura({ x: cPanel.x, y: cPanel.y, w: cPanel.w + 400, h: 420 }, 0, vista));
    await desmarcar(p);

    await boton(p, "Color de nota").click();
    await elMenu(p).waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 500);
    const cColor = await caja(p, boton(p, "Color de nota"));
    const cColores = await caja(p, elMenu(p));
    await marcar(p, [{ c: cColor }, { c: cColores }], { atenuar: true });
    await guardar(p, "color-menu.webp", holgura(unir(cColor, cColores), 30, vista));
    await desmarcar(p);
    await elMenu(p).locator('[role="menuitem"][title="Amarillo"]').click();
    await espera(p, 1200);
    await apartar(p);
    // Sin rótulo: debajo del botón está el título y a su derecha «Guardado».
    // Y hasta el final del texto, no la nota entera: el resto era fondo
    // amarillo vacío y dejaba el texto diminuto en la guía.
    await marcar(p, [{ c: await caja(p, boton(p, "Color de nota")) }]);
    const cUltimo = await caja(p, p.locator(`${TEXTO} > *`).last());
    const cArriba = await laParteDeArriba(p);
    await guardar(p, "color-nota.webp", holgura({ ...cArriba, h: cUltimo.y + cUltimo.h + 28 - cArriba.y }, 0, vista));
    await desmarcar(p);

    /* 7. Vincular un contacto ---------------------------------------- */
    await marcar(p, [{ c: await caja(p, boton(p, "Vincular contacto")), texto: "Vincular contacto", lado: "abajo" }], { atenuar: true });
    await guardar(p, "contacto-boton.webp", holgura(await laParteDeArriba(p, 170), 8, vista));
    await desmarcar(p);

    await boton(p, "Vincular contacto").click();
    const selector = p.locator('[role="dialog"]').last();
    await selector.waitFor({ state: "visible", timeout: 10000 });
    await selector.locator("button", { hasText: "Camila Andrade" }).waitFor({ state: "visible", timeout: 20000 });
    await espera(p, 500);
    await apartar(p);
    const cBuscarContacto = await caja(p, selector.locator('input[placeholder="Buscar contacto..."]'));
    const cContactos = await selector.locator("button", { hasText: /\d{6}/ }).evaluateAll((bs) => {
        const r = bs.map((b) => b.getBoundingClientRect());
        const x = Math.min(...r.map((q) => q.left));
        const y = Math.min(...r.map((q) => q.top));
        return { x, y, w: Math.max(...r.map((q) => q.right)) - x, h: Math.max(...r.map((q) => q.bottom)) - y };
    });
    await marcar(p, [
        { c: cBuscarContacto, texto: "Su nombre o su número", lado: "derecha" },
        { c: cContactos },
    ]);
    await guardar(p, "contacto-dialogo.webp", holgura(unir(await caja(p, selector), cBuscarContacto), 24, vista));
    await desmarcar(p);
    await selector.locator("button", { hasText: "Camila Andrade" }).click();
    await p.locator("[data-contacto-de-la-nota]").waitFor({ state: "visible", timeout: 15000 });
    await quitarAvisos(p);

    await marcar(p, [{ c: await caja(p, "[data-contacto-de-la-nota]"), texto: "El contacto vinculado", lado: "abajo" }], { atenuar: true });
    await guardar(p, "contacto-vinculado.webp", holgura(await laParteDeArriba(p, 170), 8, vista));
    await desmarcar(p);

    const cPieConContacto = await caja(p, "[data-pie-de-la-nota]");
    await marcar(p, [{ c: await caja(p, "[data-contacto-del-pie]"), texto: "Abre su chat", lado: "arriba" }], { atenuar: true });
    await guardar(p, "contacto-pie.webp", holgura({ x: cPieConContacto.x, y: cPieConContacto.y - 80, w: cPieConContacto.w, h: cPieConContacto.h + 80 }, 6, vista));
    await desmarcar(p);

    /* 8. Compartir --------------------------------------------------- */
    await marcar(p, [{ c: await caja(p, boton(p, "Compartir con el equipo")), texto: "Compartir con el equipo", lado: "abajo" }], { atenuar: true });
    await guardar(p, "compartir-boton.webp", holgura(await laParteDeArriba(p, 170), 8, vista));
    await desmarcar(p);

    await boton(p, "Compartir con el equipo").click();
    const compartir = p.locator('[role="dialog"]').last();
    await compartir.getByText("Laura Gómez").waitFor({ state: "visible", timeout: 20000 });
    await espera(p, 500);
    const filaDe = (nombre) => compartir.locator("div.flex.flex-col.gap-2", { hasText: nombre }).first();
    await filaDe("Sofía Martínez").locator('button[title="Puede editar"]').click();
    await espera(p, 1200);
    await filaDe("Laura Gómez").locator('button[title="Solo lectura"]').click();
    await espera(p, 1200);
    await apartar(p);
    const niveles = [];
    for (const t of ["Sin acceso", "Solo lectura", "Puede editar"]) niveles.push(await caja(p, filaDe("Sofía Martínez").locator(`button[title="${t}"]`)));
    // Los números DEBAJO de cada botón: arriba tapaban el correo de la persona.
    await marcar(p, niveles.map((c, i) => ({ c: estrecho(c, 5), n: i + 1, borde: "abajo", esquina: "centro" })));
    await guardar(p, "compartir-niveles.webp", holgura(await caja(p, compartir), 24, vista));
    await desmarcar(p);
    await p.keyboard.press("Escape");
    await espera(p, 600);
    await quitarAvisos(p);

    await laPestanaAbierta(p, "Compartidas");
    await laFila(p, "CLIENTES POR VISITAR").waitFor({ state: "visible", timeout: 15000 });
    await apartar(p);
    const icono = (titulo, etiqueta) => laFila(p, titulo).locator(`svg[aria-label="${etiqueta}"]`);
    await marcar(
        p,
        [
            { c: await caja(p, laPestana(p, "Compartidas")) },
            { c: await caja(p, icono("CLIENTES POR VISITAR", "Solo lectura")), texto: "Solo lectura", lado: "derecha" },
            { c: await caja(p, icono("TURNOS DE ATENCIÓN", "Puede editar")), texto: "Puedes editarla", lado: "derecha" },
        ],
        { atenuar: true },
    );
    // Hasta la última nota compartida: con un alto fijo se cortaba la fila de
    // la carpeta de debajo.
    const cTurnos = await caja(p, laFila(p, "TURNOS DE ATENCIÓN"));
    await guardar(p, "compartir-recibidas.webp", holgura({ x: cPanel.x, y: cPanel.y, w: cPanel.w + 360, h: cTurnos.y + cTurnos.h + 14 - cPanel.y }, 0, vista));
    await desmarcar(p);

    await abrirNota(p, "CLIENTES POR VISITAR");
    await marcar(
        p,
        // A la derecha: debajo está el texto de la nota y el rótulo lo tapaba.
        [{ c: unir(await caja(p, "[data-estado-de-guardado]"), await caja(p, "[data-de-quien-es]")), texto: "Solo lectura, y de quién es", lado: "derecha" }],
        { atenuar: true },
    );
    await guardar(p, "compartir-lectura.webp", holgura(await laParteDeArriba(p, 240), 8, vista));
    await desmarcar(p);

    /* 9. Plantillas, exportar, enfoque e historial ------------------- */
    await laPestanaAbierta(p, "Todas");
    await abrirNota(p, "COMPRAS DEL MES");
    for (const [titulo, nombre] of [
        ["Nueva nota desde plantilla", "plantillas-menu.webp"],
        ["Exportar", "exportar-menu.webp"],
    ]) {
        await boton(p, titulo).click();
        await elMenu(p).waitFor({ state: "visible", timeout: 10000 });
        await espera(p, 500);
        const cBoton = await caja(p, boton(p, titulo));
        const cSuMenu = await caja(p, elMenu(p));
        await marcar(p, [{ c: cBoton }, { c: cSuMenu }], { atenuar: true });
        // Desde el botón hacia abajo: 40 px por encima asomaba, cortada, la
        // barra del buscador de arriba.
        const u = unir(cBoton, cSuMenu);
        await guardar(p, nombre, holgura({ x: u.x - 40, y: cBoton.y - 14, w: u.w + 80, h: u.y + u.h + 40 - (cBoton.y - 14) }, 0, vista));
        await desmarcar(p);
        await p.keyboard.press("Escape");
        await espera(p, 400);
    }

    await boton(p, "Modo enfoque").click();
    await espera(p, 900);
    await apartar(p);
    await marcar(p, [{ c: await caja(p, boton(p, "Salir del modo enfoque")), texto: "El mismo botón lo devuelve", lado: "abajo" }]);
    await guardar(p, "enfoque.webp");
    await desmarcar(p);
    await boton(p, "Salir del modo enfoque").click();
    await espera(p, 800);

    await boton(p, "Historial").click();
    const historial = p.locator('[role="dialog"]').last();
    await historial.getByText(/Creo la nota/).waitFor({ state: "visible", timeout: 20000 });
    await espera(p, 600);
    await apartar(p);
    await marcar(p, [{ c: await caja(p, historial) }]);
    await guardar(p, "historial.webp");
    await desmarcar(p);
    await p.keyboard.press("Escape");
    await espera(p, 600);

    /* 10. Archivar y eliminar ---------------------------------------- */
    const archivar = p.locator(`${BARRA_DE_LA_NOTA} [data-mando-archivo="archivar"]`);
    // Cerrar el historial devuelve el foco a su botón, y su anillo salía en
    // la foto como si fuera otra marca.
    await p.evaluate(() => document.activeElement?.blur());
    await marcar(p, [{ c: await caja(p, archivar), texto: "Archivar nota", lado: "abajo" }], { atenuar: true });
    await guardar(p, "archivar-boton.webp", holgura(await laParteDeArriba(p, 170), 8, vista));
    await desmarcar(p);
    await archivar.click();
    await quitarAvisos(p);

    await laPestanaAbierta(p, "Archivadas");
    await abrirNota(p, "COMPRAS DEL MES");
    const desarchivar = p.locator(`${BARRA_DE_LA_NOTA} [data-mando-archivo="desarchivar"]`);
    await marcar(
        p,
        [
            { c: await caja(p, laPestana(p, "Archivadas")) },
            { c: await caja(p, desarchivar), texto: "Desarchivar nota", lado: "abajo" },
        ],
        { atenuar: true },
    );
    await guardar(p, "desarchivar.webp", holgura({ x: cPanel.x, y: cPanel.y, w: vista.width - cPanel.x, h: 250 }, 0, vista));
    await desmarcar(p);
    await desarchivar.click();
    await quitarAvisos(p);

    await laPestanaAbierta(p, "Todas");
    await abrirNota(p, "COMPRAS DEL MES");
    const eliminar = boton(p, "Eliminar nota");
    await marcar(p, [{ c: await caja(p, eliminar), texto: "Eliminar nota", lado: "abajo" }], { atenuar: true });
    await guardar(p, "eliminar-boton.webp", holgura(await laParteDeArriba(p, 170), 8, vista));
    await desmarcar(p);
    await eliminar.click();
    const alerta = p.locator('[role="alertdialog"]');
    await alerta.waitFor({ state: "visible", timeout: 10000 });
    await espera(p, 500);
    await apartar(p);
    await marcar(p, [{ c: await caja(p, alerta.getByRole("button", { name: "Cancelar" })), texto: "Cancelar no cambia nada", lado: "abajo" }]);
    // Poco margen arriba y a los lados (asomaba, cortado, el texto de la
    // nota); abajo el del rótulo de «Cancelar».
    const cAlerta = await caja(p, alerta);
    await guardar(p, "eliminar-confirmar.webp", holgura({ x: cAlerta.x - 24, y: cAlerta.y - 14, w: cAlerta.w + 48, h: cAlerta.h + 14 + 64 }, 0, vista));
    await desmarcar(p);
    await alerta.getByRole("button", { name: "Cancelar" }).click();
    await espera(p, 500);

    /* El marco: el menú y la barra de arriba ------------------------- */
    await elMarcoDeLaPantalla(p, guardar, { modulo: "Herramientas", texto: "Mis notas está en Herramientas" });
}

/* ------------------------------------------------------------------ */
/* El vídeo                                                            */
/* ------------------------------------------------------------------ */

/**
 * Cuánto se respira entre una frase y la siguiente: lo justo para que no se
 * monten, y no más —el ritmo lo pone la voz, no el guion—. Es el mismo de
 * Leads, Catálogo y Diagramas. Queda escrito en `voz-de-la-guia/notas.json`
 * con el vídeo.
 */
const RESPIRO_ENTRE_FRASES_MS = 250;
/** El vídeo arranca esto antes de la primera palabra; lo de antes (la carga) se recorta. */
const INICIO_ANTES_DE_HABLAR_MS = 300;

/**
 * El vídeo: qué se hace en pantalla mientras suena cada frase de
 * `narracion-guia-notas.mjs`. La voz se coloca con `empezarLaNarracion` del
 * taller y se graba con la grabadora de todas las guías.
 */
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
    });
    await ctx.addInitScript(CURSOR);
    const p = await ctx.newPage();
    // No `recordVideo`: estiraba el vídeo cada vez que el navegador pintaba
    // deprisa y la imagen se iba quedando detrás de la voz (ver la grabadora).
    const mudo = path.join(dir, "pantalla.mkv");
    const grabadora = await grabar(p, mudo, { ancho: 1280, alto: 800 });
    const t0 = Date.now();
    grabadora.empezarEn(t0);
    const { decir, alDecir, callar, tramos } = empezarLaNarracion(p, voz, t0, { respiro: RESPIRO_ENTRE_FRASES_MS });

    await abrirNotas(p);
    await p.mouse.move(640, 400, { steps: 8 });
    // Lo grabado hasta aquí es la página cargando: el vídeo empieza justo
    // antes de la primera palabra.
    const desdeMs = Math.max(0, Date.now() - t0 - INICIO_ANTES_DE_HABLAR_MS);
    await decir("intro");
    await alDecir("tu cuaderno", 600);
    await pulsar(p, laFila(p, "PENDIENTES DE LA SEMANA"));
    await alDecir("mientras atiendes", 300);
    await p.mouse.move(820, 420, { steps: 30 });

    // El menú de la izquierda: se abre con las dos flechas, se señala dónde
    // está Mis notas y se vuelve a recoger al empezar la frase siguiente,
    // que es la de la barra donde viven las flechas.
    const flechas = p.locator('[data-inicio-de-la-barra] [data-sidebar="trigger"]');
    const herramientas = elMenuLateral(p).locator('[data-sidebar="menu-button"]', { hasText: "Herramientas" }).first();
    await decir("menu");
    await alDecir("con estas dos flechas");
    await pulsar(p, flechas);
    await alDecir("dentro de Herramientas", 600);
    await mover(p, herramientas);

    const [, , , buscarTodo, ayuda, soporte, campana] = lasPartesDeArriba(p);
    await decir("barraDeArriba");
    await pulsar(p, flechas);
    await alDecir("el buscador general");
    await mover(p, buscarTodo.first());
    await alDecir("el botón de soporte");
    await mover(p, soporte.first());
    await alDecir("tus notificaciones");
    await mover(p, campana.first());

    // Crear: la nota nueva, su título y su texto; el aviso de guardado.
    const titulo = p.locator(TITULO);
    await decir("crear");
    await alDecir("el botón más");
    await pulsar(p, p.locator(`${PANEL} button[title="Nueva nota"]`));
    await p.waitForFunction(() => document.querySelector("[data-titulo-de-la-nota] input")?.value === "SIN TÍTULO", null, { timeout: 20000 });
    await alDecir("un título", 300);
    await pulsar(p, titulo);
    await p.keyboard.press("Control+A");
    await titulo.pressSequentially("compras del mes", { delay: 45 });
    await p.keyboard.press("Enter");
    await alDecir("escribes debajo", 300);
    await pulsar(p, p.locator(TEXTO));
    await p.keyboard.type("Café, azúcar y vasos para la oficina.", { delay: 28 });
    await alDecir("se guarda sola", 300);
    await mover(p, p.locator("[data-estado-de-guardado]"));

    // Formato: negrita sobre una palabra, un título y una lista de tareas.
    await decir("formato");
    const azucar = await laPalabra(p, "azúcar");
    await p.mouse.move(azucar.x + azucar.w / 2, azucar.y + azucar.h / 2, { steps: 18 });
    await p.mouse.dblclick(azucar.x + azucar.w / 2, azucar.y + azucar.h / 2);
    await alDecir("negrita", 350);
    await pulsar(p, formato(p, "Negrita"));
    await alDecir("títulos", 350);
    await mover(p, formato(p, "Título 2"));
    await alDecir("una lista de tareas", 350);
    await elCursorEn(p, "final");
    await p.keyboard.press("Enter");
    await pulsar(p, formato(p, "Lista de tareas"));
    await p.keyboard.type("Pagar al proveedor", { delay: 30 });
    await alDecir("marcas cada tarea", 300);
    await pulsar(p, p.locator(`${TEXTO} ul[data-type="taskList"] li input[type="checkbox"]`).first());

    // Carpetas: se abre una y salen sus notas.
    await decir("carpetas");
    await mover(p, p.locator("[data-carpetas-del-panel]"));
    await alDecir("pulsas una", 450);
    await pulsar(p, laCarpeta(p, "Clientes"));
    await alDecir("lo que tiene dentro", 300);
    await mover(p, p.locator("[data-carpetas-del-panel] [data-nota-de-la-lista]").first());

    // Buscar: sin tildes, «reunion» encuentra «REUNIÓN».
    const buscador = p.locator("[data-buscador-de-notas] input");
    await decir("buscar");
    await pulsar(p, laPestana(p, "Todas"));
    await alDecir("con el buscador", 400);
    await pulsar(p, buscador);
    await buscador.pressSequentially("reunion", { delay: 110 });
    await alDecir("aunque no escribas las tildes", 200);
    await mover(p, laFila(p, "REUNIÓN DE EQUIPO DEL LUNES"));

    // Icono y color, sobre la nota de la reunión.
    await decir("iconoYColor");
    await pulsar(p, laFila(p, "REUNIÓN DE EQUIPO DEL LUNES"));
    await buscador.fill("");
    await alDecir("el icono", 300);
    await pulsar(p, boton(p, "Icono de la nota"));
    await alDecir("y el color", 350);
    await p.keyboard.press("Escape");
    await pulsar(p, boton(p, "Color de nota"));
    await alDecir("de un vistazo", 400);
    await pulsar(p, elMenu(p).locator('[role="menuitem"][title="Azul"]'));

    // Contacto: se abre la ventana, se ve la lista y se cierra.
    await decir("contacto");
    await alDecir("vincularla", 350);
    await pulsar(p, boton(p, "Vincular contacto"));
    const selector = p.locator('[role="dialog"]').last();
    await selector.waitFor({ state: "visible", timeout: 10000 });
    await alDecir("abres su chat", 300);
    await mover(p, selector.locator("button", { hasText: "Camila Andrade" }));

    // Compartir: los tres niveles de una persona del equipo.
    await decir("compartir");
    await p.keyboard.press("Escape");
    await pulsar(p, boton(p, "Compartir con el equipo"));
    const compartir = p.locator('[role="dialog"]').last();
    await compartir.getByText("Andrés Ruiz").waitFor({ state: "visible", timeout: 20000 });
    const filaDe = (nombre) => compartir.locator("div.flex.flex-col.gap-2", { hasText: nombre }).first();
    await alDecir("la ve", 300);
    await mover(p, filaDe("Andrés Ruiz").locator('button[title="Solo lectura"]'));
    await alDecir("puede editarla", 300);
    await mover(p, filaDe("Andrés Ruiz").locator('button[title="Puede editar"]'));

    // Archivar: sale de la lista y queda en el Archivo.
    await decir("cierre");
    await p.keyboard.press("Escape");
    await alDecir("archívala", 450);
    await pulsar(p, p.locator(`${BARRA_DE_LA_NOTA} [data-mando-archivo="archivar"]`));
    await alDecir("queda en el Archivo", 400);
    await pulsar(p, laPestana(p, "Archivadas"));
    await alDecir("la recuperas", 300);
    await mover(p, laFila(p, "REUNIÓN DE EQUIPO DEL LUNES"));
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
    escribirLaVozDelVideo("notas", { narracion: NARRACION, colocados, desdeMs, respiro: RESPIRO_ENTRE_FRASES_MS });
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
    await abrirNotas(p);
    if (!SOLO_VIDEO) await miniaturas(p);
    if (!SOLO_MINIATURAS && !SOLO_VIDEO) await capturas(p);
    const estado = await ctx.storageState();
    await ctx.close();
    if (!SIN_VIDEO && !SOLO_MINIATURAS) {
        // Las capturas cambiaron los datos: el vídeo sale del punto de partida.
        if (!SOLO_VIDEO) execFileSync("node", [path.join(RAIZ, "scripts", "sembrar-guia-notas.mjs")], { stdio: "inherit" });
        await video(navegador, estado);
    }
} finally {
    await navegador.close();
}

// Las que la guía enseña tienen que estar TODAS. Con SOLO_MINIATURAS o
// SOLO_VIDEO, lo demás se conserva del disco: basta con que esté.
comprobarLasCapturas({ salida: SALIDA, tomadas, conservaLasDemas: SOLO_MINIATURAS || SOLO_VIDEO });
writeFileSync(path.join(TMP, "tomadas.json"), JSON.stringify([...tomadas], null, 2));
console.log(`[guia] ${tomadas.size} capturas${SIN_VIDEO || SOLO_MINIATURAS ? "" : " y el vídeo"} en public/guia/notas`);
